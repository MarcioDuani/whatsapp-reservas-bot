// ================================================
// storage.js — Persistência em disco de conversas e sessões
// Evita perda de histórico e estado ao reiniciar o servidor
// ================================================
const fs = require("fs");
const path = require("path");
const config = require("./config");
const logger = require("./logger");

const FILE_PATH = path.join(__dirname, "sessions_store.json");

let sessions = {};

// Carrega as sessões salvas ao iniciar
function carregar() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = fs.readFileSync(FILE_PATH, "utf-8");
      sessions = JSON.parse(raw);
      logger.info(null, `[Storage] Histórico de ${Object.keys(sessions).length} conversas de clientes carregado do disco.`);
    } else {
      sessions = {};
    }
  } catch (err) {
    logger.error(null, "[Storage] Erro ao carregar arquivo de sessões:", err.message);
    sessions = {};
  }
}

// Salva de forma síncrona/segura
function salvar() {
  try {
    const tempPath = `${FILE_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(sessions, null, 2), "utf-8");
    fs.renameSync(tempPath, FILE_PATH);
  } catch (err) {
    logger.error(null, "[Storage] Erro ao salvar sessões:", err.message);
  }
}

function getSessao(chatId) {
  if (!sessions[chatId]) {
    sessions[chatId] = {
      historico: [],
      estado: "livre",
      nome: null,
      telefone: null,
      ultimaInteracao: Date.now()
    };
  }
  return sessions[chatId];
}

function getHistorico(chatId) {
  const sessao = getSessao(chatId);
  return sessao.historico || [];
}

function adicionarMensagem(chatId, role, text) {
  const sessao = getSessao(chatId);
  if (!sessao.historico) sessao.historico = [];

  sessao.historico.push({ role, parts: [{ text }] });
  sessao.ultimaInteracao = Date.now();

  const maxMensagens = (config.MAX_HISTORICO_TURNOS || 4) * 2;
  if (sessao.historico.length > maxMensagens) {
    sessao.historico.splice(0, 2); // Remove o par mais antigo
  }

  salvar();
}

function limparHistorico(chatId) {
  const sessao = getSessao(chatId);
  sessao.historico = [];
  sessao.estado = "livre";
  salvar();
}

function atualizarEstado(chatId, novosDados) {
  const sessao = getSessao(chatId);
  Object.assign(sessao, novosDados, { ultimaInteracao: Date.now() });
  salvar();
}

function removerUltimaMensagem(chatId) {
  const sessao = getSessao(chatId);
  if (sessao.historico && sessao.historico.length > 0) {
    sessao.historico.pop();
    salvar();
  }
}

// Inicializar carregando dados existentes
carregar();

module.exports = {
  getSessao,
  getHistorico,
  adicionarMensagem,
  limparHistorico,
  removerUltimaMensagem,
  atualizarEstado
};
