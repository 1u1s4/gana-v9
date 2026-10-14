# Credenciales, configuración y operación para migrar a Pi

Fecha: 2026-10-13, America/Guatemala  
Complementa el [estudio y plan](../24-migracion-a-pi.md)

Este documento entrega el inventario y procedimiento de traslado. Los valores
reales permanecen en sus almacenes privados; no están en este documento, en el
inventario JSON ni en las pruebas. “Presente” significa que existe un valor local,
no que la credencial siga vigente o tenga permisos suficientes

## 1. Inventario de secretos necesarios

| Credencial | Origen observado | Estado | Destino y consumidor | Comprobación de aceptación |
|---|---|---|---|---|
| `DATABASE_URL` | `.env` del repo | Presente | Coordinador Gana, Prisma y workers deterministas autorizados; conservar DB actual | Lectura/status y canary aislado; schema, pooler, TLS, permisos y restauración |
| `DIRECT_URL` | `.env` del repo | Presente | Proceso de administración/migraciones, separado de inferencia | Validar ruta directa y permisos solo al preparar una migración aprobada |
| `API_FOOTBALL_KEY` | `.env` del repo | Presente | Provider deportivo/broker de Gana | Request read-only acotado, cuota y redacción verificadas |
| `BROWSER_USE_API_KEY` | `.env` y nombre también presente en `~/.hermes/.env` | Presente en ambos stores; no se compararon valores | Broker de research si se conserva Browser Use | Validar cuenta, límite, modelo y cobertura; no activar tareas pagas en este estudio |
| Autenticación Codex | `~/.codex/auth.json` | Archivo presente, modo 0600 | Backend legacy durante rollback | Mantener intacta; no convertir/copiar sus tokens a Pi |
| Autenticación Pi `openai-codex` | `~/.pi/agent/auth.json` por defecto | Ausente antes del estudio | Store Pi privado del usuario/servicio | Login propio, llamada canary y refresh tras reinicio |
| `OPENAI_API_KEY` | No es requisito del flujo actual | No inspeccionada como credencial activa | Alternativa API si se decide abandonar OAuth | Presupuesto y credencial propios; no asumir equivalencia con suscripción |
| `OPENROUTER_API_KEY` | `.env` | Vacía | Solo si se decide usar modelos OpenRouter en Pi | No requerida para migrar el perfil Codex/OAuth |
| `DISCORD_BOT_TOKEN` | `~/.hermes/.env`; transporte resuelve gateway config | Presente | Publicador determinista independiente | Lectura del canal y permisos correctos; envío solo en canary autorizado |
| `DISCORD_WEBHOOK_URL` | Opción del notifier | No presente en `.env` del repo inspeccionado | Alternativa al bot, solo si se elige explícitamente | No mezclar transportes; validar receipts y capacidad de reconciliación |
| `TELEGRAM_BOT_TOKEN` | `~/.hermes/.env` | Presente | Solo si Telegram forma parte de la operación que se decide conservar | Confirmar consumidor real antes de transferir; no exportar todo Hermes |
| Token de búsqueda/MCP nuevo | A definir al resolver B1 | No creado | Broker o servidor concreto | Solo scopes/hosts requeridos y credencial separada de DB/Discord |
| `GANA_STUDY_CACHE_TOKEN` | Referencias en scripts de estudios | Presencia local no acreditada | Experimentos específicos, no producción por defecto | Regenerar si el flujo elegido lo requiere; no usar como credencial general |

`SOURCE_DATABASE_URL` y `TARGET_DATABASE_URL` aparecen en la plantilla para la
migración histórica de DB. No son requisitos de migrar el harness ni reemplazan
`DATABASE_URL`. Las variables `GEMINI_*` y `CURSOR_*` residuales en `.env` requieren
revisión; no se trasladan como dependencias activas solo por existir

Los archivos `.env`, auth Codex, `~/.hermes/.env` y `~/.hermes/config.yaml`
inspeccionados tenían permisos 0600. No se modificaron sus contenidos ni permisos

## 2. Configuración que también debe conservarse

El [inventario machine-readable](inventario-entorno.json) contiene 158 nombres,
incluye 149 con referencias estáticas en código/scripts seleccionados y registra
presencia para 61 variables del `.env` local. No contiene valores. La extracción
no demuestra uso efectivo de cada variable y puede omitir accesos construidos
dinámicamente; P0 debe revisar cada entrada `external_or_template_only`

