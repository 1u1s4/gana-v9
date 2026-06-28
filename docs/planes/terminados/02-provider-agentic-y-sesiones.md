# Provider Agentic y Sesiones

## Objetivo

Formalizar el contrato comun de Codex CLI, deprecated provider CLI y Cursor Agent que ya existe en `src/agent.ts`, integrarlo con runtime/session/audit, y mantener OpenRouter solo como compatibilidad tecnica.

## SRS cubierto

- Secciones 2.7, 6.2, 7, 11 RF-002, RF-003.
- Secciones 14.1, 16.4, 17.2, 20.
- Cambios requeridos 19.1, 19.4, 19.6.

## Contexto actual

`src/agent.ts` ya implementa:

- `AgentEvent` normalizado: `text`, `tool_call`, `tool_result`, `reasoning`.
- Codex via `codex exec --json`.
- deprecated provider via `deprecated-provider --prompt --output-format stream-json`.
- Cursor via `cursor-agent --print --output-format stream-json --stream-partial-output`.
- OpenRouter via `@openrouter/agent`.
- Enforcement de web search nativo cuando `nativeWebSearch` esta activo.

`src/commands.ts` ya implementa:

- `/provider`
- `/model`
- `/fast`
- `/think`
- `/web`
- `/new`

## Cambios requeridos

### Contrato provider

Crear `src/providers/agentic/types.ts`:

```ts
type AgentProvider = 'codex' | 'deprecated-provider' | 'cursor';

interface AgentProviderState {
  provider: AgentProvider | 'openrouter';
  ready: boolean;
  authStatus: 'ready' | 'missing' | 'unknown';
  model: string;
  sessionId?: string;
  threadId?: string;
  supportsFast: boolean;
  supportsReasoning: boolean;
  supportsNativeWebSearch: boolean;
}
```

Mover o reexportar `AgentEvent` desde una ubicacion compartida para que runtime, session, renderer y audit no dependan circularmente de `src/agent.ts`.

### Session status

Agregar slash command `/session` en `src/commands.ts`:

Debe mostrar:

- session JSONL path;
- provider agentic activo;
- modelo activo;
- Codex thread ID / deprecated provider session ID / Cursor session ID redacted;
- run ID activo si existe;
- artifact root;
- usage acumulado;
- native web search status;
- profile y approval mode.

No debe imprimir auth completa ni tokens.

### Provider switching

Mantener el comportamiento actual de `/provider`, pero agregar eventos:

- `agent.provider_changed`
- `agent.session_reset`
- `approval.auto_granted` si el cambio ocurre bajo `full-permissions` y toca configuracion sensible.

Al cambiar de provider:

- limpiar mensajes del provider anterior;
- limpiar `codexThreadId`, `deprecated-providerSessionId`, `cursorSessionId`;
- mantener la session JSONL del harness o abrir nueva session segun comportamiento actual de `resetProviderSession`;
- registrar evento en session y audit si existe run activo.

### Model registry

Mantener los scripts:

- `scripts/update-codex-models.ts`
- `scripts/update-deprecated-provider-models.ts`
- `scripts/update-cursor-models.ts`

`/model` debe seguir leyendo el catalogo del provider activo. No debe mezclar modelos entre providers.

Agregar status cuando el catalogo local no exista:

- mostrar path esperado;
- sugerir script de actualizacion;
- usar fallback actual solo como degradacion explicita.

### Web search nativo

El comportamiento actual fuerza web search cuando `config.nativeWebSearch` esta activo. Ajustar la semantica:

- `/web on|off|cached|live` controla disponibilidad y obligatoriedad.
- Las tareas de research actual deben exigir web search.
- Las tareas locales de codigo no deben exigir web search salvo que el usuario o el comando lo pidan.

Implementar helper:

```ts
interface NativeWebSearchRequirement {
  required: boolean;
  mode: 'cached' | 'live';
  reason?: string;
}
```

`runAgent` debe recibir `nativeWebSearchRequirement` por turn o derivarlo desde config para compatibilidad.

### Eventos agentic

Consumir la taxonomia canonica definida en `src/runtime/events.ts`. No crear una lista paralela en provider agentic.

Persistir en session/artifacts:

- `agent.started`
- `agent.delta`
- `agent.tool_call`
- `agent.tool_result`
- `agent.reasoning`
- `agent.completed`
- `agent.failed`
- `agent.provider_changed`
- `agent.session_reset`

Cada evento debe incluir:

- provider;
- model;
- session/thread ID redacted;
- usage si existe;
- command/tool name;
- args redacted;
- runId si existe.

## OpenRouter

OpenRouter se mantiene:

- como compatibilidad tecnica para el backend existente;
- como fallback no estrategico;
- sin aparecer como proveedor principal del MVP productivo.

No debe bloquear los planes deportivos. Los nuevos comandos productivos deben preferir `codex`, `deprecated-provider` y `cursor`.

## Criterios de aceptacion

- `/provider` sigue funcionando para `codex`, `deprecated-provider`, `cursor`, `openrouter`.
- `/model` lista solo modelos del provider activo.
- `/session` muestra estado util sin secretos.
- `/web live` puede marcar web search como obligatorio para research.
- Si web search obligatorio no se usa, el error incluye provider, tool esperado y accion recomendada.
- Cambiar provider reinicia session agentic sin perder auditoria del harness.
- `npm run typecheck` pasa.

## Pruebas

- Unit tests de `providerReady`, `defaultModelForProvider` y loaders de modelos con fixtures JSON.
- Unit tests de enforcement de web search por provider.
- Acceptance manual por provider autenticado:
  - `/provider codex`
  - `/model`
  - `/think high`
  - `/fast`
  - `/web live`
  - `/session`

## Riesgos

- Cursor/deprecated provider/Codex pueden cambiar JSON events. Mantener parsers defensivos y tests con muestras reales.
- No guardar prompt completo en audit log sin pasar por redaccion.
- No tratar OpenRouter como dependencia requerida para comandos deportivos.
