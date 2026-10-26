## Qué cambia

<!-- Tarea de AGENTS.md §9 (T0.3, K1, S2, N4...) y resumen en 1-3 líneas. -->

## Cómo se probó

<!-- Comandos y resultado: npm test, npm run typecheck, curl, captura del mapa... -->

## Checklist

- [ ] `npm test` y `npm run typecheck` en verde para los paquetes tocados
- [ ] Sin secretos: ni `backend.hcl`, `*.tfstate`, `tfplan`, `.env*`, access keys, API key ni Account ID
- [ ] Si toca `shared/`, lo revisan los tres
- [ ] Si toca `infra/`, se adjunta el resumen de `terraform plan` (sin destroy inesperados)
