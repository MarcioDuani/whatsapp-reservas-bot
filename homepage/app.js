// ============================================================
// app.js — Lógica interativa da Home Page (Carrossel, Mapa, Abas e Dados)
// ============================================================

// Configuração da fonte padrão no Tailwind
if (typeof tailwind !== 'undefined') {
  tailwind.config = {
    theme: {
      extend: {
        fontFamily: {
          sans: ['Inter', 'sans-serif'],
        }
      }
    }
  };
}

// ================= CARROSSEL AUTOMÁTICO NOS CARDS =================
let modalListaFotos = [];
let modalIndiceAtual = 0;

function inicializarCarrosseisCards() {
  document.querySelectorAll('.carrossel-card').forEach(container => {
    const imgs = container.querySelectorAll('.slide-img');
    container.dataset.idx = '0';

    if (imgs.length <= 1) return;

    // Evita duplicar controles caso já inicializado
    if (container.querySelector('.slide-contador')) return;

    // Botão Setinha Esquerda (<)
    const btnPrev = document.createElement('button');
    btnPrev.type = 'button';
    btnPrev.innerHTML = '❮';
    btnPrev.title = 'Foto anterior';
    btnPrev.className = 'absolute left-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-800 text-xs font-bold shadow-md flex items-center justify-center transition';
    btnPrev.onclick = (e) => {
      e.stopPropagation();
      mudarSlideCard(container, -1);
    };

    // Botão Setinha Direita (>)
    const btnNext = document.createElement('button');
    btnNext.type = 'button';
    btnNext.innerHTML = '❯';
    btnNext.title = 'Próxima foto';
    btnNext.className = 'absolute right-2.5 top-1/2 -translate-y-1/2 z-20 w-8 h-8 rounded-full bg-white/90 hover:bg-white text-slate-800 text-xs font-bold shadow-md flex items-center justify-center transition';
    btnNext.onclick = (e) => {
      e.stopPropagation();
      mudarSlideCard(container, 1);
    };

    // Contador 1/N no canto superior direito do card
    const badge = document.createElement('span');
    badge.className = 'slide-contador absolute top-2.5 right-2.5 z-20 px-2 py-0.5 rounded-full bg-slate-900/65 text-white text-[11px] font-semibold backdrop-blur-sm';
    badge.textContent = `1/${imgs.length}`;

    // Bolinhas indicadoras na base da foto
    const dotsWrap = document.createElement('div');
    dotsWrap.className = 'absolute bottom-2.5 inset-x-0 z-20 flex justify-center gap-1.5 pointer-events-none';
    imgs.forEach((_, i) => {
      const dot = document.createElement('span');
      dot.className = i === 0
        ? 'slide-dot w-2 h-2 rounded-full bg-white shadow transition-all'
        : 'slide-dot w-1.5 h-1.5 rounded-full bg-white/60 shadow transition-all';
      dotsWrap.appendChild(dot);
    });

    container.appendChild(btnPrev);
    container.appendChild(btnNext);
    container.appendChild(badge);
    container.appendChild(dotsWrap);

    // Suporte a arrastar o dedo pro lado (Swipe no celular)
    let touchStartX = 0;
    container.addEventListener('touchstart', e => {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    container.addEventListener('touchend', e => {
      const diff = e.changedTouches[0].screenX - touchStartX;
      if (Math.abs(diff) > 40) {
        mudarSlideCard(container, diff < 0 ? 1 : -1);
      }
    }, { passive: true });
  });
}

function mudarSlideCard(container, direcao) {
  const imgs = container.querySelectorAll('.slide-img');
  if (imgs.length <= 1) return;

  let atual = parseInt(container.dataset.idx || '0', 10);
  imgs[atual].classList.add('hidden');

  atual = (atual + direcao + imgs.length) % imgs.length;
  container.dataset.idx = String(atual);
  imgs[atual].classList.remove('hidden');

  const badge = container.querySelector('.slide-contador');
  if (badge) badge.textContent = `${atual + 1}/${imgs.length}`;

  const dots = container.querySelectorAll('.slide-dot');
  dots.forEach((d, i) => {
    d.className = i === atual
      ? 'slide-dot w-2 h-2 rounded-full bg-white shadow transition-all'
      : 'slide-dot w-1.5 h-1.5 rounded-full bg-white/60 shadow transition-all';
  });
}

function ampliarCarrossel(container) {
  const imgs = Array.from(container.querySelectorAll('.slide-img'));
  if (!imgs.length) return;

  modalListaFotos = imgs.map(img => ({ src: img.src, alt: img.alt || '' }));
  modalIndiceAtual = parseInt(container.dataset.idx || '0', 10);

  atualizarModalFoto();
  document.getElementById('modal-foto').classList.remove('hidden');
}

function atualizarModalFoto() {
  const item = modalListaFotos[modalIndiceAtual];
  if (!item) return;

  document.getElementById('modal-img').src = item.src;
  const leg = document.getElementById('modal-legenda');
  if (modalListaFotos.length > 1) {
    leg.textContent = `${item.alt} (${modalIndiceAtual + 1}/${modalListaFotos.length})`;
    document.getElementById('modal-prev').classList.remove('hidden');
    document.getElementById('modal-next').classList.remove('hidden');
  } else {
    leg.textContent = item.alt;
    document.getElementById('modal-prev').classList.add('hidden');
    document.getElementById('modal-next').classList.add('hidden');
  }
}

function mudarFotoModal(direcao) {
  if (modalListaFotos.length <= 1) return;
  modalIndiceAtual = (modalIndiceAtual + direcao + modalListaFotos.length) % modalListaFotos.length;
  atualizarModalFoto();
}

function fecharFoto() {
  document.getElementById('modal-foto').classList.add('hidden');
}

// Fechar com tecla ESC ou navegar com setas do teclado
document.addEventListener('keydown', e => {
  const modal = document.getElementById('modal-foto');
  if (!modal || modal.classList.contains('hidden')) return;
  if (e.key === 'Escape') fecharFoto();
  if (e.key === 'ArrowLeft') mudarFotoModal(-1);
  if (e.key === 'ArrowRight') mudarFotoModal(1);
});

// ================= MAPA INTERATIVO (LEAFLET + GOOGLE MAPS) =================
const COORD_CASA = [-22.9457665, -42.1533025];
let mapaCasa = null;
let camadaRuas = null;
let camadaSatelite = null;

function inicializarMapa() {
  if (mapaCasa) {
    setTimeout(() => mapaCasa.invalidateSize(), 100);
    return;
  }

  mapaCasa = L.map('mapa-casa', {
    center: COORD_CASA,
    zoom: 16,
    scrollWheelZoom: false
  });

  camadaRuas = L.tileLayer('https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&hl=pt-BR', {
    maxZoom: 20,
    attribution: '&copy; Google Maps'
  });

  camadaSatelite = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&hl=pt-BR', {
    maxZoom: 20,
    attribution: '&copy; Google Maps Satellite'
  });

  camadaRuas.addTo(mapaCasa);

  const marker = L.marker(COORD_CASA).addTo(mapaCasa);
  marker.bindPopup(
    '<div style="text-align:center; padding:2px 4px;">' +
      '<strong style="font-size:13px; color:#0f172a;">🏡 Casa de Praia — Figueira</strong><br/>' +
      '<span style="font-size:12px; color:#475569;">Rua Porto Seguro, 11</span><br/>' +
      '<span style="font-size:11px; color:#b45309; font-weight:600;">🌊 Pertinho da praia!</span>' +
    '</div>'
  ).openPopup();

  setTimeout(() => mapaCasa.invalidateSize(), 150);
}

