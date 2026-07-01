---
source: notion_migration
owner: CMO
status: canonical
updated: 2026-07-01
notion_sources:
  - 38dbea9e-4736-81ef-9afc-c606d0d98776
  - 38dbea9e-4736-81a5-9fc5-c9664b6782a9
  - 38dbea9e-4736-8159-9bc1-d0560b5d9cb1
---

# Free-to-paid funnel

## Decision

El primer loop publico de gana-v9 debe abrir con picks de futbol gratis, Luis-reviewed, transparentes y con riesgo visible. La conversion paid ocurre despues de mostrar valor: alertas, board completo, timing, rationale mas profundo, recap y workflow guardado.

No se vende certeza. Se vende velocidad, orden, contexto y disciplina.

## Capas del funnel

| Capa | Valor | Conversion esperada | Guardrail |
| --- | --- | --- | --- |
| Publico gratis | Picks diarios, rationale corto, resultados visibles | Alert opt-in, DM, follow, return visit | +18, no guaranteed profit, risk note |
| Registrado | Saved picks, preferencias, alertas, historial personal | Retencion y personalizacion | No advice personalizado sin contexto de riesgo |
| Paid inicial | Private Board barato, acceso temprano, board completo, Luis notes | Trial/paid intent | Nunca prometer ganancias |
| Paid maduro | Review semanal, comunidad, watchlist, workflow guardado | Retencion paid | Mantener ledger publico y correcciones visibles |

## Superficies publicas

### Homepage / primera pantalla

- Marca Gana v9 visible.
- Promesa literal: picks diarios gratis de futbol.
- Cards de picks con liga, kickoff, equipos, mercado, seleccion, cuota de publicacion, tier, stake units y nota corta.
- CTA despues de valor visible: alerta diaria, DM `TRIAL`, Telegram/WhatsApp o waitlist paid.
- Disclaimer visible cerca de signup y footer.

### Feed de picks

- Vistas: hoy, proximos, live, terminados, resultados.
- Filtros: liga, mercado, tier, fecha, status.
- Tiers publicos: `Lean`, `Value`, `Prime`; explican conviccion relativa, no certeza.
- Cada pick debe tener timestamp, cuota de publicacion, rationale y riesgo principal.

### Resultados / trust layer

- Ledger append-only: no borrar picks perdidos.
- Estados: pending, won, lost, void, corrected.
- Correcciones con nota visible.
- ROI/profit claims solo con sample size y reglas documentadas.
- Resultados historicos separados de picks vivos.

## Lead capture

La captura se pide despues de entregar valor:

- Pick card detail -> alerta diaria.
- Resultados/historial -> seguir recaps.
- X/TikTok -> DM `TRIAL` o keyword equivalente.
- SEO/FAQ -> email/alert opt-in.
- Paid intent -> Private Board cuando el loop gratis tenga recibos publicos.

## Metricas minimas

- Public picks: unique visitors, pick-card impressions, pick-detail CTR.
- Alerts: alert opt-in conversion, unsubscribe/stop flow.
- Social: post URL, views, replies, saves, clicks, DMs, paid-intent count.
- Trust: picks publicados, settled picks, wins/losses/voids, correction count, settlement latency.
- Paid readiness: trial requests, known conversions, follow-up status.

El contrato detallado vive en [free-to-paid-measurement-contract.md](free-to-paid-measurement-contract.md).

## Compliance comercial

Texto minimo obligatorio:

```text
18+ only. Picks are informational and are not a guarantee of profit. Bet responsibly and only where legal.
```

No usar:

- `seguro`
- `garantizado`
- `dinero facil`
- `profit guaranteed`
- backfilled results como si fueran picks vivos
- competitor copy, brand assets, UI clone, private endpoints o scraping fuera de frontera publica

## Fuentes historicas

- Raw export: `docs/notion-migration/exported/j-54-gana-v9-public-picks-funnel-blueprint--38dbea9e.md`
- Raw export: `docs/notion-migration/exported/gana-v9-02-growth-y-contenido-indice-operativo--38dbea9e.md`
- Raw export: `docs/notion-migration/exported/j-64-cmo-review-differentiation-originality-and-18-language--38dbea9e.md`