| Grupo | Configuración que preservar/revisar |
|---|---|
| Perfiles | `GANA_RUNTIME`, `GANA_PROFILE`, `GANA_APPROVAL_MODE`; distinguir configuración del operador y overrides de wrappers |
| Identidad del modelo | `AGENT_PROVIDER`, `AGENT_MODEL`, `AGENT_REASONING_EFFORT`, `AGENT_FAST_MODE`, defaults Daily/strategy y policy prematch |
| Presupuestos | `AGENT_MAX_STEPS`, `AGENT_MAX_COST`, `GANA_MAX_*`, `GANA_CRON_MAX_*`, límites de fixtures/provider/research; no confundirlos con créditos de cuenta |
| Timeouts/retries | `GANA_AGENT_TIMEOUT_MS`, `GANA_RESEARCH_AGENT_TIMEOUT_MS`, `GANA_SCORING_AGENT_TIMEOUT_MS`, `*_JSON_ATTEMPTS` y backoff de wrappers |
| Fútbol | URL API, timezone, season, mercados, presets/allowlists de casas, low-odds, kickoff window y required leagues |
| Evidencia | `AGENT_NATIVE_WEB_SEARCH*`, `GANA_WEB_MODE`, freshness, reuse y Browser Use; la equivalencia de web live debe ser explícita |
| Publicación | Targets específicos de recomendaciones, validaciones, estrategia y alertas; límites/paginación, cohortes y política prematch |
| Directorios | Artifact root, sesiones, repositorio, binarios y PATH del servicio; eliminar rutas absolutas al usuario en código nuevo |
| Mantenimiento/retención | Pausa, días de retención, lotes, timeouts de DB, historial y tablas protegidas |
| Acceso a canales | Allowlist de usuarios, home channels, thread targets y proxy si existen; son configuración privada, aunque no sean tokens |

La precedencia de configuración debe documentarse y testearse: defaults < archivo
versionado < entorno del servicio < argumentos explícitos, conservando overrides
intencionales por flujo. Si dos nombres legacy/nuevos expresan valores distintos,
fallar con error redactado en vez de elegir silenciosamente

### Configuración nueva propuesta, todavía no implementada

| Nombre propuesto | Uso |
|---|---|
| `AGENT_PROVIDER=pi` | Opt-in al adaptador Pi después de ampliar la allowlist de Gana |
| `GANA_PI_MODEL_PROVIDER` | Provider Pi, inicialmente `openai-codex`; separado del harness |
| `GANA_PI_AGENT_DIR` | Store privado usado explícitamente por el worker/TUI, sin depender del home de otro proceso |
| `GANA_DAILY_MODEL` | Nombre neutral para sustituir `GANA_DAILY_CODEX_MODEL`, con alias legacy probado |
| `GANA_ENV_FILE` | Loader centralizado de secretos/configuración del servicio, aplicado también a wrappers e instaladores |
| `GANA_EXECUTION_MODE` | `production` o `shadow`; shadow debe bloquear publicación y exigir almacenamiento separado |

Estos nombres no deben agregarse a `.env` esperando que el código actual los use.
No redefinir `CODEX_HOME` como directorio Pi. `PI_CODING_AGENT_DIR` es la variable
documentada por Pi para su directorio; el adaptador puede preferir `agentDir`
explícito para no depender del entorno global

## 3. Distribución de credenciales entre procesos

| Proceso | Necesita | No debe recibir |
|---|---|---|
| Worker Pi de scoring/parlay/strategy | Auth del modelo y contexto redactado | DB, Discord, Telegram, key deportiva, historial de credenciales |
| Worker Pi de research | Auth del modelo y acceso tipado al broker de búsqueda/lectura | Tokens del broker, DB o publicador; shell genérica |
| Coordinador/servicio deportivo | DB operativa, API-Football, políticas/límites | `DIRECT_URL` de administración salvo operación específica |
| Broker de research | Tokens de búsqueda/Browser Use necesarios | Tokens Discord y credenciales de administración DB |
| Publicador | Bot Discord o webhook elegido y acceso mínimo al ledger | Credenciales de modelos y Browser Use |
| Administrador de esquema/backups | Credenciales DB limitadas al trabajo solicitado | Sesiones del agente y credenciales sociales |
| Pi TUI del operador | Store Pi propio y comandos Gana autorizados | Carga automática de todos los secretos del servicio |

No pasar `...process.env` a cada subprocess como ocurre en varias rutas actuales.
Construir un entorno permitido por rol. El aislamiento evita que una herramienta
de archivo/shell acceda a secretos ajenos; redacción y prompts son defensas
adicionales, no reemplazos de esa separación

