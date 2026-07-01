# Migración Notion → Markdown en repo

Este directorio es el archivo historico de la migracion Notion -> Markdown. Desde J-111, Notion no es fuente operativa para Gana v9.

Export inicial: 136 items descubiertos por la integración de Notion.

## Cierre J-111

- Estado: migracion operativa cerrada el 2026-07-01.
- Regla vigente: repo para documentacion canonica; Paperclip para estado vivo de issues, blockers y owners; Notion solo como export historico.
- Manifest: 136 items con decision explicita; 0 entradas `pending_canonical_review`.
- Verificacion: `npm run docs:check-notion-source`.

### Entradas canonicas

- Documentacion general: [`docs/README.md`](../README.md).
- Arquitectura tecnica: [`docs/architecture/README.md`](../architecture/README.md).
- Operaciones: [`docs/operations/README.md`](../operations/README.md).
- Growth/GTM: [`docs/growth/README.md`](../growth/README.md).
- Competitive intelligence: [`docs/competitive-intelligence/README.md`](../competitive-intelligence/README.md).
- Cierre durable: [`status/j-111-closeout.md`](status/j-111-closeout.md).

## Subsets migrados

- `J-107` Marketing/Growth, funnel y GTM: migrado a [`docs/growth/`](../growth/README.md).
  - Canonicos: [`free-to-paid-funnel.md`](../growth/free-to-paid-funnel.md), [`x-tiktok-daily-picks-sprint.md`](../growth/x-tiktok-daily-picks-sprint.md), [`editorial-seo-gtm.md`](../growth/editorial-seo-gtm.md), [`free-to-paid-measurement-contract.md`](../growth/free-to-paid-measurement-contract.md).
  - Ledger de decisiones: [`docs/growth/migration-status.md`](../growth/migration-status.md).
  - Estado: las paginas Notion del subset quedan como fuente historica; el repo es la fuente operativa.
- `J-108` Sistema Gambeta-style y workstreams P0: migrado a rutas repo canonicas.
  - Canonicos: [`public-picks-funnel.md`](../growth/public-picks-funnel.md), [`daily-picks-social-workstream.md`](../growth/daily-picks-social-workstream.md), [`gambeta-public-boundary.md`](../competitive-intelligence/gambeta-public-boundary.md), [`p0-workstreams-map.md`](../operations/p0-workstreams-map.md).
  - Ledger de decisiones: [`j-108-migration-decisions.md`](j-108-migration-decisions.md).
  - Estado: las paginas Notion del subset quedan como fuente historica; el repo es la fuente operativa.
- `J-109` Growth + Content Ops, calendario/distribucion/metricas: fusionado en [`x-tiktok-daily-picks-sprint.md`](../growth/x-tiktok-daily-picks-sprint.md), [`daily-picks-social-workstream.md`](../growth/daily-picks-social-workstream.md) y [`free-to-paid-measurement-contract.md`](../growth/free-to-paid-measurement-contract.md).
  - Estado del subset: [`status/growth-content-ops-j-109.md`](status/growth-content-ops-j-109.md).
  - Decisiones tambien reflejadas en [`docs/growth/migration-status.md`](../growth/migration-status.md).
- `J-106` Competitive Intelligence y scraping Gambeta: migrado a [`docs/competitive-intelligence/`](../competitive-intelligence/README.md).
  - Canonicos: [`README.md`](../competitive-intelligence/README.md), [`public-scraping-boundary.md`](../competitive-intelligence/public-scraping-boundary.md).
  - Ledger de decisiones: [`competitive-intelligence-decisions.md`](competitive-intelligence-decisions.md).
  - Estado: J-22/J-35 quedan historicos; J-92/J-93 quedan reemplazados por la fuente canonica en repo.

## Convención

- `exported/`: export crudo desde Notion, con frontmatter de origen.
- Después de revisar, mover/normalizar documentos canónicos a `docs/` o `docs/planes/` según corresponda.
- No volver a usar Notion como fuente de verdad; Notion queda como referencia histórica.

## Estado de migración J-105

Subset trabajado: implementación, harness, publicación y planes técnicos.

Destino canónico: `docs/planes/22-implementacion-harness-y-publicacion.md`.

También se enlazó el destino desde:

- `docs/daily-operations-cron.md`
- `docs/skills.md`

Decisiones registradas en `manifest.json`:

