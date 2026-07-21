# Persistencia intercambiable

## Regla

Todo acceso a datos pasa por `state.store`, que debe mantener paridad entre localStorage y Supabase.

## Sí

```js
await state.store.upsertRental(rental);
state.store.onChange(load);
```

## No

```js
// Rompe el modo local y duplica la política de errores.
await supabase.from("rentals").upsert(rental);
```

## Excepción

Solo `initStore()` y los adaptadores de almacenamiento pueden usar el cliente remoto para datos de dominio.

Las preferencias del dispositivo, como activar o desactivar el bloqueo, pueden usar `localStorage` mediante helpers pequeños y dedicados. Arriendos, limpiezas y comentarios nunca usan esa excepción.

Las reservas sanitizadas son un read model externo, no datos de dominio de
Operaciones. Pasan por `state.calendarSource`, se conservan como última copia
válida y nunca se insertan en `rentals` ni generan escrituras sobre el
contrato sanitizado de Airbnb, Booking y reservas particulares.

La identidad HMAC de cada rango sí se usa como clave de
`beatriz_notifications` y `rodrigo_notifications`. Cada destinatario tiene sus
propios lotes e historial dentro de Operaciones: Beatriz registra coordinación
de limpieza y Rodrigo coordinación de conserjería. Ninguna memoria modifica ni
reexporta la reserva de origen. “WhatsApp abierto” y “Envío confirmado” son
estados distintos y confirmar un destinatario nunca confirma al otro.

Cuando un mensaje ya fue enviado fuera de la plataforma, un administrador puede
registrarlo como aviso previo. La operación cambia únicamente notificaciones
activas `pending` o `needs_update` —y cancelaciones `removed` de coordinaciones
ya confirmadas— a `confirmed`, conserva `last_batch_id` nulo y agrega un evento
`confirmed` con `batch_id` nulo. No se abre WhatsApp ni se inventa un lote para
representar un envío que la aplicación no originó. En Supabase,
`register_prior_notifications` ejecuta estado, evento y cierre de cualquier lote
abierto obsoleto en una sola transacción idempotente.

La reconciliación debe ser idempotente y conservar la memoria: una notificación
confirmada con la misma identidad y fechas no vuelve a ofrecerse; una reserva
nueva crea un `pending`; un cambio de fechas sobre una confirmada produce
`needs_update`; una reserva retirada deja de estar activa, pero sigue accionable
como cancelación cuando ya existía una coordinación confirmada. Por ello, si
cuatro reservas ya están confirmadas y aparece una quinta, solo la quinta queda
accionable. Estas reglas se aplican de forma independiente a Beatriz y Rodrigo.

Una instalación deliberadamente local puede encolar avisos con IDs idempotentes.
Cuando Supabase está configurado, un fallo del backend o de persistencia falla
cerrado y no conmuta a almacenamiento local: así se evita crear una segunda
fuente de verdad mientras la base remota no está disponible. En la etapa vigente
no se exige una sesión Google o de correo; el acceso de interfaz usa `0000` y el
modo administrador conserva `2407`.

## Paridad del contrato

Si agregas una operación al puerto:

1. impleméntala en `localStore()`;
2. impleméntala en `makeSupabaseStore()`;
3. conserva la misma forma de entrada, salida y error;
4. valida el fallback cuando el backend no está disponible.

Ejecuta `make ci` para comprobar que el proveedor remoto sigue encapsulado. Después verifica manualmente el mismo flujo en modo local y remoto.
