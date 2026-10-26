import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { app } from "./handler";

const local = new Hono();
local.use("*", cors({ origin: "http://localhost:3000" }));
local.route("/", app);

serve({ fetch: local.fetch, port: 3001 }, (info) => {
  console.log(`API running on http://localhost:${info.port}`);
});