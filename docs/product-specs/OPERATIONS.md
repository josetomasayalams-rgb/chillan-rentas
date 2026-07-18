# Especificación del producto operativo

## Resultado

La familia puede consultar arriendos, coordinar la limpieza de salida y dejar comentarios desde una PWA móvil, incluso cuando el backend compartido no está disponible.

## Actores

- Operador: consulta calendario y actualiza tareas de limpieza.
- Administrador: además crea, edita y cancela arriendos.

## Reglas observables

- El calendario muestra 30 días consecutivos desde hoy, aunque cruce al mes
  siguiente, separa los meses con una franja proporcional y resalta el día 1.
- Las flechas recorren periodos completos de 30 días; “Desde hoy” vuelve al
  rango vigente y reactiva su seguimiento diario.
- Toda estadía aparece como un único tipo “Reserva”; las consecutivas alternan
  dos tonos estables sin que el color revele su plataforma de origen.
- Cada barra muestra explícitamente check-in 15:00 y check-out 12:00.
- Airbnb, Booking y reservas particulares aparecen sin fuente, huésped, grupo,
  UID ni notas, y son de solo lectura.
- Cada reserva manual o sincronizada genera automáticamente su limpieza de checkout.
- La salida permanece visible con su botón hasta confirmar que el aseo está listo.
- Cada reserva permite preparar mensajes para Beatriz (limpieza) y Rodrigo
  (conserjería) con llegada y salida; WhatsApp requiere confirmación humana.
- La bandeja selecciona una o varias reservas pendientes y permite preparar un
  mensaje agrupado o mensajes separados.
- El operador sin modo administrador sólo ve los avisos pendientes. Preparar,
  abrir, confirmar, corregir o reenviar mensajes requiere modo administrador.
- La plataforma distingue “Pendiente”, “WhatsApp abierto”, “Envío confirmado”
  y “Requiere nuevo aviso por cambio”; abrir WhatsApp nunca confirma el envío.
- Cada destinatario conserva en Supabase su propia confirmación e historial,
  que pueden corregirse o reenviarse explícitamente sin afectar al otro.
- Los calendarios se actualizan al entrar, al volver a la aplicación, cada cinco
  minutos mientras está visible y mediante el botón “Actualizar”.
- El modo local conserva la operación en el dispositivo y avisa que no está sincronizado.
- El modo remoto comparte cambios mediante Supabase realtime.
- La interfaz requiere confirmación antes de acciones sensibles.
- Una reserva sincronizada impide crear manualmente otro arriendo solapado.

## Fuera de alcance actual

El PIN del cliente no implementa identidad ni autorización del backend. Una autenticación fuerte requiere un diseño separado que preserve el acceso familiar y la recuperación ante fallos.

## Aceptación

Los flujos manuales y comandos de aceptación están en `docs/guides/VERIFY.md`; las reglas de datos canónicas están en `docs/golden-principles/OPERATIONS_DATA.md`.
