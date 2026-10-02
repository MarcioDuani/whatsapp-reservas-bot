// scripts/testeIA.js
// Utilitário: testa o processamento de uma mensagem pela IA sem ligar o WhatsApp
// Uso: npm run teste-ia

require("dotenv").config();
const ai = require("../ai");

(async () => {
    const contexto = { chatId: "teste-local-2026", nome: "Carlos", telefone: "21988888888" };
    ai.limparHistorico(contexto.chatId);

    const mensagens = [
        "Olá, gostaria de saber se a casa tá disponível de 15 a 18 de agosto de 2026 e qual o valor",
    ];

    for (const msg of mensagens) {
        console.log(`\n👤 Cliente: "${msg}"`);
        const resposta = await ai.processarMensagem(msg, contexto);
        console.log(`\n🤖 Joana:\n${resposta}\n`);
    }

    process.exit(0);
})();
