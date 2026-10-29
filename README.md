# 🏖️ Joana — Chatbot de Reservas (WhatsApp Cloud API + Gemini + Google Sheets)

> Assistente virtual de atendimento e reservas no WhatsApp utilizando a **API Oficial da Meta (WhatsApp Cloud API)**, **Google Gemini 2.5 Flash** (com Function Calling e Gemini Vision) e **Google Sheets** como banco de dados.

---

## 📋 Registro Geral da Configuração (Referência Rápida)

| Item | Valor / Identificador | Onde fica |
|---|---|---|
| **Nome do App na Meta** | `chatbot Joana` | [Meta for Developers](https://developers.facebook.com/apps/2239870536873446) |
| **App ID (Meta)** | `2239870536873446` | Painel do App na Meta |
| **Portfólio Empresarial (Business ID)** | `1688475049501967` (`Marcio duani`) | [Configurações do Negócio](https://business.facebook.com/latest/settings/info?business_id=1688475049501967) |
| **ID da Conta do WhatsApp Business (WABA ID)** | `2209651766634628` | [Contas do WhatsApp](https://business.facebook.com/latest/settings/whatsapp_account?business_id=1688475049501967) |
| **Número Conectado (Bot Joana)** | `+55 21 96483-8831` | [Gerenciador do WhatsApp](https://business.facebook.com/latest/whatsapp_manager/phone_numbers?business_id=1688475049501967&asset_id=2209651766634628) |
| **Phone Number ID (`WHATSAPP_PHONE_NUMBER_ID`)** | `1460686647117445` | Configurado no `.env` |
| **Verify Token do Webhook (`WHATSAPP_VERIFY_TOKEN`)** | `meu_token_secreto_webhook` | Configurado no `.env` e na Meta |
| **Porta local do servidor (`PORT`)** | `3000` | `chatbot.js` / `.env` |
| **Modelo de IA (`GEMINI_MODEL`)** | `gemini-2.5-flash` | `config.js` |
| **Planilha Google Sheets (`SPREADSHEET_ID`)** | `1Kvz-rB6nfgmrXjQxZ4uCif-wrcelrwgijaopP8cHD2g` | Aba `reservas` (`A2:H500`) |
| **Números dos Proprietários (`NUMEROS_DONOS`)** | `5521980039948,5521993689581` | Recebem comprovantes PIX e aprovam com `OK` |

---

## 🔄 O que foi modificado na migração (Histórico de Mudanças)

1. **Remoção do `whatsapp-web.js` (sistema antigo por QR Code)**:
   - Removidas as dependências `whatsapp-web.js` e `qrcode-terminal` (que usavam navegador Chromium oculto e desconectavam com frequência).
   - Removidas as pastas legadas `.wwebjs_auth/`, `.wwebjs_cache/` e a pasta duplicada `whatsapp-reservas-bot/`.
2. **Implementação da WhatsApp Cloud API Oficial (`whatsappCloud.js`)**:
   - Criado cliente HTTP direto para a Graph API v21.0 da Meta (`https://graph.facebook.com/v21.0`).
   - Suporte a envio de textos (`enviarTexto`), imagens (`enviarImagem`), upload/download de mídias (`baixarMidia`, `uploadMidia`) e confirmação de leitura (`marcarComoLida` — check azul).
3. **Servidor Webhook Express (`chatbot.js`)**:
   - Criadas as rotas `GET /webhook` (validação do token com a Meta) e `POST /webhook` (recebimento de mensagens de texto e imagens em tempo real).
   - Adicionado controle de inatividade (aviso após 5 minutos sem resposta e encerramento automático após mais 3 minutos).
   - Fluxo de aprovação pelos proprietários: ao receber uma imagem de comprovante PIX validada pelo Gemini Vision, o bot encaminha a imagem para os `NUMEROS_DONOS`. Quando o proprietário responde `OK`, o bot atualiza o status na planilha Google Sheets de `pendente` para `confirmado` e notifica o cliente.
4. **Persistência de Sessões em Disco (`storage.js`)**:
   - O histórico das conversas agora é salvo em `sessions_store.json` com expiração automática, evitando perda de contexto se o bot for reiniciado no meio de um atendimento.
5. **Atualização do `sheets.js` e `ai.js`**:
   - Adicionada função `confirmarPagamento` em `sheets.js` para localizar a reserva `pendente` pelo telefone do cliente e atualizar a coluna `E` para `confirmado`.
   - Atualizado modelo Gemini para `gemini-2.5-flash` com retry automático e sanitização de histórico multi-turn.

---

## 📂 Estrutura Atual do Projeto

```text
chatbot/
│
├── chatbot.js               # Servidor Express + Webhook da Meta + Fluxo de mensagens e aprovação PIX
├── whatsappCloud.js         # Cliente oficial da WhatsApp Cloud API (Graph API v21.0)
├── ai.js                    # Motor de IA (Gemini 2.5 Flash) — multi-turn, Function Calling e Gemini Vision
├── tools.js                 # Ferramentas da IA (consultarDisponibilidade, calcularValor, criarReserva)
├── sheets.js                # Integração Google Sheets (leitura, criação de reservas e confirmação de pagamento)
├── storage.js               # Persistência local de sessões de conversa (sessions_store.json)
├── contextoCasa.js          # System prompt da Joana — personalidade, regras da casa e instruções de fluxo
├── config.js                # Configurações centralizadas (preços, modelo, IDs, timeouts)
├── logger.js                # Logger estruturado com arquivos diários em logs/
│
├── scripts/
│   ├── chatTest.js          # Testar conversa com a Joana direto pelo terminal
│   ├── testarWebhook.js     # Simular envio de mensagens para o webhook localmente
│   ├── listarModelos.js     # Listar modelos Gemini disponíveis na API Key
│   └── testeIA.js           # Teste rápido de resposta da IA
│
├── logs/                    # Logs diários (bot-YYYY-MM-DD.log)
├── .env                     # Variáveis de ambiente e chaves secretas (NÃO commitar)
├── .env.example             # Modelo de configuração do .env
└── google-credentials.json  # Credenciais da Conta de Serviço do Google Sheets (NÃO commitar)
```

---

## 🚀 Como Rodar o Bot (100% Automático)

Para ligar a Joana no seu computador, você tem **duas opções simples** (não precisa abrir segundo terminal nem mexer no site da Meta):

### Opção A: Dar 2 cliques no arquivo `iniciar-joana.bat`
Basta dar dois cliques em **`iniciar-joana.bat`** na pasta do projeto.

### Opção B: Pelo terminal
```bash
npm start
```

**O que acontece automaticamente quando você inicia:**
1. O servidor da Joana sobe na porta `3000`.
2. O próprio `chatbot.js` inicia o túnel do Cloudflare (`cloudflared`) em segundo plano.
3. Assim que o Cloudflare gera o novo endereço `https://xxxx.trycloudflare.com`, a Joana envia esse endereço sozinha para a API da Meta (`atualizarWebhookMeta`) e valida o Webhook automaticamente.
4. Aparece na tela: `🎉 TUDO PRONTO! Webhook conectado na Meta automaticamente!`.
5. Quando você fechar a janela ou apertar `Ctrl + C`, o túnel também é encerrado junto com o bot.

### 🛑 Como Desligar a Joana
- **Se você abriu pelo terminal ou pelo `iniciar-joana.bat`:** basta apertar **`Ctrl + C`** no teclado ou **fechar a janela preta** no `X`.
- **De qualquer lugar (mesmo que tenha sido iniciada em segundo plano):** basta dar **2 cliques** no arquivo **`parar-joana.bat`** na pasta do projeto (ou digitar `npm run stop` no terminal). Ele encerra tanto o servidor na porta `3000` quanto o `cloudflared` na hora.

*(Nota: Quando futuramente você hospedar em um servidor na nuvem como Render ou Railway, basta definir `AUTO_TUNNEL=false` nas variáveis de ambiente do servidor).*

---

## 🔑 Como Gerar um Token Permanente na Meta (Caso o Token Expire)

1. Acesse [Usuários do Sistema no Meta Business Suite](https://business.facebook.com/latest/settings/system_users?business_id=1688475049501967).
2. Crie ou selecione o usuário do sistema administrador (ex: `Bot Joana`).
3. Em **Atribuir ativos**, garanta que ele tenha **Controle total** sobre o app `chatbot Joana` e sobre a Conta do WhatsApp `Marcio duani`.
4. Clique em **Gerar token**:
   - Selecione o app `chatbot Joana`.
   - Expiração: **Nunca**.
   - Permissões: `whatsapp_business_messaging` e `whatsapp_business_management`.
5. Copie o token gerado e atualize a variável `WHATSAPP_TOKEN` no arquivo `.env`.

---

## 📊 Estrutura da Planilha Google Sheets (Aba `reservas`)

| Coluna A | Coluna B | Coluna C | Coluna D | Coluna E | Coluna F | Coluna G | Coluna H |
|---|---|---|---|---|---|---|---|
| **Check-in** | **Check-out** | **Nome** | **Telefone** | **Status** | **Regra** | **Valor** | **Data Cadastro** |
| `2026-10-29` | `2026-10-31` | `Márcio Mendes` | `5521993689581` | `pendente` / `confirmado` | *(vazio)* / `bloqueado` / `pacote` | `750` | `2026-10-29` |

---

## 🛠️ Scripts Utilitários

```bash
# Conversar com a Joana pelo terminal (sem usar WhatsApp)
npm run chat-test

# Simular requisições de Webhook localmente
npm run testar-webhook

# Listar modelos Gemini disponíveis
npm run listar-modelos
```

---

## 🗺️ Próximos Passos e Planejamento
Todo o levantamento de validação avançada do PIX, as 7 proteções profissionais de engenharia e a tabela real de limites/custos do Gemini estão salvos em:
👉 **[ROADMAP_MELHORIAS.md](./ROADMAP_MELHORIAS.md)**

