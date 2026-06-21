/**
 * Nova Era Nutrition — admin.js  (PAINEL ADMINISTRATIVO)
 * ───────────────────────────────────────────────────────
 * Módulos:
 *  1. Storage (localStorage bridge)
 *  2. Auth (login / logout)
 *  3. AdminNav (troca de views)
 *  4. AdminDashboard (stats + tabela preview)
 *  5. AdminProducts (lista + edição + exclusão)
 *  6. ProductForm (CRUD + live preview)
 *  7. Confirm Dialog
 *  8. Toast
 *  9. Responsive sidebar
 */

'use strict';

/* ============================================================
   CONSTANTES
   ============================================================ */
const STORAGE_KEY_PRODUCTS = 'produtosLoja';
const ADMIN_USER            = 'admin';
const ADMIN_PASS            = 'admin123';

/* ============================================================
   UTILITY
   ============================================================ */
function generateId() {
  return 'prod-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

function formatPrice(value) {
  const num = parseFloat(value);
  if (isNaN(num)) return '–';
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ============================================================
   1. STORAGE
   ============================================================ */
const Storage = {
  getProducts() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PRODUCTS);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  },

  saveProducts(list) {
    localStorage.setItem(STORAGE_KEY_PRODUCTS, JSON.stringify(list));
  },

  addProduct(data) {
    const list = this.getProducts();
    const product = { ...data, id: generateId() };
    list.push(product);
    this.saveProducts(list);
    return product;
  },

  updateProduct(id, data) {
    const list = this.getProducts();
    const idx  = list.findIndex(p => p.id === id);
    if (idx === -1) return false;
    list[idx] = { ...list[idx], ...data };
    this.saveProducts(list);
    return true;
  },

  deleteProduct(id) {
    const list = this.getProducts().filter(p => p.id !== id);
    this.saveProducts(list);
  },

  getById(id) {
    return this.getProducts().find(p => p.id === id) || null;
  },
};

/* ============================================================
   2. AUTH
   ============================================================ */
const Auth = {
  init() {
    const loginForm   = document.getElementById('login-form');
    const togglePass  = document.getElementById('toggle-pass');
    const logoutBtn   = document.getElementById('logout-btn');

    loginForm?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.doLogin();
    });

    togglePass?.addEventListener('click', () => {
      const passInput = document.getElementById('login-pass');
      passInput.type  = passInput.type === 'password' ? 'text' : 'password';
    });

    logoutBtn?.addEventListener('click', () => this.doLogout());
  },

  doLogin() {
    const user   = document.getElementById('login-user')?.value.trim();
    const pass   = document.getElementById('login-pass')?.value;
    const errEl  = document.getElementById('login-error');

    if (user === ADMIN_USER && pass === ADMIN_PASS) {
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('admin-layout').hidden        = false;
      sessionStorage.setItem('ne-admin-logged', '1');
      AdminDashboard.render();
    } else {
      if (errEl) {
        errEl.textContent = '❌ Usuário ou senha incorretos.';
        setTimeout(() => { errEl.textContent = ''; }, 3500);
      }
      document.getElementById('login-pass').value = '';
      document.getElementById('login-pass').focus();
    }
  },

  doLogout() {
    sessionStorage.removeItem('ne-admin-logged');
    document.getElementById('admin-layout').hidden         = true;
    document.getElementById('login-screen').style.display = '';
    document.getElementById('login-user').value = '';
    document.getElementById('login-pass').value = '';
  },

  /** Mantém sessão durante a aba (sessionStorage) */
  checkSession() {
    if (sessionStorage.getItem('ne-admin-logged') === '1') {
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('admin-layout').hidden        = false;
      AdminDashboard.render();
    }
  },
};

/* ============================================================
   3. AdminNav — troca de views
   ============================================================ */
