---
source: notion
notion_id: 390bea9e-4736-81ef-a721-edee78ce3f71
notion_url: https://app.notion.com/p/J-95-Mapa-maestro-de-workstreams-P0-390bea9e473681efa721edee78ce3f71
title: "J-95 Mapa maestro de workstreams P0"
---

# J-95 Mapa maestro de workstreams P0

Actualizado: 2026-07-01 UTC / 2026-06-30 America/Guatemala
Owner: CTO. Este mapa consolida los links del command center y traduce cada workstream critico a fuente de verdad, owner, estado y proxima accion.
<callout icon="⚠️">
	Regla vigente: Paperclip es fuente de ejecucion; Notion es fuente de lectura ejecutiva; repo docs son evidencia tecnica. No copiar secretos en ninguno de los tres.
</callout>
## Leer primero
- [1. Mapa operativo P0 Notion: freeze, auditoria y links raiz.](https://app.notion.com/p/Gana-v9-Mapa-operativo-P0-Notion-390bea9e473681dd9128c7da48584dba)
- 2. Este J-95: mapa maestro de workstreams, deprecaciones y gaps de links.
- [3. J-60 Operating Standard: norma para que cada area documente igual.](https://app.notion.com/p/Gana-v9-Notion-Documentation-Operating-Standard-J-60-38dbea9e4736813abeddfc901d9ac8cb)
- 4. Paperclip issue state: verdad sobre bloqueo, assignee y cierre.
## Mapa maestro P0
<table header-row="true" header-column="false">
<tr>
<td>Area</td>
<td>Issue</td>
<td>Estado</td>
<td>Owner</td>
<td>Fuente de verdad</td>
<td>Accion / regla</td>
</tr>
<tr>
<td>Raiz P0 / freeze</td>
<td>J-87</td>
<td>in_progress</td>
<td>Jo / board</td>
<td><mention-page url="https://app.notion.com/p/390bea9e473681dd9128c7da48584dba"/></td>
<td>Fuente de lectura ejecutiva; no levantar freeze hasta auditoria final.</td>
</tr>
<tr>
<td>Marketing / growth index</td>
<td>J-88</td>
<td>in_progress</td>
<td>CMO</td>
<td>[Indice Growth y pagina J-88](https://app.notion.com/p/J-88-Marketing-Growth-Operating-Index-390bea9e47368125be37f30618f961c2)</td>
<td>Leer para canales, oferta, contenido y metricas; mantener J-89 como workflow diario.</td>
</tr>
<tr>
<td>Daily picks, X/TikTok, funnel metrics</td>
<td>J-89</td>
<td>in_progress</td>
<td>Growth + Content Ops</td>
<td>repo/docs/plans/2026-07-01-j-89-daily-picks-x-tiktok-funnel-notion-handoff.md</td>
<td>Notion page no detectada en busqueda; usar markdown hasta que owner publique URL final.</td>
</tr>
<tr>
<td>Ingenieria / tecnica</td>
<td>J-90</td>
<td>in_progress</td>
<td>CTO</td>
<td>[J-90 Indice operativo de Ingenieria](https://app.notion.com/p/J-90-Indice-operativo-de-Ingenieria-Tecnica-390bea9e47368122ba6beea956f63b9d)</td>
<td>Fuente CTO para arquitectura, resume rules, blockers y repos.</td>
</tr>
<tr>
<td>Repo/publicacion/seguridad</td>
<td>J-91</td>
<td>in_progress</td>
<td>Founding Engineer</td>
<td>[J-91 Repo, publicacion y seguridad](https://app.notion.com/p/J-91-Repo-publicaci-n-y-seguridad-para-ndice-CTO-390bea9e473681ed9a79ebc677c8e705)</td>
<td>Fuente detallada para estado de publicacion, incidentes y hardening.</td>
</tr>
<tr>
<td>Competitive Intelligence / Gambeta</td>
<td>J-92</td>
<td>in_progress</td>
<td>Gambeta Strategy Lab</td>
<td>repo/docs/plans/2026-07-01-j-92-competitive-intelligence-gambeta-index.md</td>
<td>Notion page dedicada no detectada; J-92 markdown es el indice vigente hasta publicacion.</td>
</tr>
<tr>
<td>Scraping publico y frontera</td>
<td>J-93</td>
<td>in_progress</td>
<td>Webscraper</td>
<td>[J-93 Public Scraping Inventory and Boundary](https://app.notion.com/p/J-93-Public-Scraping-Inventory-and-Boundary-390bea9e4736816e84ddfeb2e737b733)</td>
<td>Fuente operacional para robots, sitemaps, ranking obsoleto y no-probe endpoints.</td>
</tr>
<tr>
<td>Auditoria final</td>
<td>J-94</td>
<td>blocked</td>
<td>Jo</td>
<td>J-94 Paperclip</td>
<td>Se desbloquea cuando J-88/J-89/J-90/J-91/J-92/J-93/J-95/J-96 tengan evidencia navegable.</td>
</tr>
<tr>
<td>Mapa maestro de links</td>
<td>J-95</td>
<td>in_progress -\> done</td>
<td>CTO</td>
<td>J-95 Mapa maestro de workstreams P0</td>
<td>Este documento consolida fuentes y deprecaciones para que Jo audite sin replay de threads.</td>
</tr>
<tr>
<td>Higiene de secretos / gate freeze</td>
<td>J-96</td>
<td>in_progress</td>
<td>CTO</td>
<td>J-96 Paperclip</td>
<td>Gate nuevo: confirmar que Notion/Paperclip/docs no contienen secretos antes de levantar freeze.</td>
</tr>
</table>
## Workstreams bloqueados que no deben reanudarse
<table header-row="true" header-column="false">
<tr>
<td>Workstream</td>
<td>Issues</td>
<td>Estado</td>
<td>Owner de desbloqueo</td>
<td>Accion valida</td>
</tr>
<tr>
<td>Credenciales y rewrite legacy</td>
<td>J-77, J-83, J-18</td>
<td>blocked / todo</td>
<td>Luis o workspace admin</td>
<td>Rotar/revocar credenciales y confirmar alcance de rewrite; no copiar secretos.</td>
</tr>
<tr>
<td>Publicacion y hardening menor</td>
<td>J-19</td>
<td>blocked</td>
<td>CTO</td>
<td>Retomar solo cuando J-87 cierre y J-91 confirme estado.</td>
</tr>
<tr>
<td>Webscraper contractor</td>
<td>J-24, J-80, J-81</td>
<td>blocked</td>
<td>CTO + operador/board</td>
<td>Marketplace, pago y autorizacion externa; no mas planning tecnico durante freeze.</td>
</tr>
<tr>
<td>Sprint social diario</td>
<td>J-40, J-48, J-69</td>
<td>blocked</td>
<td>CMO / Growth Ops</td>
<td>No publicar sin handles autenticados y feed fresco aprobado.</td>
</tr>
<tr>
<td>Backfill Notion public funnel</td>
<td>J-61, J-76, J-78</td>
<td>blocked</td>
<td>Gambeta Strategy Lab / CTO</td>
<td>Accesso Notion existe en este heartbeat, pero el freeze J-87 sigue controlando la reanudacion.</td>
</tr>
<tr>
<td>Trust/results spec</td>
<td>J-57</td>
<td>blocked</td>
<td>Board / Jo path</td>
<td>Producto ya tiene contrato y mirror anterior; cierre depende de links/auditoria, no de nueva implementacion.</td>
</tr>
</table>
## Links vigentes del command center
<table header-row="true" header-column="false">
<tr>
<td>Nombre</td>
<td>Uso</td>
<td>Estado</td>
<td>URL</td>
</tr>
<tr>
<td>Mapa operativo P0</td>
<td>Command center</td>
<td>Vigente</td>
<td><mention-page url="https://app.notion.com/p/390bea9e473681dd9128c7da48584dba"/></td>
</tr>
<tr>
<td>Sistema ejecutivo</td>
<td>Contexto ejecutivo historico</td>
<td>Vigente si no contradice J-87/J-95</td>
<td><mention-page url="https://app.notion.com/p/34cbea9e47368195aaa9d35d33543deb"/></td>
</tr>
<tr>
<td>Operating Standard</td>
<td>Norma de documentacion</td>
<td>Vigente</td>
<td>[https://app.notion.com/p/Gana-v9-Notion-Documentation-Operating-Standard-J-60-38dbea9e4736813abeddfc901d9ac8cb](https://app.notion.com/p/Gana-v9-Notion-Documentation-Operating-Standard-J-60-38dbea9e4736813abeddfc901d9ac8cb)</td>
</tr>
<tr>
<td>Growth department</td>
<td>Indice de crecimiento</td>
<td>Vigente</td>
<td>[https://app.notion.com/p/Gana-v9-02-Growth-y-contenido-Indice-operativo-38dbea9e473681a59fc5c9664b6782a9](https://app.notion.com/p/Gana-v9-02-Growth-y-contenido-Indice-operativo-38dbea9e473681a59fc5c9664b6782a9)</td>
</tr>
<tr>
<td>J-88 Marketing/Growth</td>
<td>Pagina hija</td>
<td>Vigente</td>
<td>[https://app.notion.com/p/J-88-Marketing-Growth-Operating-Index-390bea9e47368125be37f30618f961c2](https://app.notion.com/p/J-88-Marketing-Growth-Operating-Index-390bea9e47368125be37f30618f961c2)</td>
</tr>
<tr>
<td>J-90 Ingenieria</td>
<td>Pagina hija</td>
<td>Vigente</td>
<td>[https://app.notion.com/p/J-90-Indice-operativo-de-Ingenieria-Tecnica-390bea9e47368122ba6beea956f63b9d](https://app.notion.com/p/J-90-Indice-operativo-de-Ingenieria-Tecnica-390bea9e47368122ba6beea956f63b9d)</td>
</tr>
<tr>
<td>J-91 Seguridad/publicacion</td>
<td>Pagina hija</td>
<td>Vigente</td>
<td>[https://app.notion.com/p/J-91-Repo-publicaci-n-y-seguridad-para-ndice-CTO-390bea9e473681ed9a79ebc677c8e705](https://app.notion.com/p/J-91-Repo-publicaci-n-y-seguridad-para-ndice-CTO-390bea9e473681ed9a79ebc677c8e705)</td>
</tr>
<tr>
<td>J-93 Scraping boundary</td>
<td>Pagina hija</td>
<td>Vigente</td>
<td>[https://app.notion.com/p/J-93-Public-Scraping-Inventory-and-Boundary-390bea9e4736816e84ddfeb2e737b733](https://app.notion.com/p/J-93-Public-Scraping-Inventory-and-Boundary-390bea9e4736816e84ddfeb2e737b733)</td>
</tr>
<tr>
<td>J-54 funnel blueprint</td>
<td>Producto/free picks</td>
<td>Vigente como estrategia</td>
<td>[https://app.notion.com/p/J-54-Gana-v9-public-picks-funnel-blueprint-38dbea9e473681ef9afcc606d0d98776](https://app.notion.com/p/J-54-Gana-v9-public-picks-funnel-blueprint-38dbea9e473681ef9afcc606d0d98776)</td>
</tr>
<tr>
<td>J-56 contract</td>
<td>Contrato public picks</td>
<td>Vigente</td>
<td>[https://app.notion.com/p/J-56-Public-Picks-Contract-gana-v9-38dbea9e473681d3898de0bb31e10c5b](https://app.notion.com/p/J-56-Public-Picks-Contract-gana-v9-38dbea9e473681d3898de0bb31e10c5b)</td>
</tr>
<tr>
<td>J-57 trust layer</td>
<td>Resultados/historial</td>
<td>Vigente como spec</td>
<td>[https://app.notion.com/p/J-57-Public-Results-History-and-Trust-Layer-Spec-gana-v9-38dbea9e47368153936de3b5e8d08d4b](https://app.notion.com/p/J-57-Public-Results-History-and-Trust-Layer-Spec-gana-v9-38dbea9e47368153936de3b5e8d08d4b)</td>
</tr>
</table>
## Deprecaciones y marcadores de archivo
<table header-row="true" header-column="false">
<tr>
<td>Pagina o artefacto</td>
<td>Tipo</td>
<td>Marcador requerido</td>
<td>Referencia</td>
</tr>
<tr>
<td>J-22 Poblar NOTION</td>
<td>Historico / semilla abril</td>
<td>No usar como indice actual; J-92/J-93 mandan.</td>
<td>[https://app.notion.com/p/J-22-Poblar-NOTION-349bea9e473681ae84d8d05434c61a73](https://app.notion.com/p/J-22-Poblar-NOTION-349bea9e473681ae84d8d05434c61a73)</td>
</tr>
<tr>
<td>Gambeta Surface Inventory</td>
<td>Historico con filas actualizadas por J-93</td>
<td>Usar solo via J-93; no importar como mapa actual aislado.</td>
<td>[https://app.notion.com/p/349bea9e4736818b8494c595cc3da111](https://app.notion.com/p/349bea9e4736818b8494c595cc3da111)</td>
</tr>
<tr>
<td>Gambeta Endpoint Hypotheses</td>
<td>Hipotesis historicas</td>
<td>Marcar no-probe: /api, ?type, ranking y flujos privados no se recolectan.</td>
<td>[https://app.notion.com/p/349bea9e473681c3897ef8d08b714c4a](https://app.notion.com/p/349bea9e473681c3897ef8d08b714c4a)</td>
</tr>
<tr>
<td>J-35 scraping competitivo duplicado</td>
<td>Historico</td>
<td>No source of truth; reemplazado por J-92/J-93.</td>
<td>J-35 pages en Notion</td>
</tr>
<tr>
<td>J-40 day pages / sprint viejo</td>
<td>Ejecucion historica</td>
<td>No son metricas vivas; usar J-89/J-47 y feed fresco.</td>
<td>J-40 pages en Notion</td>
</tr>
<tr>
<td>HIBRI2 / paginas antiguas</td>
<td>Otro proyecto o contexto obsoleto</td>
<td>Archivar; no mezclar con gana-v9 actual.</td>
<td>Notion archive</td>
</tr>
<tr>
<td>J-76 notas "sin NOTION_API_KEY"</td>
<td>Stale para este heartbeat</td>
<td>Hoy hay API key en runtime; aun asi J-61/J-76 no deben reanudarse hasta cerrar J-87.</td>
<td>repo/docs/plans/2026-06-28-j-76-scoped-notion-access-unblocker.md</td>
</tr>
<tr>
<td>Legacy repo docs j18 / analysis trees</td>
<td>Material de incidente/migracion</td>
<td>No publicar ni citar detalles operativos hasta resolver J-18/J-77/J-83.</td>
<td>repo/j18-repos, repo/analysis</td>
</tr>
</table>
## Gaps que Jo debe ver
- J-89 y J-92 tienen markdown vigente en repo pero no se detecto pagina Notion dedicada en la busqueda global; sus owners deben publicar o confirmar URL final.
- J-94 esta bloqueado por diseno: no debe auditar el cierre final hasta que J-95 y J-96 queden visibles junto con J-88/J-89/J-90/J-91/J-92/J-93.
- J-96 debe revisar que ninguna actualizacion P0 haya copiado secretos, tokens, DSNs, cookies, llaves, correos privados o datos personales.
- Las reglas antiguas del command center que listaban hijos P0 sin J-95/J-96 deben considerarse incompletas desde este heartbeat.
## Definition of done para levantar freeze
- Cada area critica tiene una fuente vigente: Notion page o markdown listo para publicar con owner claro.
- Las paginas obsoletas tienen marcador de archivo/no source of truth.
- J-96 confirma higiene de secretos.
- J-94 valida navegacion de extremo a extremo en menos de 10 minutos y despierta/cierra J-87 segun corresponda.
- Nadie reanuda ejecucion normal hasta que J-87 quede done o Jo levante explicitamente el freeze.
