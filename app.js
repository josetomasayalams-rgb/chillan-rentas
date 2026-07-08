// =====================================================================
//  Operaciones · Departamento Chillán
//  Misma estructura que el calendario de reservas familiar (../app.js):
//  misma grid, mismas animaciones de lock, mismo Liquid Glass.
//
//  Mismo PIN de entrada para todos. Un botoncito "🔒 Admin" en el footer
//  activa el modo admin (con clave separada). En modo admin: crear,
//  editar y cancelar arriendos. Sin admin: solo vista.
// =====================================================================

const CONFIG = {
  // Mismas claves que el calendario principal (../app.js).
  supabaseUrl:    "https://uimqusoylxpyljbfqumm.supabase.co",
  supabaseAnonKey:"sb_publishable_B_MIa8pWGFjzLhdzLoi61A_kffCRo8_",

  // PIN de entrada — el mismo para todos.
  // Cambiar antes de desplegar. Distinto de "9014" del calendario familiar.
  opsPin:     "0000",

  // Clave para activar el modo admin (botoncito del footer). Distinta del
  // PIN de entrada. Por defecto coincide con la del calendario familiar
  // (2407) — el admin solo necesita recordar una.
  adminPin:       "2407",

  sourceLabels: {
    arriendo: "Arriendo",
  },
  sourceColors: {
    arriendo: "#6366F1",   // indigo, único color
  },
  // Orden estable para "lanes" en celdas con varios arriendos.
  // Incluye todos los valores posibles del CHECK del schema (más "arriendo" futuro).
  sourceOrder:   ["direct","airbnb","booking","other","arriendo"],

  weekStart: 1,        // 1 = lunes
  yearMin:   2020,
  yearMax:   2040,
  maxLanes:  3,        // barras visibles por celda antes de "+N"
  inactivityLockMin: 0,   // 0 = sin auto-relock (la app es de un celular, no de un admin)
};

const VERSION = "12";
const MONTHS  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                 "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const WD      = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const LS = {
  rentals:   "ops-rentals",
  cleanings: "ops-cleanings",
  comments:  "ops-comments",
};

// ---------- Estado ----------
const state = {
  view: { y: 0, m: 0 },
  rentals:   [],
  cleanings: [],
  comments:  [],
  store: null,
  admin: false,         // modo admin: permite crear/editar/cancelar
  brush: { start: null, end: null },   // selección de arriendo por click en celdas
  loadError: null,
  schemaMissing: false, // true → fallback a localStore, mostrar banner
  _demoted: false,      // true = ya caímos a local por error en runtime
  _unsub: null,         // unsub del realtime / onChange, para retry limpio
  _probeData: null,     // cache del loadAll() del probe (evita doble fetch)
  tickHandle: null,
  updatedAt: null,
  modal: null,          // { kind: "rental"|"confirm", rental?, resolver? }
};

