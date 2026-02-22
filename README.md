# 🏖️ WhatsApp Reservas Bot

> Chatbot de atendimento e reservas no WhatsApp com Inteligência Artificial (Google Gemini) e integração com Google Sheets como banco de dados.

---

## O que é

Um robô de vendas para WhatsApp que atua como atendente virtual de uma casa de temporada. Ele conversa com os clientes de forma natural, verifica disponibilidade em tempo real, calcula valores e registra reservas — tudo de forma automática, sem intervenção humana.

**Fluxo completo:**
1. Cliente manda mensagem no WhatsApp
2. A IA (Joana) responde, coleta as datas desejadas
3. Sistema consulta a planilha do Google Sheets
4. Informa disponibilidade e valor total
5. Se cliente confirmar → registra a reserva na planilha
6. Cliente envia comprovante PIX → bot encaminha para o dono

---

## Tecnologias

| Tecnologia | Papel |
|---|---|
| [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) | Conexão com WhatsApp Web via Puppeteer |
| [Google Gemini 2.5 Flash](https://ai.google.dev) | IA de linguagem com Function Calling nativo |
| [Google Sheets API](https://developers.google.com/sheets) | Banco de dados de reservas |
| [dotenv](https://github.com/motdotla/dotenv) | Gerenciamento de variáveis de ambiente |

---

## Estrutura do projeto

```
chatbot/
│
├── chatbot.js          # Entrada principal — conexão WhatsApp e listener de mensagens
├── ai.js               # Motor de IA — multi-turn, Function Calling, histórico por chat
├── tools.js            # Ferramentas da IA (consultarDisponibilidade, calcularValor, etc.)
├── sheets.js           # Integração Google Sheets (leitura e escrita de reservas)
├── contextoCasa.js     # System prompt da IA — personalidade, regras e exemplos
├── config.js           # Configurações centralizadas (preços, modelo, IDs)
├── logger.js           # Logger estruturado com arquivo de log diário
│
├── scripts/
│   ├── listarModelos.js  # Utilitário: lista modelos Gemini disponíveis na sua API key
│   └── testeIA.js        # Utilitário: testa a IA sem precisar abrir o WhatsApp
│
├── logs/               # Logs diários gerados automaticamente (bot-YYYY-MM-DD.log)
├── .env                # Variáveis de ambiente (NÃO commitar)
└── google-credentials.json  # Credenciais Google (NÃO commitar)
```

---

## Pré-requisitos

- [Node.js](https://nodejs.org) v18 ou superior
- Conta Google com acesso ao [Google AI Studio](https://aistudio.google.com) (para API key do Gemini)
- Conta de serviço do Google Cloud com acesso ao Google Sheets
- Um número de WhatsApp dedicado para o bot

---

## Instalação

### 1. Clone o repositório

```bash
git clone https://github.com/seu-usuario/whatsapp-reservas-bot.git
cd whatsapp-reservas-bot
```

### 2. Instale as dependências

```bash
npm install
```

### 3. Configure as variáveis de ambiente

Crie um arquivo `.env` na raiz do projeto:

```env
GEMINI_API_KEY=sua_chave_aqui
```

### 4. Configure as credenciais do Google

Crie uma **Conta de Serviço** no [Google Cloud Console](https://console.cloud.google.com):
1. Acesse `IAM e Admin → Contas de Serviço`
2. Crie uma conta e baixe a chave JSON
3. Salve como `google-credentials.json` na raiz do projeto
4. Compartilhe sua planilha do Google Sheets com o e-mail da conta de serviço

### 5. Configure o `config.js`

Edite `config.js` com os seus dados:

```js
NUMERO_DONO:    "55XXXXXXXXXXX@c.us",  // número que recebe comprovantes PIX
SPREADSHEET_ID: "seu-id-da-planilha",  // ID da planilha Google Sheets
```

### 6. Prepare a planilha Google Sheets

Crie uma aba chamada `reservas` com as seguintes colunas:

| A | B | C | D | E | F | G | H |
|---|---|---|---|---|---|---|---|
| Check-in | Check-out | Nome | Telefone | Status | Regra | Valor | Data Cadastro |

Para bloquear datas manualmente, insira uma linha com `bloqueado` na coluna F (Regra).

---

## Como rodar

```bash
npm start
```

Na **primeira execução**, um QR Code aparecerá no terminal. Escaneie com o WhatsApp do número que será o bot.

As sessões são salvas em `.wwebjs_auth/` — nas próximas execuções, o bot conecta automaticamente.

---

## Scripts utilitários

```bash
# Ver quais modelos Gemini estão disponíveis na sua API key
npm run listar-modelos

# Testar a IA localmente sem abrir o WhatsApp
npm run teste-ia
```

---

## Lógica de disponibilidade

A planilha suporta 3 tipos de bloqueio via coluna **Regra**:

| Valor na coluna Regra | Comportamento |
|---|---|
| *(vazio)* | Bloqueado apenas se status for `confirmado` ou `pendente` |
| `bloqueado` | Bloqueia qualquer solicitação nesse período |
| `pacote` | Só aceita datas exatamente iguais (feriados com pacote fechado) |

---

## Tabela de preços padrão

| Dia da semana | Valor por diária |
|---|---|
| Segunda a Quinta | R$ 300 |
| Sexta a Domingo | R$ 450 |

> Datas comemorativas (Carnaval, Réveillon, feriados prolongados) são tratadas como pacotes com valor manual.

---

## Segurança

> ⚠️ **IMPORTANTE:** Nunca faça commit dos arquivos abaixo. Eles estão no `.gitignore`:
> - `.env` — contém sua API Key do Gemini
> - `google-credentials.json` — contém credenciais privadas do Google
> - `.wwebjs_auth/` — contém a sessão do WhatsApp

---

## Arquitetura

```
WhatsApp
   ↓
chatbot.js   →  filtra mensagens, rate limiting, typing indicator
   ↓
ai.js        →  histórico multi-turn por chatId, Function Calling nativo
   ↓
Gemini API   →  decide responder ou chamar uma ferramenta
   ↓
tools.js     →  executa a ferramenta solicitada
   ↓
sheets.js    →  lê/escreve na planilha com retry automático
   ↓
Google Sheets
```

---

## Logs

Os logs são gerados automaticamente em `logs/bot-YYYY-MM-DD.log`:

```
2026-02-22T12:22:27Z INFO  [5521999...] MSG RECEBIDA: "Oi"
2026-02-22T12:22:27Z INFO  [5521999...] → Enviando para Gemini
2026-02-22T12:22:28Z INFO  [5521999...] 🔧 Tool chamada: consultarDisponibilidade
2026-02-22T12:22:28Z INFO  [5521999...] ✅ Tool resultado: { status: 'livre' }
```

---

## Licença

MIT
