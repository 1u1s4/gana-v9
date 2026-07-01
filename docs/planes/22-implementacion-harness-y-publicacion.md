---
source: notion-migration
migration_issue: J-105
canonical_status: vigente
notion_sources:
  - notion_id: 390bea9e-4736-8122-ba6b-eea956f63b9d
    title: "J-90 Indice operativo de Ingenieria / Tecnica"
  - notion_id: 390bea9e-4736-81ed-9a79-ebc677c8e705
    title: "J-91 Repo, publicacion y seguridad para indice CTO"
  - notion_id: 34cbea9e-4736-81c1-9b2e-e61a498584df
    title: "Checklist de publicacion y release"
  - notion_id: 34cbea9e-4736-8199-9e1a-caf50a471551
    title: "J-33 Roadmap tecnico, blockers y ownership de entrega"
  - notion_id: 34cbea9e-4736-81ef-b2b4-e773d769d4b5
    title: "J-34 Persistir avances de implementacion y checklist de publicacion en Notion"
---

# Implementacion, Harness y Publicacion

Este documento es el destino canonico del subset J-105 de migracion desde Notion. Reemplaza la lectura operativa de las paginas Notion de ingenieria, seguridad/publicacion, checklist de release y bitacoras historicas J-33/J-34. Notion queda como fuente historica, no como sistema de ejecucion.

## Lectura Primero

- `docs/daily-operations-cron.md`: horarios, scripts y variables del flujo diario.
- `docs/skills.md`: inventario de skills operativas y contratos del harness.
- `docs/harness-strategy-review-log.md`: backlog y evidencia de mejoras del harness guiadas por validacion.
- `docs/planes/20-barrido-codigo-2026-05-29.md`: barrido tecnico previo.
- `docs/planes/21-arquitectura-dashboard-e2e-telegram.md`: arquitectura de dashboard/E2E/Telegram.
- `docs/planes/gana-v9-srs-mvp-productivo-online.md`: alcance producto MVP.

## Mapa Operativo

| Capa | Fuente canonica | Regla |
|---|---|---|
| Operacion diaria | `docs/daily-operations-cron.md` | Hermes cron dispara validacion, Daily E2E, catch-up y strategy review en hora Guatemala. |
| Skills operativas | `.agents/skills/` documentadas en `docs/skills.md` | Leer `SKILL.md` antes de usar scripts o runbooks. |
| Contratos harness | `skills/<contract>/` documentados en `docs/skills.md` | Cambios de prompt requieren hash, schema y pruebas relevantes. |
| Strategy review | `docs/harness-strategy-review-log.md` | El job propone cambios; implementacion y verificacion siguen el flujo normal del repo. |
| Publicacion live | codigo de publication/publisher/config runtime | Publicacion requiere actor, capability, canal, entorno y lineage explicitos. |
| Repos legacy | PRs y tickets J-18/J-77 | No publicar ni reescribir historia sin rotacion externa y aprobacion del rewrite. |

## Guardrails de Implementacion

- Apps y workers pueden consumir packages compartidos; no deben duplicar reglas de negocio entre fronteras.
- Sandbox, replay, staging-like y production deben permanecer separados en datos, lineage y outputs.
- Toda automatizacion publica debe pasar por publication governance; no se acepta publicar directo desde scripts ad hoc.
- Captura raw y evidencia de providers deben ser append-only cuando aplique; scoring/publicacion consumen batches cerrados/versionados.
- No se copian secretos, DSNs, tokens, screenshots con credenciales ni fragmentos historicos de llaves a Markdown, issues o PRs.

## Checklist de Release Seguro

- Verificar que `.env` reales no esten versionados y que existan templates sanitizados.
- Confirmar README operativo con setup, comandos de verificacion, despliegue y rollback.
- Ejecutar el scan de secretos definido para el cambio antes de promover repos o docs publicos.
- Confirmar lineage de artefactos: commit, run, pruebas, migraciones y destino de publicacion.
- Para cambios del harness, actualizar docs de skills/contratos y correr la verificacion focal indicada en `docs/skills.md`.
- Para cambios de cron/Discord, ejecutar dry-run antes de envio real.

## Verificacion Focal

| Tipo de cambio | Verificacion minima |
|---|---|
| Markdown/docs | `git diff --check` y lectura de links editados. |
| Shell | `bash -n path/to/script.sh`. |
| Node/MJS | `node --check path/to/script.mjs`. |
| TypeScript runtime/harness | Test focalizado del modulo; `pnpm typecheck` si cambia contrato compartido. |
| Prisma/storage | Validacion Prisma o test focalizado de repository cuando aplique. |
| Dashboard/UI | Test focalizado y browser local si cambia layout o interaccion. |
| Discord/Telegram | Dry-run o artifact local; envio real solo con target confirmado. |
| Seguridad/publicacion | `gitleaks detect --source . --redact=100 --no-banner` antes de publicar o abrir rama publica. |

No correr todo el workspace por defecto para cambios documentales. Escalar a
typecheck/test completo cuando el blast radius cruza runtime compartido,
persistencia, notificaciones reales o UX publica.

## Estado de Seguridad y Repos Legacy

J-18 saneo los arboles actuales de cinco repos legacy de alto riesgo mediante PRs de sanitizacion. El estado publicable sigue bloqueado hasta que J-77/J-83 confirmen rotacion/revocacion externa y aprueben la estrategia de rewrite/remocion de historia. No hacer force-push, borrado remoto ni publicacion amplia de esos repos sin esa confirmacion.

Repos de alto riesgo en esta regla:

- `1u1s4/gana_v5`
- `1u1s4/gana_v4`
- `1u1s4/v0-gana-v6-dashboard-design`
- `1u1s4/gana_v4-crewAI`
- `1u1s4/jo_gana777`

## Decision por Fuente Notion

| Fuente Notion | Decision J-105 | Destino |
|---|---|---|
| J-90 Indice operativo de Ingenieria / Tecnica | Fusionado | Este documento y enlaces a `docs/daily-operations-cron.md`, `docs/skills.md`. |
| J-91 Repo, publicacion y seguridad para indice CTO | Fusionado | Seccion de seguridad/repos legacy y checklist de release. |
| Checklist de publicacion y release | Migrado | Checklist de release seguro. |
| J-33 Roadmap tecnico, blockers y ownership | Historico/fusionado | Reemplazado por Paperclip para estado vivo; este doc conserva reglas operativas. |
| J-34 Persistir avances y checklist en Notion | Historico/fusionado | Notion deja de ser destino principal; repo y Paperclip conservan evidencia. |
| Paginas exportadas vacias de publication/hermes/public-proof | Obsoleto como contenido | Se documentan como cubiertas por este indice y docs canonicos existentes. |
| Mis api keys | Excluido/redacted | Pagina de credenciales; el export fue reemplazado por stub y no debe migrarse. |

## Material Excluido

Las paginas personales de credenciales, tokens o llaves no son documentacion de
implementacion. Si aparecen en exports de Notion, se reemplazan por un stub
redacted, se marcan en `docs/notion-migration/manifest.json` como
`redacted_secret_source_do_not_migrate`, y cualquier rotacion/revocacion queda
fuera del repo con el owner humano correspondiente.

## Fuente Notion

Las paginas originales quedan solo para auditoria historica dentro de `docs/notion-migration/exported/`. Cualquier link operativo nuevo debe apuntar a rutas del repo o a Paperclip, no a Notion.
