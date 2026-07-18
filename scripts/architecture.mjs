const APPROVED_APPLICATION_IMPORTS = new Set([
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm",
]);

const IMPORT = /\b(?:import\s+(?:[^\"'()]*?\s+from\s+)?|import\s*\(|export\s+[^\"'()]*?\s+from\s+)[\"']([^\"']+)[\"']/g;

function targetLayer(specifier) {
  if (/^https?:\/\//.test(specifier)) return "unapproved-provider";
  if (specifier.startsWith(".") || specifier.startsWith("/")) return "local-module";
  return "local-dependency";
}

export function scanApplicationImports(source, file = "app.js") {
  const violations = [];
  for (const match of source.matchAll(IMPORT)) {
    const specifier = match[1];
    if (APPROVED_APPLICATION_IMPORTS.has(specifier)) continue;
    violations.push({
      file,
      line: source.slice(0, match.index).split("\n").length,
      imports: specifier,
      from_layer: "application",
      to_layer: targetLayer(specifier),
    });
  }
  return violations;
}

export function formatViolation(item) {
  return `VIOLATION: ${item.file}:${item.line} imports ${item.imports} — ${item.from_layer} cannot import ${item.to_layer}. See docs/architecture/LAYERS.md`;
}
