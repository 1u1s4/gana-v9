# Arquitectura tecnica de Gana v9

Estado: canonico en repo desde J-104. Actualizado: 2026-07-01.

Este directorio reemplaza a Notion como punto de entrada para documentacion tecnica y arquitectura de Gana v9. Notion queda como evidencia historica; Paperclip conserva estado de ejecucion, blockers y ownership vivo.

## Leer primero

1. [Arquitectura del sistema](system-architecture.md): mapa tecnico vigente de runtime, datos, seguridad, operaciones y limites.
2. [Indice operativo de ingenieria](../operations/engineering-operating-index.md): runbook de reanudacion, owners y guardrails tecnicos.
3. [SRS MVP productivo online](../planes/gana-v9-srs-mvp-productivo-online.md): requisitos de producto/sistema que originaron el diseno.
4. [Operacion diaria cron](../daily-operations-cron.md): jobs, ventanas Guatemala, Daily E2E, validation, metrics y strategy review.
5. [Notificaciones Discord](../discord-recommendation-notifications.md): contrato de publicacion analitica con embeds nativos.
6. [Decisiones de migracion Notion](../notion-migration/DECISIONS.md): que se migro, que se fusiono y que se omitio.

## Fuente de verdad

- Repo: fuente canonica para arquitectura, runbooks tecnicos, comandos, contratos y verificaciones.
- Paperclip: fuente de estado operativo vivo, blockers, assignees y cierre de issues.
- Notion exportado: fuente historica. No usar como verdad primaria despues de J-104.
- Credenciales: nunca se documentan en repo, Notion, Paperclip ni artifacts. Usar solo stores locales o secret managers.

## Mapa de documentacion

| Area | Documento | Uso |
| --- | --- | --- |
| Arquitectura tecnica | [system-architecture.md](system-architecture.md) | Vista vigente de capas, flujo de datos, DB, seguridad y operaciones. |
| Ingenieria operativa | [../operations/engineering-operating-index.md](../operations/engineering-operating-index.md) | Runbook CTO para reanudacion, fuentes, guardrails y estado tecnico. |
| Repo/seguridad | [../operations/repo-publication-security.md](../operations/repo-publication-security.md) | Checklist de publicacion, secretos, scans y release seguro. |
| Producto/sistema | [../planes/gana-v9-srs-mvp-productivo-online.md](../planes/gana-v9-srs-mvp-productivo-online.md) | Requisitos y principios del MVP productivo online. |
| Daily ops | [../daily-operations-cron.md](../daily-operations-cron.md) | Cron diario, validation, metrics, strategy review y variables. |
| Discord delivery | [../discord-recommendation-notifications.md](../discord-recommendation-notifications.md) | Formato canonico y scripts para recomendaciones/validaciones. |
| Skills operativas | [../skills.md](../skills.md) | Runbooks de agentes y contratos del harness. |
| Migracion Notion | [../notion-migration/DECISIONS.md](../notion-migration/DECISIONS.md) | Ledger de decisiones J-104 y trazabilidad a Notion. |

## Decisiones J-104

- Se normalizo la documentacion tecnica/arquitectura desde las paginas Notion J-90, J-91 y J-95 hacia `docs/architecture/`.
- La arquitectura canonica describe el repo actual `gana-v9`: un paquete TypeScript con CLI/TUI, Prisma/MySQL, runtime pipeline, artifacts, dashboard, daily ops y seguridad local.
- La referencia Notion a un futuro layout `apps/*` / `packages/*` se conserva solo como contexto historico; no se trata como estructura vigente de este repo.
- El export crudo queda bajo `docs/notion-migration/exported/` como evidencia historica, no como indice operativo.
- La pagina exportada `Mis api keys` fue reemplazada por un tombstone sin secretos. No restaurar material de credenciales en el repo.
