// scripts/testarWebhook.js
// Utilitário para simular mensagens e testes no Webhook local (porta 3000)
// Uso: node scripts/testarWebhook.js

const fetch = require("node-fetch");
require("dotenv").config();

const PORT = process.env.PORT || 3000;
const URL_WEBHOOK = `http://localhost:${PORT}/webhook`;
const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || "meu_token_secreto_webhook";

async function testarVerificacaoGET() {
  console.log(`\n🔍 1. Testando verificação GET do Webhook (simulação da Meta)...`);
  const url = `${URL_WEBHOOK}?hub.mode=subscribe&hub.challenge=CHALLENGE_TESTE_123&hub.verify_token=${encodeURIComponent(VERIFY_TOKEN)}`;

  try {
    const res = await fetch(url);
    const body = await res.text();
    if (res.status === 200 && body === "CHALLENGE_TESTE_123") {
      console.log(`✅ Validação GET bem-sucedida! Resposta: "${body}"`);
    } else {
      console.log(`❌ Falha na validação GET (Status: ${res.status}): ${body}`);
    }
  } catch (err) {
    console.error(`❌ Erro ao conectar no servidor (o bot está rodando com 'npm start'?):`, err.message);
  }
}

async function testarMensagemPOST(texto = "Olá, tudo bem? Queria saber sobre as datas disponíveis") {
  console.log(`\n💬 2. Simulando envio de mensagem POST de cliente: "${texto}"...`);

  const payload = {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "123456789",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "5521999999999",
                phone_number_id: "123456789012345"
              },
              contacts: [
                {
                  profile: { name: "Cliente Teste" },
                  wa_id: "5521998877665"
                }
              ],
              messages: [
                {
                  from: "5521998877665",
                  id: `wamid.TESTE_${Date.now()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: texto }
                }
              ]
            },
            field: "messages"
          }
        ]
      }
    ]
  };

  try {
    const res = await fetch(URL_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (res.status === 200) {
      console.log(`✅ Evento recebido com sucesso pelo servidor HTTP (Status: 200 OK)!`);
      console.log(`👉 Veja no terminal do bot (npm start) o log do processamento da IA.`);
    } else {
      console.log(`⚠️ Status retornado: ${res.status}`);
    }
  } catch (err) {
    console.error(`❌ Erro na requisição:`, err.message);
  }
}

async function main() {
  await testarVerificacaoGET();
  await testarMensagemPOST();
  console.log("\n========================================");
  console.log("Teste concluído!");
  console.log("========================================\n");
}

main();
