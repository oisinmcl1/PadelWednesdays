# Padel Wednesdays

Weekly padel group app: teams, results, stats, court-cost split. See `CLAUDE.md` for the spec.

Live: https://padel-wednesdays.padel-wednesdays.workers.dev (open via the group's `/join/<token>` link).

## Run locally

```sh
npm install
cp .dev.vars.example .dev.vars   # then set GROUP_TOKEN to a long random string
npm run db:migrate               # applies migrations to the local D1
npm run dev                      # http://localhost:8787, also reachable on your LAN
```

Open `http://localhost:8787/join/<GROUP_TOKEN>` once to get the member cookie.
On a phone on the same Wi-Fi use `http://<your-mac-ip>:8787/join/<GROUP_TOKEN>`.
Admin PIN for local dev is whatever `ADMIN_PIN` is in `.dev.vars`.

## Tests

```sh
npm test
npm run typecheck
```

## Deploy

```sh
npx wrangler d1 migrations apply DB --remote   # only when there are new migrations
npx wrangler deploy
```

Secrets live in Cloudflare, not the repo:

- `GROUP_TOKEN`: the secret in the group link. Changing it signs everyone out
  and makes a new link.
- `ADMIN_PIN`: changing it signs out every admin.

Set either with `npx wrangler secret put <NAME>`.

## Where things are

| Path | What |
|---|---|
| `src/rotation.ts` | Who plays whom (4/5/6 players), pure and unit-tested |
| `src/ratings.ts` | openskill ratings, stored per match, replayed from any edited match |
| `src/money.ts` | Money (£) parsing/formatting and the cost split |
| `src/balls.ts` | Whose turn it is to bring balls |
| `src/stats.ts` | Records, streaks, partners, nemesis, standings |
| `src/sessions.ts`, `src/ledger.ts`, `src/db.ts` | Database queries |
| `src/routes/` | Pages |
| `public/` | CSS and browser scripts (HTMX and Chart.js vendored) |
| `migrations/` | D1 schema, applied in order |
