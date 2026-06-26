# 🦍 Nova Era Nutrition — Guia Completo de Configuração

> Site de e-commerce premium com vitrine, carrinho, checkout WhatsApp e painel admin.
> Backend: **Firebase Firestore + Auth + Storage + Hosting**

---

## 📋 Pré-requisitos

- Conta Google (gratuita)
- Navegador moderno (Chrome, Edge, Firefox)
- Git instalado

---

## 🚀 Passo 1 — Criar o Projeto Firebase

1. Acesse [console.firebase.google.com](https://console.firebase.google.com)
2. Clique em **"Adicionar projeto"**
3. Nome: `nova-era-nutrition` (ou qualquer nome)
4. Desative o Google Analytics (opcional)
5. Clique em **"Criar projeto"**

---

## 🗄️ Passo 2 — Ativar o Firestore

1. No painel do projeto, clique em **"Firestore Database"**
2. Clique em **"Criar banco de dados"**
3. Escolha **"Começar no modo de produção"**
4. Localização: `southamerica-east1` (São Paulo)
5. Clique em **"Ativar"**

### Configurar as Regras de Segurança

1. Vá em **Firestore → Regras**
2. Substitua tudo pelo conteúdo do arquivo `firestore.rules`
3. Clique em **"Publicar"**

---

## 🔑 Passo 3 — Ativar Autenticação (Login do Admin)

1. No painel, clique em **"Authentication"**
2. Clique em **"Começar"**
3. Em **"Provedores de login"**, clique em **"E-mail/senha"**
4. Ative e clique em **"Salvar"**

### Criar o usuário admin

1. Clique na aba **"Usuários"**
2. Clique em **"Adicionar usuário"**
3. Preencha:
   - **E-mail**: `admin@sualoja.com` (ou qualquer e-mail)
   - **Senha**: uma senha forte (mínimo 6 caracteres)
4. Clique em **"Adicionar usuário"**

> ⚠️ **Guarde este e-mail e senha!** Serão usados para entrar no painel admin.

---

## 🖼️ Passo 4 — Ativar o Storage (Imagens)

1. No painel, clique em **"Storage"**
2. Clique em **"Começar"**
3. Aceite as regras padrão e clique em **"Concluído"**

### Configurar as Regras de Storage

1. Vá em **Storage → Regras**
2. Substitua tudo pelo conteúdo do arquivo `storage.rules`
3. Clique em **"Publicar"**

---

## ⚙️ Passo 5 — Obter as Credenciais do Firebase

1. Clique na **Engrenagem (⚙️)** → **"Configurações do projeto"**
2. Role até **"Seus apps"**
3. Clique em `</>` (Web) → Registre o app
4. Copie o objeto `firebaseConfig` e cole no arquivo `firebase-config.js`:

```javascript
const firebaseConfig = {
  apiKey:            "SUA_API_KEY",
  authDomain:        "seu-projeto.firebaseapp.com",
  projectId:         "seu-projeto",
  storageBucket:     "seu-projeto.appspot.com",
  messagingSenderId: "000000000000",
  appId:             "1:000000000000:web:xxxxxxxxxxxx"
};
```

---

## 🛍️ Passo 6 — Configurar a Loja

No mesmo `firebase-config.js`, edite `LOJA_CONFIG`:

```javascript
const LOJA_CONFIG = {
  whatsappNumero:    '5511999999999',  // DDI+DDD+número (sem +)
  freteGratisMinimo: 199,              // R$ mínimo para frete grátis
  nomeNegocio:       'Nova Era Nutrition',
};
```

---

## 🌐 Passo 7 — Deploy no Firebase Hosting (GRÁTIS)

```bash
npm install -g firebase-tools
firebase login
firebase use --add
firebase deploy
```

Seu site ficará em: `https://SEU-PROJETO.web.app`

---

## 📦 Adicionar Produtos

1. Acesse `https://seusite.web.app/admin.html`
2. Login com e-mail e senha (Passo 3)
3. Clique em **"Novo Produto"**, preencha e salve
4. O produto aparece na vitrine **em tempo real** sem recarregar!

---

## 🗂️ Estrutura do Projeto

```
nutricao/
├── index.html           # Vitrine pública
├── style.css            # Estilos da vitrine
├── script.js            # Lógica: Firestore, carrinho, modal, WhatsApp
├── admin.html           # Painel administrativo
├── admin.css            # Estilos do painel
├── admin.js             # Lógica: Auth, CRUD Firestore, Storage upload
├── firebase-config.js   # ⚠️ EDITE AQUI
├── firestore.rules      # Segurança do banco
├── storage.rules        # Segurança das imagens
├── firestore.indexes.json
├── firebase.json
├── .firebaserc
├── .gitignore
└── README.md
```

---

## ❓ Problemas Comuns

| Problema | Solução |
|---|---|
| Banner vermelho no admin | Preencha as credenciais em `firebase-config.js` |
| Login falha | Crie o usuário em Authentication → Usuários |
| Produtos não aparecem | Verifique as regras do Firestore (Passo 2) |
| Upload de imagem falha | Verifique as regras do Storage (Passo 4) |
| CORS error | Use um servidor HTTP, não `file://` |

---

*Desenvolvido com 🔥 para a **Nova Era Nutrition***
