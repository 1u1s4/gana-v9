---
source: notion
notion_id: 390bea9e-4736-81ed-9a79-ebc677c8e705
notion_url: https://app.notion.com/p/J-91-Repo-publicaci-n-y-seguridad-para-ndice-CTO-390bea9e473681ed9a79ebc677c8e705
title: "J-91 — Repo, publicación y seguridad para índice CTO"
---

# J-91 — Repo, publicación y seguridad para índice CTO

Estado: publicado para el freeze P0 de Notion. Actualizado 2026-06-30 America/Guatemala / 2026-07-01 UTC. No contiene secretos ni valores de credenciales.
Propósito: dar al índice CTO/J-90 una lectura única del estado de repos, publicación, seguridad, blockers y próximas acciones sin tener que reconstruir hilos de Paperclip.
## Resumen ejecutivo
- gana-v8 es el repo público principal. La base actual tiene README, .env.example, SECURITY.md y LICENSE en el workspace; antes de usarlo como flagship hay que confirmar que esos cambios estén commiteados y hacer scan de historia.
- La publicación live debe seguir pasando por publication-engine. J-11 cerró los guardrails base: actor/capability explícito, lineage válido, kill switch/pausas por canal y eventos de auditoría para bloqueos/publicaciones.
- Los cinco repos legacy de alto riesgo tienen árboles sanitizados en el workspace J-18 bajo el scanner usado, pero sus historias todavía conservan evidencia histórica de credenciales. No publicarlos ni force-pushear hasta rotación externa y autorización final.
- Los repos de menor riesgo para salida pública son gana0, v0-v7 y hardening adicional de gana-v8, siempre después de README/env templates y scans finales.
- La ejecución normal sigue congelada por J-87 hasta que Jo valide que los índices Notion estén navegables. Esta página desbloquea solo la parte J-91 del índice de ingeniería.
## Estado por repo
- 1u1s4/gana-v8: público. Estado: base publicable con hardening en curso. Evidencia actual: README público, .env.example, SECURITY.md, LICENSE y documentación de publication governance. Próximo paso: confirmar commit de docs/hardening y ejecutar secret/history scan antes de promoción externa.
- 1u1s4/v0-v7: privado. Estado: publicable tras higiene de archivos. Próximo paso: .env.example sanitizado, README real del producto y scan de historia.
- 1u1s4/gana0: privado. Estado: publicable tras higiene menor. Próximo paso: limpiar setup/PII operativa, agregar README y escanear antes de abrir.
- 1u1s4/gana_v5, gana_v4, v0-gana-v6-dashboard-design, gana_v4-crewAI, jo_gana777: privados y de alto riesgo histórico. Estado: árboles actuales sanitizados según J-77, pero requieren rotación/revocación externa y reescritura de historia antes de cualquier exposición amplia.
## Publicación y runtime
- Fuente de verdad vigente: J-11 cierre de governance y aislamiento. No se acepta ninguna automatización pública que salte publication-engine o degrade actor/capability checks.
- config-runtime separa local-dev, ci-smoke, ci-regression, staging-like, historical-backtest y production, y rechaza mezclas obvias como local-dev con base remota o production con localhost.
- storage-adapters mantiene checks de schema readiness para evitar arranques prod-like sobre schema no validado.
- Verificación documentada en J-11: pnpm --filter @gana-v8/publication-engine test; pnpm --filter @gana-v8/publisher-worker test; pnpm --filter @gana-v8/config-runtime test. Resultado documentado: verde en los tres workspaces.
## Seguridad y credenciales
- No pegar secretos en Notion, Paperclip, README ni issues. Esta página solo lista clases de credenciales y estados; no contiene valores.
- J-77 Current Tree Verification: gitleaks dir --redact=100 reportó 0 findings en gana_v4, gana_v4-crewAI, gana_v5, jo_gana777, v0-gana-v6-dashboard-design, analysis/v6 y analysis/v8.
- J-77 Historical Leak Evidence: gitleaks detect --redact=100 conserva findings históricos en commits anteriores. Clases afectadas: LLM provider keys, sports-data/API-Football keys, Heroku/API/platform keys, GitHub PAT, Google/GCP API key y credenciales DB legacy.
- Blocker activo: J-83/local-board debe confirmar rotación o revocación externa y alcance de reescritura. Ingeniería no debe borrar historia ni force-pushear hasta esa confirmación.
## Páginas confusas u obsoletas
- 2026-04-20 publication-readiness audit: usar como clasificación inicial de riesgo, no como estado final. Para estado de árboles sanitizados e historia pendiente, usar J-77.
- Cualquier plan pre-J-11 que describa publicación directa o ambigua queda subordinado a J-11: publication-engine es la única ruta live aceptada.
- Documentos que digan que Notion write access no existe reflejan runtimes anteriores. En este heartbeat el API de Notion sí permitió crear esta página; mantener esa diferencia visible.
- Las páginas del P0 command center siguen siendo fuente de navegación. Paperclip sigue siendo historia de ejecución; Notion es lectura ejecutiva.
## Links de evidencia
- Paperclip: J-87 P0 freeze, J-90 Engineering/Technical operating index, J-91 este entregable, J-18 saneamiento legacy, J-77 rotación/rewrite approval, J-83 confirmación de rotación.
- Repo docs: docs/plans/2026-04-20-publication-readiness-audit.md
- Repo docs: docs/plans/2026-06-28-j-11-publication-governance-environment-isolation-closure.md
- Repo docs: docs/plans/2026-06-28-j-77-j18-credential-rotation-history-rewrite-approval.md
- Repo docs: README.md, SECURITY.md, .env.example, LICENSE
## Próximas acciones seguras
1. J-90/CTO debe enlazar esta página desde Gana v9 / 03 Ingeniería como subpágina de repos, publicación y seguridad.
2. Luis/local-board debe resolver J-83 confirmando rotación/revocación externa y alcance de rewrite, sin pegar secretos.
3. Cuando J-87 y J-83 estén resueltos, ingeniería puede ejecutar solo el rewrite aprobado, re-correr gitleaks detect --redact=100 y publicar resultados 0 findings.
4. Mantener bloqueadas J-18/J-77 y cualquier publicación amplia de legacy repos hasta que el flujo anterior esté cerrado.
## Disposition J-91
J-91 puede cerrarse cuando este link quede publicado en Paperclip. No hay blocker técnico para este entregable; los blockers restantes pertenecen a J-83/J-77/J-87.
## Verificación fresca J-91
Agregada por Founding Engineer en 2026-06-30 America/Guatemala / 2026-07-01 UTC. No contiene secretos.
- Artefacto fuente del repo: docs/plans/2026-07-01-j-91-repo-publication-security-status.md
- Estado de rama observado: repo/main en commit corto 4735e6c, 1 commit delante de origin/main, con worktree sucio por trabajos previos.
- pnpm --filter @gana-v8/publication-engine test: aprobado.
- pnpm --filter @gana-v8/publisher-worker test: aprobado, 19 tests.
- pnpm --filter @gana-v8/public-api test: aprobado, 39 tests.
- pnpm --filter @gana-v8/config-runtime test: aprobado, 5 tests.
- gitleaks dir . --redact=100 --no-banner: aprobado, no encontró leaks.
- gitleaks detect --redact=100 --no-banner: aprobado, no encontró leaks en 2 commits activos del repo.
- gitleaks dir ../j18-repos, ../analysis/v6 y ../analysis/v8 --redact=100 --no-banner: aprobado, no encontró leaks en archivos actuales.
- Nota de página canónica: se archivó una página duplicada en inglés creada durante la verificación de J-91 para mantener esta página en español como único link del centro de mando.
