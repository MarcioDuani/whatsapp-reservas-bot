// ================================================
// ai.js — Cérebro do bot com Function Calling nativo,
//          Fallback automático de modelos, Memória 24h
//          e Validação Inteligente de PIX (Foto e PDF)
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
// FALLBACK AUTOMÁTICO DE MODELOS + RETRY
// Se o modelo principal (ex: gemini-2.5-flash) atingir o limite 429 ou 503,
// alterna automaticamente na mesma hora para os modelos de fallback (ex: flash-lite)
// ================================================
async function executarComFallback(fnPorModelo, chatId = "?") {
  const listaModelos = Array.isArray(config.GEMINI_MODELS_FALLBACK) && config.GEMINI_MODELS_FALLBACK.length > 0
    ? config.GEMINI_MODELS_FALLBACK
    : [config.GEMINI_MODEL || "gemini-2.5-flash"];

  let ultimoErro = null;

  for (let idx = 0; idx < listaModelos.length; idx++) {
    const nomeModelo = listaModelos[idx];

    try {
      const resultado = await fnPorModelo(nomeModelo);
      return { resultado, nomeModelo };
    } catch (err) {
      ultimoErro = err;
      const msg = String(err?.message || "");
      const isQuotaOrOverload =
        msg.includes("quota") ||
        msg.includes("429") ||
        msg.includes("503") ||
        msg.includes("high demand") ||
        msg.includes("overloaded") ||
        err?.status === 429 ||
        err?.status === 503;

      if (isQuotaOrOverload && idx < listaModelos.length - 1) {
        const proximoModelo = listaModelos[idx + 1];
        logger.warn(
          chatId,
          `⚠️ Modelo ${nomeModelo} indisponível/limite atingido (${err.status || "429/503"}). Alternando automaticamente para ${proximoModelo}...`
        );
        continue;
      }

      throw err;
    }
  }

  throw ultimoErro;
}


function registrarUsoTokens(response, nomeModelo, chatId) {
  try {
    const usage = response?.usageMetadata;
    if (usage) {
      logger.info(
        chatId,
        `📊 [Tokens | ${nomeModelo}] Entrada: ${usage.promptTokenCount || 0} | Saída: ${usage.candidatesTokenCount || 0} | Total: ${usage.totalTokenCount || 0}`
      );
    }
  } catch (_) {}
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

    // 2. Recupera a última cotação (válida por 24h) caso o histórico tenha expirado
    const ultimaCotacao = storage.getUltimaCotacao(chatId);
    const blocoCotacaoRecente = ultimaCotacao
      ? `\n\n[MEMÓRIA DE COTAÇÃO RECENTE DESTE CLIENTE (ÚLTIMAS 24H)]\n` +
        `Último período cotado por este cliente: ${ultimaCotacao.checkin} a ${ultimaCotacao.checkout}` +
        (ultimaCotacao.noites ? ` (${ultimaCotacao.noites} diárias)` : "") +
        ` | Valor Total: R$ ${ultimaCotacao.valorTotal} | Sinal PIX (30%): R$ ${ultimaCotacao.sinal}.\n` +
        `Se o cliente disser que quer fechar/confirmar sem repetir as datas, utilize esses dados.`
      : "";

    // 3. Configura system prompt dinâmico com dados do cliente + memória de 24h
    const instrucaoDinamica =
      `${systemPrompt}\n\n` +
      `[DADOS DO CLIENTE ATUAL]\n` +
      `Nome no WhatsApp: ${contexto.nome || "Desconhecido"}\n` +
      `Telefone/ID: ${contexto.telefone || contexto.chatId}` +
      blocoCotacaoRecente;

    // 4. Prepara histórico sanitizado (exceto a última mensagem, que acabou de entrar)
    const historico = getHistorico(chatId);
    const historicoParcial = sanitizarHistorico(historico.slice(0, -1));

    logger.info(chatId, `→ Enviando para Gemini: "${texto.substring(0, 80)}"`);

    // 5. Executa o fluxo de chat + function calling com Fallback Automático de Modelos
    const { resultado: textoResposta } = await executarComFallback(async (nomeModelo) => {
      const model = genAI.getGenerativeModel({
        model: nomeModelo,
        systemInstruction: instrucaoDinamica,
        tools: [{ functionDeclarations: tools.functionDeclarations }],
      });

      const chat = model.startChat({
        history: historicoParcial,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 1024,
        }
      });

      let result = await chat.sendMessage(texto);
      let response = result.response;
      registrarUsoTokens(response, nomeModelo, chatId);

      // LOOP DE FUNCTION CALLING
      let rodadas = 0;
      while (response.functionCalls() && response.functionCalls().length > 0 && rodadas < 5) {
        rodadas++;

        const functionCalls = response.functionCalls();
        const functionResults = [];

        for (const fc of functionCalls) {
          logger.info(chatId, `🔧 Tool chamada: ${fc.name}`, fc.args);

          const resultadoTool = await tools.executar(fc.name, fc.args, chatId);

          logger.info(chatId, `✅ Tool resultado: ${fc.name}`, resultadoTool);

          functionResults.push({
            functionResponse: {
              name: fc.name,
              response: resultadoTool
            }
          });
        }

        const funcsTexto = functionResults
          .map(fr => `[Resultado da ferramenta ${fr.functionResponse.name}]: ${JSON.stringify(fr.functionResponse.response)}`)
          .join("\n");

        result = await chat.sendMessage(funcsTexto);
        response = result.response;
        registrarUsoTokens(response, nomeModelo, chatId);
      }

      return response.text();
    }, chatId);

    if (!textoResposta) {
      logger.warn(chatId, "Gemini retornou resposta vazia.");
      storage.removerUltimaMensagem(chatId);
      return "Desculpe, não consegui processar agora 😢 Tente novamente em instantes.";
    }

    // 6. Adiciona a resposta do modelo ao histórico
    adicionarMensagem(chatId, "model", textoResposta);

    logger.info(chatId, `← Resposta Gemini: "${textoResposta.substring(0, 100)}"`);
    return textoResposta;

  } catch (err) {
    logger.error(chatId, "Erro em processarMensagem:", err.message);
    storage.removerUltimaMensagem(chatId);
    return "Tive um problema técnico aqui 😢 Pode tentar novamente em alguns segundos?";
  }
}


