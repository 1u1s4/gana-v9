# Estado de migracion J-109: calendario, distribucion y metricas

Issue: J-109 - Migrar calendario editorial, distribucion y metricas desde Notion
Fecha: 2026-07-01

## Canonicos resultantes

- [docs/growth/x-tiktok-daily-picks-sprint.md](../../growth/x-tiktok-daily-picks-sprint.md): calendario D1-D14, reinicio J-40, cadencia X/TikTok, scorecard y backfill operativo.
- [docs/growth/daily-picks-social-workstream.md](../../growth/daily-picks-social-workstream.md): handoff diario, metricas de canal/funnel/trust y schema minimo de backfill.
- [docs/growth/free-to-paid-measurement-contract.md](../../growth/free-to-paid-measurement-contract.md): contrato de medicion free-to-paid y tablero operativo.
- [docs/growth/migration-status.md](../../growth/migration-status.md): ledger canonico de decisiones Growth/Marketing.

## Decision del subset

El calendario editorial, la distribucion X/TikTok, la scorecard diaria y el backfill de metricas quedan fusionados en `docs/growth/`. Notion queda como fuente historica; la operacion diaria debe leer los markdown canonicos.

## Fuentes migradas o fusionadas

| Fuente exportada | Decision | Destino |
| --- | --- | --- |
| [J-36 calendario X/TikTok](../exported/j-36-calendario-x-tiktok-free-to-paid-funnel--34cbea9e.md) | Migrado | `docs/growth/x-tiktok-daily-picks-sprint.md` |
| [J-36 data source snapshot](../exported/untitled--34cbea9e.md) | Migrado parcialmente | Filas D1-D14 y J-40 D1-D5 normalizadas como tablas; JSON queda como evidencia historica. |
| D1-D14 exports | Fusionado | Calendario editorial D1-D14 en `docs/growth/x-tiktok-daily-picks-sprint.md`. |
| [J-40 D1](../exported/j-40-d1-reinicio-2-picks-claros-cta-unica--38dbea9e.md) a [J-40 D5](../exported/j-40-d5-cierre-con-prueba-social-y-decision-de-capacidad--38dbea9e.md) | Fusionado | Plantilla activa de reinicio de cinco dias. |
| [Gana v9 / 02 Growth y contenido](../exported/gana-v9-02-growth-y-contenido-indice-operativo--38dbea9e.md) | Fusionado | Responsables, cadencia, stop conditions y metricas incorporadas. |
| [J-89 handoff](../exported/j-89-handoff-de-notion-sprint-de-picks-diarios-flujo-x-tiktok-y-metricas-del-embudo--390bea9e.md) | Migrado como historico | El export era un stub/puntero; el handoff canonico vive en `docs/growth/daily-picks-social-workstream.md`. |
| [J-54 blueprint](../exported/j-54-gana-v9-public-picks-funnel-blueprint--38dbea9e.md) | Fusionado | Principios free-to-paid, social loop y guardrails. |
| [J-56 public picks contract](../exported/j-56-public-picks-contract-gana-v9--38dbea9e.md) | Fusionado | Metricas launch y separacion entre public-safe picks y datos privados. |
| [J-57 results/trust spec](../exported/j-57-public-results-history-and-trust-layer-spec-gana-v9--38dbea9e.md) | Fusionado | Sample-size guardrails, metricas de resultados y responsible-language coverage. |
| [J-64 CMO review](../exported/j-64-cmo-review-differentiation-originality-and-18-language--38dbea9e.md) | Fusionado | Disclaimer +18/riesgo como gate obligatorio. |

## Fuentes no promovidas

| Fuente | Estado | Razon |
| --- | --- | --- |
| [Growth/content tracking and approved picks feed](../exported/growth-content-tracking-and-approved-picks-feed--34cbea9e.md) | Stub historico | Export con markdown vacio; se reemplaza por schema minimo de backfill. |
| [Define the minimum measurement contract](../exported/define-the-minimum-measurement-contract-for-free-to-paid-funnel-learning--34cbea9e.md) | Stub historico | Export sin cuerpo util; cubierto por `docs/growth/free-to-paid-measurement-contract.md`. |
| [Publication and channel distribution hardening](../exported/publication-and-channel-distribution-hardening--34cbea9e.md) | Stub historico | Export sin cuerpo util; cubierto por J-36/J-40/J-88. |
| [Checklist de publicacion y release](../exported/checklist-de-publicacion-y-release--34cbea9e.md) | Fuera de subset | Checklist tecnico de release, no operacion diaria Growth. |

## Verificacion documental

- Links operativos apuntan a rutas del repo, no a Notion.
- IDs de Notion quedan como trazabilidad historica en los ledgers.
- No se copiaron secretos, tokens, credenciales ni URLs privadas sensibles.
- Los canonicos indican explicitamente no inventar post IDs, views, clicks, DMs, opt-ins, paid intent ni resultados.
