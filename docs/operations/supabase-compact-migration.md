---
source: repo
owner: Jo / CTO
status: canonical
updated: 2026-07-14
---

# Migracion compacta MySQL a Supabase

Este runbook mueve exclusivamente `gana_v9_ops_20260425` desde MySQL a
PostgreSQL/Supabase. Las demas bases del servidor fuente quedan fuera del
inventario, backup y transferencia. El objetivo es una base live compacta, con
rollback completo y sin perder el linaje de publicaciones.

## Variables y conexiones

Los DSN reales viven solo en `.env`, con permisos restrictivos. Nunca se pegan
en comandos, logs, artifacts o documentos.

| Variable | Uso | Conexion |
| --- | --- | --- |
| `DATABASE_URL` | Runtime, cron, dashboard y Prisma | Pooler de **sesion** PostgreSQL, con `schema=gana_ops` y limite de conexiones de Prisma. |
| `DIRECT_URL` | Migraciones Prisma | Endpoint directo cuando sea alcanzable; si la red no tiene ruta, el mismo pooler de sesion. |
| `SOURCE_DATABASE_URL` | Solo durante transferencia | MySQL y base exacta `gana_v9_ops_20260425`. |
| `TARGET_DATABASE_URL` | Solo durante transferencia | DSN libpq al pooler de sesion, sin parametros Prisma `schema` ni `connection_limit`; el schema se pasa como `--target-schema gana_ops`. |

No usar el pooler de transacciones. Eliminar `SOURCE_DATABASE_URL` y
`TARGET_DATABASE_URL` del `.env` una vez verificado el cutover.

## Perfil `compact-free`

La seleccion vigente se identifica como
`compact-free-v6-60d-history-7d-raw-json-lineage-referenced-catalogs-retention-fixed-point`.
No reutilizar nombres de artifacts V4/V5: una recopia V6 debe guardar
`inventory`, `copy` y `verify` en artifacts nuevos para que la politica
aplicada sea inequivoca.

La base fuente completa se conserva en un backup externo. La base live recibe:

- datos crudos/transitorios de los ultimos 7 dias;
- investigacion y validacion no publicada de 14 dias;
- historia operativa y analitica no publicada de 30 dias;
- `sports_providers`, presets y estado corriente necesarios por el runtime;
- solo los `competitions` y `teams` referidos por fixtures, presets u otro FK
  retenido; los catalogos huerfanos quedan fuera;
- publicaciones/recomendaciones de hasta 60 dias y el cierre completo de sus
  predictions, odds, evidencia, validaciones y relaciones;
- filas adicionales requeridas por foreign keys del conjunto seleccionado.
- snapshots exactos citados por `source_records.metadata.snapshotId`,
  `source_records.metadata.oddsSnapshotId` y
  `validation_artifacts.metadata.resultProviderSnapshotId`;
- para cada `oddsSnapshotId` JSON, solo las quotes deduplicadas de ese snapshot,
  sin expandir los snapshots hermanos de una prediction.

La seleccion no expande hijos historicos desde un padre reciente no durable.
`source_records`, `evidence_items` y `claims` no publicados entran por su propia
ventana de 14 dias y luego solo cierran padres FK/JSON. El descenso completo a
hijos se reserva al linaje durable de publicaciones y al estado corriente. Asi
COPY ya representa el punto fijo de la primera retencion, en vez de copiar
filas que esa misma retencion eliminaria inmediatamente.

Las referencias JSON se cierran solo cuando su `metadata` existira despues de
COPY: `source_records.captured_at` y `validation_artifacts.evaluated_at` dentro
de los ultimos 7 dias, unidos con todas las filas del linaje durable de una
publicacion. Por eso, una fila no publicada de 7 a 14 dias conserva sus campos
centrales pero no selecciona snapshots ni quotes mediante metadata que la
transformacion convertira a `NULL`. Una fila durable conserva siempre su
metadata, snapshot exacto, quotes estrechas y payloads asociados sin importar
su edad dentro del cierre publicado.

El perfil nunca es el unico respaldo historico. Su proposito es reducir heap,
TOAST e indices de la base operacional sin romper explicabilidad ni Discord.

## Gates de migracion

### 1. Backup completo fuera de la base live

Crear un dump consistente, comprimido y exclusivo de
`gana_v9_ops_20260425`. Guardarlo fuera de Supabase con permisos restrictivos y
un archivo SHA-256. Antes de continuar deben pasar tanto la prueba del gzip como
la verificacion del checksum.

Registrar en el acta de migracion:

