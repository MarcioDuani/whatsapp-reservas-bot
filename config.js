// ================================================
// config.js — Configurações centralizadas do bot
// ================================================
require("dotenv").config();

module.exports = {

  // Número que recebe comprovantes de PIX (formato: DDDnumero@c.us)
  // Configure no .env: NUMERO_DONO=5521999999999@c.us
  NUMERO_DONO: process.env.NUMERO_DONO || "",

  // ID da planilha Google Sheets
  // Configure no .env: SPREADSHEET_ID=seu_id_aqui
  SPREADSHEET_ID: process.env.SPREADSHEET_ID || "",

  // Dados do PIX para pagamento do sinal
  CHAVE_PIX: process.env.CHAVE_PIX || "",
  NOME_BENEFICIARIO: process.env.NOME_BENEFICIARIO || "",
  BANCO_PIX: process.env.BANCO_PIX || "",

  // Range das reservas na planilha
  RESERVAS_RANGE: "reservas!A2:H500",
  RESERVAS_APPEND_RANGE: "reservas!A:H",

  // Modelo de IA do Gemini (gemini-3.5-flash: alta cota gratuita e suporte robusto a Function Calling)
  GEMINI_MODEL: process.env.GEMINI_MODEL || "gemini-3.5-flash",

  // Preços e Regras de Diária
  MINIMO_DIARIAS: 2,
  PRECOS: {
    SEMANA: 300,    // Segunda a Quinta
    FIM_DE_SEMANA: 450  // Sexta, Sábado, Domingo
  },

  // Informações da casa
  CASA: {
    capacidade: 11,
    localizacao: "Arraial do Cabo, RJ",
    descricao: "Casa de praia próxima ao mar — ao sair na rua já dá pra ver o mar no horizonte.",
    ideal_para: "Famílias, grupos de amigos, feriados e finais de semana."
  },

  // Rate limiting (em ms) — intervalo mínimo entre respostas para o mesmo chat
  RATE_LIMIT_MS: 1500,

  // Máximo de turnos de histórico mantidos por conversa (3 turnos = 6 mensagens)
  // Otimizado para economizar tokens sem perder o contexto recente
  MAX_HISTORICO_TURNOS: 3,

};
