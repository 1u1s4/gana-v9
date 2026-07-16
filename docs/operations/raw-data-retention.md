---
source: repo
owner: Jo / CTO
status: canonical
updated: 2026-07-14
---

# Retencion acotada en PostgreSQL/Supabase

La base live no es el archivo historico. El dump completo, comprimido y con
checksum previo a la migracion conserva la historia anterior fuera de
Supabase; la base operativa aplica estas ventanas:

- **Crudo y transitorio: maximo 7 dias.** Muestras individuales de cuota,
  payloads del proveedor, low-odds e historia Gambeta no-current. Dentro de
  esa ventana, el snapshot mas reciente por fixture no entra al colapso de
  cambios intermedios de 24 horas. Ese snapshot tambien expira al superar 7
  dias si no tiene referencias; no existe una excepcion historica permanente.
- **Investigacion y validacion no publicada: 14 dias.** Bundles, sources,
  evidence, claims y validation artifacts.
- **Analitica operativa no publicada: 30 dias.** Predictions, parlays,
  fixtures, runs, tareas, artifacts, auditoria y leaderboard.
- **Historia durable: 60 dias.** Ledger de Discord y metricas/agregados diarios.
- **Estado estable: sin purga automatica.** Catalogos, presets, tablas Gambeta
  `current` y migraciones de Prisma.

Una fila con fecha igual o posterior al cutoff nunca es candidata. Una fila
padre mas antigua puede sobrevivir mientras una fila retenida la referencie.
Tambien se conserva el linaje de una publicacion que aun esta dentro de la
ventana, incluso si una pieza de ese linaje tiene un timestamp mas antiguo. Al
expirar la publicacion y sus hijos, una ejecucion posterior libera los padres.

## Ingesta sin duplicados

La ingesta de API-Football usa contenido direccionado por SHA-256 para evitar
crecimiento por observaciones identicas:

- `provider_snapshots.dedupe_key` reutiliza una respuesta cuando no cambian
  proveedor, endpoint, request, payload ni provenance explicita.
  `last_seen_at` y `observation_count` registran observaciones adicionales sin
  duplicar el payload.
- `odds_snapshots.dedupe_key` incluye fixture, payload, configuracion
  normalizada y el conjunto exacto de quotes. Un cambio de precio, mercado,
  filtro o metadata de contenido crea un snapshot nuevo.
- `odds_quotes.content_hash` excluye solo datos de observacion. El indice unico
  `(snapshot_id, content_hash)` hace idempotente la insercion concurrente.
- Snapshots sin `payload_hash` no se fusionan porque hacerlo seria una
  inferencia insegura.

El SQL PostgreSQL idempotente vive en `prisma/postgres/retention.sql` y debe
estar desplegado antes del codigo de ingesta.

## Dry-run y apply

`pnpm db:retention` es **dry-run por defecto**. Informa filas y bytes de heap
estimados sin abrir transacciones destructivas:

```bash
pnpm db:retention
pnpm db:retention -- --json
```

El reporte incluye:

- elegibles y bloqueadas por referencias para cada tabla historica;
- elegibles de crudo y grupos diarios de cuota que se consolidarian;
- `pg_database_size(current_database())`;
- las diez tablas y los diez indices mas grandes;
- estado `ok`, `warning` o `critical`.

Despues de revisar el reporte, apply requiere un flag explicito:

```bash
pnpm db:retention -- --apply
```

Configuracion:

- `GANA_RAW_RETENTION_DAYS=7`. Valor fijo: 7 dias.
- `GANA_TRANSIENT_RETENTION_DAYS=7`. Valor fijo: 7 dias.
- `GANA_RESEARCH_RETENTION_DAYS=14`. Rango permitido: 7 a 14 dias.
- `GANA_ANALYTIC_RETENTION_DAYS=30`. Valor fijo: 30 dias.
- `GANA_HISTORY_RETENTION_DAYS=60`. Rango: 30 a 60 dias; 60 es el maximo.
- `GANA_RAW_RETENTION_BATCH_SIZE=1000`. Maximo: 10,000 filas por transaccion.
- `GANA_RAW_RETENTION_STATEMENT_TIMEOUT_MS=30000`.
- `GANA_RAW_RETENTION_LOCK_TIMEOUT_MS=2000`.
- `GANA_RAW_RETENTION_MAX_BATCHES=10000`, limite de seguridad por tabla y por
  ejecucion.

Los cutoffs de timestamps son instantes UTC. Para `metric_date`, el corte usa
la fecha calendario UTC correspondiente, sin depender del timezone de sesion.

## Cierre referencial y orden destructivo

La ruta de apply cubre las 26 tablas historicas o crudas del esquema de dominio
y usa un orden fijo de hijos a padres:

