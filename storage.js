const fs = require("fs");
const path = require("path");
const logger = require("./logger");

const FILE_PATH = path.join(__dirname, "sessions_store.json");

let sessions = {};

// Carrega as sessões salvas ao iniciar
function carregar() {
  try {
    if (fs.existsSync(FILE_PATH)) {
      const raw = fs.readFileSync(FILE_PATH, "utf-8");
      sessions = JSON.parse(raw);
      logger.info(null, `[Storage] Estado de ${Object.keys(sessions).length} sessões carregadas do disco.`);
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
      estado: "INICIO", // INICIO, MENU_PRINCIPAL, AGUARDANDO_CONFIRMACAO, AGUARDANDO_DADOS, AGUARDANDO_PIX, AGUARDANDO_DONO, ENCERRADO
      reservaTemp: null, // { entrada, saida, valor, dias }
      dadosCliente: { nome: null, telefone: null },
      ultimaInteracao: Date.now()
    };
  }
  return sessions[chatId];
}

function atualizarEstado(chatId, novosDados) {
  const sessao = getSessao(chatId);
  Object.assign(sessao, novosDados, { ultimaInteracao: Date.now() });
  salvar();
}

function resetarSessao(chatId) {
  sessions[chatId] = {
      estado: "INICIO",
      reservaTemp: null,
      dadosCliente: { nome: null, telefone: null },
      ultimaInteracao: Date.now()
  };
  salvar();
}

// Inicializar carregando dados existentes
carregar();

module.exports = {
  getSessao,
  atualizarEstado,
  resetarSessao
};
