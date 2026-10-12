# 🦍 Nova Era Nutrition — E-commerce & Plataforma de Gestão

> Plataforma completa de e-commerce premium para suplementação esportiva, com vitrine interativa, carrinho dinâmico, checkout inteligente, autenticação de clientes, integração com meios de pagamento (Mercado Pago e PIX) e painel administrativo robusto.

---

## 🏗️ Arquitetura do Projeto

O sistema opera com uma arquitetura moderna cliente-servidor (Full Stack), desacoplada e segura:

- **Frontend:**
  - HTML5 semântico, CSS3 modular com design responsivo e tema dark/red neon.
  - JavaScript moderno (ES6+) sem frameworks pesados, garantindo carregamento instantâneo.
  - Autenticação de clientes via **Google One-Tap / Identity Services** e cadastro nativo.
  - Live preview e suporte para até 8 fotos por produto (upload direto ou links externos).

- **Backend:**
  - **Node.js** com framework **Express**.
  - **Multer** para upload e armazenamento local de imagens com sanitização de nomes e validação MIME type.
  - **Bcrypt.js** para hash criptográfico de senhas e **JSON Web Tokens (JWT)** para sessões autenticadas.
  - Camada de segurança HTTP contra enumeração e acesso indevido a arquivos confidenciais.

- **Banco de Dados (Nuvem):**
  - **MongoDB Atlas** gerenciado via ODM **Mongoose**, oferecendo persistência escalável na nuvem para:
    - `User`: Clientes cadastrados, endereços de entrega e perfis vinculados ao Google.
    - `Product`: Catálogo de produtos, imagens múltiplas, tags/badges e avaliações.
    - `Order`: Histórico de pedidos, itens comprados, status de entrega e detalhes de transação.
    - `Config`: Informações dinâmicas da loja (WhatsApp, regras de frete grátis, etc.).

---

## 📁 Estrutura de Pastas e Arquivos

```text
loja-suplemento/
├── .env.example             # Modelo seguro de variáveis de ambiente
├── .gitignore               # Configurações de exclusão e segurança do repositório
├── admin.css                # Estilização completa do painel administrativo
├── admin.html               # Interface do painel de administração da loja
├── admin.js                 # Lógica do painel admin (CRUD de produtos, pedidos, uploads)
├── api-client.js            # Cliente HTTP unificado do frontend com o backend Node.js
├── image-backend.js         # Normalizador de URLs de imagens (Drive, Imgur, Dropbox, Local)
├── index.html               # Vitrine principal da loja
├── iniciar-servidor.bat     # Inicializador rápido do servidor para Windows
├── mongoose-db.js           # Conexão com MongoDB Atlas e Schemas do Mongoose
├── package.json             # Dependências e scripts do projeto
├── README.md                # Documentação técnica do projeto
├── script.js                # Lógica da vitrine (carrinho, modal, filtros, checkout)
├── server.js                # Servidor backend Express, rotas da API REST e middlewares
├── style.css                # Folha de estilos da vitrine principal
├── data/
│   └── products.json        # Catálogo base para inicialização automática do MongoDB (seed)
└── uploads/
    └── .gitkeep             # Diretório destinado às fotos de produtos enviadas
```

---

## 🚀 Como Executar o Projeto

### 1. Pré-requisitos
- **Node.js** (versão 18.x ou superior recomendada)
- Conexão com a internet para acesso ao **MongoDB Atlas**

### 2. Instalar Dependências
No terminal, dentro da pasta do projeto, execute:
```bash
npm install
```

### 3. Configurar as Variáveis de Ambiente
Copie o arquivo `.env.example` para `.env`:
```bash
copy .env.example .env
```
Abra o arquivo `.env` e configure suas variáveis:
- `MONGODB_URI`: Sua string de conexão do cluster MongoDB Atlas.
- `ADMIN_EMAIL` e `ADMIN_PASS`: Credenciais para acessar o painel `/admin.html`.
- `ADMIN_TOKEN`: Token secreto utilizado para validar operações administrativas.
- `JWT_SECRET`: Chave secreta para assinar os tokens dos clientes.
- `PIX_CHAVE`: Sua chave PIX para pagamentos diretos.
- `MERCADOPAGO_ACCESS_TOKEN`: (Opcional) Token de produção ou sandbox do Mercado Pago.

