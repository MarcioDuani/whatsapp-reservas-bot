// ================================================
// siteAdmin.js — Gerenciador do Painel /admin e Dados da Home Page
// ================================================
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const express = require("express");
const config = require("./config");
const logger = require("./logger");

const HOMEPAGE_DIR = path.join(__dirname, "homepage");
const DADOS_JSON_PATH = path.join(HOMEPAGE_DIR, "dados-site.json");
const DADOS_JS_PATH = path.join(HOMEPAGE_DIR, "dados-site.js");
const MIDIA_CASA_DIR = path.join(HOMEPAGE_DIR, "midia", "casa");
const MIDIA_ARRAIAL_DIR = path.join(HOMEPAGE_DIR, "midia", "arraial");

// Dados padrão iniciais (exatamente iguais ao estado atual do site)
const DADOS_PADRAO = {
  capa: {
    imagem: "midia/arraial/hero-arraial.jpg",
    localizacaoBadge: "☀️ Rua Porto Seguro, 11 • Figueira (Arraial do Cabo)",
    titulo: "Casa de Praia Completa",
    subtitulo: "Ao sair na rua já dá pra ver o mar • Até 10 pessoas",
    pilulas: [
      { rotulo: "👥 Capacidade", valor: "Até 10 pessoas" },
      { rotulo: "🛏️ Dormitórios", valor: "2 Quartos (1 Suíte)" },
      { rotulo: "🚿 Banheiros", valor: "3 + Chuveirão" },
      { rotulo: "🚗 Garagem", valor: "3 Vagas Privativas" }
    ]
  },
  cardsCasa: [
    {
      id: "card-fachada",
      categoria: "estrutura",
      etiqueta: "Frente, Garagem & Jardim",
      corEtiqueta: "sky",
      titulo: "Portão, Garagem (3 Vagas) & Quintal",
      descricao: "Rua com vista para o mar, garagem ampla para 3 carros, jardim com coqueiros e chuveirão pós-praia.",
      fotos: [
        { src: "midia/casa/fachada.jpg", alt: "Portão da Casa e Rua até a Praia" },
        { src: "midia/casa/garagem 2.jpg", alt: "Garagem Privativa para 3 Carros" },
        { src: "midia/casa/vista_coqueiro_quintal.jpg", alt: "Quintal Gramado com Coqueiros e Chuveirão" }
      ]
    },
    {
      id: "card-varandas",
      categoria: "lazer",
      etiqueta: "60m² de Varandas Cobertas",
      corEtiqueta: "sky",
      titulo: "Varandas Frontal (35m²) & Fundos (25m²)",
      descricao: "Duas varandas amplas e frescas com espaço para rede, mesas, cozinha externa e lavanderia.",
      fotos: [
        { src: "midia/casa/varanda-vista total.jpg", alt: "Varanda Frontal Coberta (35m²)" },
        { src: "midia/casa/area_fundos.jpg", alt: "Varanda dos Fundos (25m²) e Área de Refeições" },
        { src: "midia/casa/garagem.jpg", alt: "Vista da Varanda para o Jardim" }
      ]
    },
    {
      id: "card-sala",
      categoria: "interno",
      etiqueta: "Ambiente Integrado",
      corEtiqueta: "amber",
      titulo: "Sala de Estar & Cozinha Equipada",
      descricao: "Portas em blindex, sofá, Smart TV, Wi-Fi rápido, 2 ventiladores, geladeira duplex, fogão e micro-ondas.",
      fotos: [
        { src: "midia/casa/sala.jpg", alt: "Sala de Estar e Cozinha Interna" },
        { src: "midia/casa/entrada_sala.jpg", alt: "Entrada da Sala em Vidro Temperado" }
      ]
    },
    {
      id: "card-quarto1",
      categoria: "quartos",
      etiqueta: "Dormitório 1",
      corEtiqueta: "amber",
      titulo: "Quarto de Casal",
      descricao: "Cama de casal confortável, guarda-roupa amplo com espelho e ventilador de teto.",
      fotos: [
        { src: "midia/casa/quarto 2.jpg", alt: "Quarto de Casal" }
      ]
    },
    {
      id: "card-quarto2",
      categoria: "quartos",
      etiqueta: "Dormitório 2",
      corEtiqueta: "amber",
      titulo: "Quarto Grande — Família",
      descricao: "1 beliche, 1 cama de solteiro, banheiro privativo + colchão de casal, inflável e 8 colchonetes.",
      fotos: [
        { src: "midia/casa/quarto_suite.jpg", alt: "Quarto Grande Família com Beliche" }
      ]
    },
    {
      id: "card-churrasco",
      categoria: "lazer",
      etiqueta: "Lazer & Gourmet",
      corEtiqueta: "amber",
      titulo: "2 Churrasqueiras (Fixa e Portátil)",
      descricao: "Churrasqueira de tijolinho + portátil a bafo, copos Stanley, 6 mesas e 12 cadeiras.",
      fotos: [
        { src: "midia/casa/churrasqueiras.jpg", alt: "Churrasqueira de concreto e portátil" }
      ]
    }
  ],
  cardsPraias: [
    {
      id: "praia-figueira",
      etiqueta: "Mar Aberto • Pertinho da Casa",
      corEtiqueta: "sky",
      titulo: "Praia da Figueira (Massambaba)",
      descricao: "Areia branquinha e mar azul visível ao sair na rua da casa. Tranquila e ótima para caminhar.",
      fotos: [
        { src: "midia/arraial/praia-grande.jpg", alt: "Praia da Figueira e Massambaba" }
      ]
    },
    {
      id: "lagoa-figueira",
      etiqueta: "Águas Calmas • Ideal p/ Crianças",
      corEtiqueta: "amber",
      titulo: "Lagoa de Figueira & Novo Arraial",
      descricao: "Água morna, rasa e sem ondas. Perfeita para famílias com crianças e pôr do sol na orla.",
      fotos: [
        { src: "midia/arraial/lagoa-figueira.jpg", alt: "Lagoa de Figueira" }
      ]
    },
    {
      id: "arubinha",
      etiqueta: "Cartão-Postal de Figueira",
      corEtiqueta: "amber",
      titulo: "Ponta da Alcaíra (Arubinha)",
      descricao: "Língua de areia branca que avança pela lagoa transparente (\"Caminho de Moisés\").",
      fotos: [
        { src: "midia/arraial/arubinha-lagoa.jpg", alt: "Ponta da Alcaíra (Arubinha)" }
      ]
    },
    {
      id: "praia-forno",
      etiqueta: "Centro de Arraial",
      corEtiqueta: "sky",
      titulo: "Praia do Forno & Pontal do Atalaia",
      descricao: "Águas cristalinas do \"Caribe Brasileiro\", trilha com mirante e passeios de barco.",
      fotos: [
        { src: "midia/arraial/hero-arraial.jpg", alt: "Praia do Forno e Pontal do Atalaia" }
      ]
    }
  ],
  valores: {
    semanaTitulo: "☀️ Segunda a Quinta",
    semanaPreco: "R$ 300",
    semanaDetalhe: "Mínimo de 2 diárias • Casa completa p/ até 10 pessoas",
    fdsTitulo: "🏖️ Sexta, Sábado e Domingo",
    fdsPreco: "R$ 450",
    fdsDetalhe: "Reserva garantida com sinal de 30% via PIX",
    barraResumoTopo: "☀️ Casa até 10 pessoas",
    barraResumoPreco: "R$ 300 a R$ 450"
  }
};

