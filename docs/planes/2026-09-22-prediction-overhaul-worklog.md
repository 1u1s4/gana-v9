# Bitácora: mejora de predicciones

## Objetivo y estado

Objetivo original leído completo. El contrato está en
`docs/planes/2026-09-22-prediction-overhaul-goal.md`.
Goal integral activo, sin presupuesto solicitado. Skills utilizadas: ultragoal,
operaciones diarias, implementador de estrategia y notificador Discord.

El primer requisito quedó cumplido con `dbba137`, subido a `origin/main` después
de 17 pruebas focalizadas y TypeScript. Ese commit conserva los cambios previos
del usuario. Los cambios posteriores de esta tarea todavía no tienen commit final.

## Implementación integrada

- Low odds: ganador local o visitante estrictamente por debajo de 1.10; todas
  las páginas y casas del endpoint de fecha, sin sustituir empate o doble
  oportunidad. Cobertura, errores y ausencia de cuotas quedan explícitos
- Cartera: probabilidades reales separadas de confianza de evidencia; producto
  de probabilidades y ajustes conservadores, sin bonus ni resurrección de fuentes
  bloqueadas. Perfil low-odds de 2–4 partidos con cuota conjunta mínima 1.20;
  diamante, refinado, diversidad y apuesta del día con condiciones trazables
- Ligas: registro semanal de competiciones importantes activas, consultado antes
  del flujo diario. Discovery global por fecha y unión por liga/temporada;
  inventario previo al cupo evita declarar falsamente que no había partidos
- Evidencia: contexto equilibrado por mercado, URLs reales, claims respaldados,
  fuentes API canónicas y estadísticas de equipos con corte deportivo anterior
  al partido. Feedback de la última publicación realmente validada, sin fuga
  temporal ni ajuste de umbrales basado en muestras pequeñas
- Discord: contrato `concise-v1`, paginación completa, selección persistida de la
  apuesta del día y ledger alineado con lo renderizado. Se conserva el replay legacy
- Operación: ventana limitada para recuperar el día anterior; validación de goles
  de 90 minutos; presupuesto compartido; redacción conserva aliases sin confundir
  referencias compartidas con ciclos
- Publicación: consulta horarios y estados de fixtures en DB antes del preflight,
  reserva y envío. Bloquea partidos iniciados, no programados o sin metadata.
  Un bloqueo posterior a reserva queda durable como `send-blocked`

Las auditorías independientes se repartieron en API/low odds, investigación y
cartera/retrospectiva. La integración, ejecución real y publicación son del root.

## Evidencia de API e historial

- PostgreSQL/Supabase conectado, seis migraciones aplicadas y cero fallidas al inicio
- Registro semanal real: 45 competiciones activas; siete sin cobertura declarada
  de cuotas. Se consideran sus fixtures sin inventar precios
- Canary completo del 23/09: 13 fixtures, 216 quotes 1X2, 2/2 páginas, cero ganadores
  inferiores a 1.10. Fueron tres requests; artefacto en
  `.artifacts/gana-v9/audits/2026-09-22/low-odds-api-full-2026-09-23.json`
- Estadísticas reales: equipos 33/40, liga 39, cinco partidos cada uno, corte 21/09;
  dos requests. Artefacto `team-statistics-api-canary.json` del mismo directorio
- Retrospectiva publicada del 06/07 al 21/09: 51 fechas, 162 selecciones únicas,
  111 ganadas, 49 perdidas, una anulada y una sin resolver. ROI plano -4.67% sobre
  161 payouts; subconjunto de 145 con lineage estricto: -6.51%. No demuestra mejora
  causal ni sirve para prometer resultados
- Cross-check actual contra API: cinco requests, cinco fixtures publicados con
  hash verificado, cinco liquidaciones coincidentes. España–Argentina guardaba
  1–0 incluyendo prórroga; el resultado reglamentario era 0–0. Under 3.5 sigue
  ganado. No se modificaron liquidaciones históricas. Evidencia:
  `.artifacts/gana-v9/audits/published-result-api-2026-09-22.json`

