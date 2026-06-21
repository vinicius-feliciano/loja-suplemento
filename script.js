/**
 * Nova Era Nutrition — script.js  (VITRINE)
 * ─────────────────────────────────────────
 * Módulos:
 *  1. DB (localStorage)         – produtos + carrinho
 *  2. Render Products           – grid dinâmico
 *  3. Product Filter            – botões categoria
 *  4. Product Modal             – detalhe do produto
 *  5. Cart                      – sidebar + CRUD items
 *  6. Checkout (WhatsApp)       – mensagem formatada
 *  7. Header scroll             – glassmorphism
 *  8. Mobile menu
 *  9. Scroll animations         – IntersectionObserver
 * 10. Parallax
 * 11. Counter animation         – hero stats
 * 12. Card 3D tilt
 */

'use strict';

/* ============================================================
   CONSTANTES DE CONFIGURAÇÃO
   ============================================================ */
const STORAGE_KEY_PRODUCTS = 'produtosLoja';
const STORAGE_KEY_CART     = 'carrinhoNova';
const WHATSAPP_NUMBER      = '5516993998499'; // Troque pelo número real (DDI+DDD+número)
const FRETE_GRATIS_MIN     = 199;

/* ============================================================
   0. DADOS MOCK – carregados se o localStorage estiver vazio
   ============================================================ */
const MOCK_PRODUCTS = [
  {
    id:          'mock-1',
    nome:        'Whey Protein',
    descricao:   '25g de proteína por dose. Fórmula de absorção rápida com BCAAs essenciais. Disponível nos sabores Chocolate, Baunilha e Morango. Ideal para consumo pós-treino para máxima recuperação muscular.',
    preco:       149.90,
    precoAntigo: 189.90,
    categoria:   'proteina',
    badge:       'Mais Vendido',
    badgeTipo:   'red',
    imagem:      'C:/Users/Vinicius/.gemini/antigravity/brain/8335f5e6-030b-47ea-8bab-e7280f794a48/product_whey_1781999682577.png',
    estrelas:    5,
    avaliacoes:  248,
  },
  {
    id:          'mock-2',
    nome:        'Pre-Workout Extreme',
    descricao:   'Energia, foco e pump explosivo. Cafeína 200mg + Beta-Alanina 3,2g + Citrulina Malato 6g por dose. Resultado imediato a partir dos primeiros minutos. Sabores: Melancia e Maracujá.',
    preco:       109.90,
    precoAntigo: 139.90,
    categoria:   'pretreino',
    badge:       'Novo',
    badgeTipo:   'green',
    imagem:      'C:/Users/Vinicius/.gemini/antigravity/brain/8335f5e6-030b-47ea-8bab-e7280f794a48/product_preworkout_1781999690938.png',
    estrelas:    5,
    avaliacoes:  183,
  },
  {
    id:          'mock-3',
    nome:        'Creatina Monohidratada',
    descricao:   'Creatina pura de grau farmacêutico (Creapure®). Aumento de força e volume muscular comprovados cientificamente. 5g por dose. Sem sabor, dissolve facilmente em água ou shake.',
    preco:       69.90,
    precoAntigo: 89.90,
    categoria:   'aminoacido',
    badge:       'Oferta',
    badgeTipo:   'red',
    imagem:      'C:/Users/Vinicius/.gemini/antigravity/brain/8335f5e6-030b-47ea-8bab-e7280f794a48/product_creatine_1781999699284.png',
    estrelas:    5,
    avaliacoes:  312,
  },
  {
    id:          'mock-4',
    nome:        'BCAA 2:1:1',
    descricao:   'Aminoácidos de cadeia ramificada na proporção científica 2:1:1 (Leucina, Isoleucina e Valina). Reduz o catabolismo muscular e acelera a recuperação entre treinos.',
    preco:       59.90,
    precoAntigo: 79.90,
    categoria:   'aminoacido',
    badge:       '',
    badgeTipo:   '',
    imagem:      'C:/Users/Vinicius/.gemini/antigravity/brain/8335f5e6-030b-47ea-8bab-e7280f794a48/product_bcaa_1781999715007.png',
    estrelas:    5,
    avaliacoes:  97,
  },
  {
    id:          'mock-5',
    nome:        'Glutamina',
    descricao:   'L-Glutamina pura para recuperação acelerada e fortalecimento do sistema imunológico. 5g por dose. Sem aditivos ou aromatizantes desnecessários. Excelente para atletas de alta intensidade.',
    preco:       79.90,
    precoAntigo: 99.90,
    categoria:   'aminoacido',
    badge:       'Top Vendas',
    badgeTipo:   'green',
    imagem:      'C:/Users/Vinicius/.gemini/antigravity/brain/8335f5e6-030b-47ea-8bab-e7280f794a48/product_glutamine_1781999725321.png',
    estrelas:    5,
    avaliacoes:  154,
  },
  {
    id:          'mock-6',
    nome:        'Whey Isolado',
    descricao:   '90% de proteína por dose. Zero lactose, zero gordura, zero carboidratos. Processo de micro-filtração a frio preserva os peptídeos bioativos. A escolha dos atletas que buscam o máximo.',
    preco:       189.90,
    precoAntigo: 229.90,
    categoria:   'proteina',
    badge:       'Premium',
    badgeTipo:   'red',
    imagem:      'C:/Users/Vinicius/.gemini/antigravity/brain/8335f5e6-030b-47ea-8bab-e7280f794a48/product_whey_isolado_1781999734092.png',
    estrelas:    5,
    avaliacoes:  201,
  },
];

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
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function starsHTML(n) {
  let html = '';
  for (let i = 0; i < 5; i++) html += `<span class="star${i >= n ? ' star--half' : ''}">★</span>`;
  return html;
}

