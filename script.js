/**
 * Nova Era Nutrition — script.js (VITRINE)
 * ═══════════════════════════════════════════
 * Backend: Firebase Firestore (real-time)
 * Cart:    localStorage (por usuário)
 *
 * Módulos:
 *  1. Produtos — Firestore onSnapshot
 *  2. Render Grid + Filter
 *  3. Product Modal
 *  4. Cart Sidebar
 *  5. Checkout WhatsApp
 *  6. Header scroll / glassmorphism
 *  7. Mobile menu
 *  8. Scroll animations (IntersectionObserver)
 *  9. Parallax
 * 10. Counter animation
 * 11. Card 3D tilt
 * 12. Active nav highlight
 */

'use strict';

/* ============================================================
   CONSTANTES (lidas de firebase-config.js)
   ============================================================ */
const WHATSAPP_NUMBER  = (typeof LOJA_CONFIG !== 'undefined') ? LOJA_CONFIG.whatsappNumero    : '5511999999999';
const FRETE_GRATIS_MIN = (typeof LOJA_CONFIG !== 'undefined') ? LOJA_CONFIG.freteGratisMinimo : 199;
const STORAGE_KEY_CART = 'carrinhoNova';

/* ============================================================
   UTILITY
   ============================================================ */
function debounce(fn, delay = 16) {
  let raf;
  return (...args) => {
    if (raf) cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => fn(...args));
  };
}

function formatPrice(value) {
  const n = parseFloat(value);
  if (isNaN(n)) return 'R$ 0,00';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function starsHTML(n = 5) {
  let html = '';
  for (let i = 0; i < 5; i++) {
    html += `<span class="star${i >= n ? ' star--half' : ''}">★</span>`;
  }
  return html;
}

/* ============================================================
   1. PRODUTOS — Firestore real-time (onSnapshot)
   ============================================================ */
let produtosCache   = [];
let currentFilter   = 'all';
let unsubProducts   = null;   // cleanup handle
let scrollObserver  = null;
let showAllProducts = false; // control product list display

function showLoadingGrid(grid) {
  grid.innerHTML = `
    <div class="products-loading" style="grid-column:1/-1;text-align:center;padding:4rem 1rem;">
      <div class="loading-spinner" aria-label="Carregando produtos..."></div>
      <p style="margin-top:1rem;color:var(--text-muted);font-size:.9rem">Carregando produtos…</p>
    </div>`;
}

function showErrorGrid(grid, err) {
  console.error('[Firestore]', err);
  grid.innerHTML = `
    <div style="grid-column:1/-1;text-align:center;padding:4rem 1rem;color:var(--text-muted)">
      <div style="font-size:2.5rem;margin-bottom:1rem">⚠️</div>
      <p style="font-size:1rem;font-weight:600;color:var(--text-primary)">Não foi possível carregar os produtos</p>
      <p style="font-size:.85rem;margin-top:.5rem">Verifique se o servidor Node.js está em execução.</p>
      <button onclick="location.reload()" style="margin-top:1.5rem;padding:.6rem 1.5rem;background:var(--red);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">
        Tentar novamente
      </button>
    </div>`;
}

function initFirestoreProducts() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  showLoadingGrid(grid);

  // 1. Tenta carregar os dados via Backend Node.js
  if (typeof API !== 'undefined') {
    API.getProducts({ ativo: true })
      .then(products => {
        if (Array.isArray(products) && products.length > 0) {
          produtosCache = products.map(p => (typeof ImageBackend !== 'undefined') ? ImageBackend.normalizeProduct(p) : p);
          renderProducts(currentFilter);
          loadCategoriesForFilters();
          console.log(`[Node.js API] ${produtosCache.length} produtos carregados com sucesso.`);
          return;
        }
        fallbackToFirestore();
      })
      .catch(err => {
        console.warn('[Node.js API] Offline ou indisponível, usando contingência Firestore:', err.message);
        fallbackToFirestore();
      });
  } else {
    fallbackToFirestore();
  }

  function fallbackToFirestore() {
    if (typeof db !== 'undefined' && db) {
      try {
        unsubProducts = db
          .collection('produtos')
          .orderBy('criadoEm', 'desc')
          .onSnapshot(
            (snapshot) => {
              produtosCache = snapshot.docs
                .map(doc => {
                  const data = { id: doc.id, ...doc.data() };
                  return (typeof ImageBackend !== 'undefined') ? ImageBackend.normalizeProduct(data) : data;
                })
                .filter(p => p.ativo !== false);
              renderProducts(currentFilter);
              updateFiltersFromProducts();
            },
            (err) => showErrorGrid(grid, err)
          );
      } catch (err) {
        showErrorGrid(grid, err);
      }
    } else {
      showErrorGrid(grid, new Error('Servidor offline. Inicie o Node.js com npm start.'));
    }
  }
}

/* ============================================================
   2. RENDER PRODUCTS + FILTER
   ============================================================ */
function buildProductCard(p) {
  const glowClass = (p.categoria === 'pretreino' || p.categoria === 'aminoacido')
    ? 'product-image-glow--green' : '';

  const badgeHTML = p.badge
    ? `<div class="product-badge badge--${p.badgeTipo || 'red'}">${p.badge}</div>` : '';

  const oldPriceHTML = p.precoAntigo
    ? `<span class="product-price-old">${formatPrice(p.precoAntigo)}</span>` : '';

  // Contagem de fotos caso tenha mais de 1 foto individual
  const countBadgeHTML = (p.imagens && p.imagens.length > 1)
    ? `<div class="product-photos-count" title="${p.imagens.length} fotos disponíveis">📷 ${p.imagens.length}</div>` : '';

  const imgUrl = p.imagem || ((typeof ImageBackend !== 'undefined') ? ImageBackend.getPlaceholderSvg() : '');

  return `
    <article
      class="product-card animate-on-scroll"
      data-animation="fade-up"
      data-category="${p.categoria || ''}"
      data-id="${p.id}"
      tabindex="0"
      role="button"
      aria-label="Ver detalhes de ${p.nome}"
    >
      ${badgeHTML}
      <div class="product-image-wrap">
        ${countBadgeHTML}
        <img
          src="${imgUrl}"
          alt="${p.nome} – Nova Era Nutrition"
          class="product-image"
          loading="lazy"
          onerror="if(typeof ImageBackend!=='undefined'){ImageBackend.handleImgError(this, '${p.imagem || ''}');}else{this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22><rect fill=%22%231a1a1a%22 width=%22400%22 height=%22300%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%23444%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2218%22>Sem imagem</text></svg>';}"
        />
        <div class="product-image-glow ${glowClass}"></div>
      </div>
      <div class="product-info">
        <span class="product-category">${p.categoria || ''}</span>
        <h3 class="product-name">${p.nome}</h3>
        <p class="product-desc">${(p.descricao || '').substring(0, 90)}…</p>
        <div class="product-rating" aria-label="Avaliação: ${p.estrelas || 5} estrelas">
          ${starsHTML(p.estrelas || 5)}
          <span class="rating-count">(${p.avaliacoes || 0})</span>
        </div>
        <div class="product-price-row">
          <div class="product-price-group">
            ${oldPriceHTML}
            <span class="product-price">${formatPrice(p.preco)}</span>
          </div>
          <button
            class="btn btn-primary btn-icon add-to-cart-btn"
            data-id="${p.id}"
            aria-label="Adicionar ${p.nome} ao carrinho"
            onclick="event.stopPropagation(); Cart.add('${p.id}')"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
            Comprar
          </button>
        </div>
      </div>
    </article>`;
}