function mudarCamadaMapa(tipo) {
  if (!mapaCasa) inicializarMapa();
  const btnRuas = document.getElementById('btn-mapa-ruas');
  const btnSat = document.getElementById('btn-mapa-sat');

  if (tipo === 'satelite') {
    if (mapaCasa.hasLayer(camadaRuas)) mapaCasa.removeLayer(camadaRuas);
    camadaSatelite.addTo(mapaCasa);
    btnSat.className = 'px-3 py-1 rounded-lg text-xs font-semibold bg-white text-slate-900 shadow-sm transition';
    btnRuas.className = 'px-3 py-1 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 transition';
  } else {
    if (mapaCasa.hasLayer(camadaSatelite)) mapaCasa.removeLayer(camadaSatelite);
    camadaRuas.addTo(mapaCasa);
    btnRuas.className = 'px-3 py-1 rounded-lg text-xs font-semibold bg-white text-slate-900 shadow-sm transition';
    btnSat.className = 'px-3 py-1 rounded-lg text-xs font-medium text-slate-600 hover:text-slate-900 transition';
  }
}

function trocarAba(nome, btn) {
  document.querySelectorAll('.aba-conteudo').forEach(el => el.classList.add('hidden'));
  document.getElementById('aba-' + nome).classList.remove('hidden');

  document.querySelectorAll('.aba-btn').forEach(b => {
    b.className = 'aba-btn flex-auto sm:flex-initial text-center whitespace-nowrap px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition bg-white text-slate-600 border border-amber-200/80 hover:bg-amber-100/50';
  });
  if (btn) {
    btn.className = 'aba-btn flex-auto sm:flex-initial text-center whitespace-nowrap px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs sm:text-sm font-semibold transition bg-amber-200/85 text-amber-950 border border-amber-300/80 shadow-sm';
  }

  if (nome === 'localizacao') {
    inicializarMapa();
  }
  setTimeout(atualizarTodosCarrosseisCards, 50);
}

