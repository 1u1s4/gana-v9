# Resultado de la mejora del flujo — 2026-09-22

## Resultado verificado

Los cambios están integrados en main. La suite final pasó **781/781 tests**, en
109 suites, y TypeScript. La ejecución real de la versión fija `ddff02d` completó
las nueve etapas técnicas con API y Codex/web reales. Produjo 60 candidatos:
56 bloqueados y cuatro en revisión; ninguno elegible para publicación automática.

El batch terminó `review-required`, con status diario `failed` y exit 1 del
wrapper por el resultado sin selecciones. El proveedor terminó correctamente.
No se presenta este resultado como entrega automática positiva ni como mejora
predictiva demostrada. La entrega manual que el usuario pidió después sí fue
confirmada por un GET individual de Discord, con confianza de evidencia del 44%
y el marcador «En revisión».

El repositorio privado del portal y su tarea posterior ya están creados y
despachados. El cierre no exige fabricar una selección: el contrato admite un
estado explícito sin picks cuando no se cumplen los controles.

## Cambios principales

- API: descubrimiento global paginado de ganadores estrictamente inferiores a
  1.10; cobertura de todas las casas para descubrir partidos, conservando la
  whitelist de selección. IDs, temporadas, presupuesto compartido, marcador
  reglamentario AET/PEN y recuperación alternativa de cuotas vacías corregidos
- Investigación: búsqueda web real y contexto estructurado, con historial por
  equipo separado por competición, temporada y localía; fuentes, snapshots y
  cutoff explícitos. Los faltantes se identifican por familia de mercado
- Scoring: probabilidad separada de confianza de evidencia; doble oportunidad
  coherente, EV sin bonificaciones y precios alternativos estrictos con ID propio,
  evidencia heredada y alcance exclusivo de low-odds-top
- Portfolio: perfiles de mercados diversos, diamante, exposición y partidos
  distintos; apuesta del día basada en mayor confianza elegible. Se conservan
  los bloqueos y el estado sin selección cuando corresponde
- Operación: ligas activas con refresh semanal y consideración diaria; fixtures
  pasados excluidos; finalización del run reservada al pipeline, incluso después
  de timeouts; publicación con guard de kickoff, lineage e idempotencia
- Discord: embeds concisos con partido, hora, pick, cuota, confianza y estado;
  paginación íntegra y registro de las selecciones efectivamente renderizadas

La última corrección, `ddff02d`, pide `page=1` explícitamente. La API real devolvía
8 páginas con la primera petición implícita y 9 con página explícita. La regresión
reproduce esa divergencia; se conservaron los guards, presupuestos y whitelist.
No se atribuye el comportamiento a una causa interna del proveedor no demostrada.

Detalle del barrido: [auditoría por componentes](repository-audit-2026-09-22.md).
La [bitácora](../planes/2026-09-22-prediction-overhaul-worklog.md) conserva intentos,
correcciones, resultados anteriores y la revisión del criterio de cierre.

## Ejecución real final

Fecha analizada: **23/09/2026**, America/Guatemala.
Batch: `daily-2026-09-23-corrected`.
Provider: `6c10e587-b190-4722-b234-3ce80d07d28a`.
Código: `ddff02d857dda2338a0fc1699de6c5e2167f29e4`.
Inicio: 22/09 17:56:21 UTC; wrapper terminal: 18:22:47 UTC.

| Verificador | Resultado |
| --- | --- |
| Código fijo | 379 archivos del manifest sin cambios entre preflight, checkout ejecutado y main |
| API global de cuotas | 9/9 páginas, 84 fixtures resueltos, sin faltantes del scan |
| Low odds <1.10 | 43 quotes de ocho fixtures; los ocho tuvieron investigación y scoring |
| Selección de partidos | 19 encuentros futuros, sin recorte por cupo; seis añadidos por low odds |
| Registro semanal | 48 ligas, actualizado el 22/09; vencimiento 29/09 |
| Ligas requeridas | 11 fixtures seleccionados e intentados; ocho con predicciones, tres sin cuotas |
| Investigación | 19 bundles en revisión, 57 fuentes web, 95 fuentes históricas y 81 evidencias históricas enlazadas |
| Scoring | 60 candidatos: 56 blocked, cuatro review-required, cero promocionables |
| Probabilidad y EV | Nueve probabilidades numéricas, 51 ausentes; nueve EV correctos, tres positivos; confianza máxima 0.46 |
| Portfolio | Nueve familias, cuatro enfoques diarios y 36 requeridos bloqueados; cero recomendaciones y targets |
| Apuesta del día | `no-eligible-pick`, sin reconstruir ni forzar una selección |
| Persistencia | DB READ ONLY: dos runs, nueve tareas succeeded, 19 bundles, 60 predicciones, un parlay blocked sin piernas, cero publicaciones |
| Integridad de DB | 360 comprobaciones verdaderas, ninguna falsa; los 60 IDs/precios/estados y referencias coinciden con artifacts |
| Notificación | Dry-run correcto; alerta operativa confirmada por GET, sin recomendación automática nueva |

