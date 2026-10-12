/**
 * Nova Era Nutrition — Conexão e Modelos MongoDB com Mongoose
 * ════════════════════════════════════════════════════════════
 * Modelos completos:
 *  - User: Usuários e clientes (senha com hash bcryptjs, suporte Google, endereços)
 *  - Product: Catálogo de produtos com tags, fotos múltiplas e avaliações
 *  - Order: Pedidos vinculados a usuários, itens e detalhes de pagamentos
 *  - Config: Configurações da loja (WhatsApp, frete grátis, etc.)
 */

const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Schema de Usuário / Cliente
const userSchema = new mongoose.Schema({
  id: { type: String, unique: true, index: true },
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password_hash: { type: String, default: null },
  provider: { type: String, default: 'local' }, // 'local' ou 'google'
  google_id: { type: String, sparse: true, index: true, default: null },
  avatar: { type: String, default: null },
  phone: { type: String, default: '' },
  cpf: { type: String, default: '' },
  address: { type: String, default: '' },
  city: { type: String, default: '' },
  cep: { type: String, default: '' }
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' }
});

// Schema de Produto
const productSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  nome: { type: String, required: true, trim: true },
  categoria: { type: String, required: true, index: true },
  preco: { type: Number, required: true },
  precoAntigo: { type: Number, default: null },
  descricao: { type: String, default: '' },
  imagem: { type: String, default: '' },
  imagens: { type: [String], default: [] },
  badge: { type: String, default: '' },
  badgeTipo: { type: String, default: 'red' },
  estrelas: { type: Number, default: 5 },
  avaliacoes: { type: Number, default: 0 },
  ativo: { type: Boolean, default: true, index: true },
  criadoEm: { type: String, default: () => new Date().toISOString() },
  atualizadoEm: { type: String, default: null }
}, {
  timestamps: true
});

// Schema de Item de Pedido
const orderItemSchema = new mongoose.Schema({
  id: { type: String, default: null },
  nome: { type: String, required: true },
  preco: { type: Number, required: true },
  qty: { type: Number, required: true, default: 1 },
  subtotal: { type: Number, required: true }
}, { _id: false });

// Schema de Pedido
const orderSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  userId: { type: String, default: null, index: true },
  cliente: {
    nome: { type: String, required: true },
    cpf: { type: String, required: true },
    telefone: { type: String, default: '' },
    endereco: { type: String, default: '' },
    cidade: { type: String, default: '' },
    cep: { type: String, default: '' }
  },
  itens: { type: [orderItemSchema], default: [] },
  subtotal: { type: Number, required: true },
  valorFrete: { type: Number, default: 0 },
  total: { type: Number, required: true },
  metodoPagamento: { type: String, default: 'whatsapp' },
  status: { type: String, default: 'pendente' }, // 'pendente' | 'pago' | 'enviado' | 'cancelado'
  observacoes: { type: String, default: '' },
  paymentDetails: { type: mongoose.Schema.Types.Mixed, default: {} },
  criadoEm: { type: String, default: () => new Date().toISOString() },
  atualizadoEm: { type: String, default: null }
}, {
  timestamps: true
});

// Schema de Configuração da Loja
const configSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, index: true },
  value: { type: mongoose.Schema.Types.Mixed, required: true }
}, {
  timestamps: true
});

const User = mongoose.model('User', userSchema);
const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);
const Config = mongoose.model('Config', configSchema);

let isConnected = false;

async function connectMongo() {
  const uri = process.env.MONGODB_URI;

  if (!uri || uri.includes('SUA_CONEXAO_DO_MONGODB_ATLAS_AQUI')) {
    console.warn('\n⚠️  [MongoDB] MONGODB_URI não configurado no arquivo .env.');
    console.warn('⚠️  Por favor, insira sua String de Conexão do MongoDB Atlas no arquivo .env.');
    return false;
  }

  try {
    if (mongoose.connection.readyState >= 1) {
      isConnected = true;
      return true;
    }

    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 8000
    });

    isConnected = true;
    console.log('\n🟢 [MongoDB] Conectado ao MongoDB com sucesso!');

    // Migração automática inicial de dados existentes
    await seedInitialData();
    return true;
  } catch (err) {
    console.error('🔴 [MongoDB] Erro ao conectar ao MongoDB:', err.message);
    isConnected = false;
    return false;
  }
}

// Popula produtos e configurações iniciais se o MongoDB estiver vazio
async function seedInitialData() {
  try {
    const productCount = await Product.countDocuments();
    if (productCount === 0) {
      const dataDir = path.join(__dirname, 'data');
      const productsFile = path.join(dataDir, 'products.json');

      if (fs.existsSync(productsFile)) {
        const raw = fs.readFileSync(productsFile, 'utf-8');
        const list = JSON.parse(raw);
        if (Array.isArray(list) && list.length > 0) {
          const formatted = list.map(p => ({
            id: p.id,
            nome: p.nome,
            categoria: p.categoria || 'outro',
            preco: Number(p.preco) || 0,
            precoAntigo: p.precoAntigo ? Number(p.precoAntigo) : null,
            descricao: p.descricao || '',
            imagem: p.imagem || (Array.isArray(p.imagens) ? p.imagens[0] : ''),
            imagens: Array.isArray(p.imagens) ? p.imagens : (p.imagem ? [p.imagem] : []),
            badge: p.badge || '',
            badgeTipo: p.badgeTipo || 'red',
            estrelas: Number(p.estrelas) || 5,
            avaliacoes: Number(p.avaliacoes) || 0,
            ativo: p.ativo !== false,
            criadoEm: p.criadoEm || new Date().toISOString()
          }));

          await Product.insertMany(formatted);
          console.log(`📦 [MongoDB] ${formatted.length} produtos importados automaticamente para o MongoDB!`);
        }
      }
    }

    // Configurações padrão
    const cfgCount = await Config.countDocuments();
    if (cfgCount === 0) {
      await Config.create([
        { key: 'nomeNegocio', value: 'Nova Era Nutrition' },
        { key: 'whatsappNumero', value: '5516993998499' },
        { key: 'freteGratisMinimo', value: 199 },
        { key: 'currency', value: 'BRL' }
      ]);
    }
  } catch (err) {
    console.error('Erro na migração inicial para MongoDB:', err.message);
  }
}

module.exports = {
  connectMongo,
  isConnected: () => isConnected,
  User,
  Product,
  Order,
  Config
};
