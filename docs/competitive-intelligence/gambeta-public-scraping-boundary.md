---
source: notion_migration
notion_id: 390bea9e-4736-816e-84dd-feb2e737b733
notion_title: "J-93 Inventario de scraping y frontera pública"
migration_status: migrated
owner: Webscraper
updated: 2026-07-01
superseded_by: docs/competitive-intelligence/public-scraping-boundary.md
superseded_on: 2026-07-01
---

# Frontera pública de scraping de Gambeta

> J-106 update: this J-93 migration draft is preserved for historical context. The current scraping boundary and latest spot-check evidence live in [Public Scraping Boundary](./public-scraping-boundary.md).

Este documento fue la versión canónica en repo del cierre J-93. Para J-106, la fuente vigente es [Public Scraping Boundary](./public-scraping-boundary.md). Notion queda como referencia histórica.

## Resumen para CTO

J-22 sigue siendo referencia histórica del workspace de inteligencia competitiva, pero la operación vigente debe vivir en Markdown. La frontera de scraping para `gambeta.ai` es pública, acotada y separa observaciones verificadas de hipótesis.

El cambio crítico de la revisión pública del `2026-07-01` es que `https://gambeta.ai/ranking` no debe recolectarse. La ruta redirigió a `/blog/ranking-gambeta-coins`, luego devolvió `404`, y `robots.txt` también desautoriza `/ranking`.

Las pistas históricas de endpoints `/api/*` y `?type=*` quedan como hipótesis solamente. No deben probarse con HTTP directo bajo la política pública actual.

## Evidencia verificada

Revisión acotada a superficies públicas. No hubo login, paywall, Telegram privado ni prueba de `/api/*`.

| Evidencia | Resultado |
| --- | --- |
| `https://gambeta.ai/` | `200`, HTML, título `Pronosticos de Futbol con IA Gratis - 38 Ligas + Mundial 2026` |
| `https://gambeta.ai/blog` | `308` hacia `/blog/`, luego `200` HTML |
| `https://gambeta.ai/ranking` | `301` hacia `/blog/ranking-gambeta-coins`, luego `404` HTML |
| `https://gambeta.ai/robots.txt` | `200`; `Content-Signal: search=yes,ai-train=no`; desautoriza `/api`, familias con query, `/ranking` y varias rutas de funnel/cuenta |
| `https://gambeta.ai/sitemap.xml` | `200`, XML, `323` URLs contadas |
| `https://gambeta.ai/sitemap-previas.xml` | J-93 registro `22` URLs; J-106 spot check registro `21` URLs |
| Páginas públicas representativas | `/como-funciona`, `/herramientas`, `/foro`, `/bonos`, `/mundial-2026`, `/previas`, una URL `/previa/...` y un artículo de blog devolvieron `200` |

## Inventario operativo

| Superficie | Estado | Modo de colección | Señales |
| --- | --- | --- | --- |
| Inicio | Pública verificada | `http-direct`; browser solo con guardas de ruta | Picks IA gratis, bono diario, oferta tipo DBbet, hub Mundial 2026, herramientas, foro, blog y alertas |
| Blog y artículos | Pública verificada | `http-direct` | Clusters SEO, educación sobre apuestas con IA, comparativas y CTAs |
| Sitemaps públicos | Públicos verificados | XML por `http-direct` | Descubrimiento seguro de URLs públicas |
| Previas | Muestra pública verificada | HTML por `http-direct` | Títulos de partidos, copy de recomendación y contenido por fecha |
| Herramientas, foro, bonos y Mundial | Muestra pública verificada | HTML por `http-direct` | Utilidad de retención, comunidad, monetización y evento |
| Política robots | Pública verificada | Texto por `http-direct` | `search=yes`, `ai-train=no` y mapa de desautorizaciones |
| Ranking | Cambiada; no automatizar | Sin colección automatizada bajo la política actual | Ruta con drift y desautorizada explícitamente |

## Frontera pública

Permitido para investigación competitiva:

- HTML público que devuelve `2xx` y no está desautorizado por `robots.txt`.
- `robots.txt`.
- XML de sitemaps públicos.
- URLs y labels de enlaces visibles en HTML público.
- Metadatos públicos de enlaces sociales o Telegram mostrados en la página, sin entrar a canales privados.
- Extractos breves y resúmenes estructurales para análisis interno.

