---
source: notion_migration
owner: CMO
status: canonical
updated: 2026-07-01
notion_sources:
  - 34cbea9e-4736-8112-bc4a-d0221e29b872
  - 34cbea9e-4736-81b0-a871-000b0c07aea9
  - 38dbea9e-4736-81e1-846a-fb8acba701f2
  - 38dbea9e-4736-814c-b2ea-fd584edbd4fa
  - 38dbea9e-4736-81b6-9c2d-df5f7ccde1bb
  - 38dbea9e-4736-81a1-9dcc-c00867bb6fb6
  - 38dbea9e-4736-811e-9905-fac3db037b15
  - 390bea9e-4736-8124-91bd-db3c6383c77c
migration_issues:
  - J-107
  - J-109
---

# Sprint diario X/TikTok de picks

## Decision

El sprint diario convierte picks aprobados en un paquete de distribucion, no en posts sueltos. Cada dia debe tener:

- 3-5 picks priorizados.
- 1 CTA principal.
- 2 posts centrales para X.
- 1 TikTok/Reel solo si hay un hook simple.
- Scorecard de aprendizaje antes del cierre.

## Inputs obligatorios antes de publicar

Antes de las `09:00` hora local:

- owner del paquete de picks;
- 3-5 picks con mercado, cuota, confidence tier, tesis de 1-2 lineas y riesgo principal;
- destino paid o confirmacion del default `DM "TRIAL"`;
- canal owner o ruta de publicacion confirmada;
- confirmacion de que el pick no esta despues del kickoff.

Si falta cualquiera de estos puntos, se bloquea el dia. No se publica contenido generico de apuestas.

## Cadencia diaria

| Hora | Accion | Salida |
| --- | --- | --- |
| 08:00-09:00 | Recibir picks aprobados | shortlist A/B/C con tesis y riesgo |
| 09:00-10:00 | Empaquetar narrativas | 2 posts X + 1 script corto |
| 12:00-13:00 | Publicar primera ola | pick/angle principal + CTA |
| 16:00-17:00 | Publicar segunda ola | tesis, ajuste o recap |
| 21:00 | Cierre | scorecard y aprendizaje |

## Calendario editorial migrado

El calendario J-36 queda como plantilla de cadencia, no como prueba de publicaciones reales. Cada fila requiere feed fresco, owner, canal y tracking antes de ejecutarse.

| Dia | Etapa | Angulo | Formatos | KPI foco | CTA |
| --- | --- | --- | --- | --- | --- |
| D1 | Attract | Autoridad: 1 pick fuerte | X, TikTok/Reel, pick destacado | Replies/DMs | DM `TRIAL` para resto del card |
| D2 | Engage | Contrarian: consenso vs valor | X, thread | CTR | Pedir card completo con la lectura no consensual |
| D3 | Engage | Ranking de confianza | Thread, resumen | CTR | Version paid con staking y timing antes del kickoff |
| D4 | Retain | Accountability publica | X, TikTok/Reel, resumen | Trust retention | Seguir update diario o entrar al canal paid |
| D5 | Convert | Jornada grande con urgencia | X, TikTok/Reel, pick destacado | Conversion | Entrar al paid barato antes del kickoff principal |
| D6 | Attract | Educacion rapida | X, TikTok/Reel | Reach | Seguir la serie diaria y pedir board en jornada fuerte |
| D7 | Convert | Card por tiers | X, thread | Conversion | Desbloquear card entero con staking sugerido |
| D8 | Retain | Recap de confianza | X, resumen | Trust retention | Seguir el diario por proceso, no solo resultado |
| D9 | Attract | Rivalidad o partido grande | X, TikTok/Reel, pick destacado | Reach | Ver lectura completa antes de ajuste de mercado |
| D10 | Engage | Underdog value | X, thread | Replies/DMs | DM para spots no obvios |
| D11 | Engage | Noticia/lesion con criterio | X, TikTok/Reel | Replies/DMs | Seguir canal para movimientos de ultima hora |
| D12 | Convert | Alto volumen, seleccionar | X, TikTok/Reel, thread | CTR | Paid para lista completa y orden de stakes |
| D13 | Convert | Prueba social ligera | X, resumen | Conversion | Tanda semanal de pago barata |
| D14 | Retain | Cierre de sprint | X, TikTok/Reel, resumen | Conversion | Siguiente ciclo de picks diarios pagos |

El reinicio J-40 de cinco dias se conserva como plantilla activa para retomar operacion:

