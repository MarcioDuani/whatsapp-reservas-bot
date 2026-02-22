// scripts/listarModelos.js
// Utilitário: lista os modelos Gemini disponíveis para sua API key
// Uso: npm run listar-modelos

require("dotenv").config({ path: "../.env" });
const fetch = require("node-fetch");

const key = process.env.GEMINI_API_KEY;
if (!key) { console.error("GEMINI_API_KEY não encontrada no .env"); process.exit(1); }

async function listar() {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
    const data = await res.json();

    const modelos = (data.models || [])
        .filter(m => m.name.includes("gemini") && (m.supportedGenerationMethods || []).includes("generateContent"))
        .map(m => `${m.name.padEnd(45)} ${m.displayName}`);

    console.log("\nModelos Gemini disponíveis para sua API key:\n");
    console.log(modelos.join("\n"));
}

listar().catch(console.error);
