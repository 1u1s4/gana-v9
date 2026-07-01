---
source: notion-migration
migration_issue: J-104
canonical_status: vigente
notion_sources:
  - notion_id: 390bea9e-4736-81ed-9a79-ebc677c8e705
    title: "J-91 Repo, publicacion y seguridad para indice CTO"
  - notion_id: 34cbea9e-4736-81c1-9b2e-e61a498584df
    title: "Checklist de publicacion y release"
  - notion_id: 34cbea9e-4736-8137-aef7-cd020a1c7178
    title: "Legacy repo secret rotation and history rewrite"
---

# Repo, publicacion y seguridad

Este runbook normaliza el estado de repo, publicacion y seguridad desde Notion hacia el repo. Es el complemento operativo del [indice de ingenieria](engineering-operating-index.md).

## Estado actual del repo

- Repo de trabajo: `gana-v9`.
- Runtime principal: TypeScript TUI/headless con Prisma/MySQL.
- Publicacion externa principal: notificaciones Discord desde artifacts diarios y validaciones.
- Dashboard: local, read-only, servido por `pnpm gana dashboard --port 4317`.
- Seguridad base: `.env` ignorado, `.env.example` sanitizado, redaccion en artifacts/logs, gitleaks como scan antes de publicar o abrir ramas.

## Checklist de release seguro

Antes de publicar, promover o abrir una rama sensible:

1. Confirmar que `.env`, `.artifacts/`, `.sessions/`, `node_modules/`, `dist/` y `tmp/` no se versionan.
2. Revisar `.env.example` contra variables nuevas sin valores reales.
3. Ejecutar verificacion focal del cambio:
   - docs/runbook: `git diff --check`
   - TypeScript: `pnpm test` o test filtrado relevante
   - tipos: `pnpm typecheck` cuando cambien contratos o codigo compartido
4. Ejecutar scan de secretos antes de publicacion amplia:

```bash
gitleaks detect --source . --redact=100 --no-banner
```

5. Para scripts shell modificados, validar sintaxis:

```bash
bash -n scripts/<script>.sh
```

6. Registrar en el issue final:
   - archivos canonicos tocados
   - comando de verificacion
   - resultado
   - blockers restantes o "sin blockers"

## Reglas de publicacion y distribucion

- Gana v9 publica recomendaciones como artifacts analiticos y embeds Discord; no coloca apuestas.
- Toda recomendacion debe seguir la frontera de seguridad del README: informacion y entretenimiento, sin garantia de resultado.
- Los flujos diarios documentados en [Operacion diaria y cron](../daily-operations-cron.md) son la ruta canonica para validacion, Daily E2E, strategy review y notificaciones.
- No enviar recomendaciones vacias; los wrappers deben marcar retryable cuando no hay selecciones publicables.
- No omitir gates del council, edge, riesgo o baja calidad para "mantener actividad" en canales.
- Todo output publico debe poder rastrearse a `runId`, fecha, artifact y validacion posterior.

## Secretos y credenciales

Permitido en docs/issues:

- nombres de variables
- clases de credenciales
- comandos con valores redactados
- conteos de findings
- estados de verificacion

Prohibido:

- API keys, DSNs, passwords, token prefixes/suffixes o JWTs
- `.env` reales
- capturas de consola con valores sensibles
- strings historicos de secretos
- URLs con usuario/password/token

Si aparece un secreto:

1. Detener publicacion o push.
2. Remover el valor del workspace actual.
3. Avisar en Paperclip sin pegar el secreto.
4. Rotar o revocar en el proveedor correspondiente.
5. Ejecutar scan actual e historico segun alcance.

## Repos legacy

Las paginas Notion historicas hablan de repos legacy y rewrites. Para este repo, la regla operativa es:

- No hacer force-push, borrado remoto ni rewrite de historia sin autorizacion explicita del owner humano.
- No declarar un repo legacy publicable solo por limpiar el arbol actual; la historia y credenciales externas deben estar resueltas.
- Mantener cualquier evidencia de leaks redactada al 100%.
- Tratar los planes legacy como contexto, no como permiso operativo.

## Comandos de verificacion rapida

Docs-only:

```bash
git diff --check
```

Repo health focal:

```bash
pnpm test
pnpm typecheck
```

Estado de dependencias/runtime:

```bash
pnpm gana db status
pnpm gana football status
pnpm gana filters show
```

Dashboard local:

```bash
pnpm gana dashboard --port 4317
```

## Fuente Notion

Fuentes migradas o fusionadas:

- `docs/notion-migration/exported/j-91-repo-publicacion-y-seguridad-para-indice-cto--390bea9e.md`
- `docs/notion-migration/exported/checklist-de-publicacion-y-release--34cbea9e.md`
- `docs/notion-migration/exported/legacy-repo-secret-rotation-and-history-rewrite--34cbea9e.md`

Los exports vacios de publication/hardening se tratan como obsoletos o cubiertos por este runbook, [Operacion diaria y cron](../daily-operations-cron.md), [Permisos, auditoria y seguridad](../planes/terminados/10-permisos-auditoria-y-seguridad.md) y [Harness production-grade](../planes/terminados/12-harness-production-grade.md).

