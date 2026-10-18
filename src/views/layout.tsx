import type { Child } from "hono/jsx";
import { formatEuros } from "../money";

type Props = { title: string; isAdmin: boolean; nav?: boolean; children?: Child };

export const Layout = ({ title, isAdmin, nav = true, children }: Props) => (
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      <meta name="theme-color" content="#0f5132" />
      <title>{title}</title>
      <link rel="stylesheet" href="/style.css" />
      <script src="/htmx.min.js" defer></script>
      <script src="/app.js" defer></script>
    </head>
    <body>
      {nav && (
        <nav class="topnav">
          <a href="/">Play</a>
          <a href="/leaderboard">Table</a>
          <a href="/money">Money</a>
          <a href="/history">History</a>
          <a href="/players">Players</a>
          {isAdmin ? <a href="/settings">Settings</a> : null}
          <a href="/admin" class="admin-link">{isAdmin ? "Admin ✓" : "Admin"}</a>
        </nav>
      )}
      <main>{children}</main>
    </body>
  </html>
);

export const ErrorText = ({ error }: { error?: string }) =>
  error ? <p class="error" role="alert">{error}</p> : null;

/** Opens the payer's Revolut.me link. Revolut has no documented way to pre-fill the amount, so we show it. */
export const PayButton = ({ cents, url }: { cents: number; url: string }) =>
  url ? (
    <a class="button small" href={url} target="_blank" rel="noopener">
      Pay {formatEuros(cents)}
    </a>
  ) : null;
