const fs = require('fs');
const path = require('path');
const { MessageMedia, Location } = require('whatsapp-web.js');
const storage = require('./storage');
const messages = require('./messages');
const pricing = require('./pricing');
const config = require('./config');
const sheets = require('./sheets');
const logger = require('./logger');

// Extrai duas datas no formato DD/MM/AAAA de uma string
function extrairDatas(texto) {
  const regex = /(\d{2}\/\d{2}\/\d{4})/g;
  const matches = texto.match(regex);
  if (matches && matches.length >= 2) {
    return { entrada: matches[0], saida: matches[1] };
  }
  return null;
}

// Retorna todas as sessões que estão aguardando o dono, para o dono aprovar pelo telefone
function buscarSessaoPorTelefone(telefone) {
  const rawSessions = fs.readFileSync(path.join(__dirname, 'sessions_store.json'), 'utf-8');
  const sessions = JSON.parse(rawSessions);

  for (const [chatId, data] of Object.entries(sessions)) {
    // Pega os últimos 8 dígitos do telefone pra facilitar a busca
    if (chatId.includes(telefone)) {
      return { chatId, sessao: data };
    }
  }
  return null;
}

async function processarMensagemCliente(texto, messageObj, client, chatId) {
  const sessao = storage.getSessao(chatId);
  const textoLimpo = texto.trim().toUpperCase();

  switch (sessao.estado) {
    case "INICIO":
      await client.sendMessage(chatId, messages.BOAS_VINDAS);
      storage.atualizarEstado(chatId, { estado: "MENU_PRINCIPAL" });
      break;

    case "MENU_PRINCIPAL":
      if (textoLimpo === "FOTO" || textoLimpo === "FOTOS") {
        await enviarFotos(client, chatId, messageObj);
        await client.sendMessage(chatId, messages.FOTO_FINAL);
      }
      else if (textoLimpo === "DETALHES" || textoLimpo === "DETALHE") {
        await client.sendMessage(chatId, messages.DETALHES);
      }
      else if (textoLimpo === "LOCAL" || textoLimpo === "LOCALIZAÇÃO" || textoLimpo === "LOCALIZACAO") {
        // Envia Localização Padrão WhatsApp
        const loc = new Location(-22.9238385, -42.2785641, "Casa de Praia - Arraial do Cabo\nRua Pôrto Seguro, 11");
        await client.sendMessage(chatId, loc);
        await client.sendMessage(chatId, messages.LOCALIZACAO_TEXTO);
      }
      else {
        // Tenta extrair datas
        const datas = extrairDatas(texto);
        if (datas) {
          const resultado = pricing.calcularOrcamento(datas.entrada, datas.saida);

          if (!resultado.valido) {
            await client.sendMessage(chatId, `❌ ${resultado.erro}\nPor favor, digite as datas novamente.`);
            return;
          }

          if (resultado.especial) {
            await client.sendMessage(chatId, messages.ORCAMENTO_DATA_ESPECIAL);

            const numeroCliente = chatId.replace("@c.us", "");

            // Salva na planilha como contato pendente para o dono assumir depois
            await sheets.salvarReserva({
              data_criacao: new Date().toISOString(),
              nome: "Cliente de Pacote",
              telefone: numeroCliente,
              check_in: datas.entrada,
              check_out: datas.saida,
              valor: "A COMBINAR",
              status: "AGUARDANDO CONTATO"
            });

            // Avisa o dono no WhatsApp
            const textoAvisoDono = `🚨 *NOVO PEDIDO DE PACOTE* 🚨\nUm cliente está querendo fechar pacote para o Ano Novo/Carnaval!\n\n📱 *Telefone:* ${numeroCliente}\n📅 *Data:* ${datas.entrada} a ${datas.saida}\n\nEntre em contato com ele para negociar. O contato já foi salvo na planilha como 'AGUARDANDO CONTATO'.`;
            await client.sendMessage(config.NUMERO_DONO + "@c.us", textoAvisoDono);

            storage.resetarSessao(chatId);
            return;
          }

          // Orçamento válido
          storage.atualizarEstado(chatId, {
            estado: "AGUARDANDO_CONFIRMACAO",
            reservaTemp: {
              entrada: datas.entrada,
              saida: datas.saida,
              valor: resultado.valorTotal,
              dias: resultado.dias
            }
          });

          const txtOrcamento = messages.ORCAMENTO(datas.entrada, datas.saida, resultado.valorTotal, resultado.dias);
          await client.sendMessage(chatId, txtOrcamento);

        } else {
          // Não entendeu nada
          await client.sendMessage(chatId, messages.ERRO_ENTENDIMENTO);
        }
      }
      break;

    case "AGUARDANDO_CONFIRMACAO":
      if (textoLimpo === "SIM") {
        await client.sendMessage(chatId, messages.PEDIR_DADOS);
        storage.atualizarEstado(chatId, { estado: "AGUARDANDO_DADOS" });
      } else if (textoLimpo === "NAO" || textoLimpo === "NÃO") {
        await client.sendMessage(chatId, messages.RESERVA_ABORTADA);

        // Salva na planilha como contato pendente para marketing
        await sheets.salvarReserva({
          data_criacao: new Date().toISOString(),
          nome: "Não informado",
          telefone: chatId.replace("@c.us", ""),
          check_in: sessao.reservaTemp.entrada,
          check_out: sessao.reservaTemp.saida,
          valor: sessao.reservaTemp.valor,
          status: "ORÇAMENTO"
        });

        storage.resetarSessao(chatId);
      } else {
        await client.sendMessage(chatId, "Por favor, digite apenas *SIM* ou *NAO*.");
      }
      break;

    case "AGUARDANDO_DADOS":
      // Tudo que o usuário digitar aqui assumimos como Nome + Contato
      storage.atualizarEstado(chatId, {
        estado: "AGUARDANDO_PIX",
        dadosCliente: {
          nome: texto.split(",")[0] || texto, // Tenta pegar até a vírgula
          telefone: chatId.replace("@c.us", "") // Usa o próprio numero do whatsapp como segurança
        }
      });

      const txtPix = messages.INSTRUCOES_PIX(config.CHAVE_PIX || "marcioduani@gmail.com", config.NOME_PIX || "Marcio Duani");
      await client.sendMessage(chatId, txtPix);
      break;

    case "AGUARDANDO_PIX":
      if (messageObj.hasMedia) {
        // Avisa o cliente que está verificando
        await client.sendMessage(chatId, messages.AGUARDANDO_CONFIRMACAO_DONO);

        const numeroCliente = chatId.replace("@c.us", "").replace("@lid", "");
        storage.atualizarEstado(chatId, { estado: "AGUARDANDO_DONO" });

        // Texto de aviso pro dono
        const textoParaDono = `🚨 *NOVO COMPROVANTE DE PIX* 🚨\n\nCliente: ${sessao.dadosCliente.nome}\nTelefone: ${numeroCliente}\nData: ${sessao.reservaTemp.entrada} a ${sessao.reservaTemp.saida}\nValor: R$ ${sessao.reservaTemp.valor}\n\nPara confirmar essa reserva e liberar o manual pro cliente, responda:\n*OK ${numeroCliente}*`;

        try {
          const media = await messageObj.downloadMedia();
          if (media) {
            await client.sendMessage(config.NUMERO_DONO + "@c.us", media, { caption: textoParaDono });
          } else {
            throw new Error("downloadMedia retornou nulo");
          }
        } catch (err) {
          logger.error(chatId, "Erro ao extrair comprovante (provável bug de @lid):", err.message);
          // Avisa em texto sem a foto
          await client.sendMessage(config.NUMERO_DONO + "@c.us", textoParaDono + "\n\n*(⚠️ O cliente anexou o comprovante, mas o WhatsApp Web ocultou o arquivo. Verifique a imagem no seu próprio celular!)*");
        }
      } else {
        await client.sendMessage(chatId, messages.AGUARDANDO_COMPROVANTE);
      }
      break;

    case "AGUARDANDO_DONO":
      await client.sendMessage(chatId, "Ainda estou aguardando a validação do proprietário. Assim que ele der o OK, te envio o manual da casa! 😊");
      break;

    default:
      // Se caiu aqui, reseta
      storage.resetarSessao(chatId);
      await client.sendMessage(chatId, messages.BOAS_VINDAS);
      break;
  }
}

