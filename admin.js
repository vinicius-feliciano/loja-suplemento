/**
 * Nova Era Nutrition — admin.js  (PAINEL ADMINISTRATIVO)
 * ═══════════════════════════════════════════════════════
 * Backend: Firebase Auth + Firestore + Storage
 *
 * Módulos:
 *  1. Auth      — Firebase Email/Password
 *  2. FSProducts — Firestore CRUD
 *  3. ImageUpload — Firebase Storage + progress
 *  4. AdminNav  — troca de views
 *  5. AdminDashboard — stats + tabela preview
 *  6. AdminProducts  — lista completa
 *  7. ProductForm    — form CRUD + live preview
 *  8. Confirm Dialog — exclusão com confirmação
 *  9. Toast          — notificações
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
    // Observer de estado — ponto central de autenticação
    auth.onAuthStateChanged(user => {
      if (user) {
        this._onLoggedIn(user);
      } else {
        this._onLoggedOut();
      }
    });

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
      await auth.signInWithEmailAndPassword(email, pass);
      // onAuthStateChanged cuida do redirecionamento
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
    try {
      await auth.signOut();
    } catch (e) {
      console.error('Logout error:', e);
    }
  },

  _startProductsListener() {
    if (_produtosListener) return;

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
      _produtosListener();
      _produtosListener = null;
    }
    _adminProdutos = [];
  },
};

/* ============================================================
   2. FIRESTORE — CRUD de Produtos
   ============================================================ */
const FSProducts = {
  async add(data) {
    const docRef = await db.collection('produtos').add({
      ...data,
      ativo:     true,
      criadoEm:  firebase.firestore.FieldValue.serverTimestamp(),
    });
    return docRef.id;
  },

  async update(id, data) {
    await db.collection('produtos').doc(id).update({
      ...data,
      atualizadoEm: firebase.firestore.FieldValue.serverTimestamp(),
    });
  },

  async delete(id) {
    await db.collection('produtos').doc(id).delete();
  },

  async toggleAtivo(id, ativo) {
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
      'add-product': ProductForm.isEditing ? 'Editar Produto' : 'Novo Produto',
    };

    const topbar = document.getElementById('topbar-title');
    if (topbar) topbar.textContent = TITLES[viewName] || '';

    this.current = viewName;

    if (viewName === 'dashboard')    AdminDashboard.render();
    if (viewName === 'products')     AdminProducts.render();
    if (viewName === 'add-product' && !ProductForm.isEditing) ProductForm.reset();

    // Fechar sidebar no mobile
    if (window.innerWidth < 769) {
      document.getElementById('admin-sidebar')?.classList.remove('open');
    }
  },
};

/* ============================================================
   5. AdminDashboard — stats + tabela preview
   ============================================================ */
