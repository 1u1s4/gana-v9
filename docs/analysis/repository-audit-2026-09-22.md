# Auditoría del flujo de predicciones — 2026-09-22

Este barrido revisa superficies operativas y fallos reproducibles. No equivale a una certificación exhaustiva de todas las líneas del repositorio ni a una promesa de resultados deportivos. Las pruebas indicadas abajo se ejecutaron; los canaries deportivos fueron de lectura y no enviaron Discord ni reescribieron validaciones históricas.

## Hallazgos corregidos

| Superficie | Problema y cambio | Evidencia |
| --- | --- | --- |
| Detección low odds | El selector incluía doble oportunidad y aceptaba el límite por igualdad. Ahora selecciona únicamente ganador 1X2 local/visitante, precio finito mayor que 1 y estrictamente menor que el umbral; el umbral diario pasa a 1.10 en la integración principal | `src/filters/low-odds-selector.ts`, pruebas de 1.09, 1.10, valores inválidos, empate y doble oportunidad |
| Cobertura global | El scan CLI recortaba al límite general luego de descubrir cuotas globales. Se procesan todos los fixtures devueltos por el endpoint de cuotas de la fecha | `src/filters/low-odds.ts`, prueba de provider con más fixtures que el límite general |
| Consulta API | `/odds?date` omitía zona horaria y traía mercados innecesarios. El selector pide `timezone=America/Guatemala&bet=1`, todas las casas, sin filtro de liga | Prueba de query exacta y canary real de las páginas 1 y 12 del 22 de septiembre |
| Paginación y cuotas | Un fixture repetido entre páginas producía snapshots independientes y el consumidor perdía casas al construir un Map. Se fusionan páginas por fixture y se conserva procedencia por página | `api-football-date-odds.test.ts` verifica dos casas del mismo fixture y un único snapshot |
| Cobertura incompleta | Faltaban diagnósticos de páginas/fixtures no resueltos, y errores de cuotas por fixture podían dejar un scan promocionable. Se exportan `providerCoverage` y `scanErrors`; errores/cortes requieren revisión | Pruebas de páginas repetidas, vacías, inconsistentes, presupuesto insuficiente, fixture sin resolver y gate del pipeline |
| Presupuesto | La protección por requests dependía de tener un runtime. Cada instancia mantiene ahora un presupuesto local cuando falta runtime; la paginación se detiene antes de gastar en una lectura que no puede completar | Prueba sin runtime, presupuesto 2 y respuesta de 3 páginas |
| Fecha sin cuotas | Un endpoint de fecha exitoso pero vacío disparaba solicitudes por cada fixture del día. Se conserva el resultado vacío como ausencia actual de cuotas publicadas, sin ese fanout | Test de pipeline que falla si intenta fallback tras slate vacío |
| Cron | El rollover `retryable` de hoy ganaba prioridad incluso a las 22:15 frente al slate de mañana. La recuperación rollover queda limitada a 07:15–10:15; luego rige el ciclo de mañana | `daily-ops-dispatch.test.mjs`: recuperación nocturna de mañana, mañana terminal y corte de las 10:15 |
| Liquidación a 90 minutos | El mapper prefería `goals` a `score.fulltime`: en AET/PEN podía validar ganador/totales con prórroga. Ahora prefiere el marcador de 90 minutos; si falta tras AET/PEN conserva marcador desconocido | Regresión sintética 90m=1–1, prórroga=2–1: antes `home` resultaba ganador; tests nuevos conservan 1–1 y bloquean el marcador ausente |
| Presupuesto de validación | El fetcher de validación creaba el provider sin pasar el runtime compartido | `result-fetcher.test.ts` demuestra que un runtime con presupuesto agotado impide la llamada de red |
| Datos deportivos para el modelo | Se agrega `/teams/statistics` con IDs, liga, temporada y fecha de corte explícitos. La respuesta se valida, compacta y devuelve forma, partidos, goles, porterías a cero y partidos sin marcar, con procedencia | `api-football-team-statistics.test.ts`; integración de contexto a cargo del flujo principal |
| IDs deportivos | Los IDs internos UUID no sirven como IDs de API-Football para estadísticas de equipos. Fixture expone `providerHomeTeamId`/`providerAwayTeamId` desde payload normalizado, relaciones persistidas o metadata raw | Prueba de fixtures persistidos devuelve los IDs 33 y 40 |
| Ligas obligatorias semanales | `priorityLeagues` sólo ordenaba fixtures ya descubiertos por presets manuales; una liga fuera de esos presets podía desaparecer si no tenía favoritos low odds. El pipeline ahora pasa `requiredLeagues` al engine, que une presets, equipos y ligas requeridas por ID/temporada con una única consulta global por fecha | Regresión con Champions y Europa League fuera de presets, sin cuotas; no hay fanout por 45 ligas ni modificación del archivo manual |
| Cobertura bajo cupo | El límite de fixtures podía ocultar un partido obligatorio y producir cobertura aparentemente completa. `fixtures.json` conserva los objetos completos en `discoveredRequiredFixtures` antes del cupo; el helper del reporte los incorpora y el pipeline deja un warning | Integración con dos ligas obligatorias y cupo de uno: un único fixture analizado, dos fixtures en cobertura, dos sin predicción y estado `review-required` |
| Publicación vigente | El wrapper podía reservar y enviar una selección después de su kickoff. El boundary canónico consulta horario y estado persistidos de cada predicción y cada pierna de combinada antes del dry-run, de reservar y de enviar | 35 tests de publicación/wrapper/runtime pasan; igualdad con kickoff, estados no programados y metadata desconocida bloquean. Cambio a live tras reserva conserva `send-blocked` y `sent:false` |
| Amplitud de casas observadas | La whitelist dejaba dos casas y provocaba `lowLiquidity` para todas las cuotas aunque el score h2h fuera 0.7537. El consenso usa todas las cuotas recibidas y las cotizaciones seleccionables mantienen la whitelist | Regresión de cuatro casas observadas y dos seleccionables; mínimo de tres conservado. Metadata explicita que es un proxy de cobertura, no volumen negociado |
| Historial deportivo | El contexto tenía agregados de temporada sin detalle de rivales ni resultados recientes. Se añade lectura compacta de fixtures terminados por liga/temporada/rango, con UTC, rivales, estadio/ronda y marcador reglamentario nullable | Caché por runtime/cuenta/rango deduplica llamadas concurrentes; captura un snapshot proveedor bruto con procedencia, sin upsert de cada fixture histórico. Canary real de 50 partidos y tests de cutoff/estado/90m/presupuesto |

