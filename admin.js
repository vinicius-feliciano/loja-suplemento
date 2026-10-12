/**
 * Nova Era Nutrition — admin.js (PAINEL ADMINISTRATIVO)
 * ═══════════════════════════════════════════════════════
 * Backend: Node.js + Express + MongoDB Atlas (Mongoose)
 *
 * Módulos:
 *  1. Auth          — Autenticação de Administrador via Token / Session
 *  2. FSProducts    — CRUD de Produtos via REST API (/api/products)
 *  3. ImageUpload   — Upload multipart de imagens (/api/upload)
 *  4. AdminNav      — Navegação entre views e abas
 *  5. AdminDashboard — Estatísticas em tempo real e produtos recentes
 *  6. AdminProducts — Gestão completa do catálogo (Status, Edição, Exclusão)
 *  7. ProductForm   — Formulário com upload de até 8 fotos e Live Preview
 *  8. Confirm Dialog — Confirmação de exclusão segura
 *  9. Toast         — Notificações e feedback ao usuário
 * 10. Responsive Sidebar
 */

'use strict';

/* ============================================================
   ESTADO GLOBAL
   ============================================================ */
let _produtosListener = null;   // Firestore onSnapshot cleanup
let _adminProdutos    = [];     // Cache local para operações síncronas

/* ============================================================
   UTILITY
   ============================================================ */
function generateTempId() {
  return 'tmp_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
}

function formatPrice(value) {
  const n = parseFloat(value);
  return isNaN(n) ? '–' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ============================================================
   1. AUTH — Firebase Email/Password
   ============================================================ */
const Auth = {
  init() {
    // Se já estiver logado via token Node.js
    if (typeof API !== 'undefined' && API.getToken()) {
      this._onLoggedIn({ email: 'admin@novaera.com' });
    }

    // Observer de estado Firebase (se disponível)
    if (typeof auth !== 'undefined' && auth) {
      auth.onAuthStateChanged(user => {
        if (user) {
          this._onLoggedIn(user);
        } else if (!API.getToken()) {
          this._onLoggedOut();
        }
      });
    }

    document.getElementById('login-form')?.addEventListener('submit', e => {
      e.preventDefault();
      this.doLogin();
    });

    document.getElementById('toggle-pass')?.addEventListener('click', () => {
      const p = document.getElementById('login-pass');
      p.type  = p.type === 'password' ? 'text' : 'password';
    });

    document.getElementById('logout-btn')?.addEventListener('click', () => this.doLogout());
  },

  _onLoggedIn(user) {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('admin-layout').hidden        = false;

    // Exibir email do admin no topbar
    const usernameEl = document.getElementById('topbar-username');
    if (usernameEl) usernameEl.textContent = user.email;

    // Iniciar listener de produtos em tempo real
    this._startProductsListener();

    // Ir para dashboard
    AdminNav.go('dashboard');
  },

  _onLoggedOut() {
    document.getElementById('login-screen').style.display = '';
    document.getElementById('admin-layout').hidden        = true;
    this._stopProductsListener();
  },

  async doLogin() {
    const emailEl  = document.getElementById('login-user');
    const passEl   = document.getElementById('login-pass');
    const errEl    = document.getElementById('login-error');
    const btn      = document.getElementById('login-submit-btn');
    const btnText  = btn?.querySelector('.btn-login-text');

    const email = emailEl?.value.trim();
    const pass  = passEl?.value;

    if (!email || !pass) {
      if (errEl) errEl.textContent = '⚠️ Preencha e-mail e senha.';
      return;
    }

    // Loading state
    if (btn)     btn.disabled = true;
    if (btnText) btnText.textContent = 'Entrando…';
    if (errEl)   errEl.textContent   = '';

    try {
      // 1. Tenta login no Backend Node.js
      if (typeof API !== 'undefined') {
        try {
          const apiLogin = await API.login(email, pass);
          if (apiLogin && apiLogin.token) {
            this._onLoggedIn({ email });
            return;
          }
        } catch (_) {
          // Continua para o Firebase Auth se falhar
        }
      }

      if (typeof auth !== 'undefined' && auth) {
        await auth.signInWithEmailAndPassword(email, pass);
      } else {
        throw new Error('E-mail ou senha incorretos.');
      }
    } catch (error) {
      const MESSAGES = {
        'auth/user-not-found':     '❌ E-mail não encontrado.',
        'auth/wrong-password':     '❌ Senha incorreta.',
        'auth/invalid-email':      '❌ E-mail inválido.',
        'auth/invalid-credential': '❌ E-mail ou senha incorretos.',
        'auth/too-many-requests':  '❌ Muitas tentativas. Aguarde um momento.',
        'auth/network-request-failed': '❌ Sem conexão com a internet.',
      };
      if (errEl) errEl.textContent = MESSAGES[error.code] || `❌ ${error.message}`;
      if (btn)     btn.disabled     = false;
      if (btnText) btnText.textContent = 'Entrar no Painel';
    }
  },

  async doLogout() {
    if (typeof API !== 'undefined') API.logout();
    try {
      if (auth) await auth.signOut();
    } catch (e) {
      console.error('Logout error:', e);
    }
    this._onLoggedOut();
  },

  _startProductsListener() {
    if (_produtosListener) return;

    // Se autenticado via Node.js API
    if (typeof API !== 'undefined' && API.getToken()) {
      const fetchNodeProds = async () => {
        try {
          _adminProdutos = await API.getProducts();
          if (AdminNav.current === 'dashboard') AdminDashboard.render();
          if (AdminNav.current === 'products')  AdminProducts.render();
        } catch (e) {
          console.warn('[Node.js API Admin]', e.message);
        }
      };
      fetchNodeProds();
      _produtosListener = setInterval(fetchNodeProds, 4000);
      return;
    }

    if (!db) return;

    _produtosListener = db
      .collection('produtos')
      .orderBy('criadoEm', 'desc')
      .onSnapshot(
        snapshot => {
          _adminProdutos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          // Atualiza a view atual sem renavegar
          if (AdminNav.current === 'dashboard') AdminDashboard.render();
          if (AdminNav.current === 'products')  AdminProducts.render();
        },
        err => {
          console.error('[Firestore] Products listener error:', err);
          Toast.show('Erro ao sincronizar produtos. Verifique a conexão.', 'error');
        }
      );
  },

  _stopProductsListener() {
    if (_produtosListener) {
      if (typeof _produtosListener === 'function') {
        _produtosListener();
      } else {
        clearInterval(_produtosListener);
      }
      _produtosListener = null;
    }
    _adminProdutos = [];
  },
};

/* ============================================================
   2. CRUD de Produtos (Node.js REST API + Fallback Firestore)
   ============================================================ */
const FSProducts = {
  async add(data) {
    if (typeof API !== 'undefined' && API.getToken()) {
      const created = await API.addProduct(data);
      _adminProdutos.unshift(created);
      return created.id;
    }
    const docRef = await db.collection('produtos').add({
      ...data,
      ativo:     true,
      criadoEm:  firebase.firestore.FieldValue.serverTimestamp(),
    });
    return docRef.id;
  },

  async update(id, data) {
    if (typeof API !== 'undefined' && API.getToken()) {
      const updated = await API.updateProduct(id, data);
      const idx = _adminProdutos.findIndex(p => p.id === id);
      if (idx !== -1) _adminProdutos[idx] = updated;
      return;
    }
    await db.collection('produtos').doc(id).update({
      ...data,
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });
  },

  async delete(id) {
    if (typeof API !== 'undefined' && API.getToken()) {
      await API.deleteProduct(id);
      _adminProdutos = _adminProdutos.filter(p => p.id !== id);
      return;
    }
    await db.collection('produtos').doc(id).delete();
  },

  async toggleAtivo(id, ativo) {
    if (typeof API !== 'undefined' && API.getToken()) {
      await API.toggleProductAtivo(id, ativo);
      const p = _adminProdutos.find(p => p.id === id);
      if (p) p.ativo = ativo;
      return;
    }
    await db.collection('produtos').doc(id).update({ ativo });
  },

  getById(id) {
    return _adminProdutos.find(p => p.id === id) || null;
  },
};

/* ============================================================
   3. IMAGE UPLOAD — Firebase Storage
   ============================================================ */
const ImageUpload = {
  currentFile: null,
  uploadMode:  'url',  // 'url' | 'file'

  init() {
    const fileInput   = document.getElementById('prod-imagem-file');
    const urlInput    = document.getElementById('prod-imagem-url');
    const modeFile    = document.getElementById('mode-file');
    const modeUrl     = document.getElementById('mode-url');

    modeFile?.addEventListener('click', () => this.setMode('file'));
    modeUrl?.addEventListener('click',  () => this.setMode('url'));

    fileInput?.addEventListener('change', e => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validação
      if (file.size > 5 * 1024 * 1024) {
        Toast.show('Imagem muito grande. Limite: 5 MB.', 'error');
        e.target.value = '';
        return;
      }
      if (!file.type.startsWith('image/')) {
        Toast.show('Selecione apenas arquivos de imagem.', 'error');
        e.target.value = '';
        return;
      }

      this.currentFile = file;

      // Preview local imediato
      const reader = new FileReader();
      reader.onload = ev => {
        const prevEl = document.getElementById('img-file-preview');
        if (prevEl) {
          prevEl.src = ev.target.result;
          prevEl.style.display = 'block';
        }
        ProductForm.updatePreview();
      };
      reader.readAsDataURL(file);
    });

    urlInput?.addEventListener('input', () => {
      this.currentFile = null;
      ProductForm.updatePreview();
    });
  },

  setMode(mode) {
    this.uploadMode  = mode;
    this.currentFile = null;

    const fileWrap = document.getElementById('img-file-wrap');
    const urlWrap  = document.getElementById('img-url-wrap');
    const modeFile = document.getElementById('mode-file');
    const modeUrl  = document.getElementById('mode-url');

    if (mode === 'file') {
      if (fileWrap) fileWrap.style.display = 'block';
      if (urlWrap)  urlWrap.style.display  = 'none';
      if (modeFile) modeFile.classList.add('active');
      if (modeUrl)  modeUrl.classList.remove('active');
    } else {
      if (fileWrap) fileWrap.style.display = 'none';
      if (urlWrap)  urlWrap.style.display  = 'block';
      if (modeFile) modeFile.classList.remove('active');
      if (modeUrl)  modeUrl.classList.add('active');
    }

    ProductForm.updatePreview();
  },

  /** Retorna a URL da imagem (para preview e para salvar no Firestore) */
  getPreviewUrl() {
    if (this.uploadMode === 'file') {
      const prevEl = document.getElementById('img-file-preview');
      return prevEl?.src && !prevEl.src.endsWith('admin.html') ? prevEl.src : '';
    }
    return document.getElementById('prod-imagem-url')?.value.trim() || '';
  },

  /** Faz upload para o Storage e retorna a URL pública */
  async upload(productId) {
    if (!this.currentFile || !storage) return null;

    const ext  = this.currentFile.name.split('.').pop().toLowerCase();
    const path = `produtos/${productId}_${Date.now()}.${ext}`;
    const ref  = storage.ref(path);

    this._showProgress(0);

    return new Promise((resolve, reject) => {
      const task = ref.put(this.currentFile, { contentType: this.currentFile.type });

      task.on(
        'state_changed',
        snap => {
          const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
          this._showProgress(pct);
        },
        err => {
          this._hideProgress();
          reject(err);
        },
        async () => {
          const url = await task.snapshot.ref.getDownloadURL();
          this._hideProgress();
          this.currentFile = null;
          resolve(url);
        }
      );
    });
  },

  _showProgress(pct) {
    const wrap = document.getElementById('upload-progress-wrap');
    const bar  = document.getElementById('upload-progress-bar');
    const txt  = document.getElementById('upload-progress-text');
    if (wrap) wrap.style.display = 'block';
    if (bar)  bar.style.width    = `${pct}%`;
    if (txt)  txt.textContent    = `${pct}%`;
  },

  _hideProgress() {
    const wrap = document.getElementById('upload-progress-wrap');
    if (wrap) wrap.style.display = 'none';
  },

  reset() {
    this.currentFile = null;
    const fileInput  = document.getElementById('prod-imagem-file');
    const prevEl     = document.getElementById('img-file-preview');
    const urlInput   = document.getElementById('prod-imagem-url');
    if (fileInput) fileInput.value = '';
    if (prevEl)    { prevEl.src = ''; prevEl.style.display = 'none'; }
    if (urlInput)  urlInput.value  = '';
    this._hideProgress();
    this.setMode('url');
  },
};