/* ============================================================
   1. DB — localStorage helpers
   ============================================================ */
const DB = {
  getProducts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PRODUCTS);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  },

  saveProducts(list) {
    localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(list));
  },

  getCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CART);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  saveCart(cart) {
    localStorage.setItem(STORAGE_KEY_CART, JSON.stringify(cart));
  },

  /** Garante que os mock existem se o admin ainda não cadastrou nada */
  ensureProducts() {
    const existing = this.getProducts();
    if (!existing || existing.length === 0) {
      this.saveProducts(MOCK_PRODUCTS);
    }
  },
};

/* ============================================================
   2. RENDER PRODUCTS — monta os cards no grid
   ============================================================ */
function buildProductCard(p) {
  const glowClass = p.categoria === 'pretreino' || p.categoria === 'aminoacido'
    ? 'product-image-glow--green' : '';

  const badgeHTML = p.badge
    ? `<div class="product-badge badge--${p.badgeTipo}">${p.badge}</div>` : '';

  const oldPriceHTML = p.precoAntigo
    ? `<span class="product-price-old">${formatPrice(p.precoAntigo)}</span>` : '';

  return `
    <article
      class="product-card animate-on-scroll"
      data-animation="fade-up"
      data-category="${p.categoria}"
      data-id="${p.id}"
      tabindex="0"
      role="button"
      aria-label="Ver detalhes de ${p.nome}"
    >
      ${badgeHTML}
      <div class="product-image-wrap">
        <img
          src="${p.imagem}"
          alt="${p.nome} – Nova Era Nutrition"
          class="product-image"
          loading="lazy"
          onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22><rect fill=%22%231a1a1a%22 width=%22400%22 height=%22300%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%23444%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2220%22>Sem imagem</text></svg>'"
        />
        <div class="product-image-glow ${glowClass}"></div>
      </div>
      <div class="product-info">
        <span class="product-category">${p.categoria}</span>
        <h3 class="product-name">${p.nome}</h3>
        <p class="product-desc">${p.descricao.substring(0, 80)}…</p>
        <div class="product-rating" aria-label="Avaliação: ${p.estrelas} estrelas">
          ${starsHTML(p.estrelas)}
          <span class="rating-count">(${p.avaliacoes})</span>
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
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  const products = DB.getProducts() || [];
  const filtered = filter === 'all'
    ? products
    : products.filter(p => p.categoria === filter);

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-products" style="grid-column:1/-1;text-align:center;padding:4rem 1rem;color:var(--text-muted)">
        <div style="font-size:3rem;margin-bottom:1rem">📦</div>
        <p style="font-size:1.1rem">Nenhum produto nesta categoria ainda.</p>
        <p style="font-size:.85rem;margin-top:.5rem">Volte em breve ou veja <button data-filter="all" onclick="applyFilter('all')" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:.85rem;text-decoration:underline">todos os produtos</button>.</p>
      </div>`;
    return;
  }

  grid.innerHTML = filtered.map(buildProductCard).join('');

  // Re-observar novos cards para animação
  grid.querySelectorAll('.animate-on-scroll').forEach(el => {
    scrollObserver.observe(el);
  });

  // Abrir modal ao clicar no card (não no botão)
  grid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.add-to-cart-btn')) return;
      Modal.open(card.dataset.id);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        Modal.open(card.dataset.id);
      }
    });
  });

  // 3D tilt
  initCardGlow(grid.querySelectorAll('.product-card'));
}

