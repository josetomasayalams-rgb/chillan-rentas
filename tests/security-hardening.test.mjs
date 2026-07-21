import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync("app.js", "utf8");
const migration = readFileSync(
  "supabase/migrations/20260720171000_operations_integrity_hardening.sql",
  "utf8",
);
const pinOnlyMigration = readFileSync(
  "supabase/migrations/20260721053000_restore_pin_only_access.sql",
  "utf8",
);
const groupedBatchMigration = readFileSync(
  "supabase/migrations/20260721060000_preserve_grouped_notification_batches.sql",
  "utf8",
);
const html = readFileSync("index.html", "utf8");
const schema = readFileSync("schema.sql", "utf8");

const operationTables = [
  "rentals",
  "cleanings",
  "cleaning_comments",
  "beatriz_notification_batches",
  "beatriz_notifications",
  "beatriz_notification_events",
  "rodrigo_notification_batches",
  "rodrigo_notifications",
  "rodrigo_notification_events",
];

function extractPriorNotificationRpc(sql){
  const match = sql.match(
    /create or replace function public\.register_prior_notifications[\s\S]*?grant execute on function public\.register_prior_notifications\(text, text\[\]\) to anon, authenticated;/i,
  );
  assert.ok(match, "register_prior_notifications must exist with its grants");
  return match[0].replace(/\s+/g, " ").trim();
}

test("the temporary PIN-only phase restores shared access without Google login", () => {
  for (const table of operationTables) {
    assert.ok(pinOnlyMigration.includes(`'${table}'`));
    assert.ok(schema.includes(`'${table}'`));
  }
  assert.match(pinOnlyMigration, /create policy "pin users read"/i);
  assert.match(pinOnlyMigration, /create policy "pin users insert"/i);
  assert.match(pinOnlyMigration, /create policy "pin users update"/i);
  assert.doesNotMatch(pinOnlyMigration, /create policy "pin users write"/i);
  assert.match(pinOnlyMigration, /to anon, authenticated/i);
  assert.match(pinOnlyMigration, /revoke all on public\.%I from anon, authenticated/i);
  assert.match(pinOnlyMigration, /grant select, insert on public\.%I to anon, authenticated/i);
  assert.match(pinOnlyMigration, /grant select, insert, update on public\.%I to anon, authenticated/i);
  assert.doesNotMatch(pinOnlyMigration, /grant select, insert, update, delete/i);
  assert.match(pinOnlyMigration, /revoke all on sequence public\.calendar_change_log_id_seq from anon, authenticated/i);
  assert.match(app, /opsPin:\s*"0000"/);
  assert.match(app, /adminPin:\s*"2407"/);
  assert.match(pinOnlyMigration, /PIN 0000[\s\S]*2407/);
  assert.doesNotMatch(app, /requireAuthorizedSession|AUTHORIZED_EMAILS|signInWithOAuth|onAuthStateChange/i);
  assert.doesNotMatch(html, /auth-gate|Ingresar con Google|oauth/i);
});

test("audit actors use JWT identity or the PIN role, never the function owner", () => {
  const actorFallback = /lower\(coalesce\(\s*nullif\(auth\.jwt\(\) ->> 'email', ''\),\s*nullif\(auth\.role\(\), ''\),\s*'pin-user'\s*\)\)/i;
  assert.match(pinOnlyMigration, actorFallback);
  assert.match(schema, actorFallback);
  assert.doesNotMatch(pinOnlyMigration, /current_user|'postgres'/i);
  assert.doesNotMatch(schema, /current_user|'postgres'/i);
});

test("prior notification registration is atomic, scoped and idempotent", () => {
  extractPriorNotificationRpc(pinOnlyMigration);
  const rpc = extractPriorNotificationRpc(groupedBatchMigration);
  assert.match(rpc, /returns integer language plpgsql security definer/i);
  assert.match(rpc, /set search_path = public, pg_temp/i);
  assert.match(rpc, /recipient_key = 'beatriz'[\s\S]*recipient_key = 'rodrigo'/i);
  assert.match(rpc, /raise exception 'Destinatario no permitido/i);
  assert.match(rpc, /with candidates as materialized[\s\S]*for update/i);
  assert.match(rpc, /is_active = true and notification\.status in \('pending', 'needs_update'\)/i);
  assert.match(rpc, /is_active = false and notification\.status = 'removed' and notification\.confirmed_at is not null/i);
  assert.match(rpc, /status = 'not_confirmed'[\s\S]*batch\.status = 'opened'/i);
  assert.match(rpc, /not exists \( select 1 from public\.%1\$I as sibling where sibling\.last_batch_id = batch\.id and sibling\.status = 'opened' \)/i);
  assert.match(rpc, /status = 'confirmed',[\s\S]*confirmed_at = \$2,[\s\S]*last_batch_id = null/i);
  assert.match(rpc, /insert into public\.%3\$I[\s\S]*null, 'confirmed', candidate\.previous_status, 'confirmed'/i);
  assert.match(rpc, /select count\(\*\)::integer from updated_notifications/i);
  assert.match(rpc, /revoke all on function public\.register_prior_notifications\(text, text\[\]\) from public, anon, authenticated/i);
  assert.match(rpc, /grant execute on function public\.register_prior_notifications\(text, text\[\]\) to anon, authenticated/i);

  assert.equal(extractPriorNotificationRpc(schema), rpc);
});

test("rentals and cleanings use recoverable deletion and active uniqueness", () => {
  assert.match(app, /rentals"\)\.update\(\{ deleted_at:new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(app, /cleanings"\)\.update\(\{ deleted_at:new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(migration, /cleanings_rental_id_active_uidx/);
  assert.match(migration, /calendar_change_log is append-only/);
});

test("configured production still fails closed on backend outage", () => {
  assert.match(app, /unavailableStore\("No se pudo conectar al calendario compartido"\)/);
  assert.doesNotMatch(app, /Supabase init falló, usando modo local/);
});