- fecha UTC y base fuente;
- bytes del dump;
- SHA-256;
- resultado de integridad;
- ubicacion de restauracion, sin incluir credenciales.

### 2. Schema PostgreSQL preparado

Aplicar las migraciones con `pnpm db:migrate:deploy` usando un `DATABASE_URL`
que incluya `schema=gana_ops`. El baseline y la migracion de retencion usan
nombres sin calificar; no ejecutarlos manualmente desde SQL Editor sin antes
hacer `SET search_path TO gana_ops`. Verificar que no se hayan creado tablas del
dominio duplicadas en `public`.

Regenerar el cliente con `pnpm db:generate` y comprobar que el cliente resuelto
por `@prisma/client` contiene `provider = "postgresql"`. No transferir datos
hasta que Prisma valide el schema y la utilidad de migracion confirme las 33
tablas permitidas.

La interfaz vigente de la utilidad siempre se consulta desde el repo:

```bash
python3 scripts/migrate_mysql_to_supabase.py --help
python3 scripts/migrate_mysql_to_supabase.py copy --help
```

### 3. Estimacion antes de copiar

Fijar un `as-of` UTC reproducible y seleccionar `compact-free`. Revisar el
reporte previo: filas seleccionadas por tabla, cierre referencial, bytes
estimados y cualquier fila durable agregada fuera de las ventanas. No iniciar
la copia si el conjunto estimado no deja margen suficiente para indices, TOAST
y crecimiento normal.

```bash
export MIGRATION_AS_OF=YYYY-MM-DDTHH:MM:SSZ

python3 scripts/migrate_mysql_to_supabase.py \
  --target-schema gana_ops \
  --profile compact-free \
  --as-of "$MIGRATION_AS_OF" \
  inventory
```

Cuando el target ya contiene una copia anterior que sera reemplazada, usar el
modo explicito y solo-lectura:

```bash
python3 scripts/migrate_mysql_to_supabase.py \
  --target-schema gana_ops \
  --profile compact-free \
  --as-of "$MIGRATION_AS_OF" \
  inventory --replace-target
```

`--replace-target` no borra ni autoriza nada. Solo cambia el calculo de
capacidad a `max(0, database_bytes - managed_relation_bytes) + estimate`, donde
`managed_relation_bytes` incluye exclusivamente las 33 tablas de dominio y la
auxiliar administrada dentro de `gana_ops`. El modo normal conserva la
proyeccion append. La copia de reemplazo sigue exigiendo por separado
`copy --truncate-target`.

`inventory` es el preflight no destructivo: compara contratos de schema,
construye la seleccion, cierra foreign keys y estima bytes del target. Debe
terminar con estado `ready`, `profile.jsonReferenceClosed=true` y cero elementos
en `profile.jsonReferenceViolations`. Revisar tambien los conteos agregados de
`profile.jsonReferenceStats`; `materializedChildRows` distingue las filas cuya
metadata llegara al target de `retainedChildRows`, y ninguna estadistica
contiene IDs ni row data. Usar exactamente
el mismo `MIGRATION_AS_OF` en los tres comandos y mantener pausada la ingesta
hasta terminar verify.

Antes de abrir la ventana de copia, fijar temporalmente
`GANA_MAINTENANCE_PAUSED=true` en el `.env`. Los wrappers de Daily E2E,
retencion, validacion y strategy review salen sin iniciar trabajo nuevo sobre
la base ni Discord mientras la migracion esta activa. La pausa no termina una
retencion que ya obtuvo su lock: antes de cambiar URLs o copiar, esperar hasta
que no exista un proceso `gana-raw-retention.mjs`/`gana-raw-retention-apply.sh`
activo. No borrar un lock cuyo PID siga vivo; un lock huerfano se reclama con
seguridad en el siguiente inicio porque el lock advisory del kernel ya fue
liberado por el sistema operativo. El archivo `kernel.lock` es persistente y su
mera presencia no indica actividad; comprobar el proceso y la metadata
`owner`.

### 4. Copia y verificacion

Ejecutar una sola copia dentro de una ventana sin ingesta. Si las 33 tablas del
target estan vacias, el comando no necesita autorizacion destructiva:

```bash
python3 scripts/migrate_mysql_to_supabase.py \
  --target-schema gana_ops \
  --profile compact-free \
  --as-of "$MIGRATION_AS_OF" \
  copy
```

Si contienen datos, la utilidad se detiene. Solo despues de confirmar que ese
contenido puede reemplazarse se repite agregando `--truncate-target` despues de
`copy`; el script enumera exclusivamente las 33 tablas permitidas y no usa
`CASCADE`.

