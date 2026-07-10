# Gana Agent TUI

![Banner analitico de terminal para Gana v9](docs/assets/gana-v9-readme-banner.png)

[English](README.md)

Gana v9 es una TUI de agentes y un harness operativo para investigacion de futbol, revision de cuotas, scoring de predicciones, construccion de parlays, validacion, dashboards y reportes a Discord. Esta diseñado para flujos de revision humana y no ejecuta acciones monetarias.

El backend por defecto usa autenticacion local de Codex mediante `codex exec`. OpenRouter queda disponible como provider opcional de compatibilidad.

## Que Hace

- Ejecuta una interfaz de terminal para research y operaciones asistidas por agentes.
- Descubre fixtures y cuotas mediante API-Football.
- Puntua predicciones y construye candidatos analiticos de parlay.
- Persiste datos operativos en MySQL mediante Prisma.
- Exporta artifacts, evidence packs, validaciones y metricas diarias.
- Sirve un dashboard local de solo lectura para resultados persistidos.
- Publica resumenes diarios en Discord con embeds nativos.
- Redacta secretos en artifacts, logs, sesiones y errores.

## Limite De Seguridad

Gana v9 es software analitico. No coloca apuestas, no mueve dinero, no tradea activos y no automatiza ejecucion monetaria. Las recomendaciones son artifacts de revision y requieren criterio humano manual.

Mantén credenciales reales solo en `.env` o en los almacenes locales de autenticacion del provider. El repositorio ignora `.env`, `.artifacts/`, `.sessions/`, `node_modules/`, `dist/` y `tmp/`.

## Requisitos

- Node.js con npm o pnpm.
- Login de Codex CLI para el provider por defecto, o credenciales de OpenRouter para el provider opcional.
- `DATABASE_URL` para operaciones persistidas.
- `API_FOOTBALL_KEY` para datos live de futbol.
- Migraciones Prisma aplicadas a la base de datos destino.

La base de datos canonica del candidato productivo actual es DigitalOcean MySQL via Prisma. PostgreSQL queda documentado como migracion futura, no como requisito runtime actual.

## Inicio Rapido

Instala dependencias:

```bash
npm install
```

Crea configuracion local:

```bash
cp .env.example .env
```

Para el backend Codex por defecto no necesitas API key si ya ejecutaste `codex login`. Si usas OpenRouter, define `AGENT_PROVIDER=openrouter` y agrega `OPENROUTER_API_KEY`.

Compila y ejecuta la TUI:

```bash
npm run build
npm start
```

Para desarrollo:

```bash
pnpm gana --help
pnpm test
pnpm typecheck
```

## Acceptance Live Productivo

La aceptacion live es manual y usa la CLI real con acceso a DB, API-Football y autenticacion local del provider configurado. Usa siempre una fecha absoluta.

```bash
pnpm gana db status
pnpm gana football status
pnpm gana filters show
GANA_MAX_FIXTURES_PER_RUN=5 \
GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN=5 \
GANA_MAX_PROVIDER_REQUESTS_PER_RUN=600 \
pnpm gana run --date YYYY-MM-DD
pnpm gana artifacts --run-id RUN_ID
pnpm gana export --run-id RUN_ID
pnpm gana validate --date YYYY-MM-DD
pnpm gana dashboard --port 4317
```

Un run exitoso debe producir `runId`, artifacts, evidence pack, predicciones, candidatos de parlay, verdict y logs/artifacts con secretos redactados.

## Operacion Diaria Discord

La operacion diaria usa hora Guatemala (`America/Guatemala`) y publica embeds nativos en Discord.

```bash
node scripts/gana-validate-metrics-and-notify.mjs --date YYYY-MM-DD
node scripts/gana-daily-e2e-and-notify.mjs --date YYYY-MM-DD
node scripts/install-gana-cron.mjs
```

Cron operativo:

- 07:00: valida el dia anterior, calcula `daily-metrics` y envia estadisticas.
- 10:00: ejecuta el E2E diario completo para el dia siguiente y envia parlays/recomendaciones.

Targets opcionales por flujo:

- `GANA_DISCORD_RECOMMENDATIONS_TARGET`
- `GANA_DISCORD_VALIDATION_TARGET`
- `GANA_DISCORD_STRATEGY_TARGET`
- `GANA_DISCORD_ALERTS_TARGET`

Cada target cae a `--gateway-target`, luego a `GANA_DISCORD_TARGET` y finalmente a `discord:1510041125614915756` (`#gana-alertas`).

Consulta [notificaciones de recomendaciones a Discord](docs/discord-recommendation-notifications.md).

## Configuracion

