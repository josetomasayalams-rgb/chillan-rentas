# Confiabilidad operacional

## Comportamiento ante fallas

- Con Supabase configurado, un fallo de conexión o persistencia bloquea la
  operación remota; no se crea una copia local divergente. En la etapa vigente no
  existe una sesión Google o de correo que condicione el inicio.
- El contrato público de disponibilidad conserva su última lectura válida y nunca revela proveedor, huésped, familia, UID o notas.
- Los borrados de arriendos y limpiezas son lógicos. El historial append-only conserva actor, fecha y versiones anterior/nueva.
- Una limpieza activa pertenece exactamente a un arriendo o a una reserva sincronizada, y solo puede existir una por objetivo.
- La salida siempre es posterior a la llegada y conserva la convención `[llegada, salida)`.
- Una notificación confirmada no vuelve a la bandeja accionable mientras la
  reserva no cambie. Una reserva nueva comienza en `pending`; si cambian las
  fechas de una confirmada, vuelve a `needs_update`.
- Registrar un aviso enviado previamente es idempotente: confirma la notificación
  y agrega un evento sin abrir WhatsApp ni crear un lote. En Supabase, la RPC
  actualiza notificaciones, eventos y lotes obsoletos dentro de una transacción;
  un fallo no puede dejar solo una parte confirmada. La memoria de un destinatario
  nunca modifica la del otro.
- Un cambio de fechas genera una coordinación de reemplazo. Una reserva ya
  coordinada que desaparece antes de terminar genera un aviso de cancelación;
  una reserva retirada antes de haber sido avisada no genera un mensaje inútil.

## Recuperación

Antes de cambiar políticas o restricciones se exportan esquema y datos. La
restauración se ensaya primero en una base aislada. Para la futura migración de
acceso se confirma la lista de correos, se prueba Cloudflare Access con todo el
equipo y recién entonces se retira el PIN de entrada `0000`; el PIN administrador
`2407` no cambia. Cualquier cierre posterior de permisos anónimos requiere una
validación independiente del cliente y un plan de rollback.
