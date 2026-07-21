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

Fuente pública: /availability → state.calendarSource → reservas de solo lectura con tonos alternados → limpieza automática
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

La ventana móvil de 30 días pertenece a Presentación/Aplicación. Se deriva de
`state.view.start`, se reconcilia con la fecha local mientras `followsToday`
está activo y no consulta directamente ningún adaptador. Navegar un periodo sólo
cambia estado de vista; reservas, limpiezas y avisos siguen entrando por sus
puertos existentes. El borde y marcador dorados del día 1 son presentación pura;
la vista no crea franjas ni estados persistidos para separar meses.

El resumen de café para Beatriz también pertenece a Presentación/Aplicación. Usa
las fechas sanitizadas ya cargadas y una cantidad de personas ingresada en el
modal; calcula los insumos antes de abrir WhatsApp y no accede directamente a
`localStorage`, Supabase ni a un adaptador. La apertura y confirmación posterior
mantienen el contrato existente de `state.store`.

`makeCalendarSource()` es el único punto que consulta calendarios. Recibe
rangos de fechas sanitizados con identidad HMAC opaca y nunca inserta esas
entradas en `rentals`. La reconciliación escribe únicamente el estado operativo
de los avisos independientes a Beatriz y Rodrigo mediante `state.store`.

El test de arquitectura permite a `app.js` importar exclusivamente `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm`. No hay violaciones base y `tests/architecture/known-violations.json` no debe crecer. `scripts/lint.mjs` también rechaza operaciones `sb.from()` fuera de `makeSupabaseStore()`.

## Remediación

Si una vista requiere datos, agrega una operación al contrato de `state.store` y a ambos adaptadores. Si falla una comprobación de imports, no conectes capas directamente: mueve la lógica al puerto o adaptador correspondiente.

Ejecuta `make ci` para validar la frontera en cada cambio. El mensaje `VIOLATION` incluye archivo, línea, dependencia y este documento como ruta de remediación.
