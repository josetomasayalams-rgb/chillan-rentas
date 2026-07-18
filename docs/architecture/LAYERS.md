# Capas y límites

## Jerarquía

```text
Presentación: index.html, styles.css
        ↓
Aplicación: app.js (eventos, renderizado y reglas de UI)
        ↓
Puerto: state.store
        ↓
Adaptadores: localStorage | cliente Supabase
        ↓
Persistencia: schema.sql

Fuente pública: /availability → state.calendarSource → reservas celestes de solo lectura → limpieza automática
                                                       ↓
                                   reconciliación → state.store → avisos
```

## Reglas

| Capa | Puede depender de | No puede depender de |
| --- | --- | --- |
| Presentación | `app.js` por etiquetas | almacenamiento o Supabase directo |
| Aplicación | APIs web; `state.store`; `state.calendarSource`; cliente Supabase v2 solo durante `initStore()` | módulos locales nuevos o proveedores remotos no aprobados |
| Puerto `state.store` | adaptador seleccionado | DOM y detalles de vista |
| Adaptadores | `localStorage` o cliente Supabase dentro de `localStore()` y `makeSupabaseStore()` | renderizado o eventos de UI |
| Puerto `state.calendarSource` | `fetch`, contrato `/availability` y caché local | DOM, tablas Supabase e identidad del proveedor |
| SQL | reglas de integridad propias | lógica de presentación |

Las preferencias locales del dispositivo —por ejemplo, si el bloqueo está activo— pueden usar `localStorage` mediante helpers dedicados. Esa excepción no autoriza a la UI a leer o escribir arriendos, limpiezas o comentarios fuera de `state.store`.

`makeCalendarSource()` es el único punto que consulta calendarios. Recibe
rangos de fechas sanitizados con identidad HMAC opaca y nunca inserta esas
entradas en `rentals`. La reconciliación escribe únicamente el estado operativo
del aviso a Beatriz mediante `state.store`.

El test de arquitectura permite a `app.js` importar exclusivamente `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`. No hay violaciones base y `tests/architecture/known-violations.json` no debe crecer. `scripts/lint.mjs` también rechaza operaciones `sb.from()` fuera de `makeSupabaseStore()`.

## Remediación

Si una vista requiere datos, agrega una operación al contrato de `state.store` y a ambos adaptadores. Si falla una comprobación de imports, no conectes capas directamente: mueve la lógica al puerto o adaptador correspondiente.

Ejecuta `make ci` para validar la frontera en cada cambio. El mensaje `VIOLATION` incluye archivo, línea, dependencia y este documento como ruta de remediación.