La transferencia usa una lectura consistente de MySQL, escritura atomica en
PostgreSQL y el allowlist de tablas. Verificar con el mismo perfil y corte:

```bash
python3 scripts/migrate_mysql_to_supabase.py \
  --target-schema gana_ops \
  --profile compact-free \
  --as-of "$MIGRATION_AS_OF" \
  verify
```

El reporte debe terminar con estado `verified`. Comparar, como minimo:

- conteos seleccionados por tabla;
- hashes canonicos del conjunto copiado;
- foreign keys huerfanas;
- secuencias PostgreSQL;
- publicaciones y linaje durable;
- tamano total y tablas/indices principales.

El objetivo operativo inicial es menor a 350 MiB. Si llega a 350 MiB se revisa
el perfil; no continuar al cutover si alcanza 400 MiB.

### 5. Preflight de aplicacion y Discord

Cambiar `DATABASE_URL` al pooler de sesion solo despues de que la verificacion de
datos pase. Luego ejecutar:

```bash
pnpm gana db status
pnpm db:canary
pnpm db:retention
node .agents/skills/discord-recommendation-notifier/scripts/notify-discord-recommendations.mjs \
  --latest \
  --dry-run
```

La retencion debe permanecer en dry-run durante este gate. `pnpm db:canary`
crea, lee y actualiza un `HarnessRun` dentro de una transaccion y fuerza rollback;
la verificacion final exige que no quede ninguna fila. Verificar tambien payload
Discord y ledger. La primera publicacion real se hace una sola vez mediante el
wrapper diario normal, sin `--force`, para conservar el lock por fecha. Confirmar
los message IDs, las filas enlazadas del ledger y que un segundo intento normal
no publique duplicados.

Solo despues de estos checks, cambiar `GANA_MAINTENANCE_PAUSED=false` y
completar un Daily E2E normal sobre Supabase. Confirmar que ese wrapper y el
siguiente cron usan Terra high, web live, modo no-fast y el pooler de sesion.

### 6. Retiro de DigitalOcean

Eliminar el cluster fuente unicamente cuando se cumplan todos estos puntos:

- backup completo e integridad verificados;
- copy/verify compactos aprobados;
- tamano live dentro del margen;
- runtime y cron leen Supabase;
- Discord paso dry-run y una ejecucion normal sin duplicados;
- un Daily E2E normal termino sobre Supabase;
- existe una ruta de restauracion probada o documentada.

Despues de eliminarlo, comprobar que el recurso ya no aparece activo y que no
queda costo recurrente asociado. La presencia del backup externo no sustituye
esta verificacion de facturacion.

## Retencion despues del cutover

La ingesta deduplica snapshots identicos y actualiza frescura/conteo en vez de
duplicar payloads. La politica live usa niveles 7/14/30/60: crudo/transitorio,
investigacion/validacion, analitica no publicada y ledger/metricas durables. En
cada ciclo programado de retencion:

1. correr `pnpm db:retention` y guardar el reporte;
2. revisar filas/bytes elegibles;
3. ejecutar `pnpm db:retention -- --apply` fuera de Daily E2E;
4. repetir el dry-run y confirmar que no quedan filas elegibles inesperadas.

Despues del primer apply satisfactorio, reinstalar el scheduler elegido. La
tarea unica `gana-v9-daily-operations` evalua retencion desde las 07:15
`America/Guatemala` mediante `scripts/gana-daily-ops-dispatch.mjs`, que invoca
`scripts/gana-raw-retention-apply.sh` una sola vez por fecha, con lock de
propietario, guard de mantenimiento y artifact JSON atomico aun cuando el CLI falle. Los lotes ya
confirmados se reportan conservadoramente como `changed=possibly-partial` y el
reintento comienza siempre por otro dry-run.

Mensualmente se registran tamano total, tablas e indices principales,
autovacuum y tendencia. La politica, consultas y protecciones de linaje estan
en [retencion de datos crudos](raw-data-retention.md).

## Rollback

Antes de retirar DigitalOcean, rollback significa volver temporalmente el
`DATABASE_URL` al origen y detener escritores en Supabase. Despues de retirarlo,
rollback significa restaurar el dump completo verificado en una instancia nueva,
no intentar reconstruir historia desde el perfil compacto.

No borrar el target ni el backup ante una falla. Detener escritores, preservar
logs redacted, identificar la primera tabla divergente y repetir desde un target
limpio solo cuando la causa este entendida.
