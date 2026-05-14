# Analisis 13-may-2026: validacion, predicciones y parlays

Fecha analizada: 2026-05-13, ventana local America/Guatemala.

Artifacts principales:

- Validacion: `.artifacts/gana-v9/runs/834db395-ae1a-4680-929d-67db7867d1c1/validations.json`
- Daily metrics: `.artifacts/gana-v9/runs/e245aca1-df64-4dbc-b729-01be0eb88654/daily-metrics.json`
- Parlay analysis post-ajuste: `.artifacts/gana-v9/runs/1af3b855-7a95-4d92-afe0-4636361d748a/parlay-analysis.json`

## Resultado global

| Corte | Total | Won | Lost | Voided | Unvalidated | Settled | Hit rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Predicciones | 190 | 93 | 57 | 17 | 23 | 150 | 62.0% |
| Parlays | 21 | 18 | 3 | 0 | 0 | 21 | 85.7% |
| Parlays seleccionados post-ajuste | 5 | 5 | 0 | 0 | 0 | 5 | 100.0% |

## Predicciones por market

| Market | Total | Won | Lost | Voided | Unvalidated | Settled | Hit rate | Avg odds | Avg conf | Avg edge |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| goals_over_under | 43 | 28 | 15 | 0 | 0 | 43 | 65.1% | 1.483 | 0.717 | 0.054 |
| h2h | 42 | 25 | 17 | 0 | 0 | 42 | 59.5% | 1.839 | 0.720 | 0.063 |
| double_chance | 39 | 16 | 1 | 0 | 22 | 17 | 94.1% | 1.211 | 0.770 | -0.020 |
| btts | 34 | 17 | 17 | 0 | 0 | 34 | 50.0% | 1.671 | 0.647 | 0.046 |
| corners_over_under | 32 | 7 | 7 | 17 | 1 | 14 | 50.0% | 1.796 | 0.602 | 0.039 |

Lectura:

- El segmento mas limpio fue double_chance, pero con 22 unvalidated. No debe extrapolarse como senal fuerte hasta cerrar settlement.
- goals_over_under fue el mejor market plenamente liquidado.
- h2h quedo demasiado fragil, especialmente home favorites de baja liquidez.
- btts quedo en 50%, sin ventaja clara para promocion automatica.
- corners_over_under sigue siendo operativo solo como analisis, no como parlay, por settlement incompleto y muchos voids.

## Predicciones por cuota

| Cuota | Total | Won | Lost | Voided | Unvalidated | Hit rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| <1.50 | 77 | 44 | 11 | 0 | 22 | 80.0% |
| 1.50-1.99 | 95 | 40 | 37 | 17 | 0 | 51.9% |
| 2.00-2.99 | 17 | 9 | 8 | 0 | 0 | 52.9% |
| >=3.00 | 1 | 0 | 1 | 0 | 0 | 0.0% |

Lectura:

- El harness debe seguir tratando <1.50 como zona preferente para legs base.
- 1.50-1.99 no tuvo suficiente precision para armar parlays automaticos sin evidencia fuerte.
- >2.00 necesita edge real, liquidez y evidencia especifica; no debe entrar por confianza nominal.

## Predicciones por confianza

| Confianza | Total | Won | Lost | Voided | Unvalidated | Hit rate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| .50-.64 | 54 | 20 | 21 | 10 | 3 | 48.8% |
| .65-.74 | 105 | 57 | 32 | 6 | 10 | 64.0% |
| .75-.84 | 15 | 9 | 3 | 1 | 3 | 75.0% |
| >=.85 | 14 | 7 | 1 | 0 | 6 | 87.5% |

Lectura:

- La confianza alta funciono mejor despues de los caps, pero el sample settlement aun es chico.
- El tramo .65-.74 fue util solo con cuotas bajas y markets protegidos.
- La muestra previa justificaba degradar .80-.90 cuando no hay calibracion suficiente; el codigo actual ya mantiene ese gate.

## Parlays por profile

| Profile | Total | Won | Lost | Hit rate | Avg odds | Avg conf |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| low-variance | 10 | 10 | 0 | 100.0% | 2.153 | 0.591 |
| low-odds-top | 8 | 8 | 0 | 100.0% | 1.464 | 0.703 |
| parlay-oro | 2 | 0 | 2 | 0.0% | 1.921 | 0.657 |
| default | 1 | 0 | 1 | 0.0% | 1.259 | 0.781 |

