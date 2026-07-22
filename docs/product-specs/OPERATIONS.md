# Especificación del producto operativo

## Resultado

La familia puede consultar arriendos, coordinar la limpieza de salida y dejar comentarios desde una PWA móvil, incluso cuando el backend compartido no está disponible.

## Actores

- Operador: entra con `0000`, consulta calendario y actualiza tareas de limpieza.
- Administrador: activa el modo con `2407`; además crea, edita y cancela
  arriendos, prepara mensajes y gestiona la memoria de avisos.

## Reglas observables

- El calendario muestra 30 días consecutivos desde hoy, aunque cruce al mes
  siguiente, y marca únicamente el día 1 en dorado, sin franjas ni tintes por mes.
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
- Antes de abrir WhatsApp para Beatriz, el administrador puede calcular el café
  con 2 sachets por persona y por noche más 2 Dolce Gusto, o elegir manualmente
  ambas cantidades. Los campos aceptan 0 y pueden quedar vacíos mientras se editan.
- La bandeja selecciona una o varias reservas pendientes y permite preparar un
  mensaje agrupado o mensajes separados.
- El operador sin modo administrador sólo ve los avisos pendientes. Preparar,
  abrir, confirmar, corregir o reenviar mensajes requiere modo administrador.
- La plataforma distingue “Pendiente”, “WhatsApp abierto”, “Envío confirmado”
  y “Requiere nuevo aviso por cambio”; abrir WhatsApp nunca confirma el envío.
- Cada destinatario conserva en Supabase su propia confirmación e historial,
  que pueden corregirse o reenviarse explícitamente sin afectar al otro.
- El administrador puede registrar uno o varios avisos enviados previamente sin
  abrir WhatsApp. La operación requiere confirmación explícita, no crea un lote
  ficticio y deja un evento auditable independiente para cada destinatario.
- Una reserva confirmada no se vuelve a ofrecer si no cambia. Una reserva nueva
  aparece como “Pendiente” y un cambio de fechas sobre una confirmada aparece
  como “Requiere nuevo aviso por cambio”; su mensaje dice que la nueva
  coordinación reemplaza la anterior. Si una reserva ya coordinada se cancela,
  aparece una “Cancelación pendiente de aviso” para dejar sin efecto la limpieza
  o el acceso. Si cuatro reservas están confirmadas y llega una quinta, solamente
  la quinta queda seleccionable como aviso nuevo.
- Registrar avisos previos es atómico e idempotente: estado, evento y cierre de
  un lote abierto obsoleto se guardan juntos o no se guarda ninguno.
- Los calendarios se actualizan al entrar, al volver a la aplicación, cada cinco
  minutos mientras está visible y mediante el botón “Actualizar”.
- El modo local conserva la operación en el dispositivo y avisa que no está sincronizado.
- El modo remoto comparte cambios mediante Supabase realtime.
- La interfaz requiere confirmación antes de acciones sensibles.
- Una reserva sincronizada impide crear manualmente otro arriendo solapado.

## Fuera de alcance actual

El PIN del cliente no implementa identidad ni autorización del backend. Por ahora
no hay una barrera Google ni de correo: el acceso operativo permanece en `0000`
y el administrador en `2407`. Cuando se confirme la lista de correos del equipo,
Cloudflare Access reemplazará solamente el PIN de entrada; no reemplazará el PIN
administrador.

## Aceptación

Los flujos manuales y comandos de aceptación están en `docs/guides/VERIFY.md`; las reglas de datos canónicas están en `docs/golden-principles/OPERATIONS_DATA.md`.
