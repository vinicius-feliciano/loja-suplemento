/**
 * Nova Era Nutrition — Servidor Backend Node.js
 * ══════════════════════════════════════════════
 * Banco de Dados 100% na Nuvem: MongoDB Atlas via Mongoose
 * 
 * Funcionalidades:
 *  - Catálogo de produtos (CRUD completo)
 *  - Autenticação de clientes (Cadastro, Login com bcryptjs + JWT, Google Sign-In)
 *  - Checkout seguro e pedidos vinculados aos clientes
 *  - Integração para meios de pagamento (Mercado Pago, PIX, Webhooks)
 *  - Autenticação administrativa
 *  - Servir arquivos frontend e uploads de imagens
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Tenta carregar dotenv se disponível
try {
  require('dotenv').config();
} catch (_) {}

// Importa módulo MongoDB Atlas
const mongo = require('./mongoose-db');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'novaera_customer_jwt_secret_2026_supersecure';

// Diretórios locais
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Configuração do Multer para Uploads no Disco Local
const storageConfig = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const safeName = 'prod_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex') + ext;
    cb(null, safeName);
  }
});

const upload = multer({
  storage: storageConfig,
  limits: { fileSize: 10 * 1024 * 1024 }, // Limite de 10 MB por imagem
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas arquivos de imagem são permitidos.'));
    }
  }
});

// Desativa cabeçalho do Express por segurança
app.disable('x-powered-by');

// Cabeçalhos de Segurança HTTP (Hardening)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Bloqueio de Segurança para Arquivos Sensíveis do Backend
app.use((req, res, next) => {
  const normalizedPath = req.path.toLowerCase();
  
  // Bloqueia qualquer arquivo ou pasta oculta (.env, .git, etc.)
  if (req.path.startsWith('/.') || req.path.includes('/.')) {
    return res.status(403).json({ error: 'Acesso negado.' });
  }

  // Bloqueia acesso a arquivos de código do servidor, dados privados e scripts
  const blockedFiles = [
    '/server.js',
    '/mongoose-db.js',
    '/package.json',
    '/package-lock.json',
    '/iniciar-servidor.bat',
    '/data'
  ];

  if (blockedFiles.some(blocked => normalizedPath === blocked || normalizedPath.startsWith(blocked + '/'))) {
    return res.status(403).json({ error: 'Acesso negado a arquivos internos do servidor.' });
  }

  next();
});

// Servir arquivos enviados e arquivos estáticos públicos do site
app.use('/uploads', express.static(UPLOADS_DIR));
app.use(express.static(path.join(__dirname), { dotfiles: 'deny' }));

// ──────────────────────────────────────────────
// ROTA DE UPLOAD DE ARQUIVOS DE IMAGEM
// ──────────────────────────────────────────────
app.post('/api/upload', upload.single('imagem'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo de imagem recebido.' });
  }

  const fileUrl = `/uploads/${req.file.filename}`;
  res.json({
    success: true,
    url: fileUrl,
    filename: req.file.filename,
    size: req.file.size
  });
});

// Middleware de Autenticação Admin
function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  const expectedToken = process.env.ADMIN_TOKEN || 'novaera_secret_admin_token_2026';
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Acesso não autorizado. Token ausente.' });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token || !expectedToken || token !== expectedToken) {
    return res.status(403).json({ error: 'Token de administração inválido.' });
  }

  next();
}

// Middleware de Autenticação de Cliente (JWT)
async function requireCustomerAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).json({ error: 'Faça login na sua conta para continuar.' });
  }

  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await mongo.User.findOne({ id: decoded.id }).lean();
    if (!user) {
      return res.status(401).json({ error: 'Usuário não encontrado.' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Sessão expirada ou inválida. Por favor, entre novamente.' });
  }
}

// Helper para gerar token JWT do cliente
function generateCustomerToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

// ──────────────────────────────────────────────
// 1. ROTAS DE AUTENTICAÇÃO DO CLIENTE (MONGODB ATLAS)
// ──────────────────────────────────────────────

// Registro / Cadastro de Cliente
app.post('/api/auth/customer/register', async (req, res) => {
  const { name, email, password, phone, cpf, address, city, cep } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();
  if (!cleanEmail.includes('@') || cleanEmail.length < 5) {
    return res.status(400).json({ error: 'Por favor, insira um e-mail válido.' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'A senha deve conter pelo menos 6 caracteres.' });
  }

  try {
    const existing = await mongo.User.findOne({ email: cleanEmail });
    if (existing) {
      return res.status(400).json({ error: 'Já existe uma conta cadastrada com este e-mail. Faça login!' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const userId = 'usr_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');

    const newUser = await mongo.User.create({
      id: userId,
      name: String(name).trim(),
      email: cleanEmail,
      password_hash: passwordHash,
      provider: 'local',
      phone: phone ? String(phone).trim() : '',
      cpf: cpf ? String(cpf).trim() : '',
      address: address ? String(address).trim() : '',
      city: city ? String(city).trim() : '',
      cep: cep ? String(cep).trim() : '',
      avatar: null
    });

    const userObj = {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      phone: newUser.phone,
      cpf: newUser.cpf,
      address: newUser.address,
      city: newUser.city,
      cep: newUser.cep,
      avatar: newUser.avatar
    };

    const token = generateCustomerToken(userObj);
    return res.status(201).json({ success: true, token, user: userObj });
  } catch (err) {
    console.error('Erro ao registrar usuário:', err);
    res.status(500).json({ error: 'Erro interno ao criar conta: ' + err.message });
  }
});

// Login do Cliente (Email + Senha)
app.post('/api/auth/customer/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Preencha seu e-mail e senha.' });
  }

  const cleanEmail = String(email).trim().toLowerCase();

  try {
    const user = await mongo.User.findOne({ email: cleanEmail }).lean();
    if (!user) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    if (!user.password_hash) {
      return res.status(400).json({
        error: 'Esta conta foi criada com o Google. Por favor, clique em "Entrar com o Google".'
      });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'E-mail ou senha inválidos.' });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      cpf: user.cpf || '',
      address: user.address || '',
      city: user.city || '',
      cep: user.cep || '',
      avatar: user.avatar || null
    };

    const token = generateCustomerToken(safeUser);
    res.json({ success: true, token, user: safeUser });
  } catch (err) {
    res.status(500).json({ error: 'Erro no login: ' + err.message });
  }
});

// Login com o Google (Google Sign-In / One-Tap)
app.post('/api/auth/customer/google', async (req, res) => {
  const { credential, profile } = req.body;

  let googleUser = null;

  if (credential) {
    try {
      const parts = credential.split('.');
      if (parts.length === 3) {
        const payloadBase64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
        const payload = JSON.parse(payloadJson);
        googleUser = {
          googleId: payload.sub,
          email: payload.email?.toLowerCase(),
          name: payload.name || payload.given_name || 'Cliente Google',
          avatar: payload.picture || null
        };
      }
    } catch (e) {
      console.warn('Erro ao decodificar token do Google:', e.message);
    }
  }

  if (!googleUser && profile && profile.email) {
    googleUser = {
      googleId: profile.sub || profile.id,
      email: profile.email.toLowerCase(),
      name: profile.name || 'Cliente Google',
      avatar: profile.picture || null
    };
  }

  if (!googleUser || !googleUser.email) {
    return res.status(400).json({ error: 'Credencial do Google inválida ou não informada.' });
  }

  try {
    let user = await mongo.User.findOne({
      $or: [{ google_id: googleUser.googleId }, { email: googleUser.email }]
    });

    if (user) {
      if (!user.google_id) user.google_id = googleUser.googleId;
      if (!user.avatar && googleUser.avatar) user.avatar = googleUser.avatar;
      await user.save();
    } else {
      const userId = 'usr_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
      user = await mongo.User.create({
        id: userId,
        name: googleUser.name,
        email: googleUser.email,
        provider: 'google',
        google_id: googleUser.googleId,
        avatar: googleUser.avatar
      });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      cpf: user.cpf || '',
      address: user.address || '',
      city: user.city || '',
      cep: user.cep || '',
      avatar: user.avatar
    };

    const token = generateCustomerToken(safeUser);
    return res.json({ success: true, token, user: safeUser });
  } catch (err) {
    res.status(500).json({ error: 'Erro na autenticação com Google: ' + err.message });
  }
});

// Obter perfil do cliente logado
app.get('/api/auth/customer/me', requireCustomerAuth, (req, res) => {
  res.json({ success: true, user: req.user });
});

// Atualizar dados de entrega do cliente logado
app.put('/api/auth/customer/me', requireCustomerAuth, async (req, res) => {
  const { name, phone, cpf, address, city, cep } = req.body;
  const current = req.user;

  try {
    const updated = await mongo.User.findOneAndUpdate(
      { id: current.id },
      {
        $set: {
          name: name ? String(name).trim() : current.name,
          phone: phone !== undefined ? String(phone).trim() : current.phone,
          cpf: cpf !== undefined ? String(cpf).trim() : current.cpf,
          address: address !== undefined ? String(address).trim() : current.address,
          city: city !== undefined ? String(city).trim() : current.city,
          cep: cep !== undefined ? String(cep).trim() : current.cep
        }
      },
      { new: true }
    ).lean();

    return res.json({ success: true, user: updated });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar dados: ' + err.message });
  }
});

// ──────────────────────────────────────────────
// 2. AUTENTICAÇÃO ADMINISTRATIVA
// ──────────────────────────────────────────────
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@novaera.com';
  const adminPass = process.env.ADMIN_PASS || 'novaera123';
  const adminToken = process.env.ADMIN_TOKEN || 'novaera_secret_admin_token_2026';

  if (email === adminEmail && password === adminPass) {
    return res.json({
      success: true,
      token: adminToken,
      user: { email: adminEmail, role: 'admin' }
    });
  }

  return res.status(401).json({ error: 'Email ou senha incorretos.' });
});

app.get('/api/auth/verify', requireAdmin, (req, res) => {
  res.json({ valid: true, role: 'admin' });
});

// ──────────────────────────────────────────────
// 3. ROTAS DE CONFIGURAÇÃO DA LOJA
// ──────────────────────────────────────────────
app.get('/api/config', async (req, res) => {
  const defaultConfig = {
    nomeNegocio: 'Nova Era Nutrition',
    whatsappNumero: '5516993998499',
    freteGratisMinimo: 199,
    currency: 'BRL',
    googleClientId: process.env.GOOGLE_CLIENT_ID || ''
  };

  try {
    const configs = await mongo.Config.find().lean();
    for (const c of configs) {
      defaultConfig[c.key] = c.value;
    }
  } catch (_) {}

  defaultConfig.googleClientId = process.env.GOOGLE_CLIENT_ID || '';
  res.json(defaultConfig);
});

app.put('/api/config', requireAdmin, async (req, res) => {
  try {
    for (const [k, v] of Object.entries(req.body)) {
      await mongo.Config.findOneAndUpdate({ key: k }, { value: v }, { upsert: true });
    }
    res.json({ success: true, config: req.body });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar configurações: ' + err.message });
  }
});

// ──────────────────────────────────────────────
// 4. ROTAS DE PRODUTOS (CRUD MONGODB ATLAS)
// ──────────────────────────────────────────────
// Listar produtos
app.get('/api/products', async (req, res) => {
  const { categoria, ativo, q } = req.query;

  try {
    const filter = {};
    if (categoria && categoria !== 'all') filter.categoria = categoria;
    if (ativo !== undefined) filter.ativo = ativo === 'true';
    if (q) {
      filter.$or = [
        { nome: { $regex: q, $options: 'i' } },
        { descricao: { $regex: q, $options: 'i' } }
      ];
    }

    const products = await mongo.Product.find(filter).sort({ createdAt: -1 }).lean();
    return res.json(products);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar produtos: ' + err.message });
  }
});

// Obter um produto por ID
app.get('/api/products/:id', async (req, res) => {
  try {
    const product = await mongo.Product.findOne({ id: req.params.id }).lean();
    if (!product) return res.status(404).json({ error: 'Produto não encontrado.' });
    return res.json(product);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar produto (Admin)
app.post('/api/products', requireAdmin, async (req, res) => {
  const { nome, preco, categoria, descricao, imagem, imagens, badge, badgeTipo, precoAntigo, estrelas, avaliacoes } = req.body;

  if (!nome || !preco || !categoria) {
    return res.status(400).json({ error: 'Nome, preço e categoria são obrigatórios.' });
  }

  const id = 'prod_' + Date.now() + '_' + crypto.randomBytes(3).toString('hex');
  const imagensArr = Array.isArray(imagens) && imagens.length > 0 ? imagens : (imagem ? [imagem] : []);
  const mainImage = imagem || (imagensArr[0] || '');

  const productData = {
    id,
    nome: String(nome).trim(),
    categoria: String(categoria).trim(),
    preco: parseFloat(preco) || 0,
    precoAntigo: precoAntigo ? parseFloat(precoAntigo) : null,
    descricao: String(descricao || '').trim(),
    imagem: mainImage,
    imagens: imagensArr,
    badge: String(badge || '').trim(),
    badgeTipo: badgeTipo || 'red',
    estrelas: parseInt(estrelas) || 5,
    avaliacoes: parseInt(avaliacoes) || 0,
    ativo: true,
    criadoEm: new Date().toISOString()
  };

  try {
    const created = await mongo.Product.create(productData);
    return res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao cadastrar produto: ' + err.message });
  }
});

// Atualizar produto (Admin)
app.put('/api/products/:id', requireAdmin, async (req, res) => {
  const b = req.body;
  const now = new Date().toISOString();

  try {
    const updateFields = { atualizadoEm: now };
    if (b.nome !== undefined) updateFields.nome = String(b.nome).trim();
    if (b.categoria !== undefined) updateFields.categoria = String(b.categoria).trim();
    if (b.preco !== undefined) updateFields.preco = parseFloat(b.preco);
    if (b.precoAntigo !== undefined) updateFields.precoAntigo = b.precoAntigo ? parseFloat(b.precoAntigo) : null;
    if (b.descricao !== undefined) updateFields.descricao = String(b.descricao).trim();
    if (b.imagem !== undefined) updateFields.imagem = b.imagem;
    if (b.imagens !== undefined) updateFields.imagens = Array.isArray(b.imagens) ? b.imagens : [];
    if (b.badge !== undefined) updateFields.badge = String(b.badge).trim();
    if (b.badgeTipo !== undefined) updateFields.badgeTipo = b.badgeTipo;
    if (b.estrelas !== undefined) updateFields.estrelas = parseInt(b.estrelas);
    if (b.avaliacoes !== undefined) updateFields.avaliacoes = parseInt(b.avaliacoes);

    const updated = await mongo.Product.findOneAndUpdate(
      { id: req.params.id },
      { $set: updateFields },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ error: 'Produto não encontrado.' });
    return res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar produto: ' + err.message });
  }
});

// Ativar/Desativar produto (Admin)
app.patch('/api/products/:id/toggle', requireAdmin, async (req, res) => {
  try {
    const prod = await mongo.Product.findOne({ id: req.params.id });
    if (!prod) return res.status(404).json({ error: 'Produto não encontrado.' });
    prod.ativo = req.body.ativo !== undefined ? Boolean(req.body.ativo) : !prod.ativo;
    await prod.save();
    return res.json({ success: true, ativo: prod.ativo });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Deletar produto (Admin)
app.delete('/api/products/:id', requireAdmin, async (req, res) => {
  try {
    const result = await mongo.Product.deleteOne({ id: req.params.id });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'Produto não encontrado.' });
    return res.json({ success: true, message: 'Produto removido com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// 5. ROTAS DE PEDIDOS E CHECKOUT (PROTEGIDO POR LOGIN)
// ──────────────────────────────────────────────
// Listar pedidos (Admin)
app.get('/api/orders', requireAdmin, async (req, res) => {
  try {
    const orders = await mongo.Order.find().sort({ createdAt: -1 }).lean();
    return res.json(orders);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar pedidos: ' + err.message });
  }
});

// Listar pedidos do cliente logado
app.get('/api/customer/orders', requireCustomerAuth, async (req, res) => {
  try {
    const orders = await mongo.Order.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();
    return res.json(orders);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar pedido (Checkout da loja - Exige autenticação de cliente!)
app.post('/api/checkout/orders', requireCustomerAuth, async (req, res) => {
  const { cliente, itens, metodoPagamento, observacoes } = req.body;
  const user = req.user;

  if (!cliente || !cliente.nome || !cliente.cpf) {
    return res.status(400).json({ error: 'Dados do cliente (nome, cpf) são obrigatórios.' });
  }

  if (!Array.isArray(itens) || itens.length === 0) {
    return res.status(400).json({ error: 'O carrinho está vazio.' });
  }

  // Atualiza automaticamente o perfil do cliente
  try {
    await mongo.User.updateOne(
      { id: user.id },
      {
        $set: {
          phone: cliente.telefone || user.phone || '',
          cpf: cliente.cpf || user.cpf || '',
          address: cliente.endereco || user.address || '',
          city: cliente.cidade || user.city || '',
          cep: cliente.cep || user.cep || ''
        }
      }
    );
  } catch (_) {}

  const subtotal = itens.reduce((acc, i) => acc + (parseFloat(i.preco) * parseInt(i.qty)), 0);
  const valorFrete = subtotal >= 199 ? 0 : 0;
  const total = subtotal + valorFrete;
  const orderId = 'PED_' + Date.now() + '_' + crypto.randomBytes(2).toString('hex').toUpperCase();
  const now = new Date().toISOString();

  const formattedItems = itens.map(i => ({
    id: i.id || null,
    nome: i.nome,
    preco: parseFloat(i.preco) || 0,
    qty: parseInt(i.qty) || 1,
    subtotal: (parseFloat(i.preco) || 0) * (parseInt(i.qty) || 1)
  }));

  const orderData = {
    id: orderId,
    userId: user.id,
    cliente: {
      nome: cliente.nome,
      cpf: cliente.cpf,
      telefone: cliente.telefone || '',
      endereco: cliente.endereco || '',
      cidade: cliente.cidade || '',
      cep: cliente.cep || ''
    },
    itens: formattedItems,
    subtotal,
    valorFrete,
    total,
    metodoPagamento: metodoPagamento || 'whatsapp',
    status: 'pendente',
    observacoes: observacoes || '',
    paymentDetails: {},
    criadoEm: now
  };

  try {
    const created = await mongo.Order.create(orderData);
    return res.status(201).json({ success: true, order: created });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao criar pedido: ' + err.message });
  }
});

// Consultar status de um pedido específico
app.get('/api/orders/:id', async (req, res) => {
  try {
    const order = await mongo.Order.findOne({ id: req.params.id }).lean();
    if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
    return res.json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar status do pedido (Admin)
app.patch('/api/orders/:id/status', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const now = new Date().toISOString();

  try {
    const updated = await mongo.Order.findOneAndUpdate(
      { id: req.params.id },
      { $set: { status, atualizadoEm: now } },
      { new: true }
    ).lean();

    if (!updated) return res.status(404).json({ error: 'Pedido não encontrado.' });
    return res.json({ success: true, order: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ──────────────────────────────────────────────
// 6. INTEGRAÇÕES DE PAGAMENTOS (MERCADO PAGO & PIX)
// ──────────────────────────────────────────────
app.post('/api/payments/pix', async (req, res) => {
  const { orderId } = req.body;

  const order = await mongo.Order.findOne({ id: orderId });
  if (!order) {
    return res.status(404).json({ error: 'Pedido não encontrado para cobrança PIX.' });
  }

  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  if (mpToken && !mpToken.startsWith('TEST-000000')) {
    try {
      const response = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mpToken}`
        },
        body: JSON.stringify({
          transaction_amount: order.total,
          description: `Pedido ${order.id} - Nova Era Nutrition`,
          payment_method_id: 'pix',
          payer: {
            email: 'cliente@novaera.com',
            first_name: (order.cliente?.nome || 'Cliente').split(' ')[0],
            last_name: (order.cliente?.nome || 'Cliente').split(' ').slice(1).join(' ') || 'Cliente',
            identification: {
              type: 'CPF',
              number: (order.cliente?.cpf || '').replace(/\D/g, '')
            }
          },
          external_reference: order.id
        })
      });

      const mpData = await response.json();
      if (response.ok && mpData.point_of_interaction) {
        const paymentDetails = {
          gateway: 'mercadopago',
          paymentId: mpData.id,
          qrCode: mpData.point_of_interaction.transaction_data.qr_code,
          qrCodeBase64: mpData.point_of_interaction.transaction_data.qr_code_base64
        };

        order.paymentDetails = paymentDetails;
        await order.save();

        return res.json({
          success: true,
          qrCode: paymentDetails.qrCode,
          qrCodeBase64: paymentDetails.qrCodeBase64,
          paymentId: mpData.id
        });
      }
    } catch (err) {
      console.error('Erro na chamada Mercado Pago PIX:', err.message);
    }
  }

  // Contingência: Chave PIX direta configurada no .env
  const chavePix = process.env.PIX_CHAVE || '16993998499';
  const beneficiario = process.env.PIX_BENEFICIARIO || 'Nova Era Nutrition';

  res.json({
    success: true,
    modo: 'chave_direta',
    chavePix: chavePix,
    beneficiario: beneficiario,
    valor: order.total,
    mensagem: `Envie o comprovante informando o código do pedido ${order.id}`
  });
});

app.post('/api/payments/mercadopago/preference', async (req, res) => {
  const { orderId } = req.body;

  const order = await mongo.Order.findOne({ id: orderId });
  if (!order) {
    return res.status(404).json({ error: 'Pedido não encontrado.' });
  }

  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;

  if (!mpToken || mpToken.startsWith('TEST-000000')) {
    return res.status(400).json({
      error: 'Token do Mercado Pago não configurado no arquivo .env.',
      instrucao: 'Adicione MERCADOPAGO_ACCESS_TOKEN no arquivo .env para habilitar checkout automático.'
    });
  }

  try {
    const items = order.itens || [];
    const clientName = order.cliente?.nome || 'Cliente';
    const clientCpf = order.cliente?.cpf || '';

    const preferencePayload = {
      items: items.map(item => ({
        id: item.id || item.product_id,
        title: item.nome,
        quantity: item.qty,
        currency_id: 'BRL',
        unit_price: parseFloat(item.preco)
      })),
      payer: {
        name: clientName,
        identification: {
          type: 'CPF',
          number: clientCpf.replace(/\D/g, '')
        }
      },
      back_urls: {
        success: `${baseUrl}/?status=sucesso&pedido=${order.id}`,
        failure: `${baseUrl}/?status=falha&pedido=${order.id}`,
        pending: `${baseUrl}/?status=pendente&pedido=${order.id}`
      },
      auto_return: 'approved',
      external_reference: order.id,
      notification_url: `${baseUrl}/api/webhooks/mercadopago`
    };

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mpToken}`
      },
      body: JSON.stringify(preferencePayload)
    });

    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: data.message || 'Erro ao gerar preferência no Mercado Pago.' });
    }

    const paymentDetails = {
      preferenceId: data.id,
      initPoint: data.init_point,
      sandboxInitPoint: data.sandbox_init_point
    };

    order.paymentDetails = paymentDetails;
    await order.save();

    res.json({
      success: true,
      preferenceId: data.id,
      checkoutUrl: data.init_point
    });

  } catch (err) {
    console.error('Erro ao conectar com Mercado Pago:', err.message);
    res.status(500).json({ error: 'Falha interna ao gerar link de pagamento.' });
  }
});

// Webhook Mercado Pago
app.post('/api/webhooks/mercadopago', async (req, res) => {
  const { type, data } = req.body;
  const mpToken = process.env.MERCADOPAGO_ACCESS_TOKEN;

  res.status(200).send('OK');

  if (type === 'payment' && data && data.id && mpToken) {
    try {
      const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
        headers: { 'Authorization': `Bearer ${mpToken}` }
      });
      const paymentData = await paymentResponse.json();

      if (paymentData.status === 'approved' && paymentData.external_reference) {
        const orderId = paymentData.external_reference;
        const order = await mongo.Order.findOne({ id: orderId });
        if (order) {
          order.status = 'pago';
          order.paymentDetails = {
            ...order.paymentDetails,
            pagoEm: new Date().toISOString(),
            gatewayPaymentId: data.id,
            statusGateway: paymentData.status
          };
          await order.save();
          console.log(`✅ Pedido ${orderId} atualizado para PAGO no MongoDB via Webhook!`);
        }
      }
    } catch (err) {
      console.error('Erro ao processar Webhook Mercado Pago:', err.message);
    }
  }
});

// Fallback para SPA / index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Inicialização do servidor
async function startServer() {
  const connected = await mongo.connectMongo();
  if (!connected) {
    console.error('❌ Falha crítica ao conectar no MongoDB Atlas. Verifique MONGODB_URI.');
  }

  app.listen(PORT, () => {
    console.log(`\n======================================================`);
    console.log(`🚀 Servidor Nova Era Nutrition ativo na porta ${PORT}!`);
    console.log(`🍃 Banco de Dados na Nuvem: MongoDB Atlas`);
    console.log(`👤 Autenticação de Clientes: Ativa (Local + Google)`);
    console.log(`🛒 Vitrine: http://localhost:${PORT}`);
    console.log(`🛡️  Admin:   http://localhost:${PORT}/admin.html`);
    console.log(`💳 Meios de Pagamento: Preparados (Mercado Pago / PIX)`);
    console.log(`======================================================\n`);
  });
}

startServer();
