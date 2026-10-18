// Ball rotation: whoever's next in ball_order after the last buyer, skipping
// anyone not here tonight. Wraps around to the start.

export type BallPlayer = { id: number; ball_order: number | null };

/**
 * @param players  active players (those with no ball_order aren't in the rotation)
 * @param lastBuyerOrder  ball_order of whoever bought last time, or null if nobody has yet
 * @param present  who's here tonight
 */
export function ballTurn(players: BallPlayer[], lastBuyerOrder: number | null, present: Set<number>): number | null {
  const rotation = players
    .filter((p): p is { id: number; ball_order: number } => p.ball_order !== null && present.has(p.id))
    .sort((a, b) => a.ball_order - b.ball_order);
  if (rotation.length === 0) return null;
  if (lastBuyerOrder === null) return rotation[0].id;
  return (rotation.find((p) => p.ball_order > lastBuyerOrder) ?? rotation[0]).id;
}
