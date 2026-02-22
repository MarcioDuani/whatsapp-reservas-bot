// ================================================
// chatbot.js — Entrada principal do bot WhatsApp
// ================================================
require("dotenv").config();

const ai = require("./ai");
const config = require("./config");
const logger = require("./logger");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

// ================================================
// CLIENTE WHATSAPP
// ================================================
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: { headless: true }
});

client.on("qr", qr => {
  qrcode.generate(qr, { small: true });
  logger.info(null, "QR Code gerado — escaneie com o WhatsApp.");
});

client.on("ready", () => {
  logger.info(null, "BOT ONLINE 🚀");
});

client.on("disconnected", reason => {
  logger.warn(null, "Bot desconectado:", reason);
});

client.initialize();


// ================================================
// RATE LIMITING — evita flood / duplos envios
// ================================================
const ultimoAtendimento = {}; // { chatId: timestamp }

function podeProcesar(chatId) {
  const agora = Date.now();
  const ultimo = ultimoAtendimento[chatId] || 0;
  if (agora - ultimo < config.RATE_LIMIT_MS) return false;
  ultimoAtendimento[chatId] = agora;
  return true;
}


// ================================================
// LISTENER DE MENSAGENS
// ================================================
client.on("message", async msg => {
  try {

    // --- FILTROS ---
    // Ignorar mensagens de grupos e newsletters
    if (!msg.from || msg.from.endsWith("@g.us")) return;
    if (msg.from.endsWith("@newsletter")) return;
    if (msg.from === "status@broadcast") return;

    // Ignorar mensagens do próprio bot
    if (msg.fromMe) return;

    // Ignorar tipos de sistema (notificações, eventos)
    const tiposIgnorados = ["e2e_notification", "notification_template", "call_log"];
    if (tiposIgnorados.includes(msg.type)) return;

    const chatId = msg.from;

    // Rate limiting
    if (!podeProcesar(chatId)) {
      logger.warn(chatId, "Rate limit — mensagem ignorada.");
      return;
    }

    const texto = msg.body || "";
    logger.info(chatId, `MSG RECEBIDA: "${texto.substring(0, 100)}"`);

    // --- DADOS DO CONTATO ---
    const contato = await msg.getContact();
    const nome = contato.pushname || "Cliente";
    const telefone = contato.number;

    const contexto = { chatId, nome, telefone };

    // ================================================
    // COMPROVANTE PIX — com validação por Gemini Vision
    // ================================================
    if (msg.hasMedia) {

      // Stickers e áudios não são comprovantes — ignora silenciosamente
      if (msg.type === "sticker" || msg.type === "audio" || msg.type === "ptt") return;

      logger.info(chatId, `Mídia recebida (tipo: ${msg.type}) — analisando com Gemini Vision.`);

      // Baixa a imagem e analisa
      const media = await msg.downloadMedia();
      if (!media || !media.data) {
        logger.warn(chatId, "Não foi possível baixar a mídia.");
        return;
      }

      const ehComprovante = await ai.analisarComprovante(media.data, media.mimetype, chatId);

      if (ehComprovante) {
        logger.info(chatId, "Comprovante PIX validado — encaminhando para o dono.");

        // Encaminha para o dono e confirma para o cliente
        await msg.forward(config.NUMERO_DONO);
        ai.limparHistorico(chatId); // ciclo de reserva completo

        return client.sendMessage(
          chatId,
          "Comprovante recebido e validado ✅ Vou confirmar sua reserva em breve. Obrigado!"
        );

      } else {
        logger.info(chatId, "Imagem não é comprovante PIX — orientando cliente.");

        return client.sendMessage(
          chatId,
          "Essa imagem não parece ser um comprovante de PIX 🙂\n" +
          "Por favor, envie o comprovante da transferência para confirmar sua reserva."
        );
      }
    }

    // Ignorar mensagens vazias
    if (!texto.trim()) return;

    // ================================================
    // IA PRINCIPAL
    // ================================================
    // Indicador de digitação enquanto processa
    const chat = await msg.getChat();
    await chat.sendStateTyping();

    const resposta = await ai.processarMensagem(texto, contexto);

    await client.sendMessage(chatId, resposta);

  } catch (err) {
    logger.error(msg?.from || "?", "Erro no listener de mensagem:", err.message);
  }
});
