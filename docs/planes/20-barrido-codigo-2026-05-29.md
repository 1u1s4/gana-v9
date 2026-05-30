# Plan 20 - Barrido de codigo Gana v9

Fecha: 2026-05-29

## Objetivo

Hacer un barrido completo de la base de codigo, identificar mejoras y arreglos, aplicar los cambios seguros de alto impacto en este ciclo, y dejar un backlog priorizado para los cambios que requieren mas evidencia o una ventana de refactor dedicada.

## Alcance revisado

- 188 archivos TypeScript bajo `src`, con 47 tests y cerca de 50k lineas.
- Scripts operativos en `scripts`, Prisma en `prisma`, skills del harness en `skills`, docs y planes historicos en `docs`.
- Log de estrategia: `docs/harness-strategy-review-log.md`.
- Estado inicial: `main` limpio, 1 commit local delante de `origin/main`.

## Validacion base

Comandos ejecutados antes de aplicar cambios:

- `npm run typecheck`: OK.
- `npm test`: 397 tests OK.
- `npm run db:validate`: schema Prisma OK.
- `npm ci --dry-run`: fallo por `package-lock.json` desincronizado.

## Arreglos aplicados en este barrido

1. Sincronizacion de lockfile npm
   - Problema: `npm ci --dry-run` fallaba porque `package-lock.json` no contenia dependencias presentes en `package.json`, incluyendo Prisma y `fast-check`.
   - Cambio: regenerado `package-lock.json` con `npm install --package-lock-only --ignore-scripts --no-audit --no-fund`.
   - Resultado esperado: instalaciones limpias con npm vuelven a ser reproducibles.

2. Corpus de retrieval robusto ante payloads malformados
   - Problema: `buildCorpusFromEvidencePack` asumia arrays y objetos validos; podia crear documentos con ids como `undefined` o romper ante secciones no-array.
   - Cambio: entrada tipada como `unknown`, normalizacion defensiva de records, ids/textos no vacios y test nuevo.
   - Archivos: `src/retrieval/corpus.ts`, `src/retrieval/corpus.test.ts`.

3. Diagnosticos explicitos para daily runs y strategy reviews vacios
   - Problema: el log de estrategia reciente marco como listo agregar diagnosticos de runs vacios; los artifacts podian decir 0 predicciones/parlays sin explicar la causa operativa.
   - Cambio: `daily-e2e-summary.json`, `daily-parlay-recommendations.json` y reportes daily incluyen `runDiagnostics`; `strategy-review.json` y `strategy-review.md` incluyen diagnosticos por dia y resumen.
   - Archivos: `src/daily/e2e.ts`, `src/daily/e2e.test.ts`, `src/strategy-review/daily.ts`.

4. `.env.example` portable y alineado al estado actual
   - Problema: tenia rutas locales absolutas de usuario y una variable heredada de Cursor, aunque Cursor ya fue removido como provider.
   - Cambio: `CODEX_HOME` y `GEMINI_HOME` quedan vacios para usar defaults; se elimina `CURSOR_MODEL_LIST_PATH`; se agregan limites operativos faltantes para requests y research agentic.

## Backlog priorizado

### P0 - Debe cerrarse antes de confiar en nuevos ajustes de estrategia

- Elegir package manager canonico. El repo conserva `package-lock.json` y `pnpm-lock.yaml`; hoy ambos existen porque la documentacion mezcla `npm install` con comandos `pnpm gana`. Decision recomendada: declarar el manager canonico en `package.json` y documentar el otro solo como compatibilidad, o eliminar un lockfile en una PR dedicada.
- Completar propuestas `ready-for-implementation` recientes del strategy log con pruebas enfocadas antes de tocar politica de promocion:
  - bucket-level validation coverage gates;
  - market-level validation freshness gates;
  - positive-edge minimum-confidence fallback parlays;
  - quarantine de perfiles no-core en validacion operativa.
- Agregar guardas de sample-size antes de cualquier retuning de thresholds. No retunear umbrales desde muestras pequeñas.

### P1 - Mantenibilidad y seguridad operativa

- Separar archivos grandes en boundaries mas pequeños:
  - `src/dashboard/page.ts`;
  - `src/parlay/service.ts`;
  - `src/daily/e2e.ts`;
  - `src/commands.ts`;
  - `src/runtime/pipeline.ts`;
  - `src/prediction/service.ts`.
- Agregar script unico de verificacion, por ejemplo `npm run check`, que ejecute typecheck, tests y Prisma validate.
- Revisar artifacts y scripts sueltos en la raiz (`final_output.json`, `prediction_output.json`, `input.json`, scripts Python temporales). Recomendacion: mover fixtures reales a `fixtures/replays` y outputs generados a `.artifacts` o `tmp`.
- Reducir uso de `any` en paths de runtime, evidence, parlay y strategy-review mediante tipos de borde `unknown` + normalizadores.

### P2 - Calidad de developer experience

- Agregar lint/format consistente para TypeScript y scripts `.mjs`.
- Agregar tests directos para `src/strategy-review/daily.ts`; hoy gran parte se verifica indirectamente por comandos.
- Documentar una matriz corta de comandos por flujo: desarrollo local, CI, daily ops, strategy review, Discord dry-run.

## Criterio de cierre del barrido

- `npm ci --dry-run` debe pasar.
- `npm run typecheck` debe pasar.
- `npm test` debe pasar.
- `npm run db:validate` debe pasar.
- Este plan debe mantenerse como bitacora de lo aplicado y como backlog de las mejoras que no conviene mezclar en un unico cambio grande.
