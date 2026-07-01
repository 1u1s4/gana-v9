---
status: migration_decisions
owner: Competitive Intelligence Webscraper
issue: J-106
updated: 2026-07-01 America/Guatemala
canonical_target: docs/competitive-intelligence/
---

# Competitive Intelligence Migration Decisions

Este indice derivado cumple el criterio de J-106: cada fuente Notion relevante para competitive intelligence y scraping Gambeta tiene una decision explicita. La fuente operativa queda en `docs/competitive-intelligence/`.

| Fuente Notion | Export | Decision | Razon |
| --- | --- | --- | --- |
| J-22 - Poblar NOTION | `docs/notion-migration/exported/j-22-poblar-notion--349bea9e.md` | Historico | Semilla inicial de workspace y bases. Reemplazado por J-92/J-93 y por repo canonical. |
| Gambeta Surface Inventory | `docs/notion-migration/exported/untitled--349bea9e.md` | Fusionado parcialmente | Las filas utiles se resumen en allow-list actual; la base Notion queda como evidencia historica. |
| Gambeta Endpoint Hypotheses | `docs/notion-migration/exported/untitled--349bea9e.md` y paginas `/api/...` vacias | Historico / hipotesis | `/api`, query params y rutas con email no son targets; robots los desautoriza o requieren revision. |
| Competitive Signal Diffs | `docs/notion-migration/exported/untitled--349bea9e.md` | Fusionado parcialmente | Se conserva la obligacion de separar observaciones e hipotesis; los diffs futuros pertenecen a `canonical-pipeline` y `research-worker`. |
| Collection Runs | `docs/notion-migration/exported/untitled--349bea9e.md` | Fusionado | El run J-93 se migra como evidencia actualizada y drift risk. |
| J-35 - Plan y avances scraping competitivo | `docs/notion-migration/exported/j-35-plan-y-avances-scraping-competitivo--34cbea9e.md` | Fusionado | Mantiene ruta de implementacion por `source-connectors`, `ingestion-worker`, `canonical-pipeline`, `research-worker`. |
| Competitive scraping operating layer into gana-v8 | `docs/notion-migration/exported/competitive-scraping-operating-layer-into-gana-v8--34cbea9e.md` | Historico | Pagina corta y reemplazada por la ruta de implementacion canonica. |
| Lock the integration boundary for competitive scraping inside gana-v8 | `docs/notion-migration/exported/lock-the-integration-boundary-for-competitive-scraping-inside-gana-v8--34cbea9e.md` | Fusionado | Su boundary se conserva como regla: no crear crawler desconectado. |
| J-92 Rebuild del indice Competitive Intelligence / Gambeta | `docs/notion-migration/exported/j-92-rebuild-del-indice-competitive-intelligence-gambeta--390bea9e.md` | Migrado | El indice real vive ahora en `docs/competitive-intelligence/README.md`. |
| J-93 Inventario de scraping y frontera publica | `docs/notion-migration/exported/j-93-inventario-de-scraping-y-frontera-publica--390bea9e.md` | Migrado | La frontera publica vive ahora en `docs/competitive-intelligence/public-scraping-boundary.md`. |
| Revision frontera publica Gambeta J-93 | `docs/notion-migration/exported/revision-frontera-publica-gambeta-j-93--390bea9e.md` | Obsoleto | Export vacio; la informacion util esta en J-93 y en el snapshot de Collection Runs. |
| J-95 Mapa maestro de workstreams P0 | `docs/notion-migration/exported/j-95-mapa-maestro-de-workstreams-p0--390bea9e.md` | Referencia cruzada | Confirma que J-22/J-35 son archivo y J-92/J-93 mandan. No es fuente de scraping. |

## Drift Registrado en J-106

- J-93 registraba `sitemap-previas.xml` con 22 URLs; el spot check publico de 2026-07-01 registro 21.
- `/ranking` permanece fuera de automatizacion: redirect a `/blog/ranking-gambeta-coins`, respuesta final 404 y `robots.txt` desautoriza `/ranking`.

## Estado Final de Migracion

- Canonico: `docs/competitive-intelligence/README.md`.
- Boundary/runbook: `docs/competitive-intelligence/public-scraping-boundary.md`.
- Historico: `docs/notion-migration/exported/`.
- Pendiente no bloqueante: abrir implementacion separada cuando el CTO quiera convertir el runbook en conectores dentro de `source-connectors` / `ingestion-worker` / `canonical-pipeline` / `research-worker`.
