# Auditoría J-110 — export Notion, manifest e índice final

Estado: listo para cierre de auditoría; supersedido por cierre operativo J-111.
Fecha: 2026-07-01.
Repo fuente de verdad: `/Users/luisalvarado/Documents/GitHub/gana-v9`.

## Nota J-111

J-111 cerró la migración operativa: `manifest.json` ya no tiene entradas `pending_canonical_review`, y Notion queda retirado como fuente operativa. El cierre vigente está en [`status/j-111-closeout.md`](status/j-111-closeout.md).

## Resumen ejecutivo

- Manifest revisado: 136 items (123 páginas, 13 data sources).
- No hay IDs duplicados en `manifest.json`.
- No faltan archivos referenciados por el manifest.
- Se detectaron 6 rutas de archivo reutilizadas por múltiples entradas y 4 títulos de página duplicados.
- Se removió del repo el contenido sensible del export `exported/mis-api-keys--34dbea9e.md`; queda sólo un stub redacted y el manifest lo marca como `redacted_secret_source_do_not_migrate`.
- El índice `README.md` fue corregido para usar links relativos al repo en vez de links rotos desde el directorio `docs/notion-migration/`.

## Duplicados y colisiones de export

| Caso | Archivo | Decisión |
| --- | --- | --- |
| 7 ids / <sin título> | [`exported/untitled--34cbea9e.md`](exported/untitled--34cbea9e.md) | Snapshot de data source; dejar como referencia técnica, no indexar como documento canónico. |
| 4 ids / <sin título> | [`exported/untitled--349bea9e.md`](exported/untitled--349bea9e.md) | Snapshot de data source; dejar como referencia técnica, no indexar como documento canónico. |
| 2 ids / Gambeta Notion Refresh 2026-04-23 | [`exported/gambeta-notion-refresh-2026-04-23--34cbea9e.md`](exported/gambeta-notion-refresh-2026-04-23--34cbea9e.md) | Export vacío/duplicado; no promover a canónico salvo evidencia nueva. |
| 2 ids / J-35 - Plan y avances scraping competitivo | [`exported/j-35-plan-y-avances-scraping-competitivo--34cbea9e.md`](exported/j-35-plan-y-avances-scraping-competitivo--34cbea9e.md) | Fusionar en índice de Competitive Intelligence/Gambeta si ese subtask lo necesita. |
| 2 ids / J-89 Handoff de Notion: sprint de picks diarios, flujo X/TikTok y metricas del embudo | [`exported/j-89-handoff-de-notion-sprint-de-picks-diarios-flujo-x-tiktok-y-metricas-del-embudo--390bea9e.md`](exported/j-89-handoff-de-notion-sprint-de-picks-diarios-flujo-x-tiktok-y-metricas-del-embudo--390bea9e.md) | Mantener una sola versión canónica de Growth/daily picks; corregir links repo antes de promover. |
| 2 ids / <sin título> | [`exported/untitled--31abea9e.md`](exported/untitled--31abea9e.md) | Snapshot de data source; dejar como referencia técnica, no indexar como documento canónico. |

## Títulos duplicados

| Título | IDs | Decisión |
| --- | --- | --- |
| cmo | `38dbea9e-4736-8189-b47d-ec3aad27681b, 34cbea9e-4736-8142-8f8a-c38b86738bbb` | Promover la página CMO con contenido; el export vacío queda obsoleto. |
| gambeta notion refresh 2026-04-23 | `34cbea9e-4736-81ea-bccb-ed5985970d4a, 34cbea9e-4736-819b-87a3-ce09c06e48ac` | Elegir un único canónico y dejar el resto como histórico/obsoleto. |
| j-35 - plan y avances scraping competitivo | `34cbea9e-4736-819f-a51c-dd2d24045071, 34cbea9e-4736-81a2-9df3-c28c78c3d2d4` | Elegir un único canónico y dejar el resto como histórico/obsoleto. |
| j-89 handoff de notion: sprint de picks diarios, flujo x/tiktok y metricas del embudo | `390bea9e-4736-819b-9e90-cd9614bf2df1, 390bea9e-4736-8124-91bd-db3c6383c77c` | Elegir un único canónico y dejar el resto como histórico/obsoleto. |

## Índice final propuesto

Usar estas rutas canónicas para lectura operativa. Notion queda sólo como fuente histórica en frontmatter o sección `Fuente Notion`.

| Área | Ruta canónica propuesta | Fuentes Notion/export relacionadas | Estado J-110 |
| --- | --- | --- | --- |
| Mapa operativo P0 | `docs/operations/p0-workstreams-map.md` | `exported/gana-v9-mapa-operativo-p0-notion--390bea9e.md`, `exported/j-95-mapa-maestro-de-workstreams-p0--390bea9e.md` | migrado/fusionado por J-108; mirror Notion retirado por J-111 |
| Growth y contenido | `docs/growth/README.md`, `docs/growth/public-picks-funnel.md`, `docs/growth/daily-picks-social-workstream.md` | `exported/gana-v9-02-growth-y-contenido-indice-operativo--38dbea9e.md`, `exported/j-89-handoff-de-notion-sprint-de-picks-diarios-flujo-x-tiktok-y-metricas-del-embudo--390bea9e.md` | migrado por J-107/J-108 |
| Ingeniería / Técnica | `docs/operations/engineering-operating-index.md`, `docs/architecture/README.md` | `exported/j-90-indice-operativo-de-ingenieria-tecnica--390bea9e.md`, `exported/j-91-repo-publicacion-y-seguridad-para-indice-cto--390bea9e.md` | cerrado en repo |
| Competitive Intelligence / Gambeta | `docs/competitive-intelligence/README.md`, `docs/competitive-intelligence/gambeta-public-boundary.md`, `docs/competitive-intelligence/public-scraping-boundary.md` | `exported/j-92-rebuild-del-indice-competitive-intelligence-gambeta--390bea9e.md`, `exported/j-93-inventario-de-scraping-y-frontera-publica--390bea9e.md`, `exported/revision-frontera-publica-gambeta-j-93--390bea9e.md` | migrado/fusionado por J-106/J-108 |
| Public picks/results | `docs/growth/public-picks-funnel.md` | `exported/j-54-gana-v9-public-picks-funnel-blueprint--38dbea9e.md`, `exported/j-56-public-picks-contract-gana-v9--38dbea9e.md`, `exported/j-57-public-results-history-and-trust-layer-spec-gana-v9--38dbea9e.md` | migrado/fusionado por J-108 |
| Seguridad/secretos | no migrar secretos; sólo políticas redacted en docs canónicos | `exported/mis-api-keys--34dbea9e.md` | redacted, no migrar |

## Reglas de cierre para subtasks

- Cada documento canónico debe vivir fuera de `docs/notion-migration/exported/`.
- Los links operativos deben apuntar a rutas del repo o a issues Paperclip (`/J/issues/...`); links Notion sólo en `Fuente Notion` o frontmatter histórico.
- No copiar credenciales, tokens, IDs privados sensibles ni URLs privadas a docs canónicos.
- Si un export está vacío, duplicado o es snapshot de data source, marcarlo como histórico/obsoleto en vez de promoverlo.
- Para cambios futuros en la migración, correr `git diff --check`, `npm run docs:check-notion-source` y revisar secretos con un scanner dedicado si se agregan más exports.
