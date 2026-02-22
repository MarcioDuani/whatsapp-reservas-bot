// ================================================
// logger.js — Logger estruturado com arquivo de log
// ================================================
const fs = require("fs");
const path = require("path");

const LOGS_DIR = path.join(__dirname, "logs");

function getLogFile() {
    const hoje = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    return path.join(LOGS_DIR, `bot-${hoje}.log`);
}

function formatMsg(nivel, chatId, msg, extra) {
    const ts = new Date().toISOString();
    const chat = chatId ? `[${chatId.replace("@c.us", "")}]` : "[SYS]";
    let linha = `${ts} ${nivel} ${chat} ${msg}`;
    if (extra) {
        const extraStr = typeof extra === "object"
            ? JSON.stringify(extra)
            : String(extra);
        linha += ` | ${extraStr}`;
    }
    return linha;
}

function write(nivel, chatId, msg, extra) {
    const linha = formatMsg(nivel, chatId, msg, extra);
    // Console sempre
    console.log(linha);
    // Arquivo — falha silenciosa para não derrubar o bot
    try {
        fs.appendFileSync(getLogFile(), linha + "\n");
    } catch (_) { }
}

module.exports = {
    info: (chatId, msg, extra) => write("INFO ", chatId, msg, extra),
    warn: (chatId, msg, extra) => write("WARN ", chatId, msg, extra),
    error: (chatId, msg, extra) => write("ERROR", chatId, msg, extra),
};
