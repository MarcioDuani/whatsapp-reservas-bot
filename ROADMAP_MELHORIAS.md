# 🗺️ Roadmap de Melhorias, Segurança e Custos — Chatbot Joana

> Documento de referência com tudo o que foi planejado e levantado em **28–29/10/2026** para as próximas etapas de evolução da Joana.

---

## 1. Validação Inteligente de Comprovante PIX (Gemini Vision)

Atualmente (`ai.js` -> `analisarComprovante`), o Gemini Vision verifica apenas se a imagem enviada "parece" um comprovante PIX (`SIM` / `NÃO`).

### O que vamos implementar na próxima etapa:
Pedir ao Gemini Vision para ler os dados escritos no comprovante (em **Foto** ou **PDF**) e retornar um JSON estruturado validando:

1. **Regras Obrigatórias (Bloqueiam na hora se estiverem erradas):**
   - **Destinatário / Recebedor:** Conferir se quem recebeu o PIX no comprovante é **`Fernando da costa Nascimento e silva`** (ou banco **Inter** / chave `12578706700`). Impede envio de comprovante pago para terceiros.
   - **Valor do Sinal (30%) ou Total:** Consultar na planilha o valor da reserva `pendente` daquele cliente e exigir que o valor do comprovante seja compatível com o sinal (30%) ou valor total.
   - **Bloquear "PIX Agendado":** Recusar comprovantes onde conste *"Agendamento"* / *"Agendado"* em vez de pagamento concluído.
   - **Data da Transação:** Verificar se a data do comprovante é atual (evitar reaproveitamento de comprovantes antigos).

2. **Alerta Inteligente para o Proprietário (Sem travar vendas legítimas):**
   - **Nome do Pagador:** Como é comum o cônjuge ou familiar pagar o PIX de uma reserva feita por outra pessoa, a Joana aceita o comprovante (desde que o recebedor seja o Fernando e o valor esteja certo), mas **destaca no resumo enviado ao dono**:
     - *Cliente da reserva:* Nome informado no chat
     - *Pagador no comprovante:* Nome lido no PIX (com alerta ⚠️ caso seja diferente)
     - *Valor lido:* R$ XXX,XX

---

## 2. As 7 Proteções Profissionais de Engenharia (Anti-Travamento e Anti-Golpe)

### 🔒 2.1. Blindagem Financeira no Código (`tools.js` -> `criarReserva`)
- **Risco atual:** `criarReserva` aceita o `valor` enviado pela IA nos argumentos. Se o cliente tentar manipular a IA na conversa, um valor errado poderia ser salvo.
- **Solução:** Dentro de `criarReserva`, o próprio código JavaScript recalculará obrigatoriamente `sheets.calcularValor(checkin, checkout)` e conferirá `sheets.analisarPeriodo(...)` antes de gravar na planilha.

### 🚫 2.2. Proteção contra "Trava de Agenda" (Reserva Fantasma)
- **Risco atual:** Qualquer reserva criada entra como `pendente` e já bloqueia as datas na planilha. Um curioso poderia bloquear várias datas sem pagar o PIX.
- **Solução:**
  1. Permitir apenas **1 reserva `pendente` ativa por telefone** (ou substituir a anterior).
  2. **Expiração automática (TTL):** Se o comprovante PIX não for enviado dentro do prazo (ex: 1 hora), expirar a reserva pendente liberando a data na planilha.

### 📄 2.3. Suporte a Comprovante em PDF e Resposta para Áudio
- **Risco atual:** Muitos bancos (Nubank, Itaú, Bradesco) exportam comprovantes em **PDF (`document`)**, que hoje são ignorados pelo bot. Áudios também são ignorados em silêncio.
- **Solução:**
  - Aceitar `msg.type === "document"` (PDF) no fluxo de comprovante PIX (o Gemini lê PDF nativamente).
  - Responder educadamente quando o cliente enviar áudio (ou habilitar escuta de áudio nativa pelo Gemini).

