// ================================================
// tools.js — Ferramentas disponíveis para a IA
// Inclui declarações formais para o Gemini Function Calling
// ================================================
const sheets = require("./sheets");
const logger = require("./logger");
const config = require("./config");
const storage = require("./storage");
const whatsapp = require("./whatsappCloud");


// ================================================
// DECLARAÇÕES FORMAIS DAS TOOLS (para o Gemini)
// ================================================
const functionDeclarations = [
  {
    name: "consultarDisponibilidade",
    description: "Consulta se a casa está disponível para o período desejado e JÁ RETORNA o valor total e o sinal de 30% calculados caso esteja disponível. Use SEMPRE que o cliente informar as datas de check-in e check-out.",
    parameters: {
      type: "OBJECT",
      properties: {
        checkin: { type: "STRING", description: "Data de entrada no formato DD/MM/YYYY. Exemplo: 20/11/2026" },
        checkout: { type: "STRING", description: "Data de saída no formato DD/MM/YYYY. Exemplo: 22/11/2026" }
      },
      required: ["checkin", "checkout"]
    }
  },
  {
    name: "calcularValor",
    description: "Calcula o valor total das diárias para o período (opcional caso consultarDisponibilidade já tenha retornado o valor).",
    parameters: {
      type: "OBJECT",
      properties: {
        checkin: { type: "STRING", description: "Data de entrada no formato DD/MM/YYYY. Exemplo: 20/11/2026" },
        checkout: { type: "STRING", description: "Data de saída no formato DD/MM/YYYY. Exemplo: 22/11/2026" }
      },
      required: ["checkin", "checkout"]
    }
  },
  {
    name: "criarReserva",
    description: "Registra uma nova reserva na planilha. Use SOMENTE após o cliente confirmar explicitamente que quer reservar e informar o nome completo.",
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
    name: "notificarProprietario",
    description: "Envia um aviso imediato para o WhatsApp dos proprietários quando o cliente quiser fechar pacote de feriado (Carnaval, Réveillon, etc.), grupo acima de 11 pessoas ou caso especial que precise do dono.",
    parameters: {
      type: "OBJECT",
      properties: {
        motivo: { type: "STRING", description: "Motivo curto (ex: Pacote Feriado, Grupo > 11 pessoas, Dúvida Especial)" },
        resumo: { type: "STRING", description: "Resumo do pedido do cliente com datas e detalhes" }
      },
      required: ["motivo", "resumo"]
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

  const registros = await sheets.getReservas(chatId);
  const resultado = sheets.analisarPeriodo(checkin, checkout, registros, chatId);

  // Se estiver livre ou alerta_minimo, já calcula o valor oficial e o sinal de 30% na mesma chamada
  // (Economiza 1 requisição inteira ao Gemini!)
  if (resultado.status === "livre" || resultado.status === "alerta_minimo") {
    const valorTotal = sheets.calcularValor(checkin, checkout);
    const sinalPix = Math.ceil(valorTotal * 0.3);

    resultado.valorTotal = valorTotal;
    resultado.sinalPix = sinalPix;
    resultado.moeda = "BRL";

    // Salva a cotação na memória de 24h do cliente
    if (chatId) {
      storage.salvarCotacao(chatId, {
        checkin,
        checkout,
        valorTotal,
        sinal: sinalPix,
        noites: resultado.noites
      });
    }
  }

  logger.info(chatId, "Disponibilidade + Valor:", resultado);
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

  if (chatId) {
    storage.salvarCotacao(chatId, {
      checkin,
      checkout,
      valorTotal: valor,
      sinal,
      noites: null
    });
  }

  return { valor, sinal, moeda: "BRL" };
}


async function criarReserva(args, chatId) {
  const { checkin, checkout, nome } = args;
  // Garante que o telefone salvo seja o telefone real da conversa quando disponível
  const telefone = (chatId && /^\d+$/.test(String(chatId))) ? String(chatId) : (args.telefone || chatId);

  if (!checkin || !checkout || !nome || !telefone) {
    return { erro: "Dados incompletos para criar a reserva (checkin, checkout, nome e telefone são obrigatórios)." };
  }

  // 1. BLINDAGEM DE DISPONIBILIDADE: Revalida na planilha se o período continua livre
  const registros = await sheets.getReservas(chatId);
  const analise = sheets.analisarPeriodo(checkin, checkout, registros, telefone);

  if (analise.status === "ocupado" || analise.status === "erro" || analise.status === "pacote") {
    logger.warn(chatId, "Tentativa de criarReserva bloqueada na revalidação:", analise);
    return {
      sucesso: false,
      erro: analise.mensagem || `Não foi possível registrar: o período está com status "${analise.status}".`
    };
  }

  // 2. BLINDAGEM FINANCEIRA: O código SEMPRE recalcula o valor oficial das diárias,
  // ignorando qualquer preço manipulado que o cliente tenha tentado induzir na conversa!
  const valorOficial = sheets.calcularValor(checkin, checkout);
  if (valorOficial <= 0) {
    return { sucesso: false, erro: "Datas inválidas para cálculo do valor da reserva." };
  }

  if (args.valor && Number(args.valor) !== valorOficial) {
    logger.warn(chatId, `[BLINDAGEM FINANCEIRA] Valor informado pela IA (${args.valor}) difere do valor oficial (${valorOficial}). Usando valor oficial!`);
  }

  logger.info(chatId, "Tool: criarReserva", { checkin, checkout, nome, telefone, valorOficial });

  await sheets.salvarReserva(checkin, checkout, nome, telefone, valorOficial, chatId);

  logger.info(chatId, "Reserva criada com sucesso.");

  const sinal = Math.ceil(valorOficial * 0.3);

  if (chatId) {
    storage.salvarCotacao(chatId, {
      checkin,
      checkout,
      valorTotal: valorOficial,
      sinal,
      noites: analise.noites
    });
    storage.atualizarEstado(chatId, { nome, telefone, estado: "aguardando_pix" });
  }

  return {
    sucesso: true,
    mensagem: `Reserva de ${nome} registrada para ${checkin} a ${checkout}`,
    valorTotal: valorOficial,
    sinalPix: sinal,
    instrucoesPagamento: {
      valorSinal: sinal,
      chavePix: config.CHAVE_PIX,
      nomeBeneficiario: config.NOME_BENEFICIARIO,
      banco: config.BANCO_PIX,
      instrucao: `Faça o PIX de R$ ${sinal} para a chave ${config.CHAVE_PIX} (CPF) — ${config.NOME_BENEFICIARIO} — ${config.BANCO_PIX}. Depois envie o comprovante (foto ou PDF) aqui.`
    }
  };
}


async function notificarProprietario(args, chatId) {
  const { motivo, resumo } = args || {};
  logger.info(chatId, "Tool: notificarProprietario", { motivo, resumo });

  const msgDono =
    `🔔 *[AVISO JOANA — ATENÇÃO DO PROPRIETÁRIO]*\n` +
    `👤 *Cliente/WhatsApp:* ${chatId}\n` +
    `📌 *Motivo:* ${motivo || "Negociação especial"}\n` +
    `📝 *Resumo:* ${resumo || "Cliente solicitou atendimento para condição especial."}`;

  for (const dono of config.NUMEROS_DONOS) {
    try {
      await whatsapp.enviarTexto(dono, msgDono);
    } catch (err) {
      logger.warn(chatId, `Não foi possível enviar alerta para proprietário ${dono}: ${err.message}`);
    }
  }

  return {
    sucesso: true,
    mensagem: "Proprietários notificados com sucesso no WhatsApp."
  };
}


function infoCasa(args, chatId) {
  logger.info(chatId, "Tool: infoCasa");
  return {
    capacidade: "Acomoda até 10 pessoas confortavelmente",
    localizacao: "Arraial do Cabo, RJ — ao sair na rua já dá pra ver o mar no horizonte",
    valores: "Seg-Qui: R$300/diária | Sex-Dom: R$450/diária (mínimo 2 diárias)",
    detalhes: config.CASA.detalhesTexto
  };
}


// ================================================
// REGISTRO E EXECUTOR
// ================================================
const registry = {
  consultarDisponibilidade,
  calcularValor,
  criarReserva,
  notificarProprietario,
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
