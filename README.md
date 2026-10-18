# Padel Wednesdays

Weekly padel group app: teams, results, stats, court-cost split. See `CLAUDE.md` for the spec.

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