function abrirAbaLocalizacao() {
  const botoes = document.querySelectorAll('.aba-btn');
  trocarAba('localizacao', botoes[1]);
  window.scrollTo({ top: 260, behavior: 'smooth' });
}

// ================= ROLAGEM LATERAL INFINITA DOS CARDS =================
function rolarCardsLateral(gridId, direcao) {
  const grid = document.getElementById(gridId);
  if (!grid) return;

  const primeiroVisivel = Array.from(grid.children).find(el => !el.classList.contains('hidden'));
  const passo = primeiroVisivel ? (primeiroVisivel.offsetWidth + 20) : Math.round(grid.clientWidth * 0.85);
  const maxScroll = grid.scrollWidth - grid.clientWidth;

  if (maxScroll <= 5) return;

  if (direcao > 0) {
    if (grid.scrollLeft >= maxScroll - 15) {
      grid.scrollTo({ left: 0, behavior: 'smooth' });
    } else {
      grid.scrollBy({ left: passo, behavior: 'smooth' });
    }
  } else {
    if (grid.scrollLeft <= 15) {
      grid.scrollTo({ left: maxScroll, behavior: 'smooth' });
    } else {
      grid.scrollBy({ left: -passo, behavior: 'smooth' });
    }
  }
}

function atualizarEstadoGridCards(gridId, btnPrevId, btnNextId, maxColsDesktop) {
  const grid = document.getElementById(gridId);
  const btnPrev = document.getElementById(btnPrevId);
  const btnNext = document.getElementById(btnNextId);
  if (!grid || !btnPrev || !btnNext) return;

  const visiveis = Array.from(grid.children).filter(el => !el.classList.contains('hidden'));
  if (visiveis.length <= maxColsDesktop) {
    grid.classList.add('uma-linha');
  } else {
    grid.classList.remove('uma-linha');
  }

  setTimeout(() => {
    const isDesktop = window.innerWidth >= 640;
    const temOverflow = isDesktop && (grid.scrollWidth > grid.clientWidth + 8);
    if (temOverflow) {
      btnPrev.classList.remove('hidden');
      btnNext.classList.remove('hidden');
    } else {
      btnPrev.classList.add('hidden');
      btnNext.classList.add('hidden');
    }
  }, 60);
}

function atualizarTodosCarrosseisCards() {
  atualizarEstadoGridCards('grid-ambientes', 'btn-cards-casa-prev', 'btn-cards-casa-next', 3);
  atualizarEstadoGridCards('grid-praias', 'btn-cards-praias-prev', 'btn-cards-praias-next', 2);
}

window.addEventListener('resize', atualizarTodosCarrosseisCards);

