# Comparación E2E por modelo — 2026-10-07

[Lectura e interpretación del piloto](findings.md) · [Metodología](../../model-e2e-study.md)

Una corrida completa por combinación, con investigación propia y la misma configuración del harness. Inicio: 2026-10-06T20:01:23.898Z. Commit base: 02b2f4b30c4763ff4f5abae9fd895974f7052934.

| Modelo | Esfuerzo | Estado | Research válido | Con probabilidad / registros | Promovibles | Simples / parlays | Tokens observados | USD tokens* | Minutos |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|
| gpt-6.1-sol | high | review-required | 22/22 | 70 / 108 | 0 | 0 / 0 | 18,475,321 | ≥ $13.060 | 54.5 |
| gpt-5.6-sol | xhigh | completed | 22/22 | 96 / 100 | 11 | 3 / 1 | 9,995,211 | ≥ $21.599 | 41.4 |
| gpt-6-astra | medium | review-required | 22/22 | 49 / 96 | 0 | 0 / 0 | 7,357,887 | $39.215 | 25.2 |
| gpt-6-luna | xhigh | review-required | 18/22 | 70 / 84 | 0 | 0 / 0 | 12,536,353 | ≥ $0.735 | 52.0 |

*Costo equivalente de API estándar según [tarifas oficiales](https://developers.openai.com/api/docs/pricing) consultadas el 6 de octubre de 2026. No representa un cargo medido de Codex. Excluye cargos de herramientas, proveedor deportivo y suscripciones. Incluye todos los intentos registrados. Tokens totales = entrada + salida; caché ya está dentro de entrada y razonamiento dentro de salida.

Corridas comparables: 48,364,772 tokens observados y $74.609 equivalentes. Preparación descartada por una referencia ausente en la base local: 9,465,592 tokens y al menos $9.701; ese consumo no se atribuye a la calidad de los modelos. Total observado de ejecuciones del harness: 57,830,364 tokens y $84.310 equivalentes. Las interrupciones hacen que estos importes sean mínimos observados, no facturación completa.

## Desglose de consumo

| Modelo | Entrada | De entrada, caché | Salida | De salida, razonamiento | Llamadas | Fallidas | Uso desconocido / parcial |
|---|---:|---:|---:|---:|---:|---:|---:|
| gpt-6.1-sol | 18,093,129 | 14,183,168 | 382,192 | 98,919 | 59 | 17 | 1 / 16 |
| gpt-5.6-sol | 9,513,798 | 7,245,568 | 481,413 | 287,887 | 48 | 6 | 0 / 6 |
| gpt-6-astra | 7,121,424 | 4,869,120 | 236,463 | 9,243 | 41 | 0 | 0 / 0 |
| gpt-6-luna | 11,828,308 | 8,914,688 | 708,045 | 532,952 | 52 | 17 | 0 / 17 |

| Modelo | Investigación USD | Scoring USD | Portafolio USD |
|---|---:|---:|---:|
| gpt-6.1-sol | $10.435 | $2.626 | $0.000 |
| gpt-5.6-sol | $16.140 | $5.374 | $0.085 |
| gpt-6-astra | $28.174 | $11.042 | $0.000 |
| gpt-6-luna | $0.602 | $0.133 | $0.000 |

El estado previo de la caché de Codex no se puede reiniciar desde este experimento. Como contraste, valorar los mismos tokens sin descuento de caché da: gpt-6.1-sol: $40.008; gpt-5.6-sol: $47.683; gpt-6-astra: $83.037; gpt-6-luna: $1.537. Es un contrafactual de precio, no consumo adicional.

## Coincidencia de predicciones

Se compara por partido, mercado, selección y línea; no por UUID. Los mercados y líneas del mismo partido están correlacionados; no equivalen a partidos independientes. Los registros sin probabilidad numérica se conservan para auditar bloqueos, pero no se presentan como estimaciones numéricas.

| Comparación | Coincidencias / unión | Pares con probabilidad | Diferencia absoluta media, pp | Diferencia de confianza A−B, pp | Promovibles comunes / unión |
|---|---:|---:|---:|---:|---:|
| sol61 / sol56 | 73 / 135 | 47 | 3.54 | -11.06 | 0 / 11 |
| sol61 / astra6 | 78 / 126 | 30 | 2.10 | -3.67 | 0 / 0 |
| sol61 / luna6 | 52 / 140 | 29 | 4.69 | -3.17 | 0 / 0 |
| sol56 / astra6 | 73 / 123 | 37 | 3.03 | 6.41 | 0 / 11 |
| sol56 / luna6 | 54 / 130 | 44 | 3.25 | 7.57 | 0 / 11 |
| astra6 / luna6 | 50 / 130 | 28 | 2.91 | 1.00 | 0 / 0 |

Las diferencias de probabilidad y confianza usan sólo pares con probabilidad numérica en ambos modelos. La confianza es la del harness para esa selección; no equivale a su probabilidad de acierto.

Mercados con investigación marcada `promotable` (todavía sujetos al scoring y a los gates finales):

| Mercado | sol61 | sol56 | astra6 | luna6 |
|---|---:|---:|---:|---:|
| h2h | 9 | 20 | 12 | 10 |
| double_chance | 9 | 20 | 12 | 10 |
| goals_over_under | 8 | 20 | 10 | 10 |
| corners_over_under | 7 | 13 | 6 | 4 |
| btts | 7 | 18 | 8 | 9 |

Scoring por mercado: estimaciones con probabilidad numérica / predicciones promovibles. No incluye registros bloqueados sin probabilidad.

| Mercado | sol61 | sol56 | astra6 | luna6 |
|---|---:|---:|---:|---:|
| h2h | 14 / 0 | 19 / 2 | 10 / 0 | 14 / 0 |
| double_chance | 13 / 0 | 19 / 3 | 10 / 0 | 14 / 0 |
| goals_over_under | 24 / 0 | 31 / 5 | 17 / 0 | 24 / 0 |
| corners_over_under | 8 / 0 | 12 / 0 | 4 / 0 | 6 / 0 |
| btts | 11 / 0 | 15 / 1 | 8 / 0 | 12 / 0 |

Mayores diferencias observadas en una misma selección. Cada celda muestra probabilidad del modelo y `P` si pasó el gate de promoción; `R` si no lo pasó. Son estimaciones del modelo, no probabilidades validadas.

| Partido / mercado / selección / línea | sol61 | sol56 | astra6 | luna6 |
|---|---:|---:|---:|---:|
| RB Bragantino vs Mirassol / goals_over_under / under / 3.5 | 78.0% R | 76.0% P | — | 65.0% R |
| America Mineiro vs Fortaleza EC / h2h / away / — | 43.8% R | 55.0% P | 52.0% R | 48.0% R |
| America Mineiro vs Fortaleza EC / btts / no / — | 63.3% R | 61.0% R | 62.0% R | 53.0% R |
| Botafogo vs Vasco DA Gama / h2h / home / — | 48.0% R | 39.0% R | 40.0% R | 38.0% R |
| America Mineiro vs Fortaleza EC / double_chance / draw_or_away / — | 74.8% R | 84.0% P | 78.0% R | 78.0% R |
| Operario-PR vs Botafogo SP / goals_over_under / under / 2.5 | 64.0% R | 55.0% R | 64.0% R | — |
| America Mineiro vs Fortaleza EC / goals_over_under / under / 2.5 | 70.0% R | 63.0% R | 64.0% R | 61.0% R |
| Operario-PR vs Botafogo SP / btts / no / — | 58.0% R | 62.0% P | 58.0% R | 53.0% R |

## Selecciones para entrega

Incluye el portafolio general después del council y las selecciones del flujo de ligas obligatorias. Son caminos distintos del harness: el veredicto del council general no describe por sí solo toda la entrega. Vista previa local, sin enviar mensajes.

### gpt-6.1-sol high

Sin selecciones finales registradas

### gpt-5.6-sol xhigh

- atomic-prediction · required-league · required-league · cuota 1.36 · harness promotable · council —: Remo vs Gremio: goals_over_under under 3.5
- atomic-prediction · required-league · required-league · cuota 1.42 · harness promotable · council —: RB Bragantino vs Mirassol: goals_over_under under 3.5
- atomic-prediction · required-league · required-league · cuota 1.88 · harness promotable · council —: Cruzeiro vs Sao Paulo: h2h home
- parlay · required-league · principal · cuota 1.9312 · harness review-required · council —: RB Bragantino vs Mirassol: goals_over_under under 3.5; Remo vs Gremio: goals_over_under under 3.5

### gpt-6-astra medium

Sin selecciones finales registradas

### gpt-6-luna xhigh

Sin selecciones finales registradas

## Controles y límites

- Misma cohorte entre los cuatro modelos: true
- Respuestas deportivas únicas capturadas: 561; URLs con cuerpos inconsistentes: 0
- Selecciones comunes con cuotas diferentes: 0
- Modelo y esfuerzo verificados en todas las sesiones: true
- Contadores finales disponibles coinciden con sesiones: true
- Bases locales independientes, sin publicación a Discord. Producción conserva su configuración
- La semilla local no incluye predicciones antiguas ni historial de calibración en base de datos. Las cuatro corridas reciben la misma copia de los artefactos de validación publicados anteriores
- Investigación web independiente: mide el E2E entero, no sólo el razonamiento sobre un dossier idéntico. Las consultas web y sus horarios pueden variar
- Una sola réplica por combinación y una sola jornada. Modelo y esfuerzo cambian conjuntamente; no permite aislar causalmente cada factor
- Promovible significa que pasó los gates del harness; no demuestra acierto ni calibración. Los partidos aún no se liquidaron
- Uso parcial en llamadas interrumpidas es un mínimo observado; no se inventa consumo posterior al último contador

Archivos: [auditoría](audit.json), [costos por modelo](model-costs.csv), [predicciones](prediction-comparison.csv), [costos por llamada](call-costs.csv).