function renderProducts(filter = 'all') {
  currentFilter = filter;
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  const filtered = filter === 'all'
    ? produtosCache
    : produtosCache.filter(p => p.categoria === filter);

  if (filtered.length === 0 && produtosCache.length > 0) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:4rem 1rem;color:var(--text-muted)">
        <div style="font-size:3rem;margin-bottom:1rem">📦</div>
        <p>Nenhum produto nesta categoria.</p>
        <button data-filter="all" onclick="applyFilter('all')" style="margin-top:1rem;background:none;border:none;color:var(--red);cursor:pointer;font-size:.9rem;text-decoration:underline;">
          Ver todos
        </button>
      </div>`;
    return;
  }

  // Determine which products to display
  const displayed = showAllProducts ? filtered : filtered.slice(0, 6);
  grid.innerHTML = displayed.map(buildProductCard).join('');

  // Observe new cards for scroll animations
  if (scrollObserver) {
    grid.querySelectorAll('.animate-on-scroll').forEach(el => scrollObserver.observe(el));
  }

  // Attach modal open handlers
  grid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.add-to-cart-btn')) return;
      Modal.open(card.dataset.id);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); Modal.open(card.dataset.id); }
    });
  });

  // Clean up any previous "Ver todos" button
  const existingBtn = document.getElementById('view-all-btn');
  if (existingBtn) {
    existingBtn.parentNode.remove();
  }

  // Show "Ver todos" button when not all products are displayed
  if (!showAllProducts && filtered.length > 6) {
    const btnDiv = document.createElement('div');
    btnDiv.className = 'view-all-container';
    btnDiv.innerHTML = `<button class="btn btn-primary btn-sm" id="view-all-btn">Ver todos os produtos</button>`;
    grid.parentNode.appendChild(btnDiv);
    document.getElementById('view-all-btn').addEventListener('click', () => {
      showAllProducts = true;
      renderProducts(filter);
    });
  }



  // 3D tilt
  initCardGlow(grid.querySelectorAll('.product-card'));
}

/* ============================================================
   FILTER
   ============================================================ */
const DEFAULT_CATEGORIES = [
  { slug: 'proteina',   nome: 'Proteínas' },
  { slug: 'pretreino',  nome: 'Pré-Treino' },
  { slug: 'aminoacido', nome: 'Aminoácidos' },
  { slug: 'creatina',   nome: 'Creatina' },
  { slug: 'vitamina',   nome: 'Vitaminas' },
  { slug: 'queimador',  nome: 'Queimadores' },
  { slug: 'outro',      nome: 'Outros' }
];

let categoriasCache = [...DEFAULT_CATEGORIES];

async function loadCategoriesForFilters() {
  try {
    if (typeof API !== 'undefined') {
      const cats = await API.getCategories();
      if (Array.isArray(cats) && cats.length > 0) {
        // Mescla garantindo que categorias padrões e novas fiquem presentes
        const map = new Map();
        DEFAULT_CATEGORIES.forEach(c => map.set(c.slug, c));
        cats.forEach(c => map.set(c.slug || c, { slug: c.slug || c, nome: c.nome || c.slug || c }));
        categoriasCache = Array.from(map.values());
        renderCategoryFilterOptions(categoriasCache);
        return;
      }
    }
  } catch (err) {
    console.warn('[Categories] Não foi possível carregar categorias da API, usando padrão/produtos:', err.message);
  }

  updateFiltersFromProducts();
}

function updateFiltersFromProducts() {
  const map = new Map();
  DEFAULT_CATEGORIES.forEach(c => map.set(c.slug, c));
  if (Array.isArray(categoriasCache)) {
    categoriasCache.forEach(c => map.set(c.slug, c));
  }

  // Extrair categorias distintas dos produtos existentes
  (produtosCache || []).forEach(p => {
    if (p.categoria && String(p.categoria).trim()) {
      const catSlug = String(p.categoria).trim();
      if (!map.has(catSlug)) {
        const label = catSlug.charAt(0).toUpperCase() + catSlug.slice(1);
        map.set(catSlug, { slug: catSlug, nome: label });
      }
    }
  });

  categoriasCache = Array.from(map.values());
  renderCategoryFilterOptions(categoriasCache);
}

function renderCategoryFilterOptions(list = categoriasCache) {
  const select = document.getElementById('category-filter-select');
  if (!select) return;

  const catsToRender = (Array.isArray(list) && list.length > 0) ? list : DEFAULT_CATEGORIES;
  const currentVal = currentFilter === 'all' ? 'all' : currentFilter;

  let optionsHTML = '<option value="all">📂 Escolher Categoria…</option>';

  catsToRender.forEach(cat => {
    const slug = cat.slug || cat;
    const nome = cat.nome || (slug.charAt(0).toUpperCase() + slug.slice(1));
    const isSelected = currentVal === slug ? 'selected' : '';
    optionsHTML += `<option value="${escapeHtml(slug)}" ${isSelected}>🏷️ ${escapeHtml(nome)}</option>`;
  });

  select.innerHTML = optionsHTML;
  select.value = currentVal;
  updateFilterUIStates();
}

function updateFilterUIStates() {
  const allBtn = document.getElementById('filter-all');
  const select = document.getElementById('category-filter-select');

  if (currentFilter === 'all') {
    allBtn?.classList.add('active');
    select?.classList.remove('active');
    if (select) select.value = 'all';
  } else {
    allBtn?.classList.remove('active');
    select?.classList.add('active');
    if (select) select.value = currentFilter;
  }
}

function applyFilter(filter) {
  currentFilter = filter;
  updateFilterUIStates();
  renderProducts(filter);
}

function initProductFilter() {
  const allBtn = document.getElementById('filter-all');
  const select = document.getElementById('category-filter-select');

  allBtn?.addEventListener('click', () => {
    applyFilter('all');
  });

  select?.addEventListener('change', (e) => {
    const chosen = e.target.value;
    applyFilter(chosen);
  });

  loadCategoriesForFilters();
}

/* ============================================================
   3. PRODUCT MODAL
   ============================================================ */
const Modal = {
  overlay: null,
  panel:   null,
  body:    null,
  closeBtn:null,

  init() {
    this.overlay  = document.getElementById('modal-overlay');
    this.panel    = document.getElementById('product-modal');
    this.body     = document.getElementById('modal-body');
    this.closeBtn = document.getElementById('modal-close-btn');

    this.closeBtn?.addEventListener('click', () => this.close());
    this.overlay?.addEventListener('click', (e) => { if (e.target === this.overlay) this.close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.close(); });
  },

  open(productId) {
    const rawP = produtosCache.find(x => x.id === productId);
    if (!rawP || !this.overlay) return;

    const p = (typeof ImageBackend !== 'undefined') ? ImageBackend.normalizeProduct(rawP) : rawP;
    const oldPriceHTML = p.precoAntigo
      ? `<span class="modal-price-old">${formatPrice(p.precoAntigo)}</span>` : '';

    // Garante que imagens seja sempre um array com itens válidos
    const images = (Array.isArray(p.imagens) && p.imagens.length > 0)
      ? p.imagens
      : (p.imagem ? [p.imagem] : [(typeof ImageBackend !== 'undefined' ? ImageBackend.getPlaceholderSvg() : '')]);

    const hasMultiple = images.length > 1;

    this.body.innerHTML = `
      <div class="modal-image-col">
        ${p.badge ? `<div class="modal-badge badge--${p.badgeTipo || 'red'}">${p.badge}</div>` : ''}
        <div class="carousel" id="product-carousel" aria-live="polite">
          <button class="carousel-arrow left" aria-label="Imagem anterior" style="${hasMultiple ? '' : 'display:none;'}">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="carousel-track"></div>
          <button class="carousel-arrow right" aria-label="Próxima imagem" style="${hasMultiple ? '' : 'display:none;'}">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <div class="carousel-dots" style="${hasMultiple ? '' : 'display:none;'}"></div>
        </div>
        ${hasMultiple ? '<div class="carousel-thumbs"></div>' : ''}
      </div>
      <div class="modal-info-col">
        <span class="product-category">${p.categoria || ''}</span>
        <h2 class="modal-product-name">${p.nome}</h2>
        <div class="product-rating">${starsHTML(p.estrelas || 5)}<span class="rating-count">(${p.avaliacoes || 0} avaliações)</span></div>
        <p class="modal-product-desc">${p.descricao || ''}</p>
        <div class="modal-price-group">
          ${oldPriceHTML}
          <span class="modal-price">${formatPrice(p.preco)}</span>
        </div>
        <div class="modal-actions">
          <button class="btn btn-primary btn-lg" id="modal-add-btn" aria-label="Adicionar ao carrinho">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
            Adicionar ao Carrinho
          </button>
        </div>
        <ul class="modal-benefits">
          <li>✅ Produto original e lacrado</li>
          <li>🚚 Frete grátis acima de ${formatPrice(FRETE_GRATIS_MIN)}</li>
          <li>🔒 Compra 100% segura</li>
          <li>↩️ 7 dias para devolução</li>
        </ul>
      </div>`;

    const carouselTrack  = this.body.querySelector('.carousel-track');
    const carouselDots   = this.body.querySelector('.carousel-dots');
    const carouselThumbs = this.body.querySelector('.carousel-thumbs');

    images.forEach((src, idx) => {
      const img = document.createElement('img');
      img.src = src;
      img.className = 'modal-product-img';
      img.alt = `${p.nome} - imagem ${idx + 1}`;
      img.onerror = function() {
        if (typeof ImageBackend !== 'undefined') {
          ImageBackend.handleImgError(this, src);
        }
      };
      carouselTrack.appendChild(img);

      if (hasMultiple) {
        const dot = document.createElement('button');
        dot.className = 'carousel-dot' + (idx === 0 ? ' active' : '');
        dot.setAttribute('aria-label', `Foto ${idx + 1}`);
        dot.addEventListener('click', () => showSlide(idx));
        carouselDots?.appendChild(dot);

        if (carouselThumbs) {
          const thumb = document.createElement('div');
          thumb.className = 'carousel-thumb' + (idx === 0 ? ' active' : '');
          thumb.setAttribute('title', `Foto ${idx + 1}`);
          thumb.innerHTML = `<img src="${src}" alt="Thumb ${idx + 1}" onerror="if(typeof ImageBackend!=='undefined'){ImageBackend.handleImgError(this, '${src}');}" />`;
          thumb.addEventListener('click', () => showSlide(idx));
          carouselThumbs.appendChild(thumb);
        }
      }
    });

    let currentIndex = 0;
    const showSlide = (index) => {
      currentIndex = (index + images.length) % images.length;
      carouselTrack.style.transform = `translateX(-${currentIndex * 100}%)`;
      if (carouselDots) {
        carouselDots.querySelectorAll('.carousel-dot').forEach((d, i) => d.classList.toggle('active', i === currentIndex));
      }
      if (carouselThumbs) {
        carouselThumbs.querySelectorAll('.carousel-thumb').forEach((t, i) => t.classList.toggle('active', i === currentIndex));
      }
    };

    if (hasMultiple) {
      this.body.querySelector('.carousel-arrow.left')?.addEventListener('click', () => showSlide(currentIndex - 1));
      this.body.querySelector('.carousel-arrow.right')?.addEventListener('click', () => showSlide(currentIndex + 1));
    }

    document.getElementById('modal-add-btn')?.addEventListener('click', () => {
      Cart.add(productId);
      this.close();
    });

    this.overlay.setAttribute('aria-hidden', 'false');
    this.overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => this.panel?.classList.add('open'), 10);
  },

  close() {
    this.panel?.classList.remove('open');
    setTimeout(() => {
      this.overlay?.classList.remove('open');
      this.overlay?.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
    }, 300);
  },
};

/* ============================================================
   4. CART — localStorage (por usuário)
   ============================================================ */
const Cart = {
  sidebar:      null,
  overlay:      null,
  itemsEl:      null,
  totalEl:      null,
  countEl:      null,
  countSidebar: null,
  freteEl:      null,

  init() {
    this.sidebar      = document.getElementById('cart-sidebar');
    this.overlay      = document.getElementById('cart-overlay');
    this.itemsEl      = document.getElementById('cart-items');
    this.totalEl      = document.getElementById('cart-total');
    this.countEl      = document.getElementById('cart-count');
    this.countSidebar = document.getElementById('cart-count-sidebar');
    this.freteEl      = document.getElementById('cart-frete-notice');

    document.getElementById('cart-btn')?.addEventListener('click', () => this.open());
    document.getElementById('cart-close-btn')?.addEventListener('click', () => this.close());
    this.overlay?.addEventListener('click', () => this.close());
    document.getElementById('checkout-btn')?.addEventListener('click', () => CheckoutForm.open());
    document.getElementById('clear-cart-btn')?.addEventListener('click', () => {
      if (confirm('Deseja limpar o carrinho?')) this.clear();
    });

    this.render();
  },

  open()  { this.sidebar?.classList.add('open'); this.overlay?.classList.add('open'); document.body.style.overflow = 'hidden'; },
  close() { this.sidebar?.classList.remove('open'); this.overlay?.classList.remove('open'); document.body.style.overflow = ''; },

  getItems() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY_CART) || '[]'); } catch { return []; }
  },

  save(items) {
    localStorage.setItem(STORAGE_KEY_CART, JSON.stringify(items));
    this.render();
  },

  add(productId) {
    const product = produtosCache.find(p => p.id === productId);
    if (!product) return;

    const norm = (typeof ImageBackend !== 'undefined') ? ImageBackend.normalizeProduct(product) : product;
    const items    = this.getItems();
    const existing = items.find(i => i.id === productId);

    if (existing) { existing.qty += 1; }
    else { items.push({ id: productId, nome: norm.nome, preco: norm.preco, imagem: norm.imagem || '', qty: 1 }); }

    this.save(items);
    this.showToast(`"${norm.nome}" adicionado!`);
    this.open();
  },

  remove(productId)       { this.save(this.getItems().filter(i => i.id !== productId)); },
  clear()                 { this.save([]); },

  updateQty(productId, delta) {
    const items = this.getItems();
    const item  = items.find(i => i.id === productId);
    if (item) { item.qty = Math.max(1, item.qty + delta); this.save(items); }
  },

  getTotal()    { return this.getItems().reduce((acc, i) => acc + i.preco * i.qty, 0); },
  getTotalQty() { return this.getItems().reduce((acc, i) => acc + i.qty, 0); },

  render() {
    const items = this.getItems();
    const total = this.getTotal();
    const qty   = this.getTotalQty();

    if (this.countEl) {
      this.countEl.textContent   = qty > 99 ? '99+' : qty;
      this.countEl.style.display = qty > 0 ? 'flex' : 'none';
    }
    if (this.countSidebar) this.countSidebar.textContent = `${qty} ${qty === 1 ? 'item' : 'itens'}`;
    if (this.totalEl)      this.totalEl.textContent       = formatPrice(total);

    if (this.freteEl) {
      if (total === 0)                  this.freteEl.innerHTML = '';
      else if (total >= FRETE_GRATIS_MIN)
        this.freteEl.innerHTML = `<span class="frete-ok">🎉 Você ganhou <strong>Frete Grátis</strong>!</span>`;
      else
        this.freteEl.innerHTML = `<span class="frete-progress">Faltam <strong>${formatPrice(FRETE_GRATIS_MIN - total)}</strong> para Frete Grátis 🚚</span>`;
    }

    if (!this.itemsEl) return;

    if (items.length === 0) {
      this.itemsEl.innerHTML = `
        <div class="cart-empty">
          <div class="cart-empty-icon">🛒</div>
          <p class="cart-empty-title">Carrinho vazio</p>
          <p class="cart-empty-sub">Adicione produtos para continuar.</p>
          <button class="btn btn-primary btn-sm" onclick="Cart.close(); document.getElementById('products').scrollIntoView({behavior:'smooth'})">
            Ver Produtos
          </button>
        </div>`;
      return;
    }

    this.itemsEl.innerHTML = items.map(item => `
      <div class="cart-item" data-id="${item.id}">
        <div class="cart-item-img-wrap">
          <img src="${item.imagem || (typeof ImageBackend !== 'undefined' ? ImageBackend.getPlaceholderSvg('', 60, 60) : '')}" alt="${String(item.nome || '').replace(/"/g, '&quot;')}" class="cart-item-img"
            onerror="this.onerror=null;this.src='data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'60\' height=\'60\'><rect fill=\'%231a1a1a\' width=\'60\' height=\'60\'/></svg>';" />
        </div>
        <div class="cart-item-details">
          <p class="cart-item-name">${item.nome}</p>
          <p class="cart-item-price">${formatPrice(item.preco)}</p>
          <div class="cart-item-qty-row">
            <button class="qty-btn" onclick="Cart.updateQty('${item.id}',-1)" aria-label="Diminuir">−</button>
            <span class="qty-value">${item.qty}</span>
            <button class="qty-btn" onclick="Cart.updateQty('${item.id}',1)"  aria-label="Aumentar">+</button>
            <button class="remove-btn" onclick="Cart.remove('${item.id}')" aria-label="Remover">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>
        <span class="cart-item-subtotal">${formatPrice(item.preco * item.qty)}</span>
      </div>`).join('');
  },

  showToast(msg) {
    const toast  = document.getElementById('cart-toast');
    const textEl = document.getElementById('toast-text');
    if (!toast) return;
    if (textEl) textEl.textContent = msg;
    clearTimeout(Cart._toastTimeout);
    toast.classList.add('show');
    Cart._toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
  },
};

/* ============================================================
   4B. CUSTOMER AUTH — Login, Cadastro e Google Sign-In
   ============================================================ */
let currentUser = null;

const CustomerAuth = {
  overlay: null,
  viewGuest: null,
  viewUser: null,
  accountBtn: null,
  accountBtnText: null,

  async init() {
    this.overlay        = document.getElementById('auth-modal-overlay');
    this.viewGuest      = document.getElementById('auth-view-guest');
    this.viewUser       = document.getElementById('auth-view-user');
    this.accountBtn     = document.getElementById('account-btn');
    this.accountBtnText = document.getElementById('account-btn-text');

    // Botões de abrir modal
    this.accountBtn?.addEventListener('click', () => this.open());
    document.getElementById('mob-account-btn')?.addEventListener('click', () => {
      initMobileMenu && document.getElementById('mobile-menu')?.classList.remove('open');
      this.open();
    });

    // Fechar modal
    document.getElementById('auth-modal-close')?.addEventListener('click', () => this.close());
    this.overlay?.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });

    // Abas Login / Cadastro
    const tabLogin    = document.getElementById('tab-login-btn');
    const tabRegister = document.getElementById('tab-register-btn');
    const formLogin   = document.getElementById('auth-login-form');
    const formReg     = document.getElementById('auth-register-form');

    tabLogin?.addEventListener('click', () => {
      tabLogin.classList.add('active');
      tabRegister.classList.remove('active');
      formLogin.style.display = 'block';
      formReg.style.display = 'none';
      document.getElementById('auth-login-error').textContent = '';
    });

    tabRegister?.addEventListener('click', () => {
      tabRegister.classList.add('active');
      tabLogin.classList.remove('active');
      formLogin.style.display = 'none';
      formReg.style.display = 'block';
      document.getElementById('auth-register-error').textContent = '';
    });

    // Submissão Login
    formLogin?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('auth-login-email').value.trim();
      const pass  = document.getElementById('auth-login-password').value;
      const errEl = document.getElementById('auth-login-error');
      errEl.textContent = '';

      if (!email || !pass) {
        errEl.textContent = 'Preencha seu e-mail e senha.';
        return;
      }

      try {
        const res = await API.customerLogin(email, pass);
        currentUser = res.user;
        this.updateUI();
        this.close();
        Cart.showToast(`Bem-vindo de volta, ${currentUser.name.split(' ')[0]}! 💪`);
        
        // Se estava abrindo checkout, prossegue
        if (this._resumeCheckoutAfterLogin) {
          this._resumeCheckoutAfterLogin = false;
          CheckoutForm.open();
        }
      } catch (err) {
        errEl.textContent = '⚠️ ' + err.message;
      }
    });

    // Submissão Cadastro
    formReg?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const name  = document.getElementById('auth-reg-name').value.trim();
      const email = document.getElementById('auth-reg-email').value.trim();
      const phone = document.getElementById('auth-reg-phone').value.trim();
      const cpf   = document.getElementById('auth-reg-cpf').value.trim();
      const pass  = document.getElementById('auth-reg-password').value;
      const errEl = document.getElementById('auth-register-error');
      errEl.textContent = '';

      if (!name || !email || !pass) {
        errEl.textContent = 'Preencha nome, e-mail e senha.';
        return;
      }

      try {
        const res = await API.customerRegister({ name, email, password: pass, phone, cpf });
        currentUser = res.user;
        this.updateUI();
        this.close();
        Cart.showToast(`Conta criada com sucesso! Olá, ${currentUser.name.split(' ')[0]}! 🎉`);
        if (this._resumeCheckoutAfterLogin) {
          this._resumeCheckoutAfterLogin = false;
          CheckoutForm.open();
        }
      } catch (err) {
        errEl.textContent = '⚠️ ' + err.message;
      }
    });

    // Logout
    document.getElementById('auth-logout-btn')?.addEventListener('click', () => {
      API.customerLogout();
      currentUser = null;
      this.updateUI();
      this.close();
      Cart.showToast('Você saiu da sua conta.');
    });

    // Edição de perfil
    const editBtn = document.getElementById('auth-edit-profile-btn');
    const editForm = document.getElementById('auth-edit-profile-form');
    const cancelEditBtn = document.getElementById('auth-cancel-edit-btn');

    editBtn?.addEventListener('click', () => {
      editForm.style.display = 'block';
      editBtn.style.display = 'none';
      if (currentUser) {
        document.getElementById('edit-prof-phone').value = currentUser.phone || '';
        document.getElementById('edit-prof-cpf').value = currentUser.cpf || '';
        document.getElementById('edit-prof-address').value = currentUser.address || '';
        document.getElementById('edit-prof-city').value = currentUser.city || '';
        document.getElementById('edit-prof-cep').value = currentUser.cep || '';
      }
    });

    cancelEditBtn?.addEventListener('click', () => {
      editForm.style.display = 'none';
      editBtn.style.display = 'block';
    });

    editForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const phone = document.getElementById('edit-prof-phone').value.trim();
      const cpf = document.getElementById('edit-prof-cpf').value.trim();
      const address = document.getElementById('edit-prof-address').value.trim();
      const city = document.getElementById('edit-prof-city').value.trim();
      const cep = document.getElementById('edit-prof-cep').value.trim();

      try {
        const updated = await API.updateCustomerProfile({ phone, cpf, address, city, cep });
        currentUser = updated;
        this.updateUI();
        editForm.style.display = 'none';
        editBtn.style.display = 'block';
        Cart.showToast('Dados salvos com sucesso!');
      } catch (err) {
        document.getElementById('auth-edit-error').textContent = '⚠️ ' + err.message;
      }
    });

    // Abas do Painel do Usuário Logado (Meus Pedidos vs Meus Dados)
    const tabOrders = document.getElementById('user-tab-orders-btn');
    const tabProfile = document.getElementById('user-tab-profile-btn');
    const secOrders = document.getElementById('user-orders-section');
    const secProfile = document.getElementById('user-profile-section');

    tabOrders?.addEventListener('click', () => {
      tabOrders.classList.add('active');
      tabProfile?.classList.remove('active');
      if (secOrders) secOrders.style.display = 'block';
      if (secProfile) secProfile.style.display = 'none';
      this.loadCustomerOrders();
    });

    tabProfile?.addEventListener('click', () => {
      tabProfile.classList.add('active');
      tabOrders?.classList.remove('active');
      if (secOrders) secOrders.style.display = 'none';
      if (secProfile) secProfile.style.display = 'block';
    });

    document.getElementById('btn-orders-shop-now')?.addEventListener('click', () => {
      this.close();
      document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
    });

    // Clique no botão Google
    const googleBtnFallback = document.getElementById('btn-google-fallback');
    const googleQuickBox    = document.getElementById('google-quick-box');
    const googleQuickEmail  = document.getElementById('google-quick-email');
    const googleQuickSubmit = document.getElementById('google-quick-submit');
    const googleQuickError  = document.getElementById('google-quick-error');

    googleBtnFallback?.addEventListener('click', () => {
      // Se houver Google Client ID configurado no .env e GSI ativo, tenta abrir popup do Google
      if (this.googleClientId && window.google?.accounts?.id) {
        try {
          window.google.accounts.id.prompt();
          return;
        } catch (_) {}
      }

      // Caso contrário (ambiente local / sem Client ID ainda), abre a caixinha elegante na hora
      if (googleQuickBox) {
        googleQuickBox.style.display = googleQuickBox.style.display === 'none' ? 'block' : 'none';
        if (googleQuickBox.style.display === 'block') {
          googleQuickEmail?.focus();
        }
      }
    });

    googleQuickSubmit?.addEventListener('click', async () => {
      const email = googleQuickEmail?.value.trim();
      if (!email || !email.includes('@')) {
        if (googleQuickError) googleQuickError.textContent = 'Por favor, informe um e-mail válido.';
        return;
      }
      if (googleQuickError) googleQuickError.textContent = '';
      googleQuickSubmit.disabled = true;
      googleQuickSubmit.textContent = 'Entrando...';

      const dummyName = email.split('@')[0];
      const cleanName = dummyName.charAt(0).toUpperCase() + dummyName.slice(1);

      try {
        const res = await API.customerGoogleLogin({
          profile: {
            id: 'google_' + Date.now(),
            email: email,
            name: cleanName,
            picture: ''
          }
        });
        currentUser = res.user;
        this.updateUI();
        this.close();
        Cart.showToast(`Login com Google realizado! Olá, ${currentUser.name.split(' ')[0]}! 🚀`);
        if (this._resumeCheckoutAfterLogin) {
          this._resumeCheckoutAfterLogin = false;
          CheckoutForm.open();
        }
      } catch (err) {
        if (googleQuickError) googleQuickError.textContent = '⚠️ ' + err.message;
      } finally {
        googleQuickSubmit.disabled = false;
        googleQuickSubmit.textContent = 'Entrar';
      }
    });

    // Submeter no enter
    googleQuickEmail?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        googleQuickSubmit?.click();
      }
    });

    // Checar perfil existente
    try {
      currentUser = await API.getCustomerProfile();
      this.updateUI();
    } catch (_) {}

    // Inicializar Google Identity Services
    this.initGoogleClient();
  },

  async initGoogleClient() {
    let googleClientId = '';
    try {
      const cfg = await API.getConfig();
      googleClientId = cfg?.googleClientId;
      this.googleClientId = googleClientId;
    } catch (_) {}

    if (!googleClientId) {
      // Sem Google Client ID configurado ainda: o botão exibirá a entrada direta inline
      return;
    }

    const checkGsi = setInterval(() => {
      if (window.google?.accounts?.id) {
        clearInterval(checkGsi);
        try {
          window.google.accounts.id.initialize({
            client_id: googleClientId,
            callback: async (response) => {
              try {
                const res = await API.customerGoogleLogin({ credential: response.credential });
                currentUser = res.user;
                CustomerAuth.updateUI();
                CustomerAuth.close();
                Cart.showToast(`Login realizado com Google! Olá, ${currentUser.name.split(' ')[0]}! 🚀`);
                if (CustomerAuth._resumeCheckoutAfterLogin) {
                  CustomerAuth._resumeCheckoutAfterLogin = false;
                  CheckoutForm.open();
                }
              } catch (e) {
                alert('Erro no login com Google: ' + e.message);
              }
            }
          });

          const container = document.getElementById('google-btn-container');
          if (container) {
            window.google.accounts.id.renderButton(container, {
              theme: 'outline',
              size: 'large',
              width: 320,
              text: 'continue_with',
              shape: 'pill'
            });
            const fallbackBtn = document.getElementById('btn-google-fallback');
            if (fallbackBtn) fallbackBtn.style.display = 'none';
          }
        } catch (e) {
          console.warn('[Google Sign-In] Erro na inicialização:', e.message);
        }
      }
    }, 500);

    // Timeout de 10s para parar de checar
    setTimeout(() => clearInterval(checkGsi), 10000);
  },

  updateUI() {
    if (currentUser) {
      this.accountBtn?.classList.add('logged-in');
      const firstName = currentUser.name.split(' ')[0];
      if (this.accountBtnText) this.accountBtnText.textContent = firstName;
      
      const mobBtn = document.getElementById('mob-account-btn');
      if (mobBtn) mobBtn.textContent = `👤 Minha Conta (${firstName})`;

      if (this.viewGuest) this.viewGuest.style.display = 'none';
      if (this.viewUser)  this.viewUser.style.display = 'block';

      // Preenche dados do card do usuário
      const nameEl = document.getElementById('auth-user-name');
      const emailEl = document.getElementById('auth-user-email');
      const avatarEl = document.getElementById('auth-user-avatar');
      const cpfEl = document.getElementById('auth-user-cpf-val');
      const phoneEl = document.getElementById('auth-user-phone-val');
      const addrEl = document.getElementById('auth-user-address-val');

      if (nameEl) nameEl.textContent = currentUser.name;
      if (emailEl) emailEl.textContent = currentUser.email;
      if (cpfEl) cpfEl.textContent = currentUser.cpf || 'Não informado';
      if (phoneEl) phoneEl.textContent = currentUser.phone || 'Não informado';
      if (addrEl) addrEl.textContent = currentUser.address ? `${currentUser.address} - ${currentUser.city || ''}` : 'Não informado';

      if (avatarEl) {
        if (currentUser.avatar) {
          avatarEl.innerHTML = `<img src="${currentUser.avatar}" alt="${currentUser.name}" />`;
        } else {
          avatarEl.textContent = firstName.charAt(0).toUpperCase();
        }
      }

      // Carrega o histórico de pedidos do cliente
      this.loadCustomerOrders();
    } else {
      this.accountBtn?.classList.remove('logged-in');
      if (this.accountBtnText) this.accountBtnText.textContent = 'Entrar';

      const mobBtn = document.getElementById('mob-account-btn');
      if (mobBtn) mobBtn.textContent = '👤 Minha Conta';

      if (this.viewGuest) this.viewGuest.style.display = 'block';
      if (this.viewUser)  this.viewUser.style.display = 'none';
    }
  },

  async loadCustomerOrders() {
    const listEl = document.getElementById('user-orders-list');
    const loadingEl = document.getElementById('user-orders-loading');
    const emptyEl = document.getElementById('user-orders-empty');
    const countEl = document.getElementById('user-orders-count');

    if (!listEl) return;

    if (loadingEl) loadingEl.style.display = 'flex';
    if (emptyEl) emptyEl.style.display = 'none';
    listEl.innerHTML = '';

    try {
      const orders = await API.getCustomerOrders();
      const ordersList = Array.isArray(orders) ? orders : [];
      if (countEl) countEl.textContent = ordersList.length;
      if (loadingEl) loadingEl.style.display = 'none';

      if (ordersList.length === 0) {
        if (emptyEl) emptyEl.style.display = 'block';
        return;
      }

      this._cachedOrders = ordersList;

      listEl.innerHTML = ordersList.map(order => {
        const rawDate = order.criadoEm || order.criado_em;
        const dateObj = rawDate ? new Date(rawDate) : new Date();
        const dataFmt = isNaN(dateObj.getTime())
          ? 'Data recente'
          : dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' às ' +
            dateObj.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

        const status = (order.status || 'pendente').toLowerCase();
        let statusBadge = '<span class="order-status-badge status-pendente">🟡 Pendente</span>';
        if (status === 'pago' || status === 'aprovado') {
          statusBadge = '<span class="order-status-badge status-pago">🟢 Pago</span>';
        } else if (status === 'enviado') {
          statusBadge = '<span class="order-status-badge status-enviado">🚚 Enviado</span>';
        } else if (status === 'entregue' || status === 'concluido') {
          statusBadge = '<span class="order-status-badge status-entregue">✅ Entregue</span>';
        } else if (status === 'cancelado') {
          statusBadge = '<span class="order-status-badge status-cancelado">🔴 Cancelado</span>';
        }

        const items = Array.isArray(order.itens) ? order.itens : [];
        const fallbackSvg = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect fill='%231a1a1a' width='40' height='40'/></svg>";

        const itemsHtml = items.map(item => {
          const cachedProd = (typeof produtosCache !== 'undefined' && Array.isArray(produtosCache))
            ? produtosCache.find(p => p.id === item.id || p.nome === item.nome)
            : null;
          const rawImg = (item.imagem && String(item.imagem).trim())
            || (cachedProd ? (cachedProd.imagem || (cachedProd.imagens && cachedProd.imagens[0])) : '')
            || '';
          const finalImg = rawImg || fallbackSvg;
          const safeNome = String(item.nome || 'Produto').replace(/"/g, '&quot;');

          return `
            <div class="order-item-row">
              <div class="order-item-left">
                <img src="${finalImg}"
                     alt="${safeNome}"
                     class="order-item-img"
                     onerror="this.onerror=null;this.src='${fallbackSvg}';" />
                <div style="min-width:0;">
                  <div class="order-item-name" title="${safeNome}">${safeNome}</div>
                  <div class="order-item-qty">${item.qty}x ${formatPrice(item.preco)}</div>
                </div>
              </div>
              <div class="order-item-price">${formatPrice(item.subtotal || (item.preco * item.qty))}</div>
            </div>
          `;
        }).join('');

        const totalFormatted = formatPrice(order.total || 0);
        const freteFormatted = (order.valorFrete === 0 || order.valor_frete === 0) ? 'Grátis' : formatPrice(order.valorFrete || order.valor_frete || 0);

        const safeOrderId = order.id;
        const msgWhats = encodeURIComponent(`Olá! Gostaria de informações sobre o meu pedido *#${safeOrderId}* no valor de ${totalFormatted}.`);
        const whatsUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${msgWhats}`;

        return `
          <div class="order-card" data-order-id="${safeOrderId}">
            <div class="order-card-header">
              <div>
                <div class="order-id-badge">#${safeOrderId}</div>
                <div class="order-date-text">📅 ${dataFmt}</div>
              </div>
              <div>${statusBadge}</div>
            </div>

            <div class="order-items-list">
              ${itemsHtml}
            </div>

            <div class="order-card-footer">
              <div class="order-totals-row">
                <span>Frete: <strong style="color:var(--text-white);">${freteFormatted}</strong></span>
                <span style="display:flex;align-items:center;gap:0.4rem;">
                  Total: <span class="order-total-amount">${totalFormatted}</span>
                </span>
              </div>
              <div class="order-actions-row">
                <button type="button" class="order-action-btn order-action-reorder" onclick="CustomerAuth.reorder('${safeOrderId}')">
                  🛒 Comprar Novamente
                </button>
                <a href="${whatsUrl}" target="_blank" rel="noopener noreferrer" class="order-action-btn order-action-whatsapp">
                  💬 Suporte WhatsApp
                </a>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      if (loadingEl) loadingEl.style.display = 'none';
      if (listEl) {
        listEl.innerHTML = `
          <div style="text-align:center;padding:1.5rem;color:var(--red);font-size:0.85rem;">
            ⚠️ Erro ao carregar histórico: ${err.message}
          </div>
        `;
      }
    }
  },

  reorder(orderId) {
    if (!this._cachedOrders) return;
    const order = this._cachedOrders.find(o => o.id === orderId);
    if (!order || !Array.isArray(order.itens)) return;

    const currentItems = Cart.getItems();
    order.itens.forEach(item => {
      const existing = currentItems.find(ci => ci.id === item.id || ci.nome === item.nome);
      if (existing) {
        existing.qty += item.qty || 1;
      } else {
        currentItems.push({
          id: item.id || ('prod_' + Date.now()),
          nome: item.nome,
          preco: item.preco,
          imagem: item.imagem || '',
          qty: item.qty || 1
        });
      }
    });

    Cart.save(currentItems);
    this.close();
    Cart.open();
    Cart.showToast('Itens do pedido adicionados ao carrinho! 🛒');
  },

  open(resumeCheckout = false) {
    this._resumeCheckoutAfterLogin = resumeCheckout;
    this.updateUI();
    this.overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
  },

  close() {
    this.overlay?.classList.remove('open');
    document.body.style.overflow = '';
  }
};

