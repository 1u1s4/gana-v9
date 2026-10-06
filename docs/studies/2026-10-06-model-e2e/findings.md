# Lectura del piloto E2E por modelo

Este piloto compara las combinaciones solicitadas, con una ejecución por combinación sobre 22 partidos del 7 de octubre de 2026. Se ejecutó el 6 de octubre. El [informe cuantitativo](report.md) y los CSV conservan consumo, predicciones y decisiones; la [metodología](../../model-e2e-study.md) describe cómo repetirlo.

## Qué podemos concluir

5.6 Sol xhigh fue la única combinación que produjo selecciones finales en este piloto. Luna fue la más barata y Astra la más rápida. Ninguno de esos resultados establece qué modelo acertará más partidos. Las cuatro corridas sumaron 48.364.772 tokens observados y al menos USD 74,6094 equivalentes de API; con la preparación descartada, 57.830.364 tokens y al menos USD 84,3100.

El modelo cambia el resultado del E2E en más de un punto: decide qué investigación puede pasar al scoring, si entrega una probabilidad, qué confianza asigna y qué selección propone. Por eso contar recomendaciones finales no basta para medir calidad predictiva.

6.1 Sol high y Astra medium terminaron sin predicciones promovibles. En ambos, la confianza máxima observada fue 0,61, por debajo del piso 0,65 del harness. 5.6 Sol xhigh produjo 11 promovibles, repartidas entre seis partidos; cinco provinieron del conjunto inicial y seis de la expansión de cobertura. Esto demuestra diferencias operativas bajo el mismo contrato, no que esas once estimaciones estén mejor calibradas.

5.6 habilitó tres simples y un parlay en el flujo de ligas obligatorias. Su portafolio general quedó vacío después del council. El parlay de ligas obligatorias conserva una señal `review-required`; las tres simples son `promotable`. Son cuatro selecciones de entrega que reutilizan tres predicciones, no cuatro pronósticos independientes. El estudio verificó el resultado que realmente renderiza el notifier, sin publicar mensajes.

Luna xhigh completó 18 investigaciones válidas de 22. Tres partidos agotaron los reintentos de 300 segundos; otro terminó sin usar la búsqueda web obligatoria. Los cuatro generaron fallback exclusivamente con contexto del proveedor deportivo. Se conservan en la auditoría, pero no cuentan como investigación documental completa. Cambiar el timeout solamente para Luna habría cambiado el experimento.

Luna terminó con 70 estimaciones numéricas, ninguna promovible y una confianza máxima de 0,63. Consumió 12,54 millones de tokens y al menos USD 0,7345 equivalentes, con 17 interrupciones de investigación. Su tarifa baja no compensó la ausencia de entrega bajo los gates actuales, pero merece distinguir ese resultado operativo de una evaluación de acierto que todavía no existe.

## Una diferencia que no se explica por las cuotas

Para Bragantino–Mirassol, 6.1 y 5.6 citaron la misma previa secundaria que reportaba a Walter en duda. La incertidumbre tuvo consecuencias distintas:

| Menos de 3,5 goles | Probabilidad | Confianza | Resultado |
|---|---:|---:|---|
| 6.1 Sol high | 78% | 0,38 | Revisión por disponibilidad del arquero |
| 5.6 Sol xhigh | 76% | 0,67 | Promovible |
| Astra medium | Sin estimación | 0 | Bloqueado por incertidumbre sin cuantificar |
| Luna xhigh | 65% | 0,30 | Bloqueado por falta de edge y evidencia insuficiente |

6.1 calculó una probabilidad ligeramente mayor y aun así se abstuvo de promoverla. Astra mantuvo los antecedentes descriptivos pero rechazó convertirlos en una probabilidad actual. 5.6 consideró suficientes los antecedentes para promover el under. Esta diferencia obliga a evaluar la justificación y la calibración posterior, no sólo a premiar el número de picks.

La explicación de Luna contiene además una imprecisión concreta: describe el under 3,5 como cobertura de hasta dos goles, cuando también gana con tres. Después reconoce que no dispone del conteo exacto de partidos con tres goles y propone 65%. El registro quedó bloqueado; este caso demuestra por qué también hay que revisar la coherencia del razonamiento, aunque haya una probabilidad numérica y referencias asociadas.

