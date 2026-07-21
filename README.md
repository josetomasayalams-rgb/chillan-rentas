# chillan-rentas

Plataforma de operaciones para el departamento de Chillán. Vista mobile-first con un único tipo de reserva en tonos alternados, tareas de aseo generadas automáticamente al check-out y reservas sanitizadas de Airbnb, Booking y particulares.

Stack: **vanilla JS, no build, no framework.** Tres archivos (`index.html` + `app.js` + `styles.css`) + assets + schema SQL. Se sirve con cualquier static server.

## Demo local

```bash
cd chillan-rentas
python3 -m http.server 8000   # luego abrir http://localhost:8000
```

Acceso operativo vigente: PIN de entrada `0000`.
Modo administrador permanente: PIN `2407`.

Por ahora no existe una barrera Google ni una allowlist de correos dentro de la
aplicación. Cuando estén disponibles los correos del equipo, Cloudflare Access
reemplazará solamente el PIN de entrada; el PIN administrador seguirá siendo
`2407`.

> `file://` no funciona — el dynamic ES-module import de Supabase y los paths relativos requieren http.

## Setup (cold start)

1. **Crear proyecto Supabase** → [supabase.com](https://supabase.com).
2. **SQL Editor** → New query → pegar el contenido de `schema.sql` → Run.
   Crea las tablas de arriendos, limpiezas y las memorias independientes de avisos a Beatriz y Rodrigo + RLS + realtime.
3. **Project Settings → API** → copiar **Project URL** y **anon public key**.
4. Pegar en `app.js` arriba (líneas ~13-14, `supabaseUrl` y `supabaseAnonKey`).
5. **Verificar los PINes vigentes** en `app.js`:
   - `CONFIG.opsPin = "0000"` — acceso actual a la vista móvil
   - `CONFIG.adminPin = "2407"` — modo administrador permanente
6. **Deploy**: cualquier static host. Cloudflare Access por correo es la etapa
   futura para sustituir únicamente el PIN de entrada; no se activa todavía.

## Cómo se usa

- **Vista móvil** (`/`, en celular): PIN → calendario. La vista parte hoy y muestra 30 días consecutivos, aunque cruce al mes siguiente; avanza automáticamente cada día. El inicio del mes siguiente se indica solamente con el día 1 marcado en dorado, sin franjas ni tintes adicionales. Las flechas recorren periodos de 30 días y **Desde hoy** reactiva el seguimiento diario. Toda estadía se muestra como una única **Reserva**, sin revelar su origen. Las reservas consecutivas alternan azul y violeta y conservan el mismo tono durante toda la estadía. Los extremos dicen explícitamente **Check-in 15:00** y **Check-out 12:00**. En cada check-out aparece automáticamente el botón para confirmar que el aseo está listo.
- **Modo admin**: botoncito `🔒 Admin` en el footer → clave admin → habilita creación de arriendos por **brush selection** (tocá un día para check-in 15:00, otro para check-out 12:00). Pill flotante con "Confirmar" o "+ Detalles" para abrir el form con fechas pre-llenas.
- **Calendarios vinculados**: el contrato público aporta Airbnb, Booking y
  reservas particulares. Aquí todos aparecen únicamente como **Reserva**,
  son de solo lectura y nunca muestran proveedor ni datos del huésped.
- **WhatsApp para Beatriz**: el operador ve solamente los avisos pendientes; el
  administrador puede seleccionar una o varias reservas y preparar mensajes
  separados o agrupados. Abrir WhatsApp se registra
  aparte; al volver, la persona confirma si realmente lo envió. El historial se
  comparte por Supabase y permite corregir o reenviar. Si un aviso ya se envió
  fuera de la plataforma, el administrador puede usar **Registrar aviso previo**:
  la reserva queda confirmada sin abrir WhatsApp ni crear un lote ficticio.
- **WhatsApp para Rodrigo**: usa el mismo flujo, selección individual o agrupada
  y confirmación humana, pero con texto de conserjería y una memoria totalmente
  independiente de la de Beatriz.
- **Memoria de avisos**: una reserva confirmada no vuelve a ofrecerse mientras
  conserve las mismas fechas. Si cambia, reaparece como **Requiere nuevo aviso**;
  el mensaje indica que la nueva coordinación reemplaza la anterior. Si una
  reserva ya coordinada se cancela, aparece una **Cancelación pendiente de
  aviso** con texto para dejar sin efecto la limpieza o el acceso. Una reserva
  nueva aparece como **Pendiente**. Por ejemplo, tras registrar las cuatro
  reservas vigentes como avisadas, una quinta reserva nueva debe ser la única
  ofrecida.

## Archivos

- `index.html` + `styles.css` + `app.js` — la app (vanilla JS, sin build).
- `manifest.webmanifest` — PWA (instalable, standalone).
- `assets/chillan-bg.jpg` — fondo desktop (1.3 MB, 2560×1706).
- `assets/chillan-bg-mobile.jpg` — fondo mobile (330 KB, 1600×1066, `<900px`).
- `assets/icon-192.png` / `assets/icon-512.png` — iconos PWA / apple-touch-icon.
- `schema.sql` — tabla + permisos + realtime para Supabase.
- `AGENTS.md` — guía para futuras sesiones de OpenCode/Claude.

## Modelo de dominio

- **Una** `rental` por período de arriendo. Estados: `scheduled | in_progress | completed | cancelled`.
- **Una** `cleaning` por reserva manual (`rental_id`) o sincronizada (`reservation_id`), generada automáticamente al `checkout_date` a las 12:00. Estados: `pending | confirmed | done | cancelled`.
- `cleaning_comments` opcional — para que el operador deje notas (ej: "dejé las llaves en la cocina").
- `beatriz_notifications`, `beatriz_notification_batches` y
  `beatriz_notification_events` guardan estado e historial usando solo la
  identidad opaca y las fechas sanitizadas de cada reserva.
- `rodrigo_notifications`, `rodrigo_notification_batches` y
  `rodrigo_notification_events` conservan el mismo ciclo para conserjería sin
  mezclar confirmaciones con Beatriz.
- El registro manual de un aviso previo deja la notificación en `confirmed` y
  agrega un evento auditable sin crear un `notification_batch`; la RPC lo hace
  en una sola transacción y cierra cualquier lote abierto que haya quedado
  obsoleto. Un cambio posterior vuelve a `needs_update` y una cancelación ya
  coordinada queda accionable hasta confirmar su aviso.
- Las políticas permiten temporalmente al cliente público leer y escribir. Los
  PINes son controles de interfaz, no autorización del backend. Cloudflare
  Access por correo será la barrera externa cuando se reúna la lista del equipo.

## Cache busting

Si cambiás `app.js` o `styles.css`, bumpear **ambos**:
- `const VERSION` al tope de `app.js` (badge en el footer).
- `?v=N` en `index.html` sobre el `<link>` y `<script>` correspondiente.

Si sólo bumpeás uno, el badge y el archivo servido no coinciden y los usuarios ven código viejo.

## Deploy paso a paso

### Cloudflare Pages y activación futura de Cloudflare Access

1. Subí esta repo a GitHub (privado).
2. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Framework preset = **None**, Build command vacío, Build output directory = **`/`**.
4. Save and Deploy. URL: `https://<proyecto>.pages.dev`.
5. **Todavía no activar Cloudflare Access**. Cuando estén confirmados los correos
   de José, Sofi, Beatriz, Rodrigo y Francisco, crear la aplicación de Access con
   una política **Allow** para esa lista y retirar únicamente el PIN de entrada.
   El PIN administrador `2407` permanece. En la misma etapa se debe retirar el
   acceso anónimo directo a Supabase o pasar las escrituras por un backend
   autenticado; Access sobre la página no protege por sí solo la API pública.

### Netlify Drop (sin auth, 30 segundos)

1. [app.netlify.com/drop](https://app.netlify.com/drop)
2. Arrastrá la carpeta. URL al instante.
3. ⚠ Sin portón: la URL queda abierta. Solo para testing.
