# Recuperación de recomendaciones y validaciones · 2026-10-06

## Objetivo activo

Rastrear y corregir el quiebre de entrega/calidad de recomendaciones y de su
validación, incluyendo low-odds, con decisiones del modelo y evidencia documental
del harness. Preservar los cambios locales anteriores y los gates de producción.

## Verificadores

- Reconstruir la cronología con commits, locks y artifacts reales
- Validar exactamente la cohorte entregada, separando candidatas de aprobadas
- Investigar el embudo low-odds sin inventar probabilidades ni exigir picks diarios
- Pruebas de regresión de publicación, selección, evidencia y validación;
  typecheck y suite completa al modificar comportamiento compartido
- Replay de artifacts reales y dry-run operativo sin reenvíos ni escrituras live
- Registrar límites: un replay histórico no demuestra calidad predictiva futura

## Hallazgos iniciales

- Última publicación de septiembre observada: 18/09; del 22 al 30 hay locks
  retryable sin recomendaciones. El 22/09 se endureció evidencia/publicación
  (`c65884b`); ya existían fallos el 19 y 21, así que no hay una única causa
- El barrido low-odds detectó favoritos en 13/16 slates 22/09–07/10. Descubrir
  favoritos no equivale a tener valor positivo, evidencia suficiente o parlay
- Los cambios locales previos agregaron entrega `review-delivered`. Hay cinco
  fechas (01, 02, 03, 05 y 06/10) cuyo seguimiento quedó excluido: el resolver
  de validación sólo admite `published` y el artifact de recomendaciones vacío
- En 06/10, 46 cotizaciones extremas representan 9 partidos; 7 tienen cobertura
  de scoring. Las 96 predicciones del run conservan `research is not promotable`
- Research registra gaps de córners junto a claims utilizables de otros mercados,
  pero el contrato sólo permite un gate global. Se requiere decisión explícita
  por mercado y conflictos compartidos; no reinterpretar retrospectivamente una
  abstención del modelo como aprobación

## Disciplina

Inspeccionar → reproducir → corregir → verificar → registrar resultado y siguiente
paso. No cambiar umbrales para producir picks ni reescribir artifacts publicados.
No emitir mensajes ni reprocesar DB histórica como efecto de una prueba local.
Objetivo completo sólo con evidencia de los verificadores; los efectos externos
pendientes se describen con precisión.

## Causas y correcciones verificadas

1. **Entrega y validación incompatibles:** la entrega `review-delivered` proviene
   de cambios locales anteriores a esta investigación, todavía sin commit. No
   puede atribuirse honestamente a un SHA. El resolver y dispatcher sólo admitían
   `published`. Ahora validan el artifact de candidatas exacto, con correspondencia
   de message IDs, hash en locks nuevos y selección por `displayedPredictionIds`.
   No incorporan las candidatas omitidas ni las convierten en aprobadas. El espejo
   conserva la etiqueta de revisión y el workflow reintenta resultados pendientes.
2. **Gates globales:** `c65884b` (22/09) retiró la promoción automática basada en
   conteo de claims. Esa protección era necesaria, pero dejó visible que el modelo
   podía abstenerse globalmente por córners y contaminar otros mercados. Se conserva
   la abstención legacy; el contrato nuevo pide `markets` y `sharedBlockers`
   explícitos. Cada mercado requiere evidencia vinculada propia; conflictos del
   mercado, bloqueos compartidos y fallos de fuentes siguen impidiendo aprobación.
3. **Timeout y sesión de scoring:** el límite de 420 s se remonta a `d6565fd`
   (09/05), incompatible con varios intentos de 300 s. Los cambios locales previos
   subieron los intentos a tres. El 06/10 Argentina–Benín (`1640517`) tuvo research
   promotable y scoring abortado a 420 s. Ahora el presupuesto externo incluye
   los tres intentos y el margen (930 s por defecto), y cada intento de scoring
   recibe config aislada sin `codexThreadId` heredado.
4. **Otro favorito sin scoring:** `1545655` perdió research por JSON truncado, y
   se bloqueó correctamente por ausencia de web real. Se conservan los arreglos
   locales previos de reintento de research y se retira su límite arbitrario de
   cuatro claims cuando hay cinco mercados solicitados.
