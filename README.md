# chillan-rentas

Plataforma de operaciones para el departamento de Chillán. Vista mobile-first con un único tipo de reserva en tonos alternados, tareas de aseo generadas automáticamente al check-out y reservas sanitizadas de Airbnb, Booking y particulares.

Stack: **vanilla JS, no build, no framework.** Tres archivos (`index.html` + `app.js` + `styles.css`) + assets + schema SQL. Se sirve con cualquier static server.

## Demo local

```bash
cd chillan-rentas
python3 -m http.server 8000   # luego abrir http://localhost:8000
```

PIN de entrada: `0000` (cambiar en `app.js` → `CONFIG.opsPin`).
PIN admin: `2407` (cambiar en `app.js` → `CONFIG.adminPin`).

> `file://` no funciona — el dynamic ES-module import de Supabase y los paths relativos requieren http.

## Setup (cold start)

1. **Crear proyecto Supabase** → [supabase.com](https://supabase.com).
2. **SQL Editor** → New query → pegar el contenido de `schema.sql` → Run.
   Crea las tablas de arriendos, limpiezas y las memorias independientes de avisos a Beatriz y Rodrigo + RLS + realtime.
3. **Project Settings → API** → copiar **Project URL** y **anon public key**.
4. Pegar en `app.js` arriba (líneas ~13-14, `supabaseUrl` y `supabaseAnonKey`).
5. **Cambiar los PINes** en `app.js`:
   - `CONFIG.opsPin` (default `"0000"`) — quien usa la vista móvil
   - `CONFIG.adminPin` (default `"2407"`) — admin (modo edición)
6. **Deploy**: cualquier static host. Recomendado **Cloudflare Pages** + **Cloudflare Access** (gratis hasta 50 usuarios, ver paso 6).

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
  comparte por Supabase y permite corregir o reenviar.
- **WhatsApp para Rodrigo**: usa el mismo flujo, selección individual o agrupada
  y confirmación humana, pero con texto de conserjería y una memoria totalmente
  independiente de la de Beatriz.

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
- RLS abierto por diseño (la defensa es la URL staying dentro del círculo familiar). Si querés cerrar, agregá Supabase Auth + passcode compartido.

## Cache busting

Si cambiás `app.js` o `styles.css`, bumpear **ambos**:
- `const VERSION` al tope de `app.js` (badge en el footer).
- `?v=N` en `index.html` sobre el `<link>` y `<script>` correspondiente.

Si sólo bumpeás uno, el badge y el archivo servido no coinciden y los usuarios ven código viejo.

## Deploy paso a paso

### Cloudflare Pages + Cloudflare Access (recomendado, gratis)

1. Subí esta repo a GitHub (privado).
2. [dash.cloudflare.com](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
3. Framework preset = **None**, Build command vacío, Build output directory = **`/`**.
4. Save and Deploy. URL: `https://<proyecto>.pages.dev`.
5. **Cloudflare Access** (Zero Trust, plan Free hasta 50 usuarios): **Access** → **Applications** → **Add** → **Self-hosted**, dominio `<proyecto>.pages.dev`, Policy: **Allow** + emails de la familia.

### Netlify Drop (sin auth, 30 segundos)

1. [app.netlify.com/drop](https://app.netlify.com/drop)
2. Arrastrá la carpeta. URL al instante.
3. ⚠ Sin portón: la URL queda abierta. Solo para testing.