const AdminNav = {
  current: 'dashboard',

  init() {
    // Vincula TODOS os elementos com data-view na página (sidebar + botões internos)
    // Usar delegação no document para capturar também elementos renderizados dinamicamente
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (!btn) return;
      // Ignorar links externos (como "Ver Loja")
      if (btn.tagName === 'A' && btn.href && !btn.href.startsWith('#')) return;
      e.preventDefault();
      this.go(btn.dataset.view);
    });
  },

  go(viewName) {
    // Hide all views
    document.querySelectorAll('.admin-view').forEach(v => v.classList.add('hidden'));

    // Show target
    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.remove('hidden');

    // Active nav link
    document.querySelectorAll('.sidebar-link[data-view]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewName);
      btn.setAttribute('aria-current', btn.dataset.view === viewName ? 'page' : 'false');
    });

    // Update topbar title
    const titles = {
      dashboard:   'Dashboard',
      products:    'Gerenciar Produtos',
      'add-product': ProductForm.isEditing ? 'Editar Produto' : 'Novo Produto',
    };

    const topbar = document.getElementById('topbar-title');
    if (topbar) topbar.textContent = titles[viewName] || '';

    this.current = viewName;

    // Render correct view
    if (viewName === 'dashboard')   AdminDashboard.render();
    if (viewName === 'products')    AdminProducts.render();
    if (viewName === 'add-product' && !ProductForm.isEditing) ProductForm.reset();

    // Close sidebar on mobile
    if (window.innerWidth < 769) {
      document.getElementById('admin-sidebar')?.classList.remove('open');
    }
  },
};

/* ============================================================
   4. AdminDashboard
   ============================================================ */
const AdminDashboard = {
  render() {
    const products = Storage.getProducts();

    // Contadores
    const byCategory = (cat) => products.filter(p => p.categoria === cat).length;

    const set = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    set('stat-count',           products.length);
    set('stat-proteina-count',  byCategory('proteina'));
    set('stat-pretreino-count', byCategory('pretreino'));
    set('stat-aminoacido-count', byCategory('aminoacido'));

    // Tabela preview dos 5 últimos
    const wrap   = document.getElementById('dashboard-table-wrap');
    if (!wrap) return;

    const recent = [...products].reverse().slice(0, 5);

    if (recent.length === 0) {
      wrap.innerHTML = `<div class="empty-table-msg"><strong>Nenhum produto cadastrado.</strong> Adicione seu primeiro produto.</div>`;
      return;
    }

    wrap.innerHTML = `
      <table class="products-table">
        <thead>
          <tr>
            <th>Imagem</th>
            <th>Nome</th>
            <th>Categoria</th>
            <th>Preço</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${recent.map(p => this.rowHTML(p)).join('')}
        </tbody>
      </table>`;

    // Bind actions
    wrap.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id     = btn.dataset.id;
        const action = btn.dataset.action;
        if (action === 'edit')   { AdminNav.go('add-product'); ProductForm.loadForEdit(id); }
        if (action === 'delete') { Confirm.show(id); }
      });
    });
  },

  rowHTML(p) {
    return `
      <tr>
        <td>
          <img
            src="${escapeHtml(p.imagem)}"
            alt="${escapeHtml(p.nome)}"
            class="table-img"
            onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22><rect fill=%22%231a1a1a%22 width=%2248%22 height=%2248%22/></svg>'"
          />
        </td>
        <td><span class="table-name">${escapeHtml(p.nome)}</span></td>
        <td><span class="table-category">${escapeHtml(p.categoria)}</span></td>
        <td><span class="table-price">${formatPrice(p.preco)}</span></td>
        <td>
          <div class="table-actions">
            <button class="btn-admin btn-admin--outline btn-admin--sm" data-action="edit" data-id="${p.id}" aria-label="Editar ${escapeHtml(p.nome)}">✏️ Editar</button>
            <button class="btn-admin btn-admin--danger  btn-admin--sm" data-action="delete" data-id="${p.id}" aria-label="Excluir ${escapeHtml(p.nome)}">🗑️ Excluir</button>
          </div>
        </td>
      </tr>`;
  },
};

/* ============================================================
   5. AdminProducts — lista completa
   ============================================================ */
