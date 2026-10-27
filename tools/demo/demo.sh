#!/usr/bin/env bash
# Live demo helper (docs/DEMO.md). Short commands for the Friday demo, run from the repo root in Git Bash:
#   tools/demo/demo.sh estado            what the public map shows right now
#   tools/demo/demo.sh pausar            stop the scheduled demo rounds (the running one finishes)
#   tools/demo/demo.sh reanudar          turn the scheduled demo rounds back on
#   tools/demo/demo.sh ronda 3 [semilla] start one demo round now (needs the lock free)
# Uses the AWS profile "spookython" in us-east-2. Never prints keys.
set -euo pipefail

export AWS_PROFILE="${AWS_PROFILE:-spookython}"
export AWS_REGION="${AWS_REGION:-us-east-2}"
export MSYS_NO_PATHCONV=1 # Git Bash would otherwise rewrite paths and "/api" arguments

SITIO="https://d2pm91xddlib8g.cloudfront.net"
SCHEDULE="spookython-prod-demo-rondas"
SIMULADOR="spookython-prod-lambda-simulador"

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
  aws scheduler update-schedule --cli-input-json "file://$tmp" --output text > /dev/null
  rm -f "$tmp"
  echo "Scheduler de demo: $(aws scheduler get-schedule --name "$SCHEDULE" --query State --output text)"
}

ronda() {
  local numero="${1:?Uso: demo.sh ronda <1|2|3> [semilla]}" semilla="${2:-42}" salida
  case "$numero" in 1 | 2 | 3) ;; *) echo "La ronda tiene que ser 1, 2 o 3." >&2; exit 1 ;; esac
  salida="$(mktemp)"
  aws lambda invoke --function-name "$SIMULADOR" --invocation-type Event \
    --cli-binary-format raw-in-base64-out --payload "{\"ronda\":$numero,\"semilla\":$semilla}" "$salida" > /dev/null
  rm -f "$salida"
  echo "Ronda R$numero (semilla $semilla) enviada. En unos segundos debería verse en el mapa; si otra ronda tiene el candado, esta no arranca."
  sleep 8
  estado
}

case "${1:-}" in
  estado) estado ;;
  pausar) cambiar_scheduler DISABLED ;;
  reanudar) cambiar_scheduler ENABLED ;;
  ronda) shift; ronda "$@" ;;
  *) sed -n '2,7p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