Requiere revisión del CTO antes de recolectar:

- Mapeo con navegador cuando la página hidratada pueda disparar `/api/*`, `?type=*`, auth, push, estado de cuenta o tráfico de `/ranking`.
- Formularios, captura de email, registro, push subscription o flujos de notificación.
- Rutas de cuenta, odds, coupon, line, ranking o promociones incluidas en reglas `Disallow`.
- Endpoints descubiertos solo desde scripts inline o documentos históricos.

Fuera de alcance bajo la política actual:

- Colección directa de `/api/` o `/api`.
- Colección directa de `/*?type=*`, `/*?openauth*`, `/*?returnTo*`, `/*?q=*`, `/odds?*` y `/*?category=*`.
- Automatización de `/ranking` mientras esté desautorizado y con drift.
- Bypass de login, paywall, credenciales, Telegram privado, uso compartido de cuentas o evasión anti-bot.
- Uso de contenido del competidor para entrenamiento de modelos mientras exista `ai-train=no`.
- Alimentar publicaciones en vivo con contenido del competidor.

## Hipótesis de endpoints

| Pista | Estado actual | Frontera |
| --- | --- | --- |
| `/api/sb?type=stats` | Hipótesis histórica | Desautorizada por `/api/` y `?type=*`; no probar |
| `/api/sb?type=ranking` | Hipótesis histórica | Desautorizada por `/api/`, `?type=*` y drift de ranking; no probar |
| `/api/sb?type=broadcast` | Hipótesis histórica | Desautorizada por `/api/` y `?type=*`; no probar |
| `/api/picks?email=...` | Hipótesis histórica | Desautorizada y vinculada a datos de lead; no enviar datos |
| Rutas de push subscription | Hipótesis histórica | Browser/stateful; no suscribir ni recolectar estado privado |

## Riesgo de drift

Alto:

- `ranking` pasó de superficie monitoreable en la línea base de abril a ruta desautorizada y con `404` en la revisión del `2026-07-01`.
- El copy del home y los enlaces de afiliación pueden rotar a diario.
- Las páginas de previas dependen de fechas/eventos y pueden cambiar con el calendario.

Medio:

- Los sitemaps son hoy la mejor fuente de descubrimiento público, pero el conteo y las familias de URLs pueden cambiar rápido.
- El blog es lo bastante grande como para requerir monitoreo de estructura antes de automatizar a escala.
- Parte de la política `robots.txt` es administrada por Cloudflare, así que puede cambiar sin que cambie el contenido visible.

Bajo:

- Páginas estáticas como `/como-funciona`, `/herramientas`, `/foro`, `/bonos` y `/mundial-2026` devuelven HTML público estándar y son seguras para inventario manual.

## Ruta de implementación

Toda implementación estable debe quedarse dentro de `gana-v8`:

1. `packages/source-connectors`: captura cruda de HTML/XML público con allow-list y guarda de robots.
2. `apps/ingestion-worker`: ejecución programada en sandbox y lineage.
3. `packages/canonical-pipeline`: snapshots y diffs deterministas de superficies públicas.
4. `apps/research-worker`: síntesis de observaciones verificadas, separación de hipótesis y recomendaciones por owner.

No crear un crawler desconectado fuera de `gana-v8`.

## Próximas acciones recomendadas

1. Mantener cualquier colección programada limitada a HTML/XML público hasta tener allow-list y guarda de robots.
2. Revisar `robots.txt` antes de promover una nueva familia de superficies desde inventario manual a automatización.
3. Implementar cualquier ruta estable mediante `source-connectors`, `ingestion-worker`, `canonical-pipeline` y `research-worker`.

## Fuente Notion

- `notion_id`: `390bea9e-4736-816e-84dd-feb2e737b733`
- `notion_title`: `J-93 Inventario de scraping y frontera pública`
- Export crudo: [j-93-inventario-de-scraping-y-frontera-publica--390bea9e.md](../notion-migration/exported/j-93-inventario-de-scraping-y-frontera-publica--390bea9e.md)