// ================================================
// VALIDAÇÃO INTELIGENTE DE COMPROVANTE PIX (Foto e PDF)
// Lê Destinatário, Valor, Pagador, Data e bloqueia Agendamentos
// ================================================
function normalizarTextoComparacao(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

async function analisarComprovante(arquivoBase64, mimeType, chatId = "pix", reservaPendente = null) {
  try {
    logger.info(chatId, `Analisando comprovante (${mimeType || "image/jpeg"}) com Gemini Vision...`);

    const promptAnalise = `
Analise esta imagem ou documento e extraia os dados caso seja um comprovante de pagamento/transferência bancária ou PIX.
Responda APENAS com um objeto JSON válido (sem markdown, sem explicações), exatamente neste formato:
{
  "ehComprovante": true ou false,
  "ehAgendamento": true ou false (true se estiver escrito Agendamento, PIX Agendado ou programado para data futura),
  "valorPago": número decimal do valor em reais (ex: 225.00) ou null se não visível,
  "nomeRecebedor": "nome de quem recebeu o pagamento (destinatário/favorecido)" ou null,
  "nomePagador": "nome de quem enviou/pagou" ou null,
  "instituicaoRecebedor": "nome do banco recebedor" ou null,
  "dataTransacao": "data do pagamento no formato DD/MM/YYYY" ou null
}`;

    const { resultado: textoBruto, nomeModelo } = await executarComFallback(async (modelo) => {
      const model = genAI.getGenerativeModel({ model: modelo });
      const res = await model.generateContent([
        { inlineData: { mimeType: mimeType || "image/jpeg", data: arquivoBase64 } },
        promptAnalise
      ]);
      registrarUsoTokens(res.response, modelo, chatId);
      return res.response.text();
    }, chatId);

    const limpo = textoBruto.replace(/```json/gi, "").replace(/```/g, "").trim();
    logger.info(chatId, `Dados lidos do comprovante (${nomeModelo}): ${limpo}`);

    let dados;
    try {
      dados = JSON.parse(limpo);
    } catch (_) {
      const ehSim = limpo.toUpperCase().includes("TRUE") || limpo.toUpperCase().startsWith("SIM");
      return {
        valido: ehSim,
        motivoRecusa: ehSim ? null : "Essa imagem não parece ser um comprovante de transferência bancária ou PIX 🙂\nPor favor, envie o comprovante do pagamento para garantirmos a sua reserva.",
        dados: {},
        resumoParaDono: null
      };
    }

    // 1. Verifica se é realmente um comprovante
    if (!dados.ehComprovante) {
      return {
        valido: false,
        motivoRecusa: "Esse arquivo não parece ser um comprovante de transferência bancária ou PIX 🙂\nPor favor, envie a foto ou o PDF do comprovante do pagamento para garantirmos a sua reserva.",
        dados
      };
    }

    // 2. Bloqueia PIX Agendado (Golpe comum de agendamento)
    if (dados.ehAgendamento) {
      logger.warn(chatId, "Comprovante recusado: detectado como PIX Agendado.");
      return {
        valido: false,
        motivoRecusa: "Notei que este comprovante consta como um *Agendamento de PIX* 😕\nPara reservarmos as datas, o PIX precisa ser concluído na hora (não agendado). Assim que efetivar a transferência, me envie o comprovante definitivo por aqui!",
        dados
      };
    }

    // 3. Valida o Nome do Recebedor (Beneficiário: Fernando da costa Nascimento e silva)
    if (dados.nomeRecebedor && config.NOME_BENEFICIARIO) {
      const recebedorLido = normalizarTextoComparacao(dados.nomeRecebedor);
      const palavrasBeneficiario = normalizarTextoComparacao(config.NOME_BENEFICIARIO)
        .split(/\s+/)
        .filter(p => p.length > 3); // ex: ["fernando", "costa", "nascimento", "silva"]

      const bateAlgumNome = palavrasBeneficiario.some(palavra => recebedorLido.includes(palavra));
      const bateChavePix = config.CHAVE_PIX && recebedorLido.includes(config.CHAVE_PIX);

      if (!bateAlgumNome && !bateChavePix) {
        logger.warn(chatId, `Comprovante recusado: recebedor lido ("${dados.nomeRecebedor}") não corresponde ao beneficiário ("${config.NOME_BENEFICIARIO}").`);
        return {
          valido: false,
          motivoRecusa:
            `Conferi o comprovante aqui, mas o destinatário consta como *${dados.nomeRecebedor}* 🤔\n` +
            `O pagamento do sinal deve ser enviado para *${config.NOME_BENEFICIARIO}* (Chave CPF: ${config.CHAVE_PIX} — Banco ${config.BANCO_PIX}). Pode verificar se enviou o comprovante certo?`,
          dados
        };
      }
    }

    // 4. Valida o Valor Pago com o Sinal Esperado (30%) da reserva pendente na planilha
    const valorLido = Number(dados.valorPago) || 0;
    const valorSinalEsperado = reservaPendente?.valorSinalEsperado || 0;

    if (valorLido > 0 && valorSinalEsperado > 0) {
      // Tolerância de R$ 2,00 para arredondamentos
      if (valorLido + 2 < valorSinalEsperado) {
        logger.warn(chatId, `Comprovante recusado: valor pago (R$ ${valorLido}) menor que o sinal esperado (R$ ${valorSinalEsperado}).`);
        return {
          valido: false,
          motivoRecusa:
            `Recebi o comprovante, mas o valor nele é de *R$ ${valorLido.toFixed(2).replace(".", ",")}*, enquanto o sinal de 30% da sua reserva (${reservaPendente.checkin} a ${reservaPendente.checkout}) é de *R$ ${valorSinalEsperado.toFixed(2).replace(".", ",")}* 🙂\n` +
            `Por favor, envie o comprovante no valor correto do sinal para confirmarmos sua reserva!`,
          dados
        };
      }
    }

    // 5. Monta o resumo mastigado para o proprietário (incluindo verificação do nome do pagador)
    const nomeCliente = reservaPendente?.nome || "Cliente";
    const nomePagador = dados.nomePagador || "Não identificado";
    let alertaPagador = "";

    if (dados.nomePagador && reservaPendente?.nome) {
      const primeiroNomeCliente = normalizarTextoComparacao(reservaPendente.nome).split(/\s+/)[0];
      const pagadorNorm = normalizarTextoComparacao(dados.nomePagador);
      if (primeiroNomeCliente && !pagadorNorm.includes(primeiroNomeCliente)) {
        alertaPagador = " ⚠️ *(nome diferente do titular da reserva)*";
      }
    }

    const resumoParaDono =
      `👤 *Cliente da reserva:* ${nomeCliente}\n` +
      `💳 *Pagador no PIX:* ${nomePagador}${alertaPagador}\n` +
      `💰 *Valor lido:* ${valorLido > 0 ? `R$ ${valorLido.toFixed(2).replace(".", ",")}` : "Conferir na imagem"}` +
      (valorSinalEsperado > 0 ? ` (Sinal esperado: R$ ${valorSinalEsperado.toFixed(2).replace(".", ",")})` : "") + `\n` +
      `🏦 *Recebedor lido:* ${dados.nomeRecebedor || config.NOME_BENEFICIARIO}\n` +
      (reservaPendente ? `📅 *Período:* ${reservaPendente.checkin} a ${reservaPendente.checkout}\n` : "") +
      (dados.dataTransacao ? `🕒 *Data no comprovante:* ${dados.dataTransacao}` : "");

    return {
      valido: true,
      motivoRecusa: null,
      dados,
      resumoParaDono
    };

  } catch (err) {
    logger.error(chatId, "Erro ao analisar comprovante:", err.message);
    return {
      valido: false,
      motivoRecusa: "Não consegui ler os dados dessa imagem com clareza 😕 Pode enviar uma foto mais nítida ou o arquivo PDF do comprovante?",
      dados: {}
    };
  }
}


module.exports = { processarMensagem, limparHistorico, analisarComprovante };
