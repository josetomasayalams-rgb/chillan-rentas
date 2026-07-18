# Especificación del producto operativo

## Resultado

La familia puede consultar arriendos, coordinar la limpieza de salida y dejar comentarios desde una PWA móvil, incluso cuando el backend compartido no está disponible.

## Actores

- Operador: consulta calendario y actualiza tareas de limpieza.
- Administrador: además crea, edita y cancela arriendos.

## Reglas observables

- Cada arriendo muestra llegada y salida en el calendario.
- Airbnb, Booking y Reservas familiares aparecen únicamente como “Reservado”,
  sin fuente, huésped, familia, UID ni notas, y son de solo lectura.
- Al crear o editar un arriendo, la limpieza corresponde al checkout.
- Cada reserva permite preparar un mensaje para Beatriz con llegada, salida y
  solicitud de disponibilidad para la limpieza; WhatsApp requiere confirmación humana.
- El modo local conserva la operación en el dispositivo y avisa que no está sincronizado.
- El modo remoto comparte cambios mediante Supabase realtime.
- La interfaz requiere confirmación antes de acciones sensibles.
- Una reserva sincronizada impide crear manualmente otro arriendo solapado.

## Fuera de alcance actual

El PIN del cliente no implementa identidad ni autorización del backend. Una autenticación fuerte requiere un diseño separado que preserve el acceso familiar y la recuperación ante fallos.

## Aceptación

Los flujos manuales y comandos de aceptación están en `docs/guides/VERIFY.md`; las reglas de datos canónicas están en `docs/golden-principles/OPERATIONS_DATA.md`.
