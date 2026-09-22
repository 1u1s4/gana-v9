# Portal público de fútbol: tarea posterior

Este trabajo se inicia en una tarea nueva tras integrar, probar y subir la mejora
del flujo diario. El usuario autorizó crear un repositorio nuevo y activar allí
un objetivo persistente. La entrega nueva a Discord permanece pendiente en la
tarea principal porque el E2E actual no produjo picks elegibles; no se afirma
que esa verificación haya pasado. El despliegue público queda para después.

## Resultado pedido

Construir una adaptación profunda del estilo y las funciones de
[Gambeta](https://gambeta.ai/#picks), dedicada exclusivamente al fútbol y alimentada
por las recomendaciones de Gana. Usar identidad Gana y assets de equipos, ligas y
países obtenidos mediante API. No presentar predicciones de terceros como propias.

La lectura inicial de la referencia muestra filtros por liga y fecha, un pick
destacado, resultados históricos y detalle de análisis. La nueva tarea debe
inspeccionar visualmente la referencia en escritorio y móvil, recorrer sus flujos
y documentar qué comportamientos de fútbol va a reproducir antes de implementarlos.

## Integración existente a investigar

- Gana usa PostgreSQL/Supabase y Prisma. Revisar `prisma/schema.prisma`, el ledger
  `PublicRecommendationPublication` y las rutas `/api/public-picks` del dashboard
- Consumir solamente publicaciones confirmadas, preservando fecha, zona horaria,
  cuotas, selecciones, procedencia y resultados. Separar historial liquidado de
  recomendaciones futuras y representar honestamente los días sin picks
- Mantener la apuesta analítica del día persistida. No recalcular su selección en
  el cliente ni publicar candidatos internos o predicciones bloqueadas
- Investigar los assets ya persistidos y `scripts/backfill-api-football-assets.ts`
  antes de sumar consultas. Cachear recursos y mantener las claves de API y DB
  exclusivamente en el servidor
- Integrar mediante lectura limitada. Conservar RLS y permisos existentes, sin
  exponer credenciales operativas ni modificar el flujo diario de producción

## Alcance y prueba de finalización del nuevo goal

1. Repositorio independiente, plan y bitácora propios; Gana sirve como referencia
2. Interfaz responsive de fútbol: picks, filtros, detalle, combinadas, pick del día
   e historial con resultados verificables. Navegación y estados vacíos/error reales
3. Datos conectados al origen de publicaciones y logos reales cuando existan;
   fallback visual explícito cuando falten assets, sin inventar datos deportivos
4. Verificación local de consultas, filtros, estados, navegación y tamaños de
   pantalla, con capturas y preview funcional
5. Código y documentación de configuración listos para un despliegue posterior,
   pruebas pertinentes aprobadas, sin secretos ni dependencia de procesos ad hoc

No incluir otros deportes. No crear pagos, ejecutar apuestas, copiar credenciales
ni activar servicios de pago o un despliegue público como parte de este objetivo.
No hace falta volver a pedir autorización para ediciones y pruebas locales.
