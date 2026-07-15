# Arquitectura — Operaciones y arriendos

La plataforma es una PWA estática con una única unidad de aplicación (`app.js`). Puede persistir localmente o en Supabase sin alterar el comportamiento de la UI.

## Dominios

- **Arriendos:** períodos, huésped, referencia, estado y notas.
- **Limpiezas:** una tarea asociada al checkout de cada arriendo.
- **Comentarios:** notas cronológicas asociadas a una limpieza.
- **Acceso operativo:** bloqueo de la aplicación y modo de administración para acciones de escritura.

El PIN y la preferencia de bloqueo pertenecen al cliente. Los arriendos, limpiezas y comentarios son datos de dominio y solo circulan por `state.store`.

## Flujo

```text
Usuario → presentación estática → app.js → state.store
                                          ├─ localStorage
                                          └─ Supabase (datos y realtime)
```

El esquema SQL conserva los invariantes de estados, relaciones y fechas. Las fronteras ejecutables se documentan en `docs/architecture/LAYERS.md`.

## Superficies de entrega

- GitHub Pages publica la carpeta como sitio estático.
- `manifest.webmanifest` y `assets/` forman parte del artefacto desplegable.
- El cliente Supabase se carga de forma remota y condicional; si falla, la aplicación degrada a modo local.

La unicidad lógica entre arriendo y limpieza se mantiene hoy en el cliente. El esquema conserva la relación, pero todavía no impone una restricción `UNIQUE` sobre `rental_id`; esa deuda está registrada en `docs/exec-plans/tech-debt-tracker.md`.