1. Expira publicaciones mayores a 60 dias.
2. Elimina hojas segun su clase: transitorio a 7 dias, research/validation a
   14, analitica no publicada a 30 y metricas durables a 60.
3. Elimina predictions, parlays, sources, research bundles, scans, artifacts y
   snapshots historicos de Gambeta solo cuando ya no tienen hijos retenidos.
4. Consolida muestras de cuota mayores a 7 dias y elimina el mismo lote.
5. Elimina quotes, odds snapshots y provider snapshots mayores a 7 dias que ya
   no tienen referencias relacionales ni IDs legacy en JSON. Un snapshot de
   odds superado por otro del mismo fixture tambien es elegible despues de 24
   horas. El mas reciente evita solo ese colapso anticipado: si supera 7 dias y
   sigue sin referencias, tambien es elegible.
6. Expira agregados diarios de cuota mayores a 60 dias. Esta fase ocurre
   despues de consolidar para no recrear historia vencida al final de la
   corrida.
7. Elimina tasks, fixtures, runs del harness y runs historicos de Gambeta solo
   cuando todos sus hijos elegibles ya desaparecieron.

Cada target usa `FOR UPDATE SKIP LOCKED`, orden estable y un lote acotado dentro
de una transaccion corta con `statement_timeout` y `lock_timeout`. Si se alcanza
`max-batches`, el comando falla de forma visible; lo ya confirmado permanece
consistente y la siguiente ejecucion continua de forma idempotente.

Despues de borrar filas, el mismo ciclo pone en `NULL` payloads opcionales
vencidos de filas no publicadas, tambien por lotes. Mantiene intactos outcome,
statements, rationale, probabilidades, odds, claves y relaciones. Las tablas de
mayor churn usan autovacuum dirigido (`0.05` vacuum, `0.02` analyze); no se
programa `VACUUM FULL` porque bloquearia y no es necesario para reutilizar
espacio.

Las publicaciones retenidas se reconocen tanto por las FKs UUID como por
`target_type + target_id`, necesario para artifacts con IDs sinteticos. Su
prediction/parlay, legs, validacion y research asociado bloquean la purga hasta
que el ledger correspondiente expire.

## Consolidacion de cuota

Antes de expirar muestras mayores a 7 dias, `provider_quota_daily` conserva una
fila por clave natural:

`metric_date UTC + provider_code + endpoint_name + status`

Cada fila guarda conteos, promedios ponderados, minimos, maximos y la primera y
ultima observacion. El UPSERT y el DELETE del lote ocurren en la misma
transaccion: un fallo no duplica ni pierde conteos. Los agregados diarios
tambien expiran al superar 60 dias.

## Tablas excluidas de toda purga

El plan valida al iniciar que ninguna ruta destructiva incluya:

- `_prisma_migrations`;
- `sports_providers`, `competitions`, `teams`;
- `league_presets`, `team_presets`, `search_filter_presets`;
- `gambeta_current_picks`, `gambeta_current_stats`.

Los runs de Gambeta referenciados por una tabla `current` tambien quedan
bloqueados, aunque sean antiguos. La retencion de `artifacts` elimina solo la
fila de metadata en PostgreSQL; no borra automaticamente archivos del path
registrado. La limpieza del filesystem requiere una politica separada con su
propio dry-run.

## Protecciones del crudo

No se elimina un quote o snapshot usado por una prediction, `low_odds_hit`,
source o validation retenida. Se consideran tanto FKs como
`source_records.metadata.snapshotId`, `oddsSnapshotId` y
`validation_artifacts.metadata.resultProviderSnapshotId`. La persistencia
nueva tambien llena `source_records.provider_snapshot_id` cuando el valor es
un UUID valido y conserva el valor JSON para compatibilidad. Si un source cuyo
`oddsSnapshotId` apunta al snapshot forma parte del linaje publicado, tampoco
se compacta el payload opcional del snapshot ni de sus quotes.

Para validaciones no publicadas, `metadata.resultProviderSnapshotId` y el raw
que solo dependia de ese puntero pueden compactarse al superar 7 dias; la fila,
el outcome y los campos centrales de validacion permanecen hasta 14 dias. Una
validacion publicada conserva su metadata y tanto el snapshot FK como el
snapshot adicional de resultado durante toda la ventana de la publicacion.

Los guards de padres usan las columnas FK indexadas. Los indices de expresion
para IDs JSON historicos viven en `prisma/postgres/retention.sql`, porque Prisma
no los modela.

## Capacidad y operacion

Umbrales operativos locales:

- `ok`: menor a 350 MiB;
- `warning`: desde 350 MiB;
- `critical`: desde 400 MiB.

