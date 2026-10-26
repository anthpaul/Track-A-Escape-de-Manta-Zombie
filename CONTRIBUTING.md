# Cómo trabajamos

Guía corta para el equipo. Las reglas del proyecto están en `AGENTS.md`; la infraestructura, en `INFRA.md`.

## 1. Primera vez en tu máquina

```powershell
git clone https://github.com/anthpaul/Track-A-Escape-de-Manta-Zombie.git
cd Track-A-Escape-de-Manta-Zombie
npm ci
npm test -w shared
```

### Credenciales AWS: siempre con el perfil `spookython`

Cada integrante usa **su propio** usuario IAM (`anthony-dev`, `kevin-dev`, `Alex-dev`). Nunca se comparten access keys.

Usamos un perfil con nombre para no mezclar esta cuenta con otras que tengas configuradas (por ejemplo, la del hackathon de práctica):

```powershell
aws configure --profile spookython      # tu access key, región us-east-2, salida json
$env:AWS_PROFILE = "spookython"          # en cada terminal nueva (Git Bash: export AWS_PROFILE=spookython)
aws sts get-caller-identity              # debe mostrar TU usuario
```

Para no repetirlo en cada terminal de PowerShell, agrégalo a tu perfil: `Add-Content $PROFILE '$env:AWS_PROFILE = "spookython"'`.

Terraform y el AWS CLI leen `AWS_PROFILE`, así que no hace falta nada más.

**Nunca** pegues la salida de `aws configure`, una access key o la API key en el chat, en un issue, en un PR o en un archivo del repo. Si pasa, se rota la key de inmediato (IAM → tu usuario → Security credentials).

### Secretos que se pasan por privado

| Qué | Quién lo necesita | Dónde se guarda |
|---|---|---|
| `infra/backend.hcl` (bucket del state) | Quien despliega (Alex) | Archivo local, gitignored |
| API key de `/paso` | Quien despliega y quien prueba `/paso` | `$env:TF_VAR_api_key` en la terminal |

## 2. Ramas

`main` está protegida: no se hace push directo, todo entra por pull request con 1 aprobación.

| Tipo | Nombre de rama | Ejemplo |
|---|---|---|
| Funcionalidad | `feat/<id>-<tema>` | `feat/k1-astar`, `feat/n2-capa-zombies` |
| Corrección | `fix/<tema>` | `fix/paso-timeout` |
| Infra, docs, config | `chore/<tema>` · `docs/<tema>` | `chore/lambda-memory` |

El `<id>` es el de la tarea en `AGENTS.md` §9 (T0.3, K1, S2, N4...).

### Flujo de cada tarea

```powershell
git switch main
git pull                                  # siempre partir de main actualizado
git switch -c feat/k1-astar
# ... trabajar, commits chicos ...
git add <archivos>
git commit -m "feat(motor): add A* with street-type cost"
git push -u origin feat/k1-astar          # y abrir el PR en GitHub
```

- **Commits:** Conventional Commits en inglés (`feat`, `fix`, `chore`, `docs`, `test`, `refactor`). Chicos y frecuentes: el jurado evalúa el historial.
- **Antes de pushear:** `npm test` y `npm run typecheck` del paquete que tocaste.
- **Antes de cada commit:** `git status`. Si aparece `backend.hcl`, `*.tfstate`, `tfplan`, `.env*` o una key, no se commitea.
- **Ramas cortas:** una tarea, un PR, merge el mismo día si se puede. Ramas largas = conflictos.

### Si tu rama quedó atrás de `main`

```powershell
git switch main
git pull
git switch feat/k1-astar
git merge main                            # resolver conflictos, probar, push
```

No uses `git push --force` sobre ramas que otro también usa.

## 3. Zonas de cada integrante

Para evitar conflictos, cada uno trabaja en su zona (`AGENTS.md` §0). Si necesitas tocar la zona de otro, avísale antes.

| Integrante | Zona |
|---|---|
| Anthony | `frontend/` |
| Kevin | `backend/src/`, `shared/` |
| Alex | `infra/`, `tools/`, `backend/src/db/` |

Los cambios en `shared/` (tipos, reglas del juego) afectan a todos: el PR lo revisan los tres.

## 4. Terraform

Solo **una persona** hace `terraform apply` (Alex), siempre con `plan -out=tfplan` antes. Detalle en `infra/README.md`.
