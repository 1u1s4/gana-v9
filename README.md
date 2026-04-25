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

## Configuracion

Puedes ajustar el provider, modelo, estilo visual, presupuesto y carpeta de sesiones en `agent.config.json`.

Providers validos:

- `codex` con modelos como `gpt-5.5`.
- `gemini` con modelos como `gemini-2.5-flash`.
- `openrouter` con IDs de OpenRouter.

Comandos disponibles dentro de la TUI:

- `/help`: lista comandos.
- `/model`: busca y cambia modelo desde Codex u OpenRouter, segun el provider activo.
- `/new`: inicia una conversacion nueva.
- `exit`: cierra la TUI.

Backend Codex:

- Usa `codex exec --json` como subprocess.
- Lee la autenticacion desde `CODEX_HOME` o `codexHome`.
- Reanuda el thread de Codex entre turnos hasta usar `/new`.
- Muestra comandos de shell ejecutados por Codex dentro del renderer de herramientas.

Backend Gemini CLI:

- Disponible configurando `provider: "gemini"` y un modelo como `gemini-2.5-flash`.
- Usa `gemini --prompt --output-format stream-json` como subprocess.
- Lee la autenticacion local desde `~/.gemini/oauth_creds.json`.
- Reanuda la sesion de Gemini entre turnos hasta usar `/new`.
- `/model` primero lee `model.available` desde `~/.gemini/settings.json` y luego agrega modelos conocidos del CLI de Gemini como fallback.

Backend OpenRouter:

- Disponible configurando `provider: "openrouter"` y `OPENROUTER_API_KEY`.
- Incluye lectura, escritura y edicion de archivos.
- Incluye busqueda por glob y grep, listado de directorios y ejecucion de shell con timeout.
- Incluye web search y datetime como herramientas server-side de OpenRouter.
