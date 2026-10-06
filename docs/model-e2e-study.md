# Estudio E2E por modelo

El piloto del 6 de octubre de 2026 compara la jornada del 7 de octubre: `gpt-6.1-sol high`, `gpt-5.6-sol xhigh`, `gpt-6-astra medium` y `gpt-6-luna xhigh`. Cambian conjuntamente modelo y esfuerzo. Hay una réplica por combinación; no es un backtest ni una estimación de precisión.

Resultados del piloto: [informe y costos](studies/2026-10-06-model-e2e/report.md) · [interpretación y limitaciones](studies/2026-10-06-model-e2e/findings.md)

## Diseño

- Mismo commit, filtros, 12 partidos de expansión, prompts y gates del E2E diario; 300 segundos por intento y hasta tres intentos de salida estructurada
- Bases PostgreSQL locales independientes clonadas de una misma semilla; sin investigación ni predicciones previas
- Semilla leída de producción mediante `seed-local-study.mjs`: proveedores, competencias, equipos, partidos y presets; nunca escribe a la base de origen
- Respuestas de API-Football congeladas por URL canónica, con hash y fecha de primera captura. Las cuotas congeladas sirven para comparar, no para publicar recomendaciones vigentes
- Misma copia inicial de registros históricos validados. Caché de córners vacía en cada base; las respuestas compartidas se persisten con referencias locales válidas
- Investigación web independiente por modelo, como en producción. No aísla el scoring sobre un dossier común
- Workspaces vacíos, sandbox de lectura, sin fallback de modelo ni fast mode. El notifier se ejecuta sólo con `--dry-run`, sin enviar mensajes
- Dos E2E simultáneos, con la concurrencia interna normal del harness: primero ambos Sol, después Astra y Luna. El orden no fue aleatorizado

## Ejecución local

Requiere PostgreSQL local, las dependencias del repositorio y autenticación existente de Codex. No instala ni compra servicios. Usar un directorio nuevo; el coordinador rechaza reanudar sobre un manifiesto existente para no perder el costo de intentos anteriores.

1. Inicializar una instancia propia de PostgreSQL en loopback, puerto `55439`, y crear `gana_study_seed`
2. Aplicar el esquema con `prisma db push --skip-generate`, apuntando **ambas** variables `DATABASE_URL` y `DIRECT_URL` a esa base local
3. Ejecutar `node scripts/studies/seed-local-study.mjs ROOT URL_LOCAL YYYY-MM-DD`. El script comprueba destino local y nombre `gana_study_*`
4. Ejecutar `node scripts/studies/run-model-study.mjs ROOT YYYY-MM-DD`. Crea las bases `gana_study_HASH_MODELO`, donde el hash identifica el directorio; falla si ya existen
5. Ejecutar `node scripts/studies/summarize-model-study.mjs ROOT` durante o después de las corridas
6. Ejecutar `node scripts/studies/verify-study-delivery.mjs ROOT` para comprobar las referencias de publicación contra la base local y renderizar la vista previa de Discord
7. Al terminar, detener únicamente la instancia PostgreSQL creada para este estudio y conservar sus archivos y artefactos

El coordinador sólo redirige las lecturas deportivas de sus propios procesos. Las llamadas del modelo se registran por UUID en `CELL/usage`; sus sesiones originales permiten comprobar modelo, esfuerzo, consumo y reintentos.

No copiar una caché histórica de producción a una base vacía: sus `providerSnapshotId` dependen de filas del origen. El primer intento del piloto detectó esa referencia ausente, se detuvo y quedó marcado `invalid-setup`. Su consumo se conserva como preparación, separado del E2E comparable.

## Medición

El informe produce `report.md`, `comparison.json`, `model-costs.csv`, `prediction-comparison.csv` y `call-costs.csv`. Compara cohorte, investigación válida, predicciones, gates, portafolio, coincidencias semánticas y costo por etapa.

Los tokens totales son entrada más salida. La caché es parte de la entrada y el razonamiento es parte de la salida; no se suman dos veces. Se ignoran eventos repetidos del contador acumulado. Para interrupciones se conserva el último consumo observado y se marca parcial; un dato ausente no se convierte en cero consumo comprobado.

Se suma el consumo de cada solicitud interna del agente, incluidos los contextos que vuelve a leer al consultar herramientas. No es el tamaño de los documentos únicos. Las llamadas de la tabla son ejecuciones del CLI; cada una puede contener varias solicitudes al modelo.

El costo es un equivalente de API estándar calculado con las [tarifas oficiales](https://developers.openai.com/api/docs/pricing) del día del estudio, no una factura de Codex. Distingue caché y contextos largos por solicitud. Excluye herramientas, API deportiva y suscripciones. Promovible significa pasar los gates, no demostrar acierto.

Verificación focalizada: `node --test scripts/tests/model-study.test.mjs`
