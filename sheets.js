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


/**
 * Verifica se um registro com status "pendente" já passou do tempo limite (ex: 60 min)
 * Nota: Só expira automaticamente se a coluna H tiver hora registrada (formato ISO/timestamp)
 */
function pendenteExpirado(dataCadastroStr) {
  if (!dataCadastroStr) return false;
  const str = String(dataCadastroStr).trim();
  // Se tiver apenas YYYY-MM-DD antigo (sem hora), não expira automaticamente para manter compatibilidade
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;

  const dt = new Date(str);
  if (isNaN(dt.getTime())) return false;

  const limiteMs = (config.EXPIRACAO_RESERVA_PENDENTE_MINUTOS || 60) * 60 * 1000;
  return (Date.now() - dt.getTime()) > limiteMs;
}


function telefonesIguais(telA, telB) {
  if (!telA || !telB) return false;
  const a = String(telA).replace(/\D/g, "");
  const b = String(telB).replace(/\D/g, "");
  if (!a || !b) return false;
  return a.includes(b) || b.includes(a);
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
function analisarPeriodo(checkinBR, checkoutBR, registros, telefoneSolicitante = null) {
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
      status: "alerta_minimo",
      noites: noites,
      mensagem: `O período está livre, mas a casa exige o pagamento mínimo de ${minDiarias} diárias.`
    };
  }

  for (const r of registros) {
    const rIn = parseData(r[0]);
    const rOut = parseData(r[1]);

    if (!rIn || !rOut) continue;

    const telRegistro = r[3] || "";
    const status = (r[4] || "").toLowerCase();
    const regra = (r[5] || "").toLowerCase();
    const dataCadastro = r[7] || "";

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

    // Reserva confirmada — sempre trava
    if (status === "confirmado") {
      return { status: "ocupado", motivo: "reserva existente" };
    }

    // Reserva pendente — trava se não estiver expirada e não for do próprio cliente atualizando
    if (status === "pendente") {
      if (pendenteExpirado(dataCadastro)) {
        continue; // Pendente vencido (> 60 min sem PIX) não trava mais a agenda
      }
      if (telefoneSolicitante && telefonesIguais(telRegistro, telefoneSolicitante)) {
        continue; // É a própria pré-reserva pendente do cliente atual
      }
      return { status: "ocupado", motivo: "reserva pendente em andamento" };
    }
  }

  return { status: "livre", noites };
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
  let noites = 0;

  while (data < saida) {
    const dia = data.getDay(); // 0=Dom, 5=Sex, 6=Sab
    total += (dia === 0 || dia === 5 || dia === 6)
      ? config.PRECOS.FIM_DE_SEMANA
      : config.PRECOS.SEMANA;
    data.setDate(data.getDate() + 1);
    noites++;
  }

  // Se alugou menos noites que o mínimo, cobra os próximos dias até dar o mínimo
  const minDiarias = config.MINIMO_DIARIAS || 2;
  while (noites < minDiarias) {
    const dia = data.getDay();
    total += (dia === 0 || dia === 5 || dia === 6)
      ? config.PRECOS.FIM_DE_SEMANA
      : config.PRECOS.SEMANA;
    data.setDate(data.getDate() + 1);
    noites++;
  }

  return total;
}


