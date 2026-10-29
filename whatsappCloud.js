// ================================================
// whatsappCloud.js — Cliente oficial WhatsApp Cloud API (Meta)
// ================================================
require("dotenv").config();
const fetch = require("node-fetch");
const FormData = require("form-data");
const config = require("./config");
const logger = require("./logger");

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

/**
 * Normaliza um número de telefone para o padrão internacional sem caracteres especiais
 * Ex: 5521999999999@c.us -> 5521999999999
 */
function normalizarNumero(numero) {
  if (!numero) return "";
  return String(numero).replace("@c.us", "").replace(/\D/g, "").trim();
}

/**
 * Envia uma mensagem de texto via WhatsApp Cloud API
 */
async function enviarTexto(destinatario, texto) {
  const to = normalizarNumero(destinatario);
  if (!to || !texto) return;

  const url = `${GRAPH_API_BASE}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    type: "text",
    text: {
      preview_url: false,
      body: texto
    }
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (!res.ok) {
      logger.error(to, "Erro ao enviar texto via Cloud API:", JSON.stringify(data));
      throw new Error(data?.error?.message || "Erro desconhecido ao enviar mensagem");
    }

    return data;
  } catch (err) {
    logger.error(to, "Falha na requisição de envio de texto:", err.message);
    throw err;
  }
}

/**
 * Marca uma mensagem recebida como lida (mostra o 'check azul' no WhatsApp)
 */
async function marcarComoLida(messageId) {
  if (!messageId) return;
  const url = `${GRAPH_API_BASE}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${config.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId
      })
    });
  } catch (_) {
    // Falha em marcar como lida não deve quebrar o fluxo
  }
}

/**
 * Obtém os detalhes de uma mídia pelo seu ID (URL de download e mimetype)
 */
async function obterInfoMidia(mediaId) {
  const url = `${GRAPH_API_BASE}/${mediaId}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${config.WHATSAPP_TOKEN}`
    }
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Erro ao obter dados da mídia na Meta");
  }

  return data; // { url, mime_type, sha256, file_size, id }
}

/**
 * Faz o download do binário de uma mídia a partir da URL fornecida pela Meta
 * Retorna { buffer, base64, mimeType }
 */
async function baixarMidia(mediaId) {
  const info = await obterInfoMidia(mediaId);
  const mediaUrl = info.url;

  const res = await fetch(mediaUrl, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${config.WHATSAPP_TOKEN}`
    }
  });

  if (!res.ok) {
    throw new Error(`Falha ao baixar binário da mídia (status: ${res.status})`);
  }

  const buffer = await res.buffer();
  const base64 = buffer.toString("base64");
  const mimeType = info.mime_type || "image/jpeg";

  return { buffer, base64, mimeType, id: mediaId };
}

/**
 * Faz upload de um arquivo para a Meta Cloud API para obter um media_id reutilizável
 */
async function uploadMidia(buffer, mimeType, filename = "imagem.jpg") {
  const url = `${GRAPH_API_BASE}/${config.WHATSAPP_PHONE_NUMBER_ID}/media`;

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("file", buffer, {
    filename,
    contentType: mimeType
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.WHATSAPP_TOKEN}`,
      ...form.getHeaders()
    },
    body: form
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message || "Erro no upload da mídia para o WhatsApp");
  }

  return data.id;
}

/**
 * Envia uma imagem para um destinatário
 * Pode ser por mediaId já existente, por buffer (faz upload prévio) ou por link direto
 */
async function enviarImagem(destinatario, { mediaId, buffer, mimeType, caption, filename }) {
  const to = normalizarNumero(destinatario);
  if (!to) return;

  let idFinal = mediaId;

  // Se passou buffer, faz o upload primeiro
  if (!idFinal && buffer) {
    idFinal = await uploadMidia(buffer, mimeType, filename);
  }

  const url = `${GRAPH_API_BASE}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    type: "image",
    image: {
      id: idFinal,
      caption: caption || ""
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${config.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    logger.error(to, "Erro ao enviar imagem via Cloud API:", JSON.stringify(data));
    throw new Error(data?.error?.message || "Erro ao enviar imagem");
  }

  return data;
}

/**
 * Atualiza automaticamente a URL do Webhook na Meta (via Graph API)
 * para não precisar abrir o painel do Meta for Developers ao iniciar o túnel local.
 */
async function atualizarWebhookMeta(webhookUrl) {
  if (!config.WHATSAPP_WABA_ID || !config.WHATSAPP_TOKEN) {
    throw new Error("WHATSAPP_WABA_ID ou WHATSAPP_TOKEN não configurados no .env");
  }

  const url = `${GRAPH_API_BASE}/${config.WHATSAPP_WABA_ID}/subscribed_apps`;

  // Tenta até 3 vezes (pois o túnel recém-criado do Cloudflare pode levar alguns segundos para propagar no DNS)
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${config.WHATSAPP_TOKEN}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          override_callback_uri: webhookUrl,
          verify_token: config.WHATSAPP_VERIFY_TOKEN
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        return true;
      }

      const msgErro = data?.error?.message || JSON.stringify(data);
      if (tentativa < 3) {
        logger.warn(null, `Tentativa ${tentativa}/3 de atualizar Webhook na Meta aguardando propagação do túnel (${msgErro})...`);
        await new Promise(r => setTimeout(r, 3500));
      } else {
        throw new Error(msgErro);
      }
    } catch (err) {
      if (tentativa === 3) throw err;
      await new Promise(r => setTimeout(r, 3500));
    }
  }
}

module.exports = {
  normalizarNumero,
  enviarTexto,
  marcarComoLida,
  obterInfoMidia,
  baixarMidia,
  uploadMidia,
  enviarImagem,
  atualizarWebhookMeta
};