/* ============================================================
   5. CHECKOUT FORM — Coleta dados do cliente (Exige Login na Conta!)
   ============================================================ */
const CheckoutForm = {
  init() {
    const overlay  = document.getElementById('checkout-form-overlay');
    const closeBtn = document.getElementById('checkout-form-close');
    const form     = document.getElementById('checkout-customer-form');
    const cpfInput = document.getElementById('checkout-cpf');
    const cepInput = document.getElementById('checkout-cep');

    // Máscara CPF
    cpfInput?.addEventListener('input', () => {
      let v = cpfInput.value.replace(/\D/g, '').substring(0, 11);
      v = v.replace(/(\d{3})(\d)/, '$1.$2');
      v = v.replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3');
      v = v.replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
      cpfInput.value = v;
    });

    // Máscara CEP
    cepInput?.addEventListener('input', () => {
      let v = cepInput.value.replace(/\D/g, '').substring(0, 8);
      v = v.replace(/(\d{5})(\d)/, '$1-$2');
      cepInput.value = v;
    });

    closeBtn?.addEventListener('click', () => this.close());
    overlay?.addEventListener('click', e => { if (e.target === overlay) this.close(); });
    form?.addEventListener('submit', e => { e.preventDefault(); this.confirm(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && overlay?.classList.contains('open')) this.close();
    });
  },

  open() {
    const items = Cart.getItems();
    if (items.length === 0) { Cart.showToast('Adicione produtos ao carrinho primeiro!'); return; }

    // REGRA DE NEGÓCIO: O cliente precisa estar cadastrado e logado para finalizar o pedido!
    if (!currentUser) {
      Cart.close();
      Cart.showToast('⚠️ Crie ou entre na sua conta para finalizar o pedido!');
      CustomerAuth.open(true); // Abre modal de auth e continua checkout assim que logar
      return;
    }

    const overlay = document.getElementById('checkout-form-overlay');
    overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';

    // Auto-preenche com os dados da conta do cliente cadastrado
    const nomeEl     = document.getElementById('checkout-nome');
    const cpfEl      = document.getElementById('checkout-cpf');
    const enderecoEl = document.getElementById('checkout-endereco');
    const cidadeEl   = document.getElementById('checkout-cidade');
    const cepEl      = document.getElementById('checkout-cep');

    if (nomeEl && currentUser.name) nomeEl.value = currentUser.name;
    if (cpfEl && currentUser.cpf) cpfEl.value = currentUser.cpf;
    if (enderecoEl && currentUser.address) enderecoEl.value = currentUser.address;
    if (cidadeEl && currentUser.city) cidadeEl.value = currentUser.city;
    if (cepEl && currentUser.cep) cepEl.value = currentUser.cep;

    const errEl = document.getElementById('checkout-form-error');
    if (errEl) errEl.textContent = '';
  },

  close() {
    document.getElementById('checkout-form-overlay')?.classList.remove('open');
    document.body.style.overflow = '';
  },

  async confirm() {
    const nome     = document.getElementById('checkout-nome')?.value.trim();
    const cpf      = document.getElementById('checkout-cpf')?.value.trim();
    const endereco = document.getElementById('checkout-endereco')?.value.trim();
    const cidade   = document.getElementById('checkout-cidade')?.value.trim();
    const cep      = document.getElementById('checkout-cep')?.value.trim();
    const errEl    = document.getElementById('checkout-form-error');

    if (!nome || !cpf || !endereco || !cidade) {
      if (errEl) errEl.textContent = '⚠️ Preencha todos os campos obrigatórios.';
      return;
    }

    const items = Cart.getItems();
    // Registra pedido automaticamente no banco de dados SQL via API
    if (typeof API !== 'undefined') {
      try {
        await API.createOrder({
          cliente: {
            nome,
            cpf,
            endereco,
            cidade,
            cep,
            telefone: currentUser?.phone || ''
          },
          itens: items,
          metodoPagamento: 'whatsapp'
        });
        console.log('[SQL Database] Pedido registrado com sucesso no banco de dados SQL!');
      } catch (e) {
        console.warn('[SQL Database] Aviso ao registrar pedido no banco:', e.message);
      }
    }

    this.close();
    Checkout.send({ nome, cpf, endereco, cidade, cep, telefone: currentUser?.phone });
  },
};