| Fecha plantilla | Dia | Objetivo | Hook base | Lectura de cierre |
| --- | --- | --- | --- | --- |
| 2026-06-29 | D1 | Dos picks claros y CTA unica | `Hoy no van 8 picks al aire. Solo los 2 spots mas claros.` | DMs, replies y calidad de preguntas. |
| 2026-06-30 | D2 | Contrarian con tesis corta | `Todos miran una cosa. Nosotros otra.` | CTR, desacuerdo util y clicks hacia paid. |
| 2026-07-01 | D3 | Accountability y ajuste visible | `No vamos a vender una racha que no existe; hoy ajustamos el proceso antes de publicar.` | Follows, replies repetidos y senales de confianza. |
| 2026-07-02 | D4 | Jornada fuerte con urgencia | `Si hoy vas a mirar una sola card, tiene que ser corta y ordenada.` | DMs, conversion conocida y asset que cargo mejor la urgencia. |
| 2026-07-03 | D5 | Prueba social y decision de capacidad | `Lo que mejor funciono del sprint y lo que se corta.` | Recomendar si el loop sigue CMO-led temporalmente o necesita operador dedicado. |

## Formatos

### X

- Post 1: hook claro, 1-2 picks maximo, CTA unica.
- Post 2: tesis del pick principal, riesgo explicito, cierre al paid/DM.
- Reply opcional: line movement, noticia, kickoff reminder o aprendizaje.

### TikTok/Reel

- Hook en los primeros 2 segundos.
- 1 pick o 1 aprendizaje.
- 15-25 segundos.
- Riesgo dicho antes del CTA.
- No reciclar todos los picks; solo la idea mas clara.

## Scorecard

Registrar por asset:

```csv
date,trial_day,asset_id,channel,format,match_or_angle,hook,cta,paid_destination,publish_time,views,engagement,replies,saves,clicks,dms,known_conversions,result,learning
```

Dimensiones editoriales:

- Velocity: tiempo desde pick aprobado hasta publicacion.
- Clarity: si la audiencia entiende pick, tesis, riesgo y CTA.
- Trust: replies de calidad, repeat replies, follows, ausencia de confusion.
- Compliance: +18, no guarantees, no overclaiming.
- Engagement: views, replies, saves, shares, watch-through.
- Conversion: DMs, clicks, opt-ins, paid intent, conversion conocida.

## Backfill operativo

Registrar metricas en dos ventanas: primera lectura del dia y 24 horas despues. Las filas vacias se dejan vacias con razon, no se inventan numeros.

Campos minimos por asset:

- fecha local, canal, owner, post URL/ID y hora de publicacion;
- pick ID o identificador operativo, fixture, kickoff, mercado, seleccion y tier;
- formato: X post, thread, TikTok/Reel, resumen, pick destacado o paid CTA;
- CTA usada y UTM/etiqueta si existe;
- views, replies, likes, shares, saves/bookmarks, profile clicks, landing clicks y watch-through cuando el canal lo provea;
- DMs, keyword recibida, opt-ins daily-picks, opt-ins results, paid-intent count y estado de follow-up;
- resultado operativo: publicado, no publicado, corregido, bloqueado, fuera de ventana o pendiente;
- nota de compliance y cualquier correccion visible.

## Stop conditions

- No hay fresh feed o owner de picks.
- El pick ya paso kickoff.
- Falta riesgo principal.
- Falta acceso/canal de publicacion.
- La pieza sugiere certeza o profit garantizado.
- Se intenta usar anchors antiguos como advice vivo.

## Estado operativo al migrar

El sprint J-40/J-48 dejo paquetes preparados, pero no prueba por si mismo publicacion externa. Para tratar una pieza como publicada debe existir URL/post ID y ventana de lectura de metricas.

La regla vigente para D3 2026-07-01 fue: mantener Drafting hasta confirmar picks frescos y ruta de ejecucion.

## Fuentes historicas

- Raw export: `docs/notion-migration/exported/j-36-calendario-x-tiktok-free-to-paid-funnel--34cbea9e.md`
- Raw export: `docs/notion-migration/exported/untitled--34cbea9e.md`
- Raw export: `docs/notion-migration/exported/j-40-d1-reinicio-2-picks-claros-cta-unica--38dbea9e.md`
- Raw export: `docs/notion-migration/exported/j-40-d2-pick-contrarian-con-tesis-corta--38dbea9e.md`
- Raw export: `docs/notion-migration/exported/j-40-d3-accountability-publica-y-ajuste-visible--38dbea9e.md`
- Raw export: `docs/notion-migration/exported/j-40-d4-jornada-fuerte-con-urgencia-y-orden-de-confianza--38dbea9e.md`
- Raw export: `docs/notion-migration/exported/j-40-d5-cierre-con-prueba-social-y-decision-de-capacidad--38dbea9e.md`
- Raw export: `docs/notion-migration/exported/j-89-handoff-de-notion-sprint-de-picks-diarios-flujo-x-tiktok-y-metricas-del-embudo--390bea9e.md`
