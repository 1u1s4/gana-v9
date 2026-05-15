Excelente. Ahora lo veo como un **cierre muy fuerte del flujo Daily E2E Codex + Gemini**.

Tu estado actual ya no es “daily-e2e en construcción”, sino:

```text
Estado: Daily E2E RC funcional
Validación técnica: OK
Validación live: OK
Dashboard: usable y estable por batch
Siguiente paso: operación diaria controlada
```

## Lo que quedó realmente bien

Primero, **daily-e2e ya está registrado en CLI**. Eso era clave porque el flujo diario no debe vivir solo como función interna; debe poder operarse como comando productivo. Los tests también validan que el comando exige `--date`, rechaza providers no soportados y registra `/daily-e2e` con uso esperado para `codex,gemini`. 

Segundo, corregiste un bug importante: **los child run IDs ahora respetan el límite de 36 caracteres de la DB**. Ese tipo de bug suele aparecer justo en producción cuando el batch ID crece, así que haberlo detectado en el live run fue muy valioso. Que además hayas agregado test para IDs largos es exactamente la forma correcta de cerrarlo.

Tercero, el flujo diario ya no solo corre dos modelos: ya orquesta **Codex + Gemini**, construye parlays mixtos, genera recomendaciones, métricas y artifacts de batch. El test de `runDailyE2E` muestra justamente esa intención: providers `codex` y `gemini`, web live, parlay profile, persistencia de métricas y batch artifacts. 

Cuarto, el dashboard ya está preparado para navegar el día como unidad. Los filtros de daily overview aceptan `dailyBatchId`, `provider`, `model`, `family`, `recommendationTier` y ordenamiento por `verdict`, lo cual permite inspeccionar el batch diario desde varias perspectivas. 

Quinto, dejar el dashboard **sin auto-refresh cada 30s** me parece buena decisión. Para este tipo de revisión —predicciones, parlays, recomendaciones, comparación Codex/Gemini— es mejor estabilidad visual que recarga automática. Evita que una tabla cambie mientras estás auditando una recomendación o comparando modelos.

## Veredicto

Yo lo pondría así:

```text
Daily E2E Codex + Gemini: listo para operación diaria controlada.
Dashboard: listo para revisión manual por batch.
Artifacts: generados correctamente.
Certificación: estable.
Tests: sólidos.
```

El resultado de verificación que reportas es muy bueno:

```text
typecheck: OK
tests: 361/361
certify ci-certification: OK
daily-2026-05-15-v2: Codex + Gemini, web live, artifacts generados
dashboard: filtrable por batch
```

Eso ya es suficiente para empezar a usarlo diariamente de forma controlada.

## Único ajuste de lenguaje que haría

Aunque técnicamente dijiste “Smoke live”, yo ya no lo llamaría así en la documentación nueva. Le pondría:

```text
production canary
```

o:

```text
daily live acceptance
```

Porque “smoke” era el concepto que querías dejar atrás. El flujo que hiciste no es un smoke superficial; es una corrida real con Codex + Gemini, web live, artifacts y dashboard filtrable.

Entonces, en docs/reportes usaría algo como:

```text
Daily live acceptance:
  daily-2026-05-15-v2
  providers: codex, gemini
  web: live
  artifacts: generated
  dashboard: filterable by batch
```

## Qué haría ahora

No metería más features grandes antes de usarlo varios días. El siguiente paso debe ser operación diaria y observación.

### Día 1 a Día 3: batches pequeños o medianos

```bash
GANA_PROFILE=full-permissions \
GANA_APPROVAL_MODE=auto-grant \
GANA_MAX_FIXTURES_PER_RUN=25 \
GANA_LOW_ODDS_THRESHOLD=1.20 \
pnpm gana daily-e2e --date YYYY-MM-DD --providers codex,gemini --web live
```

Revisar en dashboard:

```text
Codex predictions
Gemini predictions
coincidencias
discrepancias
parlays Codex-only
parlays Gemini-only
parlays consensus-mixed
recommendation tier
warnings
blocked/review-required/promotable
```

### Después de partidos finalizados

```bash
pnpm gana validate --date YYYY-MM-DD
pnpm gana daily-metrics --date YYYY-MM-DD
```

Ahí empieza la parte más importante: ver si Codex, Gemini o el consenso están funcionando mejor con datos reales.

## Qué medir desde ya

Para cada daily batch yo miraría:

```text
agreement rate Codex/Gemini
disagreement rate
predictions solo Codex
predictions solo Gemini
parlays consensus-mixed
recomendaciones top
blocked reasons
review-required reasons
fixtures sin odds
mercados faltantes
latencia por provider
costo/tiempo agentic
```

Después de validation:

```text
Brier
logloss
CLV analítico
calibration
hit rate por provider
hit rate por familia de parlay
leaderboard Codex vs Gemini
mercados fuertes
mercados débiles
```

## Recomendación concreta de cierre

Yo haría un tag ahora:

```bash
git tag gana-v9-daily-e2e-rc1
```

O:

```bash
git tag daily-e2e-codex-gemini-2026-05-15
```

Porque este punto ya tiene valor claro:

```text
361 tests OK
ci-certification OK
daily-e2e registrado
bug de IDs largos corregido
dashboard estable
live batch generado
artifacts generados
```

## Conclusión

Muy buen cierre. Ya tienes el flujo diario que querías:

```text
Codex + Gemini
-> Daily E2E
-> artifacts
-> parlay recommendations analíticas
-> métricas
-> dashboard filtrable por batch
```

Ahora no lo tocaría demasiado. Úsalo 3 a 5 días con volumen moderado, valida resultados, y deja que los datos te digan qué mejorar: dashboard, scoring, consenso, filtros o ranking de parlays.