function garantirPastas() {
  if (!fs.existsSync(MIDIA_CASA_DIR)) fs.mkdirSync(MIDIA_CASA_DIR, { recursive: true });
  if (!fs.existsSync(MIDIA_ARRAIAL_DIR)) fs.mkdirSync(MIDIA_ARRAIAL_DIR, { recursive: true });
}

function carregarDadosSite() {
  try {
    if (fs.existsSync(DADOS_JSON_PATH)) {
      const raw = fs.readFileSync(DADOS_JSON_PATH, "utf8");
      return JSON.parse(raw);
    }
  } catch (err) {
    logger.warn(null, "Erro ao ler dados-site.json, usando padrão:", err.message);
  }
  salvarDadosSite(DADOS_PADRAO);
  return DADOS_PADRAO;
}

function sincronizarPrecosComBot(dados) {
  try {
    if (dados?.valores) {
      const numSemana = parseInt(String(dados.valores.semanaPreco).replace(/\D/g, ""), 10);
      const numFds = parseInt(String(dados.valores.fdsPreco).replace(/\D/g, ""), 10);
      if (numSemana > 0) config.PRECOS.SEMANA = numSemana;
      if (numFds > 0) config.PRECOS.FIM_DE_SEMANA = numFds;
    }
  } catch (_) {}
}

function salvarDadosSite(dados) {
  garantirPastas();
  const jsonStr = JSON.stringify(dados, null, 2);
  fs.writeFileSync(DADOS_JSON_PATH, jsonStr, "utf8");
  // Também gera dados-site.js para funcionar mesmo se abrir index.html direto na pasta (file://)
  const jsStr = `// Arquivo gerado automaticamente pelo painel /admin\nwindow.DADOS_SITE = ${jsonStr};\n`;
  fs.writeFileSync(DADOS_JS_PATH, jsStr, "utf8");
  sincronizarPrecosComBot(dados);
}