Siete de los ocho ganadores low odds ya tenían precio estricto en scoring. El
restante tenía únicamente Bet365 1.11 en el snapshot exacto consultado en DB;
los cinco hits estrictos del scan provenían de otras casas y otra observación.
No se generaron variantes en esta corrida. La derivación de precios alternativos
reales 1.07/1.09 está cubierta por el replay y la transacción reversible previos;
no se confunde esa prueba con su publicación.

Las tres requeridas sin predicciones son 1638334, 1640760 y 1559612: fueron
seleccionadas y evaluadas, pero sus snapshots no tenían cuotas. Otro encuentro
no requerido también quedó sin cuotas. Además, el directorio aislado tenía
`validationFreshness: empty`, un gate adicional. Ningún candidato era elegible
independientemente de ese gate; no se modificó para obtener un resultado favorable.

La [alerta del cierre](https://discord.com/channels/1494071161934450890/1510041125614915756/1552022368707289149)
fue confirmada por GET. Es evidencia operativa; no se cuenta como entrega de picks.

## Entrega manual solicitada

[Mensaje confirmado en Discord](https://discord.com/channels/1494071161934450890/1510040973218939022/1552008878391033969):
Korea DPR U20 W vs Colombia U20 W, 23/09 a las 10:30 de Guatemala,
**ambos anotan: no**, cuota registrada **1.40**, confianza de evidencia **44%**,
**En revisión**. Se eligió del resultado disponible cuando el usuario lo pidió.
La probabilidad del modelo 0.78 no se presentó como confianza.

Un solo envío mediante el notificador canónico, con payload preparado y hashes.
El GET de las 17:29 UTC confirmó títulos y descripciones idénticos al preview.
No cambió el artifact operativo, el estado del candidato ni el ledger diario.
No se repitió el envío durante el E2E final.

## Pruebas y retrospectiva

- `pnpm test`: **781/781**, 109 suites; `pnpm typecheck`: aprobado
- Corrección final de paginación: 30/30 pruebas focalizadas y revisión independiente
- Canary API de paginación: 9/9 páginas, 84 fixtures, 14 consultas, sin writes DB
- Replay de precios: siete generales conservadas y dos variantes reales, bloqueadas
- Canary DB reversible: serialización/IDs/precios y exclusión por estado verificados;
  rollback confirmado con cero filas de prueba restantes
- Auditorías finales: 24 comprobaciones low odds y 20 de portfolio, sin contradicciones;
  referencias, tiempos, edge y EV comprobados; dry-run del artifact final aprobado

Los tests focalizados se superponen con la suite y no se suman como únicos.
La primera suite en un path de `.codex` fue rechazada por cuatro pruebas de
protección de rutas; pasó completa en un checkout neutral del mismo commit,
sin modificar esas protecciones.

La retrospectiva comprende 162 picks realmente publicados en 51 fechas:
111 ganados, 49 perdidos, un void y uno pendiente. ROI plano **−4.67%** sobre
161 pagos conocidos; cohorte de 145 con hashes: **−6.51%**. Cinco selecciones de
cuatro recomendaciones publicadas se contrastaron contra la API: cinco
liquidaciones coincidentes y una diferencia de marcador AET ya documentada.
No se ajustaron umbrales usando los resultados futuros ni se afirma rentabilidad
mejorada. [Retrospectiva completa](published-portfolio-2026-09-22.md).

## Evidencia y límites

Paquete final local:
`.artifacts/gana-v9/audits/2026-09-22/final-corrected-e2e/`.
Incluye manifest, estado terminal, investigación/scoring, low odds, portfolio,
DB READ ONLY, comparación local/DB, dry-run, GET de alerta y limpieza del checkout.
Los artifacts de la corrida permanecen en
`.artifacts/gana-v9/final-corrected-e2e-2026-09-23/`.
El envío manual está en `audits/2026-09-22/manual-review-dbebd9e5/`.
[Índice verificable con hashes](prediction-overhaul-verification-2026-09-22.json).

La ruta positiva de publicación automática y ledger de esta versión no se
observó en vivo porque no hubo seleccionables. La prueba manual verifica el
contenido autorizado y el transporte. No se certifica una combinación elegible
>=1.20, una variante publicada ni mejora de rendimiento futuro. Los hashes de
proveedor se comprobaron como referencias almacenadas; no se recalcularon todos
los payloads crudos. No hubo migraciones, reescritura histórica ni cambios de RLS.

## Portal posterior

Repositorio privado [gana-picks-web](https://github.com/1u1s4/gana-picks-web).
Tarea **Portal público de fútbol de Gana**, `01a0c854-a360-7c42-8feb-df1bcff6be7c`,
creada y despachada con objetivo propio. La tarea reportó main `0136341`, 28 pruebas
y build aprobados, sin deployment; no se presenta como recertificación del padre.
El requisito de esta tarea era crear y despachar el trabajo posterior.
[Handoff](../planes/2026-09-22-public-picks-web-handoff.md).
