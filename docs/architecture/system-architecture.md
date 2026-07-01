---
source: notion-migration
issue: J-104
status: canonical
updated: 2026-07-01
migrated_from:
  - notion_id: 390bea9e-4736-8122-ba6b-eea956f63b9d
    title: "J-90 Indice operativo de Ingenieria / Tecnica"
    file: ../notion-migration/exported/j-90-indice-operativo-de-ingenieria-tecnica--390bea9e.md
  - notion_id: 390bea9e-4736-81ed-9a79-ebc677c8e705
    title: "J-91 Repo, publicacion y seguridad para indice CTO"
    file: ../notion-migration/exported/j-91-repo-publicacion-y-seguridad-para-indice-cto--390bea9e.md
  - notion_id: 390bea9e-4736-81ef-a721-edee78ce3f71
    title: "J-95 Mapa maestro de workstreams P0"
    file: ../notion-migration/exported/j-95-mapa-maestro-de-workstreams-p0--390bea9e.md
---

# Arquitectura del sistema Gana v9

Gana v9 es un harness analitico TUI/CLI para investigacion de futbol, revision de odds, scoring de predicciones, construccion de parlays, validacion, dashboards locales y reportes a Discord. El sistema produce artifacts de revision humana; no ejecuta apuestas, pagos, trades ni ninguna accion monetaria.

Esta version migra la lectura tecnica de Notion al repo y corrige una diferencia importante: las paginas Notion J-90/J-91 describian parte de la estrategia tecnica usando lenguaje de un layout futuro tipo `apps/*` y `packages/*`. El repo vigente es un paquete TypeScript con `src/*`, Prisma/MySQL, scripts operativos y docs versionados. Cualquier split futuro debe actualizar este documento y no depender del texto historico de Notion.

## Flujo canonico

```text
API-Football fixtures/odds/results
  -> filters and low-odds discovery
  -> provider snapshots and odds quotes
  -> evidence research and claim extraction
  -> prediction scoring and market gates
  -> parlay construction and risk analysis
  -> council/recommendation policy
  -> validation, metrics and leaderboard analytics
  -> artifacts, MySQL persistence, dashboard and Discord embeds
```

## Fronteras de seguridad

- Gana v9 es analitico: no coloca apuestas ni automatiza ejecucion monetaria.
- Credenciales reales viven fuera del repo, normalmente en `.env` local o stores del proveedor.
- Logs, sessions, artifacts, errores y audit payloads deben pasar por redaccion antes de persistirse o mostrarse.
- Artifacts bajo `.artifacts/` y sessions bajo `.sessions/` son salida local ignorada por Git.
- La publicacion a Discord usa scripts versionados y lenguaje de revision manual, no instrucciones de apuesta.
- Los docs migrados desde Notion no pueden contener tokens, DSNs, passwords, prefixes/suffixes de secretos ni capturas con valores privados.

## Capas principales

| Capa | Paths | Responsabilidad |
| --- | --- | --- |
| Entrypoints CLI/TUI | `src/cli.ts`, `src/headless.ts`, `src/commands/*`, `src/renderer.ts` | Superficie terminal, comandos, streaming del agente, startup status y dispatch headless. |
| Config/runtime context | `src/config.ts`, `agent.config.json`, `src/runtime/context.ts` | Providers, modelos, perfiles, artifact root, limites operativos y contexto de run. |
| Orquestacion | `src/runtime/*` | Pipeline, run service, dispatcher, worker, scheduler, leases, recovery, idempotencia y artifacts. |
| Dominio deportivo | `src/domain/*`, `src/markets/*`, `src/filters/*` | Fixtures, equipos, competiciones, mercados, odds, filtros, low-odds y eficiencia de mercado. |
| Provider deportivo | `src/providers/sports/*` | API-Football, snapshots, mappers, status, cuotas y normalizacion de errores. |
| Provider agentic | `src/providers/agentic/*`, `src/agent.ts` | Abstraccion Codex/OpenRouter, streaming, helpers, modelos y requisitos de web search. |
| Evidencia/retrieval | `src/evidence/*`, `src/retrieval/*` | Research por fixture, claims, provenance, BM25, freshness y corpus local. |
| Prediccion/scoring | `src/prediction/*`, `src/scoring/*` | Prompts, scoring, gates, calibration, ensemble, disagreement y edge gates. |
| Parlays/recomendaciones | `src/parlay/*`, `src/recommendations/*`, `src/council/*`, `src/daily/*` | Construccion de parlays, perfiles, correlacion, diversificacion, council gate y recomendaciones diarias. |
| Validacion/analytics | `src/validation/*`, `src/metrics/*`, `src/analytics/*`, `src/evals/*` | Settlement, result fetch, daily metrics, Brier/logloss/CLV, holdout y leaderboard. |
| Persistencia | `prisma/schema.prisma`, `src/storage/*` | Prisma MySQL, repositorios, transacciones, status DB y redaccion de estado. |
| Seguridad/permisos | `src/permissions/*`, `src/security/*` | Policies, approvals, egress/filesystem controls, audit, redaction y bloqueo de acciones monetarias. |
| Dashboard local | `src/dashboard/*` | Dashboard read-only para resultados persistidos y detalle de runs. |
| Operaciones | `scripts/*`, `.agents/skills/*`, `docs/*.md` | Cron, Discord, strategy review, runbooks y skills de agentes. |

