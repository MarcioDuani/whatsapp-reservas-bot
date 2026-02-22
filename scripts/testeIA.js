// scripts/testeIA.js
// Utilitário: testa o processamento de uma mensagem pela IA sem ligar o WhatsApp
// Uso: npm run teste-ia

require("dotenv").config({ path: "../.env" });
const ai = require("../ai");

(async () => {
    const contexto = { chatId: "teste-local", nome: "Teste", telefone: "0000000000" };

    const mensagens = [
        "Oi! Queria alugar a casa do dia 10 ao dia 13 de março de 2025",
        "Quero confirmar a reserva!",
    ];

    for (const msg of mensagens) {
        console.log(`\n👤 Cliente: "${msg}"`);
        const resposta = await ai.processarMensagem(msg, contexto);
        console.log(`🤖 Joana: "${resposta}"`);
    }

    process.exit(0);
})();
