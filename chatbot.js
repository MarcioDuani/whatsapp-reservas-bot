// ================================================
// chatbot.js — Entrada principal do bot WhatsApp (Cloud API Oficial / Meta)
// ================================================
require("dotenv").config();

const express = require("express");
const ai = require("./ai");
const config = require("./config");
const logger = require("./logger");
const sheets = require("./sheets");
const whatsapp = require("./whatsappCloud");

// Prevenção de crashes por exceções não capturadas
process.on("unhandledRejection", (reason, promise) => {
  logger.error(null, "Unhandled Rejection:", reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  logger.error(null, "Uncaught Exception:", err.message);
});

const app = express();
app.use(express.json());

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
// TIMEOUTS ATIVOS (Aviso + Encerramento)
// ================================================
const timeoutsAviso = {};
const timeoutsEncerramento = {};

function limparTimeout(chatId) {
  if (timeoutsAviso[chatId]) {
    clearTimeout(timeoutsAviso[chatId]);
    delete timeoutsAviso[chatId];
  }
  if (timeoutsEncerramento[chatId]) {
    clearTimeout(timeoutsEncerramento[chatId]);
    delete timeoutsEncerramento[chatId];
  }
}

function iniciarTimeout(chatId) {
  limparTimeout(chatId);
  const tempoAvisoMs = (config.EXPIRACAO_SESSAO_MINUTOS || 5) * 60 * 1000;
  const tempoEncerramentoMs = 3 * 60 * 1000;

  timeoutsAviso[chatId] = setTimeout(async () => {
    try {
      await whatsapp.enviarTexto(
        chatId,
        "Oi! 😊 Você ainda está por aí? Gostaria de continuar com o seu atendimento ou tirar mais alguma dúvida?"
      );

      timeoutsEncerramento[chatId] = setTimeout(async () => {
        logger.info(chatId, "Timeout ativo estourado. Encerrando atendimento após aviso.");
        ai.limparHistorico(chatId);
        try {
          await whatsapp.enviarTexto(
            chatId,
            "⏱️ Como não tivemos resposta, estou encerrando este atendimento por agora.\nSe precisar de algo no futuro, é só me chamar novamente! Tenha um ótimo dia."
          );
        } catch (_) {}
      }, tempoEncerramentoMs);

    } catch (_) {}
  }, tempoAvisoMs);
}

// Histórico de comprovantes pendentes por mensagem de aprovação enviada aos donos
// Mapeia { messageIdOuTelefone: telCliente }
const comprovantesPendentes = {};

// ================================================
// PROCESSAMENTO DE MENSAGEM RECEBIDA
// ================================================
async function processarMensagemRecebida(msg, contatoNome) {
  const chatId = whatsapp.normalizarNumero(msg.from);
  if (!chatId) return;

  const nome = contatoNome || "Cliente";
  const telefone = chatId;
  const contexto = { chatId, nome, telefone };

  // Marca como lida para mostrar o 'visto' no WhatsApp
  if (msg.id) {
    whatsapp.marcarComoLida(msg.id).catch(() => {});
  }

  // Rate-limiting
  if (!podeProcesar(chatId)) {
    logger.warn(chatId, "Rate limit — mensagem ignorada.");
    return;
  }

  // Interrompe contagem de inatividade pois o cliente respondeu
  limparTimeout(chatId);

  // ================================================
  // 1. MENSAGEM DE TEXTO
  // ================================================
  if (msg.type === "text") {
    const texto = msg.text?.body || "";
    if (!texto.trim()) return;

    logger.info(chatId, `MSG RECEBIDA: "${texto.substring(0, 100)}"`);

    // --- FLUXO DE APROVAÇÃO MANUAL DOS DONOS ---
    if (config.NUMEROS_DONOS.includes(chatId)) {
      const textoUpper = texto.toUpperCase().trim();

      if (textoUpper === "OK" || textoUpper.startsWith("OK ")) {
        // Tenta achar o telefone do cliente:
        // Opção 1: na mensagem citada (context)
        let telCliente = null;
        if (msg.context?.id && comprovantesPendentes[msg.context.id]) {
          telCliente = comprovantesPendentes[msg.context.id];
        }

        // Opção 2: se digitou "OK 5521999999999"
        if (!telCliente) {
          const matchInline = texto.match(/OK\s+(\d+)/i);
          if (matchInline && matchInline[1]) {
            telCliente = matchInline[1];
          }
        }

        // Opção 3: pega o último cliente pendente registrado
        if (!telCliente && comprovantesPendentes["ultimo"]) {
          telCliente = comprovantesPendentes["ultimo"];
        }

        if (telCliente) {
          const atualizou = await sheets.confirmarPagamento(telCliente, chatId);
          if (atualizou) {
            await whatsapp.enviarTexto(chatId, "Pagamento confirmado na planilha ✅");

            // Avisa o cliente
            try {
              const msgCliente =
                "Seu pagamento foi confirmado! 🎉 Sua reserva está garantida.\n\n" +
                "Em breve entraremos em contato por aqui para combinar a entrega das chaves e acertar os detalhes da sua estadia. Muito obrigado! 🏖️";
              await whatsapp.enviarTexto(telCliente, msgCliente);
            } catch (e) {
              logger.warn(chatId, "Erro ao notificar o cliente: " + e.message);
            }
          } else {
            await whatsapp.enviarTexto(chatId, "Não encontrei nenhuma reserva pendente para esse número na planilha.");
          }
        } else {
          await whatsapp.enviarTexto(
            chatId,
            "Não consegui identificar o telefone do cliente. Você pode responder com 'OK <telefone>' (ex: OK 5521999999999)."
          );
        }
        return;
      }
    }

    // --- RESPOSTA AO CLIENTE VIA IA ---
    const resposta = await ai.processarMensagem(texto, contexto);
    await whatsapp.enviarTexto(chatId, resposta);

    // Reinicia o monitor de inatividade
    iniciarTimeout(chatId);
    return;
  }

  // ================================================
  // 2. MENSAGEM DE IMAGEM (COMPROVANTE PIX)
  // ================================================
  if (msg.type === "image") {
    const mediaId = msg.image?.id;
    if (!mediaId) return;

    logger.info(chatId, `Imagem recebida (ID: ${mediaId}) — baixando e analisando com Gemini Vision.`);

    try {
      // Baixa o binário e obtém o base64
      const media = await whatsapp.baixarMidia(mediaId);

      // Valida com o Gemini Vision se é de fato um comprovante PIX
      const ehComprovante = await ai.analisarComprovante(media.base64, media.mimeType, chatId);

      if (ehComprovante) {
        logger.info(chatId, "Comprovante PIX validado com sucesso — encaminhando para os proprietários.");

        const legendaDono = `[APROVAÇÃO PIX] Cliente: ${nome} (${telefone}).\nPara confirmar o pagamento na planilha, responda esta mensagem com a palavra OK.`;

        // Encaminha a foto do comprovante para todos os donos configurados
        for (const dono of config.NUMEROS_DONOS) {
          try {
            const envioDono = await whatsapp.enviarImagem(dono, {
              mediaId: media.id,
              caption: legendaDono
            });

            // Guarda o ID da mensagem enviada para associar caso o dono responda "OK" diretamente a ela
            const idEnviado = envioDono?.messages?.[0]?.id;
            if (idEnviado) {
              comprovantesPendentes[idEnviado] = telefone;
            }
          } catch (e) {
            logger.warn(chatId, `Erro ao encaminhar comprovante para dono ${dono}: ${e.message}`);
          }
        }

        // Armazena como último cliente pendente para facilitar aprovação
        comprovantesPendentes["ultimo"] = telefone;

        // Limpa o ciclo de conversa atual da IA
        ai.limparHistorico(chatId);

        await whatsapp.enviarTexto(
          chatId,
          "Comprovante recebido e validado com sucesso! ✅ Encaminhei para o proprietário aprovar. Assim que confirmado, você receberá a confirmação definitiva da sua reserva aqui. Muito obrigado! 🏖️"
        );

      } else {
        logger.info(chatId, "A imagem enviada não é um comprovante PIX válido.");
        await whatsapp.enviarTexto(
          chatId,
          "Essa imagem não parece ser um comprovante de transferência bancária ou PIX 🙂\nPor favor, envie o comprovante do pagamento para garantirmos a sua reserva."
        );
      }

    } catch (err) {
      logger.error(chatId, "Erro no fluxo de comprovante de imagem:", err.message);
      await whatsapp.enviarTexto(
        chatId,
        "Recebi seu comprovante! Já estamos verificando os dados para confirmar sua reserva. Muito obrigado! 🙂"
      );
    }
    return;
  }

  // Outros tipos de mensagem (áudio, figurinhas, contatos, localização)
  if (msg.type === "sticker" || msg.type === "audio") {
    // Ignora silenciosamente para não gastar chamadas
    return;
  }
}

// ================================================
// ROTAS DO WEBHOOK (META CLOUD API)
// ================================================

// 1. GET /webhook — Validação da URL no painel do Meta for Developers
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === config.WHATSAPP_VERIFY_TOKEN) {
      logger.info(null, "✅ Webhook verificado com sucesso pelo Meta!");
      console.log("✅ Webhook verificado com sucesso pelo Meta!");
      return res.status(200).send(challenge);
    } else {
      logger.warn(null, "Tentativa de validação do Webhook com token inválido.");
      return res.sendStatus(403);
    }
  }

  return res.sendStatus(400);
});

