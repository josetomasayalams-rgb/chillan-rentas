# Arquitectura — Operaciones y arriendos

La plataforma es una PWA estática con una única unidad de aplicación (`app.js`). Puede persistir localmente o en Supabase sin alterar el comportamiento de la UI.

## Dominios

- **Reservas manuales:** períodos, huésped, referencia, estado y notas.
- **Limpiezas:** una tarea asociada al checkout de cada reserva manual o sincronizada.
- **Comentarios:** notas cronológicas asociadas a una limpieza.
- **Reservas sanitizadas:** rangos de solo lectura provenientes de Airbnb,
  Booking y reservas particulares, visibles únicamente como “Reserva”.
- **Avisos a Beatriz:** estado actual, lotes de WhatsApp e historial auditable
  asociados a identidades opacas de reserva.
- **Acceso operativo:** bloqueo de la aplicación y modo de administración para acciones de escritura.

El PIN y la preferencia de bloqueo pertenecen al cliente. Los arriendos, limpiezas y comentarios son datos de dominio y solo circulan por `state.store`.

La presentación deriva una ventana móvil de 31 fechas desde `state.view.start`.
Mientras `followsToday` está activo, un reconciliador diario mueve el inicio a
la fecha local vigente; la navegación manual desactiva ese seguimiento hasta
usar `Desde hoy`. Esta regla sólo cambia la proyección visible, no la persistencia.

## Flujo

```text
Usuario → presentación estática → app.js → state.store
                                          ├─ localStorage
                                          └─ Supabase (datos y realtime)
`/availability` → state.calendarSource → reservas de Airbnb, Booking y particulares de solo lectura
                                                   ↓
                               reconciliación → state.store → memoria de avisos
```

El esquema SQL conserva los invariantes de estados, relaciones y fechas. Las fronteras ejecutables se documentan en `docs/architecture/LAYERS.md`.

`state.calendarSource` consume un contrato público que contiene fechas,
identidades HMAC opacas y frescura. Conserva la última copia válida ante fallos, nunca persiste esas
entradas en `rentals` y evita mostrar proveedor, grupo, huésped, UID o notas.
La identidad opaca permite detectar altas, cambios y retiros sin conocer el
proveedor. La memoria registra por separado “WhatsApp abierto” y “Envío
confirmado”; los avisos pueden prepararse individualmente o agrupados y siempre
requieren confirmación humana.

## Superficies de entrega

- GitHub Pages publica la carpeta como sitio estático.
- `manifest.webmanifest` y `assets/` forman parte del artefacto desplegable.
- El cliente Supabase se carga de forma remota y condicional; si falla, la aplicación degrada a modo local.

Las reservas sincronizadas usan `reservation_id` opaco y un índice único para mantener exactamente una limpieza automática. Las reservas manuales conservan su relación por `rental_id`.