/* ============================================================
   4. AdminNav — troca de views
   ============================================================ */
const AdminNav = {
  current: 'dashboard',

  init() {
    // Delegação global para todos os [data-view]
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-view]');
      if (!btn) return;
      if (btn.tagName === 'A' && btn.href && !btn.getAttribute('href').startsWith('#')) return;
      e.preventDefault();
      this.go(btn.dataset.view);
    });
  },

  go(viewName) {
    document.querySelectorAll('.admin-view').forEach(v => v.classList.add('hidden'));

    const target = document.getElementById(`view-${viewName}`);
    if (target) target.classList.remove('hidden');

    document.querySelectorAll('.sidebar-link[data-view]').forEach(btn => {
      const isActive = btn.dataset.view === viewName;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-current', isActive ? 'page' : 'false');
    });

    const TITLES = {
      dashboard:    'Dashboard',
      products:     'Gerenciar Produtos',
      categories:   'Gerenciar Categorias',
      orders:       'Pedidos & Vendas',
      'add-product': ProductForm.isEditing ? 'Editar Produto' : 'Novo Produto',
    };

    const topbar = document.getElementById('topbar-title');
    if (topbar) topbar.textContent = TITLES[viewName] || '';

    this.current = viewName;

    if (viewName === 'dashboard')    AdminDashboard.render();
    if (viewName === 'products')     AdminProducts.render();
    if (viewName === 'categories')   CategoryManager.renderTable();
    if (viewName === 'orders')       AdminOrders.render();
    if (viewName === 'add-product' && !ProductForm.isEditing) ProductForm.reset();

    // Fechar sidebar no mobile
    if (window.innerWidth < 769) {
      document.getElementById('admin-sidebar')?.classList.remove('open');
    }
  },
};

/* ============================================================
   5. AdminAnalytics — Business Intelligence & Data Analytics Engine
   ============================================================ */