function validarSenha(req) {
  const senhaEnviada = req.headers["x-admin-password"] || req.body?.senha || "";
  const senhaCorreta = config.ADMIN_SENHA || "casa123";
  return senhaEnviada === senhaCorreta;
}

function configurarRotasSiteEAdmin(app) {
  // Inicializa os arquivos na partida do servidor
  const dadosAtuais = carregarDadosSite();
  sincronizarPrecosComBot(dadosAtuais);

  // Permite CORS para que o painel funcione mesmo se aberto direto via file://
  app.use("/api", (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });

  // 1. Servir arquivos estáticos da pasta homepage (HTML, fotos, JS)
  app.use(express.static(HOMEPAGE_DIR));

  // 2. Rota amigável /admin -> abre o painel administrativo
  app.get("/admin", (req, res) => {
    res.sendFile(path.join(HOMEPAGE_DIR, "admin.html"));
  });

  // 3. API pública para obter os dados atualizados do site
  app.get("/api/site-data", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json(carregarDadosSite());
  });

  // 4. API de verificação de login do painel /admin
  app.post("/api/admin/login", (req, res) => {
    if (!validarSenha(req)) {
      return res.status(401).json({ ok: false, erro: "Senha incorreta." });
    }
    return res.json({ ok: true });
  });

  // 5. API para salvar textos, cards e ordem das fotos
  app.post("/api/admin/save", (req, res) => {
    if (!validarSenha(req)) {
      return res.status(401).json({ ok: false, erro: "Senha incorreta." });
    }

    const novosDados = req.body?.dados;
    if (!novosDados || !Array.isArray(novosDados.cardsCasa)) {
      return res.status(400).json({ ok: false, erro: "Formato de dados inválido." });
    }

    try {
      salvarDadosSite(novosDados);
      logger.info(null, "Painel /admin: dados do site atualizados com sucesso.");
      return res.json({ ok: true, dados: novosDados });
    } catch (err) {
      logger.error(null, "Erro ao salvar dados no /admin:", err.message);
      return res.status(500).json({ ok: false, erro: "Erro ao salvar alterações: " + err.message });
    }
  });

  // 6. API para fazer upload de nova foto (salva em midia/casa ou midia/arraial)
  app.post("/api/admin/upload", async (req, res) => {
    if (!validarSenha(req)) {
      return res.status(401).json({ ok: false, erro: "Senha incorreta." });
    }

    try {
      const { imagemBase64, nomeOriginal, pasta } = req.body || {};
      if (!imagemBase64) {
        return res.status(400).json({ ok: false, erro: "Nenhuma imagem enviada." });
      }

      garantirPastas();

      // Extrai o conteúdo binário do Data URL (data:image/jpeg;base64,...)
      const matches = String(imagemBase64).match(/^data:image\/([a-zA-Z0-9+]+);base64,(.+)$/);
      const ext = matches ? (matches[1] === "jpeg" ? "jpg" : matches[1]) : "jpg";
      const base64Limpo = matches ? matches[2] : imagemBase64;
      const buffer = Buffer.from(base64Limpo, "base64");

      // Limpa o nome do arquivo para evitar acentos/caracteres especiais
      const baseName = path
        .basename(nomeOriginal || "foto", path.extname(nomeOriginal || ""))
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
        .toLowerCase()
        .substring(0, 30);

      const sufixo = crypto.randomBytes(3).toString("hex");
      const nomeFinal = `${baseName || "foto"}_${sufixo}.${ext}`;

      const subpasta = pasta === "arraial" ? "arraial" : "casa";
      const destinoDir = subpasta === "arraial" ? MIDIA_ARRAIAL_DIR : MIDIA_CASA_DIR;
      const caminhoCompleto = path.join(destinoDir, nomeFinal);

      fs.writeFileSync(caminhoCompleto, buffer);

      const urlRelativa = `midia/${subpasta}/${nomeFinal}`;
      logger.info(null, `Painel /admin: nova foto enviada (${urlRelativa}, ${Math.round(buffer.length / 1024)} KB)`);

      return res.json({
        ok: true,
        url: urlRelativa
      });
    } catch (err) {
      logger.error(null, "Erro no upload de foto /admin:", err.message);
      return res.status(500).json({ ok: false, erro: "Falha ao salvar foto: " + err.message });
    }
  });
}

module.exports = {
  configurarRotasSiteEAdmin,
  carregarDadosSite,
  salvarDadosSite
};

