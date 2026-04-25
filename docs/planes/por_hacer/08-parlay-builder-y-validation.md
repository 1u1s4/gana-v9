# Parlay Builder y Validation

## Objetivo

Construir candidatos de parlay desde predicciones atomicas estructuradas y validar predictions/parlays contra resultados y estadisticas finales de API-Football con reglas versionadas.

## SRS cubierto

- Secciones 11 RF-011, RF-012, RF-014.
- Secciones 12, 13.7, 15.3, 15.4.
- Criterios de aceptacion 17, 18, 20, 21.

## Contexto actual

No existen `src/parlay` ni `src/validation`. El SRS prohibe automatizacion monetaria: los parlays son artifacts analiticos, no apuestas ejecutables.

`src/validation/settlement-rules.ts` no pertenece a este plan; lo crea `06-domain-mercados-y-settlement.md`. Este plan lo consume para settlement de predictions/parlays y solo agrega orchestration, result fetching y persistence.

## Modulos nuevos

- `src/parlay/types.ts`
- `src/parlay/builder.ts`
- `src/parlay/rules.ts`
- `src/parlay/service.ts`
- `src/validation/types.ts`
- `src/validation/service.ts`
- `src/validation/result-fetcher.ts`

## Parlay

Campos minimos:

- `id`
- `sourceRunId`
- `legs`
- `combinedOdds`
- `aggregateConfidence`
- `aggregateQuality`
- `rationale`
- `warnings`
- `status`
- `generatedAt`

`ParlayLeg`:

- parlay ID;
- prediction ID;
- fixture ID;
- market;
- selection;
- line;
- odds;
- leg status;
- index;
- inclusion reason.

## Reglas de builder

- Usar solo predicciones estructuradas con status `candidate`, `review-required` o `promotable`.
- No usar predicciones `blocked`.
- Limitar cantidad de legs por config.
- Evitar multiples legs del mismo fixture salvo override explicito.
- Calcular odds combinadas multiplicando odds decimales.
- Calcular confidence agregada con regla documentada v1.
- Registrar razones de inclusion y exclusion.
- Generar artifact propio.
- No ejecutar acciones monetarias.
- No conectarse a casas de apuestas.

Config sugerida:

```ts
interface ParlayConfig {
  maxLegs: number;
  minLegs: number;
  allowMultipleLegsPerFixture: boolean;
  minPredictionConfidence: number;
  maxCombinedOdds?: number;
}
```

Defaults:

- `minLegs`: `2`
- `maxLegs`: `4`
- `allowMultipleLegsPerFixture`: `false`

## Validation

Estados:

- `pending`
- `won`
- `lost`
- `push`
- `voided`
- `error`
- `blocked`

`ValidationArtifact` debe incluir:

- prediction ID o parlay ID;
- result input;
- settlement rule version;
- status;
- evaluatedAt;
- evidence links;
- provider result snapshot;
- error/degradation reason.

## Settlement source

Usar API-Football:

- resultado final para `h2h`, `double_chance`, `goals_over_under`, `btts`;
- estadisticas finales para `corners_over_under`;
- provider snapshots para audit.

No inferir resultados desde texto agentic.

## Comandos

Slash:

- `/parlay`
- `/validate`

Headless:

```bash
pnpm gana parlay --date YYYY-MM-DD
pnpm gana validate --date YYYY-MM-DD
pnpm gana validate --prediction-id ID
pnpm gana validate --parlay-id ID
```

## Persistencia

Guardar:

- `parlays`
- `parlay_legs`
- `validation_artifacts`
- result/statistics provider snapshots;
- artifacts JSON;
- audit logs.

No guardar parlay legs como JSON de IDs; usar tabla normalizada.

## Criterios de aceptacion

- `/parlay` construye candidato desde predictions existentes.
- El builder excluye predictions bloqueadas y explica razones.
- No hay mas de una leg por fixture salvo override.
- `combinedOdds` y aggregate confidence se calculan y persisten.
- `/validate` settlement funciona para los cinco mercados iniciales.
- Corners sin estadisticas produce `blocked` con razon especifica.
- Cada validation enlaza provider snapshot y settlement rule version.
- `npm run typecheck` pasa.

## Pruebas

- Unit tests de builder:
  - max/min legs;
  - duplicado fixture;
  - exclusion por blocked;
  - odds combinadas.
- Unit tests de settlement por market.
- Integration test con resultados API-Football mocked.
- Smoke manual:
  - generar predictions;
  - `pnpm gana parlay --date YYYY-MM-DD`;
  - `pnpm gana validate --parlay-id ID`.

## Riesgos

- Parlays pueden inducir interpretacion monetaria. Mantener lenguaje de artifact analitico y prohibicion explicita.
- Resultados finales pueden tardar; usar `pending` y permitir revalidacion.
- Estadisticas de corners pueden no estar disponibles por liga/proveedor.
