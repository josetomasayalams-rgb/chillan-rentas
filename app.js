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

  // Contrato público y sanitizado. Une Airbnb, Booking y reservas
  // particulares sin exponer fuente, huésped, UID ni notas.
  familyAvailabilityUrl: "https://uimqusoylxpyljbfqumm.supabase.co/functions/v1/calendar-ical/availability",
  calendarRefreshMs: 5 * 60 * 1000,

  // WhatsApp de Beatriz (formato internacional sin '+', ej: '56957333361').
  // Si está vacío, el botón de WhatsApp muestra un toast y no abre nada.
  beatrizWhatsApp: "56957333361",

  // PIN de entrada — el mismo para todos.
  // Cambiar antes de desplegar. Distinto de "9014" del calendario familiar.
  opsPin:     "0000",

  // Clave para activar el modo admin (botoncito del footer). Distinta del
  // PIN de entrada. Por defecto coincide con la del calendario familiar
  // (2407) — el admin solo necesita recordar una.
  adminPin:       "2407",

  reservationLabel: "Reserva",
  // Dos tonos accesibles que se alternan por estadía, no por plataforma.
  // Así una misma reserva conserva su color desde el check-in al check-out.
  reservationTones: ["#0369A1", "#6D28D9"],
  // Orden estable para "lanes" en celdas con varios arriendos.
  // Incluye todos los valores posibles del CHECK del schema (más "arriendo" futuro).
  sourceOrder:   ["calendar","direct","airbnb","booking","other","arriendo"],

  weekStart: 1,        // 1 = lunes
  yearMin:   2020,
  yearMax:   2040,
  maxLanes:  3,        // barras visibles por celda antes de "+N"
  inactivityLockMin: 0,   // 0 = sin auto-relock (la app es de un celular, no de un admin)
};

const VERSION = "30";
const MONTHS  = ["Enero","Febrero","Marzo","Abril","Mayo","Junio",
                 "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const WD      = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const LS = {
  rentals:     "ops-rentals",
  cleanings:   "ops-cleanings",
  comments:    "ops-comments",
  calendar:    "ops-calendar-availability",
  notifications: "ops-beatriz-notifications",
  notificationBatches: "ops-beatriz-notification-batches",
  notificationEvents: "ops-beatriz-notification-events",
  notificationOutbox: "ops-beatriz-notification-outbox",
  lockEnabled: "ops-lock-enabled",     // "1" = lock al iniciar; "0" = sin clave
};

// ---------- Estado ----------
const state = {
  view: { y: 0, m: 0 },
  rentals:   [],
  cleanings: [],
  comments:  [],
  notifications: [],
  notificationBatches: [],
  notificationEvents: [],
  calendarReservations: [],
  calendarSource: null,
  calendarStatus: { status: "loading", fromCache: false, error: null, lastSuccessfulSyncAt: null },
  calendarSyncing: false,
  calendarRefreshHandle: null,
  notificationReconciling: false,
  pendingWhatsAppBatch: null,
  separateQueue: [],
  inboxSelection: new Set(),
  store: null,
  admin: false,         // modo admin: permite crear/editar/cancelar
  brush: { start: null, end: null },   // selección de arriendo por click en celdas
  loadError: null,
  schemaMissing: false, // true → fallback a localStore, mostrar banner
  _demoted: false,      // true = ya caímos a local por error en runtime
  _unsub: null,         // unsub del realtime / onChange, para retry limpio
  remoteReloadTimer: null,
  _probeData: null,     // cache del loadAll() del probe (evita doble fetch)
  tickHandle: null,
  updatedAt: null,
  modal: null,          // { kind: "rental"|"confirm", rental?, resolver? }
  undo: [],             // pila de inversas (máx 7) para el botón Deshacer
  lockEnabled: true,    // mostrar lock al iniciar (persiste en localStorage)
  unlocked: false,      // sesión: true después de tipear la clave correcta
};
const UNDO_LIMIT = 7;

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
function sourceMeta(s){
  // La fuente se conserva internamente para respetar la frontera de solo
  // lectura, pero visualmente sólo existe un tipo de reserva.
  return { name: CONFIG.reservationLabel, color: CONFIG.reservationTones[0] };
}
function reservationVisualId(rental){
  return rental?.reservationId || rental?.id || `${rental?.checkin_date || ""}:${rental?.checkout_date || ""}`;
}
function compareReservations(left, right){
  return (left.checkin_date || "").localeCompare(right.checkin_date || "")
    || (left.checkout_date || "").localeCompare(right.checkout_date || "")
    || reservationVisualId(left).localeCompare(reservationVisualId(right));
}
function buildReservationToneMap(rentals){
  const tones = new Map();
  [...(rentals || [])]
    .filter(rental => rental?.status !== "cancelled")
    .sort(compareReservations)
    .forEach(rental => {
      const id = reservationVisualId(rental);
      if (!tones.has(id)) tones.set(id, tones.size % CONFIG.reservationTones.length);
    });
  return tones;
}
function reservationTone(rental, toneMap){
  const index = toneMap?.get(reservationVisualId(rental)) ?? 0;
  return { index, color: CONFIG.reservationTones[index] || CONFIG.reservationTones[0] };
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

function simpleStableHash(value){
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (const ch of String(value)){
    const code = ch.charCodeAt(0);
    a = Math.imul(a ^ code, 0x01000193) >>> 0;
    b = Math.imul(b ^ code, 0x85ebca6b) >>> 0;
  }
  const parts = [a, b, a ^ b, Math.imul(a + b, 0xc2b2ae35) >>> 0];
  return parts.map(part => (part >>> 0).toString(16).padStart(8, "0")).join("");
}

function isValidIsoDate(value){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
  const { y, m, d } = parseISO(value);
  const date = new Date(y, m, d);
  return date.getFullYear() === y && date.getMonth() === m && date.getDate() === d;
}

function normalizeAvailabilityPayload(payload){
  if (!payload || payload.version !== 1) throw new Error("Contrato de calendario no compatible");
  const input = Array.isArray(payload.reservedRanges)
    ? payload.reservedRanges
    : Array.isArray(payload.blockedRanges) ? payload.blockedRanges : null;
  if (!input) throw new Error("El calendario no entregó reservas");

  const seen = new Set();
  const ranges = input.flatMap(range => {
    const startDate = range?.startDate;
    const endDate = range?.endDate;
    if (!isValidIsoDate(startDate) || !isValidIsoDate(endDate) || endDate <= startDate) return [];
    const suppliedId = typeof range?.reservationId === "string" ? range.reservationId : "";
    const reservationId = /^rsv_[a-f0-9]{32}$/.test(suppliedId)
      ? suppliedId
      : `rsv_${simpleStableHash(`${startDate}|${endDate}`)}`;
    const key = reservationId;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ reservationId, startDate, endDate }];
  }).sort((a,b) => a.startDate.localeCompare(b.startDate) || a.endDate.localeCompare(b.endDate));

  return {
    version: 1,
    status: ["live","stale","unavailable"].includes(payload.status) ? payload.status : "unavailable",
    generatedAt: payload.generatedAt || null,
    lastSuccessfulSyncAt: payload.lastSuccessfulSyncAt || null,
    ranges,
  };
}

