import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import app from "../app.js";

const {
  buildGroupedWhatsAppMessage,
  buildNotificationMessages,
  buildReservationToneMap,
  buildWhatsAppMessage,
  coffeeProvisionForRental,
  calendarReservationsWithoutManualDuplicates,
  calendarRangesToRentals,
  cleaningForRental,
  cleaningIdForReservation,
  coordinationActionForRental,
  coordinationRecipient,
  isNotificationVisibleForRole,
  mergeCalendarReservationHistory,
  normalizeAvailabilityPayload,
  parseCoffeeCount,
  planAlreadySentRegistration,
  planBatchResolution,
  planCalendarCleaningReconciliation,
  planNotificationReconciliation,
  reconcileRollingView,
  reservationNightCount,
  reservationTone,
  rollingMonthWindow,
  sourceMeta,
  CHECKIN_TIME,
  CHECKOUT_TIME,
} = app;

const ID_A = `rsv_${"a".repeat(32)}`;
const ID_B = `rsv_${"b".repeat(32)}`;
const ID_C = `rsv_${"c".repeat(32)}`;

test("prefiere estadías individuales con identidad opaca y elimina duplicados", () => {
  const normalized = normalizeAvailabilityPayload({
    version: 1,
    status: "live",
    generatedAt: "2026-07-17T15:00:00.000Z",
    lastSuccessfulSyncAt: "2026-07-17T14:50:00.000Z",
    reservedRanges: [
      { reservationId: ID_B, startDate: "2026-07-22", endDate: "2026-07-24" },
      { reservationId: ID_A, startDate: "2026-07-20", endDate: "2026-07-22" },
      { reservationId: ID_A, startDate: "2026-07-20", endDate: "2026-07-22" },
      { reservationId: ID_C, startDate: "2026-07-20", endDate: "2026-07-22" },
      { reservationId: ID_C, startDate: "2026-02-30", endDate: "2026-03-02" },
    ],
  });

  assert.deepEqual(normalized.ranges, [
    { reservationId: ID_A, startDate: "2026-07-20", endDate: "2026-07-22" },
    { reservationId: ID_B, startDate: "2026-07-22", endDate: "2026-07-24" },
  ]);
  assert.equal(normalized.overlapCount, 0);
});

test("consolida cruces parciales para no duplicar limpiezas ni avisos", () => {
  const normalized = normalizeAvailabilityPayload({
    version: 1,
    status: "live",
    reservedRanges: [
      { reservationId: ID_A, startDate: "2026-08-01", endDate: "2026-08-02" },
      { reservationId: ID_B, startDate: "2026-08-01", endDate: "2026-08-03" },
      { reservationId: ID_C, startDate: "2026-08-07", endDate: "2026-08-09" },
    ],
  });
  assert.deepEqual(normalized.ranges, [
    { reservationId: ID_A, startDate: "2026-08-01", endDate: "2026-08-03" },
    { reservationId: ID_C, startDate: "2026-08-07", endDate: "2026-08-09" },
  ]);
  assert.equal(normalized.overlapCount, 1);
});

test("mantiene compatibilidad temporal con blockedRanges", () => {
  const normalized = normalizeAvailabilityPayload({
    version: 1,
    status: "stale",
    blockedRanges: [{ startDate: "2026-08-01", endDate: "2026-08-03" }],
  });
  assert.equal(normalized.ranges.length, 1);
  assert.match(normalized.ranges[0].reservationId, /^rsv_[a-f0-9]{32}$/);
  assert.equal(normalized.ranges[0].startDate, "2026-08-01");
});

test("convierte calendarios en reservas opacas, estables y de solo lectura", () => {
  const first = calendarRangesToRentals({
    generatedAt: "2026-07-17T15:00:00.000Z",
    ranges: [{ reservationId: ID_A, startDate: "2026-08-01", endDate: "2026-08-03" }],
  })[0];
  const changed = calendarRangesToRentals({
    generatedAt: "2026-07-18T15:00:00.000Z",
    ranges: [{ reservationId: ID_A, startDate: "2026-08-02", endDate: "2026-08-04" }],
  })[0];
  assert.equal(first.id, changed.id);
  assert.equal(first.source, "calendar");
  assert.equal(first.readOnly, true);
  assert.equal(first.guest_name, null);
  assert.equal(first.reference, null);
});