function filtrarAmbiente(cat, btn) {
  document.querySelectorAll('.filtro-btn').forEach(b => {
    b.className = 'filtro-btn shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-xl text-xs font-medium bg-white border border-amber-200/80 text-slate-600 hover:bg-amber-100/50 transition';
  });
  btn.className = 'filtro-btn shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-200/85 text-amber-950 border border-amber-300/80 shadow-sm transition';

  const grid = document.getElementById('grid-ambientes');
  document.querySelectorAll('#grid-ambientes .card-item').forEach(card => {
    if (cat === 'todos' || card.dataset.cat === cat) {
      card.classList.remove('hidden');
    } else {
      card.classList.add('hidden');
    }
  });
  if (grid) grid.scrollTo({ left: 0, behavior: 'smooth' });
  atualizarTodosCarrosseisCards();
}

// ================= DADOS DO PAINEL /ADMIN =================
function escaparHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const NOMES_AMBIENTES_PADRAO = {
  lazer: 'Varandas & Churrasco',
  quartos: 'Quartos',
  banheiros: 'Banheiros',
  interno: 'Sala & Cozinhas',
  estrutura: 'Fachada, Quintal & Garagem'
};

function nomeExibicaoAmbiente(cat) {
  if (!cat) return 'Outros';
  return NOMES_AMBIENTES_PADRAO[cat] || cat;
}

