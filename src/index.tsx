import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { joinGroup, requireMember } from "./auth";
import admin from "./routes/admin";
import history from "./routes/history";
import leaderboard from "./routes/leaderboard";
import money from "./routes/money";
import play from "./routes/play";
import players from "./routes/players";
import settings from "./routes/settings";
import stats from "./routes/stats";
import type { AppEnv } from "./types";

const app = new Hono<AppEnv>();

// Rejects cross-site form posts (checks the Origin header).
app.use(csrf());

// The group link: /join/<token>. Sets the member cookie, then drops the token from the URL.
app.get("/join/:token", async (c) => {
  if (await joinGroup(c, c.req.param("token"))) return c.redirect("/", 303);
  return c.text("That link isn't valid any more. Ask the group for the current one.", 403);
});

app.use(requireMember);

// Served behind the member check because start_url carries the group token: a
// home-screen app on iPhone has its own cookie jar, so it needs to join on launch.
app.get("/manifest.webmanifest", (c) => {
  c.header("Cache-Control", "private, no-store");
  c.header("Content-Type", "application/manifest+json");
  return c.body(
    JSON.stringify({
      name: "Padel Wednesdays",
      short_name: "Padel",
      start_url: `/join/${encodeURIComponent(c.env.GROUP_TOKEN)}`,
      scope: "/",
      display: "standalone",
      background_color: "#0f3d2a",
      theme_color: "#0f5132",
      icons: [
        { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    }),
  );
});

app.route("/", play);
app.route("/leaderboard", leaderboard);
app.route("/stats", stats);
app.route("/money", money);
app.route("/history", history);
app.route("/players", players);
app.route("/settings", settings);
app.route("/admin", admin);

export default app;
