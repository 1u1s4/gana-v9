# Permisos, Auditoria y Seguridad

## Objetivo

Implementar perfiles `standard` y `full-permissions`, approvals auditados, redaccion de secretos, metadata de tools, audit log durable y restriccion explicita de no automatizacion monetaria.

## SRS cubierto

- Secciones 2.9, 2.10, 4.4, 4.5.
- Secciones 16, 17.4, 17.6.
- Criterios de aceptacion 6, 22, 23.

## Contexto actual

`src/tools/*` puede leer, escribir, editar y ejecutar shell en el backend OpenRouter, pero no hay metadata de permisos ni audit log. Los proveedores CLI externos tambien pueden ejecutar herramientas propias. El repo ya usa `codexSandbox`, `geminiApprovalMode` y `cursorForce`, pero no los modela como policy del producto.

## Modulos nuevos

- `src/permissions/types.ts`
- `src/permissions/policy.ts`
- `src/permissions/approvals.ts`
- `src/permissions/audit.ts`
- `src/permissions/redaction.ts`
- `src/permissions/tool-metadata.ts`
- `src/security/no-monetary-actions.ts`

## Tool metadata

```ts
type ToolMetadata = {
  name: string;
  readOnly: boolean;
  mutatesFilesystem: boolean;
  runsShell: boolean;
  network: boolean;
  destructive: boolean;
  requiresApproval: 'never' | 'standard' | 'always';
};
```

Metadata inicial:

- `file_read`, `grep`, `glob`, `list_dir`: read-only, approval never.
- `file_write`, `file_edit`: mutates filesystem, approval standard.
- `shell`: runs shell, approval standard; always si destructivo.
- `api_football_request`: network, approval never si config valida.
- `db_read`: approval never.
- `db_write`: approval standard en mutaciones manuales; auto permitido para runtime validado.
- `artifact_write`: approval never para run activo.
- `artifact_promote`: approval standard.
- `prediction_promote`: approval standard.

## Perfil `standard`

Debe:

- pedir approval para mutaciones sensibles;
- pedir approval para promocion de artifacts/predictions;
- bloquear comandos destructivos no autorizados;
- mantener redaccion y audit log;
- exigir confirmacion para acciones fuera del workspace o con secretos.

## Perfil `full-permissions`

Debe:

- autoautorizar acciones configuradas;
- registrar cada auto-approval;
- mantener redaccion;
- mantener timeouts y limite de output;
- permitir kill switch de sesion;
- permitir `danger-full-access`, `gemini yolo`, `cursor --trust --force` solo si config lo especifica.

No debe:

- borrar audit logs;
- exponer secretos;
- saltarse restriction monetaria;
- ejecutar comandos destructivos no configurados.

## Audit log

Cada accion sensible debe registrar:

- action ID;
- session ID;
- run ID;
- provider agentic;
- modelo;
- profile;
- tool/action name;
- args redacted;
- timestamp;
- result;
- manual approval o auto approval;
- error redacted si falla.

Persistir en:

- `audit_logs` DB;
- `.artifacts/gana-v9/runs/<run-id>/audit-log.jsonl`.

## Redaccion

Aplicar a:

- sessions;
- artifacts;
- DB status;
- provider snapshots;
- audit logs;
- renderer;
- errores.

Patrones minimos:

- API keys;
- OAuth/refresh tokens;
- Authorization headers;
- cookies;
- `DATABASE_URL`;
- URLs con usuario/password/token;
- `.env` completo;
- strings con `sk-`, `ghp_`, JWT-like tokens y claves de proveedor.

## Restriccion monetaria

Bloquear y auditar cualquier intento de:

- ejecutar apuestas;
- conectarse a casas de apuestas para colocar jugadas;
- mover fondos;
- solicitar datos financieros del usuario;
- presentar candidatos como garantia de resultado.

Los comandos `/parlay`, `/score`, `/run` deben incluir en metadata que producen artifacts analiticos.

## Slash commands

- `/profile`: muestra/cambia `standard` y `full-permissions`.
- `/approval`: muestra policy activa, auto-approvals y ultimo audit log.

## Criterios de aceptacion

- `/profile full-permissions` cambia policy y queda auditado.
- `/approval` muestra policy sin secretos.
- Acciones sensibles generan `approval.requested`, `approval.granted` o `approval.auto_granted`.
- `full-permissions` reduce prompts pero conserva auditabilidad.
- Redaccion cubre env vars, DB URL, API key y auth provider.
- Intentos de accion monetaria quedan bloqueados.
- `npm run typecheck` pasa.

## Pruebas

- Unit tests de policy por tool/action/profile.
- Unit tests de redaccion.
- Unit tests de no-monetary-actions con comandos/textos sospechosos.
- Integration test de audit log para DB write/artifact write.
- Smoke manual:
  - `/profile`
  - `/profile full-permissions`
  - `/approval`
  - ejecutar accion auditada y revisar artifact.

## Riesgos

- No se puede interceptar todo lo que haga un CLI externo si opera fuera del harness. Mitigar pasando flags de sandbox/approval y registrando eventos observables.
- Redaccion debe ser conservadora: mejor ocultar de mas que filtrar secretos.
- No mezclar aprobacion productiva con permisos del sandbox de Codex sin audit.