/* ============================================================
   5B. CHECKOUT — WhatsApp
   ============================================================ */
const Checkout = {
  send(cliente = null) {
    const items = Cart.getItems();
    if (items.length === 0) { Cart.showToast('Adicione produtos ao carrinho primeiro!'); return; }

    const total = Cart.getTotal();
    const frete = total >= FRETE_GRATIS_MIN ? 'GRÁTIS 🎉' : 'A combinar';
    const date  = new Date().toLocaleDateString('pt-BR');

    let msg  = `🦍 *${LOJA_CONFIG?.nomeNegocio || 'Nova Era Nutrition'} — Novo Pedido*\n`;
    msg     += `📅 ${date}\n\n`;

    if (cliente) {
      msg += `━━━━━━━━━━━━━━━━━━━━━━━\n*DADOS DO CLIENTE:*\n\n`;
      msg += `👤 Nome: ${cliente.nome}\n`;
      msg += `📋 CPF: ${cliente.cpf}\n`;
      msg += `📍 Endereço: ${cliente.endereco}\n`;
      msg += `🏙️ Cidade: ${cliente.cidade}\n`;
      if (cliente.cep) msg += `📮 CEP: ${cliente.cep}\n`;
      msg += '\n';
    }

    msg     += `━━━━━━━━━━━━━━━━━━━━━━━\n*ITENS DO PEDIDO:*\n\n`;

    items.forEach((item, i) => {
      msg += `${i + 1}. *${item.nome}*\n`;
      msg += `   ${item.qty}x ${formatPrice(item.preco)} = ${formatPrice(item.preco * item.qty)}\n\n`;
    });

    msg += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🛒 *Total: ${formatPrice(total)}*\n`;
    msg += `🚚 *Frete: ${frete}*\n\n`;
    msg += `Olá! Gostaria de finalizar este pedido. Pode me ajudar com pagamento e entrega? 💪`;

    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`, '_blank');
    Cart.clear();
    Cart.close();
    Cart.showToast('Pedido registrado! Acompanhe seu histórico em "Minha Conta" 📦');
  },
};

