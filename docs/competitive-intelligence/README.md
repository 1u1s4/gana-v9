---
status: canonical
owner: Competitive Intelligence Webscraper
issue: J-106
last_verified: 2026-07-01 America/Guatemala
notion_sources:
  - title: J-22 - Poblar NOTION
    notion_id: 349bea9e-4736-81ae-84d8-d05434c61a73
    exported_file: docs/notion-migration/exported/j-22-poblar-notion--349bea9e.md
  - title: J-35 - Plan y avances scraping competitivo
    notion_id: 34cbea9e-4736-81a2-9df3-c28c78c3d2d4
    exported_file: docs/notion-migration/exported/j-35-plan-y-avances-scraping-competitivo--34cbea9e.md
  - title: J-92 Rebuild del indice Competitive Intelligence / Gambeta
    notion_id: 390bea9e-4736-819a-b3f6-f73afafafe0c
    exported_file: docs/notion-migration/exported/j-92-rebuild-del-indice-competitive-intelligence-gambeta--390bea9e.md
  - title: J-93 Inventario de scraping y frontera publica
    notion_id: 390bea9e-4736-816e-84dd-feb2e737b733
    exported_file: docs/notion-migration/exported/j-93-inventario-de-scraping-y-frontera-publica--390bea9e.md
---

# Competitive Intelligence / Gambeta

Este directorio es la fuente canonica en repo para competitive intelligence y scraping publico de Gambeta. Notion queda como evidencia historica exportada en `docs/notion-migration/exported/`.

## Resumen CTO

- J-22 ya no es fuente operativa; queda como workspace historico con Surface Inventory, Endpoint Hypotheses, Competitive Signal Diffs y Collection Runs.
- J-92/J-93 son la version Notion mas nueva, pero este directorio reemplaza esas paginas como fuente de lectura y ejecucion.
- La frontera publica sigue siendo estricta: solo HTML/XML publico, robots.txt, sitemaps y enlaces visibles. Sin login, sin paywall, sin Telegram privado, sin bypass anti-bot y sin rutas desautorizadas por robots.
- La implementacion estable debe vivir en `source-connectors`, `ingestion-worker`, `canonical-pipeline` y `research-worker`. No crear un crawler desconectado ni una pila paralela.

## Documentos

- [Gambeta Public Strategy And Collection Boundary](./gambeta-public-boundary.md): adaptacion J-108 de patrones publicos visibles hacia el funnel original de gana-v9, con hard rules de no copia.
- [Public Scraping Boundary](./public-scraping-boundary.md): allow-list, deny-list, evidencia actual, drift y ruta de implementacion.
- [Migration Decisions](../notion-migration/competitive-intelligence-decisions.md): decision por fuente Notion relevante para J-106.
- [Frontera publica de scraping de Gambeta](./gambeta-public-scraping-boundary.md): draft migrado de J-93, preservado como historico y superseded por `public-scraping-boundary.md`.

## Observaciones Verificadas

Spot check publico del 2026-07-01:

- `https://gambeta.ai/` devuelve 200 HTML. Titulo observado: `Pronósticos de Fútbol con IA Gratis · 38 Ligas + Mundial 2026`.
- `https://gambeta.ai/blog` redirige a `/blog/` y devuelve 200 HTML.
- `https://gambeta.ai/ranking` redirige a `/blog/ranking-gambeta-coins` y termina en 404 HTML. No automatizar.
- `https://gambeta.ai/robots.txt` devuelve 200, declara `Content-Signal: search=yes,ai-train=no`, y desautoriza `/api`, rutas con query como `?type`, `?openauth`, `?returnTo`, `/odds?`, `/coupon` y `/ranking`.
- `https://gambeta.ai/sitemap.xml` devuelve 323 URLs.
- `https://gambeta.ai/sitemap-previas.xml` devuelve 21 URLs.
- `/como-funciona`, `/herramientas`, `/foro`, `/bonos`, `/mundial-2026`, `/previas`, una URL `/previa/...` del sitemap y un articulo `/blog/...` del sitemap devuelven 200 HTML.

## Hipotesis y Fuera de Alcance

Estas rutas vienen de J-22/J-35 como hipotesis historicas, no como targets:

- `/api/sb?type=stats`
- `/api/sb?type=ranking`
- `/api/sb?type=broadcast`
- `/api/picks?email=...`
- push subscriptions, auth, cuenta, odds con query, coupons, formularios con email y cualquier ruta que requiera estado de sesion.

Para promover una hipotesis se requiere mapeo browser-assisted en sandbox, confirmacion public-only, robots allow, y aprobacion de integracion por los componentes canonicos.

## Riesgo de Drift

- El sitemap de previas ya cambio respecto a J-93: Notion registro 22 URLs; el spot check actual registro 21.
- Home, promos, CTAs, handles sociales, precios y articulos pueden rotar sin cambiar rutas.
- Ranking cambio de superficie publica visible a redirect + 404 y robots lo desautoriza. Tratarlo como drift confirmado y no como fuente estable.
- Sitemaps son la mejor fuente para descubrir paginas publicas, pero deben validarse por status y robots en cada run.

## Proximas Acciones Recomendadas

1. `source-connectors`: implementar o extender un conector allow-list para home, blog, robots, sitemaps, paginas estaticas y URLs descubiertas por sitemap.
2. `ingestion-worker`: programar solo despues de guardar raw bodies append-only con namespace `research` o `sandbox`.
3. `canonical-pipeline`: normalizar snapshots y diffs deterministas de copy, links visibles, titles, status, redirects, sitemap counts y robots policy.
4. `research-worker`: convertir diffs verificados en notas CTO separando observaciones de hipotesis.
