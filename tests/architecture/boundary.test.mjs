import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { formatViolation, scanApplicationImports } from "../../scripts/architecture.mjs";

const known = JSON.parse(fs.readFileSync(new URL("./known-violations.json", import.meta.url), "utf8"));

function violations() {
  return scanApplicationImports(fs.readFileSync("app.js", "utf8"));
}

test("scanner allows only the approved remote provider", () => {
  const sample = [
    'await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm")',
    'await import("https://example.com/provider.js")',
    'import helper from "./helper.js"',
  ].join("\n");
  const found = scanApplicationImports(sample);
  assert.deepEqual(found.map((item) => item.imports), ["https://example.com/provider.js", "./helper.js"]);
});

test("known violations have the ratchet schema and unique keys", () => {
  const keys = known.map((item) => `${item.file}:${item.imports}`);
  for (const item of known) {
    for (const field of ["file", "line", "imports", "from_layer", "to_layer", "reason"]) {
      assert.ok(item[field] !== undefined, `Invalid known violation: missing ${field}. See docs/architecture/LAYERS.md`);
    }
  }
  assert.equal(new Set(keys).size, keys.length, "Duplicate known violation keys: keep one entry per file + import.");
});

test("no new architecture violations", () => {
  const all = violations();
  const allowed = new Set(known.map((item) => `${item.file}:${item.imports}`));
  const fresh = all.filter((item) => !allowed.has(`${item.file}:${item.imports}`));
  assert.equal(fresh.length, 0, fresh.map(formatViolation).join("\n"));
});

test("violation baseline only shrinks", () => {
  const all = violations();
  assert.ok(all.length <= known.length, "Violation count increased. Fix a violation; never extend the baseline. See docs/architecture/LAYERS.md");
  const current = new Set(all.map((item) => `${item.file}:${item.imports}`));
  const stale = known.filter((item) => !current.has(`${item.file}:${item.imports}`));
  assert.equal(stale.length, 0, "A known violation was fixed: remove its stale entry from tests/architecture/known-violations.json.");
});