Lectura:

- low-odds-top y low-variance fueron los unicos perfiles que justificaron seleccion post-validacion.
- parlay-oro y default fallaron por la misma pierna: FC Differdange 03 h2h home @1.12, low-liquidity, resultado 1-1.
- El fallo no fue de diversificacion global, sino de permitir una pierna h2h short favorite con baja liquidez como si fuera segura.

## Parlays perdidos

| Profile | Odds | Conf | Causa principal |
| --- | ---: | ---: | --- |
| parlay-oro | 1.9015 | 0.680 | FC Differdange 03 h2h home @1.12 perdio 1-1 |
| parlay-oro | 1.9395 | 0.633 | FC Differdange 03 h2h home @1.12 perdio 1-1 |
| default | 1.2594 | 0.781 | FC Differdange 03 h2h home @1.12 perdio 1-1 |

Decision:

- Bloquear h2h non-draw con odds <= 1.20 cuando tenga senales de baja liquidez o single-bookmaker.
- No promocionar un parlay solo porque la cuota combinada parece baja si una pierna tiene riesgo estructural.
- Priorizar double_chance low odds para base, no h2h short favorite con baja liquidez.

## Post-ajuste aplicado

Se actualizo `src/parlay/analysis.ts` para rechazar recomendaciones duplicadas por exact leg set entre source runs. Antes del ajuste, el analysis seleccionaba 10 parlays, pero varios eran clones operativos del mismo set de legs. Despues del ajuste:

- analyzed: 21
- top: 5
- selectedHitRate: 100.0%
- selectedExposureUnits: 7.9999
- rejected: 16
- duplicateRejected: 5

Top post-ajuste:

| Rank | Profile | Odds | Estado | Exposure | Banker legs | Legs |
| ---: | --- | ---: | --- | ---: | ---: | --- |
| 1 | low-odds-top | 1.416 | won | 2.2257 | 2 | Vissel Kobe double_chance home_or_draw @1.18; Ironi Tiberias double_chance home_or_draw @1.20 |
| 2 | low-odds-top | 1.404 | won | 0.1885 | 1 | Ironi Tiberias double_chance home_or_draw @1.20; First Vienna double_chance home_or_draw @1.17 |
| 3 | low-odds-top | 1.6567 | won | 1.9497 | 2 | Vissel Kobe @1.18; Ironi Tiberias @1.20; First Vienna @1.17 |
| 4 | low-variance | 2.183 | won | 2.2257 | 1 | Al-Ettifaq h2h away @1.85; Vissel Kobe double_chance home_or_draw @1.18 |
| 5 | low-variance | 2.1645 | won | 1.4103 | 0 | Al-Ettifaq h2h away @1.85; First Vienna double_chance home_or_draw @1.17 |

## Harness guidance

- Mantener low-odds-top y low-variance como perfiles base.
- Exigir doble proteccion para h2h <= 1.20: liquidez suficiente y evidencia market-specific. Si no, reject o review-required.
- No permitir corners_over_under en parlays automaticos hasta tener settlement confiable y evidencia especifica.
- Penalizar cuotas >2.20 en portfolio automatico salvo edge calibrado, market coverage fuerte y sin stale/low-liquidity.
- Mantener cap de confianza .80-.90 cuando la muestra historica por market/model/promptVersion sea baja.
- Seguir capando edge inflado de double_chance contra implied probability cuando fair probability sea inconsistente.
- Dedupear recomendaciones por leg set para no sobreexponer el mismo razonamiento desde varios source runs.

## Verificacion

- `npm run typecheck`: passed
- `npm test`: passed, 350/350
- `npm run gana -- validate --date 2026-05-13`: completed, 188 validations
- `npm run gana -- metrics daily --date 2026-05-13 --days 1 --persist true`: completed
- `npm run gana -- parlay analyze --date 2026-05-13 --top 25 --profile-scope all --bankroll 100`: completed post-ajuste

Todos los artifacts siguen siendo analytical-only y sin capacidad monetaria.
