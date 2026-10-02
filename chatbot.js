// ================================================
// chatbot.js — Entrada principal do bot WhatsApp
// ================================================
require("dotenv").config();

const ai = require("./ai");
const config = require("./config");
const logger = require("./logger");
const storage = require("./storage");
const qrcode = require("qrcode-terminal");
const { Client, LocalAuth } = require("whatsapp-web.js");

// Prevenção de crashes por exceções não capturadas com log visível no console
process.on("unhandledRejection", (reason, promise) => {
  console.error("⚠️ [AVISO INTERNO]:", reason?.message || reason);
  logger.error(null, "Unhandled Rejection:", reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  console.error("❌ [ERRO INTERNO]:", err.message);
  logger.error(null, "Uncaught Exception:", err.message);
});

// Fechamento gracioso para NUNCA travar a sessão nem corromper arquivos no Windows
async function fecharGraciosamente() {
  console.log("\n🛑 Encerrando bot e salvando sessão do WhatsApp com segurança...");
  try {
    if (client) await client.destroy();
  } catch (_) {}
  process.exit(0);
}

process.on("SIGINT", fecharGraciosamente);
process.on("SIGTERM", fecharGraciosamente);

// ================================================
// CLIENTE WHATSAPP
// ================================================
const client = new Client({
  authStrategy: new LocalAuth(),
  authTimeoutMs: 120000, // 2 minutos para carregar com folga sessões grandes
  puppeteer: {
    headless: true,
    protocolTimeout: 180000, // Previne erro "Runtime.callFunctionOn timed out" em máquinas/servidores ocupados
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

  // Fallback definitivo: se em 8 segundos o WhatsApp Web já tiver carregado os modelos internos
  // mas o evento 'change:hasSynced' não tiver disparado por atraso do socket, acionamos a inicialização
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

client.on("change_state", state => {
  console.log(`📡 Estado da conexão: ${state}`);
});

// Timestamp de quando o bot subiu — mensagens anteriores serão ignoradas
let startupTime = Math.floor(Date.now() / 1000);

client.on("ready", () => {
  startupTime = Math.floor(Date.now() / 1000);
  const numeroConectado = client.info?.wid?.user || "Desconhecido";
  logger.info(null, `BOT ONLINE 🚀 Conectado no WhatsApp: ${numeroConectado}`);
  console.log(`\n========================================`);
  console.log(`🚀 BOT ONLINE E 100% PRONTO PARA RESPONDER!`);
  console.log(`📱 WhatsApp Conectado (Sessão): ${numeroConectado}`);
  console.log(`📩 Dono que recebe comprovante: ${config.NUMERO_DONO}`);
  console.log(`========================================\n`);
});

client.on("disconnected", reason => {
  logger.warn(null, "Bot desconectado:", reason);
  console.log("\n⚠️ Bot desconectado:", reason);
});

client.initialize();


// ================================================
// RATE LIMITING — evita flood / duplos envios
// ================================================
const ultimoAtendimento = {}; // { chatId: timestamp }

function podeProcesar(chatId) {
  const agora = Date.now();
  const ultimo = ultimoAtendimento[chatId] || 0;
  if (agora - ultimo < 2000) return false;
  return true;
}

function registrarAtendimento(chatId) {
  ultimoAtendimento[chatId] = Date.now();
}


// ================================================
// LISTENER DE MENSAGENS
// Usa message_create e message para compatibilidade com versões novas do WhatsApp Web
// ================================================
async function lidarComMensagem(msg) {
  try {
    // --- FILTROS ---
    if (!msg || !msg.from) return;
    if (msg.from.endsWith("@g.us") || msg.from.endsWith("@newsletter") || msg.from === "status@broadcast") return;
    if (msg.fromMe) return;

    // Ignorar tipos de sistema (notificações, eventos de ligação)
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
    console.log(`\n💬 Nova mensagem de ${chatId}: "${texto}"`);

    // --- DADOS DO CONTATO (com fallback seguro) ---
    let nome = "Cliente";
    let telefone = chatId.replace("@c.us", "");
    try {
      const contato = await msg.getContact();
      nome = contato?.pushname || contato?.name || "Cliente";
      telefone = contato?.number || telefone;
    } catch (errContato) {
      logger.warn(chatId, "Não foi possível obter dados do contato, usando fallback:", errContato.message);
    }

    const contexto = { chatId, nome, telefone };

    // ================================================
    // COMPROVANTE PIX OU ARQUIVO DE PAGAMENTO
    // Economia de 100% de tokens de visão: encaminha direto para o dono
    // ================================================
    if (msg.hasMedia) {
      // Stickers e áudios não são comprovantes — ignora silenciosamente
      if (msg.type === "sticker" || msg.type === "audio" || msg.type === "ptt") return;

      logger.info(chatId, `Mídia recebida (tipo: ${msg.type}) — encaminhando comprovante para o proprietário.`);
      console.log(`📸 Comprovante recebido de ${nome}. Enviando para o dono (${config.NUMERO_DONO})...`);

      try {
        if (config.NUMERO_DONO) {
          // Baixa a foto/documento recebido
          let media = null;
          try {
            media = await msg.downloadMedia();
          } catch (errDl) {
            console.error("⚠️ Não foi possível baixar binário da imagem:", errDl.message);
          }

          if (media && media.data) {
            // Envia a foto com a legenda dos dados do cliente direto para o seu WhatsApp pessoal
            await client.sendMessage(
              config.NUMERO_DONO,
              media,
              { caption: `📩 *Novo comprovante recebido!*\n👤 *Cliente:* ${nome}\n📱 *Telefone:* ${telefone}` }
            );
            console.log(`✅ Comprovante enviado com sucesso para ${config.NUMERO_DONO}`);
          } else {
            // Se falhar o download do binário, avisa por texto detalhado no WhatsApp do dono
            await client.sendMessage(
              config.NUMERO_DONO,
              `⚠️ *Cliente enviou um comprovante de pagamento*, mas a imagem não pôde ser baixada automaticamente pelo WhatsApp Web.\n👤 *Cliente:* ${nome}\n📱 *Telefone:* ${telefone}\n👉 Verifique a conversa diretamente no aparelho.`
            );
            console.log(`⚠️ Notificação de comprovante enviada em texto para o dono.`);
          }
        }

        ai.limparHistorico(chatId); // ciclo de reserva concluído

        await msg.reply(
          "Comprovante recebido com sucesso! ✅ Já encaminhei para verificação e em instantes você receberá a confirmação definitiva e as instruções de check-in. Muito obrigado! 🏖️"
        );
        registrarAtendimento(chatId);
        return;
      } catch (errMídia) {
        const erroMsg = errMídia?.stack || errMídia?.message || JSON.stringify(errMídia);
        console.error("❌ Erro ao encaminhar comprovante:", erroMsg);
        logger.error(chatId, "Erro ao processar mídia de comprovante:", erroMsg);
        await msg.reply(
          "Recebi seu comprovante! Já estamos verificando para confirmar sua reserva. Muito obrigado! 🙂"
        );
        registrarAtendimento(chatId);
        return;
      }
    }

    // Ignorar mensagens vazias
    if (!texto.trim()) return;

    // ================================================
    // 1. SAUDAÇÃO INICIAL AUTOMÁTICA (100% humanizada e sem gastar IA)
    // Se for o início do atendimento, responde com calor humano e sem delay
    // ================================================
    const historicoAtual = storage.getHistorico(chatId);
    const textoLimpo = texto.toLowerCase().trim();
    const ehSaudacaoPura = /^(oi|ola|olá|bom dia|boa tarde|boa noite|opa|ei|tudo bem|como vai|joana)[\s!.,?]*$/i.test(textoLimpo);

    if (historicoAtual.length === 0 || ehSaudacaoPura) {
      const saudacao = `Olá, tudo bem? Seja bem-vindo(a) à nossa casa de praia em Arraial do Cabo! 🌊🏖️\n\nEu sou a *Joana* e vou te ajudar a fazer a sua reserva! Para começar, me conta: quais datas você gostaria de vir? 😊`;
      
      try {
        const chat = await msg.getChat();
        await chat.sendStateTyping();
      } catch (_) {}

      // Registra a troca no histórico da conversa para manter coerência
      storage.adicionarMensagem(chatId, "user", texto);
      storage.adicionarMensagem(chatId, "model", saudacao);

      await msg.reply(saudacao);
      registrarAtendimento(chatId);
      logger.info(chatId, `← Saudação inicial humanizada enviada direto`);
      console.log(`🤖 Saudação enviada para ${nome} (sem consumo de IA)`);
      return;
    }

    // ================================================
    // 2. IA INTELIGENTE (Quando o cliente fala datas, valores, regras, etc.)
    // ================================================
    try {
      const chat = await msg.getChat();
      await chat.sendStateTyping();
    } catch (_) {}

    const resposta = await ai.processarMensagem(texto, contexto);

    // Usa msg.reply: responde diretamente na conversa do cliente, mesmo com formato @lid ou @c.us
    await msg.reply(resposta);
    registrarAtendimento(chatId);
    logger.info(chatId, `← Resposta enviada com sucesso`);
    console.log(`🤖 Resposta enviada para ${nome}: "${resposta.substring(0, 80)}..."`);

  } catch (err) {
    console.error("❌ Erro ao responder mensagem:", err);
    logger.error(msg?.from || "?", "Erro no listener de mensagem:", err?.message || err);
  }
}

// Usar apenas client.on("message") para não duplicar eventos nem disparar rate limit falso
client.on("message", lidarComMensagem);
