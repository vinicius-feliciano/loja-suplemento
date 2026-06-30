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
      <p style="font-size:.85rem;margin-top:.5rem">Verifique sua conexão ou as configurações do Firebase.</p>
      <button onclick="location.reload()" style="margin-top:1.5rem;padding:.6rem 1.5rem;background:var(--red);color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;">
        Tentar novamente
      </button>
    </div>`;
}

function initFirestoreProducts() {
  const grid = document.getElementById('products-grid');
  if (!grid) return;

  showLoadingGrid(grid);

  try {
    // Busca simples sem índice composto — filtra "ativo" no cliente
    unsubProducts = db
      .collection('produtos')
      .orderBy('criadoEm', 'desc')
      .onSnapshot(
        (snapshot) => {
          // Filtra produtos ativos localmente (evita precisar de índice composto no Firebase)
          produtosCache = snapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(p => p.ativo !== false);
          renderProducts(currentFilter);
        },
        (err) => showErrorGrid(grid, err)
      );
  } catch (err) {
    showErrorGrid(grid, err);
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
        <img
          src="${p.imagem || ''}"
          alt="${p.nome} – Nova Era Nutrition"
          class="product-image"
          loading="lazy"
          onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22><rect fill=%22%231a1a1a%22 width=%22400%22 height=%22300%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%23444%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2218%22>Sem imagem</text></svg>'"
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

  const displayed = showAllProducts ? filtered : filtered.slice(0, 6);
  grid.innerHTML = displayed.map(buildProductCard).join('');

  // Re-observar novos cards para animação
  if (scrollObserver) {
    grid.querySelectorAll('.animate-on-scroll').forEach(el => scrollObserver.observe(el));
  }

  // Click para modal
  grid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.add-to-cart-btn')) return;
      Modal.open(card.dataset.id);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); Modal.open(card.dataset.id); }
    });
  });

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
    const p = produtosCache.find(x => x.id === productId);
    if (!p || !this.overlay) return;

    const oldPriceHTML = p.precoAntigo
      ? `<span class="modal-price-old">${formatPrice(p.precoAntigo)}</span>` : '';

    this.body.innerHTML = `
      <div class="carousel" id="product-carousel" aria-live="polite">
        <button class="carousel-arrow left" aria-label="Previous image"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg></button>
        <div class="carousel-track"></div>
        <button class="carousel-arrow right" aria-label="Next image"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></button>
        <div class="carousel-dots"></div>
      </div>
      ${p.badge ? `<div class="modal-badge badge--${p.badgeTipo || 'red'}">${p.badge}</div>` : ''}
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

          // Populate carousel with product images
          const carouselTrack = this.body.querySelector('.carousel-track');
          const carouselDots = this.body.querySelector('.carousel-dots');
          const images = (p.imagens && p.imagens.length) ? p.imagens : [p.imagem];
          images.forEach((src, idx) => {
            const img = document.createElement('img');
            img.src = src;
            img.className = 'modal-product-img';
            img.alt = `${p.nome} - imagem ${idx + 1}`;
            carouselTrack.appendChild(img);

            const dot = document.createElement('button');
            dot.className = 'carousel-dot';
            if (idx === 0) dot.classList.add('active');
            dot.addEventListener('click', () => showSlide(idx));
            carouselDots.appendChild(dot);
          });

          let currentIndex = 0;
          const showSlide = (index) => {
            currentIndex = (index + images.length) % images.length;
            carouselTrack.style.transform = `translateX(-${currentIndex * 100}%)`;
            const dots = carouselDots.querySelectorAll('.carousel-dot');
            dots.forEach((d, i) => d.classList.toggle('active', i === currentIndex));
          };

          this.body.querySelector('.carousel-arrow.left').addEventListener('click', () => showSlide(currentIndex - 1));
          this.body.querySelector('.carousel-arrow.right').addEventListener('click', () => showSlide(currentIndex + 1));

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

    const items    = this.getItems();
    const existing = items.find(i => i.id === productId);

    if (existing) { existing.qty += 1; }
    else { items.push({ id: productId, nome: product.nome, preco: product.preco, imagem: product.imagem || '', qty: 1 }); }

    this.save(items);
    this.showToast(`"${product.nome}" adicionado!`);
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
          <img src="${item.imagem}" alt="${item.nome}" class="cart-item-img"
            onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22><rect fill=%22%231a1a1a%22 width=%2260%22 height=%2260%22/></svg>'" />
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
   5. CHECKOUT FORM — Coleta dados do cliente
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
    const overlay = document.getElementById('checkout-form-overlay');
    overlay?.classList.add('open');
    document.body.style.overflow = 'hidden';
    document.getElementById('checkout-customer-form')?.reset();
    const errEl = document.getElementById('checkout-form-error');
    if (errEl) errEl.textContent = '';
  },

  close() {
    document.getElementById('checkout-form-overlay')?.classList.remove('open');
    document.body.style.overflow = '';
  },

  confirm() {
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

    this.close();
    Checkout.send({ nome, cpf, endereco, cidade, cep });
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

  console.log('%c🦍 Nova Era Nutrition | Firebase Vitrine carregada', 'color:#D90429;font-weight:bold;font-size:13px');
});
