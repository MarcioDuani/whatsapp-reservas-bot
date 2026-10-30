// ================================================
// chatbot.js — Entrada principal do bot WhatsApp (Cloud API Oficial / Meta)
// ================================================
require("dotenv").config();

const express = require("express");
const ai = require("./ai");
const config = require("./config");
const logger = require("./logger");
const sheets = require("./sheets");
const storage = require("./storage");
const whatsapp = require("./whatsappCloud");
const siteAdmin = require("./siteAdmin");

// Prevenção de crashes por exceções não capturadas
process.on("unhandledRejection", (reason) => {
  logger.error(null, "Unhandled Rejection:", reason?.message || reason);
});
process.on("uncaughtException", (err) => {
  logger.error(null, "Uncaught Exception:", err.message);
});

const app = express();
app.use(express.json({ limit: "25mb" }));

// Ativa a Home Page (/), o Painel de Edição (/admin) e as APIs de upload/salvamento
siteAdmin.configurarRotasSiteEAdmin(app);

// ================================================
// 1. ANTI-DUPLICIDADE DE WEBHOOK (IDEMPOTÊNCIA)
// Guarda os últimos 500 IDs de mensagens processadas para nunca responder 2x
// ================================================
const mensagensProcessadas = new Set();

function jaFoiProcessada(messageId) {
  if (!messageId) return false;
  if (mensagensProcessadas.has(messageId)) return true;

  mensagensProcessadas.add(messageId);
  if (mensagensProcessadas.size > 500) {
    const primeiro = mensagensProcessadas.values().next().value;
    mensagensProcessadas.delete(primeiro);
  }
  return false;
}

// ================================================
// 2. AGRUPADOR DE MENSAGENS PICADAS (DEBOUNCE) + FILA POR CLIENTE (MUTEX)
// Evita chamadas simultâneas para o mesmo cliente e junta linhas seguidas
// ================================================
const buffersTexto = {};     // { chatId: { textos: [], timer: Timeout, contexto: {} } }
const filaPorCliente = {};   // { chatId: Promise }

function enfileirarTarefaCliente(chatId, tarefaFn) {
  const anterior = filaPorCliente[chatId] || Promise.resolve();
  const novaPromise = anterior
    .then(() => tarefaFn())
    .catch((err) => {
      logger.error(chatId, "Erro na fila de processamento do cliente:", err.message);
    });
  filaPorCliente[chatId] = novaPromise;
  return novaPromise;
}