## 4. Procedimiento de traslado privado

1. **Resolver los stores de origen por nombre.** Confirmar que cada credencial es
   necesaria y quién la consume. No ejecutar `cat .env`, `env`, `set`, dumps de
   config ni comandos con secretos en argumentos/logs
2. **Crear destino privado fuera de Git.** Propuesta en el host actual:
   `~/.config/gana/secrets.env` para servicios y `~/.config/gana/pi/` para auth Pi,
   con directorios 0700 y archivos 0600. Es una propuesta; no se crearon stores ni
   se copió material sensible durante el estudio
3. **Copiar solo secretos estáticos necesarios** mediante proceso local/gestor de
   secretos, sin stdout. Conservar nombres, no prefijos/sufijos ni hashes públicos
   de valores. El `.env` actual puede seguir funcionando durante transición; el
   loader externo necesita implementación uniforme antes de retirarlo
4. **Autenticar Pi de forma independiente.** Arrancar la instalación fijada al
   directorio privado y usar `/login openai-codex`. El operador completa el flujo.
   No pegar URLs de callback, códigos ni tokens en docs, chat o artifacts. Verificar
   refresh y acceso desde el usuario real del scheduler
5. **Configurar broker/publicador.** Tomar `DISCORD_BOT_TOKEN` y solo la configuración
   Discord necesaria del store Hermes, sin importar su `.env` completo. Conservar
   roles, allowlists y target/thread routing. Elegir la credencial de búsqueda tras P1
6. **Verificar presencia y permisos sin mostrar valores.** Reportar booleanos,
   permisos, rol consumidor y éxito/fallo tipado. Comprobar vigencia con pruebas
   read-only; aprobar separadamente inferencia paga, tareas Browser Use o envío canary
7. **Probar reinicio y rollback.** La cuenta que ejecuta cron/launchd debe acceder al
   store bajo sesión no interactiva. Si se usa Keychain, probar específicamente ese
   contexto; no asumir que un keychain abierto en la TUI queda disponible al servicio
8. **Retirar accesos legacy después de la aceptación.** No rotar ni borrar por defecto
   antes de terminar rollback. Si hubo exposición, rotar la credencial afectada con
   coordinación del servicio, sin conservar su valor anterior en historial compartido

