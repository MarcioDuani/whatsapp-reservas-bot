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

  const diffMs = saida.getTime() - entrada.getTime();
  const noites = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const minDiarias = config.MINIMO_DIARIAS || 2;

  if (noites < minDiarias) {
    return {
      status: "minimo_diarias",
      noites: noites,
      mensagem: `A casa exige o mínimo de ${minDiarias} diárias para reserva. O cliente pediu apenas ${noites} diária(s).`
    };
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

    // Reserva confirmada — trava (apenas pago/confirmado, 'pendente' deixa a data livre)
    if (status === "confirmado" || status === "pago") {
      return { status: "ocupado", motivo: "reserva existente" };
    }
  }

  return { status: "livre" };
}


// O cálculo de valor agora é gerido centralmente pelo pricing.js
// ================================================
// SALVAR RESERVA
// ================================================
async function salvarReserva(dados) {
  return comRetry(async () => {
    const client = await auth.getClient();
    const sheetsAPI = google.sheets({ version: "v4", auth: client });
    
    // Converter DD/MM/YYYY → YYYY-MM-DD para o Sheets
    function brParaISO(br) {
      if (!br) return "";
      if (br.includes("-")) return br;
      const [d, m, y] = br.split("/");
      return `${y}-${m}-${d}`;
    }

    const checkinISO = brParaISO(dados.check_in);
    const checkoutISO = brParaISO(dados.check_out);

    await sheetsAPI.spreadsheets.values.append({
      spreadsheetId: config.SPREADSHEET_ID,
      range: config.RESERVAS_APPEND_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [[
          checkinISO,
          checkoutISO,
          dados.nome,
          dados.telefone,
          dados.status,     // status
          "",               // regra
          dados.valor,
          dados.data_criacao || new Date().toISOString().split("T")[0]
        ]]
      }
    });
  }, 3);
}


module.exports = {
  getReservas,
  analisarPeriodo,
  salvarReserva,
};
