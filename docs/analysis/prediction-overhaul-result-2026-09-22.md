# Resultado de la mejora del flujo — 2026-09-22

## Estado verificable

La implementación está integrada y sus pruebas pasan. La última ejecución real
terminó **sin recomendaciones elegibles**. No se presenta ese resultado como
entrega exitosa de picks. La comprobación de una publicación nueva sigue pendiente.
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

- Suite integrada: **707/707 tests**, 96 suites; TypeScript aprobado
- Notificador: **51/51**; syntax y diff check aprobados
- Certificación conserva los 16 checks internos. Digest final:
  `1aa8e49330218fb3b933ab83539a5b329b8ac1fb17a2b504ba1d46c54eb5cf9d`
- Histórico de 51 fechas publicadas: 162 picks únicos, 111 ganados, 49 perdidos,
  uno void y uno sin resolver; ROI plano −4.67% en los 161 con payout
- Subconjunto estricto con trazabilidad: 145 picks, ROI −6.51%. Se conservaron las
  exclusiones y diferencias legacy; no se inventó un backtest de rentabilidad
- Cinco fixtures publicados contrastados contra API real: 3 ganados y 2 perdidos,
  cinco liquidaciones coincidentes. Se identificó diferencia de marcador AET
  frente a 90 minutos en un partido, sin cambiar su liquidación under 3.5

Los tests focalizados se superponen con la suite y no deben sumarse como únicos.
No hubo migraciones, reescritura del historial ni cambios en permisos/RLS.

## Última ejecución real

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
de elegibles. El lock queda retryable hasta `2026-09-22T10:48:04.966Z`; no se fuerza
ni se borra después del cierre de R4.

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
