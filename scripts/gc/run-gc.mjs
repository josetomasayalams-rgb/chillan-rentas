import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { formatViolation, scanApplicationImports } from "../architecture.mjs";

const docs = ["ARCHITECTURE.md", "docs/architecture/LAYERS.md", "docs/SECURITY.md", "docs/STACK.md"];
const source = ["app.js", "schema.sql"];
const failures = docs.filter((file) => !fs.existsSync(file)).map((file) => `Documentation drift: missing ${file}`);

const gitAvailable = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { encoding: "utf8" }).status === 0;
function lastChange(file) {
  if (!gitAvailable) return fs.statSync(file).mtimeMs;
  const tracked = spawnSync("git", ["ls-files", "--error-unmatch", "--", file], { encoding: "utf8" });
  if (tracked.status !== 0) return Number.POSITIVE_INFINITY;
  const log = spawnSync("git", ["log", "-1", "--format=%ct", "--", file], { encoding: "utf8" });
  const timestamp = Number(log.stdout.trim());
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp * 1000 : fs.statSync(file).mtimeMs;
}

if (!failures.length) {
  const newestSource = Math.max(...source.map(lastChange));
  const staleDocs = docs.filter((file) => lastChange(file) < newestSource);
  if (staleDocs.length) failures.push(`Documentation drift: review ${staleDocs.join(", ")} after committed source changes.`);
}

const app = fs.readFileSync("app.js", "utf8");
const known = JSON.parse(fs.readFileSync("tests/architecture/known-violations.json", "utf8"));
const knownKeys = new Set(known.map((item) => `${item.file}:${item.imports}`));
const newViolations = scanApplicationImports(app).filter((item) => !knownKeys.has(`${item.file}:${item.imports}`));
failures.push(...newViolations.map(formatViolation));

const principles = fs.readdirSync("docs/golden-principles").filter((file) => file.endsWith(".md"));
if (principles.length < 3) failures.push("Documentation drift: keep at least three focused golden-principle documents with DO/DON'T examples.");

const layers = fs.readFileSync("docs/architecture/LAYERS.md", "utf8");
for (const marker of ["state.store", "localStorage", "Supabase", "makeSupabaseStore"]) {
  if (!layers.includes(marker)) failures.push(`Documentation drift: docs/architecture/LAYERS.md no longer describes ${marker}.`);
}

const html = fs.readFileSync("index.html", "utf8");
const appVersion = app.match(/const VERSION\s*=\s*[\"']([^\"']+)[\"']/)?.[1];
const scriptVersion = html.match(/app\.js\?v=([^\"']+)/)?.[1];
const styleVersion = html.match(/styles\.css\?v=([^\"']+)/)?.[1];
if (!appVersion || appVersion !== scriptVersion || appVersion !== styleVersion) failures.push("Pattern drift: asset versions are not synchronized. See docs/golden-principles/STATIC_UI.md");

if (failures.length) throw new Error(failures.join("\n"));
console.log("GC scan passed (architecture, patterns and documentation are current).");
