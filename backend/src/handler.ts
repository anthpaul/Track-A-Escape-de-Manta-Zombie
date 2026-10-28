import { Hono } from "hono";
import { handle } from "@hono/aws-lambda";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { rutaPaso } from "./routes/paso";
import { EstadoRepo } from "./db/estado-repo";
import { crearRutaEstado } from "./routes/estado";
import { crearRutaSobrevivientes } from "./routes/sobrevivientes";
import { contextoGrafo } from "./motor/motor";

// ---------------------------------------------------------------------------
// Cliente de DynamoDB: se inicializa una sola vez por instancia caliente de Lambda
// ---------------------------------------------------------------------------

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const TABLE_NAME = process.env.DDB_TABLE ?? "spookython_mundo";

// ---------------------------------------------------------------------------
// Repositorios
// ---------------------------------------------------------------------------

const estadoRepo = new EstadoRepo(dynamoClient, TABLE_NAME);

// ---------------------------------------------------------------------------
// App: CloudFront reenvía /api/* sin quitar el prefijo
// ---------------------------------------------------------------------------

export const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ ok: true, service: "api" }));
app.route("/paso", rutaPaso);
app.get("/estado", crearRutaEstado(estadoRepo));
app.route("/sobrevivientes", crearRutaSobrevivientes(estadoRepo, contextoGrafo));

export const handler = handle(app);
