# Resultado de la mejora del flujo — 2026-09-22

## Estado verificable

La implementación está integrada y sus pruebas pasan. Tras la reanudación del
usuario se corrigieron cuotas, elegibilidad, ligas e historial deportivo omitido.
La suite actual pasa **780/780 tests**. R7 y el cron habitual del 23/09 terminaron
con **cero recomendaciones elegibles**. Las 39 investigaciones de R7 usaron el
historial adicional y se verificaron sus fuentes persistidas. Se integró después
una corrección del ciclo de vida del run y otra para conservar alternativas reales
de cuota para low odds. Esta última corrección tiene pruebas, replay local y
verificación transaccional de persistencia y exclusión en DB;
siguen pendientes su verificación live completa y una publicación nueva elegible.
Tras integrar y subir las mejoras se creó el repositorio privado del portal y se
despachó su tarea separada; ese avance no sustituye la prueba de entrega pendiente.

## Cambios principales

- API: scan global paginado de ganadores estrictamente inferiores a 1.10, cuotas
  de todas las casas para cobertura, IDs y temporadas correctos, presupuesto
  compartido, marcador reglamentario en AET/PEN, estadísticas e historial con corte
- Research: búsqueda web real, fuentes trazables, muestras y rivales anteriores,
  separación de tiempos de captura y cutoff; faltantes aislados por mercado
- Scoring: estimación de probabilidad separada de confianza de evidencia y
  calibración posterior; doble oportunidad con masa total 2 y EV sin bonificaciones
- Portfolio: perfiles diversos, diamante, low odds con partidos distintos,
  apuesta del día trazable; candidatos bloqueados no se convierten en fallback
- Operación: ligas activas actualizadas semanalmente, cobertura diaria, feedback
  de publicaciones previas exactas, cron corregido, guard de kickoff y ledger
- Discord: embeds concisos, paginación íntegra y sólo selecciones renderizadas

Detalle del barrido: [auditoría](repository-audit-2026-09-22.md).
Retrospectiva: [portfolio publicado](published-portfolio-2026-09-22.md).

## Pruebas y retrospectiva

- Suite integrada inicial: **707/707 tests**, 96 suites; TypeScript aprobado
- Suite tras las tres correcciones de la reanudación: **719/719 tests**, 97 suites;
  TypeScript aprobado
- Suite con historial adicional por equipo: **734/734 tests**, 98 suites;
  TypeScript aprobado, sin cambios en permisos o gates
- Suite con control del ciclo de vida y diagnóstico preciso de cobertura:
  **761/761 tests**, 104 suites; TypeScript aprobado
- Suite con alternativas estrictas de precio, exposición y cohortes corregidas:
  **780/780 tests**, 109 suites; TypeScript aprobado en main
- Notificador: **51/51**; syntax y diff check aprobados
- Certificación conserva los 16 checks internos. Digest actual tras incorporar el
  prompt de historial por equipo:
  `f33cb605967076fac57fa2afd8b65a73ce7f42a3f1e15fc9f2dc6d6fc75d1c6c`
- Histórico de 51 fechas publicadas: 162 picks únicos, 111 ganados, 49 perdidos,
  uno void y uno sin resolver; ROI plano −4.67% en los 161 con payout
- Subconjunto estricto con trazabilidad: 145 picks, ROI −6.51%. Se conservaron las
  exclusiones y diferencias legacy; no se inventó un backtest de rentabilidad
- Cinco fixtures publicados contrastados contra API real: 3 ganados y 2 perdidos,
  cinco liquidaciones coincidentes. Se identificó diferencia de marcador AET
  frente a 90 minutos en un partido, sin cambiar su liquidación under 3.5

Los tests focalizados se superponen con la suite y no deben sumarse como únicos.
No hubo migraciones, reescritura del historial ni cambios en permisos/RLS.

## Evidencia de R4, anterior a la reanudación