// 2. POST /webhook — Recebimento de mensagens e notificações em tempo real
app.post("/webhook", async (req, res) => {
  // A Meta EXIGE resposta HTTP 200 rápida, senão ela reenvia o webhook múltiplas vezes
  res.sendStatus(200);

  try {
    const body = req.body;
    console.log("📥 [WEBHOOK RECEBIDO]:", JSON.stringify(body, null, 2));

    if (body.object !== "whatsapp_business_account") {
      return;
    }

    const entry = body.entry?.[0];
    const changes = entry?.changes?.[0];
    const value = changes?.value;

    if (!value) return;

    // Se forem mensagens recebidas
    const messages = value.messages;
    if (messages && messages.length > 0) {
      const contatoNome = value.contacts?.[0]?.profile?.name || "Cliente";

      for (const msg of messages) {
        await processarMensagemRecebida(msg, contatoNome);
      }
    }

  } catch (err) {
    logger.error(null, "Erro ao processar payload do webhook:", err.message);
  }
});

// Rota raiz para conferência e health check do servidor
app.get("/", (req, res) => {
  res.send({
    status: "online",
    bot: "Joana — Chatbot de Reservas (WhatsApp Cloud API)",
    timestamp: new Date().toISOString()
  });
});

// ================================================
// INICIALIZAÇÃO AUTOMÁTICA DO TÚNEL (CLOUDFLARED) + WEBHOOK META
// ================================================
const { spawn } = require("child_process");
let processoTunel = null;

