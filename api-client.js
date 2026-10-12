/**
 * Nova Era Nutrition — API Client
 * ═══════════════════════════════
 * Camada de comunicação unificada com o backend Node.js (SQL).
 * Comunica-se com os endpoints REST em /api/...
 */

const API = {
  baseUrl: '',

  // Token administrativo persistido no sessionStorage
  getToken() {
    return sessionStorage.getItem('novaera_admin_token') || '';
  },

  setToken(token) {
    if (token) {
      sessionStorage.setItem('novaera_admin_token', token);
    } else {
      sessionStorage.removeItem('novaera_admin_token');
    }
  },

  // Token do Cliente persistido no localStorage (login persistente)
  getCustomerToken() {
    return localStorage.getItem('novaera_customer_token') || '';
  },

  setCustomerToken(token) {
    if (token) {
      localStorage.setItem('novaera_customer_token', token);
    } else {
      localStorage.removeItem('novaera_customer_token');
    }
  },

  getHeaders(includeAdminAuth = false, includeCustomerAuth = false) {
    const headers = { 'Content-Type': 'application/json' };
    if (includeAdminAuth) {
      const token = this.getToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    if (includeCustomerAuth) {
      const token = this.getCustomerToken();
      if (token) headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  },

  // ──────────────────────────────────────────────
  // 1. AUTENTICAÇÃO DO CLIENTE (Minha Conta)
  // ──────────────────────────────────────────────
  async customerRegister(data) {
    const res = await fetch('/api/auth/customer/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Erro ao criar conta.');
    if (json.token) this.setCustomerToken(json.token);
    return json;
  },

  async customerLogin(email, password) {
    const res = await fetch('/api/auth/customer/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'E-mail ou senha incorretos.');
    if (json.token) this.setCustomerToken(json.token);
    return json;
  },

  async customerGoogleLogin(payload) {
    const res = await fetch('/api/auth/customer/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Erro no login com Google.');
    if (json.token) this.setCustomerToken(json.token);
    return json;
  },

  async getCustomerProfile() {
    const token = this.getCustomerToken();
    if (!token) return null;
    const res = await fetch('/api/auth/customer/me', {
      headers: this.getHeaders(false, true)
    });
    if (!res.ok) {
      this.setCustomerToken(null);
      return null;
    }
    const json = await res.json();
    return json.user;
  },

  async updateCustomerProfile(data) {
    const res = await fetch('/api/auth/customer/me', {
      method: 'PUT',
      headers: this.getHeaders(false, true),
      body: JSON.stringify(data)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Erro ao atualizar perfil.');
    return json.user;
  },

  customerLogout() {
    this.setCustomerToken(null);
  },

  // ──────────────────────────────────────────────
  // 2. PRODUTOS (SQL)
  // ──────────────────────────────────────────────
  async getProducts(params = {}) {
    const query = new URLSearchParams(params).toString();
    const url = `/api/products${query ? '?' + query : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Falha ao buscar produtos da API.');
    return await res.json();
  },

  async getProductById(id) {
    const res = await fetch(`/api/products/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error('Produto não encontrado.');
    return await res.json();
  },

  async uploadImage(file) {
    const formData = new FormData();
    formData.append('imagem', file);

    const token = this.getToken();
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: headers,
      body: formData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao fazer upload da imagem.');
    }

    return await res.json();
  },

  async addProduct(productData) {
    const res = await fetch('/api/products', {
      method: 'POST',
      headers: this.getHeaders(true, false),
      body: JSON.stringify(productData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao cadastrar produto.');
    }
    return await res.json();
  },

  async updateProduct(id, productData) {
    const res = await fetch(`/api/products/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: this.getHeaders(true, false),
      body: JSON.stringify(productData)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao atualizar produto.');
    }
    return await res.json();
  },

  async toggleProductAtivo(id, ativo) {
    const res = await fetch(`/api/products/${encodeURIComponent(id)}/toggle`, {
      method: 'PATCH',
      headers: this.getHeaders(true, false),
      body: JSON.stringify({ ativo })
    });
    if (!res.ok) throw new Error('Erro ao alterar status do produto.');
    return await res.json();
  },

  async deleteProduct(id) {
    const res = await fetch(`/api/products/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.getHeaders(true, false)
    });
    if (!res.ok) throw new Error('Erro ao remover produto.');
    return await res.json();
  },

  // ──────────────────────────────────────────────
  // 2B. CATEGORIAS (SQL)
  // ──────────────────────────────────────────────
  async getCategories() {
    const res = await fetch('/api/categories');
    if (!res.ok) throw new Error('Falha ao carregar categorias.');
    return await res.json();
  },

  async addCategory(nome) {
    const res = await fetch('/api/categories', {
      method: 'POST',
      headers: this.getHeaders(true, false),
      body: JSON.stringify({ nome })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Erro ao adicionar categoria.');
    return json;
  },

  async deleteCategory(id) {
    const res = await fetch(`/api/categories/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.getHeaders(true, false)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Erro ao remover categoria.');
    return json;
  },

  // ──────────────────────────────────────────────
  // 3. PEDIDOS & CHECKOUT
  // ──────────────────────────────────────────────
  async createOrder(orderPayload) {
    const res = await fetch('/api/checkout/orders', {
      method: 'POST',
      headers: this.getHeaders(false, true),
      body: JSON.stringify(orderPayload)
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || 'Erro ao registrar pedido.');
    }
    return json;
  },

  async getOrders() {
    const res = await fetch('/api/orders', {
      headers: this.getHeaders(true, false)
    });
    if (!res.ok) throw new Error('Falha ao carregar pedidos.');
    return await res.json();
  },

  async getCustomerOrders() {
    const res = await fetch('/api/customer/orders', {
      headers: this.getHeaders(false, true)
    });
    if (!res.ok) throw new Error('Falha ao carregar pedidos do cliente.');
    return await res.json();
  },

  async updateOrderStatus(orderId, status) {
    const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}/status`, {
      method: 'PATCH',
      headers: this.getHeaders(true, false),
      body: JSON.stringify({ status })
    });
    if (!res.ok) throw new Error('Erro ao atualizar status do pedido.');
    return await res.json();
  },

  // ──────────────────────────────────────────────
  // 4. PAGAMENTOS (PIX / MERCADO PAGO)
  // ──────────────────────────────────────────────
  async generatePix(orderId) {
    const res = await fetch('/api/payments/pix', {
      method: 'POST',
      headers: this.getHeaders(false, true),
      body: JSON.stringify({ orderId })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao gerar PIX.');
    }
    return await res.json();
  },

  async createMercadoPagoPreference(orderId) {
    const res = await fetch('/api/payments/mercadopago/preference', {
      method: 'POST',
      headers: this.getHeaders(false, true),
      body: JSON.stringify({ orderId })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Erro ao gerar pagamento no Mercado Pago.');
    }
    return await res.json();
  },

  // ──────────────────────────────────────────────
  // 5. CONFIGURAÇÃO DA LOJA
  // ──────────────────────────────────────────────
  async getConfig() {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Erro ao carregar configurações.');
    return await res.json();
  },

  // ──────────────────────────────────────────────
  // 6. AUTH ADMIN
  // ──────────────────────────────────────────────
  async login(email, password) {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: this.getHeaders(false, false),
      body: JSON.stringify({ email, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || 'Credenciais inválidas.');
    }
    const data = await res.json();
    this.setToken(data.token);
    return data;
  },

  logout() {
    this.setToken(null);
  }
};
