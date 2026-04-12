import fs from "node:fs";
import path from "node:path";

const root = path.resolve(process.cwd(), "ui", "src");
const allowedFiles = new Set([
  path.join(root, "lib", "runtime-locale.ts"),
]);

const forbiddenPatterns = [
  { label: "toLocaleString", regex: /\.toLocaleString\(/g },
  { label: "toLocaleDateString", regex: /\.toLocaleDateString\(/g },
  { label: "toLocaleTimeString", regex: /\.toLocaleTimeString\(/g },
  { label: "resolvedOptions().timeZone", regex: /Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/g },
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    files.push(fullPath);
  }
  return files;
}

function lineNumberForIndex(content, index) {
  return content.slice(0, index).split("\n").length;
}

const violations = [];

for (const filePath of walk(root)) {
  if (allowedFiles.has(filePath)) continue;
  const content = fs.readFileSync(filePath, "utf8");
  for (const pattern of forbiddenPatterns) {
    for (const match of content.matchAll(pattern.regex)) {
      violations.push({
        filePath,
        line: lineNumberForIndex(content, match.index ?? 0),
        label: pattern.label,
      });
    }
  }
}

if (violations.length > 0) {
  console.error("i18n guard failed. Use shared locale helpers instead of direct locale APIs:\n");
  for (const violation of violations) {
    console.error(`- ${path.relative(process.cwd(), violation.filePath)}:${violation.line} (${violation.label})`);
  }
  process.exit(1);
}

console.log("i18n guard passed.");