Batch `daily-2026-09-22-r4`; provider
`8ab12f1a-773c-48c1-803f-ef50fef97ab7`; 08:31:44–08:48:03 UTC.
Astra medium, web live, concurrencia 1, ligas auto, portfolio-v2 y umbral 1.10.

| Verificador | Resultado |
| --- | --- |
| Scan global low odds | 115 fixtures, 12/12 páginas, cero faltantes/errores |
| Favoritos inferiores a 1.10 | Tres quotes de un solo fixture; no hay combinada de dos o más partidos distintos |
| Alcance investigado | Cinco fixtures de presets/ligas más un favorito adicional; sin recorte por cupo |
| Ligas semanales | 45 requeridas; dos fixtures obligatorios, ambos Colombia 239, cubiertos; cero faltantes |
| Investigación | Seis bundles, 20 URLs reales; cuatro snapshots históricos con 297/12/315/86 partidos |
| Research habilitado | Un fixture con evidencia suficiente; cinco requieren revisión por faltantes deportivos |
| Scoring | 17 candidatos: 11 bloqueados, seis para revisión, cero publicables |
| Probabilidades | 11 estimaciones numéricas; seis ausentes por evidencia/semántica insuficiente |
| Portfolio y apuesta del día | Cero recomendaciones/targets; `no-eligible-pick` |
| Publicaciones DB | Cero filas para R4 y cero publicaciones para la fecha, consultado 08:50:58 UTC |
| Discord | Alerta operativa confirmada por GET; ninguna recomendación nueva |

La separación de etapas funciona: Dumbrăvița–Reșița pasó research. En scoring,
ganador visitante p=0.55 y doble oportunidad p=0.80 tienen edge negativo. Under
2.5 tiene p=0.53 y edge positivo, pero confianza 0.46 por muestras locales de
cuatro y tres partidos con señales contradictorias. No se modificaron gates para
publicar. En Santa Fe, doble oportunidad p=0.78 a cuota 1.28 tiene EV −0.0016,
aunque supere el benchmark sin margen; también fue rechazada.