## Primera ejecución real: R1

- Batch `daily-2026-09-22-full`, provider run
  `826b93f5-07a8-4978-abd1-ea0d51c5a86a`; empezó 07:33:07 UTC y terminó 07:43 UTC
- Codex Astra medium, búsqueda web live, ligas automáticas, umbral 1.10 y límites
  operativos del cron. Se analizaron seis fixtures sin recortes
- Low odds: 115 fixtures, 12/12 páginas, cero faltantes/errores. Tres cotizaciones
  inferiores a 1.10 del mismo fixture 1640457; no alcanza para una combinada
- Seis investigaciones con búsqueda nativa, 17 URLs y 12 fuentes de estadísticas
  con snapshot, hash y corte 21/09. El feedback publicado del 18/09 llegó al scoring
- Falló por tres causas verificables: se confundía inicio de ejecución con corte
  histórico; doble oportunidad se normalizaba con masa 1 en lugar de 2; la
  cobertura de casas se medía después de aplicar la whitelist de selección
- Resultado: 16 predicciones bloqueadas, cero recomendaciones. No hubo envío de
  recomendaciones. Consulta real del ledger del 22/09 confirmó cero filas
- Se conservaron todos los artifacts. El único lock fallido se archivó en
  `.artifacts/gana-v9/audits/2026-09-22/r1-retryable-lock.json` antes de retirarlo,
  una vez confirmados cero publicaciones y ausencia de procesos activos

## Correcciones verificadas antes de R2

- `researchTiming` separa inicio, captura de contexto y modo prematch/histórico.
  Los segundos de transporte no invalidan evidencia prematch; kickoff y reglas
  retrospectivas siguen siendo límites. 40 pruebas focalizadas y TypeScript
- Doble oportunidad: el caso real 1X a 1.28 pasa de probabilidad justa 0.369325 a
  0.738650. Mercados incompletos/incoherentes no reciben benchmark
- Consenso y cobertura usan todas las casas recibidas; las cotizaciones elegibles
  conservan la whitelist. El mínimo de tres casas permanece. 30 pruebas integradas
- Suite completa: 695/695, TypeScript aprobado. Notificador: 51/51. Syntax y diff
  limpios. Los grupos focalizados se superponen y no se suman como pruebas únicas
- Certificación: siete tests, 16 checks internos intactos. El snapshot contractual
  cambió por prompts versionados y serialización corregida, sin cambiar verificadores:
  `744de38c00c1a187f82007df0a2601eb095dab8a00fcba3d2c96342f7672a80f`
- Logs: `/tmp/gana-overhaul-r2-preflight.log`,
  `/tmp/gana-overhaul-notifier-final.log`,
  `/tmp/gana-overhaul-final-certification.log`

## Segunda ejecución real: R2 completada sin selecciones

- Inicio exacto: 2026-09-22T07:53:26.081Z
- Batch: `daily-2026-09-22-r2`
- Provider run: `49ccfc63-3b83-4df8-a60a-c4986c6bc5db`
- Sesión terminal: 25790; salida `/tmp/gana-overhaul-live-r2.log`
- Mismos parámetros reales de R1, con código corregido, snapshots nuevos y guard
  de publicación actualizado. Agentes revisan evidencia y matemáticas en modo lectura

- Terminó 08:03:38 UTC: cero recomendaciones y cero targets publicados. No hubo
  envío de recomendaciones; el lock quedó retryable y todavía no se retiró
- Verificación real: tres snapshots con 8–9 casas observadas, dos elegibles;
  probabilidades 1X2 suman 1 y doble oportunidad suma 2. El caso 1X a 1.28 tiene
  benchmark 0.741693 con ocho casas. Gates intactos
- Seis bundles con timing correcto, 19 URLs reales, búsqueda nativa en los seis,
  12 fuentes API completas y ninguna referencia rota. Desapareció el fallo temporal
- La revisión deportiva siguió siendo insuficiente: muestras pequeñas, falta de
  contexto de rivales y disponibilidad; dos fixtures sin cuotas. No se forzaron picks
