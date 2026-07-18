# Arquitectura — Operaciones y arriendos

La plataforma es una PWA estática con una única unidad de aplicación (`app.js`). Puede persistir localmente o en Supabase sin alterar el comportamiento de la UI.

## Dominios

- **Arriendos:** períodos, huésped, referencia, estado y notas.
- **Limpiezas:** una tarea asociada al checkout de cada arriendo.
- **Comentarios:** notas cronológicas asociadas a una limpieza.
- **Reservas sanitizadas:** rangos de solo lectura provenientes de Airbnb,
  Booking y Reservas familiares, visibles únicamente como “Reservado”.
- **Acceso operativo:** bloqueo de la aplicación y modo de administración para acciones de escritura.

El PIN y la preferencia de bloqueo pertenecen al cliente. Los arriendos, limpiezas y comentarios son datos de dominio y solo circulan por `state.store`.

## Flujo

```text
Usuario → presentación estática → app.js → state.store
                                          ├─ localStorage
                                          └─ Supabase (datos y realtime)
Reservas familiares `/availability` → state.calendarSource → reservas de solo lectura
```

El esquema SQL conserva los invariantes de estados, relaciones y fechas. Las fronteras ejecutables se documentan en `docs/architecture/LAYERS.md`.

`state.calendarSource` consume un contrato público que contiene solo fechas y
frescura. Conserva la última copia válida ante fallos, nunca persiste esas
entradas en `rentals` y evita mostrar proveedor, familia, huésped, UID o notas.
Cada rango puede preparar un mensaje de WhatsApp para coordinar con Beatriz la
limpieza de salida; el envío sigue requiriendo confirmación humana en WhatsApp.

## Superficies de entrega

- GitHub Pages publica la carpeta como sitio estático.
- `manifest.webmanifest` y `assets/` forman parte del artefacto desplegable.
- El cliente Supabase se carga de forma remota y condicional; si falla, la aplicación degrada a modo local.

La unicidad lógica entre arriendo y limpieza se mantiene hoy en el cliente. El esquema conserva la relación, pero todavía no impone una restricción `UNIQUE` sobre `rental_id`; esa deuda está registrada en `docs/exec-plans/tech-debt-tracker.md`.