function iniciarTunelAutomatico(port) {
  // Se estiver rodando na nuvem (Render/Railway) ou se AUTO_TUNNEL=false, pula o túnel local
  if (process.env.AUTO_TUNNEL === "false" || process.env.RENDER || process.env.RAILWAY_ENVIRONMENT) {
    return;
  }

  console.log("🌐 Iniciando túnel Cloudflare automaticamente...");

  try {
    processoTunel = spawn("cloudflared", ["tunnel", "--url", `http://localhost:${port}`], {
      windowsHide: true
    });
  } catch (err) {
    logger.warn(null, "Não foi possível iniciar o cloudflared automaticamente:", err.message);
    return;
  }

  let urlDetectada = false;

  const processarSaidaTunel = async (dados) => {
    if (urlDetectada) return;
    const texto = dados.toString();
    const match = texto.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);

    if (match) {
      urlDetectada = true;
      const tunnelUrl = match[0];
      const webhookUrl = `${tunnelUrl}/webhook`;

      console.log(`🔗 Túnel Cloudflare criado: ${tunnelUrl}`);
      console.log(`🔄 Registrando novo Webhook na Meta automaticamente (${webhookUrl})...`);
      logger.info(null, `Túnel Cloudflare ativo em ${tunnelUrl} — atualizando Webhook na Meta.`);

      // Aguarda 3 segundos para o DNS do túnel propagar antes da Meta chamar o GET /webhook
      await new Promise(r => setTimeout(r, 3000));

      try {
        await whatsapp.atualizarWebhookMeta(webhookUrl);
        console.log("========================================");
        console.log("🎉 TUDO PRONTO! Webhook conectado na Meta automaticamente!");
        console.log("📱 A Joana já está online e respondendo no WhatsApp!");
        console.log("========================================\n");
        logger.info(null, `Webhook atualizado automaticamente na Meta para: ${webhookUrl}`);
      } catch (err) {
        console.error("⚠️ Não foi possível atualizar o Webhook automaticamente na Meta:", err.message);
        console.log(`👉 Caso necessário, cole manualmente no painel da Meta: ${webhookUrl}`);
        logger.error(null, "Falha ao atualizar Webhook automaticamente:", err.message);
      }
    }
  };

  processoTunel.stdout.on("data", processarSaidaTunel);
  processoTunel.stderr.on("data", processarSaidaTunel);

  processoTunel.on("error", (err) => {
    logger.warn(null, `Aviso: cloudflared não encontrado ou falhou ao iniciar (${err.message}).`);
  });
}

// Encerra o processo do túnel junto com o servidor quando apertar Ctrl+C
function encerrarTunel() {
  if (processoTunel) {
    try {
      processoTunel.kill();
    } catch (_) {}
  }
}
process.on("exit", encerrarTunel);
process.on("SIGINT", () => { encerrarTunel(); process.exit(0); });
process.on("SIGTERM", () => { encerrarTunel(); process.exit(0); });

// ================================================
// INICIALIZAÇÃO DO SERVIDOR HTTP
// ================================================
const PORT = config.PORT || 3000;
app.listen(PORT, () => {
  logger.info(null, `BOT ONLINE 🚀 Servidor Webhook rodando na porta ${PORT}`);
  console.log("\n========================================");
  console.log("🚀 BOT ONLINE COM WHATSAPP CLOUD API (META)!");
  console.log(`📡 Servidor HTTP / Webhook ouvindo na porta: ${PORT}`);
  console.log(`🔗 Endpoint de verificação do Webhook: /webhook`);
  console.log(`🔑 Verify Token configurado: ${config.WHATSAPP_VERIFY_TOKEN}`);
  console.log("========================================\n");

  iniciarTunelAutomatico(PORT);
});
