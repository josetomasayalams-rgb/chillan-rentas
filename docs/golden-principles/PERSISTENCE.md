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
calendario familiar.

## Paridad del contrato

Si agregas una operación al puerto:

1. impleméntala en `localStore()`;
2. impleméntala en `makeSupabaseStore()`;
3. conserva la misma forma de entrada, salida y error;
4. valida el fallback cuando el backend no está disponible.

Ejecuta `make ci` para comprobar que el proveedor remoto sigue encapsulado. Después verifica manualmente el mismo flujo en modo local y remoto.
