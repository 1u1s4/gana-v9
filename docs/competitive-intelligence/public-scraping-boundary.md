---
status: canonical
owner: Competitive Intelligence Webscraper
issue: J-106
last_verified: 2026-07-01 America/Guatemala
source_of_truth: repo
---

# Public Scraping Boundary

## Regla Operativa

Recolectar solo superficies publicas de Gambeta.ai que cumplan todas estas condiciones:

- Respuesta publica 2xx o redirect publico explicito.
- No requiere login, cuenta, cookie privada, token, pago, invitacion, Telegram privado ni bypass.
- No esta desautorizada por `robots.txt`.
- No depende de query params desautorizados ni rutas `/api`.
- Puede ser capturada y versionada como HTML, XML, texto robots o lista de enlaces visibles.

## Allow-List Actual

| Superficie | Estado | Uso |
| --- | --- | --- |
| `/` | Verificada 200 HTML | Snapshot de homepage, copy, CTAs publicos y enlaces visibles. |
| `/blog/` | Verificada 200 HTML | Indice publico de blog. |
| `/robots.txt` | Verificada 200 texto | Policy gate obligatorio antes de cada run. |
| `/sitemap.xml` | Verificada 200 XML, 323 URLs | Descubrimiento publico principal. |
| `/sitemap-previas.xml` | Verificada 200 XML, 21 URLs | Descubrimiento de previas; monitorear conteo por drift. |
| `/como-funciona`, `/herramientas`, `/foro`, `/bonos`, `/mundial-2026`, `/previas` | Verificadas 200 HTML | Paginas estaticas o indices publicos. |
| URLs `/blog/...` desde sitemap | Muestra verificada 200 HTML | Articulos publicos. |
| URLs `/previa/...` desde sitemap de previas | Muestra verificada 200 HTML | Previas publicas. |

## Deny-List Actual

| Superficie | Motivo |
| --- | --- |
| `/api`, `/api/` | Desautorizado por robots y fuera de frontera J-106. |
| `/*?type=*`, `/*?openauth*`, `/*?returnTo*`, `/*?q=*`, `/*?category=*` | Desautorizado por robots; no usar query crawling. |
| `/odds?*`, `/coupon`, `/available`, `/cup-context`, `/ranking`, `/nba/500` | Desautorizado por robots o drift no estable. |
| `/ranking` | Drift confirmado: redirect a `/blog/ranking-gambeta-coins`, respuesta final 404, y robots desautoriza `/ranking`. |
| Auth, cuenta, push subscription, email capture, paid trial, paywall | Requiere estado, datos privados o consentimiento; no recolectar. |
| Telegram privado o canales no publicos | Fuera de alcance. Solo registrar enlaces publicos visibles en HTML. |

## Evidencia Actual

Comandos de verificacion usados en este heartbeat: `curl` contra URLs publicas y conteo local de `<url>` en XML descargado. No se usaron credenciales, login ni endpoints privados.

- Home: 200 HTML, titulo `Pronósticos de Fútbol con IA Gratis · 38 Ligas + Mundial 2026`.
- Blog: `/blog` redirige a `/blog/`, 200 HTML.
- Ranking: `/ranking` redirige a `/blog/ranking-gambeta-coins`, 404 HTML.
- Robots: 200 texto, `Content-Signal: search=yes,ai-train=no`, `Disallow: /api`, `Disallow: /*?type=*`, `Disallow: /ranking`.
- Sitemap principal: 200 XML, 323 URLs.
- Sitemap previas: 200 XML, 21 URLs.
- Muestras publicas 200: `/como-funciona`, `/herramientas`, `/foro`, `/bonos`, `/mundial-2026`, `/previas`, `https://gambeta.ai/previa/paraguay-vs-francia-2026-07-04`, `https://gambeta.ai/blog/adamchoi-premium-vale-la-pena`.

## Separacion de Observaciones e Hipotesis

Observacion verificada: un status, redirect, title, robots directive, sitemap count o HTML visible confirmado en un run publico.

Hipotesis: cualquier ruta sugerida por Notion historico, naming de frontend, hidratacion, payload JS o comentario anterior que no fue confirmada como public-only y permitida por robots en el run actual.

Las hipotesis historicas `/api/sb?type=stats`, `/api/sb?type=ranking`, `/api/sb?type=broadcast` y `/api/picks?email=...` deben permanecer fuera del collector hasta que exista una revision aprobada. Por ahora son evidencia de investigacion, no targets.

## Ruta de Implementacion

1. `source-connectors`: mantener allow-list declarativa, robots gate por run, raw HTML/XML/text append-only y metadata de status/redirect/content-type.
2. `ingestion-worker`: ejecutar en namespace `research` o `sandbox`, con cadence conservador y sin publication live.
3. `canonical-pipeline`: generar snapshots normalizados y diffs estables de title, headings, enlaces salientes visibles, status, redirects, sitemap counts y robots directives.
4. `research-worker`: producir briefing CTO con tres bloques: observaciones verificadas, hipotesis, y recomendaciones. No mezclar inferencias con hechos.

## Criterio para Promover Nuevas Superficies

Una nueva ruta entra al allow-list solo si:

- aparece en sitemap o enlace publico visible;
- robots no la desautoriza;
- devuelve contenido publico sin estado privado;
- un run browser-assisted confirma que no depende de auth, email, push, query privada ni endpoint prohibido;
- queda registrada con evidencia y owner de revision.
