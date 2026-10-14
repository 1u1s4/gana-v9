# Evidencia del estudio de migración a Pi

Fecha de referencia: 2026-10-13, America/Guatemala

## Resultado de la investigación

Se entregó el [estudio con plan completo](../24-migracion-a-pi.md) y el
[runbook de credenciales y operación](secretos-y-operacion.md). La conclusión es
viabilidad técnica condicionada a paridad de research web, estructura, seguridad,
autenticación y operación. No se ejecutó una migración productiva ni se declaró
comprobada la calidad del modelo a través de Pi

## Fuentes y fotografía del entorno

- Gana: rama `main`, commit `65ab484`, `fix: automate Astra prematch reviews and preserve factual freshness`
- Dirty state previo: `docs/architecture/README.md`, `docs/harness-strategy-review-log.md`, `.agents/skills/diagram-design/`, `docs/architecture/diagrams/`
- Pi fuente: tag `v1.2.0`, commit `06a466935536f8c9bcacb2d5efc0fc021be1bdff`; descarga sparse bajo `tmp/pi-feasibility/upstream`
- Pi npm: `@earendil-works/pi-coding-agent@1.2.0`, engines `node >=22.19.0`
- Integridad npm observada: `sha512-h/4WaVWv1VlCaY8x8qEN5U+7jbF/e7+Ck6moPeEOFn5juMTWwNAXjwgYM7gRgbBYh8Zppwt6qWvJDzNTf4GNEQ==`
- Host de prueba: Node `22.22.3`, pnpm `10.27.0`
- Dependencias Gana desde `pnpm-lock.yaml`: OpenRouter agent `0.4.0`, Prisma `6.19.3`, TypeScript `6.0.3`, tsx `4.21.0`

La descarga de fuentes/paquetes usó red. No se hicieron requests a modelos,
API-Football, Browser Use, DB, Discord o Telegram. La inspección de credenciales
produjo únicamente nombres, presencia y permisos; no hubo login ni transferencia
de credenciales. Las comprobaciones de secretos posteriores solo comparan valores
en memoria y reportan conteos/rutas, nunca su contenido

## Pruebas ejecutadas

| Comprobación | Resultado | Qué demuestra |
|---|---|---|
| Typecheck de Gana, copia aislada | Exit 0 | Los tipos del baseline compilan con sus dependencias fijadas |
| Pruebas focales de runtime, agent/provider, research y seguridad | **164/164**, 0 fallos, 0 skipped | Contratos existentes y replays cubiertos por esas pruebas |
| Notifier Discord, targets, strategy/stats y salida Telegram | **57/57**, 0 fallos, 0 skipped | Rendering/routing/contratos existentes con fixtures de prueba |
| Inventario de contratos | **18/18**, schemas/manifests presentes y hashes de prompt coincidentes | Se puede conservar exactamente el contrato versionado |
| Smoke Pi SDK 1.2.0 | Exit 0 | Creación real de sesión, allowlist de herramientas, configuración y catálogo local |

Total: **221 pruebas existentes aprobadas**, además del smoke SDK. No se ejecutó
la suite completa ni tests live. Los tests existentes usan fixtures/stubs cuando
corresponde: no equivalen a un E2E real con Pi

### Preparación de la copia Gana

Se copiaron `src`, `scripts`, `skills`, `fixtures`, `config`, `prisma`, el notifier
local y los manifests a `tmp/pi-feasibility/gana-baseline`, sin `.env`, artifacts,
sesiones ni stores de credenciales. Se instaló con:

```bash
pnpm --ignore-workspace install --frozen-lockfile --ignore-scripts
./node_modules/.bin/prisma generate
./node_modules/.bin/tsc --noEmit
```

`prisma generate` generó el cliente local; no conectó a DB ni aplicó migraciones.
Los subprocess de verificación recibieron un entorno reducido a PATH/LANG/TMPDIR,
sin credenciales del proyecto

El primer `pnpm typecheck` en el checkout falló porque no existía `node_modules`.
Una primera instalación desde la copia temporal detectó el workspace padre y
restauró sus dependencias ignoradas por Git, sin scripts ni cambios de lockfile.
Se corrigió usando `--ignore-workspace` y todas las pruebas reportadas se hicieron
en la copia aislada. Quedan dependencias descargadas en `node_modules/` y en `tmp/`;
no se modificó código productivo, configuración privada ni programación

### Pruebas focalizadas

Desde la copia aislada, se ejecutó:

```bash
node --import tsx --test \
  src/agent-provider-args.test.ts \
  src/providers/agentic/helpers.test.ts \
  src/permissions/policy.test.ts \
  src/permissions/redaction.test.ts \
  src/security/no-monetary-actions.test.ts \
  src/harness-production-grade.test.ts \
  src/runtime/run-lifecycle.test.ts \
  src/runtime/control-plane.test.ts \
  src/daily/runtime-defaults.test.ts \
  src/evidence/research.test.ts \
  scripts/tests/daily-ops-dispatch.test.mjs \
  scripts/tests/pre-match-refresh.test.mjs \
  scripts/tests/validation-workflow.test.mjs \
  scripts/tests/discord-prepared-payload.test.mjs

node --test \
  .agents/skills/discord-recommendation-notifier/tests/notify-discord-recommendations.test.mjs \
  .agents/skills/discord-recommendation-notifier/tests/notify-discord-daily-stats.test.mjs \
  .agents/skills/discord-recommendation-notifier/tests/discord-targets.test.mjs \
  .agents/skills/discord-recommendation-notifier/tests/notify-discord-strategy-review.test.mjs \
  scripts/tests/gana-telegram-rich-output.test.mjs
```

Logs locales, ignorados por Git:

- `tmp/pi-feasibility/typecheck.log`
- `tmp/pi-feasibility/focused-tests.log`
- `tmp/pi-feasibility/notifier-tests.log`

### Prueba real del SDK sin inferencia

Instalación temporal: `tmp/pi-feasibility/pi-smoke`, con dependencias directas
exactas `@earendil-works/pi-coding-agent@1.2.0` y `@earendil-works/pi-ai@1.2.0`,
instaladas mediante `npm install --ignore-scripts --no-audit --no-fund`. No se
instaló Pi globalmente ni se agregó a las dependencias productivas

Comando desde el repo:

```bash
node docs/planes/pi-migration-2026-10-13/pi-sdk-smoke.mjs tmp/pi-feasibility/pi-smoke
```

El [script conservado](pi-sdk-smoke.mjs) importa el SDK instalado, crea un
`ModelRuntime` con archivos privados temporales y sin refresh de catálogo, usa
`SessionManager.inMemory`, settings y loader explícitos, selecciona Sol high y
registra solo `gana_inspect_contract`. Comprueba una sesión sin mensajes, el catálogo
de Sol/Astra, suscripción/desuscripción y disposal. El store de auth creado por
Pi está vacío y se elimina con el directorio temporal

Resultado final observado:

```json
{
  "ok": true,
  "piVersion": "1.2.0",
  "models": [
    { "id": "gpt-5.6-sol", "api": "openai-codex-responses" },
    { "id": "gpt-6-astra", "api": "openai-codex-responses" }
  ],
  "activeTools": ["gana_inspect_contract"],
  "thinkingLevel": "high",
  "fetchAttempts": 0,
  "modelRequests": 0,
  "credentialsCopied": false,
  "authStoreEmpty": true
}
```

Durante el desarrollo del smoke se corrigieron dos supuestos: el entrypoint SDK
es ESM y no se resuelve como un require CommonJS; crear el runtime puede escribir
un `auth.json` vacío. Esos fallos iniciales no afectaron stores existentes. La
versión final usa rutas del paquete fijado y verifica que no se copiaron credenciales

El contador de fetch es instrumentación de esta prueba, no un firewall. El smoke
no llama `session.prompt`, no prueba tool execution/enforcement, OAuth, schema
delivery, web, cancellation en vuelo ni calidad. Esas pruebas figuran como gates
de P1/P7 y no se dan por resueltas

### Inventarios

- [Variables](inventario-entorno.json): 158 nombres; 149 con referencias estáticas; 61 presentes como nombres en `.env`
- [Contratos](contratos-verificados.json): los 18 prompts coinciden con su manifest; sin cambios de contenido
- Inventario de archivos operativos: 62.238 archivos/2.092.368.768 bytes bajo `.artifacts/gana-v9` y 27/12.678 bytes en `.sessions`, al momento del conteo
- Scheduler: lectura de JSON local de Hermes, plists/launchctl, crontab y directorio local de automations; ninguna mutación

## Revisión final del entregable

La verificación documental comprueba que todos los links locales nuevos existen,
que los JSON son válidos, que no hay whitespace inválido, que las referencias del
inventario apuntan a archivos/líneas existentes y que no aparecen valores reales
de las credenciales inspeccionadas en los entregables. Los resultados de cierre
quedan en [verificacion-final.json](verificacion-final.json)

No se envió el plan a terceros, no se creó PR, no se hizo commit/push y no se
instaló ningún scheduler. Las modificaciones versionables de este estudio están
limitadas al documento principal y su carpeta complementaria

## Pendientes reales para implementar

1. Login propio Pi y canaries de Sol/Astra bajo la cuenta del servicio
2. Elegir/probar búsqueda live con provenance equivalente y presupuesto
3. Implementar y demostrar salida estructurada, cancelación, límites y redacción
4. Replays/shadow/canary con DB aislada y publicación determinista
5. Sustituir delivery/scheduler Hermes, incluyendo prematch y alertas
6. Backup/restore, cutover autorizado, rollback y ventana de observación

Son gates del trabajo futuro, no evidencia de que el estudio quedó incompleto
