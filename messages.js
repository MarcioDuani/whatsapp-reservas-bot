const config = require('./config');

const messages = {
  BOAS_VINDAS: `Olá! Sou a Joana, assistente virtual da Casa de Praia em Arraial do Cabo. 🏖️ Vou seguir com seu atendimento.

Como posso te ajudar hoje? (Escolha uma opção abaixo e digite exatamente como está escrito):

📅 *Para reservar:* Digite a data de entrada e saída no formato DD/MM/AAAA a DD/MM/AAAA (Ex: 10/01/2027 a 15/01/2027)
📸 *Para ver as fotos:* Digite *FOTO*
ℹ️ *Para saber mais sobre a casa:* Digite *DETALHES*
📍 *Para ver onde fica:* Digite *LOCAL*`,

  DETALHES: `Nossa casa é super completa e acomoda até 10 pessoas confortavelmente! 🏡✨

*Estrutura:*
🛏️ 2 quartos grandes
🍳 Cozinha interna e Cozinha externa
🚿 3 banheiros com água quente + chuveirão
🛋️ Sala de estar e Lavanderia
🌅 Varanda frontal (35m²) e Varanda nos fundos (25m²)
🚗 Garagem para 3 carros e Jardim
🥩 Churrasqueira (concreto e portátil)

*Comodidades:*
📺 Smart TV e 📶 Wi-Fi rápido
🧊 Copos Stanley à disposição
🛋️ Sofá, rede, 2 ventiladores
🪑 6 mesas e 12 cadeiras de plástico

*Camas disponíveis:*
1 Cama de casal, 1 Beliche, 1 Cama de solteiro, 1 Colchão inflável solteiro, 1 Colchão de casal e 8 colchonetes.

Tudo que você precisa para passar dias incríveis com sua família e amigos!

👉 Para fazer um orçamento, digite as datas desejadas no formato: *DD/MM/AAAA a DD/MM/AAAA*`,

  LOCALIZACAO_TEXTO: `Ficamos em uma excelente localização! Para consultar valores, basta me enviar a data desejada no formato: *DD/MM/AAAA a DD/MM/AAAA*`,

  FOTO_FINAL: `Um verdadeiro paraíso, não é? 😍
Para consultar a disponibilidade e valores, me envie a data de entrada e saída no formato: *DD/MM/AAAA a DD/MM/AAAA*`,

  ORCAMENTO: (entrada, saida, valor, totalDias) => `Ótima escolha! Temos disponibilidade para esse período. 🎉

📅 Entrada: ${entrada}
📅 Saída: ${saida}
💵 Valor total: R$ ${valor} (${totalDias} diárias)

⚠️ *Observação:* O aluguel da casa é para no máximo 10 pessoas.
⚠️ *Atenção:* Em feriados de fim de ano (Natal/Ano Novo) e Carnaval, trabalhamos apenas com pacotes a combinar.

Deseja fechar a reserva agora e garantir essas datas? Digite *SIM* ou *NAO*.`,

  ORCAMENTO_DATA_ESPECIAL: `Para este período (Feriado de Fim de Ano/Carnaval), trabalhamos apenas com pacotes especiais a combinar. 
O proprietário entrará em contato com você em breve para alinhar os detalhes e valores!`,

  PEDIR_DADOS: `Perfeito! Para gerar sua reserva, preciso de dois dados:
Por favor, digite o seu *Nome Completo* e em seguida o seu *Telefone/WhatsApp* (Ex: João da Silva, 21999999999).`,

  INSTRUCOES_PIX: (pixChave, nomeRecebedor) => `Dados recebidos! Aqui está a chave PIX para confirmar a reserva:

🔑 Chave PIX: ${pixChave}
👤 Nome: ${nomeRecebedor}

Por favor, faça o pagamento do valor total ou do sinal acordado e me envie a *foto ou PDF do comprovante* por aqui. (A reserva só é garantida após o envio do comprovante).`,

  MANUAL_CASA: `Pagamento confirmado! 🎉 Sua reserva está garantida. Estamos muito felizes em recebê-los!

📖 *MANUAL DE USO DA CASA DE ARRAIAL DO CABO*

1️⃣ *Acesso:* O acesso à casa é pelo portão social. O portão de garagem só abre pelo lado de dentro.
2️⃣ *Água:* Abrir o registro de água que fica ao lado do portão de garagem. Ao sair do imóvel (entrega das chaves), favor entregar com o registro fechado.
3️⃣ *Wi-Fi:* 
👤 Login: Tia Diná
🔑 Senha: 17161716
4️⃣ *Chaves Internas:* As chaves do quarto e do banheiro externo ficam no armário da cozinha. A chave da suíte está no molho de chaves que já está com você.
5️⃣ *Gás e Geladeira:* Abrir o registro do gás. Caso seja necessário aumentar a potência da geladeira, não esqueça de voltar para a *potência mínima* antes de entregar as chaves.

O proprietário entrará em contato próximo à data para combinar a entrega das chaves. Qualquer dúvida, estamos à disposição. Boa viagem!`,

  ERRO_ENTENDIMENTO: `Desculpe, não consegui entender o formato. 
Por favor, digite uma das opções abaixo:

📅 Para datas, use exatamente o formato: *DD/MM/AAAA a DD/MM/AAAA*
📸 Digite *FOTO*
ℹ️ Digite *DETALHES*
📍 Digite *LOCAL*`,

  AGUARDANDO_COMPROVANTE: `Ainda estou aguardando o envio do comprovante PIX (foto ou PDF) para confirmar sua reserva! 😊`,
  
  AGUARDANDO_CONFIRMACAO_DONO: `Recebi o seu comprovante! Ele foi encaminhado para o proprietário para validação. Assim que ele confirmar, eu te aviso aqui e libero o manual da casa com as instruções. Aguarde só um momento!`,

  RESERVA_ABORTADA: `Tudo bem, reserva cancelada! Caso mude de ideia ou queira consultar outras datas, é só me chamar. 👋`
};

module.exports = messages;