La revisión externa encontró una [ficha indexada de oGol](https://www.ogol.com.br/jogo/2026-10-07-red-bull-bragantino-mirassol/11861063) que también marcaba a Walter en duda. No se pudo abrir la previa completa, por lo que esta auditoría no confirma su disponibilidad real ni valida todos los detalles citados por los modelos. Los archivos del caso preservan lo que cada modelo declaró y la comprobación parcial realizada.

Entre 6.1 y 5.6, las 47 selecciones con probabilidad numérica en ambos difirieron en promedio 3,54 puntos porcentuales de probabilidad, frente a 11,06 puntos de confianza. Son selecciones correlacionadas de una jornada, no 47 observaciones independientes de precisión.

## Limitaciones encontradas en el harness

El filtro monetario produjo falsos positivos verificables al leer advertencias preventivas dentro del dossier: por ejemplo, una frase que niega una garantía de resultado activa el patrón que busca esa garantía. Afectó un partido en 6.1, dos en 5.6, dos en Astra y uno en Luna. Los extractos y rutas de cada coincidencia quedan en [la auditoría del filtro](monetary-guard-research-cases.json). Es una limitación del harness que puede reaccionar de manera distinta a la redacción de cada modelo. No se modificó durante la comparación.

Los modelos tampoco recibieron cuotas utilizables para el partido `1638581`. Esa ausencia común se distingue de una abstención del modelo. La auditoría conserva errores de scoring, fallbacks de investigación y registros sin probabilidad para no ocultarlos detrás de un conteo agregado.

La semilla local no contiene el historial de predicciones usado para calibración en producción. Las cuatro bases reciben los mismos artefactos previos de validación publicados. El orden de los modelos no fue aleatorizado, la caché de Codex no se puede vaciar y la investigación web ocurrió en horarios diferentes. Las respuestas deportivas y las cuotas sí fueron compartidas y verificadas. Las conclusiones se limitan a esta configuración experimental.

## Cómo interpretar el costo

El consumo suma todas las solicitudes internas del agente, incluidos contextos releídos al usar herramientas y reintentos. Los tokens de caché ya están dentro de la entrada; los de razonamiento, dentro de la salida. El importe es un equivalente de API estándar, no una factura observada de Codex. Las interrupciones dejan mínimos observados y un intento de 6.1 no expuso consumo utilizable.

El primer montaje falló por referencias de caché de córners ausentes en la base local. Se descartó, se corrigió el aislamiento y se repitió con bases nuevas. Su consumo —9.465.592 tokens y al menos USD 9,7006 equivalentes— figura separado; no se esconde ni se usa para evaluar la calidad de los modelos.

## Qué falta para elegir un modelo por calidad

Este piloto no permite declarar un ganador en acierto: los partidos todavía no se habían liquidado al cerrar la investigación. Antes de cambiar producción por estos resultados, corresponde contrastar las estimaciones con resultados reales, comparar mercados y líneas equivalentes y medir tanto cobertura como errores probabilísticos. También hacen falta varias jornadas y réplicas para saber cuánto cambia una misma combinación entre ejecuciones.

Un segundo experimento útil sería dar el mismo dossier documental a los cuatro modelos para aislar el scoring. Este piloto conserva investigación propia porque la pregunta era cómo cambia el E2E completo. No se ejecutaron esas réplicas adicionales ni se programaron nuevos gastos.

## Verificación y trazabilidad

Se cotejaron 200 sesiones contra el medidor: ninguna sin registrar, duplicada o todavía en ejecución. Los modelos y esfuerzos coinciden con los solicitados, los contadores finales disponibles coinciden y las 561 respuestas deportivas únicas no presentan cuerpos inconsistentes. Las cuotas de las selecciones comunes coinciden. Las once predicciones promovibles tienen referencias internas completas a claims, evidencia y fuentes; esta prueba de referencias no equivale a verificar todas las afirmaciones externas.

Las cuatro vistas previas de entrega coinciden con sus artefactos y referencias de base local. Se enviaron cero mensajes. Las pruebas focalizadas del medidor y caché pasaron, y se detuvo la instancia PostgreSQL propia del estudio al terminar. Producción conserva su configuración.

El [registro de auditoría](audit.json) conserva los identificadores de ejecución, hashes de insumos, fallbacks, métricas y resultados de verificación. Los artefactos completos, sesiones y bases locales se conservan fuera de Git en `.artifacts/gana-v9/model-study-2026-10-06-v2`; el montaje descartado está en `.artifacts/gana-v9/model-study-2026-10-06`.