async function tratarComandoDono(texto, client) {
  const cmd = texto.trim().toUpperCase();
  if (cmd.startsWith("OK")) {
    let telefoneTarget = cmd.split(" ")[1];
    let result = null;

    if (!telefoneTarget) {
      // Se digitou só "OK", procura a sessão mais recente que esteja AGUARDANDO_DONO
      const rawSessions = fs.readFileSync(path.join(__dirname, 'sessions_store.json'), 'utf-8');
      const sessions = JSON.parse(rawSessions);
      let ultimaSessao = null;

      for (const [cId, data] of Object.entries(sessions)) {
        if (data.estado === "AGUARDANDO_DONO") {
          if (!ultimaSessao || data.ultimaInteracao > ultimaSessao.sessao.ultimaInteracao) {
            ultimaSessao = { chatId: cId, sessao: data };
          }
        }
      }

      if (ultimaSessao) {
        result = ultimaSessao;
      } else {
        await client.sendMessage(config.NUMERO_DONO + "@c.us", `❌ Nenhuma reserva pendente de aprovação encontrada.`);
        return;
      }
    } else {
      result = buscarSessaoPorTelefone(telefoneTarget);
      if (!result) {
        await client.sendMessage(config.NUMERO_DONO + "@c.us", `❌ Não encontrei reserva aguardando aprovação para o número ${telefoneTarget}`);
        return;
      }
    }

    const { chatId, sessao } = result;

    if (sessao.estado !== "AGUARDANDO_DONO") {
      await client.sendMessage(config.NUMERO_DONO + "@c.us", `⚠️ A reserva de ${sessao.dadosCliente?.nome || telefoneTarget} não está no status de aguardando dono.`);
      return;
    }

    // Aprova!
    // 1. Manda mensagem pro cliente
    await client.sendMessage(chatId, messages.MANUAL_CASA);

    // 2. Salva na Planilha
    await sheets.salvarReserva({
      data_criacao: new Date().toISOString(),
      nome: sessao.dadosCliente.nome,
      telefone: chatId.replace("@c.us", ""),
      check_in: sessao.reservaTemp.entrada,
      check_out: sessao.reservaTemp.saida,
      valor: sessao.reservaTemp.valor,
      status: "CONFIRMADO"
    });

    // 3. Reseta a sessão do cliente para finalizar
    storage.resetarSessao(chatId);

    // 4. Confirma pro Dono
    await client.sendMessage(config.NUMERO_DONO + "@c.us", `✅ Reserva de ${sessao.dadosCliente.nome} confirmada e salva na planilha! Manual enviado ao cliente.`);
  }
}

