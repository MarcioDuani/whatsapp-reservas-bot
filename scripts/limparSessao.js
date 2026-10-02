// scripts/limparSessao.js
// Utilitário para limpar a sessão antiga do WhatsApp e histórico em disco
const fs = require("fs");
const path = require("path");

const dirs = [
  path.join(__dirname, "..", ".wwebjs_auth"),
  path.join(__dirname, "..", ".wwebjs_cache")
];

const files = [
  path.join(__dirname, "..", "sessions_store.json")
];

console.log("\n========================================");
console.log("  Limpando sessão antiga do WhatsApp...");
console.log("========================================\n");

for (const dir of dirs) {
  if (fs.existsSync(dir)) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log(`✅ Pasta removida: ${path.basename(dir)}`);
    } catch (err) {
      console.error(`❌ Erro ao remover ${path.basename(dir)} (feche o bot antes de executar):`, err.message);
    }
  }
}

for (const file of files) {
  if (fs.existsSync(file)) {
    try {
      fs.writeFileSync(file, "{}\n", "utf-8");
      console.log(`✅ Arquivo resetado: ${path.basename(file)}`);
    } catch (err) {
      console.error(`❌ Erro ao resetar ${path.basename(file)}:`, err.message);
    }
  }
}

console.log("\n✨ Pronto! Agora ao iniciar com 'npm start', um novo QR Code será gerado para escanear com o novo número.\n");
