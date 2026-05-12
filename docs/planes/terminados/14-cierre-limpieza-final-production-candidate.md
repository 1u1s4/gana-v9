## Veredicto

Estado: completado. Este brief se atendio cerrando la coherencia documental y operativa: MySQL queda como DB canonica del RC, PostgreSQL como migracion futura, la certificacion paso de `ci-smoke` a `ci-certification`, los fixtures bajo `fixtures/replays` quedan como soporte tecnico interno y el dashboard se mantiene como observabilidad/read-only.

Va **muy bien**. Ya no lo veo como “proyecto en construcción inicial”, sino como un **production candidate avanzado**. El árbol actual muestra que el sistema ya tiene las piezas necesarias para operar como harness productivo: `runtime/pipeline.ts`, `runtime/run-service.ts`, `scheduler`, `worker`, `recovery`, `idempotency`, `observability`, `analytics`, `evals`, `dashboard`, `parlay`, `validation`, `permissions`, `security`, repositorios de storage y provider API-Football. 

Mi evaluación actual sería:

```text
Estado: production candidate avanzado
Nivel de avance: 90% - 93%
Siguiente fase: limpieza final + runs productivos controlados
Riesgo principal: lanzar volumen masivo sin resolver contradicciones documentales y límites operativos
```

---

## Lo que está muy fuerte

### 1. El sistema ya tiene arquitectura productiva

Antes el proyecto era principalmente TUI + provider + scoring. Ahora ya se ve una arquitectura más completa:

```text
runtime
pipeline
run-service
scheduler
worker
dispatcher
recovery
idempotency
observability
analytics
evals
dashboard
```

Eso es importante porque para predecir en masa no basta con generar picks. Necesitas poder ejecutar runs, recuperarte de fallos, evitar duplicados, registrar trazas, medir desempeño y revisar resultados. El árbol actual ya apunta claramente a eso. 

---

### 2. Parlay ya no es básico

El módulo `src/parlay` ahora incluye:

```text
builder
candidate-generator
correlation
diversifier
ranker
rules
service
types
```

Eso es una mejora grande. Ya no estás simplemente juntando predicciones; estás preparando selección, diversificación, control de correlación y ranking. Para producción eso importa mucho, porque el problema real no es solo “crear parlays”, sino evitar combinaciones pobres o demasiado correlacionadas. 

---

### 3. Analytics y evaluación ya están presentes

Veo módulos como:

```text
brier
logloss
clv
holdout
leaderboard
calibration-plot
```

Esto es excelente para la etapa en la que estás entrando. Cuando empieces a generar predicciones en volumen, lo más importante será medir si el sistema realmente mejora. Esos módulos te permiten observar calibración, pérdida, CLV, leaderboard y desempeño por estrategia/modelo/mercado. 

---

### 4. Seguridad está mejor cerrada

El árbol actual muestra una capa de permisos bastante más completa:

```text
approval-db
approval-executor
approval-service
approval-store
egress-policy
filesystem-policy
policy
tool-metadata
redaction
```

Y además existe `src/security/no-monetary-actions.ts`. Eso es clave porque el sistema puede producir análisis, predicciones y parlays, pero no debe ejecutar apuestas ni automatizar movimientos monetarios. 

---

### 5. El dashboard puede ayudar, sin reemplazar la TUI

Ahora existe `src/dashboard`, con `server`, `query`, `page` y `types`. También se ve que el dashboard lee metadata, overview, filtros, estados, predictions, parlays, validations y runs. Eso puede ser muy útil para observabilidad y revisión visual. 

Lo importante es mantenerlo como **superficie de lectura/observabilidad**, no como el centro operativo principal. El espíritu del proyecto sigue siendo TUI/CLI-first.

---

## Lo que todavía me preocupa

### 1. DB: el código usa MySQL, pero los planes siguen diciendo PostgreSQL

En el código actual, `prisma/schema.prisma` usa:

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

