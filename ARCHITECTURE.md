# Arquitectura — Operaciones y arriendos

La plataforma es una PWA estática con una única unidad de aplicación (`app.js`). Puede persistir localmente o en Supabase sin alterar el comportamiento de la UI.

## Dominios

- **Reservas manuales:** períodos, huésped, referencia, estado y notas.
- **Limpiezas:** una tarea asociada al checkout de cada reserva manual o sincronizada.
- **Comentarios:** notas cronológicas asociadas a una limpieza.
- **Reservas sanitizadas:** rangos de solo lectura provenientes de Airbnb,
  Booking y reservas particulares, visibles únicamente como “Reserva”.
- **Avisos de coordinación:** Beatriz y Rodrigo mantienen por separado estado
  actual, lotes de WhatsApp e historial auditable asociados a identidades opacas.
- **Acceso operativo:** PIN de entrada `0000` y modo administrador permanente con
  PIN `2407`; no hay barrera Google ni de correo dentro de la aplicación.

El PIN y la preferencia de bloqueo pertenecen al cliente. Los arriendos, limpiezas y comentarios son datos de dominio y solo circulan por `state.store`.

En modo administrador, **Editar reservas** gestiona el ciclo completo de las
reservas creadas en Operaciones: editar, cancelar o eliminar de forma recuperable.
Las reservas sincronizadas no se mutan localmente porque la siguiente lectura
iCal sobrescribiría el cambio; **Cambiar en origen** abre Calendario familiar,
Airbnb o Booking y después el botón **Sincronizar** vuelve a consultar el estado.

El flujo administrador de Beatriz incluye un paso de preparación no persistido:
selecciona reservas activas, recibe la cantidad de personas por estadía y deriva
el café desde las fechas (`personas × noches × 2` sachets, más 2 Dolce Gusto por
reserva). El cálculo sólo modifica el texto que se entrega a WhatsApp; la memoria
de apertura y confirmación continúa pasando por `state.store`.

Un administrador también puede registrar que uno o varios avisos pendientes ya
se enviaron fuera de la plataforma. Esa operación confirma cada notificación y
agrega su evento auditable, pero no abre WhatsApp ni crea un lote ficticio. La
reconciliación excluye las notificaciones confirmadas sin cambios; una identidad
nueva comienza en `pending` y un cambio de fechas posterior vuelve a
`needs_update`. El texto de ese aviso declara que reemplaza la coordinación
anterior. Si una reserva confirmada desaparece antes de finalizar, `removed`
permanece accionable para enviar la cancelación; las reservas nunca avisadas se
retiran sin generar ruido. Las memorias de Beatriz y Rodrigo se evalúan por
separado. El registro previo remoto se resuelve con una RPC transaccional que
actualiza estado, evento y lote obsoleto como una sola unidad.

La presentación deriva una ventana móvil de 30 fechas desde `state.view.start`.
Mientras `followsToday` está activo, un reconciliador diario mueve el inicio a
la fecha local vigente; la navegación manual desactiva ese seguimiento hasta
usar `Desde hoy`. Al cruzar de mes, sólo el día 1 recibe borde y marcador dorados;
no se crean franjas ni tintes mensuales. Esta regla sólo cambia la proyección
visible, no la persistencia.

## Flujo

```text
Usuario → PIN 0000 → presentación estática → app.js → state.store
                                                ├─ localStorage (instalación sin Supabase)
                                                └─ Supabase (datos y realtime)
                        └─ PIN admin 2407 → acciones administrativas
`/availability` → state.calendarSource → reservas de Airbnb, Booking y particulares de solo lectura
                                                   ↓
                               reconciliación → state.store → memoria de avisos
```

El esquema SQL conserva los invariantes de estados, relaciones y fechas. Las fronteras ejecutables se documentan en `docs/architecture/LAYERS.md`.

`state.calendarSource` consume un contrato público que contiene fechas,
identidades HMAC opacas y frescura. Conserva la última copia válida ante fallos, nunca persiste esas
entradas en `rentals` y evita mostrar proveedor, grupo, huésped, UID o notas.
El cliente elimina duplicados exactos y consolida rangos parcialmente
superpuestos antes de reconciliar limpiezas y avisos. El badge advierte cuántos
cruces fueron consolidados para que se corrija la reserva equivocada en su origen.
La identidad opaca permite detectar altas, cambios y retiros sin conocer el
proveedor. La memoria registra por separado “WhatsApp abierto” y “Envío
confirmado”; los avisos pueden prepararse individualmente o agrupados y siempre
requieren confirmación humana. La clave del destinatario selecciona tablas y
estado independientes, por lo que confirmar a Beatriz no confirma a Rodrigo.
El mismo reconciliador evita repetir avisos confirmados: si las cuatro reservas
vigentes se registran como avisadas y luego aparece una quinta sin cambios en las
anteriores, solamente la quinta queda accionable.

## Superficies de entrega

- GitHub Pages publica la carpeta como sitio estático.
- `manifest.webmanifest` y `assets/` forman parte del artefacto desplegable.
- El cliente Supabase se carga de forma remota y condicional. Si Supabase está
  configurado pero no disponible, la aplicación bloquea la operación remota para
  no crear una copia local divergente.

Las reservas sincronizadas usan `reservation_id` opaco y un índice único para mantener exactamente una limpieza automática. Las reservas manuales conservan su relación por `rental_id`.

Con Supabase configurado, `initStore()` conecta directamente con el cliente
público: por decisión temporal no exige sesión Google ni consulta una allowlist
de correos. Las políticas permiten al cliente anónimo y autenticado operar, por
lo que los PINes solo controlan la interfaz y no autorizan el backend. La futura
integración de Cloudflare Access reemplazará únicamente el PIN de entrada cuando
se confirme la lista de correos; el PIN administrador `2407` se conserva.