const AdminProducts = {
  render() {
    const wrap    = document.getElementById('products-table-wrap');
    if (!wrap) return;
    const products = Storage.getProducts();

    if (products.length === 0) {
      wrap.innerHTML = `<div class="empty-table-msg"><strong>Nenhum produto cadastrado ainda.</strong><br/>Clique em "Novo Produto" para adicionar.</div>`;
      return;
    }

    wrap.innerHTML = `
      <table class="products-table">
        <thead>
          <tr>
            <th>Imagem</th>
            <th>Nome</th>
            <th>Categoria</th>
            <th>Preço</th>
            <th>Badge</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${products.map(p => this.rowHTML(p)).join('')}
        </tbody>
      </table>`;

    // Bind
    wrap.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id     = btn.dataset.id;
        const action = btn.dataset.action;
        if (action === 'edit')   { AdminNav.go('add-product'); ProductForm.loadForEdit(id); }
        if (action === 'delete') { Confirm.show(id); }
      });
    });
  },

  rowHTML(p) {
    const badgeHTML = p.badge
      ? `<span style="background:var(--${p.badgeTipo === 'green' ? 'green' : 'red'});color:${p.badgeTipo === 'green' ? '#000' : '#fff'};font-size:.7rem;font-weight:800;padding:.15rem .55rem;border-radius:20px;letter-spacing:.07em;text-transform:uppercase">${escapeHtml(p.badge)}</span>`
      : '<span style="color:var(--text-muted);font-size:.8rem">–</span>';

    return `
      <tr>
        <td>
          <img
            src="${escapeHtml(p.imagem)}"
            alt="${escapeHtml(p.nome)}"
            class="table-img"
            onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22><rect fill=%22%231a1a1a%22 width=%2248%22 height=%2248%22/></svg>'"
          />
        </td>
        <td><span class="table-name">${escapeHtml(p.nome)}</span></td>
        <td><span class="table-category">${escapeHtml(p.categoria)}</span></td>
        <td><span class="table-price">${formatPrice(p.preco)}</span></td>
        <td>${badgeHTML}</td>
        <td>
          <div class="table-actions">
            <button class="btn-admin btn-admin--outline btn-admin--sm" data-action="edit"   data-id="${p.id}" aria-label="Editar ${escapeHtml(p.nome)}">✏️ Editar</button>
            <button class="btn-admin btn-admin--danger  btn-admin--sm" data-action="delete" data-id="${p.id}" aria-label="Excluir ${escapeHtml(p.nome)}">🗑️ Excluir</button>
          </div>
        </td>
      </tr>`;
  },
};

/* ============================================================
   6. ProductForm — CRUD + live preview
   ============================================================ */