- Revisión encontró un P2 de cobertura: Ligue 1 de Argelia (186) podía contarse
  como Francia (61) por el nombre. Portfolio corrige prioridad del ID sobre nombre

## Siguiente iteración: contexto deportivo adicional

Low_odds implementó una consulta cacheada de partidos completados por liga,
temporada y corte (`/fixtures`, FT/AET/PEN). Research integró los últimos diez
encuentros por equipo, condición local/visitante, rival, marcador reglamentario y
resumen descriptivo del rival. Todo se deriva de fechas anteriores al corte;
no se inventan rankings, calibración o probabilidades ni se rebajan gates.

- Provider: 18 tests y canary real de una consulta, 50 fixtures válidos de liga39
- Contexto/prompts: 45 tests de cutoff, prórroga, muestras y procedencia
- Cobertura: corregida prioridad del ID de liga; 37 tests focalizados
- Verificación integrada final: TypeScript y 706/706 pruebas aprobadas. Log:
  `/tmp/gana-overhaul-r3-preflight.log`
- Manifest actualizado por el nuevo contexto de investigación; los verificadores
  siguen intactos. Hash: `00af51c55ce5c4ebf01958399788ba107d408d4527fd8b507145b25e667b8ce7`

## Tercera ejecución real: R3 en curso

- Batch `daily-2026-09-22-r3`, inicio `2026-09-22T08:15:23.329Z`
- Sesión terminal 45162; salida `/tmp/gana-overhaul-live-r3.log`
- Lock fallido R2 archivado en `audits/2026-09-22/r2-retryable-lock.json` y retirado
  únicamente tras confirmar estado retryable y cero recomendaciones/envíos
- Mismos parámetros de R1/R2 con código final e historial deportivo nuevo

Pendiente: verificar resultado R3, selecciones y Discord real, registrar evidencia,
commit/push a main limpio y crear repositorio más tarea posterior del portal.
No marcar el goal completo antes de ello.


## Pruebas de entrega durante R3

- GET real de Discord confirmó los mensajes 1550589431226966164 y
  1550589437799305237 del 18/09 en canal 1510040973218939022,
  servidor 1494071161934450890. Esto prueba acceso y publicaciones históricas;
  no se presenta como entrega nueva. Evidencia:
  `audits/2026-09-22/discord-readback-2026-09-18.jsonl`
- Guard nuevo ejecutado en modo lectura contra DB real y artifact del 18/09:
  rechazó dos fixtures terminados con `publication-fixtures-not-upcoming:2`.
  No hubo reserva ni envío. Evidencia:
  `audits/2026-09-22/publication-guard-history-proof.json`
- Se consultó al usuario cómo cerrar hoy si R3 tampoco produce elegibles:
  resumen de ausencia en Discord y continuar portal, o mantener entrega pendiente
  y reintentar luego. La pregunta sigue pendiente; no asumir aprobación por tiempo.


## Cierre de R3 y aclaración del contrato

R3 terminó 08:25:27 UTC sin recomendaciones ni envíos. El historial sí llegó:
cuatro snapshots compartidos, ligas 239 (297 partidos), 771 (12), 666 (315) y
284 (86), todos con fechas, marcadores reglamentarios y procedencia. Los modelos
citaron los datos y la ausencia de muestras cuando correspondía.

La auditoría identificó una contradicción adicional: research justificaba reviews
por no haber establecido probabilidades/edge, que corresponden al scoring posterior.
Scoring pedía una estimación "calibrada" antes de la calibración del servicio, a la
vez que prohibía afirmar calibración sin muestra. Se aclararon ambos contratos:
research evalúa disponibilidad factual y scoring produce una estimación fundada
sin calibrar. No se modificaron gates, umbrales, calibradores o elegibilidad, ni se
promovió automáticamente ningún bundle anterior. Persisten posibles límites reales
que sólo una nueva ejecución puede distinguir. 46 tests focalizados y TypeScript
aprobaron; verificación integrada previa a R4 en curso.
