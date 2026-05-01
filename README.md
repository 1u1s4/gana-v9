# Gana Agent TUI

Interfaz de terminal personalizada para agentes. Por defecto usa tu autenticacion local de Codex (`~/.codex/auth.json`) mediante `codex exec`, y conserva Gemini CLI y OpenRouter como backends opcionales.

## Uso

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Configura credenciales:

   ```bash
   cp .env.example .env
   ```

   Para el backend Codex no necesitas agregar una API key si ya hiciste `codex login`.
   Para el backend Gemini no necesitas agregar una API key si ya iniciaste sesion con `gemini`.
   Si cambias `AGENT_PROVIDER=openrouter`, agrega `OPENROUTER_API_KEY`.

3. Ejecuta la TUI:

   ```bash
   npm start
   ```

## Acceptance live productivo

La aceptacion productiva es manual y usa la CLI real con DB, API-Football y auth local del provider configurado. Usa siempre una fecha absoluta:

```bash
pnpm gana db status
pnpm gana football status
pnpm gana filters show
GANA_MAX_FIXTURES_PER_RUN=5 pnpm gana run --date YYYY-MM-DD
pnpm gana artifacts --run-id RUN_ID
pnpm gana export --run-id RUN_ID
pnpm gana validate --date YYYY-MM-DD
```

Requiere `DATABASE_URL`, `API_FOOTBALL_KEY` y auth de `AGENT_PROVIDER` (`codex`, `gemini`, `cursor` u `openrouter`). El run debe producir `runId`, artifacts, evidence pack, predictions, candidato de parlay, verdict y logs/artifacts sin secretos.

## Configuracion

Puedes ajustar el provider, modelo, estilo visual, presupuesto y carpeta de sesiones en `agent.config.json`.

Providers validos:

- `codex` con modelos como `gpt-5.5`.
- `gemini` con modelos como `gemini-2.5-flash`.
- `cursor` con modelos como `composer-2-fast`.
- `openrouter` con IDs de OpenRouter.

Comandos disponibles dentro de la TUI:

- `/help`: lista comandos.
- `/provider`: lista providers disponibles y cambia entre `codex`, `gemini`, `cursor` y `openrouter`.
- `/model`: lista, busca y cambia modelos del provider activo.
- `/fast`: alterna modo rapido cuando el provider/modelo lo soporta.
- `/think low|medium|high|xhigh`: ajusta nivel de razonamiento en Codex o cambia a una variante equivalente en Cursor cuando exista.
- `/web`: muestra o cambia el uso obligatorio de web search nativo: `on`, `off`, `cached`, `live`.
- `/new`: inicia una conversacion nueva.
- `exit`: cierra la TUI.

Backend Codex:

- Usa `codex exec --json` como subprocess.
- Lee la autenticacion desde `CODEX_HOME` o `codexHome`.
- Fuerza web search nativo con `web_search="live"` cuando `nativeWebSearch` esta activo.
- Reanuda el thread de Codex entre turnos hasta usar `/new`.
- Muestra comandos de shell ejecutados por Codex dentro del renderer de herramientas.
- `/model` lee `config/codex-models.json`.

Actualizar el listado de modelos Codex:

```bash
npm run update:codex-models
```

Backend Gemini CLI:

- Disponible configurando `provider: "gemini"` y un modelo como `gemini-2.5-flash`.
- Usa `gemini --prompt --output-format stream-json` como subprocess.
- Lee la autenticacion local desde `~/.gemini/oauth_creds.json`.
- Fuerza el uso del tool nativo `google_web_search` cuando `nativeWebSearch` esta activo.
- Reanuda la sesion de Gemini entre turnos hasta usar `/new`.
- `/model` primero lee `config/gemini-models.json` desde este repo y luego agrega modelos conocidos del CLI de Gemini como fallback.

Actualizar el listado de modelos Gemini:

```bash
npm run update:gemini-models
```

El script lee modelos desde el Gemini CLI instalado. Si defines `GEMINI_API_KEY` o `GOOGLE_API_KEY`, tambien intenta consultar la API de Gemini y fusionar esos resultados.

Backend Cursor Agent:

- Disponible configurando `provider: "cursor"` y un modelo como `composer-2-fast`.
- Usa `cursor-agent --print --output-format stream-json` como subprocess.
- Lee tu autenticacion local de Cursor Agent.
- Fuerza el uso del tool nativo `WebSearch` cuando `nativeWebSearch` esta activo; el harness usa `--force` para aprobarlo en modo headless.
- Reanuda la sesion de Cursor entre turnos hasta usar `/new`.
- `/model` lee `config/cursor-models.json`.

Actualizar el listado de modelos Cursor:

```bash
npm run update:cursor-models
```

Backend OpenRouter:

- Disponible configurando `provider: "openrouter"` y `OPENROUTER_API_KEY`.
- Incluye lectura, escritura y edicion de archivos.
- Incluye busqueda por glob y grep, listado de directorios y ejecucion de shell con timeout.
- Incluye web search y datetime como herramientas server-side de OpenRouter.