// ================================================
// 3. TIMEOUTS ATIVOS (Aviso + Encerramento)
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
        logger.info(chatId, "Timeout ativo estourado. Encerrando atendimento após aviso (mantendo cotação por 24h).");
        ai.limparHistorico(chatId);
        try {
          await whatsapp.enviarTexto(
            chatId,
            "⏱️ Como não tivemos resposta, estou encerrando este atendimento por agora.\nSe quiser retomar a reserva depois, é só me chamar aqui! Tenha um ótimo dia."
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
// PROCESSAMENTO DE COMPROVANTE (IMAGEM OU PDF)
// ================================================
async function processarMidiaComprovante(mediaId, tipoMidia, contexto) {
  const { chatId, nome, telefone } = contexto;
  logger.info(chatId, `Mídia recebida (${tipoMidia}, ID: ${mediaId}) — baixando e analisando com Gemini Vision.`);

  try {
    const media = await whatsapp.baixarMidia(mediaId);

    // Busca reserva pendente na planilha (ou usa a última cotação de 24h como referência)
    let reservaPendente = null;
    try {
      reservaPendente = await sheets.buscarReservaPendente(telefone, chatId);
    } catch (e) {
      logger.warn(chatId, "Não foi possível consultar reserva pendente na planilha:", e.message);
    }

    if (!reservaPendente) {
      const ultimaCotacao = storage.getUltimaCotacao(chatId);
      if (ultimaCotacao) {
        reservaPendente = {
          checkin: ultimaCotacao.checkin,
          checkout: ultimaCotacao.checkout,
          nome: nome,
          telefone: telefone,
          valorTotal: ultimaCotacao.valorTotal,
          valorSinalEsperado: ultimaCotacao.sinal
        };
      }
    }

    // Valida com o Gemini Vision (lê destinatário, valor, pagador e checa se não é agendamento)
    const analise = await ai.analisarComprovante(media.base64, media.mimeType, chatId, reservaPendente);

    if (analise.valido) {
      logger.info(chatId, "Comprovante PIX validado com sucesso — encaminhando para os proprietários.");

      const legendaDono =
        `✅ *[APROVAÇÃO PIX — JOANA]*\n` +
        `📱 *WhatsApp:* ${telefone}\n` +
        (analise.resumoParaDono ? `${analise.resumoParaDono}\n\n` : `👤 *Cliente:* ${nome}\n\n`) +
        `👉 Para confirmar o pagamento na planilha, responda esta mensagem com *OK*.`;

      for (const dono of config.NUMEROS_DONOS) {
        try {
          let envioDono;
          if (tipoMidia === "document") {
            envioDono = await whatsapp.enviarDocumento(dono, {
              mediaId: media.id,
              caption: legendaDono,
              filename: "comprovante-pix.pdf"
            });
          } else {
            envioDono = await whatsapp.enviarImagem(dono, {
              mediaId: media.id,
              caption: legendaDono
            });
          }

          const idEnviado = envioDono?.messages?.[0]?.id;
          if (idEnviado) {
            comprovantesPendentes[idEnviado] = telefone;
          }
        } catch (e) {
          logger.warn(chatId, `Erro ao encaminhar comprovante para dono ${dono}: ${e.message}`);
        }
      }

      comprovantesPendentes["ultimo"] = telefone;
      ai.limparHistorico(chatId);

      await whatsapp.enviarTexto(
        chatId,
        "Comprovante recebido e conferido com sucesso! ✅ Já encaminhei para o proprietário fazer a confirmação final. Assim que ele der o OK, você receberá a confirmação definitiva da sua reserva por aqui. Muito obrigado! 🏖️"
      );

    } else {
      logger.info(chatId, "Comprovante recusado pela validação inteligente.");
      await whatsapp.enviarTexto(
        chatId,
        analise.motivoRecusa ||
          "Esse arquivo não parece ser um comprovante de transferência bancária ou PIX válido 🙂\nPor favor, envie o comprovante correto para garantirmos a sua reserva."
      );
    }

  } catch (err) {
    logger.error(chatId, "Erro no fluxo de comprovante:", err.message);
    await whatsapp.enviarTexto(
      chatId,
      "Recebi seu arquivo! Já estamos verificando os dados para confirmar sua reserva. Muito obrigado! 🙂"
    );
  }
}


// ================================================
// PROCESSAMENTO DE TEXTO AGRUPADO DO CLIENTE
// ================================================
async function processarTextoClienteAgrupado(textoCompleto, contexto) {
  const { chatId } = contexto;

  // 1. Limite de tamanho de mensagem (proteção contra textos gigantes)
  const maxChars = config.MAX_CARACTERES_MENSAGEM || 1000;
  let textoFinal = textoCompleto.trim();
  if (textoFinal.length > maxChars) {
    logger.warn(chatId, `Mensagem muito longa (${textoFinal.length} chars). Truncando para ${maxChars} chars.`);
    textoFinal = textoFinal.substring(0, maxChars);
  }

  // 2. Limite de mensagens por sessão (proteção anti-curioso / anti-abuso de cota)
  const maxMsgsSessao = config.MAX_MENSAGENS_SESSAO || 15;
  const contadorAtual = storage.getContadorSessao(chatId);
  if (contadorAtual >= maxMsgsSessao) {
    logger.warn(chatId, `Cliente atingiu o limite de ${maxMsgsSessao} mensagens na sessão sem concluir reserva.`);
    await whatsapp.enviarTexto(
      chatId,
      "Já te passei as informações principais por aqui! 😊 Para dúvidas mais específicas ou condições especiais, já avisei o proprietário e ele continuará o seu atendimento em instantes."
    );
    return;
  }

  // 3. Processa com a IA (Gemini)
  const resposta = await ai.processarMensagem(textoFinal, contexto);
  await whatsapp.enviarTexto(chatId, resposta);

  // Reinicia o monitor de inatividade
  iniciarTimeout(chatId);
}


// ================================================
// PROCESSAMENTO DE MENSAGEM RECEBIDA DO WEBHOOK
// ================================================
async function processarMensagemRecebida(msg, contatoNome) {
  const chatId = whatsapp.normalizarNumero(msg.from);
  if (!chatId) return;

  // 1. Anti-duplicidade: ignora se o mesmo msg.id já foi processado
  if (msg.id && jaFoiProcessada(msg.id)) {
    logger.info(chatId, `Mensagem duplicada ignorada (ID: ${msg.id})`);
    return;
  }

  // 2. Ignora mensagens muito antigas (> 5 minutos atrás) que tenham ficado retidas
  if (msg.timestamp) {
    const idadeSegundos = Math.floor(Date.now() / 1000) - Number(msg.timestamp);
    if (idadeSegundos > 300) {
      logger.warn(chatId, `Mensagem antiga ignorada (${idadeSegundos}s atrás).`);
      return;
    }
  }

  const nome = contatoNome || "Cliente";
  const telefone = chatId;
  const contexto = { chatId, nome, telefone };

  // Marca como lida para mostrar o 'visto' no WhatsApp
  if (msg.id) {
    whatsapp.marcarComoLida(msg.id).catch(() => {});
  }

  // Interrompe contagem de inatividade pois o cliente interagiu
  limparTimeout(chatId);

  // ================================================
  // A) MENSAGEM DE TEXTO
  // ================================================
  if (msg.type === "text") {
    const texto = msg.text?.body || "";
    if (!texto.trim()) return;

    logger.info(chatId, `MSG RECEBIDA: "${texto.substring(0, 100)}"`);

    // --- FLUXO IMEDIATO DE APROVAÇÃO MANUAL DOS DONOS ("OK") ---
    if (config.NUMEROS_DONOS.includes(chatId)) {
      const textoUpper = texto.toUpperCase().trim();

      if (textoUpper === "OK" || textoUpper.startsWith("OK ")) {
        let telCliente = null;
        if (msg.context?.id && comprovantesPendentes[msg.context.id]) {
          telCliente = comprovantesPendentes[msg.context.id];
        }

        if (!telCliente) {
          const matchInline = texto.match(/OK\s+(\d+)/i);
          if (matchInline && matchInline[1]) {
            telCliente = matchInline[1];
          }
        }

        if (!telCliente && comprovantesPendentes["ultimo"]) {
          telCliente = comprovantesPendentes["ultimo"];
        }

        if (telCliente) {
          const atualizou = await sheets.confirmarPagamento(telCliente, chatId);
          if (atualizou) {
            storage.limparCotacao(telCliente);
            await whatsapp.enviarTexto(chatId, "Pagamento confirmado na planilha ✅");

            try {
              const msgCliente =
                "Seu pagamento foi confirmado! 🎉 Sua reserva está 100% garantida.\n\n" +
                "Já deixei abaixo o nosso *Manual de Uso da Casa* com todas as informações importantes para a sua estadia (incluindo acesso, água, chaves e a senha do Wi-Fi):\n\n" +
                `${config.CASA.manualUsoTexto}\n\n` +
                "Em breve entraremos em contato para combinar a entrega das chaves. Qualquer dúvida, estamos à disposição. Boa estadia! 🏖️";
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
            "Não consegui identificar o telefone do cliente. Você pode responder diretamente na foto do comprovante ou digitar 'OK <telefone>' (ex: OK 5521999999999)."
          );
        }
        return;
      }
    }

    // --- AGRUPAMENTO (DEBOUNCE DE 3s) PARA CONVERSA NATURAL ---
    // Se o cliente mandar várias linhas seguidas ("Oi" / "Boa tarde" / "Tem vaga dia 10?"),
    // aguarda 3 segundos e junta tudo em 1 única chamada à IA!
    if (!buffersTexto[chatId]) {
      buffersTexto[chatId] = {
        textos: [],
        timer: null,
        contexto
      };
    }

    buffersTexto[chatId].textos.push(texto.trim());
    buffersTexto[chatId].contexto = contexto;

    if (buffersTexto[chatId].timer) {
      clearTimeout(buffersTexto[chatId].timer);
    }

    const tempoDebounce = config.DEBOUNCE_MS || 3000;
    buffersTexto[chatId].timer = setTimeout(() => {
      const pacote = buffersTexto[chatId];
      delete buffersTexto[chatId];

      if (!pacote || pacote.textos.length === 0) return;

      const textoAgrupado = pacote.textos.join("\n");
      if (pacote.textos.length > 1) {
        logger.info(chatId, `📦 ${pacote.textos.length} mensagens agrupadas em 1 envio: "${textoAgrupado.substring(0, 100)}"`);
      }

      enfileirarTarefaCliente(chatId, () => processarTextoClienteAgrupado(textoAgrupado, pacote.contexto));
    }, tempoDebounce);

    return;
  }

  // ================================================
  // B) MENSAGEM DE IMAGEM (COMPROVANTE PIX EM FOTO)
  // ================================================
  if (msg.type === "image") {
    const mediaId = msg.image?.id;
    if (!mediaId) return;

    enfileirarTarefaCliente(chatId, () => processarMidiaComprovante(mediaId, "image", contexto));
    return;
  }

  // ================================================
  // C) MENSAGEM DE DOCUMENTO (COMPROVANTE PIX EM PDF)
  // ================================================
  if (msg.type === "document") {
    const mediaId = msg.document?.id;
    const mimeType = msg.document?.mime_type || "";
    if (!mediaId) return;

    if (mimeType.includes("pdf") || mimeType.includes("image")) {
      enfileirarTarefaCliente(chatId, () => processarMidiaComprovante(mediaId, "document", contexto));
    } else {
      await whatsapp.enviarTexto(
        chatId,
        "Para comprovante de pagamento, por favor envie como *foto (imagem)* ou arquivo *PDF* 🙂"
      );
    }
    return;
  }

  // ================================================
  // D) MENSAGEM DE ÁUDIO (Responde educadamente em vez de deixar no vácuo)
  // ================================================
  if (msg.type === "audio") {
    logger.info(chatId, "Áudio recebido — solicitando mensagem em texto.");
    await whatsapp.enviarTexto(
      chatId,
      "Oi! 😊 Por aqui eu consigo ler apenas mensagens de texto (e fotos/PDF de comprovantes). Você poderia me escrever por texto como posso te ajudar?"
    );
    iniciarTimeout(chatId);
    return;
  }

  // Figurinhas (stickers) continuam ignoradas silenciosamente
  if (msg.type === "sticker") {
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

// Rota de conferência e health check do servidor
app.get("/status", (req, res) => {
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
app.listen(PORT, "0.0.0.0", (err) => {
  if (err) {
    logger.error(null, `Erro ao iniciar servidor na porta ${PORT}:`, err.message);
    process.exit(1);
  }
  logger.info(null, `BOT ONLINE 🚀 Servidor Webhook rodando na porta ${PORT}`);
  console.log("\n========================================");
  console.log("🚀 BOT ONLINE COM WHATSAPP CLOUD API (META)!");
  console.log(`📡 Servidor HTTP / Webhook ouvindo na porta: ${PORT}`);
  console.log(`🏡 Site da Casa: http://localhost:${PORT}/`);
  console.log(`⚙️  Painel Admin: http://localhost:${PORT}/admin (Senha: ${config.ADMIN_SENHA})`);
  console.log(`🔗 Endpoint de verificação do Webhook: /webhook`);
  console.log("========================================\n");

  iniciarTunelAutomatico(PORT);
});
