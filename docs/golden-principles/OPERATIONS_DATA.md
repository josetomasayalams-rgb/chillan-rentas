# Arriendos y limpiezas

## Regla

Toda reserva tiene como máximo una tarea de limpieza y su fecha programada corresponde al checkout. Las manuales se relacionan por `rental_id`; las sincronizadas, por `reservation_id` opaco.

## Sí

```js
const cleaning = { rental_id: rental.id, scheduled_date: rental.checkout_date, status: "pending" };
await state.store.upsertCleaning(cleaning);
```

## No

```js
// Tareas sueltas no permiten recuperar la reserva ni preservar el invariante.
await state.store.upsertCleaning({ scheduled_date: "2026-07-14" });
```

## Excepción

Una tarea puede cancelarse al cancelar o retirar una reserva, pero no debe quedar activa sin una reserva identificable.

## Responsabilidad actual

El cliente conserva la unicidad manual al buscar la limpieza existente antes de crear o reemplazarla. Para reservas sincronizadas, el esquema impone un índice único parcial sobre `reservation_id` y el cliente usa un UUID determinista derivado de la identidad opaca.

No presentes esa garantía como completamente protegida por la base de datos. El cierre de esta brecha requiere una migración que primero detecte y resuelva duplicados; está registrado en el tracker de deuda técnica.

## Verificación

Al cambiar la creación o edición de arriendos, prueba:

1. crear un arriendo y observar una limpieza en el checkout;
2. cambiar el checkout y comprobar que la tarea se mueve sin duplicarse;
3. cancelar el arriendo y comprobar que no queda una tarea activa;
4. repetir el flujo en modo local y remoto cuando esté autorizado.
