import { PutCommand, DeleteCommand, TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { EstadoTurnoSchema, type Sobreviviente } from "@abcstack/shared";
import { KEYS } from "../../backend/src/db/keys";
import { crearPersistenciaMemoria, type PersistenciaPartida, type TurnoParcial } from "./persistencia";

type Escritura = PutCommand | DeleteCommand | TransactWriteCommand;
export interface ClienteEscritura { send(command: Escritura): Promise<unknown> }

/** Owns only this game's new records; every turn write is fenced by the active lease. */
export class DynamoPersistencia implements PersistenciaPartida {
  private readonly memoria = crearPersistenciaMemoria();
  /** Set by the HTTP runner: each completed turn then publishes the round's /paso p95 so far. */
  medirP95?: () => number | null;
  constructor(
    private readonly client: ClienteEscritura,
    private readonly tableName: string,
    private readonly partidaId: string,
    private readonly ronda: 1 | 2 | 3,
    private readonly ahora: () => number = Date.now,
  ) {
    if (!tableName || !partidaId) throw new Error("Table name and game ID are required");
  }

  /** Demo rounds (S6) carry a "demo-" game id; the lock and metadata record that mode. */
  private get modo(): "demo" | "evaluacion" { return this.partidaId.startsWith("demo-") ? "demo" : "evaluacion"; }
  private get segundos() { return Math.floor(this.ahora() / 1000); }
  private get ttl() { return this.segundos + 86_400; }
  private get cerco() {
    return {
      TableName: this.tableName, Key: KEYS.control(),
      ConditionExpression: "partidaId = :mia AND expiraEn > :ahora",
      ExpressionAttributeValues: { ":mia": this.partidaId, ":ahora": this.segundos },
    };
  }

  /** False means another game owns the lease; never force another round out. */
  async iniciar(semilla: number): Promise<boolean> {
    try {
      await this.client.send(new PutCommand({
        TableName: this.tableName,
        Item: { ...KEYS.control(), partidaId: this.partidaId, modo: this.modo, turnoActual: 0,
          expiraEn: this.segundos + 30, ttl: this.ttl },
        ConditionExpression: "attribute_not_exists(PK) OR expiraEn < :ahora",
        ExpressionAttributeValues: { ":ahora": this.segundos },
      }));
    } catch (error) {
      if (error instanceof Error && error.name === "ConditionalCheckFailedException") return false;
      throw error;
    }
    await this.client.send(new TransactWriteCommand({ TransactItems: [
      { ConditionCheck: this.cerco },
      { Put: { TableName: this.tableName, Item: { ...KEYS.metadata(this.partidaId), ttl: this.ttl,
        data: { ronda: this.ronda, estado: "en_curso", turnoActual: 0, config: { semilla, modo: this.modo } } },
        ConditionExpression: "attribute_not_exists(PK)" } },
    ] }));
    return true;
  }

  async guardarTurnoIncompleto(parcial: TurnoParcial): Promise<void> {
    const data = EstadoTurnoSchema.parse({ ...parcial, partidaId: this.partidaId, ronda: this.ronda, completo: false });
    await this.client.send(new TransactWriteCommand({ TransactItems: [
      { Update: { ...this.cerco,
        UpdateExpression: "SET turnoActual = :turno, expiraEn = :expira, #ttl = :ttl",
        ExpressionAttributeNames: { "#ttl": "ttl" },
        ExpressionAttributeValues: { ...this.cerco.ExpressionAttributeValues,
          ":turno": parcial.turno, ":expira": this.segundos + 30, ":ttl": this.ttl } } },
      { Put: { TableName: this.tableName, Item: { ...KEYS.turno(this.partidaId, parcial.turno), ttl: this.ttl, data },
        ConditionExpression: "attribute_not_exists(PK)" } },
    ] }));
    await this.memoria.guardarTurnoIncompleto(parcial);
  }

  async completarTurno(turno: number, decisiones: ReadonlyMap<string, string>, finales?: readonly Sobreviviente[]): Promise<void> {
    const parcial = await this.memoria.leerTurno(turno);
    if (!parcial) throw new Error("Cannot complete an unpublished turn");
    const sobrevivientes = (finales ?? parcial.sobrevivientes).map(s => ({ ...s,
      ...(decisiones.has(s.id) ? { siguienteNodo: decisiones.get(s.id)! } : {}) }));
    const p95 = this.medirP95 ? { expresion: ", #data.p95ms = :p95", valores: { ":p95": this.medirP95() } } : { expresion: "", valores: {} };
    await this.client.send(new TransactWriteCommand({ TransactItems: [
      { ConditionCheck: this.cerco },
      { Update: { TableName: this.tableName, Key: KEYS.turno(this.partidaId, turno),
        UpdateExpression: `SET #data.sobrevivientes = :survivors, #data.completo = :true${p95.expresion}`,
        ConditionExpression: "attribute_exists(PK) AND #data.completo = :false",
        ExpressionAttributeNames: { "#data": "data" },
        ExpressionAttributeValues: { ":survivors": sobrevivientes, ":true": true, ":false": false, ...p95.valores } } },
      { Update: { TableName: this.tableName, Key: KEYS.metadata(this.partidaId),
        UpdateExpression: "SET #data.turnoActual = :turno",
        ExpressionAttributeNames: { "#data": "data" }, ExpressionAttributeValues: { ":turno": turno } } },
    ] }));
    await this.memoria.completarTurno(turno, decisiones, finales);
  }

  async cerrar(): Promise<void> {
    await this.client.send(new DeleteCommand({ TableName: this.tableName, Key: KEYS.control(),
      ConditionExpression: "partidaId = :mia", ExpressionAttributeValues: { ":mia": this.partidaId } }));
  }

  leerTurno(turno: number) { return this.memoria.leerTurno(turno); }
  leerUltimoTurnoCompleto() { return this.memoria.leerUltimoTurnoCompleto(); }
}
