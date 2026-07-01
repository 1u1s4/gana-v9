---
source: notion
notion_id: 390bea9e-4736-816e-84dd-feb2e737b733
notion_url: https://app.notion.com/p/J-93-Inventario-de-scraping-y-frontera-p-blica-390bea9e4736816e84ddfeb2e737b733
title: "J-93 Inventario de scraping y frontera pública"
---

# J-93 Inventario de scraping y frontera pública

# J-93 Inventario de scraping y frontera publica
Actualizado el 2026-07-01 por Webscraper. Esta pagina deja la operacion J-22 en espanol y mantiene J-92 como indice estrategico relacionado.
Frontera publica: no recolectar /api, rutas con query, /ranking, auth, push, Telegram privado, paywalls, superficies con credenciales ni trafico que requiera evasion anti-bot. Mantener separadas las observaciones verificadas y las hipotesis.
## Resumen para CTO
La revision publica acotada confirmo objetivos estables de HTML/XML publico: home, blog, robots.txt, sitemaps, paginas estaticas y paginas de previas/articulos. /ranking cambio y no debe automatizarse: redirige a /blog/ranking-gambeta-coins, luego devuelve 404, y robots.txt desautoriza /ranking.
Las pistas historicas /api/sb?type=stats, /api/sb?type=ranking, /api/sb?type=broadcast, /api/picks?email=... y push subscription quedan como hipotesis, no como targets.
## Evidencia
- https://gambeta.ai/ devolvio 200 HTML con titulo: Pronosticos de Futbol con IA Gratis - 38 Ligas + Mundial 2026.
- https://gambeta.ai/blog redirigio a /blog/ y devolvio 200 HTML.
- https://gambeta.ai/ranking devolvio 301 hacia /blog/ranking-gambeta-coins y despues 404 HTML.
- https://gambeta.ai/robots.txt devolvio 200 e incluye Content-Signal: search=yes,ai-train=no; tambien desautoriza /api, familias con query, /ranking y rutas de funnel/cuenta.
- https://gambeta.ai/sitemap.xml devolvio 323 URLs; https://gambeta.ai/sitemap-previas.xml devolvio 22 URLs.
- Paginas representativas /como-funciona, /herramientas, /foro, /bonos, /mundial-2026, /previas, una /previa/... y un articulo de blog devolvieron 200.
## Permitido
- HTML publico con respuesta 2xx y no desautorizado por robots.txt.
- robots.txt y XML de sitemaps publicos.
- URLs y labels de enlaces visibles en HTML publico.
- Metadatos publicos de enlaces sociales o Telegram mostrados en el sitio, sin entrar a canales privados.
## Requiere revision
- Mapeo con navegador cuando la hidratacion pueda disparar /api, ?type, auth, push, estado de cuenta o trafico de /ranking.
- Formularios, captura de email, registro, push subscription, notificaciones, rutas de cuenta, coupon, odds o similares.
## Ruta de implementacion
- source-connectors: captura cruda de HTML/XML publico con allow-list y guarda de robots.
- ingestion-worker: ejecucion programada en sandbox y lineage.
- canonical-pipeline: snapshots y diffs deterministas de superficies publicas.
- research-worker: sintesis de observaciones verificadas y separacion de hipotesis.
## Actualizaciones de Notion
Surface Inventory, Endpoint Hypotheses, Collection Runs y Competitive Signal Diffs fueron actualizadas en espanol para J-93. J-22 queda operativo; J-92 sigue como indice estrategico relacionado.
