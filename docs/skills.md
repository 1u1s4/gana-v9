# Gana v9 Skills

Este repo tiene dos familias de skills. No son intercambiables:

- `.agents/skills/`: runbooks para Codex/Hermes. Describen como operar, depurar, notificar o ejecutar trabajo en el repo.
- `skills/`: contratos versionados del harness. Cada contrato define un prompt, schema, hash y pruebas para una etapa analitica del pipeline.

Todas las skills son analiticas. No deben ejecutar apuestas, mover dinero, crear automatizacion monetaria ni prometer resultados.

Documento operativo relacionado: `docs/planes/22-implementacion-harness-y-publicacion.md` consolida el subset J-105 migrado desde Notion para implementacion, harness, publicacion y seguridad.

## Codex And Hermes Skills

Estas skills viven en `.agents/skills/` y se usan para guiar trabajo operativo. Pueden incluir scripts, tests y referencias adicionales.

| Skill | Path | Cuando usarla | Verificacion util |
|---|---|---|---|
| `discord-recommendation-notifier` | `.agents/skills/discord-recommendation-notifier/SKILL.md` | Enviar o previsualizar recomendaciones, validaciones, council y strategy review a Discord con embeds nativos. | `node .agents/skills/discord-recommendation-notifier/tests/notify-discord-recommendations.test.mjs` |
| `gana-daily-e2e-ops` | `.agents/skills/gana-daily-e2e-ops/SKILL.md` | Operar o diagnosticar el cron diario E2E: locks, artifacts vacios, procesos largos, reenvios y labels rotos. | `node --check scripts/gana-daily-e2e-and-notify.mjs` y dry-run del notifier antes de enviar. |
| `gana-strategy-review-implementer` | `.agents/skills/gana-strategy-review-implementer/SKILL.md` | Convertir propuestas `ready-for-implementation` de `docs/harness-strategy-review-log.md` en cambios pequenos y testeados. | Tests focalizados del modulo tocado mas `pnpm typecheck`. |
| `ultragoal` | `.agents/skills/ultragoal/SKILL.md` | Disenar o activar objetivos persistentes con verificadores, estado durable, gates de aprobacion y subagentes. | El objetivo debe tener outcome observable y completion proof antes de marcarse completo. |
| `create-agent-tui` | `.agents/skills/create-agent-tui/SKILL.md` | Scaffolding de TUIs de agentes TypeScript con `@openrouter/agent`. No es parte del pipeline diario de Gana. | Revisar el proyecto generado y correr sus tests/build. |

### Operational Rules

- Lee el `SKILL.md` completo antes de usar una skill operativa.
- Si una skill apunta a scripts o referencias relativas, resuelvelas desde su propia carpeta.
- Para Discord, siempre hacer `--dry-run` antes de un envio real.
- Para E2E diario, limpiar solo el batch exacto que se esta reemplazando.
- Para strategy-review, implementar solo propuestas `ready-for-implementation` o explicitamente pedidas.

## Harness Prompt Contracts

Los contratos del harness viven en `skills/<id-version>/`.

Cada contrato normalmente contiene:

- `skill.json`: metadata, entradas, contextos confiables/no confiables, schema, evals y `promptSha256`.
- `prompt.md`: instrucciones del modelo para esa etapa.
- `output.schema.json`: shape esperado del resultado.
- `tests/manifest.test.json`: manifest minimo usado por la certificacion.

No cambies `prompt.md` sin actualizar el `promptSha256` y correr pruebas relevantes. El objetivo es que los cambios de prompt sean auditables y no silenciosos.

## Current Harness Contracts

