# Estudio de migración de Gana v9 a Pi

Estado: estudio completo y verificado, 2026-10-13, America/Guatemala

## Resultado autorizado

Entregar un estudio profundo de viabilidad y un plan completo para migrar el
proyecto actual al harness Pi, incluyendo componentes rescatables, dependencias,
credenciales, operación, pruebas, transición y rollback. La meta activa del chat
ya fue creada por `/goal`; este archivo conserva sus criterios de cierre

## Alcance y límites

- Base: checkout Gana v9 `65ab484`, con cambios ajenos preexistentes
- Destino estudiado: Pi `1.2.0`, commit `06a466935536f8c9bcacb2d5efc0fc021be1bdff`
- Incluir CLI/TUI, motor analítico, DB, scheduler, prematch, Discord, skills y estado
- Inventariar secretos por nombre, ubicación y presencia, sin publicar valores
- Preservar código, datos, gates, cron, credenciales y trabajo ajeno
- No implementar el reemplazo productivo, hacer login, enviar mensajes, consultar
  modelos pagos, cambiar schedulers ni ejecutar escrituras o migraciones DB
- Las pruebas locales aisladas y la descarga de dependencias quedan dentro del estudio

## Verificador

El documento principal debe cubrir cada frontera del inventario, separar hechos
observados de propuestas, enlazar fuentes primarias fijadas a versión, contener
un plan secuenciado con condiciones de aceptación y reversión, y tener un runbook
de credenciales sin valores reales. Registrar resultados reales y límites de las
pruebas. Verificar enlaces locales, hashes de contratos, integridad del diff y
ausencia de credenciales reales en todos los nuevos entregables

## Bucle y prueba de cierre

Inspeccionar código y fuentes → mapear equivalencias y brechas → comprobar APIs
sin red de servicios → escribir plan → revisar cobertura, secretos y enlaces →
corregir omisiones → registrar evidencia → completar la meta

Un fallo de login o acceso a producción no bloquea este estudio: queda como gate
explícito de implementación. No declarar viabilidad productiva probada con mocks,
un catálogo de modelos o una prueba de importación

Entregables: `../24-migracion-a-pi.md`, `secretos-y-operacion.md`, `evidencia.md`,
inventario de entorno y prueba local reproducible del SDK

## Prueba de finalización

- Estudio principal entregado con arquitectura, inventario, seis brechas críticas,
  fases P0–P8, gates G0–G9, estimación, transición, rollback y cierre de migración
- Runbook de secretos/operación y 158 variables inventariadas sin valores
- Baseline aislado: typecheck correcto y 221 pruebas existentes aprobadas
- Los 18 contratos conservaron sus hashes, schemas y manifests
- Smoke real de Pi 1.2.0 correcto sin inferencia ni credenciales copiadas
- Links locales y referencias verificados; cero secretos reales detectados en entregables
- Configuración productiva, jobs, DB y canales no fueron migrados ni modificados
- Login, investigación web e inferencia live quedan como gates explícitos del plan

Detalle: [evidencia](evidencia.md) y [verificación final](verificacion-final.json)