- Migrado/fusionado: J-90, J-91, Checklist de publicación y release, J-33, J-34.
- Obsoleto por export vacío/cubierto por docs canónicos: Code execution model, Hermes control-plane hardening, publication governance/channel hardening, public-proof guard, legacy repo secret rotation, live publication lineage, lower-risk hardening y publication trust incomplete.

## Estado de migración J-104

Subset trabajado: documentación técnica/arquitectura, seguridad, repo/publicación y runbooks de ingeniería.

Destinos canónicos:

- `docs/README.md`
- `docs/architecture/README.md`
- `docs/architecture/system-architecture.md`
- `docs/operations/engineering-operating-index.md`
- `docs/operations/repo-publication-security.md`
- `docs/notion-migration/DECISIONS.md`

Decisiones registradas en `manifest.json`:

- Migrado/fusionado: J-90, J-91, J-60, Checklist de publicación y release, Legacy repo secret rotation and history rewrite.
- Obsoleto/cubierto: exports vacíos de publication governance, channel hardening, live publication lineage y páginas similares sin contenido útil.
- Fuente sensible: `Mis api keys` queda como tombstone sin secretos y no debe migrarse.

## Estado de auditoría J-110

Auditoría completada en [`AUDIT.md`](AUDIT.md).

- Manifest: 136 items revisados; sin IDs duplicados y sin archivos faltantes.
- Duplicados/colisiones detectados y documentados: data sources `untitled--*.md`, `CMO`, `Gambeta Notion Refresh 2026-04-23`, `J-35` y `J-89`.
- Fuente sensible `Mis api keys` redacted y marcada como `redacted_secret_source_do_not_migrate` en `manifest.json`.
- Índice final propuesto por área en [`AUDIT.md#índice-final-propuesto`](AUDIT.md#índice-final-propuesto).

## Items exportados

- exported_data_source_snapshot: [](exported/untitled--34cbea9e.md) — data_source — 34cbea9e-4736-815e-a599-000b5d56de94
- exported_data_source_snapshot: [](exported/untitled--34cbea9e.md) — data_source — 34cbea9e-4736-81a1-8664-000b27ec359a
- exported_data_source_snapshot: [](exported/untitled--34cbea9e.md) — data_source — 34cbea9e-4736-8183-823b-000b4c9a8f7e
- exported_data_source_snapshot: [](exported/untitled--34cbea9e.md) — data_source — 34cbea9e-4736-8142-ac9a-000bed165616
- exported_data_source_snapshot: [](exported/untitled--34cbea9e.md) — data_source — 34cbea9e-4736-81e9-83c0-000b6c99360d
- exported_data_source_snapshot: [](exported/untitled--34cbea9e.md) — data_source — 34cbea9e-4736-81c0-ad41-000b3725a929
- exported_data_source_snapshot: [](exported/untitled--349bea9e.md) — data_source — 349bea9e-4736-8151-9aef-000b27adca05
- exported_data_source_snapshot: [](exported/untitled--349bea9e.md) — data_source — 349bea9e-4736-81ee-8c3a-000b405d9665
- exported_data_source_snapshot: [](exported/untitled--349bea9e.md) — data_source — 349bea9e-4736-8137-afdb-000b3cd32c14
- exported_data_source_snapshot: [](exported/untitled--34cbea9e.md) — data_source — 34cbea9e-4736-81b0-a871-000b0c07aea9
- exported_data_source_snapshot: [](exported/untitled--349bea9e.md) — data_source — 349bea9e-4736-8103-acec-000bd61366af
- exported_data_source_snapshot: [](exported/untitled--31abea9e.md) — data_source — 31abea9e-4736-81a4-bbe9-000b70441459
- exported_data_source_snapshot: [](exported/untitled--31abea9e.md) — data_source — 31abea9e-4736-81b9-ba99-000bfe655099
- exported_markdown: [/api/picks?email=...](exported/api-picks-email--349bea9e.md) — page — 349bea9e-4736-8105-b91f-ce42df180b1c
- exported_markdown: [/api/sb?type=broadcast](exported/api-sb-type-broadcast--349bea9e.md) — page — 349bea9e-4736-8194-8b04-e721c8fa8c34
- exported_markdown: [/api/sb?type=ranking](exported/api-sb-type-ranking--349bea9e.md) — page — 349bea9e-4736-81d3-883a-dce4ffba2b7d
- exported_markdown: [/api/sb?type=stats](exported/api-sb-type-stats--349bea9e.md) — page — 349bea9e-4736-818e-8022-d5b7900c3d0f
- exported_markdown: [3C](exported/3c--31abea9e.md) — page — 31abea9e-4736-8062-a452-f49fa910adfb
- exported_markdown: [Affiliate Monetization Surface](exported/affiliate-monetization-surface--349bea9e.md) — page — 349bea9e-4736-81af-8bcd-d8c2d930fd5c
- exported_markdown: [AI Training Restriction Signal](exported/ai-training-restriction-signal--349bea9e.md) — page — 349bea9e-4736-81f6-9a2d-dadf53b9f289
- exported_markdown: [Alert Bot Or Notifications](exported/alert-bot-or-notifications--349bea9e.md) — page — 349bea9e-4736-81cb-82a7-e46f767ebc3c
- exported_markdown: [Alimentación](exported/alimentacion--31abea9e.md) — page — 31abea9e-4736-81ba-a850-ff608e0ee860
- exported_markdown: [Auth y registro](exported/auth-y-registro--349bea9e.md) — page — 349bea9e-4736-816d-b20a-d29cb9ccaf9e
- exported_markdown: [Bankroll Tooling](exported/bankroll-tooling--349bea9e.md) — page — 349bea9e-4736-8188-a00e-d56fe7883bf3
- exported_markdown: [Bankroll Utility Hook](exported/bankroll-utility-hook--349bea9e.md) — page — 349bea9e-4736-8180-8572-d000f1b8ef00
- exported_markdown: [Blog](exported/blog--349bea9e.md) — page — 349bea9e-4736-81a0-9279-df4d4e0c50e4
- exported_markdown: [Bonos](exported/bonos--390bea9e.md) — page — 390bea9e-4736-81eb-81ed-e1591f62330f
- exported_markdown: [Brand Sheet](exported/brand-sheet--31abea9e.md) — page — 31abea9e-4736-81ec-ae70-f3cf4a5717b8
- exported_markdown: [Cena con Raquel](exported/cena-con-raquel--31abea9e.md) — page — 31abea9e-4736-813a-8c06-e99dbe499658
- exported_markdown: [Checklist de publicación y release](exported/checklist-de-publicacion-y-release--34cbea9e.md) — page — 34cbea9e-4736-81c1-9b2e-e61a498584df
- exported_markdown: [Choose the first external shipping wedge: public web funnel or channel distribution first](exported/choose-the-first-external-shipping-wedge-public-web-funnel-or-channel-distribution-first--34cbea9e.md) — page — 34cbea9e-4736-8159-a430-f5a8d6adca3c
- exported_markdown: [Choose the primary execution stack and review lane for v7 to v8 work](exported/choose-the-primary-execution-stack-and-review-lane-for-v7-to-v8-work--34cbea9e.md) — page — 34cbea9e-4736-81c8-aac1-c67feee2b4fe
- exported_markdown: [CMO](exported/cmo--38dbea9e.md) — page — 38dbea9e-4736-8189-b47d-ec3aad27681b
- exported_markdown: [CMO](exported/cmo--34cbea9e.md) — page — 34cbea9e-4736-8142-8f8a-c38b86738bbb
- exported_markdown: [Code execution model for v7 to v8 delivery](exported/code-execution-model-for-v7-to-v8-delivery--34cbea9e.md) — page — 34cbea9e-4736-8138-87ca-e7ce18b9c7f4
- exported_markdown: [Como funciona](exported/como-funciona--390bea9e.md) — page — 390bea9e-4736-814b-aff8-f89ed219cc64
- exported_markdown: [Competitive scraping operating layer into gana-v8](exported/competitive-scraping-operating-layer-into-gana-v8--34cbea9e.md) — page — 34cbea9e-4736-8156-9413-d015ce8aadbf
- exported_markdown: [Content And SEO Layer](exported/content-and-seo-layer--349bea9e.md) — page — 349bea9e-4736-8148-b53d-cc90d2bdbd8c
- exported_markdown: [CTO](exported/cto--34cbea9e.md) — page — 34cbea9e-4736-816b-9fe1-de123d12fa8a
- exported_markdown: [D1 - Apertura diaria: pick fuerte + CTA simple](exported/d1-apertura-diaria-pick-fuerte-cta-simple--34cbea9e.md) — page — 34cbea9e-4736-816a-8d9a-fa90afc696af
- exported_markdown: [D10 - Underdog value para reforzar diferenciacion](exported/d10-underdog-value-para-reforzar-diferenciacion--34cbea9e.md) — page — 34cbea9e-4736-8126-bffc-ff9a5143e59b
- exported_markdown: [D11 - Noticia o lesion: reaccion rapida con criterio](exported/d11-noticia-o-lesion-reaccion-rapida-con-criterio--34cbea9e.md) — page — 34cbea9e-4736-811c-adcf-d303a10ab1f8
- exported_markdown: [D12 - Sabado/Domingo de alto volumen: seleccionar, no saturar](exported/d12-sabado-domingo-de-alto-volumen-seleccionar-no-saturar--34cbea9e.md) — page — 34cbea9e-4736-8137-8380-cbc13a7b60b9
- exported_markdown: [D13 - Prueba social ligera: DMs, seguimiento y constancia](exported/d13-prueba-social-ligera-dms-seguimiento-y-constancia--34cbea9e.md) — page — 34cbea9e-4736-814d-99d0-ce6be2f36374
- exported_markdown: [D14 - Cierre de sprint: que formato se queda y cual se corta](exported/d14-cierre-de-sprint-que-formato-se-queda-y-cual-se-corta--34cbea9e.md) — page — 34cbea9e-4736-81bd-9972-e90dcf387560
- exported_markdown: [D2 - Pick contrarian para diferenciar criterio](exported/d2-pick-contrarian-para-diferenciar-criterio--34cbea9e.md) — page — 34cbea9e-4736-8142-a3e5-f9d8de427e86
- exported_markdown: [D3 - Thread de 3 partidos y ranking de confianza](exported/d3-thread-de-3-partidos-y-ranking-de-confianza--34cbea9e.md) — page — 34cbea9e-4736-8162-98a7-d1d01bbba757
- exported_markdown: [D4 - Accountability publica: que salio bien y que corregimos](exported/d4-accountability-publica-que-salio-bien-y-que-corregimos--34cbea9e.md) — page — 34cbea9e-4736-819b-9aaa-cc523755c1f1
- exported_markdown: [D5 - Jornada grande con urgencia y pick destacado](exported/d5-jornada-grande-con-urgencia-y-pick-destacado--34cbea9e.md) — page — 34cbea9e-4736-8132-a3d9-f01483f8fd00
- exported_markdown: [D6 - Educacion rapida: como leer un pick sin caer en humo](exported/d6-educacion-rapida-como-leer-un-pick-sin-caer-en-humo--34cbea9e.md) — page — 34cbea9e-4736-81fd-8735-cf2062d54832
- exported_markdown: [D7 - Card de fin de semana empaquetado por tiers](exported/d7-card-de-fin-de-semana-empaquetado-por-tiers--34cbea9e.md) — page — 34cbea9e-4736-8181-97a7-d5f1ef6fa027
- exported_markdown: [D8 - Recap de confianza: lo que aprendimos del fin de semana](exported/d8-recap-de-confianza-lo-que-aprendimos-del-fin-de-semana--34cbea9e.md) — page — 34cbea9e-4736-8100-835b-dec25a979899
- exported_markdown: [D9 - Rivalidad o partido grande como motor de atencion](exported/d9-rivalidad-o-partido-grande-como-motor-de-atencion--34cbea9e.md) — page — 34cbea9e-4736-81be-9620-fcdaf611c9c7
- exported_markdown: [Define the minimum measurement contract for free-to-paid funnel learning](exported/define-the-minimum-measurement-contract-for-free-to-paid-funnel-learning--34cbea9e.md) — page — 34cbea9e-4736-8131-b2e4-ff975aab0e2d
- exported_markdown: [Dinero de cumpleaños](exported/dinero-de-cumpleanos--31abea9e.md) — page — 31abea9e-4736-811d-ab87-c6a68959be4b
- exported_markdown: [Engineering Execution Log](exported/engineering-execution-log--34cbea9e.md) — page — 34cbea9e-4736-81f0-9787-f32b582a22e7
- exported_markdown: [Executive system initialized (2026-04-23)](exported/executive-system-initialized-2026-04-23--34cbea9e.md) — page — 34cbea9e-4736-81b3-a7f9-d9b0e2a20ab0
- exported_markdown: [Familia de articulos de previa](exported/familia-de-articulos-de-previa--390bea9e.md) — page — 390bea9e-4736-8131-b5d9-f400bdf83fde
- exported_markdown: [First external wedge still needs explicit prioritization](exported/first-external-wedge-still-needs-explicit-prioritization--34cbea9e.md) — page — 34cbea9e-4736-81c7-acb8-ea9e1bdc72c9
- exported_markdown: [Foro](exported/foro--390bea9e.md) — page — 390bea9e-4736-8153-b9ec-d75f30a13bfb
- exported_markdown: [Founding Engineer](exported/founding-engineer--34cbea9e.md) — page — 34cbea9e-4736-81ae-8e4d-d5b36a4929a4
- exported_markdown: [Free Daily Picks Surface](exported/free-daily-picks-surface--349bea9e.md) — page — 349bea9e-4736-8144-83a7-e7bbe0acc6d1
- exported_markdown: [Gambeta Manual Baseline 01](exported/gambeta-manual-baseline-01--349bea9e.md) — page — 349bea9e-4736-8101-b1b8-f15b5dfbbbaf
- exported_markdown: [Gambeta Notion Refresh 2026-04-23](exported/gambeta-notion-refresh-2026-04-23--34cbea9e.md) — page — 34cbea9e-4736-81ea-bccb-ed5985970d4a
- exported_markdown: [Gambeta Notion Refresh 2026-04-23](exported/gambeta-notion-refresh-2026-04-23--34cbea9e.md) — page — 34cbea9e-4736-819b-87a3-ce09c06e48ac
- exported_markdown: [Gambeta Sandbox Discovery 01](exported/gambeta-sandbox-discovery-01--349bea9e.md) — page — 349bea9e-4736-81f8-993a-d2d0f50c1db3
- exported_markdown: [Gambeta Scheduled Monitor Draft](exported/gambeta-scheduled-monitor-draft--349bea9e.md) — page — 349bea9e-4736-8101-83d8-fe2de46cd14b
- exported_markdown: [Gambeta/Gana goal principal](exported/gambeta-gana-goal-principal--34cbea9e.md) — page — 34cbea9e-4736-810c-89b3-dc462151615a
- exported_markdown: [Gana v9 / 02 Growth y contenido - Indice operativo](exported/gana-v9-02-growth-y-contenido-indice-operativo--38dbea9e.md) — page — 38dbea9e-4736-81a5-9fc5-c9664b6782a9
- exported_markdown: [Gana v9 — Mapa operativo P0 Notion](exported/gana-v9-mapa-operativo-p0-notion--390bea9e.md) — page — 390bea9e-4736-81dd-9128-c7da48584dba
- exported_markdown: [Gana v9 — Notion Documentation Operating Standard (J-60)](exported/gana-v9-notion-documentation-operating-standard-j-60--38dbea9e.md) — page — 38dbea9e-4736-813a-bedd-fc901d9ac8cb
- exported_markdown: [Gana/Gambeta - Sistema ejecutivo](exported/gana-gambeta-sistema-ejecutivo--34cbea9e.md) — page — 34cbea9e-4736-8195-aaa9-d35d33543deb
- exported_markdown: [Growth/content tracking and approved picks feed](exported/growth-content-tracking-and-approved-picks-feed--34cbea9e.md) — page — 34cbea9e-4736-8158-988c-d2a27beb9757
- exported_markdown: [Hermes control-plane hardening](exported/hermes-control-plane-hardening--34cbea9e.md) — page — 34cbea9e-4736-810d-b80e-e2f77292f812
- exported_markdown: [Herramientas](exported/herramientas--390bea9e.md) — page — 390bea9e-4736-8187-8560-eb259c447727
- exported_markdown: [HIBRI2 — Proyecto operativo](exported/hibri2-proyecto-operativo--34cbea9e.md) — page — 34cbea9e-4736-8190-97e5-eff4478a3aa5
- exported_markdown: [Historico - J-88 Marketing/Growth Operating Index (reemplazado en espanol)](exported/historico-j-88-marketing-growth-operating-index-reemplazado-en-espanol--390bea9e.md) — page — 390bea9e-4736-8125-be37-f30618f961c2
- exported_markdown: [Hub Mundial 2026](exported/hub-mundial-2026--390bea9e.md) — page — 390bea9e-4736-814e-9967-f7fab0b7e7d2
- exported_markdown: [Indice de previas](exported/indice-de-previas--390bea9e.md) — page — 390bea9e-4736-8185-af6e-fc7c66154330
- exported_markdown: [Inicio](exported/inicio--349bea9e.md) — page — 349bea9e-4736-81c5-bfd5-fc68f56a2fa2
- exported_markdown: [Inventario publico expandido por sitemaps](exported/inventario-publico-expandido-por-sitemaps--390bea9e.md) — page — 390bea9e-4736-812b-a549-fcbb32009efa
- exported_markdown: [J-21 - Crear proyecto en Notion](exported/j-21-crear-proyecto-en-notion--349bea9e.md) — page — 349bea9e-4736-819e-a23b-eec8b2f5eb89
- exported_markdown: [J-22 - Poblar NOTION](exported/j-22-poblar-notion--349bea9e.md) — page — 349bea9e-4736-81ae-84d8-d05434c61a73
- exported_markdown: [J-33 - Roadmap tecnico, blockers y ownership de entrega](exported/j-33-roadmap-tecnico-blockers-y-ownership-de-entrega--34cbea9e.md) — page — 34cbea9e-4736-8199-9e1a-caf50a471551
- exported_markdown: [J-34 - Persistir avances de implementación y checklist de publicación en Notion](exported/j-34-persistir-avances-de-implementacion-y-checklist-de-publicacion-en-notion--34cbea9e.md) — page — 34cbea9e-4736-81ef-b2b4-e773d769d4b5
- exported_markdown: [J-35 - Plan y avances scraping competitivo](exported/j-35-plan-y-avances-scraping-competitivo--34cbea9e.md) — page — 34cbea9e-4736-819f-a51c-dd2d24045071
- exported_markdown: [J-35 - Plan y avances scraping competitivo](exported/j-35-plan-y-avances-scraping-competitivo--34cbea9e.md) — page — 34cbea9e-4736-81a2-9df3-c28c78c3d2d4
- exported_markdown: [J-36 - Calendario X/TikTok + free-to-paid funnel](exported/j-36-calendario-x-tiktok-free-to-paid-funnel--34cbea9e.md) — page — 34cbea9e-4736-8112-bc4a-d0221e29b872
- exported_markdown: [J-40 D1 - Reinicio: 2 picks claros + CTA unica](exported/j-40-d1-reinicio-2-picks-claros-cta-unica--38dbea9e.md) — page — 38dbea9e-4736-81e1-846a-fb8acba701f2
- exported_markdown: [J-40 D2 - Pick contrarian con tesis corta](exported/j-40-d2-pick-contrarian-con-tesis-corta--38dbea9e.md) — page — 38dbea9e-4736-814c-b2ea-fd584edbd4fa
- exported_markdown: [J-40 D3 - Accountability publica y ajuste visible](exported/j-40-d3-accountability-publica-y-ajuste-visible--38dbea9e.md) — page — 38dbea9e-4736-81b6-9c2d-df5f7ccde1bb
- exported_markdown: [J-40 D4 - Jornada fuerte con urgencia y orden de confianza](exported/j-40-d4-jornada-fuerte-con-urgencia-y-orden-de-confianza--38dbea9e.md) — page — 38dbea9e-4736-81a1-9dcc-c00867bb6fb6
- exported_markdown: [J-40 D5 - Cierre con prueba social y decision de capacidad](exported/j-40-d5-cierre-con-prueba-social-y-decision-de-capacidad--38dbea9e.md) — page — 38dbea9e-4736-811e-9905-fac3db037b15
- exported_markdown: [J-54 - Gana v9 public picks funnel blueprint](exported/j-54-gana-v9-public-picks-funnel-blueprint--38dbea9e.md) — page — 38dbea9e-4736-81ef-9afc-c606d0d98776
- exported_markdown: [J-56 Public Picks Contract - gana-v9](exported/j-56-public-picks-contract-gana-v9--38dbea9e.md) — page — 38dbea9e-4736-81d3-898d-e0bb31e10c5b
- exported_markdown: [J-57 Public Results/History and Trust Layer Spec - gana-v9](exported/j-57-public-results-history-and-trust-layer-spec-gana-v9--38dbea9e.md) — page — 38dbea9e-4736-8153-936d-e3b5e8d08d4b
- exported_markdown: [J-64 CMO review - differentiation, originality, and +18 language](exported/j-64-cmo-review-differentiation-originality-and-18-language--38dbea9e.md) — page — 38dbea9e-4736-8159-9bc1-d0560b5d9cb1
- exported_markdown: [J-89 Handoff de Notion: sprint de picks diarios, flujo X/TikTok y metricas del embudo](exported/j-89-handoff-de-notion-sprint-de-picks-diarios-flujo-x-tiktok-y-metricas-del-embudo--390bea9e.md) — page — 390bea9e-4736-819b-9e90-cd9614bf2df1
- exported_markdown: [J-89 Handoff de Notion: sprint de picks diarios, flujo X/TikTok y metricas del embudo](exported/j-89-handoff-de-notion-sprint-de-picks-diarios-flujo-x-tiktok-y-metricas-del-embudo--390bea9e.md) — page — 390bea9e-4736-8124-91bd-db3c6383c77c
- exported_markdown: [J-90 Índice operativo de Ingeniería / Técnica](exported/j-90-indice-operativo-de-ingenieria-tecnica--390bea9e.md) — page — 390bea9e-4736-8122-ba6b-eea956f63b9d
- exported_markdown: [J-91 — Repo, publicación y seguridad para índice CTO](exported/j-91-repo-publicacion-y-seguridad-para-indice-cto--390bea9e.md) — page — 390bea9e-4736-81ed-9a79-ebc677c8e705
- exported_markdown: [J-92 Rebuild del indice Competitive Intelligence / Gambeta](exported/j-92-rebuild-del-indice-competitive-intelligence-gambeta--390bea9e.md) — page — 390bea9e-4736-819a-b3f6-f73afafafe0c
- migrated: [J-93 Inventario de scraping y frontera pública](exported/j-93-inventario-de-scraping-y-frontera-publica--390bea9e.md) → [docs/competitive-intelligence/gambeta-public-scraping-boundary.md](../competitive-intelligence/gambeta-public-scraping-boundary.md) — page — 390bea9e-4736-816e-84dd-feb2e737b733
- exported_markdown: [J-95 Mapa maestro de workstreams P0](exported/j-95-mapa-maestro-de-workstreams-p0--390bea9e.md) — page — 390bea9e-4736-81ef-a721-edee78ce3f71
- exported_markdown: [J-97 Cierre de idioma P0 Notion](exported/j-97-cierre-de-idioma-p0-notion--390bea9e.md) — page — 390bea9e-4736-8110-ba33-d36eb3b96c0d
- exported_markdown: [Jo](exported/jo--31abea9e.md) — page — 31abea9e-4736-80c3-bb1f-d653c32dbb12
- exported_markdown: [Legacy repo secret rotation and history rewrite](exported/legacy-repo-secret-rotation-and-history-rewrite--34cbea9e.md) — page — 34cbea9e-4736-8137-aef7-cd020a1c7178
- exported_markdown: [Live publication lineage guard](exported/live-publication-lineage-guard--34cbea9e.md) — page — 34cbea9e-4736-819c-9227-c2da68ff33a3
- exported_markdown: [Lock the integration boundary for competitive scraping inside gana-v8](exported/lock-the-integration-boundary-for-competitive-scraping-inside-gana-v8--34cbea9e.md) — page — 34cbea9e-4736-8185-bf02-c9815fe8dd7c
- exported_markdown: [Lower-risk repo public hardening](exported/lower-risk-repo-public-hardening--34cbea9e.md) — page — 34cbea9e-4736-8150-bb2b-e3adc1421de2
- redacted_secret_source_do_not_migrate: [Mis api keys](exported/mis-api-keys--34dbea9e.md) — page — 34dbea9e-4736-8016-81dd-d98dc024feb2
- exported_markdown: [Oferta afiliada o bono](exported/oferta-afiliada-o-bono--349bea9e.md) — page — 349bea9e-4736-8102-8e24-c7b0239b91ad
- exported_markdown: [Oferta Bot Alerta](exported/oferta-bot-alerta--349bea9e.md) — page — 349bea9e-4736-818b-85da-d75b0c1c2a00
- exported_markdown: [Pausa de ranking por drift de politica publica](exported/pausa-de-ranking-por-drift-de-politica-publica--390bea9e.md) — page — 390bea9e-4736-81b4-9870-c9bfc38d911f
- exported_markdown: [Presupuesto mensual](exported/presupuesto-mensual--31abea9e.md) — page — 31abea9e-4736-8180-b5b7-e27860459d8b
- exported_markdown: [Programa 3C](exported/programa-3c--31abea9e.md) — page — 31abea9e-4736-80df-a93e-db3e6cd19265
- exported_markdown: [Proyecto web](exported/proyecto-web--31abea9e.md) — page — 31abea9e-4736-818d-aa63-fd4104b43e18
- exported_markdown: [Public picks and results funnel MVP](exported/public-picks-and-results-funnel-mvp--34cbea9e.md) — page — 34cbea9e-4736-81b8-be47-e279174b295f
- exported_markdown: [Public proof contract guard in public-api](exported/public-proof-contract-guard-in-public-api--34cbea9e.md) — page — 34cbea9e-4736-812c-adeb-e36ba7042aa6
- exported_markdown: [Public Results Proof](exported/public-results-proof--349bea9e.md) — page — 349bea9e-4736-8109-82ab-e05dc4904122
- exported_markdown: [Publication and channel distribution hardening](exported/publication-and-channel-distribution-hardening--34cbea9e.md) — page — 34cbea9e-4736-81b7-af6b-dc53085041a1
- exported_markdown: [Publication governance and environment isolation](exported/publication-governance-and-environment-isolation--34cbea9e.md) — page — 34cbea9e-4736-816d-a053-ffd4ba906afa
- exported_markdown: [Publication trust and hardening remain incomplete](exported/publication-trust-and-hardening-remain-incomplete--34cbea9e.md) — page — 34cbea9e-4736-81c3-ac53-e219126b9793
- exported_markdown: [push subscription routes](exported/push-subscription-routes--349bea9e.md) — page — 349bea9e-4736-81c3-a27c-c8b915359a1c
- exported_markdown: [Ranking](exported/ranking--349bea9e.md) — page — 349bea9e-4736-81bc-b42d-c34bd47962fc
- exported_markdown: [Ranking As Trust Loop](exported/ranking-as-trust-loop--349bea9e.md) — page — 349bea9e-4736-81ea-ad46-d6efa3a2531e
- exported_markdown: [Renta](exported/renta--31abea9e.md) — page — 31abea9e-4736-8197-8902-d05dca6e40a5
- exported_markdown: [Revision frontera publica Gambeta J-93](exported/revision-frontera-publica-gambeta-j-93--390bea9e.md) — page — 390bea9e-4736-8110-8d2d-c9465e42ab7a
- exported_markdown: [Robots](exported/robots--349bea9e.md) — page — 349bea9e-4736-8166-bb7b-d029ca6b87fd
- exported_markdown: [Salario](exported/salario--31abea9e.md) — page — 31abea9e-4736-8135-80e8-c47dbd10b7f9
- exported_markdown: [Sitemap de previas](exported/sitemap-de-previas--390bea9e.md) — page — 390bea9e-4736-81e5-aa55-f8b49c2da20f
- exported_markdown: [Sitemap principal](exported/sitemap-principal--390bea9e.md) — page — 390bea9e-4736-81af-81ce-f46f599070cf
- exported_markdown: [Trabajo extra](exported/trabajo-extra--31abea9e.md) — page — 31abea9e-4736-81e6-9e00-eaa50a898090
- exported_markdown: [Webscraper](exported/webscraper--34cbea9e.md) — page — 34cbea9e-4736-812e-9ea3-c8853d8a8ef7
- exported_markdown: [Webscraper role still unfilled](exported/webscraper-role-still-unfilled--34cbea9e.md) — page — 34cbea9e-4736-81b3-9f6e-e398d2f8168f
- exported_markdown: [WS de API FB](exported/ws-de-api-fb--358bea9e.md) — page — 358bea9e-4736-8023-9499-cc5c6347de4d

## Auditoría J-110

Estado del export al cierre de J-110:

- Manifest auditado: 136 items, sin IDs duplicados y sin archivos faltantes.
- Archivos exportados `.md`: 123, todos referenciados por `manifest.json`.
- Duplicados de alto valor detectados para fusión: `CMO`, `Gambeta Notion Refresh 2026-04-23`, `J-35 - Plan y avances scraping competitivo`, `J-89 Handoff de Notion: sprint de picks diarios, flujo X/TikTok y metricas del embudo`.
- `Mis api keys` quedó `redacted_secret_source_do_not_migrate` por contener credenciales/tokens; no debe migrarse ni restaurarse.
- Links del índice corregidos a rutas relativas del repo (`exported/...`) para no depender de Notion.

Índice final recomendado:

1. Mantener este directorio como zona histórica/auditable del export.
2. Promover a canónico sólo documentos vigentes bajo `docs/operations/`, `docs/growth/`, `docs/competitive-intelligence/`, `docs/plans/` o el área que corresponda.
3. Para cada promoción, dejar `canonicalFile` y `migrationStatus` en `manifest.json`.
4. Fusionar duplicados por contenido antes de crear un `.md` canónico; no copiar enlaces operativos hacia Notion salvo en una sección histórica `Fuente Notion`.
5. Excluir documentos personales, credenciales o material obsoleto con `migrationStatus: redacted_secret_source_do_not_migrate`, `excluded_redacted` u `obsolete`.

Ver detalle de cierre en [`AUDIT.md`](AUDIT.md).