// ---------- Helpers ----------
function pad(n){ return String(n).padStart(2,"0"); }
function isoOf(y, m, d){ return `${y}-${pad(m+1)}-${pad(d)}`; }
function parseISO(s){ const [y,m,d] = s.split("-").map(Number); return {y,m:m-1,d}; }
function today(){
  const d = new Date();
  return { y:d.getFullYear(), m:d.getMonth() };
}
function todayIso(){
  const d = new Date();
  return isoOf(d.getFullYear(), d.getMonth(), d.getDate());
}
function sourceMeta(_s){
  // Solo hay una categoría visible: "Arriendo". El valor interno en la DB
  // puede ser cualquier source válido del CHECK del schema (usamos "direct");
  // el usuario siempre ve "Arriendo" en el display.
  return { name: "Arriendo", color: "#6366F1" };
}
function sourceOrderIdx(s){
  const i = CONFIG.sourceOrder.indexOf(s);
  return i === -1 ? 99 : i;
}
function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]));
}
function prettyShort(iso){
  const { m, d } = parseISO(iso);
  return `${d} ${["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"][m]}`;
}
function addDays(iso, n){
  const { y, m, d } = parseISO(iso);
  const dt = new Date(y, m, d + n);
  return isoOf(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

// UUID v4 con fallback
function uuid(){
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  if (typeof crypto !== "undefined" && crypto.getRandomValues){
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map(x => x.toString(16).padStart(2,"0"));
    return h.slice(0,4).join("")+"-"+h.slice(4,6).join("")+"-"+h.slice(6,8).join("")
         +"-"+h.slice(8,10).join("")+"-"+h.slice(10,16).join("");
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ---------- Store ----------
function localStore(){
  const get = (k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
  const set = (k, v) => localStorage.setItem(k, JSON.stringify(v));
  return {
    async loadAll(){
      return {
        rentals:   get(LS.rentals),
        cleanings: get(LS.cleanings),
        comments:  get(LS.comments),
      };
    },
    async upsertRental(r){
      const list = get(LS.rentals); const i = list.findIndex(x => x.id === r.id);
      if (i >= 0) list[i] = r; else list.push(r);
      set(LS.rentals, list);
    },
    async removeRental(id){
      set(LS.rentals, get(LS.rentals).filter(r => r.id !== id));
    },
    async upsertCleaning(c){
      const list = get(LS.cleanings); const i = list.findIndex(x => x.id === c.id);
      if (i >= 0) list[i] = c; else list.push(c);
      set(LS.cleanings, list);
    },
    async removeCleaning(id){
      set(LS.cleanings, get(LS.cleanings).filter(c => c.id !== id));
    },
    async addComment(cm){
      const list = get(LS.comments); list.push(cm); set(LS.comments, list);
    },
    onChange(cb){
      window.addEventListener("storage", e => {
        if ([LS.rentals, LS.cleanings, LS.comments].includes(e.key)) cb();
      });
    },
  };
}

function makeSupabaseStore(sb){
  return {
    async loadAll(){
      const [r, c, cm] = await Promise.all([
        sb.from("rentals").select("*").order("checkin_date"),
        sb.from("cleanings").select("*").order("scheduled_date"),
        sb.from("cleaning_comments").select("*").order("created_at"),
      ]);
      if (r.error) throw r.error;
      if (c.error) throw c.error;
      if (cm.error) throw cm.error;
      return { rentals: r.data || [], cleanings: c.data || [], comments: cm.data || [] };
    },
    async upsertRental(rental){
      const { error } = await sb.from("rentals").upsert(rental);
      if (error) throw error;
    },
    async removeRental(id){
      const { error } = await sb.from("rentals").delete().eq("id", id);
      if (error) throw error;
    },
    async upsertCleaning(cleaning){
      const { error } = await sb.from("cleanings").upsert(cleaning);
      if (error) throw error;
    },
    async removeCleaning(id){
      const { error } = await sb.from("cleanings").delete().eq("id", id);
      if (error) throw error;
    },
    async addComment(cm){
      const { error } = await sb.from("cleaning_comments").insert(cm);
      if (error) throw error;
    },
    onChange(cb){
      const channel = sb.channel("ops-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "rentals"   }, () => cb())
        .on("postgres_changes", { event: "*", schema: "public", table: "cleanings" }, () => cb())
        .subscribe();
      return () => sb.removeChannel(channel);
    },
  };
}

async function initStore(){
  const badge = document.getElementById("mode-badge");
  let live = false, configuredButFailed = false;
  if (CONFIG.supabaseUrl && CONFIG.supabaseAnonKey){
    try{
      const { createClient } = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
      const sb = createClient(CONFIG.supabaseUrl, CONFIG.supabaseAnonKey);
      const candidate = makeSupabaseStore(sb);

      // Probe: hacer un loadAll antes de setear state.store. Si las tablas
      // no existen (schema no creado), caemos a localStore antes de que
      // el primer write falle con un mensaje feo.
      const probe = await candidate.loadAll().catch(e => ({ __err: e }));
      if (probe && probe.__err){
        const cat = categorizeError(probe.__err);
        console.warn("Supabase probe falló:", cat);
        if (cat.kind === "schema" || cat.kind === "network"){
          state.store = localStore();
          state.schemaMissing = (cat.kind === "schema");
          configuredButFailed = true;
        } else {
          state.store = candidate;
          state.schemaMissing = false;
        }
      } else {
        state.store = candidate;
        state._probeData = probe;
      }
    }catch(err){
      console.error("Supabase init falló, usando modo local:", err);
      state.store = localStore();
      configuredButFailed = true;
    }
  }
  if (!state.store) state.store = localStore();

  // Badge: "live" solo si el probe trajo datos sin error. "schema" y "network"
  // son fallback a local (el badge muestra warning + v).
  const isLive = !!state._probeData;
  badge.classList.toggle("live", isLive);
  badge.classList.toggle("warn", !isLive);
  badge.textContent = (isLive
    ? "● Modo live · sincronizado"
    : (state.schemaMissing
        ? "⚠ Faltan tablas en la nube"
        : (configuredButFailed
            ? "⚠ Modo local (no se pudo conectar a Supabase)"
            : "○ Modo local · solo este dispositivo"))) + "  ·  v" + VERSION;

  if (state._unsub) try { state._unsub(); } catch {}
  state._unsub = state.store.onChange(() => load(true));

  if (state.schemaMissing) showSchemaBanner();
}

// Helper: categoriza un error de Supabase. Usado por load() y los call sites
// de escritura para decidir si caen a localStore.
function categorizeError(err){
  const msg  = (err && err.message) ? String(err.message) : String(err || "");
  const code = err && (err.code || err.status);
  if (code === "PGRST116" || code === "42P01"
      || /schema cache|Could not find the table|relation .* does not exist/i.test(msg)){
    return { kind: "schema",  message: msg };
  }
  if (/Failed to fetch|NetworkError|timeout|abort|network/i.test(msg)
      || code === "ETIMEDOUT" || code === "ENOTFOUND"){
    return { kind: "network", message: msg };
  }
  return { kind: "unknown", message: msg };
}

async function load(isRemotePush=false){
  try{
    let data;
    if (state._probeData && !isRemotePush){
      // Reusar el resultado del probe de initStore (evita doble fetch).
      data = state._probeData;
      state._probeData = null;
    } else {
      data = await state.store.loadAll();
    }
    state.rentals   = data.rentals   || [];
    state.cleanings = data.cleanings || [];
    state.comments  = data.comments  || [];
    state.loadError = null;
    state.updatedAt = new Date().toISOString();
  }catch(err){
    const cat = categorizeError(err);
    console.error("load() falló:", cat);
    if ((cat.kind === "schema" || cat.kind === "network") && !state._demoted){
      // Auto-fallback: swap a localStore y reintentar.
      state._demoted = true;
      if (state._unsub) try { state._unsub(); } catch {}
      state.store = localStore();
      state.schemaMissing = (cat.kind === "schema");
      state._unsub = state.store.onChange(() => load(true));
      showSchemaBanner();
      updateModeBadge();
      return load(isRemotePush);   // reintenta con local
    }
    state.loadError = cat.message;
  }
  render();
}

// Refresca el badge de modo cuando el store cambia de identidad.
function updateModeBadge(){
  const badge = document.getElementById("mode-badge");
  if (!badge) return;
  // Si el probe original fue exitoso y nunca demotamos, es live.
  const isLive = !!state._probeData === false && !state._demoted && !state.schemaMissing;
  // (Lógica simplificada: confiamos en las flags de estado.)
  badge.classList.toggle("live", !state._demoted && !state.schemaMissing && !!state.store);
  badge.classList.toggle("warn", state.schemaMissing);
  badge.textContent = (state.schemaMissing
    ? "⚠ Faltan tablas en la nube"
    : "● Modo live · sincronizado") + "  ·  v" + VERSION;
}

// Banner: aparece cuando detectamos que el schema no existe en Supabase.
function showSchemaBanner(){
  const b = document.getElementById("schema-banner");
  if (b) b.hidden = false;
}
function hideSchemaBanner(){
  const b = document.getElementById("schema-banner");
  if (b) b.hidden = true;
}

// Reintenta la conexión: mata la subscripción vieja, reimporta el cliente,
// reintenta el probe. Si anda, vuelve a live; si no, deja el banner.
async function retryConnection(){
  const btn = document.getElementById("sb-retry");
  if (btn){ btn.disabled = true; btn.textContent = "Probando…"; }
  try{
    if (state._unsub) try { state._unsub(); } catch {}
    state._unsub = null;
    state._demoted = false;
    state.schemaMissing = false;
    state._probeData = null;
    state.loadError = null;
    hideSchemaBanner();

    await initStore();
    await load();

    if (state.schemaMissing){
      showSchemaBanner();
      toast("Sigue sin haber tablas en la nube", "warn");
    } else {
      toast("✓ Sincronización activa", "ok");
    }
  }catch(err){
    showSchemaBanner();
    toast("Error al reintentar: " + (err.message || err), "err");
  }finally{
    if (btn){ btn.disabled = false; btn.textContent = "Reintentar"; }
  }
}

// ---------- Overlap check ----------
function findOverlapping(checkinIso, checkoutIso, ignoreRentalId=null){
  return state.rentals.filter(r =>
    r.id !== ignoreRentalId
    && r.status !== "cancelled"
    && r.checkin_date <= checkoutIso
    && r.checkout_date >= checkinIso
  );
}

// ---------- Render ----------
function render(){
  renderNav();
  renderLegend();
  renderHint();
  renderGrid();
  renderBrushBar();
}

function brushClass(dateStr){
  const b = state.brush;
  if (!b.start) return "";
  if (b.start && !b.end){
    return dateStr === b.start ? " single" : "";
  }
  if (b.start === b.end){
    return dateStr === b.start ? " single" : "";
  }
  if (dateStr === b.start) return " range-start";
  if (dateStr === b.end)   return " range-end";
  if (dateStr > b.start && dateStr < b.end) return " in-range";
  return "";
}

// ---------- Brush: selección de arriendo por clicks en celdas ----------
function onAdminCellClick(dateStr){
  const b = state.brush;
  if (!b.start || (b.start && b.end)){
    b.start = dateStr;
    b.end = null;
  } else if (dateStr < b.start){
    b.start = dateStr;
    b.end = null;
  } else {
    b.end = dateStr;
  }
  render();
}

function cancelBrush(){
  state.brush.start = null;
  state.brush.end = null;
  render();
}

function renderBrushBar(){
  const bar = document.getElementById("brush-bar");
  const b = state.brush;
  if (!state.admin || !b.start){
    bar.classList.remove("show");
    return;
  }
  bar.classList.add("show");
  const range = b.end
    ? `Llegada ${prettyShort(b.start)} 16:00 → Salida ${prettyShort(b.end)} 12:00`
    : `Llegada ${prettyShort(b.start)} 16:00 · toca el día de salida`;
  bar.querySelector(".bb-range").textContent = range;
  bar.querySelector("#brush-confirm").disabled = !b.end;
  bar.querySelector("#brush-details").disabled = !b.end;
}

async function confirmBrush(){
  const b = state.brush;
  if (!b.start || !b.end) return;
  const rental = {
    id: uuid(),
    source: "direct",   // valor interno; el display siempre dice "Arriendo"
    reference: null,
    guest_name: null,
    checkin_date:  b.start,
    checkout_date: b.end,
    notes: null,
    status: "scheduled",
    created_at: new Date().toISOString(),
  };
  const cta = document.getElementById("brush-confirm");
  cta.disabled = true;
  const orig = cta.textContent;
  cta.textContent = "Guardando…";
  try{
    await state.store.upsertRental(rental);
    await state.store.upsertCleaning({
      id: uuid(),
      rental_id: rental.id,
      scheduled_date: rental.checkout_date,
      scheduled_time: "12:00",
      status: "pending",
      confirmed_at: null, done_at: null,
      created_at: new Date().toISOString(),
    });
    b.start = null; b.end = null;
    render();
    toast("✓ Arriendo creado");
  }catch(err){
    // Si el schema se cayó mid-session, demote y reintenta.
    const cat = categorizeError(err);
    if ((cat.kind === "schema" || cat.kind === "network") && !state._demoted){
      state._demoted = true;
      if (state._unsub) try { state._unsub(); } catch {}
      state.store = localStore();
      state.schemaMissing = (cat.kind === "schema");
      state._unsub = state.store.onChange(() => load(true));
      showSchemaBanner();
      updateModeBadge();
      try{
        await state.store.upsertRental(rental);
        await state.store.upsertCleaning({
          id: uuid(), rental_id: rental.id, scheduled_date: rental.checkout_date,
          scheduled_time: "12:00", status: "pending",
          confirmed_at: null, done_at: null, created_at: new Date().toISOString(),
        });
        b.start = null; b.end = null;
        render();
        toast("✓ Arriendo guardado en modo local", "warn");
        return;
      }catch(e2){
        toast("Error: " + (e2.message || e2), "err");
      }
    } else {
      toast("Error al guardar: " + (err.message || err), "err");
    }
    cta.disabled = false; cta.textContent = orig;
  }
}

function openRentalFormFromBrush(){
  const b = state.brush;
  if (!b.start || !b.end) return;
  const ci = b.start, co = b.end;
  b.start = null; b.end = null;
  render();
  openRentalForm(null, ci, co);
}

function renderNav(){
  const monthSel = document.getElementById("month");
  const yearSel  = document.getElementById("year");
  if (!monthSel.options.length){
    MONTHS.forEach((m,i) => monthSel.add(new Option(m, i)));
    for (let y=CONFIG.yearMin; y<=CONFIG.yearMax; y++) yearSel.add(new Option(y, y));
  }
  monthSel.value = state.view.m;
  yearSel.value  = state.view.y;
}

function renderLegend(){
  const el = document.getElementById("legend");
  el.innerHTML = Object.keys(CONFIG.sourceLabels).map(s => {
    const m = sourceMeta(s);
    return `<span class="chip"><span class="dot" style="background:${m.color}"></span>${escapeHtml(m.name)}</span>`;
  }).join("");
}

function renderHint(){
  const el = document.getElementById("hint-bar");
  if (state.admin){
    if (!state.brush.start){
      el.textContent = "Modo admin · toca un día para marcar llegada 16:00 · toca otro día para salida 12:00";
    } else if (state.brush.start && !state.brush.end){
      el.textContent = "Toca el día de salida (12:00)";
    } else {
      el.textContent = "Listo · confirma el arriendo o agrega detalles";
    }
  } else {
    el.textContent = "Toca un arriendo para ver detalles · toca el ticket de salida para marcar la tarea";
  }
}

function renderGrid(){
  const { y, m } = state.view;
  const first = new Date(y, m, 1);
  const daysInMonth = new Date(y, m+1, 0).getDate();
  const lead = (first.getDay() - CONFIG.weekStart + 7) % 7;
  const totalCells = Math.ceil((lead + daysInMonth) / 7) * 7;

  const n = new Date();
  const todayStr = isoOf(n.getFullYear(), n.getMonth(), n.getDate());

  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  const wd = document.getElementById("weekdays");
  if (!wd.children.length){
    wd.innerHTML = WD.map(d => `<div>${d}</div>`).join("");
  }

  for (let i=0; i<totalCells; i++){
    const dayNum = i - lead + 1;
    const cell = document.createElement("div");
    if (dayNum < 1 || dayNum > daysInMonth){
      cell.className = "cell blank";
      grid.appendChild(cell);
      continue;
    }
    const dateStr = isoOf(y, m, dayNum);
    const isPast  = dateStr < todayStr;
    const isToday = dateStr === todayStr;
    cell.className = "cell"
      + (isToday ? " today" : "")
      + (isPast  ? " past"  : "")
      + (state.loadError ? " blocked" : "")
      + brushClass(dateStr);
    cell.dataset.date = dateStr;

    // En modo admin, las celdas son tappables para brush selection
    if (state.admin){
      cell.classList.add("admin-clickable");
      cell.addEventListener("click", () => onAdminCellClick(dateStr));
    }

    const num = document.createElement("div");
    num.className = "num";
    num.textContent = dayNum;
    cell.appendChild(num);

    const dayRentals = state.rentals
      .filter(r => r.status !== "cancelled"
                && r.checkin_date <= dateStr
                && r.checkout_date >= dateStr)
      .sort((a,b) => sourceOrderIdx(a.source) - sourceOrderIdx(b.source));

    const segs = document.createElement("div");
    segs.className = "segments";
    dayRentals.slice(0, CONFIG.maxLanes).forEach(r => {
      const meta = sourceMeta(r.source);
      const isStart = r.checkin_date === dateStr;
      const isEnd   = r.checkout_date === dateStr;
      const cls = ["seg", isStart && "start", isEnd && "end",
                   (isStart && isEnd) && "pill"].filter(Boolean).join(" ");
      const seg = document.createElement("div");
      seg.className = cls;
      seg.style.background = meta.color;
      seg.textContent = (isStart || isEnd) ? meta.name : "";
      seg.dataset.id = r.id;
      seg.title = `${meta.name} · ${r.checkin_date} → ${r.checkout_date}${r.guest_name ? " · " + r.guest_name : ""}`;
      seg.addEventListener("click", e => { e.stopPropagation(); openPopover(r, seg); });
      segs.appendChild(seg);
    });
    if (dayRentals.length > CONFIG.maxLanes){
      const more = document.createElement("div");
      more.className = "seg pill";
      more.style.background = "rgba(255,255,255,.25)";
      more.textContent = `+${dayRentals.length - CONFIG.maxLanes}`;
      segs.appendChild(more);
    }
    cell.appendChild(segs);

    // Ticket en el día de salida: un arriendo que TERMINA hoy puede marcarse como hecho.
    // Mostramos un ticket por celda (el primero que termina hoy).
    const endingRentals = state.rentals.filter(r =>
      r.status !== "cancelled" && r.checkout_date === dateStr
    );
    if (endingRentals.length){
      const c = state.cleanings.find(cl => cl.rental_id === endingRentals[0].id);
      if (c && c.status !== "cancelled"){
        const ticket = document.createElement("button");
        ticket.type = "button";
        ticket.className = `cell-ticket ${c.status === "done" ? "done" : "pending"}`;
        ticket.dataset.cleaningId = c.id;
        // Sin texto. Sin icono. La forma y el color hacen todo el trabajo.
        // El aria-label y el title dan contexto a SR y tooltip.
        ticket.setAttribute("aria-label", c.status === "done"
          ? "Tarea hecha. Tocar para deshacer."
          : "Tocar para marcar como hecha.");
        ticket.title = c.status === "done"
          ? `Tarea del ${prettyShort(c.scheduled_date)} hecha — tocar para deshacer`
          : `Tocar para marcar la tarea del ${prettyShort(c.scheduled_date)} como hecha`;
        ticket.addEventListener("click", e => { e.stopPropagation(); onTicketTap(c); });
        cell.appendChild(ticket);
      }
    }

    grid.appendChild(cell);
  }
}

// ---------- Popover ----------
function openPopover(r, anchor){
  const pop = document.getElementById("pop");
  const meta = sourceMeta(r.source);
  const cs = state.cleanings.filter(c => c.rental_id === r.id);
  const c0 = cs[0];
  const cleaningLine = c0
    ? `<div class="prow"><span>Tarea</span><b>${escapeHtml(prettyShort(c0.scheduled_date))} · ${escapeHtml(c0.status)}</b></div>`
    : "";

  const adminActions = state.admin ? `
    <div class="pactions">
      <button class="pbtn" data-act="edit">Editar</button>
      <button class="pbtn danger" data-act="cancel">Cancelar arriendo</button>
    </div>
  ` : "";

  pop.innerHTML = `
    <div class="ptitle">
      <span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${meta.color};margin-right:6px"></span>
      ${escapeHtml(meta.name)}${r.reference ? ` · ${escapeHtml(r.reference)}` : ""}
    </div>
    <div class="prow"><span>Llegada</span><b>${escapeHtml(prettyShort(r.checkin_date))}</b></div>
    <div class="prow"><span>Salida</span><b>${escapeHtml(prettyShort(r.checkout_date))}</b></div>
    ${r.guest_name ? `<div class="prow"><span>Huesped</span><b>${escapeHtml(r.guest_name)}</b></div>` : ""}
    ${cleaningLine}
    ${r.notes ? `<div class="prow"><span>Nota</span><b>${escapeHtml(r.notes)}</b></div>` : ""}
    ${adminActions}
  `;
  pop.hidden = false;
  positionPopover(pop, anchor);

  if (state.admin){
    pop.querySelectorAll(".pbtn").forEach(btn => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.act;
        if (act === "edit"){
          pop.hidden = true;
          openRentalForm(r);
        } else if (act === "cancel"){
          pop.hidden = true;
          confirmCancelRental(r);
        }
      });
    });
  }
}

function positionPopover(pop, anchor){
  if (window.innerWidth <= 560){
    pop.style.left = "";
    pop.style.top = "";
    return;
  }
  const r = anchor.getBoundingClientRect();
  let left = r.left;
  let top = r.bottom + 6;
  const pw = 240;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (top + 220 > window.innerHeight - 8) top = r.top - 220;
  pop.style.left = Math.max(8, left) + "px";
  pop.style.top  = Math.max(8, top) + "px";
}

// ---------- Modal: nuevo / editar arriendo ----------
function openRentalForm(rental=null, checkin=null, checkout=null){
  if (!state.admin) return;   // guard: solo admin
  const isEdit = !!rental;
  state.modal = { kind: "rental", rental };
  document.getElementById("rental-title").textContent = isEdit ? "Editar arriendo" : "Nuevo arriendo";
  document.getElementById("rental-tip").textContent = isEdit
    ? "Cambiar el check-out regenera la tarea (puede afectar el progreso)."
    : "Check-out 12:00 → se genera una tarea.";

  const t = todayIso();
  const ci = rental?.checkin_date  || checkin  || t;
  const co = rental?.checkout_date || checkout || addDays(ci, 1);
  document.getElementById("r-reference").value = rental?.reference    || "";
  document.getElementById("r-guest").value     = rental?.guest_name   || "";
  document.getElementById("r-checkin").value   = ci;
  document.getElementById("r-checkout").value  = co;
  document.getElementById("r-notes").value     = rental?.notes         || "";
  document.getElementById("r-hint").textContent = "";
  document.getElementById("r-save").textContent = isEdit ? "Guardar cambios" : "Guardar arriendo";

  // Auto-expandir detalles solo si el arriendo ya tiene alguno.
  const hasDetails = rental && (rental.reference || rental.guest_name || rental.notes);
  setDetailsOpen(!!hasDetails);

  document.getElementById("rental-modal").hidden = false;
  requestAnimationFrame(() => document.getElementById("r-checkin").focus());
}

function setDetailsOpen(open){
  const details = document.getElementById("r-details");
  const btn     = document.getElementById("r-toggle-details");
  details.hidden = !open;
  btn.textContent = open ? "− Ocultar detalles" : "+ Agregar detalles (opcional)";
  btn.setAttribute("aria-expanded", String(open));
}

function closeRentalForm(){
  document.getElementById("rental-modal").hidden = true;
  if (state.modal?.kind === "rental") state.modal = null;
}

async function saveRentalForm(){
  if (!state.admin) return;
  const m = state.modal;
  if (!m || m.kind !== "rental") return;
  const isEdit = !!m.rental;
  const ci = document.getElementById("r-checkin").value;
  const co = document.getElementById("r-checkout").value;
  if (!ci || !co){ document.getElementById("r-hint").textContent = "⚠ Faltan fechas."; return; }
  if (co < ci){ document.getElementById("r-hint").textContent = "⚠ Check-out no puede ser antes de check-in."; return; }

  const data = {
    source:       "direct",   // valor interno; el display siempre dice "Arriendo"
    reference:    document.getElementById("r-reference").value.trim() || null,
    guest_name:   document.getElementById("r-guest").value.trim() || null,
    checkin_date:  ci,
    checkout_date: co,
    notes:        document.getElementById("r-notes").value.trim() || null,
    status:       "scheduled",
  };

  const save = document.getElementById("r-save");
  save.disabled = true;
  const origText = save.textContent;
  save.textContent = "Guardando…";

  try{
    let rentalId, oldCleaning;
    if (isEdit){
      const updated = { ...m.rental, ...data };
      await state.store.upsertRental(updated);
      rentalId = m.rental.id;
      oldCleaning = state.cleanings.find(c => c.rental_id === rentalId);
    } else {
      const r = { id: uuid(), ...data, created_at: new Date().toISOString() };
      await state.store.upsertRental(r);
      rentalId = r.id;
    }

    // Generar / regenerar cleaning
    if (isEdit && oldCleaning){
      if (oldCleaning.status === "pending"){
        await state.store.removeCleaning(oldCleaning.id);
        await state.store.upsertCleaning({
          id: uuid(), rental_id: rentalId, scheduled_date: co,
          scheduled_time: "12:00", status: "pending",
          confirmed_at: null, done_at: null, created_at: new Date().toISOString(),
        });
      } else if (oldCleaning.status === "confirmed" || oldCleaning.status === "done"){
        const ok = await askConfirm({
          title: "La tarea ya fue confirmada",
          tip: `Esta tarea está ${oldCleaning.status === "confirmed" ? "confirmada" : "marcada como hecha"}. Cambiar el check-out la va a regenerar y se perderá el progreso. ¿Continuar?`,
          yesLabel: "Sí, regenerar",
        });
        if (!ok){
          save.disabled = false; save.textContent = origText;
          return;
        }
        await state.store.removeCleaning(oldCleaning.id);
        await state.store.upsertCleaning({
          id: uuid(), rental_id: rentalId, scheduled_date: co,
          scheduled_time: "12:00", status: "pending",
          confirmed_at: null, done_at: null, created_at: new Date().toISOString(),
        });
      } else if (oldCleaning.status === "cancelled"){
        await state.store.upsertCleaning({
          ...oldCleaning, scheduled_date: co, status: "pending",
          confirmed_at: null, done_at: null,
        });
      }
    } else if (!isEdit){
      await state.store.upsertCleaning({
        id: uuid(), rental_id: rentalId, scheduled_date: co,
        scheduled_time: "12:00", status: "pending",
        confirmed_at: null, done_at: null, created_at: new Date().toISOString(),
      });
    }

    closeRentalForm();
    await load();
    toast(isEdit ? "✓ Arriendo actualizado" : "✓ Arriendo creado");
  }catch(err){
    document.getElementById("r-hint").textContent = "⚠ " + (err.message || err);
    save.disabled = false; save.textContent = origText;
  }
}

// ---------- Modal: confirmar (genérico) ----------
let askConfirmResolver = null;
function askConfirm({ title, tip, yesLabel = "Sí" } = {}){
  return new Promise(resolve => {
    askConfirmResolver = resolve;
    document.getElementById("c-title").textContent = title || "¿Confirmar?";
    document.getElementById("c-tip").textContent = tip || "";
    const yesBtn = document.getElementById("c-yes");
    yesBtn.textContent = yesLabel;
    document.getElementById("confirm-modal").hidden = false;
    requestAnimationFrame(() => yesBtn.focus());
  });
}
function closeConfirmModal(result){
  document.getElementById("confirm-modal").hidden = true;
  if (askConfirmResolver){ askConfirmResolver(result); askConfirmResolver = null; }
  state.pendingCancelRental = null;
}

// ---------- Ticket: toggle directo (sin modal, sin comentario) ----------
// Tap en ticket pending → done (verde). Tap en ticket done → pending (glass).
// El cambio de color ES la confirmación. No hay modal ni texto.
async function onTicketTap(cleaning){
  const next = cleaning.status === "done" ? "pending" : "done";
  const updates = { ...cleaning, status: next };
  if (next === "done") updates.done_at = new Date().toISOString();
  else updates.done_at = null;
  try{
    await state.store.upsertCleaning(updates);
    haptic(8);
    await load();
  }catch(err){
    toast("Error: " + (err.message || err), "err");
  }
}

// ---------- Cancelar arriendo ----------
async function confirmCancelRental(rental){
  if (!state.admin) return;
  const cs = state.cleanings.filter(c => c.rental_id === rental.id);
  let tip = `El arriendo del ${prettyShort(rental.checkin_date)} al ${prettyShort(rental.checkout_date)} (${sourceMeta(rental.source).name}) y su tarea asociada pasarán a estado cancelado.`;
  if (cs.length && (cs[0].status === "confirmed" || cs[0].status === "done")){
    tip += ` La tarea está ${cs[0].status === "confirmed" ? "confirmada" : "marcada como hecha"} — quedará como evidencia.`;
  }
  const ok = await askConfirm({ title: "¿Cancelar arriendo?", tip, yesLabel: "Sí, cancelar" });
  if (!ok) return;
  try{
    await state.store.upsertRental({ ...rental, status: "cancelled" });
    for (const c of cs){
      await state.store.upsertCleaning({ ...c, status: "cancelled" });
    }
    await load();
    toast("✓ Arriendo cancelado", "warn");
  }catch(err){
    toast("Error al cancelar: " + (err.message || err), "err");
  }
}

// ---------- Toast ----------
function toast(msg, kind="ok", ms=1800){
  let t = document.getElementById("toast");
  if (!t){
    t = document.createElement("div");
    t.id = "toast";
    t.setAttribute("role", "status");
    t.setAttribute("aria-live", "polite");
    document.body.appendChild(t);
  }
  t.className = "";
  if (kind === "warn") t.classList.add("is-warn");
  if (kind === "err")  t.classList.add("is-err");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), ms);
}

// ---------- Modo admin (mismo patrón que el calendario familiar) ----------
function toggleAdmin(){
  if (state.admin){
    state.admin = false;
    cancelBrush();   // limpiar selección al salir del modo admin
  } else {
    const key = prompt("Clave de admin:");
    if (key === null) return;
    if (key === CONFIG.adminPin) state.admin = true;
    else { alert("Clave incorrecta"); return; }
  }
  updateAdminUI();
  render();
}
function updateAdminUI(){
  const btn = document.getElementById("admin");
  if (btn){
    btn.textContent = state.admin ? "🔓 Admin ON" : "🔒 Admin";
    btn.classList.toggle("on", state.admin);
  }
  document.body.classList.toggle("admin-mode", state.admin);
}

// ---------- Lock (idéntico al calendario familiar) ----------
function setupLock(){
  const lock = document.getElementById("lock");
  const pins = [...document.querySelectorAll(".lock-pin")];
  const err  = document.getElementById("lock-err");
  if (!lock || pins.length !== 4) return;

  pins[0].focus();

  function getCode(){ return pins.map(p => p.value).join(""); }
  function clearPins(){
    pins.forEach(p => { p.value = ""; p.classList.remove("filled","wrong"); });
    pins[0].focus();
  }
  function fail(msg){
    err.textContent = msg;
    pins.forEach(p => p.classList.add("wrong"));
    setTimeout(() => {
      pins.forEach(p => p.classList.remove("wrong"));
      clearPins();
    }, 550);
  }
  function success(){
    lock.classList.add("unlocking");
    document.body.classList.remove("locked");
    setTimeout(() => {
      lock.hidden = true;
      err.textContent = "";
    }, 600);
  }

  pins.forEach((pin, i) => {
    pin.addEventListener("input", () => {
      pin.value = pin.value.replace(/\D/g, "").slice(0, 1);
      pin.classList.toggle("filled", pin.value.length === 1);
      if (pin.value && i < pins.length - 1) pins[i + 1].focus();
      if (i === pins.length - 1 && getCode().length === pins.length){
        if (getCode() === CONFIG.opsPin) success();
        else fail("Clave incorrecta");
      }
    });
    pin.addEventListener("keydown", e => {
      if (e.key === "Backspace" && !pin.value && i > 0){
        pins[i - 1].focus();
        pins[i - 1].value = "";
        pins[i - 1].classList.remove("filled");
      }
      if (e.key === "ArrowLeft"  && i > 0)               { e.preventDefault(); pins[i - 1].focus(); }
      if (e.key === "ArrowRight" && i < pins.length - 1)  { e.preventDefault(); pins[i + 1].focus(); }
    });
    pin.addEventListener("paste", e => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text");
      const digits = text.replace(/\D/g, "").split("").slice(0, pins.length);
      digits.forEach((d, j) => { pins[j].value = d; pins[j].classList.add("filled"); });
      const last = Math.min(digits.length, pins.length) - 1;
      pins[Math.max(0, last)].focus();
      if (digits.length === pins.length){
        if (digits.join("") === CONFIG.opsPin) success();
        else fail("Clave incorrecta");
      }
    });
  });
}