/* ============================================================
   3. PRODUCT FILTER
   ============================================================ */
let currentFilter = 'all';

function applyFilter(filter) {
  currentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });
  renderProducts(filter);
}

function initProductFilter() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => applyFilter(btn.dataset.filter));
  });
}

/* ============================================================
   4. PRODUCT MODAL
   ============================================================ */
const Modal = {
  overlay: null,
  panel:   null,
  body:    null,
  closeBtn: null,

  init() {
    this.overlay  = document.getElementById('modal-overlay');
    this.panel    = document.getElementById('product-modal');
    this.body     = document.getElementById('modal-body');
    this.closeBtn = document.getElementById('modal-close-btn');

    this.closeBtn?.addEventListener('click', () => this.close());
    this.overlay?.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.close();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
  },

  open(productId) {
    const products = DB.getProducts() || [];
    const p = products.find(x => x.id === productId);
    if (!p || !this.overlay) return;

    const oldPriceHTML = p.precoAntigo
      ? `<span class="modal-price-old">${formatPrice(p.precoAntigo)}</span>` : '';

    this.body.innerHTML = `
      <div class="modal-image-col">
        <img
          src="${p.imagem}"
          alt="${p.nome}"
          class="modal-product-img"
          onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22400%22><rect fill=%22%231a1a1a%22 width=%22400%22 height=%22400%22/></svg>'"
        />
        ${p.badge ? `<div class="modal-badge badge--${p.badgeTipo}">${p.badge}</div>` : ''}
      </div>
      <div class="modal-info-col">
        <span class="product-category">${p.categoria}</span>
        <h2 class="modal-product-name">${p.nome}</h2>
        <div class="product-rating" aria-label="${p.estrelas} estrelas">
          ${starsHTML(p.estrelas)}
          <span class="rating-count">(${p.avaliacoes} avaliações)</span>
        </div>
        <p class="modal-product-desc">${p.descricao}</p>
        <div class="modal-price-group">
          ${oldPriceHTML}
          <span class="modal-price">${formatPrice(p.preco)}</span>
        </div>
        <div class="modal-actions">
          <button
            class="btn btn-primary btn-lg"
            id="modal-add-btn"
            aria-label="Adicionar ${p.nome} ao carrinho"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
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

    document.getElementById('modal-add-btn')?.addEventListener('click', () => {
      Cart.add(productId);
      this.close();
    });

    this.overlay.setAttribute('aria-hidden', 'false');
    this.overlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    setTimeout(() => this.panel.classList.add('open'), 10);
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
   5. CART — sidebar + CRUD
   ============================================================ */
const Cart = {
  sidebar:  null,
  overlay:  null,
  itemsEl:  null,
  totalEl:  null,
  countEl:  null,
  countSidebar: null,
  freteEl:  null,

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
    document.getElementById('checkout-btn')?.addEventListener('click', () => Checkout.send());
    document.getElementById('clear-cart-btn')?.addEventListener('click', () => {
      if (confirm('Deseja limpar o carrinho?')) this.clear();
    });

    this.render();
  },

  open() {
    this.sidebar?.classList.add('open');
    this.overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
  },

  close() {
    this.sidebar?.classList.remove('open');
    this.overlay?.classList.remove('open');
    document.body.style.overflow = '';
  },

  getItems() { return DB.getCart(); },

  save(items) {
    DB.saveCart(items);
    this.render();
  },

  add(productId) {
    const products = DB.getProducts() || [];
    const product  = products.find(p => p.id === productId);
    if (!product) return;

    const items = this.getItems();
    const existing = items.find(i => i.id === productId);

    if (existing) {
      existing.qty += 1;
    } else {
      items.push({ id: productId, nome: product.nome, preco: product.preco, imagem: product.imagem, qty: 1 });
    }

    this.save(items);
    this.showToast(`"${product.nome}" adicionado!`);
    this.open();
  },

  remove(productId) {
    const items = this.getItems().filter(i => i.id !== productId);
    this.save(items);
  },

  updateQty(productId, delta) {
    const items = this.getItems();
    const item  = items.find(i => i.id === productId);
    if (!item) return;
    item.qty = Math.max(1, item.qty + delta);
    this.save(items);
  },

  clear() {
    this.save([]);
  },

  getTotal() {
    return this.getItems().reduce((acc, i) => acc + i.preco * i.qty, 0);
  },

  getTotalQty() {
    return this.getItems().reduce((acc, i) => acc + i.qty, 0);
  },

  render() {
    const items = this.getItems();
    const total = this.getTotal();
    const qty   = this.getTotalQty();

    // Badge no ícone do header
    if (this.countEl) {
      this.countEl.textContent = qty > 99 ? '99+' : qty;
      this.countEl.style.display = qty > 0 ? 'flex' : 'none';
    }

    // Badge na sidebar
    if (this.countSidebar) {
      this.countSidebar.textContent = `${qty} ${qty === 1 ? 'item' : 'itens'}`;
    }

    // Total
    if (this.totalEl) this.totalEl.textContent = formatPrice(total);

    // Aviso frete grátis
    if (this.freteEl) {
      if (total === 0) {
        this.freteEl.innerHTML = '';
      } else if (total >= FRETE_GRATIS_MIN) {
        this.freteEl.innerHTML = `<span class="frete-ok">🎉 Você ganhou <strong>Frete Grátis</strong>!</span>`;
      } else {
        const restante = FRETE_GRATIS_MIN - total;
        this.freteEl.innerHTML = `<span class="frete-progress">Faltam <strong>${formatPrice(restante)}</strong> para Frete Grátis 🚚</span>`;
      }
    }

    // Lista de itens
    if (!this.itemsEl) return;

    if (items.length === 0) {
      this.itemsEl.innerHTML = `
        <div class="cart-empty">
          <div class="cart-empty-icon" aria-hidden="true">🛒</div>
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
          <img
            src="${item.imagem}"
            alt="${item.nome}"
            class="cart-item-img"
            onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22><rect fill=%22%221a1a1a%22 width=%2260%22 height=%2260%22/></svg>'"
          />
        </div>
        <div class="cart-item-details">
          <p class="cart-item-name">${item.nome}</p>
          <p class="cart-item-price">${formatPrice(item.preco)}</p>
          <div class="cart-item-qty-row">
            <button class="qty-btn" onclick="Cart.updateQty('${item.id}', -1)" aria-label="Diminuir quantidade">−</button>
            <span class="qty-value" aria-label="Quantidade: ${item.qty}">${item.qty}</span>
            <button class="qty-btn" onclick="Cart.updateQty('${item.id}', 1)"  aria-label="Aumentar quantidade">+</button>
            <button class="remove-btn" onclick="Cart.remove('${item.id}')" aria-label="Remover ${item.nome}">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
            </button>
          </div>
        </div>
        <span class="cart-item-subtotal">${formatPrice(item.preco * item.qty)}</span>
      </div>`).join('');
  },

  showToast(msg) {
    const toast   = document.getElementById('cart-toast');
    const textEl  = document.getElementById('toast-text');
    if (!toast) return;
    if (textEl) textEl.textContent = msg;
    clearTimeout(Cart._toastTimeout);
    toast.classList.add('show');
    Cart._toastTimeout = setTimeout(() => toast.classList.remove('show'), 3000);
  },
};

/* ============================================================
   6. CHECKOUT via WhatsApp
   ============================================================ */
const Checkout = {
  send() {
    const items = Cart.getItems();
    if (items.length === 0) {
      Cart.showToast('Adicione produtos ao carrinho primeiro!');
      return;
    }

    const total    = Cart.getTotal();
    const frete    = total >= FRETE_GRATIS_MIN ? 'GRÁTIS' : 'A combinar';
    const dateStr  = new Date().toLocaleDateString('pt-BR');

    let msg = `🦍 *NOVA ERA NUTRITION — Novo Pedido*\n`;
    msg    += `📅 Data: ${dateStr}\n\n`;
    msg    += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg    += `*ITENS DO PEDIDO:*\n\n`;

    items.forEach((item, i) => {
      msg += `${i + 1}. *${item.nome}*\n`;
      msg += `   Qtd: ${item.qty}x ${formatPrice(item.preco)}\n`;
      msg += `   Subtotal: ${formatPrice(item.preco * item.qty)}\n\n`;
    });

    msg += `━━━━━━━━━━━━━━━━━━━━━━━\n`;
    msg += `🛒 *Total: ${formatPrice(total)}*\n`;
    msg += `🚚 *Frete: ${frete}*\n\n`;
    msg += `Olá! Gostaria de finalizar este pedido. Poderia me ajudar com as formas de pagamento e entrega? 💪`;

    const encoded = encodeURIComponent(msg);
    window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${encoded}`, '_blank');
  },
};

