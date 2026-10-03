// ================================================
// config.js — Configurações centralizadas do bot
// ================================================
require("dotenv").config();

module.exports = {

  // Número que recebe comprovantes de PIX (formato: DDDnumero - APENAS NÚMEROS)
  // Configure no .env: NUMERO_DONO=5521999999999
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

  // Rate limiting (em ms) — intervalo mínimo entre respostas para o mesmo chat
  RATE_LIMIT_MS: 1500


};
