# Verificación de la reevaluación previa con Astra

Cambio solicitado el 6 de octubre de 2026. Zona operativa: America/Guatemala.

## Contrato operativo

- El Daily inicial conserva Codex `gpt-5.6-sol high`. La reevaluación fija `gpt-6-astra medium`, web live, sin fast, fallback ni reutilización de una conversación anterior
- Hermes tiene habilitado `gana-v9-prematch-refresh` (`daf88c3535fd`) cada 15 minutos. El dispatcher existente (`aa5989740632`) conserva sus cinco horarios
- Sólo se incorporan Daily confirmados y revisiones publicadas. No se incorporan estudios ni artefactos sin entrega confirmada
- Se revisan partidos en las últimas dos horas y con más de 20 minutos de margen. El estado y la fecha local se comprueban otra vez contra el proveedor antes del modelo
- Hasta dos evaluaciones por partido: entrada en ventana y nuevas alineaciones confirmadas. Un cambio de precio solo no repite la evaluación. Cada pasada procesa hasta cuatro partidos bajo el mutex común
- Cada actualización conserva investigación, scoring e índice documental propios. Sólo selecciones promovibles, con valor esperado positivo y trazabilidad completa, pasan al publisher de revisiones. Se conservan sus controles DB, preview, evidencia, inicio del partido e idempotencia
- El mensaje inicial dice que Astra está programado; la revisión efectivamente evaluada puede decir que Astra ya intervino. Se conservan las marcas de revisión o bloqueo
- Un nuevo problema de conciliación genera aviso una vez; el mismo bloqueo no repite avisos cada 15 minutos

## Prueba real del 6 de octubre

`daily-2026-10-06-refresh-ef5b75ba` reevaluó Antigua y Barbuda–Aruba (`1640002`) entre 22:05 y 22:08 UTC. Investigación nueva y cuatro predicciones persistidas bajo `gpt-6-astra`; las cuatro tienen trazabilidad documental completa y quedaron bloqueadas por evidencia insuficiente. No se publicó una selección aprobada.

`daily-2026-10-06-refresh-a85b544d` obtuvo investigación nueva de Argentina–Benin (`1640517`), pero el proceso inicial cargado antes de la reparación rechazó el scoring por la frase documental “not a guaranteed home win”. No hubo predicciones ni publicación. El registro operativo se corrigió a fallo conservando la investigación y el error originales. Después del kickoff se cerró la conciliación: DB confirmó cero predicciones y cero publicaciones; no se hizo un reintento retrospectivo. La reparación distingue negaciones explícitas de garantías, conserva las demás prohibiciones y está cubierta por pruebas con promesas afirmativas, pagos y negaciones en campos separados. También se corrigió la clasificación de errores de scoring para que no aparezcan como evaluaciones exitosas.

El primer tick programado de Hermes terminó correctamente a las 16:16:28 de Guatemala y respetó el mutex ocupado por el nuevo E2E.

## Prueba final con el código corregido

`daily-2026-10-06-refresh-66d60429` reevaluó Chicago Fire–Vancouver (`1490326`) desde 22:58 UTC, antes de su kickoff de 00:30 UTC. El worker terminó `completed`, sin bloqueos operativos ni errores de scoring.

- Modelo `gpt-6-astra`, esfuerzo `medium`, web live
- Investigación nueva con 33 fuentes y nueve afirmaciones
- Seis predicciones, cinco con probabilidad numérica; cinco en revisión y una bloqueada
- Seis registros con trazabilidad completa y ninguna advertencia de frescura en retrieval
- Cero selecciones promovibles; no se envió una recomendación aprobada vacía

## Verificación local

- Suite completa: 834 pruebas aprobadas
- Notifier de recomendaciones: 40 pruebas aprobadas
- `pnpm typecheck`: aprobado
- Sintaxis de los wrappers y `git diff --check`: aprobados
- Gitleaks sobre los archivos modificados, con redacción completa: sin secretos detectados
- El dry-run con configuración inicial incompatible (`openrouter`, otro modelo y web desactivada) conserva Astra medium y web live

## Hallazgo de frescura durante el E2E

El primer E2E `daily-2026-10-07-prematch-v1`, provider `9570b22f-7f08-476b-b1d1-fc5710d75cb2`, terminó con 22 investigaciones válidas, 108 predicciones y cero promovibles; un partido quedó sin cuotas persistidas para los mercados solicitados. No se publicó.

Las cuotas se renovaban antes del scoring, pero `freshnessSourceType` clasificaba todas las fuentes `api-football` como cuotas. Los registros canónicos de córners FT, conservados por el cache factual de 24 horas, tenían capturas alrededor de 18:31 UTC y recibían erróneamente `stale odds source` en el scoring de 22:35 UTC. El modelo replicaba ese bloqueo aun con una cotización nueva.

La clasificación indiscriminada venía de `bfd2988`; el cache factual de 24 horas se incorporó en `a047489`. La combinación producía esta regresión después de la primera hora del cache.

La corrección distingue únicamente estadísticas históricas canónicas con identificador de córners, endpoint de estadísticas, estado FT y fecha pasada. Estas usan 24 horas; cuotas, fuentes no identificadas, estadísticas en vivo y fechas futuras conservan el control anterior. Una estadística histórica mayor a 24 horas sigue bloqueando promoción y elegibilidad para combinadas. Las pruebas verifican ambos lados, sin cambiar pisos de confianza ni requisitos de evidencia.

## E2E y entrega

La repetición `daily-2026-10-07-prematch-v2`, provider `cc57382c-c13b-4c12-9d2e-cf71c5baa923`, terminó correctamente a las 22:58:18 UTC. Reutilizó explícitamente las 22 investigaciones del primer intento, bajo el contrato existente del mismo modelo, y renovó cuotas y llamadas de scoring.

- 112 predicciones: 19 promovibles, 84 en revisión y 9 bloqueadas
- 112 registros con trazabilidad documental completa; cero artefactos de evidencia faltantes
- Un partido siguió sin cuotas para los mercados solicitados; no se fabricaron cotizaciones
- Una selección general y dos proyecciones obligatorias; el payload contiene tres entradas pero sólo dos selecciones únicas, porque Bragantino–Mirassol aparece también en la sección obligatoria. El formato canónico conserva ambas entradas y sus marcas de riesgo
- Cero combinadas publicadas; el council dejó una candidata general en revisión
- Publicación confirmada a las 22:59:15 UTC, ledger DB `2/2`
- Mensaje `1557165369268117517`, canal `1510040973218939022`; lectura posterior confirmó que sus tres embeds coinciden con el preview

[Mensaje en Discord](https://discord.com/channels/1494071161934450890/1510040973218939022/1557165369268117517)

El dry-run de inscripción, con reloj simulado `2026-10-07T08:00:00Z`, eligió el provider nuevo para los partidos `1562767` y `1635588`, sin bloqueos. No llamó al modelo ni al proveedor deportivo. Prueba guardada en `.artifacts/gana-v9/prematch-future-enrollment.json`.

Los hashes de ambos locks canónicos y de los artefactos originales del 6 y 7 de octubre permanecieron iguales después de publicar. La revisión tiene recibo y cohorte propios para la validación posterior.