const AdminDashboard = {
  render() {
    const products   = _adminProdutos;
    const byCategory = cat => products.filter(p => p.categoria === cat).length;
    const set        = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    set('stat-count',            products.length);
    set('stat-proteina-count',   byCategory('proteina'));
    set('stat-pretreino-count',  byCategory('pretreino'));
    set('stat-aminoacido-count', byCategory('aminoacido'));

    const wrap = document.getElementById('dashboard-table-wrap');
    if (!wrap) return;

    const recent = [...products].slice(0, 5);

    if (recent.length === 0) {
      wrap.innerHTML = `
        <div class="empty-table-msg">
          <strong>Nenhum produto cadastrado.</strong>
          Clique em "Novo Produto" para começar.
        </div>`;
      return;
    }

    wrap.innerHTML = `
      <table class="products-table">
        <thead><tr>
          <th>Imagem</th><th>Nome</th><th>Categoria</th><th>Preço</th><th>Status</th><th>Ações</th>
        </tr></thead>
        <tbody>${recent.map(p => this.rowHTML(p)).join('')}</tbody>
      </table>`;

    this._bindActions(wrap);
  },

  rowHTML(p) {
    return `
      <tr>
        <td><img src="${escapeHtml(p.imagem)}" alt="${escapeHtml(p.nome)}" class="table-img"
          onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22><rect fill=%22%231a1a1a%22 width=%22100%25%22 height=%22100%25%22/></svg>'" /></td>
        <td><span class="table-name">${escapeHtml(p.nome)}</span></td>
        <td><span class="table-category">${escapeHtml(p.categoria)}</span></td>
        <td><span class="table-price">${formatPrice(p.preco)}</span></td>
        <td>
          <span class="status-badge ${p.ativo !== false ? 'status-active' : 'status-inactive'}">
            ${p.ativo !== false ? '● Ativo' : '○ Inativo'}
          </span>
        </td>
        <td>
          <div class="table-actions">
            <button class="btn-admin btn-admin--outline btn-admin--sm" data-action="edit"   data-id="${p.id}">✏️ Editar</button>
            <button class="btn-admin btn-admin--danger  btn-admin--sm" data-action="delete" data-id="${p.id}">🗑️ Excluir</button>
          </div>
        </td>
      </tr>`;
  },

  _bindActions(container) {
    container.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', () => {
        const { action, id } = btn.dataset;
        if (action === 'edit')   { AdminNav.go('add-product'); ProductForm.loadForEdit(id); }
        if (action === 'delete') { Confirm.show(id); }
      });
    });
  },
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
    const badgeHTML = p.badge
      ? `<span style="background:var(--${p.badgeTipo === 'green' ? 'green' : 'red'});color:${p.badgeTipo === 'green' ? '#000' : '#fff'};font-size:.7rem;font-weight:800;padding:.15rem .55rem;border-radius:20px;text-transform:uppercase">${escapeHtml(p.badge)}</span>`
      : '<span style="color:var(--text-muted);font-size:.8rem">–</span>';

    return `
      <tr>
        <td><img src="${escapeHtml(p.imagem)}" alt="${escapeHtml(p.nome)}" class="table-img"
          onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2248%22 height=%2248%22><rect fill=%22%231a1a1a%22 width=%22100%25%22 height=%22100%25%22/></svg>'" /></td>
        <td><span class="table-name">${escapeHtml(p.nome)}</span></td>
        <td><span class="table-category">${escapeHtml(p.categoria)}</span></td>
        <td><span class="table-price">${formatPrice(p.preco)}</span></td>
        <td>${badgeHTML}</td>
        <td>
          <button
            class="status-toggle-btn ${p.ativo !== false ? 'status-active' : 'status-inactive'}"
            data-action="toggle"
            data-id="${p.id}"
            data-ativo="${p.ativo !== false}"
            title="${p.ativo !== false ? 'Clique para desativar' : 'Clique para ativar'}"
          >
            ${p.ativo !== false ? '● Ativo' : '○ Inativo'}
          </button>
        </td>
        <td>
          <div class="table-actions">
            <button class="btn-admin btn-admin--outline btn-admin--sm" data-action="edit"   data-id="${p.id}">✏️ Editar</button>
            <button class="btn-admin btn-admin--danger  btn-admin--sm" data-action="delete" data-id="${p.id}">🗑️ Excluir</button>
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
   7. ProductForm — CRUD + upload de imagem + live preview
   ============================================================ */
const ProductForm = {
  isEditing: false,
  editId:    null,

  init() {
    document.getElementById('product-form')?.addEventListener('submit', e => {
      e.preventDefault();
      this.save();
    });

    // Live preview em qualquer mudança de campo
    const fields = [
      'prod-nome', 'prod-categoria', 'prod-descricao',
      'prod-preco', 'prod-preco-antigo', 'prod-badge', 'prod-badge-tipo',
      'prod-imagem-url',
    ];
    fields.forEach(id => {
      document.getElementById(id)?.addEventListener('input',  () => this.updatePreview());
      document.getElementById(id)?.addEventListener('change', () => this.updatePreview());
    });

    ImageUpload.init();
    this.reset();
  },

  getFieldValues() {
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
    };
  },

  validate(data) {
    if (!data.nome)                   return 'Preencha o nome do produto.';
    if (!data.categoria)              return 'Selecione uma categoria.';
    if (!data.descricao)              return 'Preencha a descrição.';
    if (!data.preco || data.preco<=0) return 'Informe um preço válido.';
    // Imagem: pode ser URL ou arquivo selecionado
    const hasUrl  = !!document.getElementById('prod-imagem-url')?.value.trim();
    const hasFile = !!ImageUpload.currentFile;
    if (!hasUrl && !hasFile) return 'Forneça a URL ou selecione um arquivo de imagem.';
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
      let imageUrl = document.getElementById('prod-imagem-url')?.value.trim() || '';

      if (ImageUpload.currentFile) {
        // Upload para o Storage
        const tempId = this.editId || generateTempId();
        const uploadedUrl = await ImageUpload.upload(tempId);
        if (!uploadedUrl) throw new Error('Falha no upload da imagem. Tente novamente.');
        imageUrl = uploadedUrl;
      }

      if (!imageUrl) throw new Error('Imagem obrigatória.');

      const productData = { ...data, imagem: imageUrl };

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

    // Imagem atual como URL
    ImageUpload.setMode('url');
    set('prod-imagem-url', p.imagem || '');

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

    document.getElementById('product-form')?.reset();
    ImageUpload.reset();

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

    const d        = this.getFieldValues();
    const imageUrl = ImageUpload.getPreviewUrl();

    if (!d.nome && !imageUrl) {
      wrap.innerHTML = `<div style="color:var(--text-muted);font-size:.85rem;text-align:center;padding:1.5rem 0">Preencha o formulário para ver o preview.</div>`;
      return;
    }

    const badgeColor = d.badgeTipo === 'green' ? 'var(--green)' : 'var(--red)';
    const badgeText  = d.badgeTipo === 'green' ? '#000'         : '#fff';

    wrap.innerHTML = `
      <div class="preview-product-card">
        <div style="position:relative">
          ${d.badge ? `<div style="position:absolute;top:.6rem;left:.6rem;background:${badgeColor};color:${badgeText};font-size:.7rem;font-weight:800;padding:.15rem .5rem;border-radius:20px;letter-spacing:.07em;text-transform:uppercase;z-index:2">${escapeHtml(d.badge)}</div>` : ''}
          <img
            src="${escapeHtml(imageUrl || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22320%22 height=%22180%22><rect fill=%22%231a1a1a%22 width=%22320%22 height=%22180%22/><text x=%2250%25%22 y=%2250%25%22 fill=%22%23444%22 text-anchor=%22middle%22 dy=%22.3em%22 font-size=%2214%22>Sem imagem</text></svg>')}"
            style="width:100%;height:160px;object-fit:cover;display:block"
            onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22320%22 height=%22160%22><rect fill=%22%231a1a1a%22 width=%22320%22 height=%22160%22/></svg>'"
          />
        </div>
        <div class="preview-product-info">
          <div class="preview-product-cat">${escapeHtml(d.categoria || 'categoria')}</div>
          <div class="preview-product-name">${escapeHtml(d.nome || 'Nome do produto')}</div>
          <div class="preview-product-desc">${escapeHtml((d.descricao || '').substring(0,80))}${d.descricao?.length > 80 ? '…' : ''}</div>
          ${d.precoAntigo ? `<div class="preview-product-old">${formatPrice(d.precoAntigo)}</div>` : ''}
          <div class="preview-product-price">${d.preco ? formatPrice(d.preco) : 'R$ 0,00'}</div>
        </div>
      </div>`;
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
  ProductForm.init();
  Confirm.init();
  initResponsiveSidebar();

  console.log('%c🦍 Nova Era Nutrition | Admin Firebase carregado', 'color:#D90429;font-weight:bold;font-size:13px');
});
