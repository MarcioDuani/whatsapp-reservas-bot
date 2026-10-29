// ================================================
// config.js — Configurações centralizadas do bot
// ================================================
require("dotenv").config();

module.exports = {

  // Configurações da WhatsApp Cloud API (Meta)
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN || "",
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  WHATSAPP_WABA_ID: process.env.WHATSAPP_WABA_ID || "2209651766634628",
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN || "meu_token_secreto_webhook",
  PORT: process.env.PORT || 3000,

  // Números que recebem comprovantes de PIX e podem aprovar
  // Suporta NUMEROS_DONOS (separado por vírgula) ou NUMERO_DONO (único)
  NUMEROS_DONOS: (() => {
    const raw = process.env.NUMEROS_DONOS || process.env.NUMERO_DONO || "";
    return raw
      .split(",")
      .map(n => n.replace("@c.us", "").replace(/\D/g, "").trim())
      .filter(n => n.length > 0);
  })(),

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

  // Modelo de IA do Gemini
  GEMINI_MODEL: "gemini-2.5-flash",

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

  // Tempo de inatividade (em minutos) para encerrar a conversa e limpar o histórico
  EXPIRACAO_SESSAO_MINUTOS: 5,

  // Máximo de turnos de histórico mantidos por conversa (4 turnos = 8 mensagens)
  // Reduzido para economizar tokens e evitar rate-limit
  MAX_HISTORICO_TURNOS: 4,

};
