import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const sourcePaths = [
  "src/app.js",
  "public/app.js",
  "src/server.js",
  "src/parsers/ylnimeParser.js",
  "src/scrapers/ylnimeClient.js",
  "src/scrapers/animekitaClient.js",
  "src/services/animeService.js",
  "src/services/snapshotStore.js",
  "src/services/adminStore.js",
  "src/routes/animeRoutes.js",
  "src/routes/adminRoutes.js",
  "src/routes/streamProxy.js",
  "src/utils/cache.js",
  "public/js/app.js",
  "public/sw.js",
];

const args = [
  "rea-agents",
  "analyze-javascript-application",
  ".",
  "--format",
  "json",
  ...sourcePaths.flatMap((p) => ["--source-path", p]),
];

console.log("[REA] Menjalankan analisis statis `rea-agents` pada modul NodataNime...");
const rawStdout = execFileSync("npx", args, {
  cwd: rootDir,
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

// Ambil objek JSON Evidence terakhir (setelah baris progres rea_progress jika ada)
const lines = rawStdout
  .split("\n")
  .map((l) => l.trim())
  .filter(Boolean);

let parsedEvidence = null;
for (let i = lines.length - 1; i >= 0; i -= 1) {
  try {
    const candidate = JSON.parse(lines[i]);
    if (!candidate.rea_progress) {
      parsedEvidence = candidate;
      break;
    }
  } catch {
    // Coba parse keseluruhan stdout sebagai JSON multiline
  }
}

if (!parsedEvidence) {
  const firstBrace = rawStdout.indexOf("{\n");
  const payloadText = firstBrace >= 0 ? rawStdout.slice(firstBrace) : rawStdout;
  parsedEvidence = JSON.parse(payloadText);
}

const summaryBundle = {
  analyzer: "rea-agents analyze-javascript-application",
  reaVersion: "6.7.0",
  verifiedAt: new Date().toISOString(),
  targetAudited: "NodataNime (/home/user/NodataNime)",
  inventoriedSourcePaths: sourcePaths,
  fileCount: sourcePaths.length,
  topLevelEvidenceKeys: Object.keys(parsedEvidence),
  artifactSummary: parsedEvidence.artifact || parsedEvidence.application || null,
  diagnosticsCount: Array.isArray(parsedEvidence.diagnostics)
    ? parsedEvidence.diagnostics.length
    : 0,
};

const outPath = path.join(rootDir, "docs/rea/nodatanime-rea-evidence.json");
fs.writeFileSync(outPath, JSON.stringify(summaryBundle, null, 2), "utf8");
console.log(`[REA] Berhasil memverifikasi ${sourcePaths.length} modul -> docs/rea/nodatanime-rea-evidence.json`);