## Runtime pipeline

El pipeline principal vive en `src/runtime/pipeline.ts` y se expone por CLI mediante `pnpm gana run --date YYYY-MM-DD`. Su unidad de trazabilidad es `runId`.

Etapas vigentes:

1. Crear o reusar directorio de artifacts del run.
2. Descubrir fixtures con filtros configurados y discovery low-odds.
3. Consultar odds/snapshots de API-Football y deduplicar quotes.
4. Ejecutar research por fixture y persistir evidence bundles.
5. Ejecutar scoring/predicciones con provider agentic configurado.
6. Construir parlays y analisis de riesgo/correlacion.
7. Validar cuando el modo lo requiere o cuando hay resultados disponibles.
8. Escribir `evidencePack`, `handoff`, manifests y JSON de run.
9. Persistir estado en MySQL cuando `DATABASE_URL` esta configurado.

El Daily E2E (`src/daily/e2e.ts`) compone runs de proveedor, compara resultados, aplica council gate, genera recomendaciones diarias y deja artifacts listos para notificacion.

## Persistencia y datos

La base vigente es Prisma sobre MySQL. PostgreSQL puede evaluarse despues, pero no es el runtime actual.

Grupos principales del schema:

- Catalogo deportivo: `SportsProvider`, `Competition`, `Team`, `Fixture`.
- Captura de provider/odds: `ProviderSnapshot`, `ProviderQuotaSample`, `OddsSnapshot`, `OddsQuote`.
- Runtime/auditoria: `HarnessRun`, `HarnessTask`, `ApprovalRequest`, `Artifact`, `AuditLog`.
- Evidencia: `ResearchBundle`, `SourceRecord`, `EvidenceItem`, `Claim`.
- Decision analitica: `Prediction`, `Parlay`, `ParlayLeg`, `ValidationArtifact`.
- Metricas: `LeaderboardEntry`, `DailyMetric`.
- Presets operativos: league/team/search presets y low-odds scan records.

Regla de datos: provider snapshots y artifacts son evidencia auditable. No se deben sobrescribir para "limpiar" una decision ya tomada; se generan nuevos runs/artifacts con lineage claro.

## Operacion diaria

La operacion diaria usa hora Guatemala (`America/Guatemala`):

- 07:00: validar el dia anterior y publicar metricas/validaciones.
- 10:15: Daily E2E del dia siguiente, recomendaciones/parlays y Discord.
- 10:00-22:30 cada 30 minutos: catch-up idempotente si el host estuvo dormido.
- 13:00: strategy review del dia anterior y actualizacion de `docs/harness-strategy-review-log.md`.

La guia canonica esta en [docs/daily-operations-cron.md](../daily-operations-cron.md). El contrato de Discord esta en [docs/discord-recommendation-notifications.md](../discord-recommendation-notifications.md).

## Guardrails heredados de Notion

Estos guardrails fueron migrados desde J-90/J-91 y adaptados al repo actual:

- La CLI/TUI coordina; la logica de dominio, scoring, validacion, persistencia y providers vive en modulos separados.
- API-Football es el proveedor deportivo inicial. Nuevos providers deben normalizarse a las entidades de `src/domain/*`.
- Cada publicacion live o externa necesita artifact, lineage, actor/canal y lenguaje de revision manual.
- Sandbox, replay, local-dev y production-like no deben mezclar datos ni outputs sin metadata explicita.
- Cualquier automatizacion nueva debe respetar `src/permissions/*`, redaccion, audit logs y `src/security/no-monetary-actions.ts`.
- Los blockers vivos se leen desde Paperclip, no desde paginas Notion exportadas.

## Dependencias operativas

Requeridas:

- Node.js con npm o pnpm.
- Prisma client generado y migraciones aplicadas.
- `DATABASE_URL` para persistencia.
- `API_FOOTBALL_KEY` para datos live.
- Codex CLI autenticado para el provider por defecto.

Opcionales:

- OpenRouter si `AGENT_PROVIDER=openrouter`.
- Hermes/Discord gateway para notificaciones.
- Browser Use fallback para research cuando se habilite explicitamente.

## Comandos de verificacion

Para cambios de arquitectura/docs, la verificacion minima es:

```bash
git diff --check
npm run docs:check-notion-source
gitleaks dir docs/notion-migration --redact=100 --no-banner
```

Para cambios de codigo:

```bash
pnpm typecheck
pnpm test
pnpm gana db status
pnpm gana football status
```

Para aceptacion live productiva usar fechas absolutas y los comandos de README.

## Trazabilidad Notion

| Fuente Notion | Decision J-104 |
| --- | --- |
| `J-90 Indice operativo de Ingenieria / Tecnica` | Migrado y normalizado en este documento. El lenguaje de `apps/*`/`packages/*` queda historico hasta que el repo adopte esa estructura. |
| `J-91 Repo, publicacion y seguridad para indice CTO` | Fusionado en fronteras de seguridad, persistencia, verificacion y reglas de credenciales. |
| `J-95 Mapa maestro de workstreams P0` | Usado para definir fuente de verdad: repo para docs tecnicos, Paperclip para estado vivo, Notion como historia. |
| `J-33 Roadmap tecnico, blockers y ownership` | Archivado como referencia historica; blockers vivos pertenecen a Paperclip. |
