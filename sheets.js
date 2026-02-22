// ================================================
// sheets.js — Integração com Google Sheets
// ================================================
const { google } = require("googleapis");
const config = require("./config");
const logger = require("./logger");

const auth = new google.auth.GoogleAuth({
  keyFile: "google-credentials.json",
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});


// ================================================
// RETRY automático para chamadas à API do Google
// ================================================
async function comRetry(fn, tentativas = 3, chatId = null) {
  for (let i = 1; i <= tentativas; i++) {
    try {
      return await fn();
    } catch (err) {
      logger.warn(chatId, `Google Sheets tentativa ${i}/${tentativas} falhou:`, err.message);
      if (i === tentativas) throw err;
      await new Promise(r => setTimeout(r, 1000 * i)); // backoff: 1s, 2s, 3s
    }
  }
}


// ================================================
// PARSE DE DATA — aceita DD/MM/YYYY e YYYY-MM-DD
// ================================================
function parseData(dataStr) {
  if (!dataStr) return null;

  const str = String(dataStr).trim();

  // Formato DD/MM/YYYY
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(str)) {
    const [d, m, y] = str.split("/").map(Number);
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // Formato YYYY-MM-DD (como vem do Sheets)
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) {
    const [y, m, d] = str.substring(0, 10).split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return isNaN(dt.getTime()) ? null : dt;
  }

  // Fallback
  const dt = new Date(str);
  return isNaN(dt.getTime()) ? null : dt;
}


// ================================================
// LER RESERVAS
// ================================================
async function getReservas(chatId = null) {
  return comRetry(async () => {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: "v4", auth: client });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: config.SPREADSHEET_ID,
      range: config.RESERVAS_RANGE
    });
    return res.data.values || [];
  }, 3, chatId);
}


// ================================================
// ANALISAR SOBREPOSIÇÃO DE PERÍODO
// ================================================
function analisarPeriodo(checkinBR, checkoutBR, registros) {
  const entrada = parseData(checkinBR);
  const saida = parseData(checkoutBR);

  if (!entrada || !saida) {
    return { status: "erro", mensagem: "Datas inválidas." };
  }

  if (saida <= entrada) {
    return { status: "erro", mensagem: "A data de checkout deve ser após o checkin." };
  }

  for (const r of registros) {
    const rIn = parseData(r[0]);
    const rOut = parseData(r[1]);

    if (!rIn || !rOut) continue;

    const status = (r[4] || "").toLowerCase();
    const regra = (r[5] || "").toLowerCase();

    const temSobreposicao = entrada < rOut && saida > rIn;
    if (!temSobreposicao) continue;

    // Bloqueio manual — sempre trava
    if (regra === "bloqueado") {
      return { status: "ocupado", motivo: "bloqueio manual" };
    }

    // Pacote — só aceita datas exatas
    if (regra === "pacote") {
      const datasExatas =
        entrada.getTime() === rIn.getTime() &&
        saida.getTime() === rOut.getTime();

      if (!datasExatas) {
        return {
          status: "pacote",
          inicio: r[0],
          fim: r[1],
          mensagem: "Este período faz parte de um pacote fechado."
        };
      }
      continue;
    }

    // Reserva confirmada — trava
    if (status === "confirmado" || status === "pendente") {
      return { status: "ocupado", motivo: "reserva existente" };
    }
  }

  return { status: "livre" };
}


// ================================================
// CALCULAR VALOR
// ================================================
function calcularValor(checkinBR, checkoutBR) {
  const entrada = parseData(checkinBR);
  const saida = parseData(checkoutBR);

  if (!entrada || !saida || saida <= entrada) return 0;

  let total = 0;
  let data = new Date(entrada);

  while (data < saida) {
    const dia = data.getDay(); // 0=Dom, 5=Sex, 6=Sab
    total += (dia === 0 || dia === 5 || dia === 6)
      ? config.PRECOS.FIM_DE_SEMANA
      : config.PRECOS.SEMANA;
    data.setDate(data.getDate() + 1);
  }

  return total;
}


// ================================================
// SALVAR RESERVA
// ================================================
async function salvarReserva(checkinBR, checkoutBR, nome, telefone, valor, chatId = null) {
  return comRetry(async () => {
    const client = await auth.getClient();
    const sheetsAPI = google.sheets({ version: "v4", auth: client });
    const hoje = new Date().toISOString().split("T")[0];

    // Converter DD/MM/YYYY → YYYY-MM-DD para o Sheets
    function brParaISO(br) {
      const [d, m, y] = br.split("/");
      return `${y}-${m}-${d}`;
    }

    const checkinISO = /\d{4}-\d{2}-\d{2}/.test(checkinBR) ? checkinBR : brParaISO(checkinBR);
    const checkoutISO = /\d{4}-\d{2}-\d{2}/.test(checkoutBR) ? checkoutBR : brParaISO(checkoutBR);

    await sheetsAPI.spreadsheets.values.append({
      spreadsheetId: config.SPREADSHEET_ID,
      range: config.RESERVAS_APPEND_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          checkinISO,
          checkoutISO,
          nome,
          telefone,
          "pendente",     // status
          "",             // regra
          valor,
          hoje
        ]]
      }
    });
  }, 3, chatId);
}


module.exports = {
  getReservas,
  analisarPeriodo,
  calcularValor,
  salvarReserva,
};
