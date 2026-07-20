import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("app.js", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260720171000_operations_integrity_hardening.sql",
  "utf8",
);

test("operations tables reject anonymous writes", () => {
  for (const table of ["rentals", "cleanings", "cleaning_comments", "beatriz_notifications", "rodrigo_notifications"]) {
    assert.ok(migration.includes(`'${table}'`));
  }
  assert.match(migration, /revoke all on public\.%I from anon/i);
  assert.match(migration, /is_calendar_admin/);
});

test("rentals and cleanings use recoverable deletion and active uniqueness", () => {
  assert.match(app, /rentals"\)\.update\(\{ deleted_at:new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(app, /cleanings"\)\.update\(\{ deleted_at:new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(migration, /cleanings_rental_id_active_uidx/);
  assert.match(migration, /calendar_change_log is append-only/);
});

test("configured production fails closed behind Google authentication", () => {
  assert.match(app, /requireAuthorizedSession/);
  assert.match(app, /unavailableStore\("No se pudo conectar al calendario compartido"\)/);
  assert.doesNotMatch(app, /Supabase init falló, usando modo local/);
});
