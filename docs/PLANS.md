# Planes de ejecución

Los cambios grandes se proponen en `docs/exec-plans/active/`, se verifican contra `docs/architecture/LAYERS.md` y se archivan en `completed/`. Una decisión que cambie contratos de datos debe actualizar el esquema y `ARCHITECTURE.md` primero.

## Cuándo crear un plan

Usa un ExecPlan para cambios de varias capas, migraciones de datos, autenticación o refactors que deban poder retomarse en otra sesión. Un ajuste pequeño o una corrección localizada no lo necesita.

## Contenido mínimo

Cada plan debe ser autocontenido e incluir:

- propósito y resultado observable;
- progreso fechado;
- descubrimientos y evidencia;
- decisiones con su justificación;
- contexto y archivos afectados;
- pasos concretos y comandos desde esta carpeta;
- validación y criterios de aceptación;
- idempotencia, recuperación y rollback;
- interfaces o dependencias relevantes;
- retrospectiva al terminar.

No dependas de mensajes de chat para reconstruir decisiones. El plan es el estado reiniciable del trabajo.

## Ciclo de vida

1. Crea el archivo en `active/` con un nombre descriptivo.
2. Actualiza progreso, sorpresas y decisiones durante la implementación.
3. Ejecuta `make ci`, `make gc` y las verificaciones manuales aplicables.
4. Completa resultados y brechas.
5. Mueve el archivo a `completed/` conservando el historial.