Pero el plan de DB dice que el motor canónico es **DigitalOcean Managed PostgreSQL**, con `uuid`, `timestamptz`, `jsonb`, `numeric(12,6)` y criterio de aceptación explícito de que `prisma/schema.prisma` use `postgresql`.  

Esto no bloquea si ya decidiste usar MySQL. Pero debes **cerrarlo documentalmente**. Para producción inmediata, yo haría esto:

```text
DB productiva MVP: DigitalOcean MySQL + Prisma.
PostgreSQL queda como alternativa futura, no como requisito actual.
```

No migraría a PostgreSQL justo antes de operar en masa. Pero sí actualizaría los planes para que no contradigan el código.

---

### 2. Smoke fue eliminado de scripts, pero sigue vivo en nombres internos

Aunque ya no aparecen scripts `smoke` en el árbol actual de `scripts`, veo que `src/evals/runner.ts` todavía tiene `profile = 'ci-smoke'` y un check llamado `replay-pipeline-evidence-pack-v2`. Eso mantiene lenguaje de smoke/replay dentro de la certificación. 

No es grave técnicamente, pero sí contradice la dirección que elegiste: producción online, sin smoke como concepto operativo. Yo renombraría eso a algo como:

```text
ci-smoke -> ci-certification
replay-pipeline-evidence-pack-v2 -> certification-pipeline-evidence-pack-v2
```

Y si `runReplayPipelineCheck` sigue existiendo, dejar claro que es **prueba técnica interna**, no modo operativo del producto.

---

### 3. Los documentos de QA siguen diciendo “smoke tests”

El documento de QA todavía habla de “smoke tests” como parte de la matriz de aceptación. 

Eso ya no va con tu decisión actual. Yo cambiaría:

```text
smoke tests
```

por:

```text
acceptance live
production certification
run productivo de aceptación
```

No es un cambio funcional, pero limpia el lenguaje del proyecto y evita que otra persona crea que el enfoque vuelve a ser smoke/offline.

---

### 4. `fixtures/replays` sigue existiendo

El árbol actual todavía muestra:

```text
fixtures/replays
```

Esto no necesariamente está mal. Puede servir para tests técnicos, regression o snapshots de referencia. Pero si quieres mantener el producto 100% online, documenta esto así:

```text
fixtures/replays no son modo operativo.
Solo sirven para pruebas técnicas internas.
```

No lo borraría si ayuda a tests. Solo evitaría que aparezca como flujo de producción.

---

## Lectura técnica del estado

Yo lo dividiría así:

| Área               |                    Estado | Comentario                                                               |
| ------------------ | ------------------------: | ------------------------------------------------------------------------ |
| Runtime/pipeline   |                Muy fuerte | Ya hay pipeline, run-service, scheduler, worker, recovery e idempotency. |
| API-Football       |              Muy avanzado | Provider, mappers, snapshots, errors, persistence y tests.               |
| DB/storage         |                  Avanzado | Repositorios completos, pero contradicción MySQL/PostgreSQL en docs.     |
| Filtros/low-odds   |                  Avanzado | Config, presets, engine, status y low-odds.                              |
| Research/evidence  |                  Avanzado | Claims, research, strict JSON, web trace y retries.                      |
| Prediction/scoring |                  Avanzado | Gates, prompts, scoring, service y tests.                                |
| Parlay             |                Muy fuerte | Builder, ranker, diversifier, correlation y candidate generator.         |
| Validation         |                  Avanzado | Result-fetcher, service, settlement rules y tests.                       |
| Analytics/evals    |                 Muy bueno | Brier, logloss, CLV, calibration, leaderboard, certification.            |
| Seguridad          |                 Muy bueno | Permissions, egress/filesystem policies, redaction, no-monetary-actions. |
| Dashboard          |                     Bueno | Útil como lectura/observabilidad, no como core operativo.                |
| Docs               | Parcialmente desalineadas | Smoke/PostgreSQL/replay todavía aparecen.                                |

