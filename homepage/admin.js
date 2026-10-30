// ============================================================
// admin.js — Lógica do Painel Administrativo (/admin)
// ============================================================

if (typeof tailwind !== 'undefined') {
  tailwind.config = {
    theme: {
      extend: {
        fontFamily: { sans: ['Inter', 'sans-serif'] }
      }
    }
  };
}

const API_BASE = (typeof location !== 'undefined' && location.protocol === 'file:') ? 'http://localhost:3000' : '';
let SENHA_ADMIN = sessionStorage.getItem('admin_senha_casa') || '';
let DADOS = null;

function mostrarToast(texto, erro = false) {
  const el = document.getElementById('toast-msg');
  el.textContent = texto;
  el.className = `fixed top-4 right-4 left-4 sm:left-auto z-50 px-4 py-3 rounded-2xl shadow-xl text-xs sm:text-sm font-semibold text-white text-center transition ${erro ? 'bg-red-600' : 'bg-emerald-600'}`;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3500);
}

function deslogar() {
  SENHA_ADMIN = '';
  sessionStorage.removeItem('admin_senha_casa');
  document.getElementById('input-senha').value = '';
  document.getElementById('tela-painel').classList.add('hidden');
  document.getElementById('tela-login').classList.remove('hidden');
}

async function fazerLogin(e) {
  if (e) e.preventDefault();
  const input = document.getElementById('input-senha');
  const senha = input.value.trim();
  const erroEl = document.getElementById('erro-login');
  erroEl.classList.add('hidden');

  try {
    const resp = await fetch(`${API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senha })
    });
    if (!resp.ok) {
      erroEl.classList.remove('hidden');
      return;
    }
    SENHA_ADMIN = senha;
    sessionStorage.setItem('admin_senha_casa', senha);
    await carregarPainel();
  } catch (err) {
    const msg = location.protocol === 'file:'
      ? 'Erro ao conectar ao servidor local. Acesse pelo navegador: http://localhost:3000/admin'
      : 'Erro de conexão com o servidor.';
    mostrarToast(msg, true);
  }
}

async function carregarPainel() {
  const resp = await fetch(`${API_BASE}/api/site-data`);
  DADOS = await resp.json();

  document.getElementById('tela-login').classList.add('hidden');
  document.getElementById('tela-painel').classList.remove('hidden');

  renderizarTudo();
}

function renderizarTudo() {
  renderizarListaCards('cardsCasa', 'lista-cards-casa', true);
  renderizarListaCards('cardsPraias', 'lista-cards-praias', false);
  renderizarValores();
  renderizarCapa();
}

function renderizarValores() {
  const v = DADOS.valores || {};
  document.getElementById('val-semana-titulo').value = v.semanaTitulo || '';
  document.getElementById('val-semana-preco').value = v.semanaPreco || '';
  document.getElementById('val-semana-detalhe').value = v.semanaDetalhe || '';
  document.getElementById('val-fds-titulo').value = v.fdsTitulo || '';
  document.getElementById('val-fds-preco').value = v.fdsPreco || '';
  document.getElementById('val-fds-detalhe').value = v.fdsDetalhe || '';
  document.getElementById('val-barra-topo').value = v.barraResumoTopo || '';
  document.getElementById('val-barra-preco').value = v.barraResumoPreco || '';
}

function renderizarCapa() {
  const c = DADOS.capa || {};
  document.getElementById('preview-capa-img').src = c.imagem || 'midia/arraial/hero-arraial.jpg';
  document.getElementById('capa-badge').value = c.localizacaoBadge || '';
  document.getElementById('capa-titulo').value = c.titulo || '';
  document.getElementById('capa-subtitulo').value = c.subtitulo || '';

  const wrapPilulas = document.getElementById('lista-pilulas-capa');
  wrapPilulas.innerHTML = '';
  (c.pilulas || []).forEach((p, idx) => {
    const div = document.createElement('div');
    div.className = 'p-3 rounded-xl bg-amber-50/70 border border-amber-200/80 space-y-2';
    div.innerHTML = `
      <div>
        <label class="block text-[11px] font-medium text-slate-500">Título Pequeno #${idx + 1}</label>
        <input type="text" value="${escaparHtml(p.rotulo)}" oninput="DADOS.capa.pilulas[${idx}].rotulo = this.value" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-medium mt-0.5" />
      </div>
      <div>
        <label class="block text-[11px] font-medium text-slate-500">Destaque #${idx + 1}</label>
        <input type="text" value="${escaparHtml(p.valor)}" oninput="DADOS.capa.pilulas[${idx}].valor = this.value" class="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold mt-0.5" />
      </div>
    `;
    wrapPilulas.appendChild(div);
  });
}

const AMBIENTES_BASE = [
  { valor: 'estrutura', label: 'Fachada, Quintal & Garagem' },
  { valor: 'lazer', label: 'Varandas & Churrasco' },
  { valor: 'interno', label: 'Sala & Cozinhas' },
  { valor: 'quartos', label: 'Quartos' }
];

function obterOpcoesAmbientes() {
  const mapa = new Map();
  AMBIENTES_BASE.forEach(a => mapa.set(a.valor, a.label));
  if (DADOS && Array.isArray(DADOS.cardsCasa)) {
    DADOS.cardsCasa.forEach(c => {
      const cat = (c.categoria || '').trim();
      if (cat && !mapa.has(cat)) {
        mapa.set(cat, cat);
      }
    });
  }
  return Array.from(mapa.entries()).map(([valor, label]) => ({ valor, label }));
}

function alterarCategoriaCardExistente(selectEl, chaveArray, cIdx) {
  if (selectEl.value === '__novo__') {
    const novoNome = prompt('Digite o nome do novo ambiente (ex: Banheiros, Lavanderia):');
    if (novoNome && novoNome.trim()) {
      sincronizarInputsParaDados();
      DADOS[chaveArray][cIdx].categoria = novoNome.trim();
      renderizarTudo();
    } else {
      renderizarTudo();
    }
  } else {
    DADOS[chaveArray][cIdx].categoria = selectEl.value;
  }
}

function renderizarListaCards(chaveArray, containerId, temCategoria) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  const lista = DADOS[chaveArray] || [];
  const opcoesAmbientes = obterOpcoesAmbientes();

  lista.forEach((card, cIdx) => {
    const box = document.createElement('div');
    box.className = 'bg-white rounded-2xl border border-amber-200/90 p-3.5 sm:p-5 shadow-sm space-y-3.5';

    const optionsHtml = opcoesAmbientes.map(op =>
      `<option value="${escaparHtml(op.valor)}" ${card.categoria === op.valor ? 'selected' : ''}>${escaparHtml(op.label)}</option>`
    ).join('') + `<option value="__novo__">＋ Criar outro ambiente...</option>`;

    const seletorCategoriaHtml = temCategoria ? `
      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">Aba de Ambiente no Site</label>
        <select onchange="alterarCategoriaCardExistente(this, '${chaveArray}', ${cIdx})" class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-medium bg-white">
          ${optionsHtml}
        </select>
      </div>
    ` : '';

    const fotosHtml = (card.fotos || []).map((f, fIdx) => `
      <div class="flex items-center gap-2.5 p-2 rounded-xl bg-amber-50/60 border border-amber-200/80">
        <img src="${escaparHtml(f.src)}" alt="" class="w-16 h-14 sm:w-20 sm:h-16 object-cover rounded-lg border border-amber-200 shrink-0 bg-white" />
        <div class="flex-1 min-w-0">
          <label class="block text-[10px] font-semibold text-slate-400 mb-0.5">Foto ${fIdx + 1} — Legenda</label>
          <input
            type="text"
            placeholder="Legenda da foto"
            value="${escaparHtml(f.alt || '')}"
            oninput="DADOS.${chaveArray}[${cIdx}].fotos[${fIdx}].alt = this.value"
            class="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs bg-white"
          />
        </div>
        <button
          type="button"
          onclick="removerFoto('${chaveArray}', ${cIdx}, ${fIdx})"
          title="Remover esta foto"
          class="shrink-0 w-9 h-9 sm:w-auto sm:h-auto sm:px-2.5 sm:py-1.5 rounded-xl bg-red-50/80 hover:bg-red-100 text-red-600 border border-red-200/80 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition"
        >
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/>
          </svg>
          <span class="hidden sm:inline">Remover</span>
        </button>
      </div>
    `).join('');

    box.innerHTML = `
      <div class="flex items-center justify-between gap-2 border-b border-amber-100 pb-2.5">
        <div class="flex items-center gap-2 min-w-0">
          <span class="shrink-0 px-2 py-0.5 rounded-lg bg-amber-100 text-amber-900 font-bold text-xs">#${cIdx + 1}</span>
          <h3 class="font-bold text-slate-900 text-sm sm:text-base truncate">${escaparHtml(card.titulo || 'Sem título')}</h3>
        </div>
        <button
          type="button"
          onclick="excluirCard('${chaveArray}', ${cIdx})"
          title="Excluir Card"
          class="shrink-0 w-8 h-8 sm:w-auto sm:h-auto sm:px-2.5 sm:py-1 rounded-xl bg-red-50/80 hover:bg-red-100 text-red-600 border border-red-200/80 text-xs font-medium inline-flex items-center justify-center gap-1.5 transition"
        >
          <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14zM10 11v6M14 11v6"/>
          </svg>
          <span class="hidden sm:inline">Excluir Card</span>
        </button>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        ${seletorCategoriaHtml}
        <div>
          <label class="block text-xs font-medium text-slate-600 mb-1">Etiqueta Acima do Título</label>
          <input
            type="text"
            value="${escaparHtml(card.etiqueta || '')}"
            oninput="DADOS.${chaveArray}[${cIdx}].etiqueta = this.value"
            class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
          />
        </div>
      </div>

      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">Título do Card</label>
        <input
          type="text"
          value="${escaparHtml(card.titulo || '')}"
          oninput="DADOS.${chaveArray}[${cIdx}].titulo = this.value"
          class="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-bold text-slate-900"
        />
      </div>

      <div>
        <label class="block text-xs font-medium text-slate-600 mb-1">Descrição</label>
        <textarea
          rows="2"
          oninput="DADOS.${chaveArray}[${cIdx}].descricao = this.value"
          class="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs text-slate-700"
        >${escaparHtml(card.descricao || '')}</textarea>
      </div>

      <div class="space-y-2 pt-1">
        <div class="flex items-center justify-between gap-2">
          <label class="text-xs font-bold text-slate-700">Fotos no Card (${(card.fotos || []).length})</label>
          <label
            title="Adicionar Foto(s)"
            class="shrink-0 w-8 h-8 sm:w-auto sm:h-auto sm:px-3 sm:py-1.5 rounded-xl bg-slate-900/5 hover:bg-slate-900/10 text-slate-800 border border-slate-300/80 backdrop-blur-xs text-xs font-semibold cursor-pointer shadow-xs transition inline-flex items-center justify-center gap-1"
          >
            <span class="text-base sm:text-sm font-bold leading-none">＋</span>
            <span class="hidden sm:inline">Adicionar Foto(s)</span>
            <input type="file" accept="image/*" multiple class="hidden" onchange="adicionarFotosNoCard(this, '${chaveArray}', ${cIdx})" />
          </label>
        </div>
        <div class="space-y-2">
          ${fotosHtml || '<p class="text-xs text-amber-800 bg-amber-50 p-3 rounded-xl border border-amber-200">Nenhuma foto neste card. Toque em "＋" acima para enviar.</p>'}
        </div>
      </div>
    `;

    container.appendChild(box);
  });
}

function sincronizarInputsParaDados() {
  if (!DADOS) return;
  DADOS.valores = {
    semanaTitulo: document.getElementById('val-semana-titulo').value.trim(),
    semanaPreco: document.getElementById('val-semana-preco').value.trim(),
    semanaDetalhe: document.getElementById('val-semana-detalhe').value.trim(),
    fdsTitulo: document.getElementById('val-fds-titulo').value.trim(),
    fdsPreco: document.getElementById('val-fds-preco').value.trim(),
    fdsDetalhe: document.getElementById('val-fds-detalhe').value.trim(),
    barraResumoTopo: document.getElementById('val-barra-topo').value.trim(),
    barraResumoPreco: document.getElementById('val-barra-preco').value.trim()
  };
  DADOS.capa.localizacaoBadge = document.getElementById('capa-badge').value.trim();
  DADOS.capa.titulo = document.getElementById('capa-titulo').value.trim();
  DADOS.capa.subtitulo = document.getElementById('capa-subtitulo').value.trim();
}

let acaoConfirmadaCallback = null;

function abrirConfirmacao(titulo, texto, callback) {
  document.getElementById('modal-conf-titulo').textContent = titulo;
  document.getElementById('modal-conf-texto').textContent = texto;
  acaoConfirmadaCallback = callback;
  document.getElementById('modal-confirmacao').classList.remove('hidden');
}

function fecharConfirmacao() {
  acaoConfirmadaCallback = null;
  document.getElementById('modal-confirmacao').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  const btnOk = document.getElementById('modal-conf-btn-ok');
  if (btnOk) {
    btnOk.addEventListener('click', () => {
      if (typeof acaoConfirmadaCallback === 'function') {
        acaoConfirmadaCallback();
      }
      fecharConfirmacao();
    });
  }
});

function removerFoto(chaveArray, cIdx, fIdx) {
  const card = DADOS[chaveArray][cIdx];
  abrirConfirmacao(
    'Remover esta foto?',
    `Deseja remover a foto #${fIdx + 1} do card "${card.titulo || 'Sem título'}"?`,
    () => {
      sincronizarInputsParaDados();
      DADOS[chaveArray][cIdx].fotos.splice(fIdx, 1);
      renderizarTudo();
      mostrarToast('Foto removida! Toque em "Salvar" para confirmar.');
    }
  );
}

function excluirCard(chaveArray, cIdx) {
  const card = DADOS[chaveArray][cIdx];
  abrirConfirmacao(
    'Excluir este card?',
    `Tem certeza que deseja excluir o card "${card.titulo || 'Sem título'}" e todas as fotos dele?`,
    () => {
      sincronizarInputsParaDados();
      DADOS[chaveArray].splice(cIdx, 1);
      renderizarTudo();
      mostrarToast('Card excluído! Toque em "Salvar" para confirmar.');
    }
  );
}

let chaveNovoCardAtual = 'cardsCasa';

function verificarNovoAmbienteModal(valor) {
  const wrapInput = document.getElementById('wrap-input-novo-ambiente');
  if (valor === '__novo__') {
    wrapInput.classList.remove('hidden');
    setTimeout(() => document.getElementById('input-novo-ambiente-custom').focus(), 50);
  } else {
    wrapInput.classList.add('hidden');
  }
}

function adicionarNovoCard(chaveArray) {
  sincronizarInputsParaDados();
  chaveNovoCardAtual = chaveArray;
  document.getElementById('wrap-novo-categoria').style.display = chaveArray === 'cardsCasa' ? 'block' : 'none';

  const selectModal = document.getElementById('novo-card-categoria');
  const opcoes = obterOpcoesAmbientes();
  selectModal.innerHTML = opcoes.map(op =>
    `<option value="${escaparHtml(op.valor)}">${escaparHtml(op.label)}</option>`
  ).join('') + `<option value="__novo__">＋ Criar outro ambiente novo...</option>`;

  document.getElementById('wrap-input-novo-ambiente').classList.add('hidden');
  document.getElementById('input-novo-ambiente-custom').value = '';
  document.getElementById('novo-card-etiqueta').value = '';
  document.getElementById('novo-card-titulo').value = '';
  document.getElementById('novo-card-descricao').value = '';
  document.getElementById('novo-card-fotos').value = '';
  document.getElementById('modal-novo-card').classList.remove('hidden');
  setTimeout(() => document.getElementById('novo-card-titulo').focus(), 100);
}

function fecharModalNovoCard() {
  document.getElementById('modal-novo-card').classList.add('hidden');
}

async function confirmarCriacaoNovoCard() {
  const titulo = document.getElementById('novo-card-titulo').value.trim();
  if (!titulo) {
    mostrarToast('Digite um título para o novo card.', true);
    document.getElementById('novo-card-titulo').focus();
    return;
  }

  let categoria = document.getElementById('novo-card-categoria').value || 'banheiros';
  if (categoria === '__novo__') {
    const customAmb = document.getElementById('input-novo-ambiente-custom').value.trim();
    if (!customAmb) {
      mostrarToast('Digite o nome do novo ambiente.', true);
      document.getElementById('input-novo-ambiente-custom').focus();
      return;
    }
    categoria = customAmb;
  }

  const etiqueta = document.getElementById('novo-card-etiqueta').value.trim() || 'Destaque';
  const descricao = document.getElementById('novo-card-descricao').value.trim() || '';
  const files = Array.from(document.getElementById('novo-card-fotos').files || []);
  const btn = document.getElementById('btn-confirmar-novo-card');

  btn.disabled = true;
  btn.textContent = 'Criando...';

  try {
    const pasta = chaveNovoCardAtual === 'cardsPraias' ? 'arraial' : 'casa';
    const fotosEnviadas = [];

    for (const file of files) {
      const url = await enviarFotoParaServidor(file, pasta);
      fotosEnviadas.push({ src: url, alt: titulo });
    }

    DADOS[chaveNovoCardAtual].push({
      id: 'card-' + Date.now(),
      categoria,
      etiqueta,
      corEtiqueta: 'amber',
      titulo,
      descricao,
      fotos: fotosEnviadas
    });

    fecharModalNovoCard();
    renderizarTudo();

    const containerId = chaveNovoCardAtual === 'cardsPraias' ? 'lista-cards-praias' : 'lista-cards-casa';
    const container = document.getElementById(containerId);
    if (container && container.lastElementChild) {
      container.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    mostrarToast('✅ Novo card criado! Toque em "Salvar" para publicar no site.');
  } catch (err) {
    mostrarToast('Erro ao criar card: ' + err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = '✅ Criar Card';
  }
}

function comprimirImagemArquivo(file, maxLargura = 1400, qualidade = 0.84) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxLargura) {
          h = Math.round((h * maxLargura) / w);
          w = maxLargura;
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', qualidade));
      };
      img.onerror = reject;
      img.src = ev.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function enviarFotoParaServidor(file, pasta) {
  const imagemBase64 = await comprimirImagemArquivo(file);
  const resp = await fetch(`${API_BASE}/api/admin/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-admin-password': SENHA_ADMIN
    },
    body: JSON.stringify({
      imagemBase64,
      nomeOriginal: file.name,
      pasta
    })
  });
  const json = await resp.json();
  if (!resp.ok || !json.ok) {
    throw new Error(json.erro || 'Erro ao enviar foto');
  }
  return json.url;
}

async function adicionarFotosNoCard(inputEl, chaveArray, cIdx) {
  const files = Array.from(inputEl.files || []);
  if (!files.length) return;

  sincronizarInputsParaDados();
  const pasta = chaveArray === 'cardsPraias' ? 'arraial' : 'casa';

  mostrarToast(`Enviando ${files.length} foto(s)... aguarde.`);
  try {
    for (const file of files) {
      const url = await enviarFotoParaServidor(file, pasta);
      const legendaSugerida = DADOS[chaveArray][cIdx].titulo || 'Foto da Casa';
      DADOS[chaveArray][cIdx].fotos.push({
        src: url,
        alt: legendaSugerida
      });
    }
    renderizarTudo();
    mostrarToast('✅ Foto(s) adicionada(s)! Toque em "Salvar" para publicar.');
  } catch (err) {
    mostrarToast('Erro ao enviar foto: ' + err.message, true);
  } finally {
    inputEl.value = '';
  }
}

async function trocarFotoCapa(inputEl) {
  const file = inputEl.files?.[0];
  if (!file) return;
  sincronizarInputsParaDados();
  mostrarToast('Enviando nova foto de capa...');
  try {
    const url = await enviarFotoParaServidor(file, 'arraial');
    DADOS.capa.imagem = url;
    renderizarCapa();
    mostrarToast('✅ Foto de capa trocada! Toque em "Salvar".');
  } catch (err) {
    mostrarToast('Erro ao enviar foto: ' + err.message, true);
  } finally {
    inputEl.value = '';
  }
}

async function salvarTudo() {
  sincronizarInputsParaDados();
  const statusEl = document.getElementById('status-salvamento');
  statusEl.textContent = 'Salvando alterações...';

  try {
    const resp = await fetch(`${API_BASE}/api/admin/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-password': SENHA_ADMIN
      },
      body: JSON.stringify({ dados: DADOS })
    });
    const json = await resp.json();
    if (!resp.ok || !json.ok) {
      throw new Error(json.erro || 'Falha ao salvar');
    }
    statusEl.innerHTML = '✅ <strong>Tudo salvo!</strong> Site atualizado.';
    mostrarToast('✅ Alterações salvas com sucesso no site!');
  } catch (err) {
    statusEl.textContent = '❌ Erro ao salvar alterações.';
    mostrarToast('Erro ao salvar: ' + err.message, true);
  }
}

function mudarSecaoAdmin(nome, btn) {
  sincronizarInputsParaDados();
  document.querySelectorAll('.sec-admin').forEach(el => el.classList.add('hidden'));
  document.getElementById('sec-admin-' + nome).classList.remove('hidden');

  document.querySelectorAll('.aba-admin').forEach(b => {
    b.className = 'aba-admin shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-medium bg-white text-slate-600 border border-amber-200';
  });
  if (btn) {
    btn.className = 'aba-admin shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-full text-xs font-semibold bg-amber-200/90 text-amber-950 border border-amber-300';
  }
}

function escaparHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Se aberto via arquivo local direto (file://), exibe o aviso explicativo
if (typeof location !== 'undefined' && location.protocol === 'file:') {
  document.addEventListener('DOMContentLoaded', () => {
    const alerta = document.getElementById('alerta-file-protocol');
    if (alerta) alerta.classList.remove('hidden');
  });
}

// Se já tiver senha salva na sessão, tenta entrar direto
if (SENHA_ADMIN) {
  fetch(`${API_BASE}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ senha: SENHA_ADMIN })
  }).then(r => {
    if (r.ok) carregarPainel();
  }).catch(() => {});
}

