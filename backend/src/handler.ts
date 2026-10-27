import { Hono } from "hono";
import { handle } from "@hono/aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { EstadoRepo } from "./db/estado-repo";
import { crearRutaEstado } from "./routes/estado";

// ---------------------------------------------------------------------------
// DynamoDB client — initialized once per Lambda warm start
// ---------------------------------------------------------------------------

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.DYNAMODB_TABLE ?? "spookython_mundo";

// ---------------------------------------------------------------------------
// Repos
// ---------------------------------------------------------------------------

const estadoRepo = new EstadoRepo(dynamoClient, TABLE_NAME);

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

// CloudFront forwards /api/* without stripping the prefix.
export const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ ok: true, service: "api" }));
app.get("/estado", crearRutaEstado(estadoRepo));

export const handler = handle(app);
