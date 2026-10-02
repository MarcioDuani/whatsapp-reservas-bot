// ================================================
// ai.js — Cérebro do bot com Function Calling nativo
//          e memória real de conversa (multi-turn)
// ================================================
require("dotenv").config();

const { GoogleGenerativeAI } = require("@google/generative-ai");
const tools = require("./tools");
const systemPrompt = require("./contextoCasa");
const config = require("./config");
const logger = require("./logger");
const storage = require("./storage");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");


// ================================================
// RETRY AUTOMÁTICO para rate limit do Gemini
// ================================================
async function geminiComRetry(fn, chatId = "?", tentativas = 3) {
  for (let i = 1; i <= tentativas; i++) {
    try {
      return await fn();
    } catch (err) {
      const isRateLimit = err?.message?.includes("quota") ||
        err?.message?.includes("429") ||
        err?.status === 429;

      if (isRateLimit && i < tentativas) {
        const match = err.message?.match(/retryDelay[":\s]+["']?(\d+)s/);
        const espera = match ? parseInt(match[1]) * 1000 : 12000;

        logger.warn(chatId, `Rate limit — aguardando ${espera / 1000}s antes de tentar novamente (tentativa ${i}/${tentativas})`);
        await new Promise(r => setTimeout(r, espera));
      } else {
        throw err;
      }
    }
  }
}

function getHistorico(chatId) {
  return storage.getHistorico(chatId);
}

function adicionarMensagem(chatId, role, text) {
  storage.adicionarMensagem(chatId, role, text);
}

function limparHistorico(chatId) {
  storage.limparHistorico(chatId);
}


function sanitizarHistorico(hist) {
  if (!Array.isArray(hist) || hist.length === 0) return [];

  const limpo = [];
  for (const msg of hist) {
    if (!msg || !msg.role || !msg.parts) continue;

    // O primeiro item do histórico DEVE ter o role 'user'
    if (limpo.length === 0 && msg.role !== "user") continue;

    // Evita dois turnos consecutivos do mesmo role
    if (limpo.length > 0 && limpo[limpo.length - 1].role === msg.role) {
      limpo[limpo.length - 1] = msg;
      continue;
    }

    limpo.push(msg);
  }

  return limpo;
}


// ================================================
// MOTOR PRINCIPAL
// ================================================
async function processarMensagem(texto, contexto = {}) {
  const chatId = contexto.chatId || "unknown";

  try {
    // 1. Adiciona a mensagem do usuário ao histórico
    adicionarMensagem(chatId, "user", texto);

    // 2. Configura o modelo com system prompt e function declarations
    const model = genAI.getGenerativeModel({
      model: config.GEMINI_MODEL,
      systemInstruction: systemPrompt,
      tools: [{ functionDeclarations: tools.functionDeclarations }],
    });

    // 3. Inicia o chat com o histórico sanitizado (exceto a última mensagem, que acabou de entrar)
    const historico = getHistorico(chatId);
    const historicoParcial = sanitizarHistorico(historico.slice(0, -1));

    const chat = model.startChat({
      history: historicoParcial,
      generationConfig: {
        temperature: 0.3,   // mais rápido e direto
        maxOutputTokens: 350, // reduz drasticamente a latência de geração
      }
    });

    // 4. Envia a mensagem atual
    logger.info(chatId, `→ Enviando para Gemini: "${texto.substring(0, 80)}"`);
    let result = await geminiComRetry(() => chat.sendMessage(texto), chatId);
    let response = result.response;

    // ================================================
    // 5. LOOP DE FUNCTION CALLING
    //    A IA pode pedir múltiplas ferramentas em sequência
    // ================================================
    let rodadas = 0;
    while (response.functionCalls() && response.functionCalls().length > 0 && rodadas < 5) {
      rodadas++;

      const functionCalls = response.functionCalls();
      const functionResults = [];

      for (const fc of functionCalls) {
        logger.info(chatId, `🔧 Tool chamada: ${fc.name}`, fc.args);

        const resultado = await tools.executar(fc.name, fc.args, chatId);

        logger.info(chatId, `✅ Tool resultado: ${fc.name}`, resultado);

        functionResults.push({
          functionResponse: {
            name: fc.name,
            response: resultado
          }
        });
      }

      // Retorna os resultados para o Gemini continuar o raciocínio
      result = await geminiComRetry(() => chat.sendMessage(functionResults), chatId);
      response = result.response;
    }

    // 6. Extrai o texto final
    const textoResposta = response.text();

    if (!textoResposta) {
      logger.warn(chatId, "Gemini retornou resposta vazia.");
      storage.removerUltimaMensagem(chatId);
      return "Desculpe, não consegui processar agora 😢 Tente novamente em instantes.";
    }

    // 7. Adiciona a resposta do modelo ao histórico
    adicionarMensagem(chatId, "model", textoResposta);

    logger.info(chatId, `← Resposta Gemini: "${textoResposta.substring(0, 100)}"`);
    return textoResposta;

  } catch (err) {
    logger.error(chatId, "Erro em processarMensagem:", err.message);
    storage.removerUltimaMensagem(chatId);
    return "Tive um problema técnico aqui 😢 Pode tentar novamente?";
  }
}


// ================================================
// VALIDAÇÃO DE COMPROVANTE PIX (Gemini Vision)
// ================================================
async function analisarComprovante(imagemBase64, mimeType, chatId = "pix") {
  try {
    logger.info(chatId, "Analisando imagem com Gemini Vision...");

    const model = genAI.getGenerativeModel({ model: config.GEMINI_MODEL });

    const result = await geminiComRetry(
      () => model.generateContent([
        { inlineData: { mimeType: mimeType || "image/jpeg", data: imagemBase64 } },
        "Esta imagem é um comprovante de transferência PIX ou depósito bancário? " +
        "Responda apenas SIM ou NÃO. Não explique."
      ]),
      chatId
    );

    const resposta = result.response.text().trim().toUpperCase();
    logger.info(chatId, `Resultado da análise de imagem: ${resposta}`);

    return resposta.startsWith("SIM");

  } catch (err) {
    logger.error(chatId, "Erro ao analisar comprovante:", err.message);
    // Em caso de erro na análise, assumir que NÃO é comprovante (mais seguro)
    return false;
  }
}


module.exports = { processarMensagem, limparHistorico, analisarComprovante };
