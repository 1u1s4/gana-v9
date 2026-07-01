---
source: notion_migration
owner: CMO
status: canonical
updated: 2026-07-01
notion_sources:
  - 38dbea9e-4736-81a5-9fc5-c9664b6782a9
  - 34cbea9e-4736-8131-b2e4-ff975aab0e2d
  - 34cbea9e-4736-8158-988c-d2a27beb9757
---

# Contrato de medicion free-to-paid

## Decision

El loop gratis solo puede escalar a paid cuando hay evidencia real de valor, confianza y conversion. La medicion debe servir decisiones de campana: que publicar, que CTA repetir, que cortar y si el Private Board merece mas presion comercial.

No se inventan metricas. Si no hay URL, post ID, feed fresco o lectura de canal, la fila queda vacia o bloqueada.

## Preguntas Que Debe Responder

- Que pick, formato o hook produjo atencion util?
- Que CTA produjo DMs, opt-ins, clicks o paid intent?
- Que pieza genero confianza repetible, no solo alcance?
- Que resultados se publicaron, liquidaron y explicaron sin editar historia?
- Que dato falta antes de escalar paid?

## Tablero Operativo

Una fila por asset o paquete diario:

```csv
date,campaign_day,pick_id,channel,post_url,format,hook,cta,owner,status,views,replies,saves,clicks,dms,opt_ins,paid_intent,known_conversion,learning,next_action
```

Campos obligatorios:

- `date`
- `campaign_day`
- `pick_id` o motivo de `no fresh pick`
- `channel`
- `post_url` o `no published URL`
- `format`
- `hook`
- `cta`
- `owner`
- `status`
- `learning`
- `next_action`

## Metricas Por Capa

### Canal

- X views.
- TikTok/Reels views.
- Engagement util.
- Saves/bookmarks.
- Replies/comments.
- DMs.
- Landing clicks.
- Profile clicks.
- URLs reales de posts.

### Leads y CRM

- `DM TRIAL`.
- Alert opt-ins.
- Results opt-ins.
- DM keyword count.
- Paid-intent count.
- Follow-up status.
- Compliance notes.
- Known conversion.

### Producto/Funnel

- Public picks page views.
- Pick-card impressions.
- Pick-detail opens.
- Alert opt-in conversion.
- Results page views.
- Results-to-alert conversion.
- Content-to-picks CTR.

### Trust Layer

- Picks publicados.
- Settled picks.
- Wins.
- Losses.
- Voids.
- Pending.
- Visible corrections.
- Settlement latency.
- Responsible-language coverage.

## Paid Readiness

No evaluar escala paid hasta que el loop gratis tenga:

- Pick antes del kickoff.
- Tesis breve y riesgo visible.
- Recap del resultado.
- Ledger append-only.
- Scorecard lleno.
- Senal atribuible de intent.

## Cadencia De Lectura

- 2h despues de publicar: primeras senales de canal y DMs.
- 24h despues: metricas iniciales finales y aprendizaje.
- Semanal: hook ganador, CTA vigente, formato a duplicar, formato a cortar y decision paid.

## Higiene

- No backfillear posts como si hubieran salido.
- No usar anchors antiguos como advice vivo.
- No copiar credenciales, tokens, URLs privadas sensibles ni datos personales innecesarios.
- No convertir resultados historicos en performance claims sin muestra y reglas.

## Fuentes Historicas

- Raw export: `docs/notion-migration/exported/gana-v9-02-growth-y-contenido-indice-operativo--38dbea9e.md`
- Raw export stub: `docs/notion-migration/exported/define-the-minimum-measurement-contract-for-free-to-paid-funnel-learning--34cbea9e.md`
- Raw export stub: `docs/notion-migration/exported/growth-content-tracking-and-approved-picks-feed--34cbea9e.md`
