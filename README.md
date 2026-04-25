# Gana Agent TUI

Interfaz de terminal personalizada para agentes. Por defecto usa tu autenticacion local de Codex (`~/.codex/auth.json`) mediante `codex exec`, y conserva OpenRouter como backend opcional.

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
   Si cambias `AGENT_PROVIDER=openrouter`, agrega `OPENROUTER_API_KEY`.

3. Ejecuta la TUI:

   ```bash
   npm start
   ```

## Configuracion

Puedes ajustar el provider, modelo, estilo visual, presupuesto y carpeta de sesiones en `agent.config.json`.

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

Backend OpenRouter:

- Disponible configurando `provider: "openrouter"` y `OPENROUTER_API_KEY`.
- Incluye lectura, escritura y edicion de archivos.
- Incluye busqueda por glob y grep, listado de directorios y ejecucion de shell con timeout.
- Incluye web search y datetime como herramientas server-side de OpenRouter.