La [alerta real de R4](https://discord.com/channels/1494071161934450890/1510041125614915756/1551877737365635194)
se recibió a las 08:48:05 UTC. Es una alerta de revisión, no una recomendación.
El GET de mensajes del 18/09 sólo verificó publicaciones históricas. El guard nuevo
rechazó sus fixtures terminados antes de reservar o enviar.

## Evidencia local

- `.artifacts/gana-v9/cron/daily-2026-09-22-r4-outcome.json`
- `.artifacts/gana-v9/runs/daily-2026-09-22-r4/daily-e2e-summary.json`
- `.artifacts/gana-v9/runs/8ab12f1a-773c-48c1-803f-ef50fef97ab7/scoring-results.json`
- `.artifacts/gana-v9/audits/2026-09-22/r4-scoring-summary.json`
- `.artifacts/gana-v9/audits/2026-09-22/r4-publication-db-proof.json`
- `.artifacts/gana-v9/audits/2026-09-22/discord-readback-r4-alerts.jsonl`
- `.artifacts/gana-v9/audits/2026-09-22/publication-guard-history-proof.json`
- `/tmp/gana-overhaul-r4-preflight.log`
- `/tmp/gana-overhaul-notifier-final.log`

## Pendiente real

Falta una publicación elegible nueva para verificar completamente la entrega.
Repetir inmediatamente el mismo slate sin evidencia nueva no resuelve la ausencia
de elegibles. Los nuevos intentos posteriores a R4 se justificaron con datos
actualizados o fallos reproducidos y corregidos; se archivaron sus locks sólo
después de comprobar el cierre y la ausencia de publicaciones.

Se consultó al usuario si prefiere cerrar hoy con un resumen explícito sin picks
y continuar el portal, o conservar la entrega pendiente para un reintento posterior.
Sin respuesta, no se asume ese cambio del criterio de cierre ni se envía otro mensaje.
El trabajo independiente del portal, ya autorizado, se inició tras terminar las
mejoras y su E2E: repositorio privado https://github.com/1u1s4/gana-picks-web,
commit inicial `d884011`, objetivo e integración documentados y tarea nueva dentro
de gana-v9: **Portal público de fútbol de Gana**,
`01a0c854-a360-7c42-8feb-df1bcff6be7c`. `wait_threads` confirmó ejecución activa e
inspección de la referencia inicialmente; posteriormente confirmó la tarea
terminada. La tarea reportó su portal en main `0136341`, 28 pruebas y build
aprobados, sin deployment. Es un resultado reportado por esa tarea, no una
verificación independiente del padre. El desarrollo y su goal pertenecen a esa
tarea; la publicación nueva
permanece pendiente en el goal principal. Handoff:
`docs/planes/2026-09-22-public-picks-web-handoff.md`.

Las validaciones históricas AET/PEN y la semántica temporal de corners conservan
los límites documentados en la auditoría; no se afirma reparación retroactiva global.

El control del 22/09 a las 08:59:59 UTC volvió a confirmar cero publicaciones y
ningún proceso E2E vivo. La misma ausencia de elegibles se constató durante tres
turnos consecutivos, habiendo completado el trabajo independiente del portal.
En ese momento se marcó el goal principal bloqueado por la prueba de entrega
pendiente. El usuario lo reanudó después; el estado actual es **active**, sin
reducir el objetivo ni presentar la alerta como publicación de recomendaciones.

## Reanudación y correcciones posteriores

El usuario pidió desbloquear y el goal volvió a active. Se siguió una ejecución
real ya viva desde las 13:54 UTC, sin duplicarla: provider
`92913ab7-5704-4a30-b72e-2f46c9c06e09`, batch `daily-2026-09-22-full` reutilizado.
Terminó a las 14:12 UTC con 32 candidatos y cero elegibles. Se comprobó el startedAt
nuevo para no confundir los artifacts previos del mismo batch con esta ejecución.

Los datos nuevos permitieron reproducir y corregir tres faltantes:

- Excluir fixtures live o con kickoff pasado antes de investigación, conservando
  cobertura global y los modos históricos explícitos. Se evita gastar análisis
  en candidatos que el guard de publicación acabaría bloqueando
- Incluir Champions femenina en ligas importantes. Refresh real actual: 49 ligas
- Recuperar cuotas mediante una consulta fresca por liga/temporada/fecha cuando
  el endpoint por fixture devuelve vacío exitoso. Se reproduce con Arsenal–Køge:
  la consulta alternativa actual devuelve cuotas que la consulta por ID omite

Canary del provider corregido: 63 cuotas seleccionables, cinco mercados y nueve
casas de referencia; IDs, hash y fecha de captura conservados, sin writes de DB.
Suite integrada posterior: **719/719 tests**, TypeScript aprobado. Las correcciones
se subieron a main en `a4383af`; no se rebajaron gates ni se inventaron picks.

## R6 terminado

Batch `daily-2026-09-22-r6`, provider
`c63ea500-d40b-4351-9c22-23d4d5824dce`, inicio `2026-09-22T14:25:56.456Z`.

- Registro semanal actualizado: 49 ligas; 37 fixtures primarios, 34 de ligas
  obligatorias antes de evaluar el kickoff, sin recorte por cupo
- Scan global completo: 127 fixtures, 13/13 páginas, 27 quotes ganadoras <1.10
  en seis fixtures, cero errores o fixtures faltantes en la cobertura del scan
- Unión de 41 fixtures; a las 14:30:30 UTC se excluyeron Namibia U20–Seychelles U20
  (live, kickoff 13:00) y Dumbrăviţa–Reşiţa (kickoff 14:30, aún marcado scheduled)
- 39 fixtures enviados a investigación, sin cap. Arsenal–Køge tiene 63 cuotas
  seleccionables en cinco mercados en el artifact real de odds

Terminó a las 15:09:29 UTC; wrapper cerrado a las 15:09:30, sesión terminal con
exit1 y las nueve tareas técnicas succeeded. Resultado final:

- Research39/39 para revisión, búsqueda nativa y 135 referencias web reales
- Scoring126 candidatos:117 bloqueados,9 para revisión,0 publicables. Doce
  probabilidades numéricas; siete EV positivos con confianza de evidencia0.30–0.45
- Arsenal produjo cinco candidatos con quoteIDs persistidos y el mismo snapshot
  usado en research. No hubo referencias de bundles/evidencias/claims inválidas
  ni diferencias de snapshot en los126 candidatos; no se afirma haber recalculado
  todos los hashes desde los payloads crudos
- Cobertura obligatoria25/34 con predicciones. Los nueve restantes carecen de
  cuotas en el artifact; IDs/temporadas coinciden y no hubo recorte por cupo
- Cero recomendaciones, targets, combinadas elegidas o apuesta del día
- DB READ ONLY a las15:11:25 UTC: cero publicaciones para fecha/batch/provider.
  `audits/2026-09-22/r6-publication-db-proof.json`

R6 prueba las correcciones operativas previas, pero no constituye una entrega
exitosa ni incluye el historial por equipo incorporado después.

## Historial adicional integrado después de R6

Research de R6 terminó con 39 bundles para revisión y 135 referencias web. Se
comprobó otro faltante: la API ofrece resultados recientes de los mismos equipos
en otras competiciones, pero el contexto sólo suministraba la copa objetivo.

La corrección aislada agrega consultas por equipo, temporadas y rango temporal,
con fuentes individuales y diez resultados recientes separados por competición,
temporada y localía. Mantiene aparte el historial de liga y no mezcla amistosos o
etiquetas juveniles como muestras adultas equivalentes. No modifica gates.

Canary integrado real: Arsenal13 y Køge20 resultados reglamentarios disponibles,
diez recientes de cada uno; cuatro requests, cobertura completa, cero writes DB.
734/734 tests y TypeScript pasan en una copia verificada fuera de `.codex`, cuya
protección de rutas causaba cuatro rechazos en el primer worktree. Se conservó esa
protección sin modificarla. Dos revisiones independientes no encontraron P1/P2.

El código se integró por fast-forward y se subió a main en `3512790`, después de
confirmar el cierre de R6. El ensayo aislado de investigación Codex terminó a las
15:13:03 UTC, sin writes DB ni publicación. Recibió diez antecedentes por equipo
y los incorporó en tres evidencias y cinco claims. Las cuatro fuentes por
temporada tienen hashes iguales a las respuestas API capturadas; usó web nativa
con tres fuentes reales. Conservó review-required por disponibilidad, rotación y
comparabilidad, sin confundir falta de historia en la copa con falta de historia
del equipo. Los worktrees temporales de esta corrección fueron retirados.

El E2E R7 comenzó a las 15:16:07 UTC con main `a906659`, batch
`daily-2026-09-22-r7`, provider `5ccf8885-a1f8-454f-afbb-1551d1f63fd0`.
Scan: 127 fixtures, 13/13 páginas, 27 quotes ganadoras <1.10 en seis fixtures.
Se enviaron 39 encuentros futuros a investigación. R7 terminó a las 16:08:46.022
UTC; batch 16:09:01.689, wrapper 16:09:03.045, salida 1. Las nueve tareas técnicas
terminaron, pero la selección final requiere revisión. Resultado:

- Research: 39 bundles, 38 para revisión y Bayern–City habilitado. Los 39 citan
  historial nuevo: 156 fuentes, 114 evidencias vinculadas. Auditoría de 156
  snapshots y 1.242 filas, sin desvíos de identidad, temporada, fecha o estado
- Scoring: 133 candidatos, 117 bloqueados y 16 para revisión; 23 probabilidades
  numéricas y 12 retornos esperados positivos. Confianza de evidencia 0.30–0.42,
  por debajo del mínimo de promoción; cero candidatos publicables
- Bayern–City pudo estimar goles y BTTS después de incorporar historia. Over 2.5
  con p=0.68 y cuota 1.37 tiene retorno esperado −0.0684; BTTS con p=0.65 y cuota
  1.40 tiene −0.09. La habilitación de research no aseguró valor de apuesta
- Cobertura obligatoria: 34 fixtures con IDs y temporadas correctos; 25 tienen
  candidatos y nueve carecen de cuotas. Los nueve sí fueron seleccionados y
  tienen resultado de scoring bloqueado; no se omitieron del flujo
- Low odds: tras excluir Namibia terminado, cinco fixtures con 25 hits llegaron
  a análisis; cobertura 5/5, todos bloqueados por evidencia. Presupuesto deportivo
  404/10.000 requests; 39 investigaciones
- Cero recomendaciones, targets, combinadas elegidas o apuesta del día. Lectura
  DB READ ONLY a las 16:09:44 UTC: cero publicaciones para fecha, batch y provider
- GET confirmó la [alerta operativa de R7](https://discord.com/channels/1494071161934450890/1510041125614915756/1551988716845670493)
  a las 16:09:04 UTC. El último mensaje observado en recomendaciones sigue siendo
  del 18/09; esta alerta no constituye una entrega nueva de apuestas

Pruebas: `audits/2026-09-22/r7-research-scoring-proof.json`,
`audits/2026-09-22/r7-final-provider-low-odds-proof.json`,
`audits/r7-portfolio-proof.json`, `audits/2026-09-22/r7-publication-db-proof.json`
y los readbacks `discord-readback-r7-*.jsonl`. Los hashes almacenados del proveedor
se contrastaron con las referencias; no se recalcularon desde JSONB reordenado.

## Estado del run: corrección adicional integrada

Durante R7 se detectó que research, scoring, parlay y validación podían marcar
terminado el HarnessRun compartido antes del cierre real. Esto afectaba dashboard
y exportaciones; no se encontró que habilitara publicaciones bloqueadas.

El cambio aislado `506e18f` reserva la finalización al pipeline y conserva los
comandos standalone. Su contexto async también protege de hijos que escriben
después de un timeout. Pasó revisión independiente, 173 pruebas focalizadas,
**761/761 tests** de suite completa y TypeScript. Una transacción real con Prisma
confirmó ocho invariantes y se revirtió; la lectura posterior encontró cero filas
de prueba. La primera propuesta y su race detectada están documentadas.

Se integró a main por fast-forward en `506e18f` después de confirmar R7 terminal;
su ejecución pertenece al código anterior. El worktree temporal y su rama fueron
retirados tras comparar los 15 archivos probados con main. La suite volvió a pasar
en main después de precisar el mensaje de cobertura sin cambiar su gate. La
corrección low odds siguiente se integró después de su propia revisión.
Prueba de ciclo de vida:
`audits/2026-09-22/run-lifecycle-verification.json`.

## Alternativas estrictas de precio: corrección integrada

R7 permitió confirmar un hueco de integración: la compactación de cuotas para
scoring conserva sólo el mejor precio por selección, y puede omitir una alternativa
real menor a 1.10 que necesita el perfil estricto. En 1593593 estaba Bet365 away
1.07, omitida por Pinnacle 1.12; en 1602489 estaba Pinnacle home 1.09, omitida por
Bet365 1.11. Ambas eran seleccionables, del mismo snapshot y lado, dentro de la
whitelist. Los otros dos cruces provenían de casas excluidas, correctamente.

La corrección `32a527d` preserva el mejor precio general y deriva como máximo una
alternativa seleccionable del mismo fixture, snapshot y lado, estrictamente menor
a 1.10. Reutiliza la probabilidad, calibración y evidencia del evento; recalcula
retorno y controles de la cuota. Conserva los bloqueos del origen y rechaza un
retorno esperado ausente o no positivo. No vuelve a consultar al modelo.

La alternativa se persiste con ID propio y alcance `low-odds-top`. Las entradas
generales la excluyen antes del cupo de 500 candidatos y el fallback respeta su
alcance. Liquidación conserva su ID y precio; calibración y métricas generales
cuentan el evento una sola vez, mientras los targets publicados explícitos usan
la cuota efectivamente elegida. Si se valida sólo una variante, su liquidación
existe pero no aporta una observación estadística hasta validar el origen.

Revisión independiente sin hallazgos pendientes. Las 780 pruebas y TypeScript
pasaron tanto en el checkout aislado como en main; no hubo migración ni cambios
de whitelist, probabilidades, umbrales o gates para lograr una publicación.
Estos dos candidatos de R7 también estaban bloqueados por evidencia; conservar
sus precios no convierte la corrida en una entrega exitosa.

Replay local de las respuestas originales y snapshots exactos de R7: siete
predicciones generales coincidentes y dos variantes con las cuotas esperadas.
Ambas mantienen probabilidad ausente, confianza cero y bloqueos. La prueba no
repite el prompt completo ni verifica EV numérico positivo, selección diaria o
entrega. No hubo intentos de red ni persistencia real durante la ejecución final.
Paquete reproducible: `audits/2026-09-22/r7-low-odds-replay/README.md`; prueba:
`replay-variants-result.json`. El intento inicial inválido y su exposición de
credenciales en una salida de herramienta se documentaron sin reproducir valores;
corresponde rotar esas credenciales.

El cron habitual de mañana, `daily-2026-09-23-full`, inició a las 16:15:15 UTC y
terminó a las 16:40:51 con revisión requerida: 55 candidatos, 50 bloqueados,
cinco para revisión y cero recomendaciones/targets. Doce probabilidades numéricas;
tres EV positivos, todos del mismo fixture y con confianza 0.43–0.44. Los tres
fixtures obligatorios sin candidatos sí fueron seleccionados, pero no tenían
cuotas persistidas. Las nueve tareas técnicas terminaron.

Su estado inicial de main precede a `32a527d`; como hubo cambios mientras corría
y cargas posteriores, no se atribuye toda la ejecución a un único commit.
Ningún resultado de scoring contiene las variantes nuevas. La notificación figura
declarada en el artifact; no se hizo un GET ni consulta DB adicional. Este control
local no demuestra entrega. Prueba: `audits/2026-09-22/active-cron-2026-09-23-full.json`.

## Verificación transaccional de las variantes

A las 17:10:07 UTC se ejecutó una prueba acotada sobre un checkout fijo de
`d2bc5a5`, con 323 archivos verificados por hash. Reprodujo las dos respuestas
originales de R7 usando los repositorios productivos dentro de una transacción
real. Creó dos runs, nueve predicciones y tres filas de artifact con IDs nuevos.
La lectura por ID verificó las cuotas 1.07/1.09, sus snapshots, alcance, vínculo
al origen, evidencia, calibración y estado bloqueado. No actualizó datos existentes.

La consulta productiva de `low-odds-top` excluyó esas filas por su estado: cero
candidatos y cero parlays. Esto verifica el filtro previo al builder, no la ruta
positiva de selección. El rollback fue deliberado; una transacción READ ONLY
posterior encontró cero runs, predicciones, artifacts, parlays o piernas de prueba.
No hubo llamadas deportivas, web, Codex ni Discord. La configuración usa defaults
de la versión fija y overrides explícitos, con el entorno depurado; no reproduce
todas las variables históricas ni constituye un E2E live completo.

Prueba: `audits/2026-09-22/r7-low-odds-transaction/proof-5443a16b-2b63-4462-b9a2-35c4b322142a.json`.
El script ejecutado tiene SHA `3542f29b…`; una versión documental posterior sólo
agrega la limitación de configuración. No se repitió la transacción por ese texto.
