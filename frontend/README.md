# No-Show Center — Front-end

Aplicação independente em React 18, TypeScript e Vite para operação First Mile. Esta pasta contém somente o front-end; sessão, regras de negócio e persistência pertencem à API Django em `../backend`.

## Requisitos

- Node.js 20 ou superior
- npm 10 ou superior

## Desenvolvimento com dados fictícios

```bash
npm install
VITE_USE_MOCK=1 npm run dev
```

No Windows PowerShell, use `$env:VITE_USE_MOCK="1"; npm run dev`. O mock cobre as cinco telas (Fila, Tratativas, Recorrência, Indicadores e Insights) com dados de demonstração, incluindo contato e gravação de tratativa. Ele não exercita sessão, CSRF nem permissões: para isso, use a API real.

## Integração com a API Django

```bash
npm install
npm run dev
```

Sem `VITE_USE_MOCK=1`, o front usa a API same-origin em `/api`. O servidor Vite encaminha `/api` e `/admin` para `http://localhost:8000`. Para integração, inicie o Django nessa origem e configure o cookie de sessão e o cookie `csrftoken`.

Copie `.env.example` para `.env.local` e defina `VITE_GOOGLE_CLIENT_ID` com o Client ID do Google Identity Services para habilitar o botão de login. A sessão da aplicação continua sendo validada pelo Django em `GET /api/me/`.

## Build de produção

```bash
npm run build
```

Os arquivos estáticos são gerados em `dist/`. O build é servido pelo Django na mesma origem da API.
