#!/usr/bin/env bash
# Live demo helper (docs/DEMO.md). Short commands for the Friday demo, run from the repo root in Git Bash:
#   tools/demo/demo.sh estado            what the public map shows right now
#   tools/demo/demo.sh pausar            stop the scheduled demo rounds (the running one finishes)
#   tools/demo/demo.sh reanudar          turn the scheduled demo rounds back on
#   tools/demo/demo.sh ronda 3 [semilla] start one demo round now (needs the lock free)
#   tools/demo/demo.sh evaluar 3 [semilla] fire-test round over HTTP from AWS, waits and prints the metrics
# Uses the AWS profile "spookython" in us-east-2. Never prints keys.
set -euo pipefail

export AWS_PROFILE="${AWS_PROFILE:-spookython}"
export AWS_REGION="${AWS_REGION:-us-east-2}"
export MSYS_NO_PATHCONV=1 # Git Bash would otherwise rewrite paths and "/api" arguments

SITIO="https://d2pm91xddlib8g.cloudfront.net"
SCHEDULE="spookython-prod-demo-rondas"
SIMULADOR="spookython-prod-lambda-simulador"

# MSYS_NO_PATHCONV also stops Git Bash from translating temp paths, so a Windows aws or node would
# look for /tmp/... under C:/tmp. Hand them the native path (a no-op outside Git Bash).
nativa() { if command -v cygpath > /dev/null; then cygpath -w "$1"; else printf '%s' "$1"; fi; }

estado() {
  curl -fsS "$SITIO/api/estado" | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const j = JSON.parse(s);
      if (j.ok === false) return console.log(`Sin partida activa (${j.error.code}).`);
      const m = j.metricas;
      console.log(`R${j.ronda} · turno ${j.turno} · en ruta ${m.vivos} · a salvo ${m.aSalvo} · mordidos ${m.mordidos} · p95 ${m.p95ms ?? "—"}`);
    });'
}

cambiar_scheduler() {
  local estado_nuevo="$1" tmp
  tmp="$(mktemp)"
  # update-schedule needs the whole schedule: read it, keep only writable fields, change State.
  aws scheduler get-schedule --name "$SCHEDULE" --output json | node -e '
    let s = ""; process.stdin.on("data", (d) => (s += d)).on("end", () => {
      const { Arn, CreationDate, LastModificationDate, ...resto } = JSON.parse(s);
      process.stdout.write(JSON.stringify({ ...resto, State: process.argv[1] }));
    });' "$estado_nuevo" > "$tmp"
  aws scheduler update-schedule --cli-input-json "file://$(nativa "$tmp")" --output text > /dev/null
  rm -f "$tmp"
  echo "Scheduler de demo: $(aws scheduler get-schedule --name "$SCHEDULE" --query State --output text)"
}

ronda() {
  local numero="${1:?Uso: demo.sh ronda <1|2|3> [semilla]}" semilla="${2:-42}" salida
  case "$numero" in 1 | 2 | 3) ;; *) echo "La ronda tiene que ser 1, 2 o 3." >&2; exit 1 ;; esac
  salida="$(mktemp)"
  aws lambda invoke --function-name "$SIMULADOR" --invocation-type Event \
    --cli-binary-format raw-in-base64-out --payload "{\"ronda\":$numero,\"semilla\":$semilla}" "$(nativa "$salida")" > /dev/null
  rm -f "$salida"
  echo "Ronda R$numero (semilla $semilla) enviada. En unos segundos debería verse en el mapa; si otra ronda tiene el candado, esta no arranca."
  sleep 8
  estado
}

# Fire-test round: the simulator Lambda warms the API, plays all 150 turns calling POST /paso over
# HTTP from us-east-2 and answers with the metrics. Synchronous: it waits the ~5 minutes of the round.
evaluar() {
  local numero="${1:?Uso: demo.sh evaluar <1|2|3> [semilla]}" semilla="${2:-42}" salida
  case "$numero" in 1 | 2 | 3) ;; *) echo "La ronda tiene que ser 1, 2 o 3." >&2; exit 1 ;; esac
  salida="$(mktemp)"
  echo "R$numero de evaluación (semilla $semilla): calentando y jugando 150 turnos, unos 5 minutos…"
  # --cli-read-timeout 0: the CLI would otherwise give up after 60 s while the round is still running.
  aws lambda invoke --function-name "$SIMULADOR" --cli-read-timeout 0 \
    --cli-binary-format raw-in-base64-out --payload "{\"ronda\":$numero,\"semilla\":$semilla,\"modo\":\"evaluacion\"}" "$(nativa "$salida")" > /dev/null
  node -e '
    const r = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    if (r.errorMessage) { console.log(`La ronda falló: ${r.errorMessage}`); process.exit(1); }
    if (!r.iniciada) { console.log("No arrancó: otra ronda tiene el candado. Pausá las demos y esperá a que termine la que corre."); process.exit(1); }
    // An older simulator ignores "modo" and plays a demo: no warm-up, no HTTP, no metrics.
    if (r.modo !== "evaluacion" || !r.metricas) { console.log("La Lambda jugó una ronda demo, no de evaluación: falta desplegar el simulador nuevo (npm run build:simulador y terraform apply)."); process.exit(1); }
    for (const o of r.calentamiento) console.log(`  calentamiento ${o.oleada}: ${o.pedidos} pedidos · errores ${o.errores} · p95 ${Math.round(o.p95Ms)} ms`);
    const m = r.metricas, pct = (x) => (x * 100).toFixed(2) + " %";
    console.log(`R${r.ronda} · a salvo ${m.aSalvo} · mordidos ${m.mordidos} · en ruta ${m.enRuta} de ${m.totalSobrevivientes}`);
    console.log(`p50 ${Math.round(m.latenciaP50Ms)} ms · p95 ${Math.round(m.latenciaP95Ms)} ms · p99 ${Math.round(m.latenciaP99Ms)} ms · ${m.totalLlamadas} pedidos · errores ${m.errores} (${pct(m.tasaError)})`);
    console.log(`Eficiencia ${m.eficienciaPromedio === null ? "—" : m.eficienciaPromedio.toFixed(2)} (1.00 = ruta más corta) · ${m.turnosEjecutados} turnos`);
  ' "$(nativa "$salida")"
  rm -f "$salida"
}

case "${1:-}" in
  estado) estado ;;
  pausar) cambiar_scheduler DISABLED ;;
  reanudar) cambiar_scheduler ENABLED ;;
  ronda) shift; ronda "$@" ;;
  evaluar) shift; evaluar "$@" ;;
  *) sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