## Evidencia operativa y canaries reales

- El outcome `.artifacts/gana-v9/cron/daily-2026-09-21-full-outcome.json` registra un arranque `2026-09-22T04:15:21.243Z`, equivalente al 21 de septiembre a las 22:15 de Guatemala, dirigido todavía a la fecha 21. Terminó sin recomendaciones; el lock quedó `retryable`. Esta evidencia coincide con la prioridad ilimitada encontrada en `chooseHeavyAction`.
- Canary del 22 de septiembre: 2 requests de odds, primera y última página. API indicó 12 páginas; la última tenía 5 fixtures. Se observaron 15 fixtures y ningún ganador inferior a 1.10 en esa muestra. No se afirma cobertura completa del día con esas dos páginas. Quota diaria restante informada: 7459. Artefacto: `.artifacts/gana-v9/audits/2026-09-22/low-odds-api-canary.json`.
- Barrido completo para el 23 de septiembre, capturado `2026-09-22T07:01:12.083Z`: 3 requests, dos páginas de cuotas y un lote de fixtures. Cobertura 2/2, 13 fixtures resueltos, 13 snapshots, 216 quotes 1X2, cero fixtures faltantes y **cero ganadores estrictamente inferiores a 1.10**. Artefacto: `.artifacts/gana-v9/audits/2026-09-22/low-odds-api-full-2026-09-23.json`.
- Canary de estadísticas: 2 requests, equipos 33 y 40 de liga 39, temporada 2026, corte `2026-09-21`. Ambos devolvieron cinco partidos; formas `LWDLD` y `DDWDW`, goles a favor/en contra 8/8 y 7/4. El mapper aceptó ambas respuestas reales. Artefacto: `.artifacts/gana-v9/audits/2026-09-22/team-statistics-api-canary.json`.
- Canary de historial, capturado `2026-09-22T08:11:47.421Z`: 1 request `/fixtures`, liga 39, temporada 2026, rango `2026-01-01`–`2026-09-21`, estados FT/AET/PEN y UTC. Devolvió 50 fixtures, todos incluidos y con score90 conocido; fechas del 21 de agosto al 20 de septiembre. Artefacto: `.artifacts/gana-v9/audits/2026-09-22/fixture-history-api-canary.json`. Lectura sin writes de DB.
- Total de requests deportivos de esta auditoría: 8. El conteo no incluye requests de otras ramas del trabajo principal.

La cobertura es la de **cuotas publicadas por API-Football para la fecha consultada**, no la de todos los partidos de fútbol existentes. La oferta puede crecer antes del día del partido. Con cero candidatos no puede justificarse una combinada de 1.20 mediante sustitución por empate, doble oportunidad u odds inventadas.