function renderizarBotoesFiltroAmbientes(cardsCasa) {
  const wrap = document.getElementById('filtros-ambientes');
  if (!wrap || !Array.isArray(cardsCasa)) return;

  const categoriasUnicas = [];
  cardsCasa.forEach(c => {
    const cat = (c.categoria || 'lazer').trim();
    if (cat && !categoriasUnicas.includes(cat)) {
      categoriasUnicas.push(cat);
    }
  });

  const botoesHtml = [
    `<button onclick="filtrarAmbiente('todos', this)" class="filtro-btn shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-amber-200/85 text-amber-950 border border-amber-300/80 shadow-sm transition">Todos os Ambientes</button>`
  ];

  categoriasUnicas.forEach(cat => {
    const label = nomeExibicaoAmbiente(cat);
    const catEsc = escaparHtml(cat).replace(/'/g, "\\'");
    botoesHtml.push(
      `<button onclick="filtrarAmbiente('${catEsc}', this)" class="filtro-btn shrink-0 whitespace-nowrap px-3.5 py-1.5 rounded-xl text-xs font-medium bg-white border border-amber-200/80 text-slate-600 hover:bg-amber-100/50 transition">${escaparHtml(label)}</button>`
    );
  });

  wrap.innerHTML = botoesHtml.join('');
}

function aplicarDadosDoPainel(dados) {
  if (!dados) return;

  // 1. Capa & Pílulas do Topo
  if (dados.capa) {
    if (dados.capa.imagem) document.getElementById('site-capa-img').src = dados.capa.imagem;
    if (dados.capa.localizacaoBadge) document.getElementById('site-capa-badge').textContent = dados.capa.localizacaoBadge;
    if (dados.capa.titulo) document.getElementById('site-capa-titulo').textContent = dados.capa.titulo;
    if (dados.capa.subtitulo) document.getElementById('site-capa-subtitulo').textContent = dados.capa.subtitulo;

    if (Array.isArray(dados.capa.pilulas) && dados.capa.pilulas.length > 0) {
      const wrapPilulas = document.getElementById('site-capa-pilulas');
      wrapPilulas.innerHTML = dados.capa.pilulas.map(p => `
        <div class="bg-white border border-amber-200/80 rounded-2xl p-3 text-center shadow-sm">
          <p class="text-xs text-amber-700 font-medium">${escaparHtml(p.rotulo)}</p>
          <p class="text-sm font-semibold text-slate-900 mt-0.5">${escaparHtml(p.valor)}</p>
        </div>
      `).join('');
    }
  }

  // 2. Cards da Casa
  if (Array.isArray(dados.cardsCasa) && dados.cardsCasa.length > 0) {
    renderizarBotoesFiltroAmbientes(dados.cardsCasa);
    const gridCasa = document.getElementById('grid-ambientes');
    gridCasa.innerHTML = dados.cardsCasa.map(card => {
      const fotos = Array.isArray(card.fotos) && card.fotos.length > 0
        ? card.fotos
        : [{ src: 'midia/casa/fachada.jpg', alt: card.titulo || '' }];

      const imgsHtml = fotos.map((f, i) => `
        <img src="${escaparHtml(f.src)}" alt="${escaparHtml(f.alt || card.titulo)}" class="slide-img ${i === 0 ? '' : 'hidden '}w-full h-full object-cover transition duration-300" />
      `).join('');

      const badgeClass = 'text-amber-800 bg-amber-100/80';

      return `
        <div data-cat="${escaparHtml(card.categoria || 'lazer')}" class="card-item snap-start h-full flex flex-col bg-white rounded-2xl border border-amber-100 overflow-hidden shadow-sm hover:shadow-md transition">
          <div class="carrossel-card relative aspect-[4/3] bg-amber-50 overflow-hidden cursor-pointer select-none" onclick="ampliarCarrossel(this)">
            ${imgsHtml}
          </div>
          <div class="p-4 flex-1 flex flex-col">
            <span class="inline-block self-start text-[11px] font-semibold ${badgeClass} px-2.5 py-0.5 rounded-full mb-1.5">${escaparHtml(card.etiqueta)}</span>
            <h3 class="font-semibold text-slate-900">${escaparHtml(card.titulo)}</h3>
            <p class="text-xs text-slate-500 mt-1">${escaparHtml(card.descricao)}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  // 3. Cards de Praias
  if (Array.isArray(dados.cardsPraias) && dados.cardsPraias.length > 0) {
    const gridPraias = document.getElementById('grid-praias');
    gridPraias.innerHTML = dados.cardsPraias.map(card => {
      const fotos = Array.isArray(card.fotos) && card.fotos.length > 0
        ? card.fotos
        : [{ src: 'midia/arraial/praia-grande.jpg', alt: card.titulo || '' }];

      const imgsHtml = fotos.map((f, i) => `
        <img src="${escaparHtml(f.src)}" alt="${escaparHtml(f.alt || card.titulo)}" class="slide-img ${i === 0 ? '' : 'hidden '}w-full h-full object-cover transition duration-300" />
      `).join('');

      const corTexto = 'text-amber-700';

      return `
        <div class="snap-start h-full flex flex-col bg-white rounded-2xl border border-amber-100 overflow-hidden shadow-sm">
          <div class="carrossel-card relative aspect-[16/10] overflow-hidden cursor-pointer select-none" onclick="ampliarCarrossel(this)">
            ${imgsHtml}
          </div>
          <div class="p-4 flex-1 flex flex-col">
            <span class="text-[11px] font-semibold uppercase tracking-wider ${corTexto}">${escaparHtml(card.etiqueta)}</span>
            <h3 class="font-semibold text-slate-900 mt-0.5">${escaparHtml(card.titulo)}</h3>
            <p class="text-xs text-slate-500 mt-1">${escaparHtml(card.descricao)}</p>
          </div>
        </div>
      `;
    }).join('');
  }

  // 4. Valores & Barra Inferior
  if (dados.valores) {
    const v = dados.valores;
    if (v.semanaTitulo) document.getElementById('site-val-semana-titulo').textContent = v.semanaTitulo;
    if (v.semanaPreco) document.getElementById('site-val-semana-preco').textContent = v.semanaPreco;
    if (v.semanaDetalhe) document.getElementById('site-val-semana-detalhe').textContent = v.semanaDetalhe;
    if (v.fdsTitulo) document.getElementById('site-val-fds-titulo').textContent = v.fdsTitulo;
    if (v.fdsPreco) document.getElementById('site-val-fds-preco').textContent = v.fdsPreco;
    if (v.fdsDetalhe) document.getElementById('site-val-fds-detalhe').textContent = v.fdsDetalhe;
    if (v.barraResumoTopo) document.getElementById('site-barra-topo').textContent = v.barraResumoTopo;
    if (v.barraResumoPreco) document.getElementById('site-barra-preco').textContent = v.barraResumoPreco;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  if (window.DADOS_SITE) {
    aplicarDadosDoPainel(window.DADOS_SITE);
  }
  if (location.protocol.startsWith('http')) {
    try {
      const resp = await fetch('/api/site-data', { cache: 'no-store' });
      if (resp.ok) {
        const dadosServidor = await resp.json();
        aplicarDadosDoPainel(dadosServidor);
      }
    } catch (_) {}
  }
  inicializarCarrosseisCards();
  atualizarTodosCarrosseisCards();
});