Pi admite API keys resueltas por comandos privados en `auth.json`, pero los
comandos se ejecutan con permisos del proceso y su salida se cachea en memoria.
Esto sirve para un gestor de secretos; no convierte a cualquier extensión en
código confiable. Ver [providers fijado a versión](https://github.com/earendil-works/pi/blob/06a466935536f8c9bcacb2d5efc0fc021be1bdff/packages/coding-agent/docs/providers.md)

## 5. Estado fuera de Git y respaldo

| Estado | Tratamiento |
|---|---|
| PostgreSQL/Supabase | Conservar DB actual. Backup restaurable y snapshot lógico consistente antes del corte; preservar schema `gana_ops`, migraciones y relaciones |
| Ledger publicado | Preservar PublicRecommendationPublication, IDs, targets, payload hashes, displayedPredictionIds, parent revisions y estado de entrega |
| `.artifacts/gana-v9/runs` | Rescatar artifacts canónicos de Daily/review/model-evidence/validation/metrics, fuentes y revisiones enlazadas |
| `.artifacts/gana-v9/cron` | Locks por fecha, estado, receipts, reservas y reconciliación; distinguir archivos de estado de mutex/procesos vivos |
| Otros artifacts | Preservar caché de ligas, snapshots necesarios, calibration/feedback, retención y trazas según referencias; no copiar solo “el último JSON” |
| `.sessions` | Archivar las 27 sesiones locales con redacción; no sustituir archivos JSONL Pi por formato Gana |
| Historial Codex/Hermes | No copiar todo el home. Exportar solo decisiones/contexto necesarios, redactados y con origen histórico explícito |
| Skills/config/docs | Git más archivos ajenos aún no versionados que el usuario decida preservar; hashes de prompts intactos |
| Secretos | Respaldo cifrado independiente, acceso limitado y restauración validada; nunca mezclado con artifacts públicos |

El volumen observado de artifacts es aproximadamente 1,95 GiB; puede crecer
durante el estudio. Recontar al congelar el corte. Reservar espacio para original,
backup y restauración de prueba, además de la DB cuyo tamaño no se midió

El script `scripts/gana-published-lineage-fingerprint.mjs` ya permite una huella
read-only del historial y comparar contra un snapshot. No se ejecutó sobre DB en
este estudio. En la implementación, compararlo sobre la misma cohorte antes y
después del cambio; congelar escrituras o usar un corte explícito para evitar
diferencias legítimas por publicaciones nuevas. No asumir soporte de otro schema:
el script actual exige `gana_ops`

No importar las 62.238 salidas al prompt de Pi. Recuperar solo evidencia acotada
por run/fixture/fecha, con cutoff y provenance. Compaction de conversación no
equivale a una política de retención de evidencia deportiva

## 6. Programación y publicación

Registros Hermes inspeccionados:

| Job | ID local | Frecuencia | Destino propuesto |
|---|---|---|---|
| `gana-v9-daily-operations` | `aa5989740632` | 07:15, 10:15, 13:15, 18:15, 22:15 Guatemala | Scheduler del sistema → dispatcher actual adaptado |
| `gana-v9-prematch-refresh` | `daf88c3535fd` | Cada 15 minutos | Mismo scheduler → wrapper prematch adaptado |

Los registros estaban habilitados y en estado `scheduled`. Eso no demuestra que
el daemon esté saludable. Volver a inspeccionar jobs/procesos antes del corte,
porque pueden haber cambiado. La autoridad única significa un dueño por cada uno
de esos dos jobs; no eliminar prematch para lograr artificialmente “un solo job”

En macOS, completar el instalador launchd existente para prematch y resolver
timezone del sistema frente a Guatemala. Declarar Node/binarios fijados, cwd,
config externa, stdout/stderr redactados y comportamiento tras sleep/reboot. Un
host suspendido no garantiza disparos exactos de prematch: si eso es requisito,
decidir operación siempre activa o servidor aparte

El envío Discord mantiene el orden actual: validar artifact y horarios → preparar
payload → reservar/hash/ledger → enviar → confirmar message IDs. Error incierto
después de POST exige reconciliación manual/readback, no retry automático. El
publicador debe impedir menciones no previstas y conservar paginación, campos y
separación de aprobadas/review-delivered/revisiones

No implementar envíos mediante texto libre del agente. Pi solicita operaciones
tipadas; el motor decide si existe elegibilidad y autorización de publicación

## 7. Archivos Pi y empaquetado

Propuesta de layout, sin crear todavía configuración ejecutable `.pi`:

```text
.pi/
  settings.json                # Recursos/versiones públicas, sin secretos
  extensions/gana.ts           # Comandos del operador, sobre servicios Gana
  prompts/                    # Atajos, no contratos analíticos duplicados
.agents/skills/                # Runbooks portados, una fuente canónica
skills/                        # 18 contratos analíticos conservados
src/providers/agentic/pi/      # Worker/adaptador propuestos
src/tools/                     # Ejecutores/policies neutrales
~/.config/gana/secrets.env     # Privado, fuera del checkout
~/.config/gana/pi/auth.json    # Privado, login Pi propio
```

Versionar solo recursos revisados. Agregar exclusiones para sesiones, auth, caches
y archivos privados Pi si algún perfil los ubica dentro del proyecto. El `.gitignore`
actual no tiene reglas Pi específicas. No publicar un paquete npm durante la
migración; una extensión local basta. Si luego se distribuye, separar el paquete
de extensiones del host SDK: Pi recomienda dependencias peer para sus librerías
provistas por el host, evitando duplicar registries/clases

MCP no es necesario para la primera integración in-process. Si se incorpora un
servidor, pin de versión, scopes, configuración sin tokens literales, transporte
compatible y límites. No trasladar URLs autenticadas ni las sesiones del plugin
Codex Desktop como si fueran credenciales portables

## 8. Checklist de entrega al operador

- [ ] Versiones Node/Pi/lockfile y hashes de contratos fijados
- [ ] Credenciales propias Pi, modelo y refresh probados en usuario de servicio
- [ ] Broker de research real y presupuesto aceptado
- [ ] Matriz de secretos/roles implementada; cero valores en repo/logs/sesiones
- [ ] DB/artifacts/ledger restaurados en prueba sin pérdida de lineage
- [ ] Shadow separado en DB y archivos, con publicación bloqueada por código
- [ ] Daily y prematch completos en el nuevo scheduler
- [ ] Discord independiente de Hermes, payloads equivalentes y receipts verificados
- [ ] Cutover autorizado, procesos drenados y estados inciertos reconciliados
- [ ] Primera publicación Pi y validación posterior verificadas
- [ ] Rollback practicado y ventana de observación cumplida
- [ ] Dependencias legacy retiradas solo al cumplir todos los gates