test("mantiene un único tipo visual de reserva sin revelar su plataforma", () => {
  assert.deepEqual(sourceMeta("direct"), { name: "Reserva", color: "#0369A1" });
  assert.deepEqual(sourceMeta("calendar"), sourceMeta("direct"));
});

test("alterna tonos de forma cronológica y conserva el tono durante cada estadía", () => {
  const rentals = [
    { id: "manual-c", checkin_date: "2026-08-10", checkout_date: "2026-08-12" },
    { id: "manual-a", checkin_date: "2026-08-01", checkout_date: "2026-08-03" },
    { id: "manual-b", checkin_date: "2026-08-05", checkout_date: "2026-08-07" },
  ];
  const toneMap = buildReservationToneMap(rentals);
  assert.equal(reservationTone(rentals[1], toneMap).index, 0);
  assert.equal(reservationTone(rentals[2], toneMap).index, 1);
  assert.equal(reservationTone(rentals[0], toneMap).index, 0);
  assert.equal(reservationTone(rentals[2], toneMap).color, "#6D28D9");
});

test("usa explícitamente check-in 15:00 y check-out 12:00", () => {
  assert.equal(CHECKIN_TIME, "15:00");
  assert.equal(CHECKOUT_TIME, "12:00");
});

test("construye una planificación móvil de 30 días que cruza al mes siguiente", () => {
  const range = rollingMonthWindow("2026-07-18");
  assert.equal(range.start, "2026-07-18");
  assert.equal(range.endInclusive, "2026-08-16");
  assert.equal(range.endExclusive, "2026-08-17");
  assert.equal(range.dates.length, 30);
  assert.equal(range.dates[14], "2026-08-01");
  assert.equal(new Set(range.dates).size, 30);
});

test("señala el inicio de mes sólo en dorado, sin franjas ni tintes mensuales", () => {
  const appSource = fs.readFileSync("app.js", "utf8");
  const styles = fs.readFileSync("styles.css", "utf8");
  const html = fs.readFileSync("index.html", "utf8");
  assert.match(appSource, /startsMonth \? " month-start"/);
  assert.match(styles, /\.cell\.month-start\{[^}]*251,191,36/s);
  assert.doesNotMatch(`${appSource}\n${styles}\n${html}`, /month-span|month-tone/);
});

test("el seguimiento diario avanza la ventana y la navegación manual la conserva", () => {
  assert.deepEqual(
    reconcileRollingView({ start: "2026-07-18", followsToday: true }, "2026-07-19"),
    { start: "2026-07-19", followsToday: true },
  );
  assert.deepEqual(
    reconcileRollingView({ start: "2026-06-01", followsToday: false }, "2026-07-19"),
    { start: "2026-06-01", followsToday: false },
  );
});

test("el operador sólo ve avisos pendientes y el administrador conserva la gestión", () => {
  const pending = { is_active: true, status: "pending" };
  const changed = { is_active: true, status: "needs_update" };
  const opened = { is_active: true, status: "opened" };
  const confirmed = { is_active: true, status: "confirmed" };
  assert.equal(isNotificationVisibleForRole(pending, false), true);
  assert.equal(isNotificationVisibleForRole(changed, false), true);
  assert.equal(isNotificationVisibleForRole(opened, false), false);
  assert.equal(isNotificationVisibleForRole(confirmed, false), false);
  assert.equal(isNotificationVisibleForRole(opened, true), true);
  assert.equal(isNotificationVisibleForRole(confirmed, true), false);
  assert.equal(isNotificationVisibleForRole(confirmed, true, true), true);
});

test("evita duplicar una reserva sincronizada ya registrada manualmente", () => {
  const calendar = [{
    reservationId: ID_A,
    checkin_date: "2026-07-16",
    checkout_date: "2026-07-18",
  }, {
    reservationId: ID_B,
    checkin_date: "2026-07-19",
    checkout_date: "2026-07-23",
  }];
  const manual = [{
    id: "manual-a",
    checkin_date: "2026-07-16",
    checkout_date: "2026-07-18",
    status: "scheduled",
  }];
  assert.deepEqual(calendarReservationsWithoutManualDuplicates(calendar, manual), [calendar[1]]);

  const duplicateCleaning = {
    id: cleaningIdForReservation(ID_A),
    rental_id: null,
    reservation_id: ID_A,
    scheduled_date: "2026-07-18",
    status: "pending",
  };
  const plan = planCalendarCleaningReconciliation(
    [duplicateCleaning],
    [calendar[1]],
    [{ reservation_id: ID_A, status: "pending" }],
    { suppressedReservationIds: [ID_A] },
  );
  assert.equal(plan.upserts.find(item => item.reservation_id === ID_A)?.status, "cancelled");
});