const ProductForm = {
  isEditing: false,
  editId:    null,

  init() {
    const form = document.getElementById('product-form');
    form?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.save();
    });

    // Live preview on any change
    const fields = ['prod-nome', 'prod-categoria', 'prod-descricao', 'prod-preco', 'prod-preco-antigo', 'prod-imagem', 'prod-badge', 'prod-badge-tipo'];
    fields.forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => this.updatePreview());
      document.getElementById(id)?.addEventListener('change', () => this.updatePreview());
    });

    this.reset();
  },

  getFieldValues() {
    return {
      nome:        document.getElementById('prod-nome')?.value.trim()       || '',
      descricao:   document.getElementById('prod-descricao')?.value.trim()  || '',
      preco:       parseFloat(document.getElementById('prod-preco')?.value) || 0,
      precoAntigo: parseFloat(document.getElementById('prod-preco-antigo')?.value) || null,
      categoria:   document.getElementById('prod-categoria')?.value         || '',
      imagem:      document.getElementById('prod-imagem')?.value.trim()     || '',
      badge:       document.getElementById('prod-badge')?.value.trim()      || '',
      badgeTipo:   document.getElementById('prod-badge-tipo')?.value        || 'red',
      estrelas:    parseInt(document.getElementById('prod-estrelas')?.value) || 5,
      avaliacoes:  parseInt(document.getElementById('prod-avaliacoes')?.value) || 0,
    };
  },

  validate(data) {
    if (!data.nome)      return 'Preencha o nome do produto.';
    if (!data.categoria) return 'Selecione uma categoria.';
    if (!data.descricao) return 'Preencha a descrição.';
    if (!data.preco || data.preco <= 0) return 'Informe um preço válido.';
    if (!data.imagem)    return 'Informe a URL da imagem.';
    return null;
  },

  save() {
    const errEl  = document.getElementById('form-error');
    const okEl   = document.getElementById('form-success');
    const data   = this.getFieldValues();
    const error  = this.validate(data);

    if (errEl) errEl.textContent = '';
    if (okEl)  okEl.textContent  = '';

    if (error) {
      if (errEl) errEl.textContent = '⚠️ ' + error;
      return;
    }

    if (this.isEditing && this.editId) {
      Storage.updateProduct(this.editId, data);
      Toast.show('Produto atualizado com sucesso! ✅', 'success');
    } else {
      Storage.addProduct(data);
      Toast.show('Produto adicionado com sucesso! ✅', 'success');
    }

    this.reset();
    AdminNav.go('products');
  },

  loadForEdit(id) {
    const p = Storage.getById(id);
    if (!p) return;

    this.isEditing = true;
    this.editId    = id;

    const set = (fieldId, val) => {
      const el = document.getElementById(fieldId);
      if (el) el.value = val ?? '';
    };

    set('edit-product-id',   p.id);
    set('prod-nome',         p.nome);
    set('prod-categoria',    p.categoria);
    set('prod-descricao',    p.descricao);
    set('prod-preco',        p.preco);
    set('prod-preco-antigo', p.precoAntigo || '');
    set('prod-badge',        p.badge       || '');
    set('prod-badge-tipo',   p.badgeTipo   || 'red');
    set('prod-imagem',       p.imagem);
    set('prod-estrelas',     p.estrelas    || 5);
    set('prod-avaliacoes',   p.avaliacoes  || 0);

    const titleEl    = document.getElementById('form-view-title');
    const subtitleEl = document.getElementById('form-view-subtitle');
    const topbarEl   = document.getElementById('topbar-title');

    if (titleEl)    titleEl.textContent    = 'Editar Produto';
    if (subtitleEl) subtitleEl.textContent = `Editando: ${p.nome}`;
    if (topbarEl)   topbarEl.textContent   = 'Editar Produto';

    this.updatePreview();
  },

  cancelEdit() {
    this.reset();
    AdminNav.go('products');
  },

  reset() {
    this.isEditing = false;
    this.editId    = null;

    document.getElementById('product-form')?.reset();
    document.getElementById('edit-product-id').value = '';

    const titleEl    = document.getElementById('form-view-title');
    const subtitleEl = document.getElementById('form-view-subtitle');
    if (titleEl)    titleEl.textContent    = 'Novo Produto';
    if (subtitleEl) subtitleEl.textContent = 'Preencha os campos abaixo e clique em Salvar.';

    const errEl = document.getElementById('form-error');
    const okEl  = document.getElementById('form-success');
    if (errEl) errEl.textContent = '';
    if (okEl)  okEl.textContent  = '';

    this.updatePreview();
  },

  updatePreview() {
    const wrap = document.getElementById('product-preview');
    if (!wrap) return;

    const d = this.getFieldValues();

    if (!d.nome && !d.imagem) {
      wrap.innerHTML = `<div style="color:var(--text-muted);font-size:.85rem;text-align:center;padding:1.5rem 0">Preencha o formulário para ver o preview.</div>`;
      return;
    }

    const badgeColor = d.badgeTipo === 'green' ? 'var(--green)' : 'var(--red)';
    const badgeText  = d.badgeTipo === 'green' ? '#000' : '#fff';

    wrap.innerHTML = `
      <div class="preview-product-card">
        ${d.badge ? `<div style="position:relative"><div style="position:absolute;top:.6rem;left:.6rem;background:${badgeColor};color:${badgeText};font-size:.7rem;font-weight:800;padding:.15rem .5rem;border-radius:20px;letter-spacing:.07em;text-transform:uppercase;z-index:2">${escapeHtml(d.badge)}</div></div>` : ''}
        <img
          src="${escapeHtml(d.imagem) || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22320%22 height=%22180%22><rect fill=%22%231a1a1a%22 width=%22320%22 height=%22180%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%23444%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2214%22>Sem imagem</text></svg>'}"
          alt="${escapeHtml(d.nome)}"
          style="width:100%;height:160px;object-fit:cover"
          onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22320%22 height=%22160%22><rect fill=%22%231a1a1a%22 width=%22320%22 height=%22160%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%23444%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2214%22>Imagem inválida</text></svg>'"
        />
        <div class="preview-product-info">
          <div class="preview-product-cat">${escapeHtml(d.categoria || 'categoria')}</div>
          <div class="preview-product-name">${escapeHtml(d.nome || 'Nome do produto')}</div>
          <div class="preview-product-desc">${escapeHtml(d.descricao ? d.descricao.substring(0,80) + (d.descricao.length > 80 ? '…' : '') : 'Descrição do produto')}</div>
          ${d.precoAntigo ? `<div class="preview-product-old">${formatPrice(d.precoAntigo)}</div>` : ''}
          <div class="preview-product-price">${d.preco ? formatPrice(d.preco) : 'R$ 0,00'}</div>
        </div>
      </div>`;
  },
};