/* ============================================================
   7. HEADER SCROLL (glassmorphism)
   ============================================================ */
function initHeader() {
  const header = document.getElementById('site-header');
  if (!header) return;
  const onScroll = debounce(() => {
    header.classList.toggle('scrolled', window.scrollY > 60);
  });
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ============================================================
   8. MOBILE MENU
   ============================================================ */
function initMobileMenu() {
  const hamburger  = document.getElementById('hamburger-btn');
  const mobileMenu = document.getElementById('mobile-menu');
  const links      = document.querySelectorAll('.mobile-nav-link, #mob-cta-btn');
  if (!hamburger || !mobileMenu) return;

  function close() {
    mobileMenu.classList.remove('open');
    hamburger.classList.remove('active');
    hamburger.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

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
   9. SCROLL ANIMATIONS
   ============================================================ */
let scrollObserver;

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
   10. PARALLAX
   ============================================================ */
function initParallax() {
  const heroPar  = document.getElementById('hero-parallax');
  const manPar   = document.getElementById('manifesto-parallax');

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
   11. COUNTER ANIMATION
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
   12. CARD 3D TILT
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
   ACTIVE NAV HIGHLIGHT
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
   INIT ALL
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  DB.ensureProducts();

  initScrollAnimations();
  renderProducts();
  initProductFilter();

  Modal.init();
  Cart.init();

  initHeader();
  initMobileMenu();
  initParallax();
  initCounters();
  initActiveNavHighlight();

  console.log('%c🦍 Nova Era Nutrition | Vitrine carregada', 'color:#D90429;font-weight:bold;font-size:14px');
});
