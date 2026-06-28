/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║     NOVA ERA NUTRITION — Firebase Configuration          ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║  PASSO A PASSO PARA CONFIGURAR:                          ║
 * ║  1. Acesse https://console.firebase.google.com           ║
 * ║  2. Selecione seu projeto                                ║
 * ║  3. Configurações (⚙️) → Configurações do projeto        ║
 * ║  4. Role até "Seus apps" → clique no ícone </> (Web)     ║
 * ║  5. Copie os valores e cole nas variáveis abaixo         ║
 * ╚══════════════════════════════════════════════════════════╝
 */

// ──────────────────────────────────────────────
// 1. CREDENCIAIS DO FIREBASE  ← EDITE AQUI
// ──────────────────────────────────────────────
const firebaseConfig = {
  apiKey: "AIzaSyAAa8ZHO57d4IiknXymNVC8ciR1hKYwW9k",
  authDomain: "nova-era-nutrition.firebaseapp.com",
  projectId: "nova-era-nutrition",
  storageBucket: "nova-era-nutrition.firebasestorage.app",
  messagingSenderId: "708464446267",
  appId: "1:708464446267:web:1495a2f6722422a300851e"
};

// ──────────────────────────────────────────────
// 2. CONFIGURAÇÕES DA LOJA  ← EDITE AQUI
// ──────────────────────────────────────────────
const LOJA_CONFIG = {
  /** Número WhatsApp para checkout (DDI+DDD+número, sem + ou espaços) */
  whatsappNumero:    '5516993998499',

  /** Valor mínimo em R$ para frete grátis */
  freteGratisMinimo: 199,

  /** Nome exibido no checkout do WhatsApp */
  nomeNegocio:       'Nova Era Nutrition',
};

// ──────────────────────────────────────────────
// 3. INICIALIZAÇÃO — NÃO ALTERE ABAIXO DAQUI
// ──────────────────────────────────────────────
(function initFirebase() {
  try {
    firebase.initializeApp(firebaseConfig);
  } catch (e) {
    // Evita erro "Firebase App named '[DEFAULT]' already exists"
    if (!/already exists/i.test(e.message)) throw e;
  }
})();

/** Banco de dados Firestore */
const db = firebase.firestore();

/** Autenticação (disponível apenas no admin) */
const auth = (typeof firebase.auth === 'function') ? firebase.auth() : null;

/** Storage para upload de imagens (disponível apenas no admin) */
const storage = (typeof firebase.storage === 'function') ? firebase.storage() : null;

// ──────────────────────────────────────────────
// 4. VERIFICAÇÃO DE CONFIGURAÇÃO
// ──────────────────────────────────────────────
(function checkConfig() {
  if (firebaseConfig.apiKey === 'COLE_SUA_API_KEY_AQUI') {
    const msg =
      '⚠️ FIREBASE NÃO CONFIGURADO\n\n' +
      'Edite o arquivo firebase-config.js e insira\n' +
      'as credenciais do seu projeto Firebase.\n\n' +
      'Veja o README.md para instruções detalhadas.';
    console.warn(msg);
    // Só exibe alert no admin, não atrapalha a vitrine com modal
    if (window.location.pathname.includes('admin')) {
      const banner = document.createElement('div');
      banner.id = 'firebase-not-configured';
      banner.style.cssText =
        'position:fixed;top:0;left:0;right:0;z-index:9999;' +
        'background:#D90429;color:#fff;text-align:center;' +
        'padding:12px 20px;font-weight:700;font-size:14px;' +
        'font-family:Inter,sans-serif;';
      banner.textContent =
        '⚠️ Firebase não configurado — edite firebase-config.js e siga o README.md';
      document.body.prepend(banner);
    }
  }
})();
