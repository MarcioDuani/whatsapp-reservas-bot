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
      logger.info(null, `[Storage] ${Object.keys(sessions).length} sessões carregadas do disco.`);
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
      ultimaInteracao: Date.now(),
      mensagensNaSessao: 0,
      ultimaCotacao: null
    };
  }
  return sessions[chatId];
}

function getHistorico(chatId) {
  const sessao = getSessao(chatId);

  // Verifica expiração por inatividade
  const tempoExpiracaoMs = (config.EXPIRACAO_SESSAO_MINUTOS || 30) * 60 * 1000;
  if (sessao.historico && sessao.historico.length > 0) {
    if (Date.now() - sessao.ultimaInteracao > tempoExpiracaoMs) {
      logger.info(chatId, `Sessão expirada por inatividade (> ${config.EXPIRACAO_SESSAO_MINUTOS || 30} min). Histórico limpo.`);
      sessao.historico = [];
      sessao.estado = "livre";
      sessao.mensagensNaSessao = 0;
      salvar();
    }
  }

  return sessao.historico || [];
}

function adicionarMensagem(chatId, role, text) {
  const sessao = getSessao(chatId);
  if (!sessao.historico) sessao.historico = [];

  sessao.historico.push({ role, parts: [{ text }] });
  sessao.ultimaInteracao = Date.now();

  if (role === "user") {
    sessao.mensagensNaSessao = (sessao.mensagensNaSessao || 0) + 1;
  }

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
  sessao.mensagensNaSessao = 0;
  salvar();
}

/**
 * Salva a última cotação de datas/valores feita pelo cliente (válida por 24h)
 * para que a Joana lembre mesmo se o histórico da conversa expirar após 5-8 min.
 */
function salvarCotacao(chatId, { checkin, checkout, valorTotal, sinal, noites }) {
  const sessao = getSessao(chatId);
  sessao.ultimaCotacao = {
    checkin,
    checkout,
    valorTotal,
    sinal,
    noites,
    timestamp: Date.now()
  };
  salvar();
}

/**
 * Retorna a última cotação se ainda estiver dentro do prazo de validade (padrão 24h)
 */
function getUltimaCotacao(chatId) {
  const sessao = getSessao(chatId);
  if (!sessao.ultimaCotacao || !sessao.ultimaCotacao.timestamp) return null;

  const validadeMs = (config.VALIDADE_COTACAO_HORAS || 24) * 60 * 60 * 1000;
  if (Date.now() - sessao.ultimaCotacao.timestamp > validadeMs) {
    sessao.ultimaCotacao = null;
    salvar();
    return null;
  }

  return sessao.ultimaCotacao;
}

function limparCotacao(chatId) {
  const sessao = getSessao(chatId);
  sessao.ultimaCotacao = null;
  salvar();
}

function getContadorSessao(chatId) {
  // Garante verificação de expiração antes de ler o contador
  getHistorico(chatId);
  const sessao = getSessao(chatId);
  return sessao.mensagensNaSessao || 0;
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
  atualizarEstado,
  salvarCotacao,
  getUltimaCotacao,
  limparCotacao,
  getContadorSessao
};
