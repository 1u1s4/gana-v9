# Gana Agent TUI

Interfaz de terminal personalizada para agentes con `@openrouter/agent`.

## Uso

1. Instala dependencias:

   ```bash
   npm install
   ```

2. Configura tu API key:

   ```bash
   cp .env.example .env
   ```

   Luego agrega `OPENROUTER_API_KEY` en `.env` o exporta la variable en tu shell.

3. Ejecuta la TUI:

   ```bash
   npm start
   ```

## Configuracion

Puedes ajustar el modelo, estilo visual, presupuesto y carpeta de sesiones en `agent.config.json`.

Comandos disponibles dentro de la TUI:

- `/help`: lista comandos.
- `/model`: busca y cambia modelo desde OpenRouter.
- `/new`: inicia una conversacion nueva.
- `exit`: cierra la TUI.

Herramientas incluidas:

- Lectura, escritura y edicion de archivos.
- Busqueda por glob y grep.
- Listado de directorios.
- Ejecucion de shell con timeout.
- Web search y datetime como herramientas server-side de OpenRouter.
