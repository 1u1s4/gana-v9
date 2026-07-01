# Brief para imports legacy Notion -> Markdown

Fuente de verdad nueva: este repo (`/Users/luisalvarado/Documents/GitHub/gana-v9`).

## Decisión operativa

- Notion deja de ser la fuente de verdad para gana-v9.
- Toda documentación canónica debe vivir como `.md` versionado en GitHub.
- Notion queda únicamente como referencia histórica exportada.
- No copiar secretos, tokens, URLs privadas sensibles ni credenciales a Markdown.

## Export inicial

- Export crudo: `docs/notion-migration/exported/`
- Manifest: `docs/notion-migration/manifest.json`
- Índice: `docs/notion-migration/README.md`

## Flujo esperado por agente si aparece material legacy

1. Revisar el subset asignado en Paperclip.
2. Leer el export crudo relevante desde `docs/notion-migration/exported/`.
3. Normalizarlo a documentación canónica en `docs/`, `docs/planes/`, `docs/operations/`, `docs/growth/`, `docs/competitive-intelligence/` o el path que corresponda.
4. Preservar trazabilidad al documento original usando frontmatter o sección `Fuente Notion` con `notion_id` y título.
5. Eliminar duplicados obvios y preferir español claro.
6. Actualizar links internos para apuntar a rutas del repo, no a Notion.
7. Reportar en el issue qué archivos quedaron canónicos y qué quedó pendiente.

## Criterios de aceptación globales

- Cada documento relevante de Notion tiene una decisión: migrado, fusionado, obsoleto o pendiente con razón.
- Las decisiones quedan reflejadas en `docs/notion-migration/manifest.json` o en un índice derivado.
- README/índices del repo apuntan a los nuevos `.md`.
- No quedan dependencias operativas de Notion.
- `git diff --check` pasa antes de cerrar tareas.
