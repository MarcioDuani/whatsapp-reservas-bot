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

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ================================================
// HISTÓRICO POR CHAT (multi-turn em memória)
// Estrutura: { chatId: [{role, parts:[{text}]}] }
// ================================================
const historicos = {};

function getHistorico(chatId) {
  if (!historicos[chatId]) historicos[chatId] = [];
  return historicos[chatId];
}

function adicionarMensagem(chatId, role, text) {
  const hist = getHistorico(chatId);
  hist.push({ role, parts: [{ text }] });

  // Limitar tamanho do histórico para não explodir a janela de contexto
  if (hist.length > config.MAX_HISTORICO_TURNOS * 2) {
    hist.splice(0, 2); // remove o par mais antigo (user + model)
  }
}

function limparHistorico(chatId) {
  historicos[chatId] = [];
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

    // 3. Inicia o chat com o histórico COMPLETO (exceto a última mensagem, que acabou de entrar)
    const historico = getHistorico(chatId);
    const historicoParcial = historico.slice(0, -1); // tudo menos a última (a atual)

    const chat = model.startChat({
      history: historicoParcial,
      generationConfig: {
        temperature: 0.4,   // mais consistente, menos criativo
        maxOutputTokens: 1024,
      }
    });

    // 4. Envia a mensagem atual
    logger.info(chatId, `→ Enviando para Gemini: "${texto.substring(0, 80)}"`);
    let result = await chat.sendMessage(texto);
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
      result = await chat.sendMessage(functionResults);
      response = result.response;
    }

    // 6. Extrai o texto final
    const textoResposta = response.text();

    if (!textoResposta) {
      logger.warn(chatId, "Gemini retornou resposta vazia.");
      return "Desculpe, não consegui processar agora 😢 Tente novamente em instantes.";
    }

    // 7. Adiciona a resposta do modelo ao histórico
    adicionarMensagem(chatId, "model", textoResposta);

    logger.info(chatId, `← Resposta Gemini: "${textoResposta.substring(0, 100)}"`);
    return textoResposta;

  } catch (err) {
    logger.error(chatId, "Erro em processarMensagem:", err.message);
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

    const result = await model.generateContent([
      {
        inlineData: {
          mimeType: mimeType || "image/jpeg",
          data: imagemBase64
        }
      },
      "Esta imagem é um comprovante de transferência PIX ou depósito bancário? " +
      "Responda apenas SIM ou NÃO. Não explique."
    ]);

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