La documentación oficial confirma paginación de odds y la disponibilidad limitada del histórico; el enriquecimiento usa fecha de corte para evitar incorporar partidos posteriores: [guía oficial API-Football](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide).

## Superficies adicionales inspeccionadas

| Área | Lectura y verificación proporcional | Resultado / límite |
| --- | --- | --- |
| Configuración y CLI | Flags, límites numéricos, scope de mercados, tests de argumentos | Se mantienen validaciones de argumentos y gates. La configuración productiva se verifica por el trabajo principal, sin volcar secretos |
| Storage | Singleton Prisma, protección contra cambiar DATABASE_URL, helpers de transacción, repositorios de odds/evidence/parlays y redacción | Tests transaccionales y redacción pasan; no se ejecutaron migraciones ni limpieza de datos |
| Validación | Fetcher, reglas de liquidación, paginación por fecha y caché de resultados | Corregidos marcador90m y runtime. Pruebas existentes de settlement y servicio pasan |
| Lifecycle Codex | `src/agent.ts`: grupos de procesos, SIGTERM/SIGKILL al abortar, args y requisito de búsqueda nativa | Conservadas protecciones; tests de argumentos/provider pasan. Esto no prueba ausencia de todos los procesos huérfanos en producción |
| Dashboard | Bind local por defecto, métodos GET, paginación acotada, sort allowlist y errores redactados | Tests query/server pasan. El dashboard operativo local no constituye por sí mismo una API pública de producción |
| Cron | Dispatcher, locks/estados y prioridad de retries | Cambiado sólo el criterio temporal de rollover. No se editaron crontab ni locks reales |

## Verificación ejecutada

- 65/65 tests focused de low-odds, provider API-Football y pipeline después del cambio global de cuotas.
- 27/27 tests del dispatcher tras cerrar la ventana rollover.
- 94/94 tests selectivos adicionales: transacciones/snapshots/redacción, validación, dashboard query/server, argumentos Codex, helpers de provider y flags CLI.
- 24/24 tests de mapper, fetcher de validación y settlement después de corregir 90 minutos y runtime compartido.
- 13/13 tests de estadísticas de equipos, provider y persistencia tras agregar el enriquecimiento.
- `pnpm typecheck` pasó también después del agregado de estadísticas de equipos e IDs. La suite completa integrada se coordina desde el trabajo principal.
- 7/7 tests de certificación: los 16 checks previos al golden pasan, incluidos aprobación de herramientas mutantes, redacción y controles negativos de provenance/disclaimer. Se actualizó únicamente el snapshot contractual del digest de `0fff078e5719c47e931257878963f77fda8dc8c4a5208d9dc1edc3f927db958a` a `1aa8e49330218fb3b933ab83539a5b329b8ac1fb17a2b504ba1d46c54eb5cf9d` por prompts versionados (incluidos el corte temporal prematch, el historial deportivo y la separación de etapas) y serialización corregida de referencias hermanas; el runner y los verificadores se conservaron.
- 45/45 tests de engine y pipeline tras integrar ligas obligatorias: consulta única, límite posterior a unión, temporada correcta, fecha local, estados cancelado/completado, error global propagado sin fanout y cobertura explícita aun sin cuotas. `pnpm typecheck` volvió a pasar después de esta integración. El helper que consume `discoveredRequiredFixtures` se verificó con el test real de pipeline.
- 35/35 tests de publicación, wrapper-state y runtime después del guard de kickoff, más sintaxis de ambos archivos modificados.
- 17/17 tests de provider, date odds y persistencia tras separar el consenso de la whitelist, y `pnpm typecheck` limpio.
- 18/18 tests de historial, team statistics y provider después del DTO histórico y caché; `pnpm typecheck` limpio. La integración de research tiene verificación separada en el flujo principal.
- `git diff --check` limpio en archivos de esta auditoría antes del cierre.

Los grupos de tests se superponen y sus cantidades no deben sumarse como tests únicos.

## Límites y seguimiento concreto