// ---------- Bind ----------
function bind(){
  document.getElementById("prev").addEventListener("click", () => move(-1));
  document.getElementById("next").addEventListener("click", () => move(1));
  document.getElementById("today").addEventListener("click", () => { state.view = today(); render(); });
  document.getElementById("month").addEventListener("change", e => { state.view.m = +e.target.value; render(); });
  document.getElementById("year").addEventListener("change",  e => { state.view.y = +e.target.value; render(); });

  // Admin toggle
  document.getElementById("admin").addEventListener("click", toggleAdmin);

  // Nuevo arriendo
  document.getElementById("add").addEventListener("click", () => {
    if (!state.admin){ alert("Activa el modo admin primero (botón 🔒 Admin)."); return; }
    openRentalForm(null, null, null);
  });

  // Brush bar
  document.getElementById("brush-cancel").addEventListener("click", cancelBrush);
  document.getElementById("brush-confirm").addEventListener("click", confirmBrush);
  document.getElementById("brush-details").addEventListener("click", openRentalFormFromBrush);

  // Banner de schema faltante
  document.getElementById("sb-retry").addEventListener("click", retryConnection);

  // Modal rental
  document.getElementById("r-cancel").addEventListener("click", closeRentalForm);
  document.getElementById("r-save").addEventListener("click", saveRentalForm);
  document.getElementById("rental-modal").addEventListener("click", e => {
    if (e.target.id === "rental-modal") closeRentalForm();
  });
  document.getElementById("r-toggle-details").addEventListener("click", () => {
    const isOpen = !document.getElementById("r-details").hidden;
    setDetailsOpen(!isOpen);
  });

  // Modal confirm
  document.getElementById("c-no").addEventListener("click", () => closeConfirmModal(false));
  document.getElementById("c-yes").addEventListener("click", () => closeConfirmModal(true));
  document.getElementById("confirm-modal").addEventListener("click", e => {
    if (e.target.id === "confirm-modal") closeConfirmModal(false);
  });

  // Modal ticket: ya no existe — el ticket es directo (toggle).

  // Cerrar popover al click fuera / scroll / resize
  document.addEventListener("click", e => {
    const pop = document.getElementById("pop");
    if (!pop || pop.hidden) return;
    if (e.target.closest(".popover") || e.target.closest(".seg")) return;
    pop.hidden = true;
  });
  window.addEventListener("scroll", () => { const p = document.getElementById("pop"); if (p) p.hidden = true; }, { passive: true });
  window.addEventListener("resize", () => { const p = document.getElementById("pop"); if (p) p.hidden = true; });

  // Escape
  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (!document.getElementById("confirm-modal").hidden) closeConfirmModal(false);
    else if (!document.getElementById("rental-modal").hidden) closeRentalForm();
    else { const p = document.getElementById("pop"); if (p) p.hidden = true; }
  });
}

function move(delta){
  let { y, m } = state.view;
  m += delta;
  while (m < 0){ m += 12; y--; }
  while (m > 11){ m -= 12; y++; }
  if (y < CONFIG.yearMin) state.view = { y: CONFIG.yearMin, m: 0 };
  else if (y > CONFIG.yearMax) state.view = { y: CONFIG.yearMax, m: 11 };
  else state.view = { y, m };
  render();
}

// ---------- Init ----------
(async function main(){
  try{
    const t = today();
    state.view = { y: t.y, m: t.m };
    bind();
    await initStore();
    await load();
    setupLock();
    updateAdminUI();
    document.title += "  ·  v" + VERSION;
  }catch(err){
    console.error("Init error:", err);
    state.loadError = (err && err.message) ? err.message : String(err);
    render();
  }
})();
