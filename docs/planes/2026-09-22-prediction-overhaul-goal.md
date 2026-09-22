# Objetivo: mejorar predicciones y entrega de Gana

## Resultado pedido

Completar el objetivo original guardado en
`/Users/luisalvarado/.codex/attachments/3c9ae466-1512-4c35-b635-4f0de3be18d8/goal-objective.md`.
Primero conservar y subir pendientes; después auditar el repositorio, corregir
puntos de dolor del flujo de fútbol y demostrar su funcionamiento end to end.

Al terminar: commit y push a main, repositorio saneado conservando trabajo ajeno,
verificación real de entrega en Discord y creación de una tarea separada en el
proyecto gana-v9 con objetivo persistente para un nuevo repositorio de sitio
público inspirado profundamente en https://gambeta.ai/#picks, sólo fútbol,
con predicciones de nuestra DB y assets desde API. El sitio se desarrolla en esa
tarea posterior; no bloquea el cierre de esta tarea una vez creada y despachada.

## Línea base observada

- Pendientes conservados y subidos en `dbba137`: defaults Astra medium y revisión
  de estrategias. 17 pruebas focalizadas y typecheck aprobados; main sincronizado.
- `GOAL.md` raíz pertenece a incidentes ya resueltos de julio; conservarlo.
- Defaults low-odds: 1.20 y mercados h2h/double chance. No representa el pedido
  específico de favorito ganador estrictamente menor a 1.10.
- Liga obligatoria por defecto: Mundial 2026, fija; falta actualización semanal.
- Selección diaria concentra tres perfiles; revisar diversidad real y duplicados.
- La apuesta analítica del día selecciona mayor confianza publicada con cuota
  >=1.45; evaluar calidad y trazabilidad antes de cambiar criterios.
- README y guía operativa contienen datos desactualizados de DB/modelo/scheduler.

## Alcance y verificadores

1. Mapa amplio por componentes y problemas respaldados por código/artifacts.
2. API y Codex: datos estructurados completos y actuales, web con fuentes,
   incertidumbre explícita, análisis por familias de mercado sin cuotas forzadas.
3. Low-odds: descubrimiento global de ganadores <1.10, cobertura auditable,
   combinada >=1.20 si pasan controles; estado diario explícito si no es elegible.
4. Diamante, mejores del día, diversidad y apuesta analítica: selección trazable,
   sin duplicados artificiales ni relajación de riesgos por necesidad de publicar.
5. Retrospectiva reproducible de picks realmente publicados y resultados
   liquidados, separada del tuning live y sin usar información futura como entrada.
6. Ligas: detectar competiciones importantes activas con API, considerar sus
   fixtures diariamente y refrescar la lista semanalmente en el flujo existente.
7. Discord: embeds breves con partido, hora, selección, cuota y estado relevante;
   preservar paginación, lineage, idempotencia y evidencia de message IDs/readback.
8. Verificación: pruebas focalizadas por corrección, typecheck, suite completa al
   integrar, dry-run de notificación y E2E con datos/proveedor reales. Una ausencia
   de picks o fallo de proveedor no constituye éxito de entrega.
9. Cierre: pruebas aprobadas, cambios committed/pushed, status limpio, evidencia
   de API/Codex/DB/Discord y tarea web posterior creada explícitamente.

## Iteración y restricciones

Inspeccionar → registrar hallazgo → cambio acotado → prueba que pueda fallar →
integrar → ejecutar E2E → corregir fallos → registrar evidencia verificable.
No exponer secretos; no borrar historial ajeno; no debilitar tests, gates,
permisos o protecciones. No afirmar ganancias ni certeza por cuotas cortas.
No ejecutar apuestas, pagos, compras o cambios de suscripción. El usuario autorizó
pruebas API, publicación necesaria en Discord, commit/push a main y creación del
nuevo repositorio/tarea al final. Evitar duplicar publicaciones ya confirmadas.
Las auditorías se delegan en límites de archivos; integración y cierre son del
agente principal. No crear goals hijos sin autorización explícita.

## Estado durable

Bitácora: `docs/planes/2026-09-22-prediction-overhaul-worklog.md`.
Guardar comandos, resultados, artifacts y siguiente paso antes de interrupciones.
Completar sólo cuando cada verificador se satisface. Un bloqueo exige condición
externa repetida según la disciplina del goal y ausencia de trabajo útil restante.