### 4. Iniciar o Servidor
Execute o comando:
```bash
npm start
```
*Ou, no Windows, dê dois cliques em `iniciar-servidor.bat`.*

### 5. Acessar a Aplicação
- **Vitrine Virtual:** [http://localhost:3000](http://localhost:3000)
- **Painel Administrativo:** [http://localhost:3000/gestao-interna](http://localhost:3000/gestao-interna)

---

## 🛡️ Segurança & Auditoria Cibernética Implementada

Durante a revisão de segurança, foram aplicadas as seguintes medidas de proteção:

1. **Proteção Contra Vazamento de Arquivos Estáticos:**
   - O servidor bloqueia ativamente qualquer requisição HTTP para arquivos ocultos (`.env`, `.git`) e arquivos sensíveis do backend (`server.js`, `mongoose-db.js`, `package.json`, etc.), prevenindo vazamentos de credenciais via web.
2. **Eliminação de Tokens Padrão no Frontend:**
   - Correção do fluxo de autenticação do painel admin, garantindo que credenciais não fiquem expostas no código cliente (`sessionStorage` estrito).
3. **Criptografia Forte para Senhas de Clientes:**
   - As senhas dos usuários são protegidas com salt e hash via `bcryptjs` antes de serem armazenadas no banco.
4. **Proteção de Rotas com JWT e Bearer Tokens:**
   - Endpoints críticos de alteração de produtos, consulta de configurações e gerenciamento de pedidos exigem validação de cabeçalhos de autorização (`Authorization: Bearer <token>`).
5. **Cabeçalhos de Segurança HTTP:**
   - Inclusão de `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection` e desativação do cabeçalho identificador `X-Powered-By`.

---

## 📡 Endpoints da API REST

### 👤 Autenticação de Clientes
- `POST /api/auth/customer/register` — Cadastro de novo cliente
- `POST /api/auth/customer/login` — Login com e-mail e senha
- `POST /api/auth/customer/google` — Autenticação via Google One-Tap
- `GET /api/auth/customer/me` — Dados do perfil do cliente autenticado
- `PUT /api/auth/customer/me` — Atualização de endereço e dados de entrega

### 🔒 Autenticação Administrativa
- `POST /api/auth/login` — Autenticação do administrador
- `GET /api/auth/verify` — Validação do token administrativo

### 📦 Produtos
- `GET /api/products` — Listagem e busca de produtos (com filtros de categoria e busca)
- `GET /api/products/:id` — Detalhes de um produto
- `POST /api/products` — Cadastro de produto *(Requer Admin)*
- `PUT /api/products/:id` — Edição de produto *(Requer Admin)*
- `PATCH /api/products/:id/toggle` — Ativação/Desativação de exibição *(Requer Admin)*
- `DELETE /api/products/:id` — Exclusão de produto *(Requer Admin)*
- `POST /api/upload` — Upload de imagem de produto *(Armazenamento local)*

### 🛒 Pedidos & Checkout
- `POST /api/checkout/orders` — Criação de pedido vinculado ao cliente
- `GET /api/customer/orders` — Pedidos realizados pelo cliente autenticado
- `GET /api/orders` — Listagem geral de pedidos da loja *(Requer Admin)*
- `PATCH /api/orders/:id/status` — Atualização do status do pedido *(Requer Admin)*

### 💳 Pagamentos
- `POST /api/payments/pix` — Geração de cobrança via PIX (Mercado Pago ou Chave Direta)
- `POST /api/payments/mercadopago/preference` — Criação de checkout com cartão/boleto no Mercado Pago
- `POST /api/webhooks/mercadopago` — Notificação de pagamento aprovado via webhook

---

## 📄 Licença

Este projeto é de propriedade da **Nova Era Nutrition**. Todos os direitos reservados.