function makeCalendarSource(url){
  let lastAttemptAt = 0;
  const readCache = () => {
    try {
      const parsed = JSON.parse(localStorage.getItem(LS.calendar) || "null");
      return parsed?.ranges
        ? normalizeAvailabilityPayload({ ...parsed, reservedRanges: parsed.ranges })
        : normalizeAvailabilityPayload(parsed);
    }
    catch { return null; }
  };
  const writeCache = value => {
    try { localStorage.setItem(LS.calendar, JSON.stringify(value)); } catch {}
  };

  return {
    async load({ force=false } = {}){
      const cached = readCache();
      const now = Date.now();
      if (!force && cached && now - lastAttemptAt < CONFIG.calendarRefreshMs){
        return { ...cached, fromCache: false, error: null };
      }
      lastAttemptAt = now;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try{
        const response = await fetch(url, {
          signal: controller.signal,
          cache: "no-store",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`Calendario respondió ${response.status}`);
        const normalized = normalizeAvailabilityPayload(await response.json());
        writeCache(normalized);
        return { ...normalized, fromCache: false, error: null };
      }catch(error){
        if (cached){
          return {
            ...cached,
            status: "stale",
            fromCache: true,
            error: error?.name === "AbortError" ? "Tiempo de espera agotado" : String(error?.message || error),
          };
        }
        throw error;
      }finally{
        clearTimeout(timeout);
      }
    },
  };
}

function calendarRangesToRentals(calendar){
  return calendar.ranges.map((range) => ({
    id: `calendar:${range.reservationId}`,
    reservationId: range.reservationId,
    source: "calendar",
    reference: null,
    guest_name: null,
    checkin_date: range.startDate,
    checkout_date: range.endDate,
    notes: null,
    status: "scheduled",
    created_at: calendar.generatedAt,
    readOnly: true,
  }));
}

function cleaningIdForReservation(reservationId){
  const hex = /^rsv_([a-f0-9]{32})$/.exec(reservationId || "")?.[1];
  if (!hex) return null;
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

function cleaningForRental(rental, cleanings = state.cleanings){
  if (!rental) return null;
  return rental.readOnly
    ? cleanings.find(cleaning => cleaning.reservation_id === rental.reservationId) || null
    : cleanings.find(cleaning => cleaning.rental_id === rental.id) || null;
}

function planCalendarCleaningReconciliation(existing, reservations, notifications, options = {}){
  const nowIso = options.nowIso || new Date().toISOString();
  const suppressedIds = new Set(options.suppressedReservationIds || []);
  const known = new Map((existing || [])
    .filter(cleaning => cleaning.reservation_id)
    .map(cleaning => [cleaning.reservation_id, cleaning]));
  const activeIds = new Set();
  const upserts = [];

  for (const rental of reservations || []){
    const reservationId = rental.reservationId;
    const id = cleaningIdForReservation(reservationId);
    if (!id) continue;
    activeIds.add(reservationId);
    const previous = known.get(reservationId);
    if (!previous){
      upserts.push({
        id,
        rental_id: null,
        reservation_id: reservationId,
        scheduled_date: rental.checkout_date,
        scheduled_time: "12:00",
        status: "pending",
        confirmed_at: null,
        done_at: null,
        created_at: nowIso,
      });
      continue;
    }
    const dateChanged = previous.scheduled_date !== rental.checkout_date;
    const restored = previous.status === "cancelled";
    if (!dateChanged && !restored) continue;
    upserts.push({
      ...previous,
      scheduled_date: rental.checkout_date,
      status: "pending",
      confirmed_at: null,
      done_at: null,
    });
  }

  const notificationById = new Map((notifications || []).map(item => [item.reservation_id, item]));
  for (const previous of known.values()){
    if (activeIds.has(previous.reservation_id) || previous.status === "cancelled") continue;
    const notification = notificationById.get(previous.reservation_id);
    // Una reserva cancelada antes de su salida pierde su tarea. Una estadía
    // finalizada conserva la tarea hasta que el operador confirme el aseo.
    if (suppressedIds.has(previous.reservation_id) || notification?.status === "removed"){
      upserts.push({ ...previous, status: "cancelled" });
    }
  }
  return { upserts };
}

function calendarReservationsWithoutManualDuplicates(calendarReservations, manualRentals){
  const manualRanges = new Set((manualRentals || [])
    .filter(rental => rental.status !== "cancelled")
    .map(rental => `${rental.checkin_date}|${rental.checkout_date}`));
  return (calendarReservations || []).filter(rental =>
    !manualRanges.has(`${rental.checkin_date}|${rental.checkout_date}`)
  );
}

function mergeCalendarReservationHistory(current, notifications, cleanings){
  const merged = [...(current || [])];
  const currentIds = new Set(merged.map(rental => rental.reservationId));
  const cleaningByReservation = new Map((cleanings || [])
    .filter(cleaning => cleaning.reservation_id)
    .map(cleaning => [cleaning.reservation_id, cleaning]));
  for (const notification of notifications || []){
    if (currentIds.has(notification.reservation_id) || notification.status !== "finished") continue;
    const cleaning = cleaningByReservation.get(notification.reservation_id);
    if (!cleaning || cleaning.status === "cancelled") continue;
    merged.push({
      id: `calendar:${notification.reservation_id}`,
      reservationId: notification.reservation_id,
      source: "calendar",
      reference: null,
      guest_name: null,
      checkin_date: notification.checkin_date,
      checkout_date: notification.checkout_date,
      notes: null,
      status: "scheduled",
      created_at: notification.created_at,
      readOnly: true,
      archived: true,
    });
  }
  return merged.sort((left, right) =>
    left.checkin_date.localeCompare(right.checkin_date) || left.checkout_date.localeCompare(right.checkout_date)
  );
}

const NOTIFICATION_LABELS = {
  pending: "Pendiente",
  opened: "WhatsApp abierto",
  confirmed: "Envío confirmado",
  needs_update: "Requiere nuevo aviso por cambio",
  removed: "Reserva retirada",
  finished: "Finalizada",
};

function isNotificationActionable(notification){
  return !!notification?.is_active && ["pending", "needs_update"].includes(notification.status);
}
function isNotificationVisibleForRole(notification, isAdmin){
  return !!notification?.is_active && (isAdmin || isNotificationActionable(notification));
}

function planNotificationReconciliation(existing, reservations, options = {}){
  const nowIso = options.nowIso || new Date().toISOString();
  const currentDate = options.currentDate || todayIso();
  const known = new Map((existing || []).map(item => [item.reservation_id, item]));
  const seen = new Set();
  const upserts = [];
  const events = [];

  for (const rental of reservations || []){
    const reservationId = rental.reservationId;
    if (!/^rsv_[a-f0-9]{32}$/.test(reservationId || "")) continue;
    seen.add(reservationId);
    const previous = known.get(reservationId);
    if (!previous){
      const created = {
        reservation_id: reservationId,
        checkin_date: rental.checkin_date,
        checkout_date: rental.checkout_date,
        status: "pending",
        is_active: true,
        last_seen_at: nowIso,
        opened_at: null,
        confirmed_at: null,
        last_batch_id: null,
        revision: 1,
        created_at: nowIso,
        updated_at: nowIso,
      };
      upserts.push(created);
      events.push({ reservation_id: reservationId, event_type: "created", previous_status: null, next_status: "pending", checkin_date: rental.checkin_date, checkout_date: rental.checkout_date });
      continue;
    }

    const datesChanged = previous.checkin_date !== rental.checkin_date || previous.checkout_date !== rental.checkout_date;
    const restored = !previous.is_active;
    if (!datesChanged && !restored) continue;
    const nextStatus = datesChanged && ["opened", "confirmed", "needs_update"].includes(previous.status)
      ? "needs_update"
      : "pending";
    const updated = {
      ...previous,
      checkin_date: rental.checkin_date,
      checkout_date: rental.checkout_date,
      status: nextStatus,
      is_active: true,
      last_seen_at: nowIso,
      confirmed_at: nextStatus === "needs_update" ? previous.confirmed_at : null,
      revision: Number(previous.revision || 1) + (datesChanged ? 1 : 0),
      updated_at: nowIso,
    };
    upserts.push(updated);
    events.push({
      reservation_id: reservationId,
      event_type: datesChanged ? "dates_changed" : "restored",
      previous_status: previous.status,
      next_status: nextStatus,
      checkin_date: rental.checkin_date,
      checkout_date: rental.checkout_date,
    });
  }

  for (const previous of existing || []){
    if (!previous.is_active || seen.has(previous.reservation_id)) continue;
    const finished = previous.checkout_date <= currentDate;
    const nextStatus = finished ? "finished" : "removed";
    upserts.push({ ...previous, status: nextStatus, is_active: false, updated_at: nowIso });
    events.push({
      reservation_id: previous.reservation_id,
      event_type: nextStatus,
      previous_status: previous.status,
      next_status: nextStatus,
      checkin_date: previous.checkin_date,
      checkout_date: previous.checkout_date,
    });
  }

  return { upserts, events };
}

function rentalsForDisplay(){
  const manual = state.rentals.filter(r => r.status !== "cancelled");
  const currentImported = calendarReservationsWithoutManualDuplicates(state.calendarReservations, manual);
  const imported = mergeCalendarReservationHistory(
    currentImported,
    state.notifications,
    state.cleanings,
  );
  return [...state.rentals, ...imported];
}

// Horarios fijos por convención. La app no los guarda en la DB; se muestran
// siempre igual en los bordes de las barras. Si en el futuro hay que hacerlos
// editables por rental, se agregan campos a la tabla `rentals`.
const CHECKIN_TIME  = "15:00";
const CHECKOUT_TIME = "12:00";

// Feedback háptico (vibración corta). En navegadores sin soporte es no-op.
function haptic(pattern=12){
  if (navigator.vibrate) try { navigator.vibrate(pattern); } catch {}
}

// ---------- Lock toggle (solo admin, persiste en localStorage) ----------
function isLockEnabled(){
  try { return localStorage.getItem(LS.lockEnabled) !== "0"; }
  catch { return true; }
}
function setLockEnabled(enabled){
  try { localStorage.setItem(LS.lockEnabled, enabled ? "1" : "0"); }
  catch (e) { console.warn("localStorage no disponible:", e); }
  state.lockEnabled = enabled;
  updateLockToggle();
}
function updateLockToggle(){
  const btn = document.getElementById("lock-toggle");
  if (!btn) return;
  if (state.lockEnabled){
    btn.textContent = "🔒 Con clave";
    btn.title = "Lock al iniciar: ACTIVO. Tocar para desactivar.";
    btn.classList.remove("off");
  } else {
    btn.textContent = "🔓 Sin clave";
    btn.title = "Lock al iniciar: DESACTIVADO. Tocar para activar.";
    btn.classList.add("off");
  }
}
function applyLockState(){
  const lock = document.getElementById("lock");
  if (state.lockEnabled && !state.unlocked){
    document.body.classList.add("locked");
    lock.hidden = false;
  } else {
    document.body.classList.remove("locked");
    lock.hidden = true;
  }
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
  const queue = (method, value) => {
    const outbox = get(LS.notificationOutbox);
    outbox.push({ id: uuid(), method, value, queued_at: new Date().toISOString() });
    set(LS.notificationOutbox, outbox);
  };
  return {
    kind: "local",
    async loadAll(){
      return {
        rentals:   get(LS.rentals),
        cleanings: get(LS.cleanings),
        comments:  get(LS.comments),
        notifications: get(LS.notifications),
        notificationBatches: get(LS.notificationBatches),
        notificationEvents: get(LS.notificationEvents),
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
    async upsertNotification(notification){
      const list = get(LS.notifications);
      const index = list.findIndex(item => item.reservation_id === notification.reservation_id);
      if (index >= 0) list[index] = notification; else list.push(notification);
      set(LS.notifications, list);
      queue("upsertNotification", notification);
    },
    async upsertNotificationBatch(batch){
      const list = get(LS.notificationBatches);
      const index = list.findIndex(item => item.id === batch.id);
      if (index >= 0) list[index] = batch; else list.push(batch);
      set(LS.notificationBatches, list);
      queue("upsertNotificationBatch", batch);
    },
    async addNotificationEvent(event){
      const list = get(LS.notificationEvents);
      if (!list.some(item => item.id === event.id)) list.push(event);
      set(LS.notificationEvents, list);
      queue("addNotificationEvent", event);
    },
    onChange(cb){
      window.addEventListener("storage", e => {
        if ([LS.rentals, LS.cleanings, LS.comments, LS.notifications, LS.notificationBatches, LS.notificationEvents].includes(e.key)) cb();
      });
    },
  };
}

function makeSupabaseStore(sb){
  return {
    kind: "supabase",
    async loadAll(){
      const [r, c, cm, n, nb, ne] = await Promise.all([
        sb.from("rentals").select("*").order("checkin_date"),
        sb.from("cleanings").select("*").order("scheduled_date"),
        sb.from("cleaning_comments").select("*").order("created_at"),
        sb.from("beatriz_notifications").select("*").order("checkin_date"),
        sb.from("beatriz_notification_batches").select("*").order("opened_at", { ascending: false }),
        sb.from("beatriz_notification_events").select("*").order("created_at", { ascending: false }).limit(1000),
      ]);
      if (r.error) throw r.error;
      if (c.error) throw c.error;
      if (cm.error) throw cm.error;
      if (n.error) throw n.error;
      if (nb.error) throw nb.error;
      if (ne.error) throw ne.error;
      return {
        rentals: r.data || [], cleanings: c.data || [], comments: cm.data || [],
        notifications: n.data || [], notificationBatches: nb.data || [], notificationEvents: ne.data || [],
      };
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
    async upsertNotification(notification){
      const { error } = await sb.from("beatriz_notifications").upsert(notification);
      if (error) throw error;
    },
    async upsertNotificationBatch(batch){
      const { error } = await sb.from("beatriz_notification_batches").upsert(batch);
      if (error) throw error;
    },
    async addNotificationEvent(event){
      const { error } = await sb.from("beatriz_notification_events").upsert(event, { onConflict: "id", ignoreDuplicates: true });
      if (error) throw error;
    },
    onChange(cb){
      const channel = sb.channel("ops-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "rentals"   }, () => cb())
        .on("postgres_changes", { event: "*", schema: "public", table: "cleanings" }, () => cb())
        .on("postgres_changes", { event: "*", schema: "public", table: "beatriz_notifications" }, () => cb())
        .on("postgres_changes", { event: "*", schema: "public", table: "beatriz_notification_batches" }, () => cb())
        .subscribe();
      return () => sb.removeChannel(channel);
    },
  };
}

async function flushNotificationOutbox(remoteStore){
  let outbox = [];
  try { outbox = JSON.parse(localStorage.getItem(LS.notificationOutbox) || "[]"); } catch {}
  if (!outbox.length) return false;
  const remaining = [];
  for (const command of outbox){
    try{
      if (typeof remoteStore[command.method] !== "function") throw new Error("Operación local no compatible");
      await remoteStore[command.method](command.value);
    }catch(error){
      console.warn("No se pudo reconciliar una operación de avisos:", categorizeError(error));
      remaining.push(command);
    }
  }
  localStorage.setItem(LS.notificationOutbox, JSON.stringify(remaining));
  return remaining.length !== outbox.length;
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
      let probe = await candidate.loadAll().catch(e => ({ __err: e }));
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
        const flushed = await flushNotificationOutbox(candidate);
        if (flushed) probe = await candidate.loadAll();
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
  state._unsub = state.store.onChange(scheduleRemoteLoad);

  if (state.schemaMissing) showSchemaBanner();
}

function scheduleRemoteLoad(){
  clearTimeout(state.remoteReloadTimer);
  state.remoteReloadTimer = setTimeout(() => load(true), 250);
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
    state.notifications = data.notifications || [];
    state.notificationBatches = data.notificationBatches || [];
    state.notificationEvents = data.notificationEvents || [];
    if (!state.pendingWhatsAppBatch){
      state.pendingWhatsAppBatch = state.notificationBatches.find(batch => batch.status === "opened") || null;
    }
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
      state._unsub = state.store.onChange(scheduleRemoteLoad);
      showSchemaBanner();
      updateModeBadge();
      return load(isRemotePush);   // reintenta con local
    }
    state.loadError = cat.message;
  }
  await loadCalendarReservations(!isRemotePush);
  await reconcileCalendarNotifications();
  await reconcileCalendarCleanings();
  render();
  updateUndoBtn();
  updateWaLastBtn();
}

async function loadCalendarReservations(force=false){
  if (!state.calendarSource) return;
  try{
    const calendar = await state.calendarSource.load({ force });
    state.calendarReservations = calendarRangesToRentals(calendar);
    state.calendarStatus = {
      status: calendar.status,
      fromCache: calendar.fromCache,
      error: calendar.error,
      lastSuccessfulSyncAt: calendar.lastSuccessfulSyncAt,
    };
  }catch(error){
    state.calendarStatus = {
      status: "unavailable",
      fromCache: false,
      error: error?.name === "AbortError" ? "Tiempo de espera agotado" : String(error?.message || error),
      lastSuccessfulSyncAt: null,
    };
  }
}

async function reconcileCalendarNotifications(){
  if (state.notificationReconciling || state.calendarStatus.status !== "live") return;
  state.notificationReconciling = true;
  try{
    const plan = planNotificationReconciliation(state.notifications, state.calendarReservations);
    for (const notification of plan.upserts){
      await state.store.upsertNotification(notification);
      const index = state.notifications.findIndex(item => item.reservation_id === notification.reservation_id);
      if (index >= 0) state.notifications[index] = notification;
      else state.notifications.push(notification);
    }
    for (const descriptor of plan.events){
      const event = { id: uuid(), ...descriptor, batch_id: null, created_at: new Date().toISOString() };
      await state.store.addNotificationEvent(event);
      state.notificationEvents.unshift(event);
    }
  }catch(error){
    console.error("No se pudo reconciliar la memoria de Beatriz:", categorizeError(error));
    state.loadError = "No se pudo actualizar la memoria compartida de avisos";
  }finally{
    state.notificationReconciling = false;
  }
}

async function reconcileCalendarCleanings(){
  if (state.calendarStatus.status !== "live") return;
  try{
    const eligible = calendarReservationsWithoutManualDuplicates(state.calendarReservations, state.rentals);
    const eligibleIds = new Set(eligible.map(rental => rental.reservationId));
    const suppressedReservationIds = state.calendarReservations
      .filter(rental => !eligibleIds.has(rental.reservationId))
      .map(rental => rental.reservationId);
    const plan = planCalendarCleaningReconciliation(
      state.cleanings,
      eligible,
      state.notifications,
      { suppressedReservationIds },
    );
    for (const cleaning of plan.upserts){
      await state.store.upsertCleaning(cleaning);
      const index = state.cleanings.findIndex(item => item.id === cleaning.id);
      if (index >= 0) state.cleanings[index] = cleaning;
      else state.cleanings.push(cleaning);
    }
  }catch(error){
    console.error("No se pudieron reconciliar las limpiezas sincronizadas:", categorizeError(error));
    state.loadError = "No se pudieron actualizar las tareas automáticas de limpieza";
  }
}

function notificationForReservation(reservationId){
  return state.notifications.find(item => item.reservation_id === reservationId) || null;
}

function activeNotificationRentals({ includeConfirmed=false } = {}){
  return state.calendarReservations.filter(rental => {
    const notification = notificationForReservation(rental.reservationId);
    if (!notification?.is_active) return false;
    return includeConfirmed
      ? ["pending", "opened", "confirmed", "needs_update"].includes(notification.status)
      : isNotificationActionable(notification);
  }).sort((left, right) =>
    left.checkin_date.localeCompare(right.checkin_date) || left.checkout_date.localeCompare(right.checkout_date)
  );
}

async function refreshCalendarAndNotifications({ announce=false } = {}){
  if (state.calendarSyncing) return;
  state.calendarSyncing = true;
  updateCalendarBadge();
  try{
    await loadCalendarReservations(true);
    await reconcileCalendarNotifications();
    await reconcileCalendarCleanings();
    render();
    updateWaLastBtn();
    if (announce){
      toast(state.calendarStatus.status === "live"
        ? "Calendarios y avisos actualizados"
        : "Se conserva la última copia válida", state.calendarStatus.status === "live" ? "ok" : "warn");
    }
  }finally{
    state.calendarSyncing = false;
    updateCalendarBadge();
  }
}

function updateCalendarBadge(){
  const badge = document.getElementById("calendar-badge");
  if (!badge) return;
  const { status, fromCache } = state.calendarStatus;
  const refresh = document.getElementById("calendar-refresh");
  if (refresh){
    refresh.disabled = state.calendarSyncing;
    refresh.textContent = state.calendarSyncing ? "Actualizando…" : "↻ Actualizar";
  }
  badge.classList.toggle("live", status === "live" && !fromCache);
  badge.classList.toggle("warn", status !== "live" || fromCache);
  if (status === "live" && !fromCache){
    badge.textContent = "● Airbnb · Booking · Particular al día";
    badge.title = "Reservas sincronizadas y sanitizadas";
  } else if (status === "stale" || fromCache){
    badge.textContent = "⚠ Calendarios con última copia válida";
    badge.title = state.calendarStatus.error || "La sincronización está atrasada";
  } else if (status === "loading"){
    badge.textContent = "○ Cargando calendarios…";
  } else {
    badge.textContent = "⚠ Calendarios no disponibles";
    badge.title = state.calendarStatus.error || "No se pudo consultar la disponibilidad";
  }
}

// Refresca el badge de modo cuando el store cambia de identidad.
function updateModeBadge(){
  const badge = document.getElementById("mode-badge");
  if (!badge) return;
  const isLive = state.store?.kind === "supabase" && !state._demoted && !state.schemaMissing;
  badge.classList.toggle("live", isLive);
  badge.classList.toggle("warn", !isLive);
  badge.textContent = (state.schemaMissing
    ? "⚠ Faltan tablas en la nube"
    : isLive
      ? "● Modo live · sincronizado"
      : "⚠ Modo local · cambios en cola") + "  ·  v" + VERSION;
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
    clearInterval(state.calendarRefreshHandle);
    state.calendarRefreshHandle = setInterval(() => {
      if (document.visibilityState === "visible") refreshCalendarAndNotifications();
    }, CONFIG.calendarRefreshMs);

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
  return rentalsForDisplay().filter(r =>
    r.id !== ignoreRentalId
    && r.status !== "cancelled"
    && r.checkin_date < checkoutIso
    && r.checkout_date > checkinIso
  );
}

// ---------- Render ----------
function render(){
  renderNav();
  renderLegend();
  renderHint();
  renderGrid();
  renderBrushBar();
  updateCalendarBadge();
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

// ---------- Undo (pila de inversas, máx 7) ----------
function pushUndo(entry){
  state.undo.push(entry);
  if (state.undo.length > UNDO_LIMIT) state.undo.shift();
  updateUndoBtn();
}

function updateUndoBtn(){
  const btn = document.getElementById("undo");
  if (!btn) return;
  const n = state.undo.length;
  btn.disabled = n === 0;
  btn.textContent = n > 0 ? `↩ Deshacer (${n})` : "↩ Deshacer";
  btn.title = n > 0
    ? `Deshacer: ${state.undo[n-1].label || "última acción"}`
    : "No hay nada que deshacer";
}

async function doUndo(){
  const entry = state.undo.pop();
  if (!entry) return;
  const btn = document.getElementById("undo");
  btn.disabled = true;
  try{
    if (entry.op === "create"){
      // La acción fue CREAR un arriendo → deshacer borrándolo
      for (const r of entry.rentals || []){
        await state.store.removeRental(r.id);
      }
      for (const c of entry.cleanings || []){
        if (c && c.id) await state.store.removeCleaning(c.id);
      }
    } else if (entry.op === "update"){
      // La acción fue EDITAR → restaurar estado anterior del rental.
      // Si había cleaning previa, restaurarla; si el edit generó una nueva, borrarla.
      if (entry.prevRental){
        await state.store.upsertRental(entry.prevRental);
      }
      if (entry.prevCleaning){
        await state.store.upsertCleaning(entry.prevCleaning);
      } else if (entry.newCleaningId){
        await state.store.removeCleaning(entry.newCleaningId);
      }
    } else if (entry.op === "cancel"){
      // La acción fue CANCELAR → re-activar rental y cleanings
      if (entry.rental){
        await state.store.upsertRental({ ...entry.rental, status: "scheduled" });
      }
      for (const c of entry.cleanings || []){
        const prev = c._prevStatus || "pending";
        const { _prevStatus, ...clean } = c;   // strip helper field
        await state.store.upsertCleaning({ ...clean, status: prev });
      }
    }
    await load();
    toast("✓ Deshecho");
  }catch(err){
    // Devolver la entry a la pila si falló
    state.undo.push(entry);
    toast("No se pudo deshacer: " + (err.message || err), "err");
  } finally {
    updateUndoBtn();
  }
}
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
    ? `Check-in ${prettyShort(b.start)} ${CHECKIN_TIME} → Check-out ${prettyShort(b.end)} ${CHECKOUT_TIME}`
    : `Check-in ${prettyShort(b.start)} ${CHECKIN_TIME} · toca el día de salida`;
  bar.querySelector(".bb-range").textContent = range;
  bar.querySelector("#brush-confirm").disabled = !b.end;
  bar.querySelector("#brush-details").disabled = !b.end;
  bar.querySelector("#brush-wa").disabled = !b.end || !state.admin;
}

// Confirmar el brush. Si `withWhatsApp` es true, abre WhatsApp a Beatriz
// además del toast normal (atajo del botón "📱 Crear y avisar").
async function confirmBrush(withWhatsApp=false){
  const b = state.brush;
  if (!b.start || !b.end) return;
  if (b.end <= b.start){
    toast("La salida debe ser posterior a la llegada", "warn");
    return;
  }
  const overlaps = findOverlapping(b.start, b.end);
  if (overlaps.length){
    toast("Ese período ya aparece como reservado", "warn");
    return;
  }
  const rental = {
    id: uuid(),
    source: "direct",
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
    pushUndo({
      op: "create",
      rentals: [rental],
      cleanings: [state.cleanings.find(c => c.rental_id === rental.id)].filter(Boolean),
      label: `Reserva ${rental.checkin_date} → ${rental.checkout_date}`,
    });
    b.start = null; b.end = null;
    render();

    if (state.admin && CONFIG.beatrizWhatsApp){
      // Ofrecer enviar a Beatriz. Si withWhatsApp=true, abrir WhatsApp
      // directo sin preguntar (atajo del botón "📱 Crear y avisar").
      toast("✓ Reserva creada", "ok", 6000, [
        { label: "📱 Enviar a Beatriz", action: () => openWhatsApp(rental) },
        { label: "OK", action: null },
      ]);
      if (withWhatsApp){
        // Pequeño delay para que el toast se muestre antes de abrir el popup
        setTimeout(() => openWhatsApp(rental), 400);
      }
    } else {
      toast("✓ Reserva creada");
    }
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
        toast("✓ Reserva guardada en modo local", "warn");
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
  el.hidden = false;
  el.innerHTML = `<span class="chip reservation-legend"><span class="legend-tones"><span class="dot" style="background:${CONFIG.reservationTones[0]}"></span><span class="dot" style="background:${CONFIG.reservationTones[1]}"></span></span>Reservas · tonos alternados</span>`;
}

function renderHint(){
  const el = document.getElementById("hint-bar");
  if (state.admin){
    if (!state.brush.start){
      el.textContent = `Modo admin · toca un día para marcar check-in ${CHECKIN_TIME} · toca otro día para check-out ${CHECKOUT_TIME}`;
    } else if (state.brush.start && !state.brush.end){
      el.textContent = `Toca el día de check-out (${CHECKOUT_TIME})`;
    } else {
      el.textContent = "Listo · confirma la reserva o agrega detalles";
    }
  } else {
    el.textContent = "Toca una reserva para ver fechas · el ticket de salida corresponde a una limpieza operativa";
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
  const displayRentals = rentalsForDisplay();
  const toneMap = buildReservationToneMap(displayRentals);

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

    const dayRentals = displayRentals
      .filter(r => r.status !== "cancelled"
                && r.checkin_date <= dateStr
                && r.checkout_date >= dateStr)
      .sort(compareReservations);

    if (dayRentals.length){
      cell.classList.add("occupied");
      cell.classList.add(`lanes-${Math.min(dayRentals.length, CONFIG.maxLanes)}`);
      cell.style.setProperty("--fill-color", reservationTone(dayRentals[0], toneMap).color);
    }

    const segs = document.createElement("div");
    segs.className = "segments";
    dayRentals.slice(0, CONFIG.maxLanes).forEach(r => {
      const meta = sourceMeta(r.source);
      const tone = reservationTone(r, toneMap);
      const isStart = r.checkin_date === dateStr;
      const isEnd   = r.checkout_date === dateStr;
      const cls = ["seg", isStart && "start", isEnd && "end",
                   (isStart && isEnd) && "pill", `reservation-tone-${tone.index + 1}`].filter(Boolean).join(" ");
      const seg = document.createElement("div");
      seg.className = cls;
      seg.style.background = tone.color;
      const kind = document.createElement("span");
      kind.className = "seg-kind";
      kind.textContent = isStart ? "Check-in" : isEnd ? "Check-out" : "Reserva";
      seg.appendChild(kind);
      if (isStart || isEnd){
        const time = document.createElement("span");
        time.className = "seg-time";
        time.textContent = isStart ? CHECKIN_TIME : CHECKOUT_TIME;
        seg.appendChild(time);
      }
      seg.setAttribute("aria-label", isStart
        ? `Check-in ${CHECKIN_TIME}`
        : isEnd ? `Check-out ${CHECKOUT_TIME}` : "Reserva en curso");
      seg.dataset.id = r.id;
      seg.title = `${meta.name} · ${r.checkin_date} ${CHECKIN_TIME} → ${r.checkout_date} ${CHECKOUT_TIME}${!r.readOnly && r.guest_name ? " · " + r.guest_name : ""}`;
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

    // Cada reserva genera automáticamente su confirmación de aseo en checkout.
    const endingRentals = displayRentals.filter(r =>
      r.status !== "cancelled" && r.checkout_date === dateStr
    );
    if (endingRentals.length){
      const tickets = document.createElement("div");
      tickets.className = "cell-tickets";
      for (const rental of endingRentals){
        const c = cleaningForRental(rental);
        if (!c || c.status === "cancelled") continue;
        const ticket = document.createElement("button");
        ticket.type = "button";
        ticket.className = `cell-ticket ${c.status === "done" ? "done" : "pending"}`;
        ticket.dataset.cleaningId = c.id;
        // Sin texto. Sin icono. La forma y el color hacen todo el trabajo.
        // El aria-label y el title dan contexto a SR y tooltip.
        const dates = `${prettyShort(rental.checkin_date)} al ${prettyShort(rental.checkout_date)}`;
        ticket.setAttribute("aria-label", c.status === "done"
          ? `Aseo de la reserva ${dates} listo. Tocar para deshacer.`
          : `Confirmar que el aseo de la reserva ${dates} está listo.`);
        ticket.title = c.status === "done"
          ? `Tarea del ${prettyShort(c.scheduled_date)} hecha — tocar para deshacer`
          : `Tocar para marcar la tarea del ${prettyShort(c.scheduled_date)} como hecha`;
        ticket.addEventListener("click", e => { e.stopPropagation(); onTicketTap(c, ticket); });
        tickets.appendChild(ticket);
      }
      if (tickets.children.length) cell.appendChild(tickets);
    }

    grid.appendChild(cell);
  }
}

// ---------- Popover ----------
function openPopover(r, anchor){
  const pop = document.getElementById("pop");
  const meta = sourceMeta(r.source);
  const c0 = cleaningForRental(r);
  const cleaningLine = c0
    ? `<div class="prow"><span>Tarea</span><b>${escapeHtml(prettyShort(c0.scheduled_date))} · ${escapeHtml(c0.status)}</b></div>`
    : r.readOnly
      ? `<div class="prow"><span>Limpieza</span><b>Coordinar para la salida</b></div>`
      : "";

  // Acciones solo visibles en admin. El botón de WhatsApp es el más visible
  // (verde) y va primero porque es la acción más común al crear.
  const adminActions = state.admin ? `
    <div class="pactions">
      <button class="pbtn wa-btn" data-act="whatsapp">📱 Preparar mensaje a Beatriz</button>
      ${r.readOnly ? "" : `<button class="pbtn" data-act="edit">Editar</button>
      <button class="pbtn danger" data-act="cancel">Cancelar reserva</button>`}
    </div>
  ` : "";

  pop.innerHTML = `
    <div class="ptitle">
      <span class="dot" style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${meta.color};margin-right:6px"></span>
      ${escapeHtml(meta.name)}${!r.readOnly && r.reference ? ` · ${escapeHtml(r.reference)}` : ""}
    </div>
    <div class="prow"><span>Check-in</span><b>${escapeHtml(prettyShort(r.checkin_date))} ${CHECKIN_TIME}</b></div>
    <div class="prow"><span>Check-out</span><b>${escapeHtml(prettyShort(r.checkout_date))} ${CHECKOUT_TIME}</b></div>
    ${!r.readOnly && r.guest_name ? `<div class="prow"><span>Huesped</span><b>${escapeHtml(r.guest_name)}</b></div>` : ""}
    ${cleaningLine}
    ${!r.readOnly && r.notes ? `<div class="prow"><span>Nota</span><b>${escapeHtml(r.notes)}</b></div>` : ""}
    ${adminActions}
  `;
  pop.hidden = false;
  positionPopover(pop, anchor);

  if (state.admin){
    pop.querySelectorAll(".pbtn").forEach(btn => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.act;
        if (act === "edit"){
          if (r.readOnly) return;
          pop.hidden = true;
          openRentalForm(r);
        } else if (act === "cancel"){
          if (r.readOnly) return;
          pop.hidden = true;
          confirmCancelRental(r);
        } else if (act === "whatsapp"){
          if (r.readOnly) openNotificationWhatsApp([r], "individual");
          else openWhatsApp(r);
        }
      });
    });
  }
}

// ---------- WhatsApp a Beatriz (solo en admin mode) ----------
// Construye el mensaje pre-rellenado y abre wa.me en nueva pestaña.
// El admin puede editar el mensaje en WhatsApp antes de enviar.
// Si el número no está configurado, muestra un toast y no abre nada.
function buildWhatsAppMessage(r){
  return [
    "Hola Beatriz, espero que estés bien. Te aviso de una reserva confirmada en el departamento de Chillán.",
    "",
    `• Check-in: ${prettyShort(r.checkin_date)} · ${CHECKIN_TIME}`,
    `• Check-out: ${prettyShort(r.checkout_date)} · ${CHECKOUT_TIME}`,
    `• Limpieza: ${prettyShort(r.checkout_date)} desde las ${CHECKOUT_TIME}`,
    "",
    "¿Puedes confirmarme si tienes disponibilidad para realizar la limpieza de salida? Gracias.",
  ].join("\n");
}

function buildGroupedWhatsAppMessage(rentals){
  const lines = [
    "Hola Beatriz, espero que estés bien. Te aviso de las próximas reservas confirmadas en el departamento de Chillán:",
    "",
  ];
  rentals.forEach((rental, index) => {
    lines.push(`${index + 1}. Check-in ${prettyShort(rental.checkin_date)} ${CHECKIN_TIME} → Check-out ${prettyShort(rental.checkout_date)} ${CHECKOUT_TIME}`);
    lines.push(`   Limpieza: ${prettyShort(rental.checkout_date)} desde las ${CHECKOUT_TIME}`);
  });
  lines.push("", "¿Puedes confirmarme tu disponibilidad para estas limpiezas de salida? Gracias.");
  return lines.join("\n");
}

function buildNotificationMessages(rentals, mode){
  const sorted = [...rentals].sort((left, right) =>
    left.checkin_date.localeCompare(right.checkin_date) || left.checkout_date.localeCompare(right.checkout_date)
  );
  if (mode === "grouped"){
    return [{ reservationIds: sorted.map(rental => rental.reservationId), text: buildGroupedWhatsAppMessage(sorted) }];
  }
  return sorted.map(rental => ({ reservationIds: [rental.reservationId], text: buildWhatsAppMessage(rental) }));
}

async function persistNotificationEvent(descriptor, batchId=null){
  const event = { id: uuid(), ...descriptor, batch_id: batchId, created_at: new Date().toISOString() };
  await state.store.addNotificationEvent(event);
  state.notificationEvents.unshift(event);
}

async function recordNotificationBatchOpened(rentals, mode){
  const nowIso = new Date().toISOString();
  const reservationIds = rentals.map(rental => rental.reservationId);
  const batch = {
    id: uuid(),
    mode,
    reservation_ids: reservationIds,
    status: "opened",
    opened_at: nowIso,
    resolved_at: null,
    created_at: nowIso,
    updated_at: nowIso,
  };
  await state.store.upsertNotificationBatch(batch);
  state.notificationBatches.unshift(batch);
  for (const rental of rentals){
    const previous = notificationForReservation(rental.reservationId);
    if (!previous) continue;
    const updated = {
      ...previous,
      status: "opened",
      opened_at: nowIso,
      confirmed_at: null,
      last_batch_id: batch.id,
      updated_at: nowIso,
    };
    await state.store.upsertNotification(updated);
    const index = state.notifications.findIndex(item => item.reservation_id === updated.reservation_id);
    state.notifications[index] = updated;
    await persistNotificationEvent({
      reservation_id: updated.reservation_id,
      event_type: "opened",
      previous_status: previous.status,
      next_status: "opened",
      checkin_date: updated.checkin_date,
      checkout_date: updated.checkout_date,
    }, batch.id);
  }
  state.pendingWhatsAppBatch = batch;
  updateWaLastBtn();
  if (!document.getElementById("beatriz-modal")?.hidden) renderBeatrizInbox();
  return batch;
}

async function openNotificationWhatsApp(rentals, mode="individual"){
  if (!state.admin) return;
  const phone = (CONFIG.beatrizWhatsApp || "").replace(/[^\d]/g, "");
  if (!phone || !rentals.length) return;
  const message = mode === "grouped" ? buildGroupedWhatsAppMessage(rentals) : buildWhatsAppMessage(rentals[0]);
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
  const win = window.open(url, "_blank", "noopener");
  haptic([10, 20, 10]);

  const rememberOpened = async () => {
    try{
      await recordNotificationBatchOpened(rentals, mode);
      toast("WhatsApp abierto · al volver confirma si lo enviaste", "ok", 6000);
    }catch(error){
      console.error("No se pudo guardar la apertura de WhatsApp:", error);
      toast("WhatsApp se abrió, pero no se pudo guardar el estado", "warn", 7000);
    }
  };

  if (!win || win.closed){
    toast("⚠ Toca el enlace para abrir WhatsApp", "warn", 15000);
    setTimeout(() => {
      const toastEl = document.getElementById("toast");
      if (!toastEl) return;
      const link = document.createElement("a");
      link.href = url;
      link.target = "_blank";
      link.rel = "noopener";
      link.className = "toast-link";
      link.textContent = "👉 Abrir WhatsApp";
      link.addEventListener("click", rememberOpened, { once: true });
      toastEl.innerHTML = '<span class="toast-msg">La ventana emergente fue bloqueada.</span>';
      toastEl.appendChild(link);
      toastEl.classList.add("has-actions");
    }, 100);
    return;
  }
  await rememberOpened();
}

function openWhatsApp(rental){
  if (!state.admin) return;   // guard: aunque alguien fuerce el botón
  const phone = (CONFIG.beatrizWhatsApp || "").replace(/[^\d]/g, "");
  if (!phone){
    toast("Configurá el número de Beatriz en app.js (CONFIG.beatrizWhatsApp)", "warn");
    return;
  }
  const msg = buildWhatsAppMessage(rental);
  const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;

  // Intentar abrir popup. Si el browser lo bloquea, mostrar fallback con
  // link clickeable (muchos browsers bloquean popups en iframes / mobile).
  const win = window.open(url, "_blank", "noopener");
  haptic([10, 20, 10]);

  if (!win || win.closed){
    // Popup bloqueado. Mostrar toast con link de fallback.
    const fallback = document.createElement("div");
    fallback.className = "toast-msg";
    fallback.textContent = "Tu navegador bloqueó la ventana emergente.";
    const link = document.createElement("a");
    link.href = url;
    link.target = "_blank";
    link.rel = "noopener";
    link.className = "toast-link";
    link.textContent = "👉 Tocá acá para abrir WhatsApp";
    toast("⚠ Popup bloqueado", "warn", 10000);
    // Reemplazar el contenido del toast con fallback clickeable
    setTimeout(() => {
      const t = document.getElementById("toast");
      if (!t) return;
      t.innerHTML = "";
      t.appendChild(fallback);
      t.appendChild(link);
      t.classList.add("has-actions");
      // Auto-dismiss más largo para dar tiempo a hacer clic
      clearTimeout(t._h);
      t._h = setTimeout(hideToast, 15000);
    }, 100);
  } else {
    toast("📱 Abriendo WhatsApp en nueva pestaña…", "ok", 3000);
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

// Próxima estadía que necesita coordinación. Incluye las reservas sanitizadas
// de Airbnb, Booking y particulares, sin revelar cuál fue su origen.
function nextReservationForWhatsApp(){
  const today = todayIso();
  const activeOrFuture = rentalsForDisplay()
    .filter(r => r.status !== "cancelled" && r.checkout_date >= today)
    .sort((a,b) =>
      a.checkin_date.localeCompare(b.checkin_date) || a.checkout_date.localeCompare(b.checkout_date)
    );
  if (activeOrFuture.length) return activeOrFuture[0];
  return [...state.rentals]
    .filter(r => r.status !== "cancelled")
    .sort((a,b) => (b.created_at || "").localeCompare(a.created_at || ""))[0] || null;
}

// Actualiza el estado del botón "📱 Último" (admin-only).
function updateWaLastBtn(){
  const btn = document.getElementById("wa-last");
  if (!btn) return;
  const pending = activeNotificationRentals().length;
  const opened = state.admin
    ? state.notifications.filter(item => item.is_active && item.status === "opened").length
    : 0;
  btn.disabled = pending + opened === 0;
  btn.textContent = pending ? `📱 Beatriz · ${pending}` : opened ? `📱 Confirmar · ${opened}` : "📱 Beatriz";
  btn.title = pending
    ? `${pending} reserva${pending === 1 ? "" : "s"} pendiente${pending === 1 ? "" : "s"} de aviso`
    : opened ? "Hay mensajes abiertos por confirmar" : "No hay avisos pendientes";
}

function planBatchResolution(notifications, batch, sent, nowIso = new Date().toISOString()){
  const updates = [];
  const events = [];
  for (const previous of notifications || []){
    if (previous.last_batch_id !== batch.id) continue;
    const nextStatus = previous.status === "needs_update"
      ? "needs_update"
      : sent ? "confirmed" : "pending";
    const updated = {
      ...previous,
      status: nextStatus,
      confirmed_at: sent && nextStatus === "confirmed" ? nowIso : null,
      updated_at: nowIso,
    };
    updates.push(updated);
    events.push({
      reservation_id: previous.reservation_id,
      event_type: sent ? "confirmed" : "kept_pending",
      previous_status: previous.status,
      next_status: nextStatus,
      checkin_date: previous.checkin_date,
      checkout_date: previous.checkout_date,
    });
  }
  return {
    batch: { ...batch, status: sent ? "confirmed" : "not_confirmed", resolved_at: nowIso, updated_at: nowIso },
    updates,
    events,
  };
}

async function resolveNotificationBatch(batch, sent){
  if (!batch) return;
  const plan = planBatchResolution(state.notifications, batch, sent);
  await state.store.upsertNotificationBatch(plan.batch);
  const batchIndex = state.notificationBatches.findIndex(item => item.id === batch.id);
  if (batchIndex >= 0) state.notificationBatches[batchIndex] = plan.batch;
  for (const updated of plan.updates){
    await state.store.upsertNotification(updated);
    const index = state.notifications.findIndex(item => item.reservation_id === updated.reservation_id);
    state.notifications[index] = updated;
  }
  for (const event of plan.events) await persistNotificationEvent(event, batch.id);
  if (state.pendingWhatsAppBatch?.id === batch.id) state.pendingWhatsAppBatch = null;
  closeWhatsAppConfirmation();
  renderBeatrizInbox();
  updateWaLastBtn();
  toast(sent ? "Envío confirmado y guardado" : "El aviso sigue pendiente", sent ? "ok" : "warn");
}

async function correctNotificationConfirmation(reservationId){
  const previous = notificationForReservation(reservationId);
  if (!previous || previous.status !== "confirmed") return;
  const nowIso = new Date().toISOString();
  const updated = { ...previous, status: "pending", confirmed_at: null, last_batch_id: null, updated_at: nowIso };
  await state.store.upsertNotification(updated);
  state.notifications[state.notifications.findIndex(item => item.reservation_id === reservationId)] = updated;
  await persistNotificationEvent({
    reservation_id: reservationId,
    event_type: "confirmation_corrected",
    previous_status: "confirmed",
    next_status: "pending",
    checkin_date: updated.checkin_date,
    checkout_date: updated.checkout_date,
  });
  renderBeatrizInbox();
  updateWaLastBtn();
}

function showWhatsAppConfirmation(batch){
  if (!state.admin || !batch) return;
  const modal = document.getElementById("whatsapp-confirm-modal");
  const rentals = batch.reservation_ids
    .map(id => state.calendarReservations.find(rental => rental.reservationId === id))
    .filter(Boolean);
  document.getElementById("whatsapp-confirm-summary").innerHTML = rentals.length
    ? rentals.map(rental => `<li>${escapeHtml(prettyShort(rental.checkin_date))} → ${escapeHtml(prettyShort(rental.checkout_date))}</li>`).join("")
    : "<li>Reserva sincronizada</li>";
  modal.dataset.batchId = batch.id;
  modal.hidden = false;
}

function closeWhatsAppConfirmation(){
  const modal = document.getElementById("whatsapp-confirm-modal");
  if (!modal) return;
  modal.hidden = true;
  delete modal.dataset.batchId;
}

function maybeShowWhatsAppConfirmation(){
  if (!state.admin) return;
  const batch = state.pendingWhatsAppBatch;
  if (!batch || batch.status !== "opened") return;
  if (Date.now() - new Date(batch.opened_at).getTime() < 700) return;
  showWhatsAppConfirmation(batch);
}

function openBeatrizInbox(){
  state.inboxSelection = state.admin
    ? new Set(activeNotificationRentals().map(rental => rental.reservationId))
    : new Set();
  state.separateQueue = [];
  document.getElementById("beatriz-modal").hidden = false;
  renderBeatrizInbox();
}

function closeBeatrizInbox(){
  document.getElementById("beatriz-modal").hidden = true;
  state.separateQueue = [];
}

function renderBeatrizInbox(){
  const modal = document.getElementById("beatriz-modal");
  if (!modal || modal.hidden) return;
  const canManage = state.admin;
  const list = document.getElementById("beatriz-list");
  const includeConfirmedControl = document.getElementById("beatriz-include-confirmed");
  const includeConfirmed = canManage && !!includeConfirmedControl?.checked;
  modal.querySelectorAll("[data-beatriz-admin]").forEach(control => { control.hidden = !canManage; });
  if (!canManage){
    state.inboxSelection.clear();
    state.separateQueue = [];
    if (includeConfirmedControl) includeConfirmedControl.checked = false;
  }
  const rentals = state.calendarReservations
    .map(rental => ({ rental, notification: notificationForReservation(rental.reservationId) }))
    .filter(item => isNotificationVisibleForRole(item.notification, canManage))
    .sort((left, right) => left.rental.checkin_date.localeCompare(right.rental.checkin_date));
  const actionableCount = rentals.filter(item => isNotificationActionable(item.notification)).length;
  const openedCount = rentals.filter(item => item.notification.status === "opened").length;
  document.getElementById("beatriz-summary").textContent = !canManage
    ? actionableCount
      ? `${actionableCount} reserva${actionableCount === 1 ? "" : "s"} pendiente${actionableCount === 1 ? "" : "s"} de aviso. Solo el administrador puede preparar mensajes.`
      : "No hay avisos pendientes."
    : actionableCount
      ? `${actionableCount} reserva${actionableCount === 1 ? "" : "s"} pendiente${actionableCount === 1 ? "" : "s"} de aviso.`
      : openedCount ? `${openedCount} mensaje${openedCount === 1 ? "" : "s"} por confirmar.` : "No hay avisos pendientes.";

  list.innerHTML = rentals.length ? rentals.map(({ rental, notification }) => {
    const selectable = canManage && (isNotificationActionable(notification) || (includeConfirmed && notification.status === "confirmed"));
    const checked = state.inboxSelection.has(rental.reservationId);
    return `
      <article class="beatriz-row status-${escapeHtml(notification.status)}">
        <label class="beatriz-select">
          ${selectable ? `<input type="checkbox" data-reservation-id="${escapeHtml(rental.reservationId)}" ${checked ? "checked" : ""}>` : '<span class="selection-placeholder"></span>'}
          <span>
            <strong>Check-in ${escapeHtml(prettyShort(rental.checkin_date))} ${CHECKIN_TIME} → Check-out ${escapeHtml(prettyShort(rental.checkout_date))} ${CHECKOUT_TIME}</strong>
            <small>Limpieza desde las ${CHECKOUT_TIME}</small>
          </span>
        </label>
        <div class="beatriz-row-state">
          <span class="notification-status">${escapeHtml(NOTIFICATION_LABELS[notification.status] || notification.status)}</span>
          ${canManage && notification.status === "opened" ? `<button class="pbtn" data-act="confirm-opened" data-batch-id="${escapeHtml(notification.last_batch_id || "")}">Confirmar envío</button>` : ""}
          ${canManage && notification.status === "confirmed" ? `<button class="pbtn ghost" data-act="correct" data-reservation-id="${escapeHtml(rental.reservationId)}">Corregir</button>` : ""}
        </div>
      </article>`;
  }).join("") : '<p class="empty-row">Aún no hay reservas sincronizadas para coordinar.</p>';

  const selected = canManage
    ? [...state.inboxSelection].filter(id => rentals.some(item => item.rental.reservationId === id))
    : [];
  const prepare = document.getElementById("beatriz-prepare");
  prepare.disabled = selected.length === 0;
  prepare.textContent = selected.length ? `Preparar ${selected.length} aviso${selected.length === 1 ? "" : "s"}` : "Selecciona reservas";

  const queue = document.getElementById("beatriz-separate-queue");
  if (canManage && state.separateQueue.length){
    queue.hidden = false;
    queue.innerHTML = `<strong>Mensajes separados</strong>${state.separateQueue.map(id => {
      const rental = state.calendarReservations.find(item => item.reservationId === id);
      return rental ? `<button class="btn wa-btn" data-act="open-separate" data-reservation-id="${escapeHtml(id)}">📱 Abrir ${escapeHtml(prettyShort(rental.checkin_date))} → ${escapeHtml(prettyShort(rental.checkout_date))}</button>` : "";
    }).join("")}`;
  } else {
    queue.hidden = true;
    queue.innerHTML = "";
  }
}

// ---------- Modal: lista de reservas (admin only) ----------
// Vista completa para editar / cancelar / avisar cualquier reserva.
function openRentalsList(){
  const modal = document.getElementById("list-modal");
  const list  = document.getElementById("rentals-list");
  // Orden: próximas primero; las sincronizadas son de solo lectura.
  const rentals = rentalsForDisplay().sort((a,b) =>
    a.checkin_date.localeCompare(b.checkin_date) || a.checkout_date.localeCompare(b.checkout_date)
  );
  if (!rentals.length){
    list.innerHTML = `<p class="empty-row">No hay reservas. Crea una reserva o revisa la conexión de calendarios.</p>`;
  } else {
    list.innerHTML = rentals.map(r => {
      const meta = sourceMeta(r.source);
      const c0 = cleaningForRental(r);
      const statusBadge = r.status === "cancelled"
        ? `<span class="rl-badge cancelled">cancelado</span>`
        : c0
          ? `<span class="rl-badge ${c0.status}">${c0.status}</span>`
          : "";
      return `
        <div class="rental-row${r.status === "cancelled" ? " is-cancelled" : ""}" data-id="${r.id}">
          <div class="rl-info">
            <span class="rl-dot" style="background:${meta.color}"></span>
            <span class="rl-dates"><strong>${escapeHtml(prettyShort(r.checkin_date))}</strong> ${CHECKIN_TIME} → <strong>${escapeHtml(prettyShort(r.checkout_date))}</strong> ${CHECKOUT_TIME}</span>
            ${r.guest_name ? `<span class="rl-meta">· ${escapeHtml(r.guest_name)}</span>` : ""}
            ${r.reference ? `<span class="rl-meta">· ${escapeHtml(r.reference)}</span>` : ""}
            ${r.readOnly ? `<span class="rl-badge synced">Reserva · sincronizada</span>` : ""}
            ${statusBadge}
          </div>
          <div class="rl-actions">
            ${r.readOnly ? "" : `<button class="pbtn" data-act="edit" data-id="${r.id}" title="Editar">✏️ Editar</button>`}
            <button class="pbtn wa-btn" data-act="whatsapp" data-id="${r.id}" title="Preparar mensaje para Beatriz">📱 Avisar</button>
            ${!r.readOnly && r.status !== "cancelled" ? `<button class="pbtn danger" data-act="cancel" data-id="${r.id}" title="Cancelar reserva">Cancelar</button>` : ""}
          </div>
        </div>
      `;
    }).join("");
  }
  // Wire up actions
  list.querySelectorAll(".rl-actions button").forEach(btn => {
    btn.addEventListener("click", () => {
      const r = rentalsForDisplay().find(x => x.id === btn.dataset.id);
      if (!r) return;
      const act = btn.dataset.act;
      if (act === "edit"){
        if (r.readOnly) return;
        modal.hidden = true;
        openRentalForm(r);
      } else if (act === "whatsapp"){
        if (r.readOnly) openNotificationWhatsApp([r], "individual");
        else openWhatsApp(r);
      } else if (act === "cancel"){
        if (r.readOnly) return;
        modal.hidden = true;
        confirmCancelRental(r);
      }
    });
  });
  modal.hidden = false;
}
function closeRentalsList(){
  document.getElementById("list-modal").hidden = true;
}

// ---------- Modal: nueva / editar reserva ----------
function openRentalForm(rental=null, checkin=null, checkout=null){
  if (!state.admin) return;   // guard: solo admin
  const isEdit = !!rental;
  state.modal = { kind: "rental", rental };
  document.getElementById("rental-title").textContent = isEdit ? "Editar reserva" : "Nueva reserva";
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
  document.getElementById("r-save").textContent = isEdit ? "Guardar cambios" : "Guardar reserva";

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
  if (co <= ci){ document.getElementById("r-hint").textContent = "⚠ Check-out debe ser posterior al check-in."; return; }
  const overlaps = findOverlapping(ci, co, m.rental?.id || null);
  if (overlaps.length){
    document.getElementById("r-hint").textContent = "⚠ Ese período ya aparece como reservado en el calendario.";
    return;
  }

  const data = {
    source:       "direct",   // valor interno; el display siempre dice "Reserva"
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

    // Push undo (solo en edit, donde podemos restaurar el estado previo)
    if (isEdit){
      const prevCleaning = state.cleanings.find(c => c.rental_id === rentalId);
      pushUndo({
        op: "update",
        prevRental: { ...m.rental },
        prevCleaning: prevCleaning ? { ...prevCleaning } : null,
        newCleaningId: null,   // se setea abajo si se regenera
        label: `Editar reserva`,
      });
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
    toast(isEdit ? "✓ Reserva actualizada" : "✓ Reserva creada");
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

// ---------- Confirmación protegida de limpieza ----------
let cleaningReadyResolver = null;
let cleaningReadyTimer = null;
let cleaningReadyRemaining = 5;
let cleaningReadyTrigger = null;

function updateCleaningReadyCountdown(){
  const card = document.querySelector("#cleaning-ready-modal .cleaning-ready-card");
  const value = document.getElementById("cleaning-countdown-value");
  const status = document.getElementById("cleaning-countdown-status");
  const confirmBtn = document.getElementById("cleaning-ready-confirm");
  const remaining = Math.max(0, cleaningReadyRemaining);
  const progress = (remaining / 5) * 360;

  card.style.setProperty("--countdown-progress", `${progress}deg`);
  value.textContent = String(remaining);
  confirmBtn.disabled = remaining > 0;
  confirmBtn.textContent = remaining > 0 ? `Confirmar en ${remaining} s` : "Sí, está todo listo";
  status.textContent = remaining > 0
    ? `Podrás confirmar en ${remaining} ${remaining === 1 ? "segundo" : "segundos"}`
    : "Ya puedes confirmar la tarea";
}

function askCleaningReady(trigger){
  if (cleaningReadyResolver) return Promise.resolve(false);
  return new Promise(resolve => {
    cleaningReadyResolver = resolve;
    cleaningReadyTrigger = trigger || document.activeElement;
    cleaningReadyRemaining = 5;
    const modal = document.getElementById("cleaning-ready-modal");
    modal.hidden = false;
    updateCleaningReadyCountdown();
    cleaningReadyTimer = setInterval(() => {
      cleaningReadyRemaining -= 1;
      updateCleaningReadyCountdown();
      if (cleaningReadyRemaining <= 0){
        clearInterval(cleaningReadyTimer);
        cleaningReadyTimer = null;
      }
    }, 1000);
    requestAnimationFrame(() => modal.querySelector(".cleaning-ready-card").focus());
  });
}

function closeCleaningReadyModal(result){
  clearInterval(cleaningReadyTimer);
  cleaningReadyTimer = null;
  document.getElementById("cleaning-ready-modal").hidden = true;
  const resolver = cleaningReadyResolver;
  cleaningReadyResolver = null;
  if (resolver) resolver(result);
  const trigger = cleaningReadyTrigger;
  cleaningReadyTrigger = null;
  if (trigger?.isConnected) requestAnimationFrame(() => trigger.focus());
}

// Pendiente → hecha requiere confirmación. Hecha → pendiente mantiene el toggle rápido.
async function onTicketTap(cleaning, trigger){
  if (cleaning.status !== "done"){
    const ready = await askCleaningReady(trigger);
    if (!ready) return;
  }
  const next = cleaning.status === "done" ? "pending" : "done";
  const updates = { ...cleaning, status: next };
  if (next === "done") updates.done_at = new Date().toISOString();
  else updates.done_at = null;
  if (trigger) trigger.disabled = true;
  try{
    await state.store.upsertCleaning(updates);
    haptic(8);
    await load();
  }catch(err){
    toast("Error: " + (err.message || err), "err");
  }finally{
    if (trigger?.isConnected) trigger.disabled = false;
  }
}

// ---------- Cancelar reserva ----------
async function confirmCancelRental(rental){
  if (!state.admin) return;
  const cs = state.cleanings.filter(c => c.rental_id === rental.id);
  let tip = `La reserva del ${prettyShort(rental.checkin_date)} al ${prettyShort(rental.checkout_date)} y su tarea asociada pasarán a estado cancelado.`;
  if (cs.length && (cs[0].status === "confirmed" || cs[0].status === "done")){
    tip += ` La tarea está ${cs[0].status === "confirmed" ? "confirmada" : "marcada como hecha"} — quedará como evidencia.`;
  }
  const ok = await askConfirm({ title: "¿Cancelar reserva?", tip, yesLabel: "Sí, cancelar" });
  if (!ok) return;
  try{
    await state.store.upsertRental({ ...rental, status: "cancelled" });
    for (const c of cs){
      await state.store.upsertCleaning({ ...c, status: "cancelled" });
    }
    await load();
    toast("✓ Reserva cancelada", "warn");
  }catch(err){
    toast("Error al cancelar: " + (err.message || err), "err");
  }
}

// ---------- Toast ----------
function toast(msg, kind="ok", ms=1800, actions=null){
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
  t.innerHTML = "";

  if (actions && actions.length){
    // Action toast: mensaje + botones. Auto-dismiss más largo (6s) para dar
    // tiempo a leer y actuar.
    t.classList.add("has-actions");
    const msgEl = document.createElement("div");
    msgEl.className = "toast-msg";
    msgEl.textContent = msg;
    t.appendChild(msgEl);
    const actionsEl = document.createElement("div");
    actionsEl.className = "toast-actions";
    actions.forEach(a => {
      const btn = document.createElement("button");
      btn.className = "toast-btn" + (a.kind ? " is-" + a.kind : "");
      btn.textContent = a.label;
      btn.addEventListener("click", () => {
        if (a.action) a.action();
        hideToast();
      });
      actionsEl.appendChild(btn);
    });
    t.appendChild(actionsEl);
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(hideToast, ms || 10000);  // 10s por default para actions
  } else {
    // Toast simple
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove("show"), ms);
  }
}

function hideToast(){
  const t = document.getElementById("toast");
  if (!t) return;
  t.classList.remove("show");
  clearTimeout(t._h);
}

// ---------- Modo admin ----------
let adminLoginTrigger = null;

function openAdminLogin(){
  const modal = document.getElementById("admin-login-modal");
  const pins = [...modal.querySelectorAll(".admin-pin")];
  adminLoginTrigger = document.activeElement;
  pins.forEach(pin => {
    pin.value = "";
    pin.classList.remove("filled", "wrong");
  });
  document.getElementById("admin-login-error").textContent = "";
  modal.hidden = false;
  requestAnimationFrame(() => pins[0].focus());
}

function closeAdminLogin(){
  document.getElementById("admin-login-modal").hidden = true;
  const trigger = adminLoginTrigger;
  adminLoginTrigger = null;
  if (trigger?.isConnected) requestAnimationFrame(() => trigger.focus());
}

function submitAdminLogin(){
  const card = document.querySelector("#admin-login-modal .admin-login-card");
  const pins = [...card.querySelectorAll(".admin-pin")];
  const code = pins.map(pin => pin.value).join("");
  if (code.length < pins.length){
    document.getElementById("admin-login-error").textContent = "Completa los cuatro dígitos";
    return;
  }
  if (code !== CONFIG.adminPin){
    document.getElementById("admin-login-error").textContent = "Clave incorrecta";
    pins.forEach(pin => pin.classList.add("wrong"));
    card.classList.remove("shake");
    void card.offsetWidth;
    card.classList.add("shake");
    setTimeout(() => {
      pins.forEach(pin => {
        pin.value = "";
        pin.classList.remove("filled", "wrong");
      });
      pins[0].focus();
    }, 500);
    return;
  }
  state.admin = true;
  closeAdminLogin();
  updateAdminUI();
  render();
  toast("Modo administrador activado");
}

function setupAdminLogin(){
  const modal = document.getElementById("admin-login-modal");
  const pins = [...modal.querySelectorAll(".admin-pin")];
  pins.forEach((pin, index) => {
    pin.addEventListener("keydown", event => {
      if (event.key === "Backspace"){
        event.preventDefault();
        if (pin.value){
          pin.value = "";
          pin.classList.remove("filled");
        } else if (index > 0){
          pins[index - 1].value = "";
          pins[index - 1].classList.remove("filled");
          pins[index - 1].focus();
        }
      } else if (/^\d$/.test(event.key)){
        event.preventDefault();
        pin.value = event.key;
        pin.classList.add("filled");
        if (index < pins.length - 1) pins[index + 1].focus();
        else submitAdminLogin();
      } else if (event.key === "Enter"){
        event.preventDefault();
        submitAdminLogin();
      }
    });
    pin.addEventListener("input", event => {
      const digits = event.target.value.replace(/\D/g, "");
      if (digits.length > 1){
        pins.forEach((item, itemIndex) => {
          item.value = digits[itemIndex] || "";
          item.classList.toggle("filled", Boolean(item.value));
        });
        if (digits.length >= pins.length) submitAdminLogin();
      } else {
        event.target.value = digits.slice(-1);
        event.target.classList.toggle("filled", Boolean(event.target.value));
        if (event.target.value && index < pins.length - 1) pins[index + 1].focus();
      }
    });
    pin.addEventListener("paste", event => {
      event.preventDefault();
      const digits = (event.clipboardData || window.clipboardData).getData("text").replace(/\D/g, "").slice(0, 4);
      pins.forEach((item, itemIndex) => {
        item.value = digits[itemIndex] || "";
        item.classList.toggle("filled", Boolean(item.value));
      });
      if (digits.length === pins.length) submitAdminLogin();
      else pins[Math.min(digits.length, pins.length - 1)].focus();
    });
  });
}

function toggleAdmin(){
  if (state.admin){
    state.admin = false;
    cancelBrush();   // limpiar selección al salir del modo admin
  } else {
    openAdminLogin();
    return;
  }
  updateAdminUI();
  render();
}
function updateAdminUI(){
  const btn = document.getElementById("admin");
  if (btn){
    if (state.admin){
      btn.textContent = "🔓 Admin activo · 📱";
      btn.title = "Modo admin activo. WhatsApp disponible 📱 en popovers y pill bar.";
    } else {
      btn.textContent = "🔒 Entrar como admin";
      btn.title = "Activar modo admin para crear / editar reservas";
    }
    btn.classList.toggle("on", state.admin);
  }
  document.body.classList.toggle("admin-mode", state.admin);
  updateWaLastBtn();
  if (!document.getElementById("beatriz-modal")?.hidden) renderBeatrizInbox();
}

// ---------- Lock ----------
// UX: tap en la primera casilla + tipear. Cada dígito avanza solo al
// siguiente input. Al 4° dígito se valida automático (entra o muestra
// error). Backspace borra y va para atrás. Enter valida. Paste reparte
// los dígitos en las 4 casillas.
//
// Usamos `keydown` como handler primario (más confiable en mobile que
// `input`) y `input`/`paste` como fallback para paste y entrada rápida.
function setupLock(){
  const lock = document.getElementById("lock");
  const pins = [...document.querySelectorAll(".lock-pin")];
  const err  = document.getElementById("lock-err");
  if (!lock || pins.length !== 4) return;

  function getCode(){ return pins.map(p => p.value).join(""); }
  function setPin(i, val){
    if (i < 0 || i >= pins.length) return;
    pins[i].value = val;
    pins[i].classList.toggle("filled", val !== "");
  }
  function focusPin(i){
    if (i < 0 || i >= pins.length) return;
    setTimeout(() => pins[i].focus(), 0);
  }
  function clearPins(){
    pins.forEach(p => { p.value = ""; p.classList.remove("filled","wrong"); });
    focusPin(0);
  }
  function distributeDigits(digitStr){
    const digits = digitStr.replace(/\D/g, "").split("").slice(0, pins.length);
    pins.forEach(p => { p.value = ""; p.classList.remove("filled"); });
    for (let j = 0; j < digits.length; j++) setPin(j, digits[j]);
    const lastIdx = Math.min(digits.length, pins.length) - 1;
    if (lastIdx >= 0) focusPin(lastIdx);
    return digits.length;
  }
  function fail(msg){
    err.textContent = msg;
    lock.classList.add("shake");
    pins.forEach(p => p.classList.add("wrong"));
    setTimeout(() => {
      lock.classList.remove("shake");
      pins.forEach(p => p.classList.remove("wrong"));
      clearPins();
    }, 800);
  }
  function check(){
    const code = getCode();
    if (code.length < pins.length) return;
    if (code === CONFIG.opsPin){
      success();
    } else {
      fail("Clave incorrecta");
    }
  }
  function success(){
    lock.classList.add("unlocking");
    document.body.classList.remove("locked");
    setTimeout(() => {
      lock.hidden = true;
      err.textContent = "";
    }, 600);
  }

  // Focus inicial con un pequeño delay (necesario en mobile)
  setTimeout(() => pins[0].focus(), 100);

  pins.forEach((pin, i) => {
    // PRIMARY: keydown — captura cada dígito tipeado, más confiable en mobile
    pin.addEventListener("keydown", (e) => {
      if (e.key === "Backspace"){
        e.preventDefault();
        if (pin.value){
          setPin(i, "");
        } else if (i > 0){
          setPin(i - 1, "");
          focusPin(i - 1);
        }
      } else if (e.key === "ArrowLeft" && i > 0){
        focusPin(i - 1);
        e.preventDefault();
      } else if (e.key === "ArrowRight" && i < pins.length - 1){
        focusPin(i + 1);
        e.preventDefault();
      } else if (e.key === "Enter"){
        e.preventDefault();
        check();
      } else if (/^\d$/.test(e.key)){
        // Dígito tipeado: set, advance, check si es el último
        e.preventDefault();
        setPin(i, e.key);
        if (i < pins.length - 1){
          focusPin(i + 1);
        } else {
          check();   // validar inmediatamente
        }
      }
    });

    // FALLBACK: input — para paste rápido o entrada programática
    pin.addEventListener("input", (e) => {
      const raw = e.target.value;
      const digitCount = raw.replace(/\D/g, "").length;
      if (digitCount > 1){
        // Múltiples dígitos (paste o entrada rápida): repartir
        const n = distributeDigits(raw);
        if (n >= pins.length) check();
      }
      // Si es 1 dígito, el keydown ya lo manejó. No hacer nada acá
      // para evitar doble-advance.
    });

    // FALLBACK: paste explícito
    pin.addEventListener("paste", (e) => {
      e.preventDefault();
      const text = (e.clipboardData || window.clipboardData).getData("text");
      const n = distributeDigits(text);
      if (n >= pins.length) check();
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
  document.getElementById("admin-login-close").addEventListener("click", closeAdminLogin);
  document.getElementById("admin-login-cancel").addEventListener("click", closeAdminLogin);
  document.getElementById("admin-login-submit").addEventListener("click", submitAdminLogin);
  document.getElementById("admin-login-modal").addEventListener("click", event => {
    if (event.target.id === "admin-login-modal") closeAdminLogin();
  });
  setupAdminLogin();

  // Lock toggle (solo admin, persiste en localStorage)
  document.getElementById("lock-toggle").addEventListener("click", () => {
    if (!state.admin) return;
    const next = !state.lockEnabled;
    setLockEnabled(next);
    applyLockState();
    toast(next ? "🔒 Clave activada · próxima carga la pide" : "🔓 Clave desactivada · próxima carga entra directo",
          next ? "ok" : "warn");
  });

  // Lock toggle removido — el lock es siempre activo.

  // Nuevo arriendo
  document.getElementById("add").addEventListener("click", () => {
    if (!state.admin){ alert("Activa el modo admin primero (botón 🔒 Admin)."); return; }
    openRentalForm(null, null, null);
  });

  // Brush bar
  document.getElementById("brush-cancel").addEventListener("click", cancelBrush);
  document.getElementById("brush-confirm").addEventListener("click", () => confirmBrush(false));
  document.getElementById("brush-details").addEventListener("click", openRentalFormFromBrush);
  // Atajo: crear y abrir WhatsApp en un solo click
  document.getElementById("brush-wa").addEventListener("click", () => {
    if (!state.admin) return;
    confirmBrush(true);
  });

  // Bandeja de coordinación: disponible para el operador sin elevar a admin.
  document.getElementById("wa-last").addEventListener("click", openBeatrizInbox);
  document.getElementById("calendar-refresh").addEventListener("click", () => refreshCalendarAndNotifications({ announce: true }));
  document.getElementById("beatriz-close").addEventListener("click", closeBeatrizInbox);
  document.getElementById("beatriz-modal").addEventListener("click", async event => {
    if (event.target.id === "beatriz-modal") return closeBeatrizInbox();
    const action = event.target.closest("[data-act]");
    if (!action) return;
    if (!state.admin) return;
    if (action.dataset.act === "open-separate"){
      const rental = state.calendarReservations.find(item => item.reservationId === action.dataset.reservationId);
      if (!rental) return;
      await openNotificationWhatsApp([rental], "individual");
      state.separateQueue = state.separateQueue.filter(id => id !== rental.reservationId);
      renderBeatrizInbox();
    } else if (action.dataset.act === "confirm-opened"){
      const batch = state.notificationBatches.find(item => item.id === action.dataset.batchId);
      showWhatsAppConfirmation(batch);
    } else if (action.dataset.act === "correct"){
      const ok = await askConfirm({ title: "Corregir confirmación", tip: "La reserva volverá a quedar pendiente de aviso." });
      if (ok) await correctNotificationConfirmation(action.dataset.reservationId);
    }
  });
  document.getElementById("beatriz-modal").addEventListener("change", event => {
    if (!state.admin) return;
    if (event.target.id === "beatriz-include-confirmed") return renderBeatrizInbox();
    if (event.target.matches('input[type="checkbox"][data-reservation-id]')){
      if (event.target.checked) state.inboxSelection.add(event.target.dataset.reservationId);
      else state.inboxSelection.delete(event.target.dataset.reservationId);
      renderBeatrizInbox();
    }
  });
  document.getElementById("beatriz-prepare").addEventListener("click", async () => {
    if (!state.admin) return;
    const rentals = [...state.inboxSelection]
      .map(id => state.calendarReservations.find(item => item.reservationId === id))
      .filter(Boolean);
    const mode = document.querySelector('input[name="beatriz-mode"]:checked')?.value || "grouped";
    if (!rentals.length) return;
    if (mode === "individual"){
      state.separateQueue = rentals.map(rental => rental.reservationId);
      renderBeatrizInbox();
      return;
    }
    await openNotificationWhatsApp(rentals, "grouped");
  });
  document.getElementById("whatsapp-sent").addEventListener("click", async () => {
    if (!state.admin) return;
    const id = document.getElementById("whatsapp-confirm-modal").dataset.batchId;
    await resolveNotificationBatch(state.notificationBatches.find(item => item.id === id), true);
  });
  document.getElementById("whatsapp-not-sent").addEventListener("click", async () => {
    if (!state.admin) return;
    const id = document.getElementById("whatsapp-confirm-modal").dataset.batchId;
    await resolveNotificationBatch(state.notificationBatches.find(item => item.id === id), false);
  });

  // Lista de arriendos (admin only)
  document.getElementById("list").addEventListener("click", openRentalsList);
  document.getElementById("list-close").addEventListener("click", closeRentalsList);
  document.getElementById("list-modal").addEventListener("click", e => {
    if (e.target.id === "list-modal") closeRentalsList();
  });

  window.addEventListener("focus", maybeShowWhatsAppConfirmation);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible"){
      refreshCalendarAndNotifications();
      maybeShowWhatsAppConfirmation();
    }
  });

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

  // Confirmación con cuenta regresiva para marcar una limpieza como hecha.
  document.getElementById("cleaning-ready-close").addEventListener("click", () => closeCleaningReadyModal(false));
  document.getElementById("cleaning-ready-skip").addEventListener("click", () => closeCleaningReadyModal(true));
  document.getElementById("cleaning-ready-confirm").addEventListener("click", e => {
    if (!e.currentTarget.disabled) closeCleaningReadyModal(true);
  });
  document.getElementById("cleaning-ready-modal").addEventListener("click", e => {
    if (e.target.id === "cleaning-ready-modal") closeCleaningReadyModal(false);
  });

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
    if (!document.getElementById("whatsapp-confirm-modal").hidden) closeWhatsAppConfirmation();
    else if (!document.getElementById("beatriz-modal").hidden) closeBeatrizInbox();
    else if (!document.getElementById("list-modal").hidden) closeRentalsList();
    else if (!document.getElementById("admin-login-modal").hidden) closeAdminLogin();
    else if (!document.getElementById("cleaning-ready-modal").hidden) closeCleaningReadyModal(false);
    else if (!document.getElementById("confirm-modal").hidden) closeConfirmModal(false);
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
async function main(){
  try{
    const t = today();
    state.view = { y: t.y, m: t.m };
    state.lockEnabled = isLockEnabled();
    state.calendarSource = makeCalendarSource(CONFIG.familyAvailabilityUrl);
    bind();
    await initStore();
    await load();
    applyLockState();
    updateLockToggle();
    setupLock();
    updateAdminUI();
    document.title += "  ·  v" + VERSION;
  }catch(err){
    console.error("Init error:", err);
    state.loadError = (err && err.message) ? err.message : String(err);
    render();
  }
}

if (typeof document !== "undefined") main();

// Superficie mínima para las pruebas Node; no existe en el navegador.
if (typeof module !== "undefined" && module.exports){
  module.exports = {
    buildGroupedWhatsAppMessage,
    buildNotificationMessages,
    buildWhatsAppMessage,
    buildReservationToneMap,
    calendarReservationsWithoutManualDuplicates,
    calendarRangesToRentals,
    cleaningForRental,
    cleaningIdForReservation,
    isValidIsoDate,
    isNotificationVisibleForRole,
    mergeCalendarReservationHistory,
    normalizeAvailabilityPayload,
    planBatchResolution,
    planCalendarCleaningReconciliation,
    planNotificationReconciliation,
    reservationTone,
    sourceMeta,
    CHECKIN_TIME,
    CHECKOUT_TIME,
  };
}
