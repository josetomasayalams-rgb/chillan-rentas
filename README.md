# chillan-rentas

Plataforma de operaciones de arriendos para el departamento familiar de Chillán. Vista mobile-first con Liquid Glass (estilo Apple), calendario de arriendos, tareas generadas automáticamente al check-out, y un botoncito Admin para que el dueño registre arriendos con brush selection.

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
   Crea las tablas `rentals`, `cleanings`, `cleaning_comments` + RLS + realtime.
3. **Project Settings → API** → copiar **Project URL** y **anon public key**.
4. Pegar en `app.js` arriba (líneas ~13-14, `supabaseUrl` y `supabaseAnonKey`).
5. **Cambiar los PINes** en `app.js`:
   - `CONFIG.opsPin` (default `"0000"`) — quien usa la vista móvil
   - `CONFIG.adminPin` (default `"2407"`) — admin (modo edición)
6. **Deploy**: cualquier static host. Recomendado **Cloudflare Pages** + **Cloudflare Access** (gratis hasta 50 usuarios, ver paso 6).

## Cómo se usa

- **Vista móvil** (`/`, en celular): PIN → calendario de arriendos. Cada arriendo muestra una barra con la fuente (Airbnb, Booking, Directo, Otro). En el día de check-out aparece un **ticket verde** que se puede tocar para marcar la tarea como hecha, con comentario opcional.
- **Modo admin**: botoncito `🔒 Admin` en el footer → clave admin → habilita creación de arriendos por **brush selection** (tocá un día para llegada 16:00, otro para salida 12:00). Pill flotante con "Confirmar" o "+ Detalles" para abrir el form con fechas pre-llenas.

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
- **Una** `cleaning` (tarea) por `rental`, generada automáticamente al `checkout_date` a las 12:00. Estados: `pending | confirmed | done | cancelled`.
- `cleaning_comments` opcional — para que el operador deje notas (ej: "dejé las llaves en la cocina").
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