/* ============================================================
   7. Confirm Dialog
   ============================================================ */
const Confirm = {
  pendingId: null,

  show(productId) {
    const p = Storage.getById(productId);
    if (!p) return;

    this.pendingId = productId;
    const overlay  = document.getElementById('confirm-overlay');
    const msgEl    = document.getElementById('confirm-msg');

    if (msgEl) msgEl.textContent = `Deseja excluir "${p.nome}" permanentemente? Esta ação não pode ser desfeita.`;

    // Usa classe .open em vez de hidden (evita bug de display:flex sobrepor [hidden])
    if (overlay) overlay.classList.add('open');
  },

  hide() {
    const overlay = document.getElementById('confirm-overlay');
    if (overlay) overlay.classList.remove('open');
    this.pendingId = null;
  },

  confirm() {
    if (!this.pendingId) return;
    Storage.deleteProduct(this.pendingId);
    Toast.show('Produto excluído.', 'error');
    this.hide();

    // Refresh view
    if (AdminNav.current === 'dashboard') AdminDashboard.render();
    if (AdminNav.current === 'products')  AdminProducts.render();
  },

  init() {
    document.getElementById('confirm-cancel-btn')?.addEventListener('click', () => this.hide());
    document.getElementById('confirm-ok-btn')?.addEventListener('click', () => this.confirm());
    // Fechar ao clicar no overlay (fundo escuro), mas não no dialog
    document.getElementById('confirm-overlay')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('confirm-overlay')) this.hide();
    });
    // Fechar com Escape
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const overlay = document.getElementById('confirm-overlay');
        if (overlay?.classList.contains('open')) this.hide();
      }
    });
  },
};

/* ============================================================
   8. Toast
   ============================================================ */
const Toast = {
  _timeout: null,

  show(msg, type = 'success') {
    const toast   = document.getElementById('admin-toast');
    const textEl  = document.getElementById('admin-toast-text');
    const iconEl  = document.getElementById('admin-toast-icon');
    if (!toast) return;

    if (textEl) textEl.textContent = msg;
    if (iconEl) iconEl.textContent = type === 'success' ? '✓' : type === 'error' ? '🗑️' : 'ℹ️';

    toast.className = `admin-toast show ${type}`;

    clearTimeout(this._timeout);
    this._timeout = setTimeout(() => {
      toast.classList.remove('show');
    }, 3200);
  },
};

/* ============================================================
   9. Responsive sidebar toggle
   ============================================================ */
function initResponsiveSidebar() {
  const hamburger = document.getElementById('topbar-hamburger');
  const sidebar   = document.getElementById('admin-sidebar');

  hamburger?.addEventListener('click', () => {
    sidebar?.classList.toggle('open');
  });

  // Fechar ao clicar fora
  document.addEventListener('click', (e) => {
    if (
      window.innerWidth < 769 &&
      sidebar?.classList.contains('open') &&
      !sidebar.contains(e.target) &&
      !hamburger?.contains(e.target)
    ) {
      sidebar.classList.remove('open');
    }
  });
}

/* ============================================================
   INIT ALL
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
  Auth.checkSession();
  AdminNav.init();
  ProductForm.init();
  Confirm.init();
  initResponsiveSidebar();

  console.log('%c🦍 Nova Era Nutrition | Admin carregado', 'color:#D90429;font-weight:bold;font-size:14px');
});
