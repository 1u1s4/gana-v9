---
source: notion-migration
migration_issue: J-104
canonical_status: vigente
notion_sources:
  - notion_id: 390bea9e-4736-8122-ba6b-eea956f63b9d
    title: "J-90 Indice operativo de Ingenieria / Tecnica"
  - notion_id: 38dbea9e-4736-813a-bedd-fc901d9ac8cb
    title: "Gana v9 - Notion Documentation Operating Standard (J-60)"
  - notion_id: 390bea9e-4736-81ed-9a79-ebc677c8e705
    title: "J-91 Repo, publicacion y seguridad para indice CTO"
---

# Indice operativo de ingenieria

Este documento reemplaza la lectura operativa de Notion para la capa tecnica de Gana v9. Paperclip conserva el estado vivo de issues y blockers; este repo conserva la arquitectura, runbooks, comandos y evidencia tecnica versionada.

## Lectura ejecutiva

Gana v9 es un harness TUI/local para investigacion de futbol, revision de cuotas, scoring, parlays analiticos, validacion, dashboard local y notificaciones Discord. No ejecuta apuestas ni mueve dinero.

El repo actual no es el monorepo gana-v8 descrito en algunas paginas historicas de Notion. La arquitectura vigente de este repo es TypeScript single-package con modulos en `src/`, Prisma/MySQL, scripts operativos bajo `scripts/`, skills bajo `.agents/skills/` y documentacion canonica bajo `docs/`.

## Leer primero

1. [README principal](../../README.md): alcance, setup, comandos y frontera de seguridad.
2. [Repo, publicacion y seguridad](repo-publication-security.md): release, secretos, scans y reglas de publicacion.
3. [Operacion diaria y cron](../daily-operations-cron.md): jobs diarios, validacion, Daily E2E y Discord.
4. [Skills y contratos del harness](../skills.md): contratos operativos versionados.
5. [Implementacion, harness y publicacion](../planes/22-implementacion-harness-y-publicacion.md): fusion previa de J-90/J-91/J-33/J-34 para harness/publicacion.
6. [Permisos, auditoria y seguridad](../planes/terminados/10-permisos-auditoria-y-seguridad.md): policy, approvals, redaccion y restriccion monetaria.
7. [Harness production-grade](../planes/terminados/12-harness-production-grade.md): estado de runtime, tools, evidence, retrieval, analytics y gates.

## Mapa del sistema

| Capa | Ubicacion | Regla operativa |
| --- | --- | --- |
| CLI/TUI | `src/cli.ts`, `src/commands.ts`, `src/headless.ts` | Entrada humana y headless; no debe ocultar acciones monetarias ni saltarse redaccion. |
| Runtime | `src/runtime/` | Orquesta pipeline, scheduler, dispatcher, recovery, idempotency y artifacts por run. |
| Providers | `src/providers/`, `src/agent.ts` | API-Football y proveedores agentic pasan por configuracion, limites y redaccion. |
| Dominio | `src/domain/`, `src/markets/`, `src/filters/` | Normaliza fixtures, equipos, mercados, odds, filtros y fair price. |
| Research/evidence | `src/evidence/`, `src/retrieval/` | Claims con fuentes, contexto, provenance, frescura y evidencia auditable. |
| Scoring/prediction | `src/prediction/`, `src/scoring/` | Scores analiticos, gates, calibracion, ensemble y disagreement. |
| Parlay | `src/parlay/` | Construye candidatos analiticos, ranking, diversificacion, correlacion y perfiles. |
| Validation/analytics | `src/validation/`, `src/analytics/`, `src/metrics/` | Settlement, Brier/log loss/CLV/calibration, leaderboard y daily metrics. |
| Dashboard | `src/dashboard/` | Superficie local read-only; requiere `DATABASE_URL`. |
| Permisos/seguridad | `src/permissions/`, `src/security/` | Approval, audit, redaccion, egress/filesystem policy y bloqueo de acciones monetarias. |
| Operacion diaria | `scripts/`, `.agents/skills/` | Wrappers cron, Discord, strategy review y runbooks de skills. |

## Guardrails de arquitectura

- Toda salida publica o notificacion debe ser artifact analitico revisable, no ejecucion monetaria.
- `DATABASE_URL`, provider keys, Discord targets y credenciales reales viven en `.env` local o stores externos; nunca en Markdown.
- Los scripts diarios deben usar fecha absoluta o calcularla explicitamente en `America/Guatemala`.
- Las rutas Discord deben respetar precedencia de target especifico, gateway target y fallback global documentada en [Operacion diaria y cron](../daily-operations-cron.md).
- Los cambios de tools, skills, prompts o gates deben actualizar `docs/skills.md` o el `SKILL.md` correspondiente.
- El dashboard local es read-only; cualquier mutacion debe pasar por comandos/harness auditables.
- Los runs productivos deben producir artifacts, evidencia, validacion o daily metrics con secretos redactados.

## Reanudacion de trabajo tecnico

Antes de reanudar o cerrar un issue tecnico:

1. Confirmar blockers vivos en Paperclip, no en Notion.
2. Leer el documento canonico del area en `docs/`.
3. Ejecutar verificacion focal, no barridos amplios por defecto.
4. Mantener cambios acotados al modulo o runbook solicitado.
5. Reportar archivos canonicos, comandos de verificacion y blockers restantes en el comentario final.

## Fuente Notion

Fuentes migradas o fusionadas:

- `docs/notion-migration/exported/j-90-indice-operativo-de-ingenieria-tecnica--390bea9e.md`
- `docs/notion-migration/exported/gana-v9-notion-documentation-operating-standard-j-60--38dbea9e.md`
- `docs/notion-migration/exported/j-91-repo-publicacion-y-seguridad-para-indice-cto--390bea9e.md`

Los links Notion originales quedan solo para auditoria historica en el frontmatter del export. Los links operativos nuevos deben apuntar al repo.

