# Revisión de publicaciones reales: 2026-07-06 a 2026-09-21

Reproducir desde la raíz:

```sh
node scripts/retro-published-portfolio.mjs --from=2026-07-06 --to=2026-09-21
node --test scripts/tests/retro-published-portfolio.test.mjs
```

Resultado detallado: `.artifacts/gana-v9/reports/published-portfolio-2026-07-06-to-2026-09-21.json`. Incluye rutas de artefactos/validaciones, ids de mensajes, selección por selección y exclusiones. No necesita red ni altera DB/Discord. Es evidencia de recibos locales de publicación, no una consulta en vivo a Discord.

## Universo y resultados descriptivos

51 fechas publicadas comprobadas por lock `published` e ids de mensaje; 48 fechas (145 selecciones) además conservan hashes coincidentes de todos los archivos fuente del payload. Las otras 3 fechas contienen 17 selecciones y quedan identificadas como linaje legado. Cuatro fechas con fuentes modificadas o ausentes frente al hash publicado se excluyen: 10, 11, 12 y 14 de julio. También se excluyen los locks sin publicación, nunca se reemplazan por el mejor candidato de otro run.

Se deduplican conjuntos idénticos de fixture, mercado, selección y línea dentro de cada día. No se cuentan piernas como apuestas adicionales. Validaciones sólo se unen si apuntan al artefacto publicado exacto. Se conserva cada pendiente/no validado. Una combinada no se marca ganada porque sólo una parte de sus piernas esté validada; un void reduce la cuota de pago y el pago de una victoria sin validación completa queda desconocido.

| Cohorte | Selecciones | Ganadas | Perdidas | Void | Sin resolver | ROI plano con pago verificable |
|---|---:|---:|---:|---:|---:|---:|
| Total único publicado | 162 | 111 | 49 | 1 | 1 | -4,67% (161) |
| Fuente publicada con hash | 145 | 99 | 44 | 1 | 1 | -6,51% (144) |
| Diamante | 42 | 27 | 15 | 0 | 0 | -13,56% |
| Refinado | 35 | 24 | 11 | 0 | 0 | +0,32% |
| Low variance | 27 | 16 | 10 | 1 | 0 | -7,22% |
| Atómica alta confianza | 50 | 38 | 11 | 0 | 1 | -3,10% (49) |

ROI usa una unidad por selección con liquidación/pago verificables, sin capitalización ni interpretación de porcentajes de stake. No prueba rentabilidad futura ni superioridad de un perfil. Los conjuntos de fixtures únicos tampoco son muestras independientes: hay exposición compartida, modelos distintos y cambios de política durante el período.

## Problemas comprobados y reparación

- Sesgo real: 106/162 selecciones usan únicamente totales; otras 35 incluyen totales combinados con h2h o doble oportunidad. Sólo ocho usan h2h sin otros mercados. La diversidad no se debe forzar con selecciones débiles: la elección diaria ahora prefiere fixtures independientes y mercados nuevos entre candidatos que ya pasan los mismos gates.
- 103 combinadas publicadas muestran confianza agregada mayor que el producto de las confianzas de sus piernas. El fallback diario calculaba un promedio y lo utilizaba como probabilidad conjunta. Ahora separa el producto de confianza de evidencia del producto de probabilidades del modelo que determina el EV; una probabilidad faltante bloquea la selección. Evita aumentos por nombre del perfil o cuota baja y no recicla fuentes bloqueadas/review-required como diamante.
- 17 diamantes fuera de su ventana 1,10–1,30; 18 conjuntos de piernas publicados repetidos con otro perfil. El ejemplo de 2026-08-23 es diamante @2,2032, piernas con confianza 0,72 y 0,60, agregado 0,66 y warnings de investigación no promotable. La composición ahora respeta mercado, cuota, confianza y elegibilidad de cada perfil, con deduplicación semántica.
- La probabilidad del mercado/modelo se usaba para elevar confianza de evidencia y hasta imponer edge positivo en simples bloqueadas. Se eliminó ese bypass también en ligas requeridas; `aggregateConfidence` y `displayConfidence` conservan confianza de evidencia, `adjustedProbability` conserva separadamente probabilidad del modelo en simples.
- `low-odds-top` antes aceptaba doble oportunidad y ampliaba a totales. Ahora sólo usa ganador h2h local/visitante con 1 < cuota < 1,10, busca el mínimo de dos a cuatro fixtures distintos para llegar a 1,20 y conserva evidencia, edge y confianza conjunta ≥0,70. Si no es factible, informa bloqueo; nunca promete una selección diaria ni una victoria segura.
- Las ligas requeridas deben ser consideradas, no producir seis combinadas por obligación. Scoring con rechazo explícito cuenta como análisis cubierto; ausencia de análisis sigue siendo fallo de cobertura. La selección exige status/edge/evidencia elegibles, respeta ventanas y deduplica composiciones.

## Apuesta analítica y límites del contrafactual

Selector v2: dentro de picks elegibles ya emitidos, cuota ≥1,45 y mayor confianza de evidencia; excluye fallback/review-required, overrides, riesgos duros y edge no positivo. Desempata por orden publicado. El snapshot final sigue siendo la fuente para el notificador.

La regla histórica de mayor confianza publicada habría seleccionado 33 días: 24 ganados, nueve perdidos y +17,95% de ROI plano. Es una reconstrucción descriptiva dentro de este universo, no una validación prospectiva. La variante con integridad estricta deja **cero elegibles históricos** en ese subconjunto: casi todos los picks estaban marcados review/fallback. No se puede afirmar que los cambios mejoran rentabilidad ni ajustar umbrales con esos resultados. Corrigen integridad y selección; el rendimiento exige una cohorte nueva, separada temporalmente y estratificada por modelo, mercado, modo de selección y exposición compartida.

No se entrenó ni ajustó ningún umbral sobre los resultados. El reporte no usa status ni liquidación para elegir el top de los contrafactuales. Los candidatos no publicados permanecen fuera del universo de rendimiento.

## Contraste con la API real

El 22 de septiembre se ejecutó `node --import tsx scripts/retro-published-result-audit.mjs`: cinco consultas GET con presupuesto máximo de cinco, sin persistencia de DB ni cambios a validaciones. El artefacto local `.artifacts/gana-v9/audits/published-result-api-2026-09-22.json` conserva IDs, recibos de publicación, hashes, fecha de observación, marcador de 90 minutos y comparación por selección.

Los cinco resultados publicados y liquidados coincidieron en ganado/perdido (tres ganados, dos perdidos). Cuatro marcadores coincidieron; España–Argentina del 19 de julio, fixture `1591866`, está en estado AET: `score.fulltime` es 0–0 y prórroga 1–0. El archivo antiguo usaba 1–0; el pick under 3,5 continúa ganado con el marcador reglamentario. Es evidencia concreta a favor de la corrección de liquidación a 90 minutos, sin reescribir el historial. Esta muestra intencional no estima la tasa de errores ni valida rentabilidad o calibración.
