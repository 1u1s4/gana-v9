# Research, Scoring y Predictions

## Objetivo

Crear el flujo que transforma fixtures/odds/evidencia en predicciones atomicas estructuradas, auditables y persistidas, usando proveedores agentic CLI reales cuando se requiera research.

## SRS cubierto

- Secciones 2.8, 7.7, 11 RF-009, RF-010.
- Secciones 13.6, 15.3, 15.4.
- Criterios de aceptacion 15, 16, 20, 21.

## Contexto actual

No existen research bundles, evidence, claims, scoring rules ni predictions. `src/agent.ts` puede ejecutar proveedores agentic, pero aun no hay prompts/versiones ni persistencia de AI runs deportivos.

## Modulos nuevos

- `src/evidence/types.ts`
- `src/evidence/research.ts`
- `src/evidence/claims.ts`
- `src/prediction/types.ts`
- `src/prediction/scoring.ts`
- `src/prediction/prompts.ts`
- `src/prediction/service.ts`
- `src/prediction/gates.ts`

## Entidades

### ResearchBundle

Debe incluir:

- `id`
- `runId`
- `fixtureId`
- `sources`
- `evidenceItems`
- `claims`
- `gateResult`
- `providerAgentic`
- `model`
- `promptVersion`
- `createdAt`

### SourceRecord

- source type: `api-football`, `provider-snapshot`, `web-search`, `db`, `artifact`.
- url o snapshot ID.
- title/name si existe.
- capturedAt.
- hash o external ID.

### EvidenceItem

- source ID.
- claim IDs relacionados.
- snippet/summary redacted.
- confidence.
- metadata.

### Claim

- statement.
- subject fixture/team/market.
- support level.
- evidence IDs.
- conflict status.

## Prediction

Campos minimos:

- fixture ID.
- market.
- selection.
- line si aplica.
- odds.
- implied probability.
- estimated probability.
- edge.
- confidence.
- quality.
- rationale breve.
- warnings.
- evidence IDs.
- filters que incluyeron fixture.
- provider agentic.
- model.
- prompt version.
- scoring rule version.
- source run ID.
- status: `draft`, `candidate`, `review-required`, `promotable`, `blocked`.
- generatedAt.

## Scoring rule v1

Crear `SCORING_RULE_VERSION = 'scoring-v1'`.

La primera version debe ser conservadora:

- no promociona sin odds snapshot;
- no promociona sin fixture normalizado;
- no promociona sin evidence suficiente;
- marca `review-required` si falta web research requerido;
- marca `blocked` si falta market, odds, stats requeridas o DB write;
- calcula `impliedProbability = 1 / odds`;
- calcula `edge = estimatedProbability - impliedProbability` cuando estimated exista.

El scoring puede empezar rule-based con soporte agentic para rationale/evidence, pero la salida debe ser estructurada y validada.

## Prompts

Crear prompt templates versionados:

- `research-fixture-v1`
- `score-prediction-v1`

Cada prompt debe exigir JSON estructurado y referencias a evidence IDs. No aceptar texto libre como prediccion final sin parse/validation.

## Web search

Research actual debe requerir web search nativo cuando:

- el usuario ejecuta `/research` con `web live`;
- el fixture necesita contexto actualizado no disponible en snapshots;
- el plan de scoring lo marca como required.

Si el provider no usa web search requerido, el run queda `review-required` o `blocked` segun severidad.

## Comandos

Slash:

- `/research`
- `/score`

Headless:

```bash
pnpm gana research --fixture-id ID --web live
pnpm gana score --fixture-id ID
```

## Persistencia

Guardar:

- `agent_runs`
- `research_bundles`
- `source_records`
- `evidence_items`
- `claims`
- `predictions`
- artifacts JSON por run.

Prompts y outputs grandes deben ir a artifacts redacted y enlazarse desde DB por metadata.

## Gates

Verdicts:

- `promotable`: evidence completo, snapshots persistidos, filtros registrados, no errores criticos.
- `review-required`: output util con warnings o datos incompletos no criticos.
- `blocked`: falta informacion esencial, error de provider/DB, market invalido o policy violation.

## Criterios de aceptacion

- `/research --fixture-id` genera `ResearchBundle` con sources/evidence/claims.
- `/score --fixture-id` genera predicciones atomicas para markets disponibles.
- Cada prediction enlaza fixture, odds snapshot/quote, run, evidence, provider, model y scoring version.
- Sin evidence suficiente no se marca `promotable`.
- Si falla parse de salida agentic, queda error accionable y artifact.
- `npm run typecheck` pasa.

## Pruebas

- Unit tests de validacion de salida estructurada.
- Unit tests de gates.
- Unit tests de edge/implied probability.
- Integration con provider agentic mocked.
- Acceptance manual:
  - `pnpm gana research --fixture-id ID --web live`
  - `pnpm gana score --fixture-id ID`
  - verificar DB records y artifacts.

## Riesgos

- No permitir que rationale textual sustituya datos estructurados.
- No guardar secretos en prompts/artifacts.
- No presentar predicciones como garantia de resultado.
