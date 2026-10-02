// scripts/chatTest.js
// Chat interativo no terminal para testar a Joana sem precisar do WhatsApp
// Uso: node scripts/chatTest.js
// Digite suas mensagens e pressione Enter. Digite "sair" para encerrar.

require("dotenv").config();
const readline = require("readline");
const ai = require("../ai");

const CONTEXTO_TESTE = {
    chatId: "teste-terminal",
    nome: "Testador",
    telefone: "21999999999"
};

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

console.log("\n========================================");
console.log("  JOANA — Modo de Teste (Terminal)");
console.log("========================================");
console.log("  Converse com a Joana como se fosse");
console.log("  um cliente no WhatsApp.");
console.log("  Digite 'sair' para encerrar.");
console.log("  Digite 'limpar' para nova conversa.");
console.log("========================================\n");

function pergunta() {
    rl.question("Você: ", async (texto) => {
        texto = texto.trim();

        if (!texto) {
            return pergunta();
        }

        if (texto.toLowerCase() === "sair") {
            console.log("\nEncerrando teste. Até mais!\n");
            rl.close();
            process.exit(0);
        }

        if (texto.toLowerCase() === "limpar") {
            ai.limparHistorico(CONTEXTO_TESTE.chatId);
            console.log("\n[Conversa reiniciada]\n");
            return pergunta();
        }

        try {
            process.stdout.write("\nJoana: ");
            const resposta = await ai.processarMensagem(texto, CONTEXTO_TESTE);
            console.log(resposta);
            console.log();
        } catch (err) {
            console.log(`\n[ERRO] ${err.message}\n`);
        }

        pergunta();
    });
}

pergunta();
