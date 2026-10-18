import { Hono } from "hono";
import { csrf } from "hono/csrf";
import { joinGroup, requireMember } from "./auth";
import admin from "./routes/admin";
import play from "./routes/play";
import players from "./routes/players";
import settings from "./routes/settings";
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

app.route("/", play);
app.route("/players", players);
app.route("/settings", settings);
app.route("/admin", admin);

export default app;