/* ============================================================
   6. HEADER SCROLL
   ============================================================ */
function initHeader() {
  const header = document.getElementById('site-header');
  if (!header) return;
  const onScroll = debounce(() => header.classList.toggle('scrolled', window.scrollY > 60));
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ============================================================
   7. MOBILE MENU
   ============================================================ */
function initMobileMenu() {
  const hamburger  = document.getElementById('hamburger-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  const links      = document.querySelectorAll('.mobile-nav-link, #mob-cta-btn');
  if (!hamburger || !mobileMenu) return;

  const close = () => {
    mobileMenu.classList.remove('open');
    hamburger.classList.remove('active');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  };

  hamburger.addEventListener('click', () => {
    const isOpen = mobileMenu.classList.toggle('open');
    hamburger.classList.toggle('active', isOpen);
    hamburger.setAttribute('aria-expanded', String(isOpen));
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  links.forEach(l => l.addEventListener('click', close));
  document.addEventListener('click', (e) => {
    if (!mobileMenu.contains(e.target) && !hamburger.contains(e.target)) close();
  });
}

/* ============================================================
   8. SCROLL ANIMATIONS
   ============================================================ */
function initScrollAnimations() {
  scrollObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el    = entry.target;
      const delay = parseInt(el.dataset.delay || '0', 10);
      setTimeout(() => el.classList.add('is-visible'), delay);
      scrollObserver.unobserve(el);
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });

  document.querySelectorAll('.animate-on-scroll').forEach(el => scrollObserver.observe(el));
}

/* ============================================================
   9. PARALLAX
   ============================================================ */
function initParallax() {
  const heroPar = document.getElementById('hero-parallax');
  const manPar  = document.getElementById('manifesto-parallax');

  window.addEventListener('scroll', debounce(() => {
    const y = window.scrollY;
    if (heroPar) heroPar.style.transform = `translateY(${y * 0.35}px)`;
    if (manPar) {
      const rect = manPar.closest('.manifesto')?.getBoundingClientRect();
      if (rect) {
        const rel = window.innerHeight / 2 - rect.top - rect.height / 2;
        manPar.style.transform = `translateY(${rel * 0.2}px)`;
      }
    }
  }), { passive: true });
}

/* ============================================================
   10. COUNTER ANIMATION
   ============================================================ */
function initCounters() {
  const counters = document.querySelectorAll('.stat-number[data-target]');
  if (!counters.length) return;

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el     = entry.target;
      const target = parseInt(el.dataset.target, 10);
      let start    = null;

      function step(ts) {
        if (!start) start = ts;
        const p = Math.min((ts - start) / 1800, 1);
        el.textContent = Math.floor(target * (1 - Math.pow(1 - p, 3))).toLocaleString('pt-BR');
        if (p < 1) requestAnimationFrame(step);
      }
      requestAnimationFrame(step);
      obs.unobserve(el);
    });
  }, { threshold: 0.5 });

  counters.forEach(c => obs.observe(c));
}

