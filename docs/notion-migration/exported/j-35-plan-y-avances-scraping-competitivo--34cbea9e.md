---
source: notion
notion_id: 34cbea9e-4736-81a2-9df3-c28c78c3d2d4
notion_url: https://app.notion.com/p/J-35-Plan-y-avances-scraping-competitivo-34cbea9e473681a29df3c28c78c3d2d4
title: "J-35 - Plan y avances scraping competitivo"
---

# J-35 - Plan y avances scraping competitivo

Actualizacion operativa del workspace competitivo de Gambeta para que el plan y el progreso de scraping no queden solo en repo o comentarios.
## Refresh publico verificado - 2026-04-23
- Verificado en vivo desde superficies publicas: https://gambeta.ai/, /ranking, /blog/ y /robots.txt.
- La homepage sigue exponiendo pronosticos diarios, resultados, ranking, bankroll, sponsor promos, Bot de Alerta, CTAs de Telegram/X/YouTube y entrypoints de auth.
- robots.txt sigue marcando Content-Signal search=yes y ai-train=no, y mantiene /api/, ?openauth y ?returnTo fuera de alcance para crawling.
- Ranking y resultados siguen siendo visibles publicamente, pero la superficie es hydration-heavy y necesita mapeo asistido por browser antes de automatizacion estable.
## Estado de ejecucion
- J-25: done el 2026-04-21. Existe el slice seguro en gana-v8 para homepage y robots dentro de source-connectors y canonical-pipeline.
- J-26: done el 2026-04-22. El scraping publico seguro esta implementado para homepage mas robots; ingestion-worker y research-worker siguen pendientes de cableado.
- J-27: done con update UTC 2026-04-24. El repo local gambeta-WS ya esta disponible en este entorno para continuidad operacional.
Repos locales relevantes: gana-v8 -\> /Users/luisalvarado/.paperclip/instances/default/projects/00ad494d-2667-4734-8dae-7e4ccf421414/1a6d1f6a-c6b0-4e61-bcf5-ee05d1f77992/_default/repo \| gambeta-WS -\> /Users/luisalvarado/.paperclip/instances/default/projects/00ad494d-2667-4734-8dae-7e4ccf421414/1a6d1f6a-c6b0-4e61-bcf5-ee05d1f77992/_default/gambeta-WS
## Ruta estable recomendada
1. source-connectors: mantener solo capturas estables de HTML publico y robots policy state.
2. ingestion-worker: programar monitoreo solo despues de validar cadence, drift y policy gate.
3. canonical-pipeline: diffs deterministas para copy, links salientes, content-signal y estructura visible.
4. research-worker: convertir diffs verificados en inteligencia competitiva accionable para CTO, growth y producto.
## Riesgo de drift
- Homepage, promos y CTAs pueden rotar diariamente sin cambiar rutas.
- Ranking probablemente depende de hidratacion y puede cambiar estructura sin aviso.
- Handles de Telegram, dominios sponsor y precios del Bot de Alerta pueden variar sin estabilidad de esquema.
- Las hipotesis /api/ siguen siendo de alto riesgo por policy y no deben mezclarse con observaciones verificadas.
## Proximos pasos
1. Ejecutar un mapeo sandbox con browser en homepage, ranking y resultados para separar widgets http-direct vs browser-only.
2. Cablear el job ingest.public-surface.snapshot hacia ingestion-worker con namespace de lineage sandbox o research.
3. Persistir raw page bodies y robots text en almacenamiento append-only antes de programar monitoreo.
4. Extender source-connectors a blog y ranking solo cuando la validacion browser confirme una ruta publica estable.