### 🚦 2.4. Agrupamento de Mensagens (*Debounce* de 3s) + Fila por Cliente (*Lock*)
- **Por que usar:** Mantém 100% da naturalidade da conversa (sem respostas engessadas de código), evita que duas chamadas do mesmo cliente rodem ao mesmo tempo corrompendo o histórico e economiza requisições quando o cliente digita várias linhas picadas (*"Oi" / "Boa noite" / "Tem vaga dia 10?"*).

### 🔁 2.5. Anti-Duplicidade do Webhook da Meta (*Idempotência*)
- Guardar os últimos `msg.id` processados na memória para nunca processar nem responder duas vezes caso a Meta reenvie o mesmo evento de Webhook.

### 🔄 2.6. Rodízio Automático de Modelos (*Fallback*) + Unificação de Tools
- **Unificar `consultarDisponibilidade` + `calcularValor`:** Quando o cliente informar datas, uma única ferramenta já devolve se está livre, o valor total e o sinal de 30%, economizando 1 requisição inteira ao Gemini por consulta.
- **Fallback automático:** Se o `gemini-2.5-flash` atingir o limite gratuito (`429`) ou estiver sobrecarregado (`503`), alternar automaticamente na mesma hora para `gemini-2.5-flash-lite` / `gemini-3.1-flash-lite`.

### 🤝 2.7. Blindagem de Escopo (Contra Poemas/Curiosos) + Transbordo Humano + Memória de Cotação 24h
- **Escopo estrito no prompt (`contextoCasa.js`):** Orientar a Joana a responder com simpatia humana mas exclusivamente sobre a casa em Arraial do Cabo, recusando desvios (poemas, receitas, assuntos gerais).
- **Limite de mensagens por sessão:** Evitar que um curioso consuma dezenas de chamadas sem reservar.
- **Memória de cotação por 24h (`storage.js`):** Mesmo que o histórico da conversa expire por inatividade após 15–20 minutos, manter anotada a última data e valor cotados (`ultimaCotacao`) por 24h para a Joana lembrar caso o cliente volte depois dizendo *"Quero fechar!"*.
- **Ferramenta `notificarProprietario`:** Avisar os donos no WhatsApp quando um cliente quiser negociar pacote de feriado (Carnaval/Réveillon) ou condições especiais.

---

## 3. Tabela de Limites e Custos Reais (Medição Base: ~6.350 tokens por atendimento completo)

### Comparativo: Plano Gratuito vs. Plano Pago por Uso (Pay-as-you-go Google AI Studio)

| Modelo | Limite no Gratuito (Free Tier) | Custo no Pago (1 cliente) | Custo no Pago (30 clientes simultâneos) | Custo no Pago (1.000 clientes/mês) |
|---|---|---|---|---|
| **`gemini-2.5-flash`** | 5 req/min \| **20 req/dia** | **~R$ 0,02** | **~R$ 0,60** | **~R$ 20,00** |
| **`gemini-2.5-flash-lite`** | 15 req/min \| **500–1.500 req/dia** | **~R$ 0,005** | **~R$ 0,15** | **~R$ 5,00** |
| **WhatsApp Cloud API (Meta)** | Janela de 24h iniciada pelo cliente | **R$ 0,00 (Grátis)** | **R$ 0,00 (Grátis)** | **R$ 0,00 (Grátis)** |

> **Resumo de Capacidade:**
> - **Para testes e baixo volume (Gratuito):** Usando `gemini-2.5-flash-lite` (ou rodízio automático entre os modelos gratuitos da chave), suporta até ~10 clientes simultâneos sem custo.
> - **Para alta temporada / casa famosa (Pay-as-you-go ativado no Google AI Studio):** O limite sobe para **1.000+ requisições por minuto**, atendendo 30+ clientes simultaneamente em 2 segundos, custando apenas centavos por dia.
