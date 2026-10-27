import { Hono } from "hono";
import { handle } from "@hono/aws-lambda";
import { rutaPaso } from "./routes/paso";

// CloudFront forwards /api/* without stripping the prefix.
export const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ ok: true, service: "api" }));
app.route("/paso", rutaPaso);

export const handler = handle(app);