---

## Qué haría ahora, en orden

### 1. Cierre documental mínimo

No haría más planes grandes. Solo una limpieza final:

```text
Actualizar DB canónica: MySQL o PostgreSQL.
Renombrar smoke -> production certification / acceptance live.
Aclarar que replays son test-only.
Aclarar que dashboard es observabilidad, no superficie principal.
```

Este cierre te evita confusión cuando ya estés operando runs reales.

---

### 2. Limpieza de nombres internos

Cambiaría estos conceptos:

```text
ci-smoke -> ci-certification
smoke -> acceptance-live o production-check
replay-pipeline-evidence-pack-v2 -> certification-pipeline-evidence-pack-v2
```

El objetivo no es eliminar pruebas; es eliminar el lenguaje que contradice tu enfoque productivo.

---

### 3. Primer batch real pequeño

Después de typecheck y tests, haría:

```bash
GANA_PROFILE=full-permissions \
GANA_APPROVAL_MODE=auto-grant \
GANA_MAX_FIXTURES_PER_RUN=10 \
GANA_LOW_ODDS_THRESHOLD=1.20 \
pnpm gana run --date YYYY-MM-DD
```

Luego:

```bash
pnpm gana export --run-id RUN_ID
pnpm gana artifacts --run-id RUN_ID
```

---

### 4. Escalar a batch medio

Si el run de 10 funciona:

```bash
GANA_MAX_FIXTURES_PER_RUN=40 \
pnpm gana run --date YYYY-MM-DD
```

Aquí ya debes mirar:

```text
cuota API-Football
latencia por endpoint
errores de provider
fixtures sin odds
mercados faltantes
blocked reasons
review-required
promotable
parlays generados
artifacts escritos
```

---

### 5. Escalar a producción diaria

Cuando el batch de 40 esté estable:

```bash
GANA_MAX_FIXTURES_PER_RUN=100 \
pnpm gana run --date YYYY-MM-DD
```

Y después de los partidos:

```bash
pnpm gana validate --date YYYY-MM-DD
```

Luego revisar:

```text
CLV
Brier
logloss
calibration
leaderboard
mercados fuertes
mercados débiles
ligas problemáticas
modelos/proveedores con mejor desempeño
```

---

## Límites que pondría antes de predecir en masa

Para no quemar cuota ni generar ruido:

```text
GANA_MAX_FIXTURES_PER_RUN=100
GANA_LOW_ODDS_THRESHOLD=1.20
maxParlayLegs=3 a 5
maxParlaysPerRun limitado
includeLiveFixtures=false para predicción
includeCompletedFixtures=false para predicción
includeCompletedFixtures=true solo para validation
```

También pondría un límite operativo diario:

```text
maxAgenticResearchCallsPerRun
maxApiFootballRequestsPerRun
maxRunDurationMinutes
maxRetryPerTask
```

Tu runtime ya tiene piezas como scheduler, worker, recovery e idempotency, así que estos límites deberían vivir cerca del pipeline/dispatcher, no como lógica dispersa en comandos. 

---

## Mi conclusión

Vas **muy bien**. El proyecto ya tiene forma de sistema productivo real, no de prototipo.

Lo que falta no es “más feature grande”, sino **cerrar coherencia y operar con control**:

```text
1. Cerrar DB canónica.
2. Eliminar lenguaje smoke/replay como operación.
3. Mantener replays solo como test técnico si hacen falta.
4. Ejecutar primer batch real de 10 fixtures.
5. Escalar a 40.
6. Escalar a 100.
7. Validar resultados y alimentar analytics/leaderboard.
```

En una frase:

> Gana v9 ya está listo para entrar en operación real controlada; antes de volumen fuerte, limpia las contradicciones de DB/smoke/replay y empieza a medir calidad con runs live pequeños.
