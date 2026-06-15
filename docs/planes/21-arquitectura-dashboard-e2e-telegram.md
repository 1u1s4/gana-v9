# Plan 21: arquitectura, dashboard, E2E y Telegram

Fecha: 2026-06-15
Estado: activo

## Fit de objetivo

Goal mode aplica porque el trabajo cruza UI, scripts operativos, pruebas, notificaciones y verificacion visual. El cierre no depende de una declaracion manual: debe poder comprobarse con pruebas, checks de sintaxis, browser local y evidencia registrada.

## Requisitos del usuario

- Instalar y usar la skill `ultragoal` en el proyecto.
- Mejorar la arquitectura del codigo.
- Mejorar el dashboard, incluyendo version movil y UI/UX.
- Usar browser para inspeccionar el estado actual y verificar mejoras.
- Mejorar las ejecuciones E2E.
- Mejorar las notificaciones de Telegram de las ejecuciones.
- Hacer trazable lo planeado y lo hecho.
- Usar agentes paralelos con objetivos propios.

## Baseline observado

- La skill `ultragoal` fue instalada en `.agents/skills/ultragoal`.
- El dashboard local se sirve con `pnpm gana dashboard --port 4317`.
- Fuentes iniciales:
  - `src/dashboard/page.ts`
  - `src/dashboard/server.ts`
  - `src/dashboard/query.ts`
  - `src/daily/e2e.ts`
  - `scripts/gana-daily-e2e-and-notify.mjs`
  - `scripts/gana-daily-e2e-notify.sh`
  - `scripts/gana-telegram-rich-output.mjs`
  - `docs/daily-operations-cron.md`

## Objetivo

Entregar una mejora estrechamente acotada y verificable que deje el dashboard mas usable en movil, reduzca acoplamiento o repeticion en codigo operativo, haga las ejecuciones E2E mas observables/robustas, y mejore el resumen Telegram de los wrappers, con trazabilidad de decisiones y evidencia.

## No objetivos

- No cambiar credenciales, crons reales, webhooks, ni enviar notificaciones externas sin aprobacion explicita.
- No modificar reglas de prediccion o recomendacion salvo que sea necesario para observabilidad del E2E.
- No borrar artifacts existentes salvo que el usuario lo pida.
- No debilitar pruebas, checks o gates existentes.

## Verificador primario

Una combinacion de:

- `pnpm typecheck`
- `pnpm test`
- `node --check scripts/gana-daily-e2e-and-notify.mjs`
- `node --check scripts/gana-telegram-rich-output.mjs`
- Browser local contra el dashboard en desktop y movil, con evidencia de que el layout no se rompe.

## Checks de soporte

- Tests focalizados para cualquier helper nuevo de dashboard/E2E/Telegram.
- `bash -n scripts/gana-daily-e2e-notify.sh` si se toca el wrapper shell.
- Relectura de docs modificadas para confirmar trazabilidad.

## Loop de iteracion

1. Inspeccionar baseline y asignar carriles a subagentes.
2. Registrar hallazgos relevantes en el worklog.
3. Hacer cambios pequenos por area.
4. Ejecutar verificador focalizado.
5. Corregir fallos sin reducir cobertura.
6. Ejecutar verificador completo y browser.
7. Registrar resultado final y riesgos.

## Reglas anti-cheating

- No esconder fallos de tests ni convertir errores en warning para pasar verificacion.
- No reemplazar datos reales por mocks en rutas productivas.
- No reducir alcance del dashboard movil a estilos cosmeticos sin revisar browser.
- No enviar mensajes Telegram/Discord reales durante verificacion sin aprobacion.

## Gates de aprobacion

Requieren aprobacion separada:

- Enviar notificaciones reales a Telegram o Discord.
- Cambiar crons instalados o jobs Hermes activos.
- Borrar artifacts o locks.
- Ejecutar flujos live que consuman cuotas externas de forma significativa.

## Delegacion

- Arquitectura: detectar bajo acoplamiento y refactor seguro.
- Dashboard: inspeccionar estructura UI y proponer/implementar mejora responsive con ownership en `src/dashboard/*`.
- E2E: revisar robustez, locks, resumenes y tests de `src/daily/*` y wrappers.
- Telegram: revisar `scripts/gana-telegram-rich-output.mjs` y consumers, mejorar resumen sin exponer secretos.

## Evidencia de cierre esperada

- Paths cambiados.
- Resultado de pruebas/checks.
- URL local usada para browser.
- Capturas o descripcion verificada de desktop/movil.
- Registro de decisiones en `docs/planes/21-arquitectura-dashboard-e2e-telegram-worklog.md`.
