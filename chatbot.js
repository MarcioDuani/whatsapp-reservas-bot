// ================================================
// chatbot.js — Entrada principal do bot WhatsApp (SEM IA)
// ================================================
require("dotenv").config();

const config = require("./config");
const logger = require("./logger");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");
const flowHandler = require("./flowHandler");
const fs = require("fs");
const path = require("path");

// Prevenção de crashes por exceções não capturadas
process.on("unhandledRejection", (reason, promise) => {
  console.error("⚠️ [AVISO INTERNO]:", reason?.message || reason);
  logger.error(null, "Unhandled Rejection:", reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  console.error("❌ [ERRO INTERNO]:", err.message);
  logger.error(null, "Uncaught Exception:", err.message);
});

// Fechamento gracioso
async function fecharGraciosamente() {
  console.log("\n🛑 Encerrando bot e salvando sessão do WhatsApp com segurança...");
  try {
    if (client) await client.destroy();
  } catch (_) {}
  process.exit(0);
}

process.on("SIGINT", fecharGraciosamente);
process.on("SIGTERM", fecharGraciosamente);

// Cria pasta de fotos caso não exista
const pastaFotos = path.join(__dirname, 'fotos');
if (!fs.existsSync(pastaFotos)) {
    fs.mkdirSync(pastaFotos);
}

// ================================================
// CLIENTE WHATSAPP
// ================================================
const client = new Client({
  authStrategy: new LocalAuth(),
  authTimeoutMs: 120000,
  puppeteer: {
    headless: true,
    protocolTimeout: 180000,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--disable-gpu"
    ]
  }
});

client.on("qr", qr => {
  qrcode.generate(qr, { small: true });
  logger.info(null, "QR Code gerado — escaneie com o WhatsApp.");
});

client.on("loading_screen", (percent, message) => {
  console.log(`⏳ Sincronizando WhatsApp com o celular: ${percent}% - ${message}`);
});

client.once("authenticated", () => {
  logger.info(null, "Autenticação da sessão realizada com sucesso!");
  console.log("\n🔑 Sessão validada no disco! Finalizando conexão...");
  setTimeout(async () => {
    try {
      if (client.pupPage && !client.info) {
        await client.pupPage.evaluate(() => {
          try {
            if (typeof window.onAppStateHasSyncedEvent === 'function') {
              window.onAppStateHasSyncedEvent();
            }
          } catch (_) {}
        });
      }
    } catch (_) {}
  }, 8000);
});

client.on("auth_failure", msg => {
  logger.error(null, "Falha na autenticação:", msg);
  console.error("❌ Falha na autenticação da sessão:", msg);
});

client.on("ready", () => {
  const numeroConectado = client.info?.wid?.user || "Desconhecido";
  logger.info(null, `BOT ONLINE 🚀 Conectado no WhatsApp: ${numeroConectado}`);
  console.log(`\n========================================`);
  console.log(`🚀 BOT DE REGRAS ONLINE!`);
  console.log(`📱 WhatsApp Conectado: ${numeroConectado}`);
  console.log(`📩 Dono que recebe comprovante: ${config.NUMERO_DONO}`);
  console.log(`========================================\n`);

  // Varredura de carrinhos abandonados a cada 5 minutos
  setInterval(() => {
      flowHandler.varrerSessoesAbandonadas(client);
  }, 5 * 60 * 1000);
});

client.on("disconnected", reason => {
  logger.warn(null, "Bot desconectado:", reason);
  console.log("\n⚠️ Bot desconectado:", reason);
});

client.initialize();


// ================================================
// RATE LIMITING
// ================================================
const ultimoAtendimento = {};

function podeProcesar(chatId) {
  const agora = Date.now();
  const ultimo = ultimoAtendimento[chatId] || 0;
  if (agora - ultimo < config.RATE_LIMIT_MS) return false;
  return true;
}

function registrarAtendimento(chatId) {
  ultimoAtendimento[chatId] = Date.now();
}


// ================================================
// LISTENER DE MENSAGENS
// ================================================
async function lidarComMensagem(msg) {
  try {
    if (!msg || !msg.from) return;
    if (msg.from.endsWith("@g.us") || msg.from.endsWith("@newsletter") || msg.from === "status@broadcast") return;
    if (msg.fromMe) return;

    const tiposIgnorados = ["e2e_notification", "notification_template", "call_log"];
    if (tiposIgnorados.includes(msg.type)) return;

    const chatId = msg.from;

    let telefone = chatId.replace("@c.us", "").replace("@lid", "");
    try {
      const contato = await msg.getContact();
      if (contato && contato.number) {
          telefone = contato.number;
      }
    } catch (e) {
      // Falhou em buscar contato, usa o extraído
    }

    // Define isDono usando o telefone real OU o LID empresarial do dono para bypass
    const isDono = (telefone === config.NUMERO_DONO) || chatId.includes("133723873886227");

    if (!podeProcesar(chatId) && !isDono) {
      logger.warn(chatId, "Rate limit — mensagem ignorada.");
      return;
    }

    const texto = msg.body || "";
    logger.info(chatId, `MSG RECEBIDA: "${texto.substring(0, 100)}"`);
    console.log(`\n💬 Nova mensagem de ${chatId}: "${texto}"${msg.hasMedia ? " [MÍDIA ANEXADA]" : ""}`);

    if (isDono && texto.trim().toUpperCase().startsWith("OK")) {
        await flowHandler.tratarComandoDono(texto, client);
        return;
    }

    // Marca como digitando para ficar humanizado
    try {
      const chat = await msg.getChat();
      await chat.sendStateTyping();
    } catch (_) {}

    // Processa pelo fluxo da máquina de estados (passa o chatId original)
    await flowHandler.processarMensagemCliente(texto, msg, client, chatId);
    
    registrarAtendimento(chatId);

  } catch (err) {
    console.error("❌ Erro ao responder mensagem:", err);
    logger.error(msg?.from || "?", "Erro no listener de mensagem:", err?.message || err);
  }
}

client.on("message", lidarComMensagem);