| Contract | Path | Proposito | Entradas principales |
|---|---|---|---|
| `research-fixture-v1` | `skills/research-fixture-v1/` | Recolectar evidencia de un fixture antes de scoring. | `fixture`, `oddsSnapshot`, `sourcePolicy` |
| `research-fixture-v2` | `skills/research-fixture-v2/` | Recolectar evidencia fresca, rankeada y con proveniencia. | `fixture`, `oddsSnapshot`, `retrievalPolicy` |
| `score-prediction-v1` | `skills/score-prediction-v1/` | Puntuar predicciones con probabilidad calibrada y edge gates. | `fixture`, `oddsSnapshot`, `researchBundle` |
| `score-prediction-v2` | `skills/score-prediction-v2/` | Producir predicciones calibradas con blockers duros. | `fairPrices`, `claims`, `calibration` |
| `devig-and-fairprice-v1` | `skills/devig-and-fairprice-v1/` | Convertir odds crudas multi-bookmaker en probabilidades justas. | `oddsQuotes` |
| `ensemble-disagreement-v1` | `skills/ensemble-disagreement-v1/` | Combinar predicciones de providers y bloquear desacuerdos materiales. | `providerPredictions` |
| `line-movement-tracker-v1` | `skills/line-movement-tracker-v1/` | Detectar picks stale por movimiento de linea. | `lineOpen`, `lineNow`, `lineClose` |
| `lineup-confirmation-gate-v1` | `skills/lineup-confirmation-gate-v1/` | Bloquear mercados sensibles a XI hasta confirmar alineaciones. | `fixture`, `market`, `lineup` |
| `build-parlay-v1` | `skills/build-parlay-v1/` | Construir candidatos de parlay analiticos sin acciones monetarias. | `promotablePredictions` |
| `parlay-candidate-generator-v1` | `skills/parlay-candidate-generator-v1/` | Generar candidatos top-EV, baja varianza y alta conviccion. | `promotablePredictions` |
| `parlay-ranker-v1` | `skills/parlay-ranker-v1/` | Rankear candidatos de parlay por edge ajustado por riesgo. | `parlayCandidates` |
| `correlation-model-v1` | `skills/correlation-model-v1/` | Estimar penalizaciones por correlacion entre legs. | `legs` |
| `parlay-portfolio-v1` | `skills/parlay-portfolio-v1/` | Crear portfolios analiticos desde predicciones scoreadas y perfiles. | `portfolioProfile`, `scoredPredictions`, `riskTags` |
| `llm-parlay-all-in-v1` | `skills/llm-parlay-all-in-v1/` | Seleccionar el acumulador analitico mas seguro desde un pool guardrailed. | `predictionPool` |
| `llm-parlay-refinado-v1` | `skills/llm-parlay-refinado-v1/` | Seleccionar un parlay refinado desde predicciones atomicas scoreadas. | Pool de predicciones pre-scoreadas |
| `validate-settlement-v1` | `skills/validate-settlement-v1/` | Validar predicciones y parlays contra resultados finales. | `predictions`, `fixtureResults` |
| `validation-clv-v1` | `skills/validation-clv-v1/` | Calcular analitica de validacion, incluyendo CLV. | `validations`, `closingLines` |
| `calibration-monitor-v1` | `skills/calibration-monitor-v1/` | Reportar calibracion y flags de baja muestra. | `predictions`, `outcomes` |

## Pipeline Map

La ruta normal del harness usa estos contratos por etapa:

1. Fixture y odds: `research-fixture-v2`, `devig-and-fairprice-v1`.
2. Scoring: `score-prediction-v2`, con soporte de `ensemble-disagreement-v1`, `line-movement-tracker-v1` y `lineup-confirmation-gate-v1`.
3. Parlays: `parlay-portfolio-v1`, `llm-parlay-all-in-v1`, `llm-parlay-refinado-v1`, mas los contratos de candidate/ranker/correlation.
4. Validacion: `validate-settlement-v1`, `validation-clv-v1`, `calibration-monitor-v1`.
5. Operacion y notificacion: `.agents/skills/gana-daily-e2e-ops`, `.agents/skills/discord-recommendation-notifier`, `.agents/skills/gana-strategy-review-implementer`.

## Update Checklist

Cuando agregues o cambies una skill del harness:

1. Actualiza `skill.json`, `prompt.md`, `output.schema.json` y `tests/manifest.test.json`.
2. Recalcula `promptSha256` si cambia `prompt.md`.
3. Actualiza `skills/README.md` y esta pagina si cambia el inventario o la ruta de produccion.
4. Corre el test focal del modulo que consume la skill.
5. Corre `pnpm typecheck`.
6. Si el cambio afecta daily, parlay, scoring, validation, council o notifier, corre `pnpm test`.

Cuando cambies una skill operativa:

1. Actualiza su `SKILL.md`.
2. Actualiza scripts/tests/docs que sean fuente de verdad del flujo.
3. Ejecuta `node --check` en scripts tocados.
4. Ejecuta tests de la skill cuando existan.

## Useful Commands

```bash
find .agents/skills skills -maxdepth 3 \( -name SKILL.md -o -name skill.json -o -name prompt.md \) -print | sort
pnpm typecheck
pnpm test
node .agents/skills/discord-recommendation-notifier/tests/notify-discord-recommendations.test.mjs
node .agents/skills/discord-recommendation-notifier/tests/notify-discord-daily-stats.test.mjs
```
