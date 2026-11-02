import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

/// ─────────────────────── Push the app's env to Vercel ──────────────────────
///
/// A preview deploy builds **on Vercel's machines**, so the values in the local
/// `.env` never reach it. `NEXT_PUBLIC_*` in particular are baked into the bundle
/// at build time: if they are missing when the build runs, the deployed app ships
/// with empty contract addresses and looks broken in a way no amount of
/// redeploying fixes.
///
/// **The list is derived from the code, not maintained by hand.** It greps `src/`
/// for `process.env.X` and pushes exactly those, so a new variable cannot be
/// forgotten and a script-only secret cannot be pushed by accident. That matters
/// here: `.env` also holds `PRIVATE_KEY` and `DEPLOYER_PRIVATE_KEY`, which the
/// deploy scripts use and the web app must never see.
///
/// Values travel over stdin, not argv, so they do not appear in the process list.
///
///   node scripts/push-vercel-env.mjs [--environment preview]
///
/// Requires `vercel login` first — it cannot authenticate on its own.
const ROOT = process.cwd();
const ENVIRONMENT = process.argv.includes("--environment")
  ? process.argv[process.argv.indexOf("--environment") + 1]
  : "preview";

function readEnv() {
  return Object.fromEntries(
    fs
      .readFileSync(path.join(ROOT, ".env"), "utf8")
      .split(/\r?\n/)
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line))
      .map((line) => {
        const at = line.indexOf("=");
        return [line.slice(0, at).trim(), line.slice(at + 1).trim().replace(/^["']|["']$/g, "")];
      }),
  );
}

/// Every `process.env.X` the app actually reads, found by scanning `src/`.
function requiredNames() {
  const names = new Set();
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx|mjs|js)$/.test(entry.name)) continue;
      const text = fs.readFileSync(full, "utf8");
      for (const match of text.matchAll(/process\.env\.([A-Z_][A-Z0-9_]*)/g)) names.add(match[1]);
    }
  };
  walk(path.join(ROOT, "src"));
  return [...names].sort();
}

const env = readEnv();
const names = requiredNames();

const missing = names.filter((name) => !(name in env) || env[name] === "");
const present = names.filter((name) => env[name]);

console.log(`Environment: ${ENVIRONMENT}`);
console.log(`Variables the app reads: ${names.length}`);
console.log(`  with a value: ${present.length}`);
console.log(`  empty or absent: ${missing.length}${missing.length ? ` (${missing.join(", ")})` : ""}\n`);

// Secrets are never echoed. Only the name and whether it has a value.
let pushed = 0;
let failed = 0;

for (const name of present) {
  const result = spawnSync("npx", ["--no-install", "vercel", "env", "add", name, ENVIRONMENT, "--force", "--yes"], {
    input: env[name],
    encoding: "utf8",
    shell: true,
    cwd: ROOT,
  });

  const ok = result.status === 0;
  if (ok) pushed += 1;
  else failed += 1;

  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}`);
  if (!ok) {
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim().split("\n").slice(-2).join(" ");
    console.log(`        ${output.slice(0, 160)}`);
  }
}

console.log(`\n${pushed} pushed, ${failed} failed.`);

if (failed > 0) {
  console.log("\nA failure here is almost always authentication. Run `vercel login` first —");
  console.log("the CLI cannot sign in non-interactively.");
  process.exitCode = 1;
} else {
  console.log("\nNext: npx vercel deploy --preview");
}