test("genera una limpieza automática y estable por reserva sincronizada", () => {
  const rentals = [
    { reservationId: ID_A, checkin_date: "2026-08-01", checkout_date: "2026-08-03" },
    { reservationId: ID_B, checkin_date: "2026-08-07", checkout_date: "2026-08-09" },
  ];
  const created = planCalendarCleaningReconciliation([], rentals, [], {
    nowIso: "2026-07-18T12:00:00.000Z",
  });
  assert.equal(created.upserts.length, 2);
  assert.equal(created.upserts[0].id, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
  assert.equal(created.upserts[0].rental_id, null);
  assert.equal(created.upserts[0].reservation_id, ID_A);
  assert.equal(created.upserts[0].scheduled_date, "2026-08-03");
  assert.equal(created.upserts[0].status, "pending");
  assert.equal(cleaningIdForReservation(ID_A), created.upserts[0].id);
  assert.equal(cleaningIdForReservation("private"), null);

  const repeated = planCalendarCleaningReconciliation(created.upserts, rentals, [], {
    nowIso: "2026-07-18T13:00:00.000Z",
  });
  assert.equal(repeated.upserts.length, 0);
});

test("mueve, cancela o conserva la limpieza según el ciclo de la reserva", () => {
  const previous = {
    id: cleaningIdForReservation(ID_A),
    rental_id: null,
    reservation_id: ID_A,
    scheduled_date: "2026-08-03",
    scheduled_time: "12:00",
    status: "done",
    confirmed_at: null,
    done_at: "2026-08-03T15:00:00.000Z",
  };
  const changed = planCalendarCleaningReconciliation([previous], [{
    reservationId: ID_A,
    checkin_date: "2026-08-02",
    checkout_date: "2026-08-04",
  }], [], { nowIso: "2026-07-19T12:00:00.000Z" });
  assert.equal(changed.upserts[0].scheduled_date, "2026-08-04");
  assert.equal(changed.upserts[0].status, "pending");
  assert.equal(changed.upserts[0].done_at, null);

  const removed = planCalendarCleaningReconciliation([previous], [], [{
    reservation_id: ID_A,
    status: "removed",
  }]);
  assert.equal(removed.upserts[0].status, "cancelled");

  const finished = planCalendarCleaningReconciliation([previous], [], [{
    reservation_id: ID_A,
    status: "finished",
  }]);
  assert.equal(finished.upserts.length, 0);
});

test("conserva en pantalla la salida finalizada hasta confirmar el aseo", () => {
  const cleanings = [{
    id: cleaningIdForReservation(ID_A),
    rental_id: null,
    reservation_id: ID_A,
    scheduled_date: "2026-08-03",
    status: "pending",
  }];
  const history = mergeCalendarReservationHistory([], [{
    reservation_id: ID_A,
    checkin_date: "2026-08-01",
    checkout_date: "2026-08-03",
    status: "finished",
    created_at: "2026-07-18T12:00:00.000Z",
  }, {
    reservation_id: ID_B,
    checkin_date: "2026-08-04",
    checkout_date: "2026-08-05",
    status: "removed",
  }], cleanings);
  assert.equal(history.length, 1);
  assert.equal(history[0].reservationId, ID_A);
  assert.equal(history[0].archived, true);
  assert.equal(cleaningForRental(history[0], cleanings)?.id, cleanings[0].id);
});

test("reconcilia altas, cambios, retiros y finalizaciones sin duplicar", () => {
  const created = planNotificationReconciliation([], [{
    reservationId: ID_A, checkin_date: "2026-08-01", checkout_date: "2026-08-03",
  }], { nowIso: "2026-07-18T10:00:00.000Z", currentDate: "2026-07-18" });
  assert.equal(created.upserts[0].status, "pending");
  assert.equal(created.events[0].event_type, "created");

  const changed = planNotificationReconciliation([{ ...created.upserts[0], status: "confirmed" }], [{
    reservationId: ID_A, checkin_date: "2026-08-02", checkout_date: "2026-08-04",
  }], { nowIso: "2026-07-19T10:00:00.000Z", currentDate: "2026-07-19" });
  assert.equal(changed.upserts[0].status, "needs_update");
  assert.equal(changed.upserts[0].revision, 2);

  const removed = planNotificationReconciliation(changed.upserts, [], {
    nowIso: "2026-07-20T10:00:00.000Z", currentDate: "2026-07-20",
  });
  assert.equal(removed.upserts[0].status, "removed");
  const finished = planNotificationReconciliation([{ ...changed.upserts[0], checkout_date: "2026-07-20" }], [], {
    nowIso: "2026-07-20T10:00:00.000Z", currentDate: "2026-07-20",
  });
  assert.equal(finished.upserts[0].status, "finished");
});

test("una cancelación ya coordinada vuelve a ser accionable hasta registrar el nuevo aviso", () => {
  const confirmed = {
    reservation_id: ID_A,
    checkin_date: "2026-08-01",
    checkout_date: "2026-08-03",
    status: "confirmed",
    is_active: true,
    confirmed_at: "2026-07-18T12:00:00.000Z",
    revision: 1,
  };
  const cancellation = planNotificationReconciliation([confirmed], [], {
    nowIso: "2026-07-21T10:00:00.000Z",
    currentDate: "2026-07-21",
  }).upserts[0];
  assert.equal(cancellation.status, "removed");
  assert.equal(cancellation.is_active, false);
  assert.equal(isNotificationVisibleForRole(cancellation, false), true);

  const registered = planAlreadySentRegistration([cancellation], [ID_A], "2026-07-21T11:00:00.000Z");
  assert.equal(registered.updates[0].status, "confirmed");
  assert.equal(registered.updates[0].is_active, false);
  assert.equal(isNotificationVisibleForRole(registered.updates[0], false), false);

  const neverNotified = { ...cancellation, confirmed_at: null };
  assert.equal(isNotificationVisibleForRole(neverNotified, false), false);
});

test("resuelve apertura y confirmación sin confundir cambios posteriores", () => {
  const batch = { id: "batch-1", status: "opened" };
  const opened = [
    { reservation_id: ID_A, last_batch_id: "batch-1", status: "opened" },
    { reservation_id: ID_B, last_batch_id: "batch-1", status: "needs_update" },
  ];
  const confirmed = planBatchResolution(opened, batch, true, "2026-07-18T12:00:00.000Z");
  assert.equal(confirmed.updates[0].status, "confirmed");
  assert.equal(confirmed.updates[1].status, "needs_update");
  assert.equal(confirmed.batch.status, "confirmed");
  const pending = planBatchResolution(opened, batch, false, "2026-07-18T12:00:00.000Z");
  assert.equal(pending.updates[0].status, "pending");
  assert.equal(pending.batch.status, "not_confirmed");

  const notSent = planBatchResolution([
    { reservation_id: ID_A, last_batch_id: "batch-1", status: "opened", is_active: true, confirmed_at: "2026-07-17T12:00:00.000Z" },
    { reservation_id: ID_B, last_batch_id: "batch-1", status: "opened", is_active: false, confirmed_at: "2026-07-17T12:00:00.000Z" },
    { reservation_id: ID_C, last_batch_id: "batch-1", status: "opened", is_active: true, confirmed_at: null },
  ], batch, false, "2026-07-18T12:00:00.000Z");
  assert.deepEqual(notSent.updates.map(item => item.status), ["needs_update", "removed", "pending"]);

  const changedWhileOpen = [
    { reservation_id: ID_A, last_batch_id: "batch-1", status: "needs_update", is_active: true, confirmed_at: null, checkin_date: "2026-08-02", checkout_date: "2026-08-05" },
    { reservation_id: ID_B, last_batch_id: "batch-1", status: "removed", is_active: false, confirmed_at: null, checkin_date: "2026-08-07", checkout_date: "2026-08-09" },
  ];
  const priorMessageSent = planBatchResolution(changedWhileOpen, batch, true, "2026-07-18T13:00:00.000Z");
  assert.deepEqual(priorMessageSent.updates.map(item => item.status), ["needs_update", "removed"]);
  assert.ok(priorMessageSent.updates.every(item => item.confirmed_at === "2026-07-18T13:00:00.000Z"));
  assert.ok(priorMessageSent.updates.every(item => isNotificationVisibleForRole(item, false)));

  const priorMessageNotSent = planBatchResolution(changedWhileOpen, batch, false, "2026-07-18T13:00:00.000Z");
  assert.equal(priorMessageNotSent.updates[0].status, "pending");
  assert.equal(priorMessageNotSent.updates[0].confirmed_at, null);
  assert.equal(priorMessageNotSent.updates[1].status, "removed");
  assert.equal(isNotificationVisibleForRole(priorMessageNotSent.updates[1], false), false);
});

test("los accesos secundarios respetan la memoria y el tipo de coordinación", () => {
  const rental = { id:`calendar:${ID_A}`, reservationId:ID_A, readOnly:true, status:"scheduled" };
  const confirmed = coordinationActionForRental(rental, "beatriz", {
    reservation_id: ID_A,
    status: "confirmed",
    is_active: true,
    checkin_date: "2026-08-01",
    checkout_date: "2026-08-03",
  });
  assert.equal(confirmed.actionable, false);
  assert.match(confirmed.label, /avisada/);

  const changed = coordinationActionForRental(rental, "beatriz", {
    reservation_id: ID_A,
    status: "needs_update",
    is_active: true,
    confirmed_at: "2026-07-18T12:00:00.000Z",
    checkin_date: "2026-08-02",
    checkout_date: "2026-08-05",
  });
  assert.equal(changed.actionable, true);
  assert.equal(changed.rental.coordinationStatus, "needs_update");
  assert.match(changed.label, /actualizar/);

  const opened = coordinationActionForRental(rental, "rodrigo", {
    reservation_id: ID_A,
    status: "opened",
    is_active: true,
    checkin_date: "2026-08-01",
    checkout_date: "2026-08-03",
  });
  assert.equal(opened.actionable, false);
  assert.match(opened.label, /por confirmar/);
});

test("mantiene independientes las confirmaciones de Beatriz y Rodrigo", () => {
  const batch = { id: "batch-beatriz", status: "opened" };
  const beatriz = [{ reservation_id: ID_A, last_batch_id: batch.id, status: "opened" }];
  const rodrigo = [{ reservation_id: ID_A, last_batch_id: null, status: "pending" }];
  const resolved = planBatchResolution(beatriz, batch, true, "2026-07-18T12:00:00.000Z");
  assert.equal(resolved.updates[0].status, "confirmed");
  assert.equal(rodrigo[0].status, "pending");
});

test("registra avisos previos de forma idempotente sin crear lotes falsos", () => {
  const notifications = [
    { reservation_id: ID_A, status: "pending", is_active: true, checkin_date: "2026-08-01", checkout_date: "2026-08-03", last_batch_id: null },
    { reservation_id: ID_B, status: "needs_update", is_active: true, checkin_date: "2026-08-07", checkout_date: "2026-08-09", last_batch_id: "old-batch" },
    { reservation_id: ID_C, status: "opened", is_active: true, checkin_date: "2026-08-11", checkout_date: "2026-08-13", last_batch_id: "open-batch" },
  ];
  const plan = planAlreadySentRegistration(notifications, [ID_A, ID_A, ID_B, ID_C], "2026-07-21T05:00:00.000Z");
  assert.deepEqual(plan.updates.map(item => item.reservation_id), [ID_A, ID_B]);
  assert.ok(plan.updates.every(item => item.status === "confirmed" && item.last_batch_id === null));
  assert.ok(plan.events.every(event => event.event_type === "confirmed" && event.next_status === "confirmed"));
  assert.equal(plan.updates.some(item => item.reservation_id === ID_C), false);

  const repeated = planAlreadySentRegistration(plan.updates, [ID_A, ID_B], "2026-07-21T05:01:00.000Z");
  assert.deepEqual(repeated, { updates: [], events: [] });
});

test("después de registrar cuatro avisos ofrece únicamente una quinta reserva nueva para cada destinatario", () => {
  const ids = [ID_A, ID_B, ID_C, `rsv_${"d".repeat(32)}`];
  const pending = ids.map((reservationId, index) => ({
    reservation_id: reservationId,
    status: "pending",
    is_active: true,
    checkin_date: `2026-08-${String(1 + index * 3).padStart(2, "0")}`,
    checkout_date: `2026-08-${String(3 + index * 3).padStart(2, "0")}`,
    revision: 1,
  }));
  const beatrizRegistration = planAlreadySentRegistration(pending, ids, "2026-07-21T04:00:00.000Z");
  const rodrigoRegistration = planAlreadySentRegistration(pending.map(item => ({ ...item })), ids, "2026-07-21T04:00:00.000Z");
  assert.equal(beatrizRegistration.updates.length, 4);
  assert.equal(rodrigoRegistration.updates.length, 4);
  assert.ok(beatrizRegistration.updates.every(item => !isNotificationVisibleForRole(item, false)));

  const existing = beatrizRegistration.updates;
  const current = existing.map(item => ({
    reservationId: item.reservation_id,
    checkin_date: item.checkin_date,
    checkout_date: item.checkout_date,
  }));
  const fifthId = `rsv_${"e".repeat(32)}`;
  current.push({ reservationId: fifthId, checkin_date: "2026-08-20", checkout_date: "2026-08-22" });
  const plan = planNotificationReconciliation(existing, current, {
    nowIso: "2026-07-21T05:00:00.000Z",
    currentDate: "2026-07-21",
  });
  assert.equal(plan.upserts.length, 1);
  assert.equal(plan.upserts[0].reservation_id, fifthId);
  assert.equal(plan.upserts[0].status, "pending");
  const visible = [...existing, ...plan.upserts].filter(item => isNotificationVisibleForRole(item, false));
  assert.deepEqual(visible.map(item => item.reservation_id), [fifthId]);
  assert.ok(rodrigoRegistration.updates.every(item => item.status === "confirmed"));
});

test("genera mensajes individuales y agrupados sin filtrar datos privados", () => {
  const rentals = [
    { reservationId: ID_A, checkin_date: "2026-08-01", checkout_date: "2026-08-03", guest_name: "Privado" },
    { reservationId: ID_B, checkin_date: "2026-08-07", checkout_date: "2026-08-09", reference: "Booking" },
  ];
  const individual = buildWhatsAppMessage(rentals[0]);
  assert.match(individual, /Hola Beatriz/);
  assert.match(individual, /Limpieza: 3 ago desde las 12:00/);
  const grouped = buildGroupedWhatsAppMessage(rentals);
  assert.match(grouped, /1\. Check-in 1 ago 15:00 → Check-out 3 ago 12:00/);
  assert.match(grouped, /2\. Check-in 7 ago 15:00 → Check-out 9 ago 12:00/);
  assert.equal(buildNotificationMessages(rentals, "individual").length, 2);
  assert.equal(buildNotificationMessages(rentals, "grouped").length, 1);
  assert.doesNotMatch(`${individual}\n${grouped}`, /Airbnb|Booking|familia|Privado/i);

  const rodrigoIndividual = buildWhatsAppMessage(rentals[0], "rodrigo");
  const rodrigoGrouped = buildGroupedWhatsAppMessage(rentals, "rodrigo");
  assert.match(rodrigoIndividual, /Hola Rodrigo/);
  assert.match(rodrigoIndividual, /control de acceso/);
  assert.doesNotMatch(rodrigoIndividual, /limpieza/i);
  assert.match(rodrigoGrouped, /próximas reservas confirmadas/);
  assert.equal(buildNotificationMessages(rentals, "individual", "rodrigo").length, 2);
  assert.doesNotMatch(`${rodrigoIndividual}\n${rodrigoGrouped}`, /Airbnb|Booking|familia|Privado/i);
  assert.equal(coordinationRecipient("rodrigo").whatsapp, "56958171234");
});

test("redacta correcciones y cancelaciones como reemplazo de la coordinación anterior", () => {
  const updated = {
    reservationId: ID_A,
    checkin_date: "2026-08-02",
    checkout_date: "2026-08-05",
    coordinationStatus: "needs_update",
  };
  const cancelled = {
    reservationId: ID_B,
    checkin_date: "2026-08-07",
    checkout_date: "2026-08-09",
    coordinationStatus: "removed",
  };
  const beatrizUpdate = buildWhatsAppMessage(updated, "beatriz", { [ID_A]: 2 });
  assert.match(beatrizUpdate, /nueva coordinación que reemplaza la anterior/i);
  assert.match(beatrizUpdate, /Nuevo check-in: 2 ago/);
  assert.match(beatrizUpdate, /Nueva limpieza: 5 ago/);
  assert.match(beatrizUpdate, /Café \(3 noches, 2 personas\): 12 sachets/);

  const beatrizCancellation = buildWhatsAppMessage(cancelled, "beatriz", { [ID_B]: 4 });
  assert.match(beatrizCancellation, /cancelación que reemplaza la coordinación anterior/i);
  assert.match(beatrizCancellation, /Cancelar la limpieza del 9 ago/);
  assert.doesNotMatch(beatrizCancellation, /Café|Dolce Gusto/);

  const rodrigoUpdate = buildWhatsAppMessage(updated, "rodrigo");
  const rodrigoCancellation = buildWhatsAppMessage(cancelled, "rodrigo");
  assert.match(rodrigoUpdate, /nueva coordinación que reemplaza la anterior/i);
  assert.match(rodrigoCancellation, /elimina esas fechas del control de acceso/i);

  const grouped = buildGroupedWhatsAppMessage([updated, cancelled], "beatriz", { [ID_A]: 2, [ID_B]: 4 });
  assert.match(grouped, /ACTUALIZACIÓN/);
  assert.match(grouped, /CANCELACIÓN/);
  assert.equal((grouped.match(/Café/g) || []).length, 1);

  const cancellationOnly = buildGroupedWhatsAppMessage([cancelled], "beatriz");
  assert.match(cancellationOnly, /deja sin efecto estas limpiezas/i);
  assert.doesNotMatch(cancellationOnly, /nuevas limpiezas/i);
});

test("calcula café para Beatriz por personas y noches, más dos Dolce Gusto fijas", () => {
  const rental = { reservationId: ID_A, checkin_date: "2026-08-01", checkout_date: "2026-08-04" };
  assert.equal(reservationNightCount(rental), 3);
  assert.equal(parseCoffeeCount(""), null);
  assert.equal(parseCoffeeCount("0"), 0);
  assert.equal(parseCoffeeCount("12"), 12);
  assert.equal(parseCoffeeCount("-1"), null);
  assert.deepEqual(coffeeProvisionForRental(rental, 4), {
    guests: 4,
    nights: 3,
    sachets: 24,
    dolceGusto: 2,
  });
  assert.deepEqual(coffeeProvisionForRental(rental, 0), {
    guests: 0,
    nights: 3,
    sachets: 0,
    dolceGusto: 2,
  });
  assert.deepEqual(coffeeProvisionForRental(rental, { mode:"manual", sachets:7, dolceGusto:5 }), {
    guests: null,
    nights: 3,
    sachets: 7,
    dolceGusto: 5,
  });

  const coffee = { [ID_A]: 4 };
  const message = buildWhatsAppMessage(rental, "beatriz", coffee);
  assert.match(message, /Café \(3 noches, 4 personas\): 24 sachets de café \+ 2 cápsulas Dolce Gusto/);
  const manualMessage = buildWhatsAppMessage(rental, "beatriz", {
    [ID_A]: { mode:"manual", sachets:7, dolceGusto:5 },
  });
  assert.match(manualMessage, /Café \(cantidad elegida\): 7 sachets de café \+ 5 cápsulas Dolce Gusto/);
  assert.doesNotMatch(buildWhatsAppMessage(rental, "rodrigo", coffee), /Café|Dolce Gusto/);
});

test("incluye el cálculo separado de café en mensajes agrupados para Beatriz", () => {
  const rentals = [
    { reservationId: ID_A, checkin_date: "2026-08-01", checkout_date: "2026-08-03" },
    { reservationId: ID_B, checkin_date: "2026-08-07", checkout_date: "2026-08-08" },
  ];
  const message = buildGroupedWhatsAppMessage(rentals, "beatriz", {
    [ID_A]: 2,
    [ID_B]: { mode:"manual", sachets:9, dolceGusto:0 },
  });
  assert.match(message, /Café \(2 noches, 2 personas\): 8 sachets de café \+ 2 cápsulas Dolce Gusto/);
  assert.match(message, /Café \(cantidad elegida\): 9 sachets de café \+ 0 cápsulas Dolce Gusto/);
});