/* ============================================================
   11. CARD 3D TILT
   ============================================================ */
function initCardGlow(cards) {
  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const r    = card.getBoundingClientRect();
      const xPct = ((e.clientX - r.left) / r.width  - 0.5) * 20;
      const yPct = ((e.clientY - r.top)  / r.height - 0.5) * 20;
      card.style.transform = `translateY(-8px) scale(1.01) perspective(800px) rotateY(${xPct * 0.3}deg) rotateX(${-yPct * 0.3}deg)`;
    });
    card.addEventListener('mouseleave', () => { card.style.transform = ''; });
  });
}

/* ============================================================
   12. ACTIVE NAV HIGHLIGHT
   ============================================================ */
function initActiveNavHighlight() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');

  const obs = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const id = entry.target.getAttribute('id');
      navLinks.forEach(l => {
        l.style.color = l.getAttribute('href') === `#${id}` ? 'var(--text-white)' : '';
      });
    });
  }, { rootMargin: '-40% 0px -55% 0px' });

  sections.forEach(s => obs.observe(s));
}

/* ============================================================
   CSS — Loading Spinner (injetado dinamicamente)
   ============================================================ */
(function injectSpinnerCSS() {
  const style = document.createElement('style');
  style.textContent = `
    .loading-spinner {
      width: 48px; height: 48px;
      border: 3px solid rgba(217,4,41,0.15);
      border-top-color: var(--red, #D90429);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .cart-toast {
      position: fixed; bottom: 1.5rem; left: 50%; transform: translateX(-50%) translateY(100px);
      z-index: 4000; background: var(--bg-card, #141414);
      border: 1px solid rgba(217,4,41,0.3); color: var(--text-white, #f0f0f0);
      padding: 0.85rem 1.5rem; border-radius: 50px;
      display: flex; align-items: center; gap: 0.6rem;
      font-size: 0.9rem; font-weight: 600;
      box-shadow: 0 8px 24px rgba(0,0,0,0.6);
      opacity: 0; transition: transform 0.4s cubic-bezier(0.34,1.56,0.64,1), opacity 0.4s ease;
      white-space: nowrap;
    }
    .cart-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .toast-icon { color: var(--green, #00C853); font-size: 1rem; }
  `;
  document.head.appendChild(style);
})();

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initScrollAnimations();
  initFirestoreProducts();
  initProductFilter();

  Modal.init();
  Cart.init();
  CustomerAuth.init();
  CheckoutForm.init();

  // Set footer WhatsApp link dynamically
  const waLink = document.getElementById('social-whatsapp');
  if (waLink && typeof WHATSAPP_NUMBER !== 'undefined') {
    waLink.href = `https://wa.me/${WHATSAPP_NUMBER}`;
  }

  initHeader();
  initMobileMenu();
  initParallax();
  initCounters();
  initActiveNavHighlight();

  console.log('%c🦍 Nova Era Nutrition | Vitrine Conectada (Node.js + MongoDB)', 'color:#D90429;font-weight:bold;font-size:13px');
});