5. **Diagnóstico documental:** el Daily crea un índice de decisiones del modelo
   con IDs de evidencia, claims, fuentes y cotizaciones. El audit low-odds separa
   investigación/scoring faltante, estimaciones presentes y promoción. Las nuevas
   candidatas requieren justificación e IDs de evidencia. Una entrega interrumpida
   permanece incierta y no se reenvía automáticamente.
6. **Validaciones recortadas:** `965cf9a` (19/05) introdujo un límite de ocho
   selecciones en el espejo y sus métricas, que quedó desalineado con la entrega
   posterior de hasta 25. Los artifacts modernos ahora conservan toda la cohorte
   y la paginan. Replay real del 05/10: 25 candidatas, 26 embeds en tres páginas,
   sin inventar resultados para la previsualización.

## Evidencia reproducible

Directorio: `.artifacts/gana-v9/recovery-2026-10-06/`

- `incident-audit.json`: 16 slates canónicos 22/09–07/10; favoritos <1.10 en 13.
  Los tres sin hits son 29/09, 05/10 y 07/10. No se interpreta ausencia de hits
  como error ni favorito como garantía de valor positivo
- `dispatcher-dry-run.json`: quedan elegibles las cuatro fechas históricas de
  candidatas 01, 02, 03 y 05/10; 06/10 se validará cuando sea fecha pasada
- `validation-dry-run.json`: preview del 05/10 contra el artifact de revisión,
  sin comandos, DB, API, envíos ni locks nuevos
- `model-evidence-replay.json`: 97 registros de predicción del 06/10 con referencias
  resueltas dentro de su propio bundle; incluye una variante de precio low-odds
- `notifier-dry-run.json`: preview del artifact publicado del 07/10
- Canary real de research: fixture `1492392` (RB Bragantino–Mirassol, 07/10),
  `gpt-5.6-sol`, fuentes API y búsqueda web reales, 13 fuentes y 17 claims.
  El modelo aprobó factual readiness para cuatro mercados y dejó córners en revisión
- La primera normalización del canary detectó una segunda causa: un warning sobre
  una fuente conflictiva **descartada** se interpretaba como fallo compartido.
  Se preservó en `gated-bundle-before-scope-fix.json`; la corrección mantiene las
  decisiones estructuradas sin transformar una fuente descartada en veto global
- `scope-normalization-replay.json` declara explícitamente la reconstrucción:
  se retiró sólo el diagnóstico generado por nuestro normalizador anterior y se
  reaplicó el corregido. No se modificaron hechos, fuentes ni decisiones del modelo

## Verificación y límites

- `pnpm test`: 795 pruebas aprobadas
- `pnpm typecheck`: aprobado
- Notificadores de recomendaciones y estadísticas: 46 pruebas aprobadas
- `node --check scripts/gana-daily-e2e-and-notify.mjs` y `git diff --check`: aprobados
- Manifiestos de prompt y golden de certificación actualizados a los hashes reales
  del nuevo contrato; no se retiraron checks ni se redujeron gates
- Hermes sigue habilitado con cinco checkpoints; crontab vacío. No se cambiaron
  horarios, no se sobrescribieron artifacts publicados y no hubo envíos ni writes
  de producción como parte de esta verificación
- Las pruebas reales usan almacenamiento aislado. No demuestran una mejora de
  acierto, calibración o rentabilidad; eso requiere resultados futuros. Los
  pendientes históricos quedaron preparados para el catch-up del dispatcher

## Canary final

`live-canary-after-fix.json`: API y scoring real con almacenamiento aislado,
reutilizando los hechos originales y el replay de normalización declarado arriba.
Cuatro mercados conservaron estimaciones (h2h 0.29, doble oportunidad 0.53,
goles 0.54, BTTS 0.48) sin heredar `research is not promotable`. Córners quedó
bloqueado sin probabilidad. Los cuatro candidatos siguieron en revisión por
confianza/incertidumbre: ningún umbral fue reducido para obtener una recomendación.

La prueba del adaptador local anterior quedó en
`canary-adapter-missing-fair-prices.json`: usaba un separador incorrecto para
recuperar el precio justo. Se corrigió sólo ese adaptador de prueba, se refrescaron
las cuotas y se repitió scoring. El resultado final contiene probabilidades justas
del provider; la ejecución defectuosa no se cuenta como prueba de éxito.
