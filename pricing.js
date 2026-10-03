// pricing.js
// Motor de cálculo de preços baseado em regras e exceções

// Regras de exceções personalizadas (Ano atual e próximo)
const precosPersonalizados = {
  // Setembro
  "04/09": 350, "05/09": 400, "06/09": 400, "07/09": 350,
  // Outubro
  "09/10": 350, "10/10": 400, "11/10": 400, "12/10": 350,
  // Novembro
  "30/10": 350, "31/10": 400, "01/11": 400, "02/11": 350,
};

// Datas especiais (Ano Novo e Carnaval) que bloqueiam cálculo e pedem pacote a combinar
const datasEspeciaisPacote = [
  "24/12", "25/12", "26/12", "27/12", "28/12", "29/12", "30/12", "31/12",
  "01/01", "02/01"
  // Podemos adicionar carnaval aqui depois ex: "28/02", "01/03"...
];

/**
 * Converte string DD/MM/AAAA para objeto Date
 */
function parseData(dataStr) {
  const partes = dataStr.split("/");
  if (partes.length !== 3) return null;
  const dia = parseInt(partes[0], 10);
  const mes = parseInt(partes[1], 10) - 1; // Mes no JS começa em 0
  const ano = parseInt(partes[2], 10);
  
  const d = new Date(ano, mes, dia);
  if (d.getFullYear() === ano && d.getMonth() === mes && d.getDate() === dia) {
    return d;
  }
  return null;
}

/**
 * Retorna string "DD/MM" para checar no dicionário
 */
function getDiaMesFormatado(data) {
  const d = String(data.getDate()).padStart(2, '0');
  const m = String(data.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}`;
}

/**
 * Avalia o preço de um único dia
 */
function calcularPrecoDiaria(dataAtual) {
  const diaMes = getDiaMesFormatado(dataAtual);
  
  // 1. É um dia de pacote especial (Ano Novo/Carnaval)?
  if (datasEspeciaisPacote.includes(diaMes)) {
    return "ESPECIAL";
  }

  // 2. É uma data personalizada mapeada com valor exato?
  if (precosPersonalizados[diaMes]) {
    return precosPersonalizados[diaMes];
  }

  const diaSemana = dataAtual.getDay(); // 0 (Dom) a 6 (Sab)
  // Sexta=5, Sab=6, Dom=0
  const isFimDeSemana = diaSemana === 0 || diaSemana === 5 || diaSemana === 6;

  const mes = dataAtual.getMonth(); // 0 = Janeiro, 11 = Dezembro
  const dia = dataAtual.getDate();

  // 3. Regra de Janeiro inteiro
  if (mes === 0) { // Janeiro
    return isFimDeSemana ? 450 : 400;
  }

  // 4. Regra de Verão (A partir de 21/12)
  if (mes === 11 && dia >= 21) {
    return isFimDeSemana ? 450 : 350;
  }

  // 5. Regra Geral (Baixa temporada)
  return isFimDeSemana ? 350 : 250;
}

/**
 * Calcula o orçamento total para o período
 * Retorna objeto: { valido: boolean, especial: boolean, valorTotal: number, dias: number, erro: string }
 */
function calcularOrcamento(dataEntradaStr, dataSaidaStr) {
  const dEntrada = parseData(dataEntradaStr);
  const dSaida = parseData(dataSaidaStr);

  if (!dEntrada || !dSaida) {
    return { valido: false, erro: "Datas inválidas. Use o formato DD/MM/AAAA." };
  }

  if (dEntrada >= dSaida) {
    return { valido: false, erro: "A data de saída deve ser depois da data de entrada." };
  }

  if (dEntrada < new Date(new Date().setHours(0,0,0,0))) {
    return { valido: false, erro: "A data de entrada não pode ser no passado." };
  }

  let valorTotal = 0;
  let totalDias = 0;
  let temDataEspecial = false;

  // Clona a data de entrada para iterar
  let dataAtual = new Date(dEntrada.getTime());

  // Itera dia por dia, da entrada até o dia anterior à saída (pois a última noite conta)
  while (dataAtual < dSaida) {
    const preco = calcularPrecoDiaria(dataAtual);
    
    if (preco === "ESPECIAL") {
      temDataEspecial = true;
      break;
    }

    valorTotal += preco;
    totalDias++;

    // Avança 1 dia
    dataAtual.setDate(dataAtual.getDate() + 1);
  }

  if (temDataEspecial) {
    return { valido: true, especial: true };
  }

  if (totalDias < 2) {
    return { valido: false, erro: "O período mínimo para reserva é de 2 diárias." };
  }

  return {
    valido: true,
    especial: false,
    valorTotal,
    dias: totalDias
  };
}

module.exports = {
  calcularOrcamento,
  parseData
};
