# Resultado de la mejora del flujo — 2026-09-22

## Estado verificable

La implementación está integrada y sus pruebas pasan. Tras la reanudación del
usuario se corrigieron cuotas, elegibilidad, ligas e historial deportivo omitido.
La suite actual pasa **734/734 tests**. La última ejecución real terminada (R6)
produjo **cero recomendaciones elegibles**. Recuperó las cuotas omitidas por el
proveedor y excluyó dos fixtures iniciados antes de research. El historial adicional
se integró después, en `3512790`; la comprobación de una publicación nueva sigue
pendiente.
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
inspección de la referencia; la tarea reportó su goal activado. El desarrollo y
su goal pertenecen a esa tarea; la publicación nueva
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
confirmar el cierre de R6. Un ensayo aislado de investigación Codex, sin writes DB
ni publicación, ya confirmó que el prompt recibió diez antecedentes por equipo;
su respuesta final y el E2E con el contexto nuevo siguen pendientes. El goal
permanece activo.