1. No se reescribieron validaciones históricas ya publicadas. Para reparar resultados afectados por AET/PEN hace falta identificar sus snapshots/fixtures, comparar marcador reglamentario y validación persistida, generar un reporte de diferencias y ejecutar una corrección explícita con trazabilidad.
2. Los corners de partidos con prórroga requieren verificar que las estadísticas correspondan al período reglamentario. La corrección del marcador de goles no prueba la semántica temporal del endpoint de corners.
3. El helper compartido legacy `fetchLowOddsSnapshot` podía reutilizar un snapshot primario filtrado por bookmaker. Quedó corregido en `c65884bc`: `src/daily/e2e.ts` mantiene `allBookmakerSnapshots` separado del caché primario y las consultas nuevas usan `lowOddsScanProviderConfig`, sin whitelist. Las pruebas existentes cubren separación de mercados y cobertura entre casas; no se identificó una regresión que invoque directamente el constructor compartido y pruebe contaminación entre ambos cachés. Es un límite de cobertura, no un fallo actual confirmado.
4. El período de recuperación de rollover evita starvation de mañana; los filtros de frescura del flujo principal siguen siendo necesarios para excluir partidos ya empezados y recomendaciones vencidas.
5. La fecha de corte para estadísticas evita datos de partidos posteriores, pero snapshots capturados hoy para una auditoría histórica no deben presentarse como evidencia que ya existía al publicarse la recomendación original.

## Hallazgo adicional durante R7: estado prematuro del run

La DB marcaba el provider run como succeeded mientras su proceso continuaba en
research. `defaultPersistBundle` finalizaba el mismo run después de cada bundle;
scoring, parlay y validación repetían el patrón. El comportamiento precedía a esta
auditoría (commit `a8a7e0d8`, abril). Afectaba los estados y duraciones del dashboard
y los exports hechos durante una ejecución; no se encontró un bypass de publicación.

Corrección preparada en `506e18f`, checkout aislado: el pipeline conserva la
autoridad sobre su run mediante un contexto async ligado al runtime e ID exactos.
La persistencia de etapas sólo asegura que exista, sin cambiar estado, verdict,
completedAt o metadata del padre. Los comandos independientes mantienen su cierre
y la reejecución explícita. El inicio del pipeline limpia completedAt anterior.

La revisión encontró y reprodujo una carrera en la primera propuesta: un hijo
podía persistir después del timeout y de la salida del scope. AsyncLocalStorage
conserva su identidad de hijo aunque escriba tarde; una regresión y una segunda
reproducción independiente confirmaron que ya no altera el padre terminado.

Verificación: 173/173 pruebas focalizadas, 761/761 de suite completa, TypeScript
y diffcheck. Canary real de repositorio/Prisma a las 15:44:15 UTC: ocho controles
de persistencia, incluido el hijo tardío; transacción deliberadamente revertida
y lectura posterior con cero filas de prueba. No usó API deportiva, scoring ni
publicación y no tocó runs existentes. Evidencia:
`audits/2026-09-22/run-lifecycle-verification.json` y
`audits/2026-09-22/run-lifecycle-rollback-canary.json`.

Se integró en main `506e18f` tras el cierre de R7 y se retiró el worktree temporal.
Sus estados observados pertenecen al código previo; no se atribuye a esa corrida
la corrección nueva. Suite en main: 761/761 y TypeScript aprobado. También se
precisó el diagnóstico de cobertura: la ausencia de candidatos no afirma que
scoring no se haya ejecutado; no se modificó el gate.

El aviso `getcwd` de R5 se inspeccionó por separado: el output prueba que el job
continuó hasta el resultado diario, el workdir configurado existe y un shell
actual terminó sin stderr. Los procesos del gateway tienen cwd existente.
No se reprodujo un problema actual ni se reiniciaron servicios; el origen exacto
de aquella advertencia no quedó determinado.

## Hallazgo adicional de R7: alternativa estricta de precio omitida

La compactación de cuotas conservaba el mejor precio de cada selección para el
modelo. Dos favoritos tenían además un precio seleccionable menor a 1.10 en el
mismo snapshot: 1593593 away 1.07 frente a 1.12 y 1602489 home 1.09 frente a 1.11.
El filtro posterior del perfil estricto no podía recuperar esas alternativas.

Corrección integrada en `32a527d`: el pronóstico general conserva su mejor cuota;
una variante determinista del mismo evento comparte probabilidad, calibración y
evidencia, pero conserva quote ID y prediction ID propios y recalcula retorno y
riesgo. El alcance `low-odds-top` viaja hasta las piernas del portfolio. No puede
convertir un origen bloqueado en publicable ni ocupar el cupo general de 500.

Las liquidaciones conservan los dos precios; las cohortes generales excluyen la
variante para no contar dos veces el mismo pronóstico. Un target publicado
explícito sigue usando su precio real. Validar sólo la variante no agrega una
observación de calibración hasta validar el origen. Pruebas con EV negativo,
riesgos por cuota, whitelist, frontera 1.10, calibración única, paginación,
recombinación y liquidación; revisión independiente sin hallazgos pendientes.
Suite final en main: 780/780 pruebas, 109 suites y TypeScript aprobado.

Los dos ejemplos reales seguían bloqueados por evidencia. Este arreglo no prueba
una nueva entrega ni justifica repetir research para obtener una selección.
