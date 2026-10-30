// ================================================
// config.js — Configurações centralizadas do bot
// ================================================
require("dotenv").config();

module.exports = {

  // Configurações da WhatsApp Cloud API (Meta)
  WHATSAPP_TOKEN: process.env.WHATSAPP_TOKEN || "",
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID || "",
  WHATSAPP_WABA_ID: process.env.WHATSAPP_WABA_ID || "2209651766634628",
  WHATSAPP_VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN || "meu_token_secreto_webhook",
  PORT: process.env.PORT || 3000,
  ADMIN_SENHA: process.env.ADMIN_SENHA || "casa123",

  // Números que recebem comprovantes de PIX e podem aprovar
  // Suporta NUMEROS_DONOS (separado por vírgula) ou NUMERO_DONO (único)
  NUMEROS_DONOS: (() => {
    const raw = process.env.NUMEROS_DONOS || process.env.NUMERO_DONO || "";
    return raw
      .split(",")
      .map(n => n.replace("@c.us", "").replace(/\D/g, "").trim())
      .filter(n => n.length > 0);
  })(),

  // ID da planilha Google Sheets
  // Configure no .env: SPREADSHEET_ID=seu_id_aqui
  SPREADSHEET_ID: process.env.SPREADSHEET_ID || "",

  // Dados do PIX para pagamento do sinal
  CHAVE_PIX: process.env.CHAVE_PIX || "",
  NOME_BENEFICIARIO: process.env.NOME_BENEFICIARIO || "",
  BANCO_PIX: process.env.BANCO_PIX || "",

  // Range das reservas na planilha
  RESERVAS_RANGE: "reservas!A2:H500",
  RESERVAS_APPEND_RANGE: "reservas!A:H",

  // Modelo de IA do Gemini (Principal + Lista de Fallback automático para evitar erro 429/503)
  GEMINI_MODEL: "gemini-2.5-flash",
  GEMINI_MODELS_FALLBACK: [
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.1-flash-lite"
  ],

  // Preços e Regras de Diária
  MINIMO_DIARIAS: 2,
  PRECOS: {
    SEMANA: 300,        // Segunda a Quinta
    FIM_DE_SEMANA: 450  // Sexta, Sábado, Domingo
  },

  // Informações completas da casa e Manual de Uso
  CASA: {
    capacidade: 10,
    localizacao: "Rua Porto Seguro, 11 — Figueira, Arraial do Cabo, RJ",
    instagram: "https://www.instagram.com/_casadepraiafigueira",
    descricao: "Casa de praia super completa e próxima ao mar (Rua Porto Seguro, 11 — Figueira, Arraial do Cabo) — ao sair na rua já dá pra ver o mar no horizonte. Acomoda até 10 pessoas confortavelmente!",
    ideal_para: "Famílias, grupos de amigos, feriados e finais de semana.",
    detalhesTexto:
      "Nossa casa é super completa e acomoda até 10 pessoas confortavelmente! 🏡✨\n\n" +
      "📍 *Localização:* Rua Porto Seguro, 11 — Figueira, Arraial do Cabo (RJ)\n" +
      "📸 *Instagram:* https://www.instagram.com/_casadepraiafigueira\n\n" +
      "*Estrutura:*\n" +
      "🛏️ 2 quartos grandes (sendo 1 suíte)\n" +
      "🍳 Cozinha interna e Cozinha externa\n" +
      "🚿 3 banheiros com água quente + chuveirão\n" +
      "🛋️ Sala de estar e Lavanderia\n" +
      "🌅 Varanda frontal (35m²) e Varanda nos fundos (25m²)\n" +
      "🚗 Garagem para 3 carros e Jardim\n" +
      "🥩 Churrasqueira (concreto e portátil)\n\n" +
      "*Comodidades:*\n" +
      "📺 Smart TV e 📶 Wi-Fi rápido\n" +
      "🧊 Copos Stanley à disposição\n" +
      "🛋️ Sofá, rede, 2 ventiladores\n" +
      "🪑 6 mesas e 12 cadeiras de plástico\n\n" +
      "*Camas disponíveis:*\n" +
      "1 Cama de casal, 1 Beliche, 1 Cama de solteiro, 1 Colchão inflável solteiro, 1 Colchão de casal e 8 colchonetes.",
    manualUsoTexto:
      "📖 *MANUAL DE USO DA CASA DE ARRAIAL DO CABO*\n" +
      "📍 *Endereço:* Rua Porto Seguro, 11 — Figueira, Arraial do Cabo - RJ\n\n" +
      "1️⃣ *Acesso:* O acesso à casa é pelo portão social. O portão de garagem só abre pelo lado de dentro.\n" +
      "2️⃣ *Água:* Abrir o registro de água que fica ao lado do portão de garagem. Ao sair do imóvel (entrega das chaves), favor entregar com o registro fechado.\n" +
      "3️⃣ *Wi-Fi:*\n" +
      "👤 Login: Tia Diná\n" +
      "🔑 Senha: 17161716\n" +
      "4️⃣ *Chaves Internas:* As chaves do quarto e do banheiro externo ficam no armário da cozinha. A chave da suíte está no molho de chaves que já está com você.\n" +
      "5️⃣ *Gás e Geladeira:* Abrir o registro do gás. Caso seja necessário aumentar a potência da geladeira, não esqueça de voltar para a *potência mínima* antes de entregar as chaves."
  },

  // Rate limiting e Agrupamento (Debounce em ms) — espera o cliente terminar de digitar linhas seguidas
  RATE_LIMIT_MS: 1500,
  DEBOUNCE_MS: 3000,

  // Proteções contra curiosos e excesso de tokens
  MAX_MENSAGENS_SESSAO: 15,
  MAX_CARACTERES_MENSAGEM: 1000,

  // Tempo de inatividade (em minutos) para encerrar a conversa e limpar o histórico
  EXPIRACAO_SESSAO_MINUTOS: 5,

  // Validade da memória da última cotação do cliente (em horas) caso ele volte depois do timeout
  VALIDADE_COTACAO_HORAS: 24,

  // Tempo máximo (em minutos) que uma reserva "pendente" sem pagamento bloqueia a agenda
  EXPIRACAO_RESERVA_PENDENTE_MINUTOS: 60,

  // Máximo de turnos de histórico mantidos por conversa (4 turnos = 8 mensagens)
  // Reduzido para economizar tokens e evitar rate-limit
  MAX_HISTORICO_TURNOS: 4,

};