La mayoria de ajustes runtime se controla desde `agent.config.json` y `.env`.

Providers principales:

- `codex`: provider por defecto, con modelos como `gpt-5.5`.
- `openrouter`: provider OpenRouter, requiere `OPENROUTER_API_KEY`.

Browser Use fallback:

- `AGENT_BROWSER_FALLBACK=true` habilita la herramienta local `browser` para agentes OpenRouter cuando el web search nativo no sea suficiente.
- `BROWSER_USE_API_KEY` configura Browser Use Cloud.
- Los limites por defecto respetan la capa free: `BROWSER_USE_MAX_TASKS_PER_MONTH=10`, `BROWSER_USE_MAX_CONCURRENT_SESSIONS=3`, `BROWSER_USE_TIMEOUT_MS=180000`.
- La herramienta es de solo lectura para research y queda cubierta por policy, auditoria, redaccion y bloqueo de acciones monetarias.

Limites operativos por run:

- `GANA_MAX_FIXTURES_PER_RUN` limita fixtures seleccionados para el pipeline.
- `GANA_MAX_AGENTIC_RESEARCH_CALLS_PER_RUN` limita fixtures enviados a research/scoring agentic.
- `GANA_MAX_PROVIDER_REQUESTS_PER_RUN` limita requests reales a API-Football y falla con error accionable si se excede.

## Comandos De La TUI

- `/help`: lista comandos.
- `/dashboard`: sirve el dashboard web local.
- `/provider`: lista o cambia entre `codex` y `openrouter`.
- `/model`: lista, busca y cambia modelos del provider activo.
- `/fast`: alterna modo rapido cuando el modelo/provider lo soporta.
- `/think low|medium|high|xhigh|max|ultra`: ajusta razonamiento de Codex cuando esta soportado.
- `/web`: muestra o cambia web search nativo: `on`, `off`, `cached`, `live`.
- `/new`: inicia una conversacion nueva.
- `exit`: cierra la TUI.

## Backends De Provider

### Codex

- Ejecuta `codex exec --json` como subprocess.
- Lee autenticacion desde `CODEX_HOME` o `codexHome`.
- Fuerza web search nativo con `web_search="live"` cuando esta activo.
- Reanuda el thread de Codex entre turnos hasta usar `/new`.
- Muestra comandos shell ejecutados por Codex dentro del renderer de herramientas.
- Lee metadata de modelos desde `config/codex-models.json`.

Actualiza el listado de modelos Codex:

```bash
npm run update:codex-models
```

### OpenRouter

- Requiere `OPENROUTER_API_KEY`.
- Provee lectura/escritura/edicion de archivos, busqueda glob/grep, listado de directorios y shell con timeout.
- Puede usar Browser Use Cloud mediante la herramienta local `browser`.

## Dashboard Local

Para revisar resultados persistidos:

```bash
pnpm gana dashboard --port 4317
```

Abre `http://127.0.0.1:4317`. El dashboard es de solo lectura y permite filtrar por fecha, run id, estado y limite. Muestra fixtures/resultados, predicciones, parlays, validaciones, runs diarios y paneles de detalle. Requiere `DATABASE_URL`.

## Notificaciones Discord

El envio de parlays/recomendaciones via Hermes esta documentado en [docs/discord-recommendation-notifications.md](docs/discord-recommendation-notifications.md). La skill vive en `.agents/skills/discord-recommendation-notifier/`.

```bash
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs \
  --latest \
  --transport discord-native \
  --max 3
```

Las validaciones/estadisticas del dia anterior y los cron jobs de 07:00/10:00 Guatemala estan documentados en [docs/daily-operations-cron.md](docs/daily-operations-cron.md).

```bash
scripts/install-gana-hermes-cron.sh
```

## Desarrollo

Comandos utiles:

```bash
pnpm test
pnpm typecheck
pnpm gana db status
pnpm gana football status
pnpm gana dashboard --port 4317
```

Antes de publicar o hacer push de ramas publicas, ejecuta:

```bash
gitleaks detect --source . --redact=100 --no-banner
```

Documentacion de skills:

- [Guia de skills del repo](docs/skills.md) documenta los runbooks operativos en `.agents/skills` y los contratos de prompts del harness en `skills/`.
- [Indice canonico de docs](docs/README.md) enlaza el indice operativo de ingenieria, el runbook de repo/publicacion/seguridad, operacion diaria y estado de migracion desde Notion.
- [Arquitectura tecnica](docs/architecture/README.md) es el punto de entrada de arquitectura migrado desde Notion y mantenido en el repo.

## Licencia

El repositorio todavia no incluye archivo de licencia. Agrega una licencia antes de publicarlo como open source.
