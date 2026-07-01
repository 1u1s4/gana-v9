---
source: notion
notion_id: 390bea9e-4736-8122-ba6b-eea956f63b9d
notion_url: https://app.notion.com/p/J-90-ndice-operativo-de-Ingenier-a-T-cnica-390bea9e47368122ba6beea956f63b9d
title: "J-90 Índice operativo de Ingeniería / Técnica"
---

# J-90 Índice operativo de Ingeniería / Técnica

Estado: índice vigente en español para el freeze P0 de documentación. Owner: CTO. Issue: J-90. Actualizado: 2026-06-30 America/Guatemala.
Regla de idioma: esta página reemplaza la versión previa en inglés. Nombres técnicos, rutas, comandos y URLs se conservan cuando ayudan a ejecutar o auditar.
Regla de fuente de verdad: Notion explica el mapa operativo; Paperclip conserva estado de ejecución y blockers; el repo conserva evidencia técnica detallada. No se copian secretos en Notion ni Paperclip.
[Centro de mando P0](https://app.notion.com/p/Gana-v9-Mapa-operativo-P0-Notion-390bea9e473681dd9128c7da48584dba)
---
# Lectura ejecutiva
La ejecución normal de ingeniería sigue congelada por J-87 hasta que Jo confirme que el árbol de Notion es navegable y entendible. Mientras el freeze siga activo, ingeniería solo debe hacer documentación, reparación de links, aclaración de blockers y actualizaciones operativas sin secretos.
El sistema técnico vigente es gana-v8: monorepo TypeScript con pnpm, apps/workers, packages compartidos, Prisma/MySQL, controles de publicación y separación entre sandbox, replay, staging-like y producción.
# Leer primero
1. J-87: regla de freeze P0 y condición de desbloqueo.
2. [J-90: este índice CTO de Ingeniería/Técnica y checklist de reanudación.](https://app.notion.com/p/J-90-Engineering-Technical-Operating-Index-390bea9e47368122ba6beea956f63b9d)
3. [J-91: detalle de repo, publicación y seguridad que alimenta este índice.](https://app.notion.com/p/J-91-Repo-publication-and-security-status-390bea9e4736818e8b65c74ef8c23bc0)
4. README.md, AGENTS.md, docs/adr/ y docs/plans/gana-v8-monorepo-layout.md: límites actuales de arquitectura.
5. docs/plans/2026-06-28-j-11-publication-governance-environment-isolation-closure.md: controles de publicación y aislamiento por entorno.
6. docs/plans/2026-04-20-publication-readiness-audit.md: clasificación de riesgo de repos legacy y publicables.
7. docs/plans/2026-06-28-j-77-j18-credential-rotation-history-rewrite-approval.md: disposición de seguridad sin valores secretos.
8. docs/plans/2026-04-21-j-24-webscraper-sourcing-and-paid-trial.md: paquete de contratación/trial webscraper con límites public-only.
# Mapa del sistema
<table header-row="true" header-column="false">
<tr>
<td>Capa</td>
<td>Ubicación</td>
<td>Regla operativa</td>
</tr>
<tr>
<td>Control plane</td>
<td>apps/hermes-control-plane</td>
<td>Orquesta workflows y policies; no debe absorber I/O pesado de providers ni lógica determinística de workers.</td>
</tr>
<tr>
<td>API pública y consola</td>
<td>apps/public-api, apps/operator-console</td>
<td>Superficies de lectura pública/operativa; mantener contratos y trazabilidad.</td>
</tr>
<tr>
<td>Workers</td>
<td>apps/ingestion-worker, research-worker, scoring-worker, validation-worker, publisher-worker</td>
<td>Ejecución especializada por etapa; publisher-worker debe respetar publication-engine.</td>
</tr>
<tr>
<td>Sandbox/replay</td>
<td>apps/sandbox-runner</td>
<td>Carril seguro para pruebas, fixtures y replay; no mezclar con live.</td>
</tr>
<tr>
<td>Dominio y contratos</td>
<td>packages/domain-core, contract-schemas, orchestration-sdk</td>
<td>Entidades y contratos compartidos; evitar cambios amplios sin plan.</td>
</tr>
<tr>
<td>Datos e ingestion</td>
<td>packages/source-connectors, canonical-pipeline, storage-adapters</td>
<td>Raw append-only, batches cerrados, persistencia auditable.</td>
</tr>
<tr>
<td>Predicción/publicación</td>
<td>packages/prediction-engine, parlay-engine, validation-engine, publication-engine</td>
<td>Predicción, parlays, validación y publicación permanecen separados.</td>
</tr>
<tr>
<td>Policy/config/observabilidad</td>
<td>packages/policy-engine, config-runtime, observability, audit-lineage, authz</td>
<td>Guardrails de entorno, permisos, lineage y auditoría.</td>
</tr>
</table>
# Guardrails de arquitectura
- Apps pueden depender de packages; las apps no deben convertirse en fronteras de negocio entre sí.
- Toda publicación live requiere actor, capability, canal, entorno y lineage explícitos.
- Sandbox, demo, replay y live deben permanecer aislados en datos, lineage y outputs.
- La captura raw de providers o superficies públicas debe ser append-only; scoring/publicación consume batches cerrados/versionados.
- Cualquier automatización pública nueva debe demostrar que no salta publication-engine, config-runtime ni audit-lineage.
# Estado por workstream
<table header-row="true" header-column="false">
<tr>
<td>Issue</td>
<td>Owner</td>
<td>Estado técnico</td>
<td>Regla para reanudar</td>
</tr>
<tr>
<td>J-18</td>
<td>Founding Engineer</td>
<td>Repos legacy de alto riesgo siguen bloqueados por rotación de credenciales y rewrite autorizado.</td>
<td>Reanudar solo cuando J-77/J-83 y J-87 estén resueltos.</td>
</tr>
<tr>
<td>J-19</td>
<td>CTO</td>
<td>Repos de menor riesgo y hardening público bloqueados por freeze P0.</td>
<td>Reanudar después de J-87 con README, .env.example, LICENSE/SECURITY y scans finales.</td>
</tr>
<tr>
<td>J-24</td>
<td>CTO</td>
<td>Paquete técnico de webscraper listo; ejecución depende de marketplace/account/funding.</td>
<td>Reanudar cuando J-81/J-82 devuelvan respuestas/submissions y J-87 esté levantado.</td>
</tr>
<tr>
<td>J-77</td>
<td>CTO</td>
<td>Aprobación técnica de rewrite existe, pero no hay permiso para force-push sin rotación externa.</td>
<td>No borrar historia ni force-push hasta que J-83 confirme rotación y alcance.</td>
</tr>
<tr>
<td>J-78</td>
<td>CTO</td>
<td>Cierre de links/evidencia para J-57; no es nuevo scope de implementación.</td>
<td>Reanudar solo para cierre documental tras J-87.</td>
</tr>
<tr>
<td>J-80</td>
<td>CTO</td>
<td>Invites/trial webscraper bloqueados por operador/funding y freeze.</td>
<td>No hacer sourcing informal durante freeze; esperar evidencia de marketplace.</td>
</tr>
<tr>
<td>J-81</td>
<td>Operador / Jo / CEO path</td>
<td>Acción de Upwork/Toptal y milestone funding.</td>
<td>CTO solo consume respuestas o submissions cuando existan.</td>
</tr>
<tr>
<td>J-90</td>
<td>CTO</td>
<td>Índice operativo en español publicado en Notion.</td>
<td>Cerrar cuando este comentario quede posteado y el issue vuelva a done.</td>
</tr>
<tr>
<td>J-91</td>
<td>Founding Engineer</td>
<td>Detalle de repo/publicación/seguridad para este índice.</td>
<td>Debe conservar evidencia sin secretos y linkear de vuelta a este índice.</td>
</tr>
</table>
# Seguridad y secretos
- Permitido: nombres de repos, clases de credenciales, comandos redacted, conteos de findings y estado de verificación.
- Prohibido: API keys, DSNs, passwords, token prefixes/suffixes, capturas de consolas con valores, strings históricos de secretos o .env reales.
- J-83 es el blocker externo: Luis o workspace admin debe rotar/revocar credenciales en consoles/secret manager y confirmar alcance de rewrite sin pegar secretos.
- J-77 no debe ejecutar rewrite remoto, borrado de historia ni force-push hasta que J-83 esté resuelto y J-87 levante el freeze.
- Antes de tratar un repo legacy como publicable se requieren scans redacted limpios de current tree e historia reescrita.
# Publicación y producto público
- publication-engine es el centro de seguridad para live publication: capabilities, channel pauses, kill switch, lineage normalizado y coherencia entorno/source.
- publisher-worker debe usar esos checks antes de persistir o publicar.
- public-api expone funnel/resultados y read models; cualquier cambio debe respetar contratos y lenguaje de juego responsable.
- [Contrato public picks J-56](https://app.notion.com/p/J-56-Public-Picks-Contract-gana-v9-38dbea9e473681d3898de0bb31e10c5b)
- [Spec results/history trust layer J-57](https://app.notion.com/p/J-57-Public-Results-History-and-Trust-Layer-Spec-gana-v9-38dbea9e47368153936de3b5e8d08d4b)
- No reanudar automatización de distribución live que salte publication-engine o permita contaminación demo/sandbox/live.
# Competitive intelligence / webscraper
- Regla vigente: public-only, contractor-first, sandbox-first.
- Permitido: HTML público, JSON/XHR público descubierto desde páginas públicas, rankings/resultados/promos públicos, fixtures estáticos y slices sandbox-safe.
- No permitido sin aprobación explícita: login, paywalls, canales privados, bypass anti-bot, private Telegram, o stack crawler desconectado de gana-v8.
- El trial debe exigir surface map, plan http-direct/browser-render/mixed, schema, drift plan, boundaries y un slice de implementación seguro.
# Páginas confusas u obsoletas
<table header-row="true" header-column="false">
<tr>
<td>Página / artefacto</td>
<td>Estado</td>
<td>Decisión</td>
</tr>
<tr>
<td>Versión previa en inglés de J-90</td>
<td>Reemplazada</td>
<td>Esta página en español es la versión vigente.</td>
</tr>
<tr>
<td>Página duplicada Gana v9 / 03 Ingeniería - Operating Index</td>
<td>Archivada</td>
<td>No usar; se archivó para evitar dos fuentes de verdad.</td>
</tr>
<tr>
<td>Engineering Execution Log / J-34</td>
<td>Histórica</td>
<td>Usar solo como evidencia antigua; no decide estado de reanudación.</td>
</tr>
<tr>
<td>J-33 Roadmap técnico y Decisiones técnicas</td>
<td>Vigentes pero especializados</td>
<td>Usar para roadmap/decisiones, no como índice operativo de Ingeniería.</td>
</tr>
<tr>
<td>J-38 Sistema ejecutivo</td>
<td>Vigente para governance</td>
<td>No absorber detalle técnico de repos/seguridad.</td>
</tr>
<tr>
<td>docs/plans/hermes-v8-\*</td>
<td>Contexto histórico</td>
<td>No tratarlos como task state actual.</td>
</tr>
<tr>
<td>gana-v8 master plan</td>
<td>Baseline estratégico</td>
<td>Usar Paperclip para estado actual de ejecución.</td>
</tr>
<tr>
<td>J-57 trust layer</td>
<td>Spec/evidencia vigente</td>
<td>J-78 solo cierra links/evidencia; no abre nuevo scope técnico.</td>
</tr>
<tr>
<td>J-91 páginas detectadas</td>
<td>Detalle en progreso</td>
<td>Usar la página que J-91 marque como vigente; este índice solo consume su evidencia.</td>
</tr>
</table>
# Qué debe ser verdad antes de reanudar ingeniería
1. J-87 queda done o Jo levanta explícitamente el freeze de documentación.
2. J-90 queda publicado en español y enlazado desde el issue y el centro de mando.
3. J-91 publica o entrega el detalle de repo/security/publicación sin secretos y lo enlaza con este índice.
4. J-18/J-77 siguen bloqueados hasta que J-83 confirme rotación/revocación de credenciales y alcance de rewrite remoto.
5. J-24/J-80/J-81 siguen bloqueados hasta que haya autoridad de marketplace/funding y evidencia de candidatos/submissions.
6. Cualquier trabajo publication-facing mantiene publication-engine, config-runtime y audit-lineage intactos.
# Primeras acciones CTO después del freeze
1. Revisar cierre de J-87 y evidencia de J-91.
2. Reabrir solo issues técnicos cuyos blockers externos realmente estén resueltos.
3. Mantener J-18/J-77 bloqueados si J-83 no está confirmado.
4. Mantener J-24/J-80/J-81 bloqueados sin respuestas/submissions de marketplace.
5. Reanudar código con pruebas dirigidas por workspace; no ejecutar barridos amplios desde docs históricos.
# Links vigentes
- [J-90 índice operativo de Ingeniería / Técnica](https://app.notion.com/p/J-90-Engineering-Technical-Operating-Index-390bea9e47368122ba6beea956f63b9d)
- [Centro de mando P0](https://app.notion.com/p/Gana-v9-Mapa-operativo-P0-Notion-390bea9e473681dd9128c7da48584dba)
- [J-91 detalle repo/publicación/seguridad](https://app.notion.com/p/J-91-Repo-publication-and-security-status-390bea9e4736818e8b65c74ef8c23bc0)
- [J-91 página detectada previamente; tratar como posible página de trabajo hasta que J-91 cierre](https://app.notion.com/p/J-91-Repo-publicaci-n-y-seguridad-para-ndice-CTO-390bea9e473681ed9a79ebc677c8e705)
