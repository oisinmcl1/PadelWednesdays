// Who owes what. Shares are set when a session ends; the payer's own share isn't owed.

export type Debt = { session_id: number; date: string; player_id: number; share_cents: number; payer_id: number | null };

/** Every unpaid share across ended sessions, oldest first. */
export async function unpaidDebts(db: D1Database): Promise<Debt[]> {
  const { results } = await db
    .prepare(
      `SELECT sp.session_id, s.date, sp.player_id, sp.share_cents, s.payer_id
       FROM session_players sp JOIN sessions s ON s.id = sp.session_id
       WHERE s.status = 'ended' AND sp.paid_at IS NULL AND sp.share_cents > 0
         AND sp.player_id IS NOT s.payer_id
       ORDER BY s.date, s.id`,
    )
    .all<Debt>();
  return results;
}

export type Share = { player_id: number; share_cents: number | null; paid_at: string | null };

export async function sessionShares(db: D1Database, sessionId: number): Promise<Share[]> {
  const { results } = await db
    .prepare("SELECT player_id, share_cents, paid_at FROM session_players WHERE session_id = ?")
    .bind(sessionId)
    .all<Share>();
  return results;
}

export async function setPaid(db: D1Database, sessionId: number, playerId: number, paid: boolean): Promise<void> {
  await db
    .prepare("UPDATE session_players SET paid_at = ? WHERE session_id = ? AND player_id = ?")
    .bind(paid ? new Date().toISOString() : null, sessionId, playerId)
    .run();
}

/** Marks all of a player's unpaid shares as paid (e.g. they paid off their balance in one go). */
export async function settleUp(db: D1Database, playerId: number): Promise<void> {
  await db
    .prepare(
      `UPDATE session_players SET paid_at = ?
       WHERE player_id = ? AND paid_at IS NULL
         AND session_id IN (SELECT id FROM sessions WHERE status = 'ended')`,
    )
    .bind(new Date().toISOString(), playerId)
    .run();
}
