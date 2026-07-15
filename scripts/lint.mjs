import fs from "node:fs";
import { formatViolation, scanApplicationImports } from "./architecture.mjs";

const required = ["index.html", "styles.css", "app.js", "manifest.webmanifest", "schema.sql"];
const failures = required.filter((file) => !fs.existsSync(file)).map((file) => `Missing ${file}: restore the static application contract.`);
const html = fs.readFileSync("index.html", "utf8");
if (!html.includes("styles.css")) failures.push("index.html must load styles.css: keep presentation separate from behavior.");
if (!html.includes("app.js")) failures.push("index.html must load app.js: keep the client entry point explicit.");
const app = fs.readFileSync("app.js", "utf8");
if (!app.includes("initStore")) failures.push("app.js must retain initStore(): UI persistence must stay behind state.store.");
if (!app.includes("upsertCleaning")) failures.push("app.js must retain cleaning persistence: rentals and checkout work must remain coupled.");
failures.push(...scanApplicationImports(app).map(formatViolation));

const appVersion = app.match(/const VERSION\s*=\s*[\"']([^\"']+)[\"']/)?.[1];
const scriptVersion = html.match(/app\.js\?v=([^\"']+)/)?.[1];
const styleVersion = html.match(/styles\.css\?v=([^\"']+)/)?.[1];
if (!appVersion || appVersion !== scriptVersion || appVersion !== styleVersion) {
  failures.push("Asset version mismatch: keep VERSION, app.js?v= and styles.css?v= identical. See docs/golden-principles/STATIC_UI.md");
}

const lines = app.split("\n");
const adapterStart = lines.findIndex((line) => line.includes("function makeSupabaseStore("));
const adapterEnd = lines.findIndex((line) => line.includes("async function initStore("));
if (adapterStart < 0 || adapterEnd <= adapterStart) {
  failures.push("app.js must retain makeSupabaseStore() before initStore(): keep remote data access inside the adapter. See docs/architecture/LAYERS.md");
}
lines.forEach((line, index) => {
  if (line.includes("sb.from(") && !(index > adapterStart && index < adapterEnd)) {
    failures.push(`VIOLATION: app.js:${index + 1} accesses Supabase data outside makeSupabaseStore — application must use state.store. See docs/architecture/LAYERS.md`);
  }
});

if (failures.length) throw new Error(failures.join("\n"));
console.log("Static contract and boundary lint passed.");
