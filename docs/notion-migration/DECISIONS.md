# Decisiones de migracion Notion J-104

Estado: canonico para el scope tecnico/arquitectura. Actualizado: 2026-07-01.

## Alcance

J-104 migra la documentacion tecnica/arquitectura desde Notion al repo `gana-v9`. Este ledger cubre el subset tecnico relevante; documentos personales, growth/marketing, contenido y pages de producto que no gobiernan arquitectura quedan fuera de este cierre salvo que esten listados explicitamente.

## Resultado

- Nuevo punto de entrada canonico: [docs/architecture/README.md](../architecture/README.md).
- Arquitectura normalizada: [docs/architecture/system-architecture.md](../architecture/system-architecture.md).
- Export crudo de Notion: `docs/notion-migration/exported/` queda como evidencia historica, no como fuente de verdad.
- Pagina exportada `Mis api keys`: reemplazada por tombstone sin secretos. No restaurar ni versionar credenciales.

## Ledger

| Fuente Notion/export | Decision | Destino canonico | Notas |
| --- | --- | --- | --- |
| `J-90 Indice operativo de Ingenieria / Tecnica` | Migrado y normalizado | `docs/architecture/system-architecture.md` | Se actualizo a la forma real del repo `gana-v9`; referencias a `apps/*` y `packages/*` quedan historicas. |
| `J-91 Repo, publicacion y seguridad para indice CTO` | Fusionado | `docs/architecture/system-architecture.md` | Se incorporaron limites de publicacion, secretos, scans y reglas de seguridad sin copiar valores privados. |
| `J-95 Mapa maestro de workstreams P0` | Fusionado | `docs/architecture/README.md`, este ledger | Define la regla repo/Paperclip/Notion y separa estado vivo de evidencia historica. |
| `J-33 Roadmap tecnico, blockers y ownership de entrega` | Archivado | Paperclip para blockers vivos | La pagina queda como contexto historico; no decide estado actual. |
| `Gana v9 Notion Documentation Operating Standard (J-60)` | Reemplazado para el repo | `docs/notion-migration/AGENT_BRIEF.md`, este ledger | La regla nueva es docs versionados en GitHub. |
| `Mis api keys` | Omitido/redactado | Tombstone en `docs/notion-migration/exported/mis-api-keys--34dbea9e.md` | El contenido original contenia credenciales detectadas por gitleaks. No migrar. |
| Data source snapshots `untitled--*.md` | Historico | Sin destino canonico J-104 | Snapshots de bases Notion no son arquitectura ejecutable del repo. |
| Growth/marketing/content pages | Fuera de scope J-104 | Pendiente de owners de growth/content si aplica | No mezclar con arquitectura tecnica. |
| Personal finance/personal pages | Fuera de scope y no canonicables | Ninguno | No pertenecen al repo tecnico. |

## Reglas futuras

- Cualquier nuevo doc tecnico debe vivir bajo `docs/architecture/`, `docs/planes/`, `docs/operations/` o el path repo adecuado.
- Si una pagina exportada de Notion se vuelve canonica, crear o actualizar un `.md` limpio y agregar una fila a este ledger.
- No enlazar Notion como unica fuente de un proceso operativo. Si se conserva un link, debe ser trazabilidad historica.
- Antes de promover material de `docs/notion-migration/exported/`, correr un scan redacted y revisar que no contenga credenciales, PII operativa o datos privados.
