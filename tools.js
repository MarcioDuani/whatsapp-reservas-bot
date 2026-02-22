// ================================================
// tools.js — Ferramentas disponíveis para a IA
// Inclui declarações formais para o Gemini Function Calling
// ================================================
const sheets = require("./sheets");
const logger = require("./logger");
const config = require("./config");


// ================================================
// DECLARAÇÕES FORMAIS DAS TOOLS (para o Gemini)
// ================================================
const functionDeclarations = [
  {
    name: "consultarDisponibilidade",
    description: "Consulta se a casa está disponível para o período desejado. Use SEMPRE que o cliente informar as datas de check-in e check-out.",
    parameters: {
      type: "OBJECT",
      properties: {
        checkin: { type: "STRING", description: "Data de entrada no formato DD/MM/YYYY. Exemplo: 20/03/2025" },
        checkout: { type: "STRING", description: "Data de saída no formato DD/MM/YYYY. Exemplo: 25/03/2025" }
      },
      required: ["checkin", "checkout"]
    }
  },
  {
    name: "calcularValor",
    description: "Calcula o valor total da diária para o período. Use após confirmar disponibilidade.",
    parameters: {
      type: "OBJECT",
      properties: {
        checkin: { type: "STRING", description: "Data de entrada no formato DD/MM/YYYY. Exemplo: 20/03/2025" },
        checkout: { type: "STRING", description: "Data de saída no formato DD/MM/YYYY. Exemplo: 25/03/2025" }
      },
      required: ["checkin", "checkout"]
    }
  },
  {
    name: "criarReserva",
    description: "Registra uma nova reserva na planilha. Use SOMENTE após o cliente confirmar explicitamente que quer reservar e o valor já ter sido calculado.",
    parameters: {
      type: "OBJECT",
      properties: {
        checkin: { type: "STRING", description: "Data de entrada no formato DD/MM/YYYY" },
        checkout: { type: "STRING", description: "Data de saída no formato DD/MM/YYYY" },
        nome: { type: "STRING", description: "Nome completo do cliente" },
        telefone: { type: "STRING", description: "Número de telefone do cliente" },
        valor: { type: "NUMBER", description: "Valor total da reserva em reais" }
      },
      required: ["checkin", "checkout", "nome", "telefone", "valor"]
    }
  },
  {
    name: "infoCasa",
    description: "Retorna informações sobre a casa: capacidade, localização e valores. Use quando o cliente perguntar sobre a estrutura ou localização.",
  }
];


// ================================================
// IMPLEMENTAÇÕES
// ================================================

async function consultarDisponibilidade(args, chatId) {
  const { checkin, checkout } = args;

  if (!checkin || !checkout) {
    return { erro: "Datas de checkin e checkout são obrigatórias." };
  }

  logger.info(chatId, "Tool: consultarDisponibilidade", { checkin, checkout });

  const registros = await sheets.getReservas();
  const resultado = sheets.analisarPeriodo(checkin, checkout, registros);

  logger.info(chatId, "Disponibilidade:", resultado);
  return resultado;
}


async function calcularValor(args, chatId) {
  const { checkin, checkout } = args;

  if (!checkin || !checkout) {
    return { erro: "Datas são obrigatórias para calcular o valor." };
  }

  logger.info(chatId, "Tool: calcularValor", { checkin, checkout });

  const valor = sheets.calcularValor(checkin, checkout);

  if (valor <= 0) {
    return { erro: "Período inválido — checkout deve ser após checkin." };
  }

  const sinal = Math.ceil(valor * 0.3);
  logger.info(chatId, "Valor calculado:", { valor, sinal });

  return { valor, sinal, moeda: "BRL" };
}


async function criarReserva(args, chatId) {
  const { checkin, checkout, nome, telefone, valor } = args;

  if (!checkin || !checkout || !nome || !telefone || !valor) {
    return { erro: "Dados incompletos para criar a reserva." };
  }

  logger.info(chatId, "Tool: criarReserva", { checkin, checkout, nome, telefone, valor });

  await sheets.salvarReserva(checkin, checkout, nome, telefone, valor);

  logger.info(chatId, "Reserva criada com sucesso.");

  const sinal = Math.ceil(valor * 0.3);

  return {
    sucesso: true,
    mensagem: `Reserva de ${nome} registrada para ${checkin} a ${checkout}`,
    valorTotal: valor,
    sinalPix: sinal,
    instrucoesPagamento: {
      valorSinal: sinal,
      chavePix: config.CHAVE_PIX,
      nomeBeneficiario: config.NOME_BENEFICIARIO,
      banco: config.BANCO_PIX,
      instrucao: `Faça o PIX de R$ ${sinal} para a chave ${config.CHAVE_PIX} (CPF) — ${config.NOME_BENEFICIARIO} — ${config.BANCO_PIX}. Depois envie o comprovante aqui.`
    }
  };
}


function infoCasa(args, chatId) {
  logger.info(chatId, "Tool: infoCasa");
  return {
    capacidade: "Até 11 pessoas",
    localizacao: "Arraial do Cabo, RJ — visível mar da rua",
    valores: "Seg-Qui: R$300/diária | Sex-Dom: R$450/diária",
    ideal: "Famílias e grupos de amigos"
  };
}


// ================================================
// REGISTRO E EXECUTOR
// ================================================
const registry = {
  consultarDisponibilidade,
  calcularValor,
  criarReserva,
  infoCasa
};


async function executar(toolName, args, chatId) {
  const fn = registry[toolName];

  if (!fn) {
    logger.warn(chatId, `Tool não encontrada: ${toolName}`);
    return { erro: `Ferramenta "${toolName}" não encontrada.` };
  }

  try {
    return await fn(args, chatId);
  } catch (err) {
    logger.error(chatId, `Erro ao executar tool ${toolName}:`, err.message);
    return { erro: `Falha ao executar ${toolName}: ${err.message}` };
  }
}


module.exports = { executar, functionDeclarations };
