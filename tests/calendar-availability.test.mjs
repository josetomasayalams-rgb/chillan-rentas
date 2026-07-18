import assert from "node:assert/strict";
import test from "node:test";
import app from "../app.js";

const {
  buildWhatsAppMessage,
  calendarRangesToRentals,
  normalizeAvailabilityPayload,
} = app;

test("prefiere estadías individuales sanitizadas y elimina duplicados exactos", () => {
  const normalized = normalizeAvailabilityPayload({
    version: 1,
    status: "live",
    generatedAt: "2026-07-17T15:00:00.000Z",
    lastSuccessfulSyncAt: "2026-07-17T14:50:00.000Z",
    reservedRanges: [
      { startDate: "2026-07-22", endDate: "2026-07-24" },
      { startDate: "2026-07-20", endDate: "2026-07-22" },
      { startDate: "2026-07-20", endDate: "2026-07-22" },
      { startDate: "2026-02-30", endDate: "2026-03-02" },
    ],
    blockedRanges: [{ startDate: "2026-07-20", endDate: "2026-07-24" }],
  });

  assert.deepEqual(normalized.ranges, [
    { startDate: "2026-07-20", endDate: "2026-07-22" },
    { startDate: "2026-07-22", endDate: "2026-07-24" },
  ]);
});

test("mantiene compatibilidad con blockedRanges mientras se despliega el contrato nuevo", () => {
  const normalized = normalizeAvailabilityPayload({
    version: 1,
    status: "stale",
    blockedRanges: [{ startDate: "2026-08-01", endDate: "2026-08-03" }],
  });
  assert.deepEqual(normalized.ranges, [
    { startDate: "2026-08-01", endDate: "2026-08-03" },
  ]);
});

test("convierte calendarios en reservas opacas y de solo lectura", () => {
  const rentals = calendarRangesToRentals({
    generatedAt: "2026-07-17T15:00:00.000Z",
    ranges: [{ startDate: "2026-08-01", endDate: "2026-08-03" }],
  });
  assert.equal(rentals[0].source, "calendar");
  assert.equal(rentals[0].readOnly, true);
  assert.equal(rentals[0].guest_name, null);
  assert.equal(rentals[0].reference, null);
});

test("el mensaje para Beatriz coordina la limpieza sin filtrar proveedor ni huésped", () => {
  const message = buildWhatsAppMessage({
    checkin_date: "2026-08-01",
    checkout_date: "2026-08-03",
    source: "calendar",
    guest_name: "Dato privado",
  });
  assert.match(message, /Hola Beatriz/);
  assert.match(message, /Limpieza: 3 ago desde las 12:00/);
  assert.doesNotMatch(message, /Airbnb|Booking|familia|Dato privado/i);
});