`critical` no impide una retencion segura. Al terminar, revisar especialmente
los bytes `blocked`: indican padres antiguos aun necesarios por filas retenidas
o escrituras activas.

Los bytes reportados son una estimacion de tuples de heap. No prometen liberar
de inmediato archivos fisicos, indices ni todo TOAST. Autovacuum vuelve
reutilizable el espacio; no se automatiza `VACUUM FULL` porque toma locks
fuertes. Las tablas JSON con actualizaciones frecuentes (`fixtures`,
`harness_runs`, `predictions` y `validation_artifacts`) tienen umbrales de
autovacuum propios tambien en su relacion TOAST: 50 tuples mas 5% para cambios
y 1000 tuples mas 5% para inserciones. Despues de una purga grande, revisar
autovacuum/autoanalyze y ejecutar `ANALYZE` en una ventana apropiada si las
estadisticas quedan atrasadas.

Operacion sugerida:

1. Guardar diariamente el dry-run JSON como artifact operativo.
2. Antes de un apply manual grande, guardar `pnpm db:published-lineage` y
   comparar despues con `pnpm db:published-lineage -- --expect RUTA`. El
   comando es read-only y falla si cambia cualquier conteo o SHA-256 del
   linaje transitivo de publicaciones.
3. Validar el primer apply contra Supabase ya migrado y hacerlo fuera del Daily
   E2E.
4. Programar apply diario una vez validado; el dispatcher invoca
   `scripts/gana-raw-retention-apply.sh` una sola vez por fecha desde las 07:15
   `America/Guatemala`, antes de validacion y Daily E2E. Usa
   lock compartido entre schedulers, respeta `GANA_MAINTENANCE_PAUSED=true` y
   guarda JSON en `.artifacts/gana-v9/retention/`.
5. Alertar si quedan elegibles despues de apply, si crecen los bytes bloqueados
   o si se alcanza `warning`.
6. Revisar mensualmente autovacuum, top tables e indices.

Los instaladores incluyen ese checkpoint dentro del job dispatcher unico, pero
deben reinstalarse solo despues de un dry-run revisado y una ejecucion manual
satisfactoria en Supabase.

El wrapper mantiene un lock advisory del kernel en
`cron/locks/raw-retention.lock/kernel.lock` (`lockf` en macOS y `flock` como
fallback). El sistema operativo lo libera incluso si el proceso muere con
`SIGKILL`, por lo que no se borra ni se adivina un lock stale por rutas o
timestamps. Despues de obtener exclusividad publica atomicamente metadata con
token de propietario y PID. Si otro scheduler llega durante esa ventana sin
PID, el kernel sigue bloqueandolo y el resultado es
`retention-lock-initializing`, no una eliminacion. El formato legacy de
directorio sin PID conserva ademas una gracia de cinco minutos durante la
transicion.

El trap elimina la metadata `owner` unicamente si el token sigue siendo el
suyo; `kernel.lock` puede permanecer como archivo inerte y su mera existencia
no significa que haya una corrida activa. Un owner stale se reemplaza solo
despues de adquirir el lock del kernel.

Cada reporte final se publica con rename atomico desde un temporal del mismo
directorio. Si el CLI falla despues de uno o mas lotes confirmados, el artifact
sigue siendo JSON valido y conservador: `status=error`,
`changed=possibly-partial`, `exitCode` igual al del CLI y una razon estable sin
texto de excepcion ni secretos. La recuperacion es revisar ese artifact, correr
otro dry-run y continuar idempotentemente; un archivo parcial de stdout nunca
se publica como reporte final.

`GANA_MAINTENANCE_PAUSED=true` evita que empiece una nueva ejecucion, pero no
mata una retencion que ya obtuvo el lock. Antes de cambiar `DATABASE_URL`,
restaurar o iniciar un cutover, activar la pausa y esperar a que terminen tanto
el owner del lock como el proceso de retencion:

```bash
while pgrep -f 'gana-raw-retention(\.mjs|-apply\.sh)' >/dev/null; do
  sleep 2
done
test ! -e .artifacts/gana-v9/cron/locks/raw-retention.lock/owner \
  || sed -n '2p' .artifacts/gana-v9/cron/locks/raw-retention.lock/owner
```

No borrar manualmente metadata que tenga owner vivo. Si no hay proceso, el
cutover ya no tiene un escritor activo; el siguiente inicio reemplaza metadata
stale solo despues de obtener exclusividad del kernel.

Verificacion manual independiente:

```sql
select pg_size_pretty(pg_database_size(current_database())) as database_size;

select
  relname as table_name,
  pg_size_pretty(pg_total_relation_size(relid)) as total_size
from pg_catalog.pg_statio_user_tables
where schemaname = 'gana_ops'
order by pg_total_relation_size(relid) desc;
```