async function enviarFotos(client, chatId, messageObj) {
  const pastaFotos = path.join(__dirname, 'fotos');
  if (!fs.existsSync(pastaFotos)) {
    await client.sendMessage(chatId, "Desculpe, a galeria de fotos ainda está sendo montada.");
    return;
  }

  const arquivos = fs.readdirSync(pastaFotos).filter(f => {
    const ext = f.toLowerCase();
    return ext.endsWith('.jpg') || ext.endsWith('.png') || ext.endsWith('.jpeg');
  });
  if (arquivos.length === 0) {
    await client.sendMessage(chatId, "As fotos estão sendo atualizadas, tente novamente mais tarde.");
    return;
  }

  // Envia até 5 fotos para não floodar
  const fotosParaEnviar = arquivos.slice(0, 5);
  for (const foto of fotosParaEnviar) {
    try {
      const media = MessageMedia.fromFilePath(path.join(pastaFotos, foto));
      // Envia usando client.sendMessage direto pro @c.us que foi mapeado no chatbot.js
      await client.sendMessage(chatId, media);
    } catch (err) {
      logger.error(chatId, `Erro ao enviar a foto ${foto}:`, err.message);
    }
  }
}

// Roda de tempos em tempos para limpar inativos
async function varrerSessoesAbandonadas(client) {
  const rawSessions = fs.readFileSync(path.join(__dirname, 'sessions_store.json'), 'utf-8');
  const sessions = JSON.parse(rawSessions);
  const agora = Date.now();
  const limiteInatividade = 30 * 60 * 1000; // 30 minutos

  for (const [chatId, sessao] of Object.entries(sessions)) {
    if (sessao.estado === "INICIO" || sessao.estado === "MENU_PRINCIPAL") continue;

    if (agora - sessao.ultimaInteracao > limiteInatividade) {
      logger.info(chatId, "Sessão abandonada. Salvando na planilha e resetando.");

      if (sessao.reservaTemp) {
        await sheets.salvarReserva({
          data_criacao: new Date().toISOString(),
          nome: sessao.dadosCliente?.nome || "Abandonou",
          telefone: chatId.replace("@c.us", "").replace("@lid", ""),
          check_in: sessao.reservaTemp.entrada,
          check_out: sessao.reservaTemp.saida,
          valor: sessao.reservaTemp.valor,
          status: "ABANDONO"
        });
      }

      try {
        await client.sendMessage(chatId, "Vi que você não pôde concluir a reserva agora. Se mudar de ideia ou quiser outras datas, basta me chamar novamente! Até logo! 👋");
      } catch (err) { }

      storage.resetarSessao(chatId);
    }
  }
}

module.exports = {
  processarMensagemCliente,
  tratarComandoDono,
  varrerSessoesAbandonadas
};
