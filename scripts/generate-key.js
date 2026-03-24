#!/usr/bin/env node
// scripts/generate-key.js
/**
 * Script CLI untuk generate API key baru.
 * Gunakan ini saat setup awal atau saat perlu membuat key baru.
 *
 * Usage:
 *   node scripts/generate-key.js
 *   node scripts/generate-key.js --label "client-app" --expires 30
 */

require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const crypto = require("crypto");
const readline = require("readline");

// ─── Parse argumen CLI sederhana ─────────────────────────────────────────────
function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { label: null, expires: null };

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--label" && args[i + 1]) {
      opts.label = args[i + 1];
      i++;
    }
    if (args[i] === "--expires" && args[i + 1]) {
      opts.expires = parseInt(args[i + 1], 10);
      i++;
    }
  }
  return opts;
}

// ─── Generate key ─────────────────────────────────────────────────────────────
function generateKey() {
  return `aki_${crypto.randomBytes(32).toString("hex")}`;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║    Akinator API — Key Generator          ║");
  console.log("╚══════════════════════════════════════════╝\n");

  const args = parseArgs();

  let label = args.label;
  let expires = args.expires;

  // Jika tidak ada argumen, mode interaktif
  if (!label) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    label = await question(rl, "Label untuk key ini (contoh: my-app): ");
    const expiresInput = await question(
      rl,
      "Berlaku berapa hari? (kosongkan = tidak pernah expired): "
    );
    expires = expiresInput ? parseInt(expiresInput, 10) : null;
    rl.close();
  }

  if (!label || !/^[a-zA-Z0-9_-]+$/.test(label)) {
    console.error("❌ Label tidak valid. Gunakan hanya huruf, angka, underscore, dash.");
    process.exit(1);
  }

  const newKey = generateKey();

  // Hitung hash untuk referensi
  const keyHash = crypto.createHash("sha256").update(newKey).digest("hex");

  console.log("\n✅ API Key berhasil digenerate!\n");
  console.log("┌─────────────────────────────────────────────────────────────┐");
  console.log(`│ Label   : ${label.padEnd(50)} │`);
  console.log(`│ API Key : ${newKey.padEnd(50)} │`);
  console.log(`│ Hash    : ${keyHash.slice(0, 16)}... (SHA-256)                          │`);
  console.log(`│ Expires : ${expires ? `${expires} hari dari sekarang` : "Tidak pernah expired"}`.padEnd(63) + "│");
  console.log("└─────────────────────────────────────────────────────────────┘");

  console.log("\n⚠️  PENTING:");
  console.log("   • Simpan key di tempat aman — tidak bisa ditampilkan lagi!");
  console.log("   • Daftarkan key ini ke server via Admin API atau tambahkan di startup:");
  console.log("\n   Cara mendaftarkan via Admin API:");
  console.log(`   curl -X POST http://localhost:3000/admin/keys \\`);
  console.log(`     -H "X-Master-Key: <MASTER_API_KEY>" \\`);
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(`     -d '{"label":"${label}"${expires ? `,"expiresInDays":${expires}` : ""}}'`);
  console.log("\n   Cara test key:");
  console.log(`   curl http://localhost:3000/api/akinator/start \\`);
  console.log(`     -X POST \\`);
  console.log(`     -H "X-API-Key: ${newKey}" \\`);
  console.log(`     -H "Content-Type: application/json" \\`);
  console.log(`     -d '{"language":"en"}'\n`);
}

function question(rl, prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