// ================================================
// SALVAR RESERVA (Com proteção anti-trava: máx 1 pendente por telefone)
// ================================================
async function salvarReserva(checkinBR, checkoutBR, nome, telefone, valor, chatId = null) {
  return comRetry(async () => {
    const client = await auth.getClient();
    const sheetsAPI = google.sheets({ version: "v4", auth: client });
    const agoraISO = new Date().toISOString();

    // Converter DD/MM/YYYY → YYYY-MM-DD para o Sheets
    function brParaISO(br) {
      const [d, m, y] = br.split("/");
      return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    }

    const checkinISO = /\d{4}-\d{2}-\d{2}/.test(checkinBR) ? checkinBR : brParaISO(checkinBR);
    const checkoutISO = /\d{4}-\d{2}-\d{2}/.test(checkoutBR) ? checkoutBR : brParaISO(checkoutBR);

    // Verifica se este cliente já possui uma reserva "pendente" na planilha.
    // Se tiver, atualiza a linha existente em vez de criar múltiplas reservas pendentes (anti-flood de agenda)
    const res = await sheetsAPI.spreadsheets.values.get({
      spreadsheetId: config.SPREADSHEET_ID,
      range: config.RESERVAS_RANGE
    });
    const rows = res.data.values || [];
    let linhaPendenteExistente = -1;

    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const rowStatus = (row[4] || "").toLowerCase();
      if (rowStatus === "pendente" && telefonesIguais(row[3], telefone)) {
        linhaPendenteExistente = i + 2;
        break;
      }
    }

    const novaLinha = [
      checkinISO,
      checkoutISO,
      nome,
      telefone,
      "pendente",     // status
      "",             // regra
      valor,
      agoraISO
    ];

    if (linhaPendenteExistente !== -1) {
      logger.info(chatId, `Atualizando reserva pendente existente do cliente na linha ${linhaPendenteExistente}.`);
      await sheetsAPI.spreadsheets.values.update({
        spreadsheetId: config.SPREADSHEET_ID,
        range: `reservas!A${linhaPendenteExistente}:H${linhaPendenteExistente}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
          values: [novaLinha]
        }
      });
      return;
    }

    await sheetsAPI.spreadsheets.values.append({
      spreadsheetId: config.SPREADSHEET_ID,
      range: config.RESERVAS_APPEND_RANGE,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [novaLinha]
      }
    });
  }, 3, chatId);
}


// ================================================
// BUSCAR RESERVA PENDENTE DO CLIENTE (Para validação de PIX)
// ================================================
async function buscarReservaPendente(telefone_cliente, chatId = null) {
  return comRetry(async () => {
    const rows = await getReservas(chatId);

    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const rowStatus = (row[4] || "").toLowerCase();

      if (rowStatus === "pendente" && telefonesIguais(row[3], telefone_cliente)) {
        const valorTotal = Number(String(row[6] || "0").replace(/[^\d.,]/g, "").replace(",", ".")) || 0;
        const valorSinalEsperado = Math.ceil(valorTotal * 0.3);

        return {
          linha: i + 2,
          checkin: row[0] || "",
          checkout: row[1] || "",
          nome: row[2] || "Cliente",
          telefone: row[3] || telefone_cliente,
          status: rowStatus,
          valorTotal,
          valorSinalEsperado
        };
      }
    }

    return null;
  }, 3, chatId);
}


// ================================================
// CONFIRMAR PAGAMENTO
// ================================================
async function confirmarPagamento(telefone_cliente, chatId = null) {
  return comRetry(async () => {
    const client = await auth.getClient();
    const sheetsAPI = google.sheets({ version: "v4", auth: client });

    // Baixa a planilha para achar a linha
    const res = await sheetsAPI.spreadsheets.values.get({
      spreadsheetId: config.SPREADSHEET_ID,
      range: config.RESERVAS_RANGE // "reservas!A2:H500"
    });

    const rows = res.data.values || [];
    let rowIndexToUpdate = -1;

    // Busca de baixo para cima para pegar a reserva mais recente
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      const rowTelefone = row[3] || "";
      const rowStatus = (row[4] || "").toLowerCase();

      if (telefonesIguais(rowTelefone, telefone_cliente)) {
        if (rowStatus === "pendente") {
          rowIndexToUpdate = i + 2; // +2 porque o array começa no 0 e a planilha começa no A2
          break;
        }
      }
    }

    if (rowIndexToUpdate === -1) {
      logger.warn(chatId, `Nenhuma reserva pendente encontrada para o telefone ${telefone_cliente}`);
      return false;
    }

    // Atualiza a coluna E (Status) para 'confirmado'
    await sheetsAPI.spreadsheets.values.update({
      spreadsheetId: config.SPREADSHEET_ID,
      range: `reservas!E${rowIndexToUpdate}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [["confirmado"]]
      }
    });

    logger.info(chatId, `Reserva da linha ${rowIndexToUpdate} atualizada para confirmado.`);
    return true;
  }, 3, chatId);
}

module.exports = {
  getReservas,
  analisarPeriodo,
  calcularValor,
  salvarReserva,
  buscarReservaPendente,
  confirmarPagamento,
};