const AdminAnalytics = {
  initialized: false,
  ordersCache: [],
  productsCache: [],
  _charts: {},
  _refreshInterval: null,
  activePeriod: 'all',

  init() {
    if (this.initialized) return;
    this.initialized = true;

    // Seletor de período
    const periodSelect = document.getElementById('analytics-period-select');
    if (periodSelect) {
      periodSelect.addEventListener('change', (e) => {
        this.activePeriod = e.target.value;
        this.recalculateAndRender();
      });
    }

    // Botão Sincronizar / Refresh manual
    const refreshBtn = document.getElementById('btn-refresh-analytics');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        this.refresh(true);
      });
    }

    // Botão de atalho para pedidos
    const dashViewOrders = document.getElementById('dash-view-orders-btn');
    if (dashViewOrders) {
      dashViewOrders.addEventListener('click', () => {
        AdminNav.go('orders');
      });
    }

    // Polling em segundo plano a cada 30 segundos
    if (!this._refreshInterval) {
      this._refreshInterval = setInterval(() => {
        if (AdminNav.current === 'dashboard' && !document.hidden) {
          this.refresh(false);
        }
      }, 30000);
    }
  },

  async render() {
    this.init();
    await this.refresh(false);
  },

  async refresh(showToast = false) {
    const spinner = document.getElementById('refresh-icon-spinner');
    if (spinner) spinner.classList.add('spinning');

    try {
      // 1. Carrega produtos e pedidos em paralelo
      const [orders, products] = await Promise.all([
        (typeof API !== 'undefined' ? API.getOrders().catch(() => []) : []),
        (typeof API !== 'undefined' && API.getProducts ? API.getProducts().catch(() => _adminProdutos) : _adminProdutos)
      ]);

      this.ordersCache = Array.isArray(orders) ? orders : [];
      this.productsCache = (Array.isArray(products) && products.length) ? products : _adminProdutos;

      // 2. Atualiza timestamp
      const tsEl = document.getElementById('analytics-last-update');
      if (tsEl) {
        const now = new Date();
        tsEl.textContent = `Atualizado às ${now.toLocaleTimeString('pt-BR')}`;
      }

      // 3. Recalcula e plota visualizações
      this.recalculateAndRender();

      if (showToast && typeof Toast !== 'undefined') {
        Toast.show('Dados analíticos sincronizados com sucesso! 📊', 'success');
      }
    } catch (err) {
      console.error('[AdminAnalytics.refresh] Erro:', err);
      if (showToast && typeof Toast !== 'undefined') {
        Toast.show('Erro ao sincronizar dados: ' + err.message, 'error');
      }
    } finally {
      if (spinner) {
        setTimeout(() => spinner.classList.remove('spinning'), 400);
      }
    }
  },

  recalculateAndRender() {
    const rawOrders = this.ordersCache;
    const products = this.productsCache;

    // Filtra pedidos pelo período ativo
    const filteredOrders = this.filterByPeriod(rawOrders, this.activePeriod);

    // Calcula todas as métricas analíticas
    const metrics = this.computeMetrics(filteredOrders, products);

    // Renderiza cada camada do painel
    this.renderKPIs(metrics);
    this.renderInsights(metrics);
    this.renderCharts(metrics);
    this.renderTables(metrics);
  },

  filterByPeriod(orders, period) {
    if (!orders || !orders.length || period === 'all') return orders;

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

    return orders.filter(o => {
      if (!o.criadoEm) return true;
      const orderDate = new Date(o.criadoEm).getTime();
      if (isNaN(orderDate)) return true;

      if (period === 'today') {
        return orderDate >= startOfToday;
      }
      if (period === '7d') {
        const sevenDaysAgo = now.getTime() - (7 * 24 * 60 * 60 * 1000);
        return orderDate >= sevenDaysAgo;
      }
      if (period === '30d') {
        const thirtyDaysAgo = now.getTime() - (30 * 24 * 60 * 60 * 1000);
        return orderDate >= thirtyDaysAgo;
      }
      return true;
    });
  },

  computeMetrics(orders, products) {
    let totalRevenue = 0;
    let confirmedRevenue = 0;
    let pendingRevenue = 0;
    let totalUnits = 0;

    let countPending = 0;
    let countPaid = 0;
    let countSent = 0;
    let countCancelled = 0;

    const paymentMethods = {};
    const dateMap = {}; // data -> { revenue, count }
    const productSalesMap = {}; // prodId / name -> { id, nome, categoria, imagem, precoMedio, qty, revenue }
    const customerMap = {}; // cpf / nome -> { nome, cpf, cidade, ordersCount, totalSpent, lastOrderDate }
    const categoryRevenueMap = {};

    // Inicializa catálogo para garantir Curva ABC completa
    products.forEach(p => {
      const norm = (typeof ImageBackend !== 'undefined') ? ImageBackend.normalizeProduct(p) : p;
      productSalesMap[norm.id] = {
        id: norm.id,
        nome: norm.nome,
        categoria: norm.categoria || 'Geral',
        imagem: norm.imagem || (norm.imagens && norm.imagens[0]) || '',
        precoOriginal: parseFloat(norm.preco) || 0,
        qty: 0,
        revenue: 0
      };
    });

    orders.forEach(o => {
      const total = parseFloat(o.total) || 0;
      totalRevenue += total;

      const status = (o.status || 'pendente').toLowerCase();
      if (status === 'pago') {
        countPaid++;
        confirmedRevenue += total;
      } else if (status === 'enviado') {
        countSent++;
        confirmedRevenue += total;
      } else if (status === 'cancelado') {
        countCancelled++;
      } else {
        countPending++;
        pendingRevenue += total;
      }

      // Método de pagamento
      const met = (o.metodoPagamento || 'whatsapp').toLowerCase();
      paymentMethods[met] = (paymentMethods[met] || 0) + 1;

      // Agrupamento temporal (YYYY-MM-DD)
      const d = o.criadoEm ? new Date(o.criadoEm) : new Date();
      const dateKey = !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : 'Indefinido';
      if (!dateMap[dateKey]) dateMap[dateKey] = { revenue: 0, count: 0 };
      dateMap[dateKey].revenue += total;
      dateMap[dateKey].count += 1;

      // Itens do pedido
      if (Array.isArray(o.itens)) {
        o.itens.forEach(it => {
          const qty = parseInt(it.qty) || 1;
          const subtotal = parseFloat(it.subtotal || (it.preco * qty)) || 0;
          totalUnits += qty;

          const key = it.id || it.nome;
          if (!productSalesMap[key]) {
            productSalesMap[key] = {
              id: it.id || key,
              nome: it.nome,
              categoria: 'Geral',
              imagem: it.imagem || '',
              precoOriginal: parseFloat(it.preco) || 0,
              qty: 0,
              revenue: 0
            };
          }
          productSalesMap[key].qty += qty;
          productSalesMap[key].revenue += subtotal;

          // Categoria
          const cat = productSalesMap[key].categoria || 'Geral';
          categoryRevenueMap[cat] = (categoryRevenueMap[cat] || 0) + subtotal;
        });
      }

      // Clientes
      const cli = o.cliente || {};
      const cliKey = (cli.cpf || cli.nome || o.userId || o.id).trim();
      if (!customerMap[cliKey]) {
        customerMap[cliKey] = {
          nome: cli.nome || 'Cliente Anônimo',
          cpf: cli.cpf || '–',
          cidade: cli.cidade || '–',
          ordersCount: 0,
          totalSpent: 0,
          lastOrderDate: o.criadoEm
        };
      }
      customerMap[cliKey].ordersCount += 1;
      customerMap[cliKey].totalSpent += total;
      if (new Date(o.criadoEm) > new Date(customerMap[cliKey].lastOrderDate)) {
        customerMap[cliKey].lastOrderDate = o.criadoEm;
      }
    });

    const totalOrders = orders.length;
    const confirmedOrders = countPaid + countSent;
    const aov = totalOrders > 0 ? (totalRevenue / totalOrders) : 0;
    const conversionRate = totalOrders > 0 ? ((confirmedOrders / totalOrders) * 100) : 0;
    const itemsPerOrder = totalOrders > 0 ? (totalUnits / totalOrders) : 0;
    const uniqueCustomers = Object.keys(customerMap).length;
    const avgLtv = uniqueCustomers > 0 ? (totalRevenue / uniqueCustomers) : 0;

    // Processamento de Curva ABC (Produtos)
    const sortedProducts = Object.values(productSalesMap).sort((a, b) => b.revenue - a.revenue);
    let accumulatedRevenue = 0;
    const abcProducts = sortedProducts.map((p, idx) => {
      accumulatedRevenue += p.revenue;
      const share = totalRevenue > 0 ? (p.revenue / totalRevenue) * 100 : 0;
      const accumulatedShare = totalRevenue > 0 ? (accumulatedRevenue / totalRevenue) * 100 : 0;
      let classification = 'C';
      if (accumulatedShare <= 70 || idx === 0) classification = 'A';
      else if (accumulatedShare <= 90) classification = 'B';

      return {
        ...p,
        rank: idx + 1,
        share: share,
        classification
      };
    });

    // Ranking de Clientes
    const sortedCustomers = Object.values(customerMap).sort((a, b) => b.totalSpent - a.totalSpent);

    return {
      totalRevenue,
      confirmedRevenue,
      pendingRevenue,
      totalOrders,
      confirmedOrders,
      countPending,
      countPaid,
      countSent,
      countCancelled,
      aov,
      conversionRate,
      totalUnits,
      itemsPerOrder,
      uniqueCustomers,
      avgLtv,
      paymentMethods,
      dateMap,
      abcProducts,
      sortedCustomers,
      categoryRevenueMap,
      totalCatalog: products.length
    };
  },

  renderKPIs(m) {
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    set('kpi-total-revenue', formatPrice(m.totalRevenue));
    set('kpi-orders-count', `${m.totalOrders} pedido(s) gerados`);

    set('kpi-confirmed-revenue', formatPrice(m.confirmedRevenue));
    set('kpi-confirmed-count', `${m.confirmedOrders} liquidados (${m.conversionRate.toFixed(1)}%)`);

    set('kpi-aov', formatPrice(m.aov));
    set('kpi-items-per-order', `${m.itemsPerOrder.toFixed(1)} itens/pedido`);

    set('kpi-conversion-rate', `${m.conversionRate.toFixed(1)}%`);
    set('kpi-pending-count', `${m.countPending} aguardando pgto`);

    set('kpi-units-sold', `${m.totalUnits} un.`);
    set('kpi-active-catalog', `${m.totalCatalog} produtos ativos`);

    set('kpi-unique-customers', `${m.uniqueCustomers}`);
    set('kpi-avg-ltv', `LTV Médio: ${formatPrice(m.avgLtv)}`);

    const badgeEl = document.getElementById('chart-sales-total-badge');
    if (badgeEl) badgeEl.textContent = formatPrice(m.totalRevenue);
  },

  renderInsights(m) {
    const container = document.getElementById('analytics-insights-container');
    if (!container) return;

    const insights = [];

    // 1. Diagnóstico do Funil e Liquidez
    if (m.countPending > 0) {
      insights.push({
        type: 'warning',
        icon: '⏳',
        title: `R$ ${formatPrice(m.pendingRevenue)} em Aberto (${m.countPending} pedidos)`,
        desc: `Existem ${m.countPending} pedido(s) aguardando confirmação. Como os pagamentos online automatizados ainda não estão vinculados, esta é sua maior oportunidade de caixa imediato.`,
        recommendation: `💡 Ação recomendada: Chame os clientes pelo WhatsApp oficial e forneça chave PIX ou link de pagamento direto para fechar a conversão hoje.`
      });
    } else if (m.totalOrders > 0) {
      insights.push({
        type: 'success',
        icon: '🎯',
        title: `Funil com Alta Eficiência de Liquidação`,
        desc: `Não há pedidos estagnados em pendência no momento selecionado. 100% dos pedidos ativos foram liquidados ou despachados.`,
        recommendation: `💡 Ação recomendada: Aumente o investimento em tráfego e campanhas de redes sociais, pois a taxa de conclusão está excelente.`
      });
    }

    // 2. Diagnóstico de Curva ABC & Concentração de Receita
    const topProd = m.abcProducts.find(p => p.qty > 0);
    if (topProd) {
      const isHighConcentration = topProd.share >= 40;
      insights.push({
        type: isHighConcentration ? 'purple' : 'info',
        icon: '🏆',
        title: `Carro-Chefe: ${topProd.nome}`,
        desc: `Este produto lidera o catálogo com ${topProd.qty} un. vendidas e ${topProd.share.toFixed(1)}% da receita total (${formatPrice(topProd.revenue)}).`,
        recommendation: isHighConcentration
          ? `💡 Atenção: Alta dependência de um único SKU. Garanta reposição de estoque antes que acabe e ofereça produtos complementares como cross-sell.`
          : `💡 Estratégia: Mantenha o líder em destaque na vitrine principal e teste variações de sabores ou kits combinados.`
      });
    }

    // 3. Diagnóstico de Ticket Médio (Basket Size)
    if (m.totalOrders > 0) {
      if (m.itemsPerOrder < 1.4) {
        insights.push({
          type: 'info',
          icon: '🛒',
          title: `Oportunidade de Elevação do Ticket Médio`,
          desc: `A média atual é de ${m.itemsPerOrder.toFixed(1)} produto por pedido, com ticket médio em ${formatPrice(m.aov)}.`,
          recommendation: `💡 Ação recomendada: Crie gatilhos de "Compre Junto" no carrinho (ex: Creatina + Coqueteleira) e frete grátis para compras acima de R$ ${Math.round(m.aov * 1.35)}.`
        });
      } else {
        insights.push({
          type: 'success',
          icon: '🚀',
          title: `Cesta de Compras Robusta (${m.itemsPerOrder.toFixed(1)} itens/pedido)`,
          desc: `Os clientes têm adicionado múltiplos produtos por compra, reduzindo proporcionalmente o custo operacional e de frete por entrega.`,
          recommendation: `💡 Excelente comportamento de cross-sell. Mantenha os banners de ofertas combinadas visíveis na loja.`
        });
      }
    }

    // 4. Giro de Catálogo
    const activeWithSales = m.abcProducts.filter(p => p.qty > 0).length;
    const dormantCount = Math.max(0, m.totalCatalog - activeWithSales);
    insights.push({
      type: dormantCount > 0 ? 'info' : 'success',
      icon: '📦',
      title: `${activeWithSales} de ${m.totalCatalog} SKUs com Vendas Registradas`,
      desc: dormantCount > 0
        ? `Existem ${dormantCount} produto(s) no estoque sem saída no período analisado.`
        : `Excelente amplitude de giro: 100% dos produtos do catálogo registraram movimentação.`,
      recommendation: dormantCount > 0
        ? `💡 Ação recomendada: Crie a etiqueta "Oferta Relâmpago" ou "Queima de Estoque" para os itens sem saída para liberar capital de giro.`
        : `💡 Mantenha a variedade equilibrada de categorias.`
    });

    container.innerHTML = insights.map(i => `
      <div class="insight-card insight-card--${i.type}">
        <div class="insight-card-top">
          <span class="insight-icon">${i.icon}</span>
          <span class="insight-title">${escapeHtml(i.title)}</span>
        </div>
        <div class="insight-desc">${escapeHtml(i.desc)}</div>
        <div class="insight-recommendation">${escapeHtml(i.recommendation)}</div>
      </div>
    `).join('');
  },

  renderCharts(m) {
    if (typeof Chart === 'undefined') {
      console.warn('[AdminAnalytics] Chart.js não está carregado no momento.');
      return;
    }

    // Configurações globais elegantes para tema escuro
    Chart.defaults.color = '#999999';
    Chart.defaults.borderColor = 'rgba(255, 255, 255, 0.06)';
    Chart.defaults.font.family = "'Inter', sans-serif";

    // ── GRÁFICO 1: EVOLUÇÃO TEMPORAL DE VENDAS ──
    this.createTimelineChart(m);

    // ── GRÁFICO 2: STATUS DO FUNIL (DONUT) ──
    this.createOrderStatusChart(m);

    // ── GRÁFICO 3: TOP 5 PRODUTOS CURVA ABC ──
    this.createTopProductsChart(m);

    // ── GRÁFICO 4: MÉTODOS DE PAGAMENTO ──
    this.createPaymentMethodsChart(m);

    // ── GRÁFICO 5: MIX DE CATEGORIAS ──
    this.createCategoryMixChart(m);
  },

  createTimelineChart(m) {
    const canvas = document.getElementById('chart-sales-timeline');
    if (!canvas) return;

    if (this._charts.timeline) {
      this._charts.timeline.destroy();
    }

    const sortedDates = Object.keys(m.dateMap).sort();
    let labels = [];
    let revenueData = [];
    let countData = [];

    if (sortedDates.length === 0) {
      labels = ['Sem dados'];
      revenueData = [0];
      countData = [0];
    } else {
      labels = sortedDates.map(dateStr => {
        const parts = dateStr.split('-');
        return parts.length === 3 ? `${parts[2]}/${parts[1]}` : dateStr;
      });
      revenueData = sortedDates.map(d => m.dateMap[d].revenue);
      countData = sortedDates.map(d => m.dateMap[d].count);
    }

    const ctx = canvas.getContext('2d');
    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, 'rgba(217, 4, 41, 0.45)');
    gradient.addColorStop(1, 'rgba(217, 4, 41, 0.01)');

    this._charts.timeline = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Faturamento (R$)',
            data: revenueData,
            borderColor: '#D90429',
            backgroundColor: gradient,
            borderWidth: 3,
            fill: true,
            tension: 0.35,
            pointBackgroundColor: '#fff',
            pointBorderColor: '#D90429',
            pointRadius: 5,
            pointHoverRadius: 7,
            yAxisID: 'y'
          },
          {
            label: 'Pedidos Realizados',
            data: countData,
            borderColor: 'rgba(255, 255, 255, 0.35)',
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 3,
            fill: false,
            tension: 0.2,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: { boxWidth: 14, color: '#ccc' }
          },
          tooltip: {
            backgroundColor: '#1b1b1b',
            titleColor: '#fff',
            bodyColor: '#ddd',
            borderColor: 'rgba(255,255,255,0.15)',
            borderWidth: 1,
            padding: 12,
            callbacks: {
              label: (ctx) => {
                if (ctx.datasetIndex === 0) {
                  return ` Faturamento: ${formatPrice(ctx.parsed.y)}`;
                }
                return ` Volume: ${ctx.parsed.y} pedido(s)`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false }
          },
          y: {
            type: 'linear',
            position: 'left',
            beginAtZero: true,
            ticks: {
              callback: (val) => 'R$ ' + val.toLocaleString('pt-BR')
            }
          },
          y1: {
            type: 'linear',
            position: 'right',
            beginAtZero: true,
            grid: { drawOnChartArea: false },
            ticks: {
              stepSize: 1,
              precision: 0
            }
          }
        }
      }
    });
  },

  createOrderStatusChart(m) {
    const canvas = document.getElementById('chart-order-status');
    if (!canvas) return;

    if (this._charts.status) {
      this._charts.status.destroy();
    }

    const labels = ['Pendente', 'Pago', 'Enviado', 'Cancelado'];
    const data = [m.countPending, m.countPaid, m.countSent, m.countCancelled];
    const colors = ['#f59e0b', '#10b981', '#06b6d4', '#ef4444'];

    this._charts.status = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors,
          borderColor: '#141414',
          borderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              boxWidth: 12,
              color: '#d0d0d0',
              padding: 15
            }
          },
          tooltip: {
            backgroundColor: '#1b1b1b',
            titleColor: '#fff',
            bodyColor: '#ddd',
            borderColor: 'rgba(255,255,255,0.15)',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (ctx) => {
                const total = data.reduce((a, b) => a + b, 0);
                const val = ctx.parsed;
                const pct = total > 0 ? ((val / total) * 100).toFixed(1) : '0';
                return ` ${ctx.label}: ${val} pedidos (${pct}%)`;
              }
            }
          }
        }
      }
    });
  },

  createTopProductsChart(m) {
    const canvas = document.getElementById('chart-top-products');
    if (!canvas) return;

    if (this._charts.topProducts) {
      this._charts.topProducts.destroy();
    }

    const top5 = m.abcProducts.slice(0, 5);
    const labels = top5.map(p => p.nome.length > 20 ? p.nome.substring(0, 20) + '…' : p.nome);
    const data = top5.map(p => p.revenue);

    this._charts.topProducts = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels.length ? labels : ['Nenhum produto'],
        datasets: [{
          label: 'Faturamento (R$)',
          data: data.length ? data : [0],
          backgroundColor: '#D90429',
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#1b1b1b',
            titleColor: '#fff',
            bodyColor: '#ddd',
            borderColor: 'rgba(255,255,255,0.15)',
            borderWidth: 1,
            padding: 10,
            callbacks: {
              label: (ctx) => ` Receita: ${formatPrice(ctx.parsed.x)}`
            }
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            ticks: {
              callback: (val) => 'R$ ' + val.toLocaleString('pt-BR')
            }
          },
          y: {
            grid: { display: false }
          }
        }
      }
    });
  },

  createPaymentMethodsChart(m) {
    const canvas = document.getElementById('chart-payment-methods');
    if (!canvas) return;

    if (this._charts.payments) {
      this._charts.payments.destroy();
    }

    const methodsMap = m.paymentMethods;
    const labels = Object.keys(methodsMap).map(k => k.toUpperCase());
    const data = Object.values(methodsMap);

    const palette = ['#25D366', '#00b4d8', '#a855f7', '#f59e0b'];

    this._charts.payments = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: labels.length ? labels : ['Sem vendas'],
        datasets: [{
          data: data.length ? data : [1],
          backgroundColor: labels.length ? palette.slice(0, labels.length) : ['#333'],
          borderColor: '#141414',
          borderWidth: 3,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '65%',
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, color: '#d0d0d0', padding: 15 }
          },
          tooltip: {
            backgroundColor: '#1b1b1b',
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${ctx.parsed} pedidos`
            }
          }
        }
      }
    });
  },

  createCategoryMixChart(m) {
    const canvas = document.getElementById('chart-category-mix');
    if (!canvas) return;

    if (this._charts.categories) {
      this._charts.categories.destroy();
    }

    const catMap = m.categoryRevenueMap;
    const labels = Object.keys(catMap);
    const data = Object.values(catMap);

    const colors = ['#D90429', '#00C853', '#3b82f6', '#f59e0b', '#a855f7', '#06b6d4'];

    this._charts.categories = new Chart(canvas, {
      type: 'pie',
      data: {
        labels: labels.length ? labels : ['Sem categorias'],
        datasets: [{
          data: data.length ? data : [1],
          backgroundColor: labels.length ? colors.slice(0, labels.length) : ['#333'],
          borderColor: '#141414',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 12, color: '#d0d0d0', padding: 15 }
          },
          tooltip: {
            backgroundColor: '#1b1b1b',
            callbacks: {
              label: (ctx) => ` ${ctx.label}: ${formatPrice(ctx.parsed)}`
            }
          }
        }
      }
    });
  },

  renderTables(m) {
    // 1. Tabela Curva ABC de Produtos
    const prodWrap = document.getElementById('analytics-products-table-wrap');
    if (prodWrap) {
      if (m.abcProducts.length === 0) {
        prodWrap.innerHTML = `<div class="empty-table-msg">Nenhum produto cadastrado no catálogo.</div>`;
      } else {
        prodWrap.innerHTML = `
          <table class="products-table">
            <thead><tr>
              <th style="width:50px">#</th>
              <th>Produto</th>
              <th>Categoria</th>
              <th>Curva ABC</th>
              <th>Qtd Vendida</th>
              <th>Faturamento Total</th>
              <th>Share da Receita</th>
            </tr></thead>
            <tbody>${m.abcProducts.map(p => this.productRowHTML(p)).join('')}</tbody>
          </table>`;
      }
    }

    // 2. Tabela de Clientes & Regiões
    const custWrap = document.getElementById('analytics-customers-table-wrap');
    if (custWrap) {
      if (m.sortedCustomers.length === 0) {
        custWrap.innerHTML = `<div class="empty-table-msg">Nenhum comprador registrado até o momento.</div>`;
      } else {
        custWrap.innerHTML = `
          <table class="products-table">
            <thead><tr>
              <th style="width:50px">#</th>
              <th>Cliente</th>
              <th>CPF</th>
              <th>Cidade / Região</th>
              <th>Pedidos</th>
              <th>LTV (Total Gasto)</th>
              <th>Última Compra</th>
            </tr></thead>
            <tbody>${m.sortedCustomers.map((c, idx) => this.customerRowHTML(c, idx)).join('')}</tbody>
          </table>`;
      }
    }
  },

  productRowHTML(p) {
    const normImg = p.imagem || (typeof ImageBackend !== 'undefined' ? ImageBackend.getPlaceholderSvg() : '');
    const isTop = p.rank <= 3;

    return `
      <tr>
        <td>
          <span class="rank-number ${isTop ? 'rank-number--top' : ''}">#${p.rank}</span>
        </td>
        <td>
          <div style="display:flex;align-items:center;gap:0.75rem">
            <img src="${escapeHtml(normImg)}" alt="${escapeHtml(p.nome)}" class="table-img" style="width:38px;height:38px;border-radius:6px;object-fit:cover"
              onerror="if(typeof ImageBackend!=='undefined'){ImageBackend.handleImgError(this, '${escapeHtml(p.imagem)}');}" />
            <div>
              <strong style="color:var(--text);font-size:0.9rem">${escapeHtml(p.nome)}</strong>
            </div>
          </div>
        </td>
        <td><span class="table-category">${escapeHtml(p.categoria)}</span></td>
        <td>
          <span class="curva-abc-badge curva-abc-badge--${p.classification.toLowerCase()}">
            Classe ${p.classification}
          </span>
        </td>
        <td>
          <strong>${p.qty} un.</strong>
        </td>
        <td>
          <span class="table-price">${formatPrice(p.revenue)}</span>
        </td>
        <td>
          <div class="share-cell">
            <div class="share-progress">
              <div class="share-progress-fill" style="width:${Math.min(100, p.share)}%"></div>
            </div>
            <span style="font-size:0.8rem;font-weight:700">${p.share.toFixed(1)}%</span>
          </div>
        </td>
      </tr>`;
  },

  customerRowHTML(c, idx) {
    const isTop = idx < 3;
    const dateFormatted = c.lastOrderDate ? new Date(c.lastOrderDate).toLocaleDateString('pt-BR') : '–';

    // Máscara parcial no CPF para privacidade corporativa
    let cpfMasked = c.cpf;
    if (cpfMasked && cpfMasked.length >= 6) {
      cpfMasked = cpfMasked.substring(0, 3) + '.***.***-' + cpfMasked.slice(-2);
    }

    return `
      <tr>
        <td>
          <span class="rank-number ${isTop ? 'rank-number--top' : ''}">#${idx + 1}</span>
        </td>
        <td>
          <strong style="color:var(--text)">${escapeHtml(c.nome)}</strong>
        </td>
        <td><small style="color:var(--text-muted)">${escapeHtml(cpfMasked)}</small></td>
        <td><span class="table-category">${escapeHtml(c.cidade)}</span></td>
        <td><strong>${c.ordersCount}</strong></td>
        <td><span class="table-price">${formatPrice(c.totalSpent)}</span></td>
        <td><small style="color:var(--text-muted)">${dateFormatted}</small></td>
      </tr>`;
  }
};

/* ============================================================
   5B. AdminDashboard — Ponte para renderização do painel
   ============================================================ */
const AdminDashboard = {
  render() {
    AdminAnalytics.render();
  }
};

/* ============================================================
   6. AdminProducts — lista completa
   ============================================================ */
const AdminProducts = {
  render() {
    const wrap = document.getElementById('products-table-wrap');
    if (!wrap) return;

    if (_adminProdutos.length === 0) {
      wrap.innerHTML = `
        <div class="empty-table-msg">
          <strong>Nenhum produto cadastrado ainda.</strong>
          Clique em "Novo Produto" para adicionar o primeiro.
        </div>`;
      return;
    }

    wrap.innerHTML = `
      <table class="products-table">
        <thead><tr>
          <th>Imagem</th><th>Nome</th><th>Categoria</th><th>Preço</th><th>Badge</th><th>Status</th><th>Ações</th>
        </tr></thead>
        <tbody>${_adminProdutos.map(p => this.rowHTML(p)).join('')}</tbody>
      </table>`;

    this._bindActions(wrap);
  },

  rowHTML(p) {
    const norm = (typeof ImageBackend !== 'undefined') ? ImageBackend.normalizeProduct(p) : p;
    const badgeHTML = norm.badge
      ? `<span style="background:var(--${norm.badgeTipo === 'green' ? 'green' : 'red'});color:${norm.badgeTipo === 'green' ? '#000' : '#fff'};font-size:.7rem;font-weight:800;padding:.15rem .55rem;border-radius:20px;text-transform:uppercase">${escapeHtml(norm.badge)}</span>`
      : '<span style="color:var(--text-muted);font-size:.8rem">–</span>';

    const countBadge = (norm.imagens && norm.imagens.length > 1)
      ? `<br><span class="table-img-badge" title="${norm.imagens.length} fotos cadastradas">📷 ${norm.imagens.length}</span>`
      : '';

    return `
      <tr>
        <td>
          <img src="${escapeHtml(norm.imagem || (typeof ImageBackend !== 'undefined' ? ImageBackend.getPlaceholderSvg() : ''))}" alt="${escapeHtml(norm.nome)}" class="table-img"
            onerror="if(typeof ImageBackend!=='undefined'){ImageBackend.handleImgError(this, '${escapeHtml(norm.imagem)}');}else{this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22><rect fill=%22%231a1a1a%22 width=%22100%25%22 height=%22100%25%22/></svg>';}" />
          ${countBadge}
        </td>
        <td><span class="table-name">${escapeHtml(norm.nome)}</span></td>
        <td><span class="table-category">${escapeHtml(norm.categoria)}</span></td>
        <td><span class="table-price">${formatPrice(norm.preco)}</span></td>
        <td>${badgeHTML}</td>
        <td>
          <button
            class="status-toggle-btn ${norm.ativo !== false ? 'status-active' : 'status-inactive'}"
            data-action="toggle"
            data-id="${norm.id}"
            data-ativo="${norm.ativo !== false}"
            title="${norm.ativo !== false ? 'Clique para desativar' : 'Clique para ativar'}"
          >
            ${norm.ativo !== false ? '● Ativo' : '○ Inativo'}
          </button>
        </td>
        <td>
          <div class="table-actions">
            <button class="btn-admin btn-admin--outline btn-admin--sm" data-action="edit"   data-id="${norm.id}">✏️ Editar</button>
            <button class="btn-admin btn-admin--danger  btn-admin--sm" data-action="delete" data-id="${norm.id}">🗑️ Excluir</button>
          </div>
        </td>
      </tr>`;
  },

  _bindActions(container) {
    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { action, id } = btn.dataset;
        if (action === 'edit')   { AdminNav.go('add-product'); ProductForm.loadForEdit(id); }
        if (action === 'delete') { Confirm.show(id); }
        if (action === 'toggle') {
          const currentAtivo = btn.dataset.ativo === 'true';
          try {
            await FSProducts.toggleAtivo(id, !currentAtivo);
            Toast.show(`Produto ${!currentAtivo ? 'ativado' : 'desativado'}.`, 'success');
          } catch (err) {
            Toast.show('Erro ao alterar status: ' + err.message, 'error');
          }
        }
      });
    });
  },
};

/* ============================================================
   6B. AdminOrders — visualização e gestão de pedidos & pagamentos
   ============================================================ */
const AdminOrders = {
  async render() {
    const wrap = document.getElementById('orders-table-wrap');
    if (!wrap) return;

    if (typeof API === 'undefined') {
      wrap.innerHTML = `<div class="empty-table-msg">Conecte ao backend Node.js para gerenciar pedidos.</div>`;
      return;
    }

    try {
      wrap.innerHTML = `<div style="text-align:center;padding:2rem;color:var(--text-muted)">Carregando pedidos…</div>`;
      const orders = await API.getOrders();

      if (!orders || orders.length === 0) {
        wrap.innerHTML = `
          <div class="empty-table-msg">
            <strong>Nenhum pedido recebido ainda.</strong>
            Os novos pedidos realizados pelos clientes aparecerão aqui automaticamente.
          </div>`;
        return;
      }

      wrap.innerHTML = `
        <table class="products-table">
          <thead><tr>
            <th>ID Pedido</th><th>Data</th><th>Cliente</th><th>Itens</th><th>Total</th><th>Pagamento</th><th>Status</th>
          </tr></thead>
          <tbody>${orders.map(o => this.rowHTML(o)).join('')}</tbody>
        </table>`;

      this._bindActions(wrap);
    } catch (err) {
      wrap.innerHTML = `
        <div class="empty-table-msg" style="color:var(--red)">
          ⚠️ Não foi possível carregar os pedidos: ${escapeHtml(err.message)}
        </div>`;
    }
  },

  rowHTML(o) {
    const dateStr = o.criadoEm ? new Date(o.criadoEm).toLocaleString('pt-BR') : '–';
    const itensSummary = Array.isArray(o.itens)
      ? o.itens.map(i => `${i.qty}x ${escapeHtml(i.nome)}`).join('<br>')
      : '–';

    const statusBadgeClass = {
      pago: 'status-active',
      pendente: 'status-inactive',
      enviado: 'status-active',
      cancelado: 'status-inactive'
    }[o.status] || 'status-inactive';

    const clienteInfo = o.cliente
      ? `<strong>${escapeHtml(o.cliente.nome)}</strong><br><small style="color:var(--text-muted)">CPF: ${escapeHtml(o.cliente.cpf)}<br>${escapeHtml(o.cliente.cidade || '')}</small>`
      : '–';

    return `
      <tr>
        <td><strong>${escapeHtml(o.id)}</strong></td>
        <td><small style="color:var(--text-muted)">${dateStr}</small></td>
        <td>${clienteInfo}</td>
        <td><small>${itensSummary}</small></td>
        <td><span class="table-price">${formatPrice(o.total)}</span></td>
        <td>
          <span style="text-transform:uppercase;font-size:.75rem;font-weight:700;color:var(--text-muted)">
            ${escapeHtml(o.metodoPagamento || 'WhatsApp')}
          </span>
        </td>
        <td>
          <select class="form-input form-select order-status-select" data-order-id="${escapeHtml(o.id)}" style="padding:.25rem .5rem;font-size:.8rem;height:auto">
            <option value="pendente"  ${o.status === 'pendente'  ? 'selected' : ''}>⏳ Pendente</option>
            <option value="pago"      ${o.status === 'pago'      ? 'selected' : ''}>✅ Pago</option>
            <option value="enviado"   ${o.status === 'enviado'   ? 'selected' : ''}>🚚 Enviado</option>
            <option value="cancelado" ${o.status === 'cancelado' ? 'selected' : ''}>❌ Cancelado</option>
          </select>
        </td>
      </tr>`;
  },

  _bindActions(container) {
    container.querySelectorAll('.order-status-select').forEach(sel => {
      sel.addEventListener('change', async () => {
        const orderId = sel.dataset.orderId;
        const newStatus = sel.value;
        try {
          await API.updateOrderStatus(orderId, newStatus);
          Toast.show(`Status do pedido ${orderId} atualizado para "${newStatus.toUpperCase()}"!`, 'success');
          // Sincroniza e recalcula dashboard instantaneamente
          if (typeof AdminAnalytics !== 'undefined') {
            AdminAnalytics.refresh(false);
          }
        } catch (err) {
          Toast.show('Erro ao alterar status: ' + err.message, 'error');
        }
      });
    });
  }
};

/* ============================================================
   6C. CategoryManager — Gerenciamento dinâmico de categorias
   ============================================================ */
let _adminCategorias = [];

const CategoryManager = {
  initialized: false,

  init() {
    if (this.initialized) return;
    this.initialized = true;

    // Modal Nova Categoria
    const modalOverlay = document.getElementById('category-modal-overlay');
    const modalClose   = document.getElementById('category-modal-close');
    const modalCancel  = document.getElementById('category-modal-cancel');
    const modalForm    = document.getElementById('category-modal-form');
    const modalInput   = document.getElementById('category-modal-input');
    const modalError   = document.getElementById('category-modal-error');

    // Botões que abrem o modal
    document.getElementById('btn-open-category-modal')?.addEventListener('click', () => this.openModal());
    document.getElementById('btn-quick-add-cat')?.addEventListener('click', () => this.openModal());

    modalClose?.addEventListener('click', () => this.closeModal());
    modalCancel?.addEventListener('click', () => this.closeModal());
    modalOverlay?.addEventListener('click', (e) => {
      if (e.target === modalOverlay) this.closeModal();
    });

    modalForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = modalInput?.value.trim();
      if (!nome) return;
      if (modalError) modalError.textContent = '';

      try {
        const created = await this.createCategory(nome);
        this.closeModal();
        // Se estiver no form de produto, seleciona a nova categoria
        const select = document.getElementById('prod-categoria');
        if (select && created && created.slug) {
          select.value = created.slug;
          ProductForm.updatePreview();
        }
      } catch (err) {
        if (modalError) modalError.textContent = '⚠️ ' + err.message;
      }
    });

    // Formulário inline na tela de categorias
    const inlineForm = document.getElementById('new-category-inline-form');
    const inlineInput = document.getElementById('new-cat-input-inline');
    inlineForm?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const nome = inlineInput?.value.trim();
      if (!nome) return;
      try {
        await this.createCategory(nome);
        if (inlineInput) inlineInput.value = '';
      } catch (err) {
        Toast.show('Erro ao criar categoria: ' + err.message, 'error');
      }
    });
  },

  openModal() {
    const modalOverlay = document.getElementById('category-modal-overlay');
    const modalInput   = document.getElementById('category-modal-input');
    const modalError   = document.getElementById('category-modal-error');
    if (modalError) modalError.textContent = '';
    if (modalInput) modalInput.value = '';
    modalOverlay?.classList.add('open');
    setTimeout(() => modalInput?.focus(), 100);
  },

  closeModal() {
    const modalOverlay = document.getElementById('category-modal-overlay');
    modalOverlay?.classList.remove('open');
  },

  async loadCategories() {
    try {
      if (typeof API !== 'undefined') {
        const cats = await API.getCategories();
        if (Array.isArray(cats) && cats.length > 0) {
          _adminCategorias = cats;
          this.populateSelect();
          this.renderTable();
          return cats;
        }
      }
    } catch (err) {
      console.warn('[CategoryManager] Erro ao carregar categorias do backend:', err.message);
    }

    // Fallback padrão se API indisponível
    if (_adminCategorias.length === 0) {
      _adminCategorias = [
        { id: 'cat_proteina',   nome: 'Proteínas',   slug: 'proteina',   ordem: 1 },
        { id: 'cat_pretreino',  nome: 'Pré-Treino',  slug: 'pretreino',  ordem: 2 },
        { id: 'cat_aminoacido', nome: 'Aminoácidos', slug: 'aminoacido', ordem: 3 },
        { id: 'cat_vitamina',   nome: 'Vitaminas',   slug: 'vitamina',   ordem: 4 },
        { id: 'cat_queimador',  nome: 'Queimadores', slug: 'queimador',  ordem: 5 },
        { id: 'cat_outro',      nome: 'Outros',      slug: 'outro',      ordem: 6 }
      ];
    }
    this.populateSelect();
    this.renderTable();
    return _adminCategorias;
  },

  populateSelect(selectedSlug = null) {
    const select = document.getElementById('prod-categoria');
    if (!select) return;

    const currentVal = selectedSlug || select.value;
    select.innerHTML = '<option value="" disabled selected>Selecione uma categoria…</option>';

    _adminCategorias.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.slug;
      opt.textContent = cat.nome;
      select.appendChild(opt);
    });

    if (currentVal) {
      select.value = currentVal;
    }
  },

  renderTable() {
    const wrap = document.getElementById('categories-table-wrap');
    const badge = document.getElementById('categories-count-badge');
    if (!wrap) return;

    if (badge) {
      badge.textContent = `${_adminCategorias.length} categoria(s)`;
    }

    if (_adminCategorias.length === 0) {
      wrap.innerHTML = `<div class="empty-table-msg">Nenhuma categoria cadastrada. Crie uma acima!</div>`;
      return;
    }

    const products = _adminProdutos || [];
    const countBySlug = slug => products.filter(p => p.categoria === slug).length;

    wrap.innerHTML = `
      <table class="products-table">
        <thead>
          <tr>
            <th>Nome</th>
            <th>Identificador (Slug)</th>
            <th>Produtos Vinculados</th>
            <th style="text-align:right">Ações</th>
          </tr>
        </thead>
        <tbody>
          ${_adminCategorias.map(cat => {
            const count = countBySlug(cat.slug);
            return `
              <tr>
                <td><strong>${escapeHtml(cat.nome)}</strong></td>
                <td><code style="color:var(--text-muted);font-size:.85rem">${escapeHtml(cat.slug)}</code></td>
                <td>
                  <span class="status-badge ${count > 0 ? 'status-active' : 'status-inactive'}">
                    ${count} produto(s)
                  </span>
                </td>
                <td style="text-align:right">
                  <button
                    class="btn-admin btn-admin--danger btn-admin--sm cat-del-btn"
                    data-id="${escapeHtml(cat.id)}"
                    data-slug="${escapeHtml(cat.slug)}"
                    data-nome="${escapeHtml(cat.nome)}"
                    data-count="${count}"
                    ${count > 0 ? 'title="Não pode excluir categorias com produtos vinculados"' : ''}
                  >
                    🗑️ Excluir
                  </button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    // Vincular botões de exclusão
    wrap.querySelectorAll('.cat-del-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { id, nome, count } = btn.dataset;
        if (parseInt(count, 10) > 0) {
          Toast.show(`⚠️ Não é possível excluir "${nome}" porque ela possui ${count} produto(s) vinculado(s).`, 'error');
          return;
        }
        if (!confirm(`Deseja realmente remover a categoria "${nome}"?`)) return;

        try {
          if (typeof API !== 'undefined') {
            await API.deleteCategory(id);
          }
          _adminCategorias = _adminCategorias.filter(c => c.id !== id);
          this.populateSelect();
          this.renderTable();
          Toast.show(`Categoria "${nome}" removida com sucesso!`, 'success');
        } catch (err) {
          Toast.show('Erro ao excluir categoria: ' + err.message, 'error');
        }
      });
    });
  },

  async createCategory(nome) {
    if (typeof API !== 'undefined') {
      const created = await API.addCategory(nome);
      Toast.show(`Categoria "${created.nome}" criada com sucesso! 🎉`, 'success');
      await this.loadCategories();
      return created;
    } else {
      const slug = nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
      const newCat = { id: 'cat_' + slug, nome: nome.trim(), slug: slug, ordem: _adminCategorias.length + 1 };
      _adminCategorias.push(newCat);
      this.populateSelect();
      this.renderTable();
      Toast.show(`Categoria "${nome}" criada localmente!`, 'success');
      return newCat;
    }
  }
};

/* ============================================================
   7. ProductForm — CRUD + gerenciamento individual de imagens + live preview
   ============================================================ */
const ProductForm = {
  isEditing: false,
  editId:    null,
  activePreviewIndex: 0,

  init() {
    document.getElementById('product-form')?.addEventListener('submit', e => {
      e.preventDefault();
      this.save();
    });

    // Live preview em campos de texto
    const fields = [
      'prod-nome', 'prod-categoria', 'prod-descricao',
      'prod-preco', 'prod-preco-antigo', 'prod-badge', 'prod-badge-tipo',
      'prod-estrelas', 'prod-avaliacoes'
    ];
    fields.forEach(id => {
      document.getElementById(id)?.addEventListener('input',  () => this.updatePreview());
      document.getElementById(id)?.addEventListener('change', () => this.updatePreview());
    });

    // Gerenciamento dos 8 campos individuais de imagem
    [1, 2, 3, 4, 5, 6, 7, 8].forEach(slotNum => {
      const input = document.getElementById(`prod-imagem-${slotNum}`);
      if (!input) return;

      // Evento de digitação ou alteração
      input.addEventListener('input', e => {
        const val = e.target.value.trim();
        // Se o usuário colou múltiplos links em um único input
        if (typeof ImageBackend !== 'undefined' && val) {
          const parsed = ImageBackend.parseMultipleUrls(val);
          if (parsed.length > 1) {
            this.distributeUrls(parsed, slotNum);
            Toast.show(`✨ ${parsed.length} imagens identificadas e distribuídas individualmente!`, 'info');
            return;
          }
        }
        this.updateSlotPreview(slotNum);
        this.updatePreview();
      });

      // Evento de colar (detecta múltiplos links instantaneamente)
      input.addEventListener('paste', e => {
        const pastedText = (e.clipboardData || window.clipboardData)?.getData('text');
        if (pastedText && typeof ImageBackend !== 'undefined') {
          const parsed = ImageBackend.parseMultipleUrls(pastedText);
          if (parsed.length > 1) {
            e.preventDefault();
            this.distributeUrls(parsed, slotNum);
            Toast.show(`✨ ${parsed.length} links distribuídos nos campos individuais!`, 'info');
          }
        }
      });
    });

    // Botões para limpar cada slot individualmente
    document.querySelectorAll('.slot-clear-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const slotNum = parseInt(btn.dataset.slot, 10);
        const input = document.getElementById(`prod-imagem-${slotNum}`);
        if (input) {
          input.value = '';
          this.updateSlotPreview(slotNum);
          this.updatePreview();
        }
      });
    });

    // Upload direto de imagem do computador/celular para cada um dos 8 slots
    [1, 2, 3, 4, 5, 6, 7, 8].forEach(slotNum => {
      const fileInput = document.getElementById(`prod-file-${slotNum}`);
      if (!fileInput) return;

      fileInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (file.size > 10 * 1024 * 1024) {
          Toast.show('Imagem muito grande. Limite de 10 MB.', 'error');
          fileInput.value = '';
          return;
        }

        const inputUrl = document.getElementById(`prod-imagem-${slotNum}`);
        try {
          Toast.show(`Enviando Foto ${slotNum}…`, 'info');
          let url = '';
          try {
            const res = await API.uploadImage(file);
            if (res && res.url) url = res.url;
          } catch (uploadErr) {
            console.warn('[Upload] Servidor upload retornou erro, usando fallback direto Base64:', uploadErr);
            url = await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = reject;
              reader.readAsDataURL(file);
            });
          }

          if (url) {
            if (inputUrl) inputUrl.value = url;
            this.updateSlotPreview(slotNum);
            this.updatePreview();
            Toast.show(`Foto ${slotNum} salva com sucesso! ✅`, 'success');
          }
        } catch (err) {
          console.error('[Upload]', err);
          Toast.show('Erro ao carregar foto: ' + err.message, 'error');
        } finally {
          fileInput.value = '';
        }
      });
    });

    // Painel de colar múltiplos links
    const batchToggle = document.getElementById('toggle-batch-images-btn');
    const batchClose  = document.getElementById('close-batch-images-btn');
    const batchApply  = document.getElementById('apply-batch-images-btn');
    const batchPanel  = document.getElementById('batch-images-panel');
    const batchInput  = document.getElementById('batch-images-input');

    batchToggle?.addEventListener('click', () => {
      if (batchPanel) {
        batchPanel.style.display = batchPanel.style.display === 'none' ? 'block' : 'none';
        if (batchPanel.style.display === 'block') batchInput?.focus();
      }
    });

    batchClose?.addEventListener('click', () => {
      if (batchPanel) batchPanel.style.display = 'none';
    });

    batchApply?.addEventListener('click', () => {
      const val = batchInput?.value.trim();
      if (!val) {
        Toast.show('Cole os links antes de aplicar.', 'error');
        return;
      }
      if (typeof ImageBackend !== 'undefined') {
        const parsed = ImageBackend.parseMultipleUrls(val);
        if (parsed.length === 0) {
          Toast.show('Nenhuma URL válida encontrada.', 'error');
          return;
        }
        this.distributeUrls(parsed, 1);
        if (batchInput) batchInput.value = '';
        if (batchPanel) batchPanel.style.display = 'none';
        Toast.show(`✨ ${parsed.length} links aplicados nas fotos individuais!`, 'success');
      }
    });

    this.reset();
  },

  /**
   * Distribui uma lista de URLs nos slots a partir de um slot inicial
   */
  distributeUrls(urls, startSlot = 1) {
    if (!Array.isArray(urls)) return;
    let targetSlot = startSlot;
    for (let i = 0; i < urls.length; i++) {
      if (targetSlot > 8) break;
      const input = document.getElementById(`prod-imagem-${targetSlot}`);
      if (input) {
        input.value = urls[i];
        this.updateSlotPreview(targetSlot);
      }
      targetSlot++;
    }
    this.updatePreview();
  },

  /**
   * Atualiza a caixa de preview individual de cada slot de imagem
   */
  updateSlotPreview(slotNum) {
    const input      = document.getElementById(`prod-imagem-${slotNum}`);
    const previewBox = document.getElementById(`slot-preview-${slotNum}`);
    const providerEl = document.getElementById(`slot-provider-${slotNum}`);
    if (!input || !previewBox) return;

    const rawVal = input.value.trim();
    if (!rawVal) {
      previewBox.innerHTML = '<div class="slot-preview-empty">Nenhuma imagem definida</div>';
      if (providerEl) {
        providerEl.textContent = '';
        providerEl.className = 'slot-provider';
      }
      return;
    }

    if (typeof ImageBackend === 'undefined') return;

    if (ImageBackend.isGoogleDriveFolder(rawVal)) {
      previewBox.innerHTML = `
        <div class="slot-preview-card" style="border-left:3px solid var(--red);">
          <div class="slot-preview-details">
            <span class="slot-status err">⚠️ Link de Pasta do Drive</span>
            <span class="slot-status-tip">Abra a imagem dentro da pasta, clique em Compartilhar e cole o link do arquivo individual aqui.</span>
          </div>
        </div>`;
      if (providerEl) {
        providerEl.textContent = 'Pasta Drive (Inválido)';
        providerEl.className = 'slot-provider';
      }
      return;
    }

    const normUrl  = ImageBackend.normalizeUrl(rawVal);
    const provider = ImageBackend.detectProvider(rawVal) || 'Web';

    if (providerEl) {
      providerEl.textContent = provider;
      const clsMap = {
        'Google Drive':        'gdrive',
        'Dropbox':             'dropbox',
        'Imgur':               'imgur',
        'ImgBB':               'imgbb',
        'Foto Local (Upload)': 'upload',
        'Foto Real (Arquivo)': 'upload',
      };
      providerEl.className = 'slot-provider ' + (clsMap[provider] || '');
    }

    const statusId = `slot-st-${slotNum}`;
    previewBox.innerHTML = `
      <div class="slot-preview-card">
        <img
          src="${escapeHtml(normUrl)}"
          alt="Preview Foto ${slotNum}"
          onerror="if(typeof ImageBackend!=='undefined'){ImageBackend.handleImgError(this, '${escapeHtml(normUrl)}');} const s=document.getElementById('${statusId}'); if(s){ s.textContent='⚠️ Erro ao carregar'; s.className='slot-status err'; }"
          onload="const s=document.getElementById('${statusId}'); if(s){ s.textContent='✓ Imagem pronta'; s.className='slot-status ok'; }"
        />
        <div class="slot-preview-details">
          <span class="slot-status loading" id="${statusId}">Carregando visualização…</span>
          <span class="slot-status-tip">${provider === 'Google Drive' ? 'Link do Drive compatível (verifique se está público)' : provider}</span>
        </div>
      </div>`;
  },

  getFieldValues() {
    const rawImagens = [1, 2, 3, 4, 5, 6, 7, 8]
      .map(n => document.getElementById(`prod-imagem-${n}`)?.value.trim())
      .filter(Boolean);

    // Normaliza todas as imagens via ImageBackend
    const imagens = (typeof ImageBackend !== 'undefined')
      ? rawImagens.map(u => ImageBackend.normalizeUrl(u)).filter(Boolean)
      : rawImagens;

    return {
      nome:        document.getElementById('prod-nome')?.value.trim()          || '',
      descricao:   document.getElementById('prod-descricao')?.value.trim()     || '',
      preco:       parseFloat(document.getElementById('prod-preco')?.value)    || 0,
      precoAntigo: parseFloat(document.getElementById('prod-preco-antigo')?.value) || null,
      categoria:   document.getElementById('prod-categoria')?.value            || '',
      badge:       document.getElementById('prod-badge')?.value.trim()         || '',
      badgeTipo:   document.getElementById('prod-badge-tipo')?.value           || 'red',
      estrelas:    parseInt(document.getElementById('prod-estrelas')?.value)   || 5,
      avaliacoes:  parseInt(document.getElementById('prod-avaliacoes')?.value) || 0,
      imagem:      imagens[0] || '',   // campo principal (retrocompatível)
      imagens:     imagens,            // array com até 8 imagens individuais normalizadas
    };
  },

  validate(data) {
    if (!data.nome)                   return 'Preencha o nome do produto.';
    if (!data.categoria)              return 'Selecione uma categoria.';
    if (!data.descricao)              return 'Preencha a descrição.';
    if (!data.preco || data.preco<=0) return 'Informe um preço válido.';
    if (!data.imagem)                 return 'Adicione pelo menos o link da Imagem 1 (principal).';
    return null;
  },

  async save() {
    const errEl   = document.getElementById('form-error');
    const saveBtn = document.getElementById('save-product-btn');

    if (errEl)   errEl.textContent = '';
    const data   = this.getFieldValues();
    const error  = this.validate(data);

    if (error) { if (errEl) errEl.textContent = '⚠️ ' + error; return; }

    // Loading state
    if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = 'Salvando…'; }

    try {
      const productData = { ...data };
      if (!productData.imagem) throw new Error('Adicione pelo menos a Imagem 1.');

      if (this.isEditing && this.editId) {
        await FSProducts.update(this.editId, productData);
        Toast.show('Produto atualizado com sucesso! ✅', 'success');
      } else {
        await FSProducts.add(productData);
        Toast.show('Produto adicionado com sucesso! ✅', 'success');
      }

      this.reset();
      AdminNav.go('products');

    } catch (err) {
      console.error('[ProductForm.save]', err);
      if (errEl) errEl.textContent = '❌ ' + err.message;
    } finally {
      if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = 'Salvar Produto'; }
    }
  },

  loadForEdit(id) {
    const p = FSProducts.getById(id);
    if (!p) return;

    this.isEditing = true;
    this.editId    = id;
    this.activePreviewIndex = 0;

    const set = (fieldId, val) => {
      const el = document.getElementById(fieldId);
      if (el) el.value = val ?? '';
    };

    set('prod-nome',         p.nome);
    set('prod-categoria',    p.categoria);
    set('prod-descricao',    p.descricao);
    set('prod-preco',        p.preco);
    set('prod-preco-antigo', p.precoAntigo || '');
    set('prod-badge',        p.badge       || '');
    set('prod-badge-tipo',   p.badgeTipo   || 'red');
    set('prod-estrelas',     p.estrelas    || 5);
    set('prod-avaliacoes',   p.avaliacoes  || 0);

    // Carregar e normalizar imagens (até 8 imagens)
    const norm = (typeof ImageBackend !== 'undefined') ? ImageBackend.normalizeProduct(p) : p;
    const imagens = Array.isArray(norm.imagens) && norm.imagens.length ? norm.imagens : (norm.imagem ? [norm.imagem] : []);

    for (let i = 1; i <= 8; i++) {
      set(`prod-imagem-${i}`, imagens[i - 1] || '');
      this.updateSlotPreview(i);
    }

    const titleEl    = document.getElementById('form-view-title');
    const subtitleEl = document.getElementById('form-view-subtitle');
    const topbarEl   = document.getElementById('topbar-title');
    if (titleEl)    titleEl.textContent    = 'Editar Produto';
    if (subtitleEl) subtitleEl.textContent = `Editando: ${p.nome}`;
    if (topbarEl)   topbarEl.textContent   = 'Editar Produto';

    this.updatePreview();
  },

  cancelEdit() { this.reset(); AdminNav.go('products'); },

  reset() {
    this.isEditing = false;
    this.editId    = null;
    this.activePreviewIndex = 0;

    document.getElementById('product-form')?.reset();

    // Reset de todos os 8 campos de imagem e previews individuais
    for (let i = 1; i <= 8; i++) {
      const el = document.getElementById(`prod-imagem-${i}`);
      if (el) el.value = '';
      this.updateSlotPreview(i);
    }

    const titleEl    = document.getElementById('form-view-title');
    const subtitleEl = document.getElementById('form-view-subtitle');
    if (titleEl)    titleEl.textContent    = 'Novo Produto';
    if (subtitleEl) subtitleEl.textContent = 'Preencha os campos abaixo e clique em Salvar.';

    const errEl = document.getElementById('form-error');
    if (errEl) errEl.textContent = '';

    this.updatePreview();
  },

  updatePreview() {
    const wrap = document.getElementById('product-preview');
    if (!wrap) return;

    const d       = this.getFieldValues();
    const imagens = d.imagens || [];

    if (!d.nome && imagens.length === 0) {
      wrap.innerHTML = `<div style="color:var(--text-muted);font-size:.85rem;text-align:center;padding:1.5rem 0">Preencha o formulário para ver o preview.</div>`;
      return;
    }

    const badgeColor = d.badgeTipo === 'green' ? 'var(--green)' : 'var(--red)';
    const badgeText  = d.badgeTipo === 'green' ? '#000'         : '#fff';

    // Garante que o índice ativo seja válido
    if (this.activePreviewIndex >= imagens.length) {
      this.activePreviewIndex = 0;
    }
    const activeUrl = imagens[this.activePreviewIndex] || imagens[0] || '';
    const placeholder = (typeof ImageBackend !== 'undefined') ? ImageBackend.getPlaceholderSvg() : '';

    // Miniaturas para navegação entre fotos no preview
    const thumbsHTML = imagens.length > 1 ? `
      <div class="preview-thumbs-row">
        ${imagens.map((url, idx) => `
          <div class="preview-thumb-item ${idx === this.activePreviewIndex ? 'active' : ''}" data-idx="${idx}" title="Ver foto ${idx + 1}">
            <img src="${escapeHtml(url)}" alt="Thumb ${idx + 1}"
              onerror="if(typeof ImageBackend!=='undefined'){ImageBackend.handleImgError(this, '${escapeHtml(url)}');}" />
          </div>
        `).join('')}
      </div>` : '';

    wrap.innerHTML = `
      <div class="preview-product-card">
        <div style="position:relative">
          ${d.badge ? `<div style="position:absolute;top:.6rem;left:.6rem;background:${badgeColor};color:${badgeText};font-size:.7rem;font-weight:800;padding:.15rem .5rem;border-radius:20px;letter-spacing:.07em;text-transform:uppercase;z-index:2">${escapeHtml(d.badge)}</div>` : ''}
          ${imagens.length > 1 ? `<div style="position:absolute;bottom:.6rem;right:.6rem;background:rgba(0,0,0,0.7);color:#fff;font-size:.68rem;font-weight:700;padding:.2rem .5rem;border-radius:4px;z-index:2">Foto ${this.activePreviewIndex + 1} de ${imagens.length}</div>` : ''}
          <img
            src="${escapeHtml(activeUrl || placeholder)}"
            style="width:100%;height:160px;object-fit:cover;display:block"
            onerror="if(typeof ImageBackend!=='undefined'){ImageBackend.handleImgError(this, '${escapeHtml(activeUrl)}');}else{this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22320%22 height=%22160%22><rect fill=%22%231a1a1a%22 width=%22320%22 height=%22160%22/></svg>';}"
          />
        </div>
        ${thumbsHTML}
        <div class="preview-product-info">
          <div class="preview-product-cat">${escapeHtml(d.categoria || 'categoria')}</div>
          <div class="preview-product-name">${escapeHtml(d.nome || 'Nome do produto')}</div>
          <div class="preview-product-desc">${escapeHtml((d.descricao || '').substring(0,80))}${d.descricao?.length > 80 ? '…' : ''}</div>
          ${d.precoAntigo ? `<div class="preview-product-old">${formatPrice(d.precoAntigo)}</div>` : ''}
          <div class="preview-product-price">${d.preco ? formatPrice(d.preco) : 'R$ 0,00'}</div>
        </div>
      </div>`;

    // Bind click nos seletores de miniatura do preview
    wrap.querySelectorAll('.preview-thumb-item').forEach(thumb => {
      thumb.addEventListener('click', () => {
        this.activePreviewIndex = parseInt(thumb.dataset.idx, 10);
        this.updatePreview();
      });
    });
  },
};

/* ============================================================
   8. CONFIRM DIALOG — Exclusão
   ============================================================ */
const Confirm = {
  pendingId: null,

  init() {
    document.getElementById('confirm-cancel-btn')?.addEventListener('click', () => this.hide());
    document.getElementById('confirm-ok-btn')?.addEventListener('click',     () => this.confirm());
    document.getElementById('confirm-overlay')?.addEventListener('click', (e) => {
      if (e.target === document.getElementById('confirm-overlay')) this.hide();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (document.getElementById('confirm-overlay')?.classList.contains('open')) this.hide();
      }
    });
  },

  show(productId) {
    const p = FSProducts.getById(productId);
    if (!p) return;

    this.pendingId = productId;
    const msgEl    = document.getElementById('confirm-msg');
    if (msgEl) msgEl.textContent = `Deseja excluir "${p.nome}" permanentemente? Esta ação não pode ser desfeita.`;
    document.getElementById('confirm-overlay')?.classList.add('open');
  },

  hide() {
    document.getElementById('confirm-overlay')?.classList.remove('open');
    this.pendingId = null;
  },

  async confirm() {
    if (!this.pendingId) return;
    const id = this.pendingId;
    this.hide();

    try {
      await FSProducts.delete(id);
      Toast.show('Produto excluído com sucesso.', 'error');
    } catch (err) {
      Toast.show('Erro ao excluir: ' + err.message, 'error');
    }
  },
};

/* ============================================================
   9. TOAST — Notificações
   ============================================================ */
const Toast = {
  _timeout: null,

  show(msg, type = 'success') {
    const toast  = document.getElementById('admin-toast');
    const textEl = document.getElementById('admin-toast-text');
    const iconEl = document.getElementById('admin-toast-icon');
    if (!toast) return;

    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    if (textEl) textEl.textContent = msg;
    if (iconEl) iconEl.textContent = icons[type] || '✓';

    toast.className = `admin-toast show ${type}`;
    clearTimeout(this._timeout);
    this._timeout = setTimeout(() => toast.classList.remove('show'), 3500);
  },
};

/* ============================================================
   10. RESPONSIVE SIDEBAR
   ============================================================ */
function initResponsiveSidebar() {
  const hamburger = document.getElementById('topbar-hamburger');
  const sidebar   = document.getElementById('admin-sidebar');

  hamburger?.addEventListener('click', () => sidebar?.classList.toggle('open'));

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
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  Auth.init();
  AdminNav.init();
  AdminAnalytics.init();
  CategoryManager.init();
  CategoryManager.loadCategories();
  ProductForm.init();
  Confirm.init();
  initResponsiveSidebar();

  console.log('%c🦍 Nova Era Nutrition | Admin & BI Analytics carregado', 'color:#D90429;font-weight:bold;font-size:13px');
});
