# Padel Wednesdays

Web app for a weekly padel group: ~8 players, 4–6 per session, Wednesdays 8–10pm.
Picks teams, logs results, tracks stats, splits the court cost. Used on phones
(Android + iPhone) from one shared link. Oisín books the court and pays upfront.

## Stack (must stay free)
- Cloudflare Workers (free plan), deployed with Wrangler to a `*.workers.dev` URL
- Hono (TypeScript), server-rendered HTML + HTMX; plain mobile-first CSS, no CSS build
- D1 (SQLite) with Wrangler migrations
- `openskill` (npm) for ratings, Chart.js for charts
- Web app manifest so it installs to the home screen
- No paid services. Ask before adding any dependency.

## Access
- No user accounts. The group link contains a secret token; first visit sets a cookie.
- Admin PIN (Worker secret) for settings, players, editing results, marking payments.

## Session flow
1. Start session: tick who's there (4, 5 or 6). Date defaults to today.
2. Generate rotation, shuffling player order each cycle:
    - 4: cycle the 3 pairings (AB v CD, AC v BD, AD v BC). No sit-outs.
    - 5: 5-match cycle. Match k: player k sits out; (k+1, k+4) v (k+2, k+3), mod 5.
      Everyone sits once and partners everyone once per cycle.
    - 6: form 3 pairs, play round robin (3 matches, each pair sits one), then reshuffle.
      Prefer partners who haven't played together this session, then recently.
    - When a cycle ends, start another until the session is ended.
3. Match screen: current match, next match, who's sitting out. Big tap targets.
4. Log result in two taps (games per team). Undo/edit allowed.
5. End session: summary, cost split, ball buyer, recap image.

## Money
- Court price and Revolut.me link in settings; price editable per session if needed.
- Split equally among attendees (to the penny; any remainder is Oisín's). Currency is GBP (£).
- Each attendee except Oisín owes their share to Oisín. Admin marks paid/unpaid.
- Running balance per player across sessions. "Pay Oisín" button shows amount + opens link.

## Balls
- Ball rotation order in settings. Show whose turn; skip anyone absent; advance after
  the session. Ball cost is not split.

## Ratings & stats
- openskill per individual player; update after every match.
- Ratings must be recomputable from match history, so editing an old result is safe.
- Missed weeks have no effect: no decay, stats only from games played.
- Stats: games, wins, win %, streak, rating trend, best partner, nemesis, head-to-head,
  partnership heatmap. Monthly season leaderboard plus all-time.
- Use a minimum-games threshold before showing partner/nemesis stats.

## Recap
- End-of-session card drawn to a canvas in the browser, shared via the Web Share API
  (with files) for the Snapchat group; fall back to download.

## Data model (starting point)
- players (id, name, active, ball_order)
- settings (key, value)
- sessions (id, date, court_price, ball_buyer_id, status)
- session_players (session_id, player_id, share_cents, paid_at)
- matches (id, session_id, seq, a1, a2, b1, b2, sitting_out, games_a, games_b, played_at)

## Build phases
1. Scaffold Hono + D1 + Wrangler, local dev. Players + settings pages. Token + admin PIN.
2. Sessions: attendance, rotation engine (unit-tested for 4/5/6), match screen.
3. Results, openskill ratings, basic leaderboard.
4. Money + balls.
5. Stats pages, charts, seasons.
6. Recap image, manifest, deploy.
7. Later: pre-match odds, left/right side tracking.

## Scoring
- First to 5 games. On 4 you're on match point: win the next game to win the match,
  lose a game on match point and you drop back to 3. Final scores are always 5–0 to 5–4;
  no draws. (`WIN_GAMES` in src/sessions.ts.)

## How to work
- Work autonomously through the phases; no go-ahead needed between them.
- After each phase: tests pass, commit with a clear message, push to main, carry on.
- Only stop if blocked. For small ambiguities pick the simplest option and note it
  (in the commit message and the end-of-run summary).
- Approved deps: hono, wrangler, typescript, vitest (+ openskill, Chart.js per Stack).
  Only add others if essential, and say why.
- Cookies: Secure flag only outside local dev (so it works on a phone over the LAN).
- Manifest is served dynamically behind the member check; the token never goes
  in a public static file.
- Unit tests for the rotation engine and cost split.
- Keep it small and readable: Oisín reviews everything.