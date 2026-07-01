# Documentacion canonica de Gana v9

Este directorio es la fuente de verdad versionada para la documentacion operativa, tecnica y de migracion de Gana v9. Desde J-111, Notion queda solo como referencia historica exportada.

## Leer primero

- [Arquitectura tecnica](architecture/README.md)
- [Indice operativo de ingenieria](operations/engineering-operating-index.md)
- [Repo, publicacion y seguridad](operations/repo-publication-security.md)
- [Operacion diaria y cron](daily-operations-cron.md)
- [Skills y contratos del harness](skills.md)
- [Implementacion, harness y publicacion](planes/22-implementacion-harness-y-publicacion.md)
- [SRS MVP productivo online](planes/gana-v9-srs-mvp-productivo-online.md)

## Regla de fuente

- Repo: fuente canonica de arquitectura, runbooks, seguridad, comandos y decisiones tecnicas.
- Paperclip: estado vivo de ejecucion, blockers, owners y cierre de issues.
- Notion: archivo historico exportado bajo [notion-migration](notion-migration/README.md); no usarlo como fuente operativa.

No agregar secretos, DSNs, tokens, screenshots con credenciales ni valores de `.env` reales a Markdown.
