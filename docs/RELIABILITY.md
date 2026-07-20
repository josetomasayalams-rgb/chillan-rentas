# Confiabilidad operacional

## Comportamiento ante fallas

- Con Supabase configurado, una sesión ausente, vencida o no autorizada bloquea la escritura; no se crea una copia local divergente.
- El contrato público de disponibilidad conserva su última lectura válida y nunca revela proveedor, huésped, familia, UID o notas.
- Los borrados de arriendos y limpiezas son lógicos. El historial append-only conserva actor, fecha y versiones anterior/nueva.
- Una limpieza activa pertenece exactamente a un arriendo o a una reserva sincronizada, y solo puede existir una por objetivo.
- La salida siempre es posterior a la llegada y conserva la convención `[llegada, salida)`.

## Recuperación

Antes de cambiar políticas o restricciones se exportan esquema y datos. La restauración se ensaya primero en una base aislada. El cliente autenticado se despliega y verifica antes de retirar los permisos anónimos.
