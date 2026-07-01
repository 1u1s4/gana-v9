---
source: notion
notion_id: 34cbea9e-4736-8190-97e5-eff4478a3aa5
notion_url: https://app.notion.com/p/HIBRI2-Proyecto-operativo-34cbea9e4736819097e5eff4478a3aa5
title: "HIBRI2 — Proyecto operativo"
---

# HIBRI2 — Proyecto operativo

# HIBRI2 — Salud, bienestar y rendimiento híbrido
Proyecto operativo para persistir goals, decisiones, avances y quehaceres de HIBRI2. Fuente de verdad complementaria a Paperclip.
## Goals
- Identidad: plataforma digital para Híbridos, integrando evaluación corporal, entrenamiento dirigido, comunidad/eventos, Strava, Recurrente y control de datos.
- SRS fino: revisar y cerrar ambigüedades, funcionalidades y plan de implementación.
## Tableros sugeridos
- [ ] CEO: sistema ejecutivo de seguimiento y decisiones
- [ ] CTO: SRS técnico, arquitectura y backlog
- [x] CMO: identidad, propuesta de valor, comunidad y contenido
## Convención de actualización
Cada agente debe comentar en Paperclip y registrar en esta página o subpáginas: qué hizo, evidencia/link, bloqueo, próximo paso y fecha.
## Identidad y propuesta de valor
Narrativa base para alinear producto, contenido y venta: Híbridos no es una app aislada; es un sistema que une cuerpo, entrenamiento y experiencia de comunidad para clientes que viven entre gimnasio, vida diaria y outdoor.
### Identidad, ICP y personas
- ICP principal: personas en transición de entrenamiento urbano a rendimiento híbrido (fuerza + cardio + outdoor), con foco en progresión medible y hábitos sostenibles.
- Segmento 2: profesionales de bienestar/entrenamiento que necesitan una capa de operación y seguimiento integral para acompañar a sus clientes.
- Segmento 3: comunidad activa que valora retos, movimiento y evidencia visible (historias de progreso, retos, aventuras y eventos).
### Concepto de marca "híbrido"
Un mismo sistema para tres pilares conectados:
- Ciencia del cuerpo: evaluaciones periódicas, composición corporal y seguimiento clínico funcional.
- Entrenamiento dirigido: planes de trabajo, progresiones, cargas y seguimiento de ejecución con retroalimentación semanal.
- Outdoor & comunidad: rutas, retos y expediciones como parte del plan, no como contenido extra.
### Propuesta de valor (vs MyFitnessPal / Strong / Strava / Eventbrite)
- Unifica expediente y progreso del cliente en un solo flujo: medición corporal, entrenamiento, cardio y actividad presencial.
- Permite que el profesional opere con menos herramientas desconectadas y más trazabilidad para decidir por cliente.
- Convierte logros de entrenamiento y comunidad en evidencia de continuidad con valor de negocio (retención y recurrencia).
### Comunidad Híbridos
- Regla de comunidad: cada evento o ruta alimenta un registro en Notion con asistencia, aprendizajes y próximos pasos.
- Ritual de activación: onboarding con narrativa de identidad + plan de 30 días + check-in semanal con evidencia pública interna.
- Comunidad activa: contenido útil (movilidad, nutrición, progresión, montaña) para sostener pertenencia y retorno de atención.
### Backlog inicial de contenido/marketing (5 piezas)
- Pieza 1: Mensaje de posicionamiento "Qué es Híbridos" (video corto + carrusel + copy largo).
- Pieza 2: Testimonio de progreso híbrido (antes/después corporal + rutina + salida outdoor).
- Pieza 3: Mini-guía práctica: plan 3 mundos para principiantes (fuerza, cardio, outdoor).
- Pieza 4: Calendario de comunidad mensual con evento físico y reto de seguimiento.
- Pieza 5: Caso de uso semanal: cómo Híbridos resuelve una necesidad concreta de seguimiento y continuidad.
### Métricas de adquisición y fidelización (MVP)
- Adquisición: leads, tasa de conversión por canal y costo por lead.
- Activación: evaluación inicial completada, primera rutina iniciada, primer check-in y primera actividad integrada.
- Retención: asistencia a comunidad/eventos, continuidad 30-60 días, recurrencia de sesiones y plan en 30 días.
- Monetización: tasa de conversión a membresía recurrente y upgrades a experiencias premium.
Actualización del issue: quedaron persistidos en Notion la identidad narrativa, propuesta de valor, comunidad Híbridos, ICP, backlog inicial y métricas del MVP.
## SRS fino (2026-04-24)
Objetivo: dejar el SRS en estado de ejecución técnica (dominios, reglas, estados, errores y trazabilidad) y convertir ambigüedades en decisiones accionables para Paperclip.
### 1) Expediente cliente
- Campos base obligatorios: nombre, objetivo, restricciones de salud, zona horaria y estado de onboarding.
- Regla: cambios sensibles requieren confirmación explícita y audit trail de consentimiento.
- Criterio: alta/edición reversible con validaciones frontend y backend.
### 2) Composición corporal
- Entidad histórica de mediciones: peso, cintura, grasa, masa magra y notas de coach.
- Regla: normalizar unidades y bloquear edición retroactiva sin justificación administrativa.
- Criterio: cálculos de tendencia con trazabilidad de origen por registro.
### 3) Rutinas
- Plan con sesiones, ejercicios, variantes y estado (programada/en curso/completada).
- Regla: rutinas versionadas, no eliminación física, historial completo de cambios.
- Criterio: no doble check en la misma franja para una rutina y usuario.
### 4) Eventos outdoor
- Calendario con capacidad, cupo, ubicaciones, coach responsable y checklist de checklist.
- Regla: estado del evento (abierto/completo/cancelado) y lista de espera por capacidad.
- Criterio: no inscripción sin aceptar condiciones de evento y política de seguridad.
### 5) Integración Strava
- Importar entrenamientos con OAuth y refresh token por cliente autorizado.
- Regla: deduplicación por activity id y reintentos con backoff.
- Criterio: fallo de sync no bloquea uso general de la app.
### 6) Recurrente
- Hábitos configurables por frecuencia diaria o semanal con seguimiento de cumplimiento.
- Regla: rachas y tolerancia definidas por coach con límites por segmento.
- Criterio: alerta automática tras 3 fallas consecutivas; recarga de estado semanal.
### 7) Insignias
- Insignias de consistencia, progreso corporal, retos y constancia social.
- Regla: condiciones deterministas, fecha de otorgamiento y revocación controlada.
- Criterio: vista por fecha/tipo y estado de visibilidad para cliente y admin.
### 8) RLS y accesos
- Roles: cliente, coach, admin, con separación por dominio y mínima superficie de privilegio.
- Regla: default deny, controles de lectura/escritura y logs de cambios sensibles.
- Criterio: pruebas negativas por rol para operaciones críticas.
### 9) Reportes
- Reportes operativos y ejecutivos con export CSV/PDF y filtros por fecha.
- Regla: separación entre métricas personales y agregados anónimos.
- Criterio: consulta pesada \<=15s para datasets de 30k filas en snapshot de una semana.
### 10) IA asistiva
- Sugerencias de sesiones y resumen semanal para clientes y coaches.
- Regla: la IA no sustituye criterio médico; incluye disclaimer y registro del motivo de rechazo.
- Criterio: trazabilidad completa entre inputs y output sugerido.
## Ambigüedades detectadas y decisiones
- [ ] Definir umbral de seguridad para frenar rutina por síntoma: se requiere flag manual de coach.
- [ ] Definir cumplimiento de rutina: regla dual de repeticiones y duración con tolerancia 10%.
- [ ] Alcance mínimo de reportes inicial: métricas de progreso, adherencia y riesgos de deserción.
## Arquitectura propuesta
Backend: API Next/Node + Supabase (Postgres, Auth, RLS). Frontend: Next.js con estado mínimo. Integraciones: Notion, Strava, jobs recurrentes y notificaciones.
Servicios: identity, profile, assessment, routines, events, integration-sync, rewards, analytics y ai-guidance con comandos idempotentes y trazabilidad.
### Backlog técnico recomendado
1. Implementar contratos de entrada/salida y validaciones por módulo del SRS fino.
2. Provisionar tablas e índices para perfiles, medidores, rutinas, eventos, recurrencias y logros.
3. Configurar sync de Strava, jobs de recorrencia y pipelines de reportes.
4. Agregar suite de pruebas de endpoints críticos y pruebas de acceso por rol (RLS).
## Sistema ejecutivo HIBRI2
### Visión ejecutiva
Convertir HIBRI2 en un sistema operativo único y ejecutivo: decisiones visibles, progreso trazable y prioridades accionables para alinear visión, producto y operaciones cada semana.
### Objetivos estratégicos (priorizados)
1. Priorizar estabilidad del sistema ejecutivo y visibilidad: visión, decisiones y riesgos actualizados semanalmente (Due: CEO).
2. Sincronizar SRS fino con decisiones técnicas (CTO), cerrando ambigüedades críticas que bloquean implementación funcional.
3. Definir plan de ejecución trimestral por objetivos: integración Strava/Recurrente/RLS + reportes + IA asistiva, con owner y criterios de aceptación.
### Decisiones
- Notion queda como capa ejecutiva complementaria; Paperclip conserva el control de trabajo y estados oficiales.
- Clasificación actual de dependencias: \[HIB-3\](/HIB/issues/HIB-3), \[HIB-4\](/HIB/issues/HIB-4), \[HIB-7\](/HIB/issues/HIB-7) y \[HIB-8\](/HIB/issues/HIB-8) no se marcan como bloqueos técnicos de HIB-22 por ahora; se evaluarán en su review cuando cambien de estado a done.
- La priorización para cierre de HIB-22 se basa en impacto ejecutiva \> riesgo operativo \> coste de implementación.
### Riesgos y mitigación
- Riesgo: dependencia funcional de tareas no concluidas. Mitigación: mantener ejecución por hitos, sin bloquear HIB-22 mientras no exista \`blockedBy\` explícito.
- Riesgo: desalineación de prioridades entre CEO/CTO/CMO. Mitigación: revisar semanales este bloque y validar owner por bloque.
- Riesgo: pérdida de trazabilidad de cambios. Mitigación: registrar toda decisión y estado en este sistema ejecutivo y enlazar a HIBRI2 en Paperclip.
### Roadmap ejecutivo
1. Semana 0-1: Completar secciones ejecutivas y publicar la priorización de goals + próximos 3 pasos.
2. Semana 1-2: Cerrar 3-5 ambigüedades de SRS y convertirlas en subtareas concretas vinculadas a issues.
3. Semana 2-3: Revisar avance de implementación por módulo (SRS, integraciones, reportes) y ajustar riesgos.
### Quehaceres por rol
- CEO: revisar actualizaciones semanales, validar decisiones de negocio y aprobar prioridades de siguiente semana.
- CTO: actualizar estado técnico de módulos críticos, definir deuda técnica y asegurar cierre de ambigüedades técnicas con criterios de aceptación.
- CMO: actualizar metas de adquisición/retención y activar narrativa de comunidad para priorización de marketing.
- [ ] Actualizar esta página ejecutiva al menos 2 veces por semana y dejar evidencia en comentarios del issue padre \[HIB-19\](/HIB/issues/HIB-19).
