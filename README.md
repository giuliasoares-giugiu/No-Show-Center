# No-Show Center (`occurrence-hub`)

Painel interno da operação **First Mile** (Shopee/SPX, Brasil) para tratar **no-shows de coleta**: quando o motorista não
coleta no seller, um despachante (dispatcher/monitor) aciona o motorista por WhatsApp, entende o que houve e registra a
tratativa. Coordenadores acompanham o registro, as recorrências e a performance.

> **Para quem for continuar o projeto (pessoa ou IA):** leia as seções 1 a 3, a 12 (decisões) e a 16 (armadilhas) antes
> de alterar qualquer coisa. Tudo o que está marcado como **não feito** ou **nunca testado** é fato, não suposição.

## Sumário
1. [Contexto e usuários](#1-contexto-e-usuários)
2. [Estado atual](#2-estado-atual)
3. [Arquitetura e stack](#3-arquitetura-e-stack)
4. [Estrutura do repositório](#4-estrutura-do-repositório)
5. [Rodar localmente (Windows PowerShell)](#5-rodar-localmente-windows-powershell)
6. [Variáveis de ambiente](#6-variáveis-de-ambiente)
7. [Domínio: glossário e regras de negócio](#7-domínio-glossário-e-regras-de-negócio)
8. [Telas](#8-telas)
9. [API](#9-api)
10. [Integração com o Data Suite e dados externos](#10-integração-com-o-data-suite-e-dados-externos)
11. [Modelo de dados](#11-modelo-de-dados)
12. [Decisões de projeto](#12-decisões-de-projeto-e-por-quê)
13. [Testes e verificação](#13-testes-e-verificação)
14. [Deploy (GCP)](#14-deploy-gcp)
15. [Pendências priorizadas](#15-pendências-priorizadas)
16. [Armadilhas conhecidas](#16-armadilhas-conhecidas)
17. [Convenções](#17-convenções)
18. [Decisões das reuniões de validação](#18-decisões-das-reuniões-de-validação-outubro2026)
19. [Roteiro: ligar a API do Data Suite](#19-roteiro-ligar-a-api-do-data-suite-primeira-ingestão-com-dado-real)

---

## 1. Contexto e usuários

- **Origem.** Uma regional criou um painel de tratativas de No Show Seller (NSS). Este projeto o expande para **nível
  Brasil** e o generaliza: hoje trata a fila **NSS SPX Fault**; o desenho já prevê outras filas (No Show 3PL,
  Partial Pickup, Disabled...), cadastráveis sem deploy.
- **Padrões exigidos.** Python no backend, rodando no GCP (Cloud Run + Cloud SQL), no mesmo padrão do Training Platform
  SVP. O front é React + TypeScript.
- **Fluxo do despachante.** Vê a fila de ocorrências pendentes, abre uma, confere a evidência (raio e horário),
  clica em **Acionar pelo WhatsApp** (abre `wa.me` com a mensagem pronta, assinada com o nome e o telefone dele),
  e depois registra a **tratativa**: resultado da coleta (Coletado, Batida ajustada ou Não revertido) e justificativa.
- **Perfis de acesso**

| Perfil | Vê | Trata e aciona | Telefone do driver |
|---|---|---|---|
| Qualquer login do domínio (padrão) | Tudo | Não | Mascarado |
| Membro de uma station (`StationMember`) | Tudo | Só na própria station | Visível na própria station |
| Coordenador regional (`RegionalAccess`) | Tudo | Em toda a regional | Visível na regional |
| Administrador (`is_staff` ou superusuário) | Tudo | Em tudo | Visível |

A tela de **Indicadores** pode ser restrita a coordenação/admin (`INDICATORS_RESTRICTED=1`, ver seção 12).

## 2. Estado atual

> As **reuniões de validação com a gestão da operação (outubro/2026)** aprovaram a V1 e trouxeram decisões que **mudam
> partes já implementadas**, sobretudo a definição de reversão. Estão na [seção 18](#18-decisões-das-reuniões-de-validação-outubro2026).

| Área | Estado |
|---|---|
| Backend: modelos, API, ingestão com adapter **mock**, admin | Pronto. **90 testes automatizados passando.** |
| Front: 5 telas (Fila, Tratativas, Recorrência, Indicadores, Insights) | Pronto. Verificado em navegador contra o backend real (3 perfis, desktop e celular). |
| Ingestão real do **Data Suite** | **Parcial.** A API existe e **uma amostra real já atravessa o sistema até a tela**, validada com `check_source --file`, `sync_ingestion --file` e testes de navegador. **Falta a conexão de verdade:** URL, autenticação, envelope externo e paginação ainda não foram vistos (seção 19). O adapter `datasuite.py` **nunca fez uma chamada HTTP real**. |
| Login com Google | Implementado (ID token vira sessão Django). **Nunca testado com Client ID real.** Em desenvolvimento entra-se pelo `/admin`. |
| Deploy no GCP | `Dockerfile` multi-stage escrito. **Nunca foi buildado.** Faltam Cloud SQL, serviço Cloud Run, Job de ingestão, Scheduler e CI. |
| Participação em treinamentos | **Só um cartão placeholder.** Depende de dados do time de treinamentos (seção 10). |
| WhatsApp | Link `wa.me` (o envio é manual, pelo WhatsApp de quem clica). **Não há** integração com a API oficial. |

## 3. Arquitetura e stack

```
Data Suite (query -> API)  --->  Cloud Run Job: sync_ingestion  --->  Cloud SQL (PostgreSQL)
                                                                          ^
Navegador (React SPA)  <--- mesma origem --->  Cloud Run: Django (DRF) ---+
                                   serve: /api, /admin e o build do React (WhiteNoise)
```

- **Backend:** Python 3.12, Django 5.1-5.2, Django REST Framework, django-filter, WhiteNoise, gunicorn, psycopg 3
  (PostgreSQL), google-auth. SQLite em desenvolvimento (quando não há `DB_HOST`).
- **Frontend:** React 18, TypeScript 5.7 (estrito), Vite 6, uma única fonte empacotada (Manrope). Sem biblioteca de UI.
  Node 22 no Docker, 20+ localmente. O front foi **gerado por uma ferramenta externa a partir de um briefing de
  contrato** e hoje é código próprio do repositório, sem nenhuma dependência dessa ferramenta.
- **Autenticação:** ID token do Google -> `POST /api/auth/google/` -> sessão Django (cookie). Escritas exigem o cabeçalho
  `X-CSRFToken` (valor do cookie `csrftoken`). Tudo na **mesma origem**, então não há CORS.
- **Fronteira front/back:** `frontend/src/types.ts` e `frontend/src/services/api.ts`. Toda chamada de rede passa por
  `api.ts`. `mockApi.ts` implementa a mesma interface e só entra com `VITE_USE_MOCK=1`.

## 4. Estrutura do repositório

```
Dockerfile                  build único: React (Node) + Django (Python); o Django serve o build
backend/
  manage.py, requirements.txt, .env.example
  config/                   settings.py, urls.py, spa.py (devolve o index.html nas rotas do front)
  apps/
    accounts/               StationMember, RegionalAccess, AccessScope (permissões), login Google, /me
    occurrences/            Queue, QueueRule, Occurrence; lista/filtros; insights.py; recurrence.py
    treatments/             TreatmentOption, Treatment, MessageTemplate, ContactAttempt; registro, CSV, WhatsApp
    indicators/             performance de dispatchers e drivers (services.py concentra as agregações)
    ingestion/              adapters (mock e Data Suite), sync, comandos seed_defaults/sync_ingestion/seed_demo
  tests/test_flow.py        todos os testes do backend
frontend/
  src/App.tsx               shell, rotas por caminho, filtros na URL, Fila
  src/components/           uma tela por arquivo: TreatmentsView, RecurrenceView, IndicatorsView, InsightsView...
  src/services/             api.ts (real), mockApi.ts (demonstração), index.ts (escolhe por VITE_USE_MOCK)
  src/lib/format.ts         formatação pt-BR, datas em America/Sao_Paulo, filtros <-> URL
  src/types.ts              contrato com a API
  src/styles.css            todo o CSS
```

## 5. Rodar localmente (Windows PowerShell)

Pré-requisitos: Python 3.12+, Node 20+. Use **dois terminais** (backend e frontend).

**Terminal 1: backend**
```powershell
cd backend
python -m venv .venv
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt

$env:DJANGO_DEBUG = "1"
$env:DJANGO_ALLOW_INSECURE = "1"

python manage.py migrate
python manage.py seed_defaults          # fila NSS SPX Fault, opções de tratativa e template (idempotente)

# opcional: dados de demonstração com volume (apenas desenvolvimento)
$env:MOCK_EXTRA_ROWS = "300"
python manage.py sync_ingestion         # carrega ocorrências e membros do adapter mock
python manage.py seed_demo              # contatos e tratativas fictícios (exige DJANGO_DEBUG=1)

python manage.py createsuperuser        # usuário para entrar localmente
python manage.py runserver              # porta 8000
```

**Terminal 2: frontend**
```powershell
cd frontend
npm install
npm run dev                             # porta 5173; encaminha /api, /admin e /static para o Django (8000)
```

**Entrar:** abra `http://localhost:5173/admin/`, entre com o superusuário e depois abra `http://localhost:5173/`.
Use **sempre a porta 5173**. O superusuário é administrador (vê e trata tudo). Para testar o escopo de uma station,
crie um `StationMember` no `/admin` com o e-mail do usuário e a station.

Linux/macOS: troque `.\.venv\Scripts\Activate.ps1` por `source .venv/bin/activate` e `$env:VAR = "x"` por `export VAR=x`.

**Só o front, sem backend:** `$env:VITE_USE_MOCK = "1"; npm run dev` (dados fictícios de todas as telas).

**Outros comandos úteis**
```powershell
python manage.py test tests             # testes do backend (90)
npm run build                           # checagem de tipos (tsc estrito) + build do front
python manage.py sync_ingestion --days 7 --only occurrences
python manage.py sync_ingestion --updated-since 2026-10-15T00:00:00 --only members
python manage.py check_source           # valida a fonte SEM gravar nada (use antes da primeira carga real; seção 19)
python manage.py check_source --probe  # UMA chamada à API: mostra só a ESTRUTURA da resposta (sem valores), seguro para colar em chat
python manage.py check_source --file amostra.json --all-types   # valida um JSON salvo da API, sem rede
python manage.py sync_ingestion --only occurrences --file amostra.json   # grava as ocorrências de um JSON salvo
```

## 6. Variáveis de ambiente

**Backend** (modelo em `backend/.env.example`)

| Variável | Padrão | Uso |
|---|---|---|
| `DJANGO_DEBUG` | `0` | `1` só em desenvolvimento (também libera `localhost:5173` em CSRF) |
| `DJANGO_SECRET_KEY` | (dev) | **Obrigatória em produção.** Sem ela o servidor não sobe, a menos que `DJANGO_ALLOW_INSECURE=1` |
| `DJANGO_ALLOW_INSECURE` | vazio | `1` só em desenvolvimento |
| `DJANGO_ALLOWED_HOSTS` | `*` | Lista separada por vírgula. **Restringir em produção** |
| `CSRF_TRUSTED_ORIGINS` | vazio | URLs `https://` do serviço (ex.: a URL do Cloud Run) |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | SQLite | Sem `DB_HOST`, usa SQLite local. Em produção, PostgreSQL (Cloud SQL) |
| `GOOGLE_CLIENT_ID` | vazio | Client ID do Google Identity Services |
| `ALLOWED_EMAIL_DOMAINS` | `shopee.com` | Domínios de e-mail aceitos no login |
| `INGESTION_SOURCE` | `mock` | `mock` ou `datasuite` |
| `DS_API_BASE_URL`, `DS_API_TOKEN` | vazio | API do Data Suite |
| `DS_API_AUTH_HEADER`, `DS_API_AUTH_SCHEME` | `Authorization`, `Bearer` | Como enviar o token. Esquema vazio envia o token puro (por exemplo no cabeçalho `x-api-key`) |
| `DS_API_OCCURRENCES_URL` | vazio | **URL completa** do endpoint de ocorrências (tem prioridade sobre `DS_API_BASE_URL` + caminho). Fica em variável de ambiente, não no repositório |
| `DS_API_OCCURRENCES_PATH`, `DS_API_MEMBERS_PATH` | `/occurrences`, `/station-members` | Caminhos, quando se usa `DS_API_BASE_URL` |
| `DS_API_METHOD` | `GET` | `POST` se a API exigir. **A API de ocorrências é `POST`** (confirmado). Sem `DS_API_BODY`, o `POST` envia `{}` em JSON |
| `DS_API_BODY`, `DS_API_EXTRA_PARAMS`, `DS_API_EXTRA_HEADERS` | vazio | **Objetos JSON**: corpo do `POST`, parâmetros de consulta e cabeçalhos extras (por exemplo uma chave de aplicação). Podem conter segredo |
| `DS_API_SEND_DATE_PARAMS` | `0` | `1` envia `date_from`/`date_to`/`updated_since`. Por padrão não envia: a API devolve só a última carga e uma API estrita pode recusar parâmetro desconhecido |
| `INGEST_PERFORMANCES` | `No Show Seller,No Show 3PL` | Tipos de ocorrência que viram registro. A API devolve **todos** os do dia (inclusive `Full Pickup`); os demais são ignorados e contados em `ignored` |
| `MOCK_EXTRA_ROWS` | `0` | Só desenvolvimento: ocorrências fictícias extras |
| `INDICATORS_RESTRICTED` | `0` | `1` limita a tela de Indicadores a admin e coordenadores regionais |

**Frontend**: `VITE_USE_MOCK` (`1` usa dados fictícios; ausente ou `0` usa a API real) e `VITE_GOOGLE_CLIENT_ID`.
Copie `frontend/.env.example` para `frontend/.env.local`.

## 7. Domínio: glossário e regras de negócio

**Termos**
- **No-show:** o motorista não coletou no seller. **Dispatcher** e **monitor** são a mesma pessoa (responsável por um grupo de
  drivers, conforme a planilha OF TEAM, e quem trata os no-shows deles). **Rota** é uma viagem (`trip_id`); `route_name` é o nome de exibição dela.
- **Raio:** o registro de chegada do motorista dentro ou fora do raio permitido do ponto. `radius_diff` é a diferença em
  metros. **Horário de funcionamento:** DOPs e Lockers usam o horário cadastrado; sellers usam 09:00 às 18:00 por padrão.
- **PUP e seller group:** o **PUP** (`pickup_point_id`) é o ponto de coleta de um seller e vem como **texto**: `1234`, `1234_001`,
  `1234_002`. O **seller group** é o **prefixo antes do `_`** (os três exemplos são o grupo `1234`). A ingestão o deriva e o grava em
  `seller_group` (se a API já mandar `seller_group`, vale o dela). **A tratativa continua por PUP/Shop ID; os indicadores é que
  podem consolidar por grupo.**
- **`fault_type`:** `NSS SPX Fault` é um No Show Seller em que o registro foi **fora do raio ou fora do horário** (falha
  atribuída ao SPX, ou seja, o motorista pode nem ter chegado); `NSS Seller Fault` é quando foi **dentro dos dois**
  (falha do seller). Só `NSS SPX Fault` entra na fila hoje (regra em `QueueRule`).
- **Revertida:** tratativa com resultado marcado `counts_as_reversed` (no seed: **Coletado** e **Batida ajustada**;
  **Não revertido** não conta). Configurável no admin.
  **Atenção:** as reuniões de validação decidiram que a baixa ajustada **não** conta automaticamente como reversão de coleta
  (seção 18). O seed ainda marca "Batida ajustada" como revertida e precisa mudar.

**`seller_performance` e justificativas informadas pelo motorista (vindas do Data Suite)**

| `seller_performance` | Justificativas do driver |
|---|---|
| Disabled | Disabled |
| Full Pickup | Full Pickup |
| No Show 3PL (o motorista não foi) | Não tenho mais espaço no baú; Não passei pelo endereço; Não localizei o endereço; Área de risco; Quebra de veículo; Local fechado |
| No Show Seller | Não havia pacotes para coletar; Local fechado |
| Partial Pickup | Não tenho mais espaço no baú; Local fechado; Não localizei o endereço; Quebra de veículo; Não passei pelo endereço |

**Tratativa (fila NSS SPX Fault, no seed).** Resultado: Coletado, Batida ajustada, Não revertido. Justificativa: Comportamento
suspeito driver; Local físico (galpão, portaria, etc); Sinal de GPS; Problema de endereço ou lat/long; Problema de
sequenciamento da rota; Seller que dropa pacotes; Outro (especificar...), que exige texto.

**Estado da ocorrência (derivado, não gravado):** *Tratada* se há `Treatment`; *Acionada* se há `ContactAttempt`; senão
*Sem contato*.

**Mensagem do WhatsApp:** template por fila (`MessageTemplate`), com as variáveis `{driver_name}`, `{seller_name}`,
`{dispatcher_name}` e `{dispatcher_phone}`. Exige membro com telefone válido (DDI 55).

**Valores de `occurrence`** (lógica da coluna, o `CASE` da query do DS): `No Show Seller`, `No Show 3PL`, `Partial Pickup`,
`Full Pickup`, `Disabled`, `NB Disabled`, `System Disabled`, `Reassigned` e `evaluate` (resíduo que nenhuma regra classificou).
O comentário da coluna fala em "DRIVER", mas o valor é **`No Show 3PL`**, então as constantes do código (`No Show Seller` e
`No Show 3PL`) estão corretas. Só esses dois interessam ao sistema; os demais são ignorados pela fila e pelos indicadores.

**Duas coisas diferentes chamadas "SPX Fault":** (a) `onhold_type = 'SPX Fault'` (dentro da query do DS) nasce da **justificativa**
do motorista (baú cheio, quebra, área de risco, não passou ou não localizou o endereço) e leva a `No Show 3PL`;
(b) `spx_fault = 'NSS SPX Fault'` (coluna da tabela) nasce de **raio e horário** e só existe para `No Show Seller`. O sistema
usa apenas (b), como `fault_type`.

**Nomes de campo que o código compara com textos exatos do Data Suite** (se a API mudar o texto, os números quebram em
silêncio): `raio` = `Fora do raio` / `Dentro do raio` / `NA`; `horario_funcionamento` = `Fora do horário de funcionamento` /
`Dentro do horário de funcionamento`; `fault_type` = `NSS SPX Fault` / `NSS Seller Fault`; `seller_performance` = os valores
da tabela acima.

## 8. Telas

Rotas por **caminho**; o Django devolve o `index.html` para elas (F5 e links diretos funcionam, ver `config/spa.py`).
Os filtros compartilhados (período, regional, station) ficam na URL; `treated` ausente significa **Pendentes**, e
`treated=all` significa todas.

- **Fila** (`/`): lista priorizável (mais recentes, mais pacotes parados, mais reincidentes) com detalhe: justificativa
  do motorista, evidência (raio e horário), WhatsApp, tratativa e histórico. Abre em Pendentes dos últimos 7 dias.
  Setas do teclado percorrem a lista; ao salvar uma tratativa, avança para a próxima pendente.
- **Tratativas** (`/tratativas`): registro do que foi feito. Indicadores, tabela (resultado, justificativa, quem tratou,
  quando, tempo), linha expansível (rota, quem alocou, contatos feitos), filtros e **exportação CSV** (`;`, UTF-8 com BOM,
  sem telefones, com proteção contra injeção de fórmula). **O período aqui é a data da tratativa**, não a da ocorrência.
- **Recorrência** (`/recorrencia`): sellers, motoristas e rotas com ocorrência em 2 ou mais dias (configurável), com o
  padrão de causa, hipóteses e linha do tempo. Ao entrar, amplia o período para 30 dias se estiver curto.
- **Indicadores** (`/indicadores`): performance de **dispatchers** (rotas com no-show, tratadas, revertidas, drivers
  acionados, mensagens, média de resolução) e de **drivers** (no-show driver x seller, sellers recorrentes, reversões),
  mais os números gerais. Considera no-shows (No Show Seller e No Show 3PL) **de qualquer fila**. A própria tela traz
  "Como cada número é calculado".
- **Insights** (`/insights`): leituras em frases, evolução diária, idade das pendências, causa, hora do dia, resultado e
  justificativas, ranking de stations e reincidência. Clicar abre a Fila filtrada.

## 9. API

Prefixo `/api`. Tudo exige sessão, exceto `POST /auth/google/`. Listas paginadas têm 50 itens por página.

| Método | Rota | Uso |
|---|---|---|
| POST | `/auth/google/` | `{credential}` e abre a sessão |
| POST | `/auth/logout/` | encerra a sessão |
| GET | `/me/` | e-mail, stations e regionais do usuário |
| GET | `/queues/` | filas e opções dos selects (reversão e justificativa) |
| GET | `/occurrences/` | filtros: `queue`, `regional`, `station_code` (lista), `treated`, `search`, `date_from`, `date_to`, `shop_id`, `pickup_point_id`, `seller_group`, `driver_id`, `route`; `ordering`: `date`, `packages`, `recurrence` (prefixo `-` = decrescente) |
| GET | `/occurrences/summary/` | KPIs do recorte |
| GET | `/occurrences/insights/` | agregações da tela de Insights |
| GET | `/occurrences/recurrence/` | `entity` (`seller`, `seller_group`, `driver`, `route`), `min_days`, `order`, `limit` |
| GET | `/occurrences/filter-options/` | pares regional/station para os filtros |
| GET | `/occurrences/{id}/history/` | contatos feitos na ocorrência |
| GET | `/occurrences/{id}/contact-options/` | membros da station (`is_me` pré-seleciona) |
| POST | `/occurrences/{id}/contact/` | `{member_id}` devolve `{whatsapp_url, message}` e grava a auditoria |
| PUT | `/occurrences/{id}/treatment/` | `{reversal, justification, justification_text}` |
| GET | `/treatments/` | registro (`reversed`, `justification`, `treated_by`, `search`, `ordering`; **`date_from/date_to` = data da tratativa**) |
| GET | `/treatments/summary/` | totais, por resultado, por justificativa, por pessoa, por dia |
| GET | `/treatments/export/` | CSV com os mesmos filtros |
| GET | `/indicators/overview/` | números gerais |
| GET | `/indicators/dispatchers/` | `order`: `routes`, `messages`, `routes_reverted`, `slowest` |
| GET | `/indicators/drivers/` | `order`: `occurrences`, `no_show_driver`, `repeat_sellers`, `reverted`, `packages`; `group_by`: `shop` (padrão) ou `group` (conta os sellers por seller group) |
| GET | `/healthz` | verificação de saúde (fora de `/api`) |

Erros vêm como `{"detail": "mensagem"}` ou `{"campo": ["mensagem"]}`.

## 10. Integração com o Data Suite e dados externos

O backend não conhece a query do DS: conhece a **API** (`apps/ingestion/sources/`). Trocar mock por real é `INGESTION_SOURCE=datasuite` mais
`DS_API_BASE_URL` e `DS_API_TOKEN` (seção 6). `ingestion/normalize.py` traduz cada linha da API para o contrato do sistema. A API **já existe e foi
vista numa amostra real** (outubro/2026), mas **URL, autenticação, envelope externo e paginação ainda não foram confirmados** (roteiro na seção 19).

### O que a API devolve (amostra real)
- **Cada linha vem embrulhada:** `{"rowNumber": 4, "values": {...}}`. O envelope de fora (chave da lista, paginação) ainda não foi visto. O adapter aceita
  lista pura, `items`, `rows`, `data`, `results`, `records`, `values` (ou a primeira lista de objetos) e `next_cursor`, `nextCursor`, `next_page_token` ou
  `nextPageToken` (enviado como `?cursor=`).
- **Os nomes são os da tabela** `dwd_spx_fm_no_show_center_di_br` (diária, parquet, partição `grass_month`). A API devolve **só a última carga**.
- **Nulo vem como o texto `"null"`** (`spx_fault`, `radius_diff`, e-mails). `NA` é um valor válido de `raio`.
- **IDs são texto:** `pickup_task_id` (`PT20261021E11PP`), `shop_id` (`DOP7919` para DOP/Locker, número para sellers) e `pickup_point_id`
  (`DOP7919_001`, `1234_001`). O seller group continua sendo o prefixo antes do `_` (`DOP7919_001` e `DOP7919_002` são o grupo `DOP7919`).
- **A API devolve todas as ocorrências do dia**, inclusive `Full Pickup`. O sistema grava só os tipos de `INGEST_PERFORMANCES`
  (padrão: `No Show Seller` e `No Show 3PL`); os demais são ignorados e contados em `ignored`.
- `regional_pic` traz o **nome** do gerente da regional (não e-mail). `dispatcher_email_address` e `supervisor_email_address` vêm como e-mail ou `"null"`
  (a planilha OF TEAM pode não cobrir todos os drivers).
- **Não há coluna "momento do no-show".** O adapter usa `done_datestamp`, depois `disabled_datestamp`, depois `pickup_start_datestamp`, a mesma
  prioridade da query original. **Confirmar com o DS** (e o fuso: as datas vêm sem fuso e são lidas como Brasília).
- `close_hour` (`HH:MM`) e os decimais (`open_hour_decimal`, `close_hour_decimal`) vêm; se o texto faltar, é derivado do decimal.

### Consequências de a API devolver só a última carga
**O sistema acumula o histórico e a fonte não.** Cada ocorrência chega uma vez por rodada e a ingestão faz upsert por `pickup_task_id`.
1. **Carga perdida é dado perdido.** Se uma rodada do Job falhar e a carga seguinte substituir a anterior, os no-shows daquela janela nunca chegam ao
   sistema. O Job deve rodar **com mais frequência que a carga**, com retry e alerta de falha, e vale pedir à API um **parâmetro opcional para reprocessar
   uma carga ou dia específico** (a tabela guarda o histórico, só a API o esconde).
2. **Caso que some da carga seguinte fica "pendente para sempre".** O sync **só insere e atualiza**; nunca remove nem desativa. Se um no-show deixar de
   aparecer (o motorista voltou e coletou, ou a ocorrência foi reclassificada), a linha continua na Fila. Falta decidir o tratamento (seção 18.4).
3. **A frequência da carga define a atualidade da Fila.** Com carga diária, a Fila vira ferramenta do dia seguinte. Os parâmetros `date_from`, `date_to` e
   `updated_since` podem ser ignorados pela API sem quebrar nada.

### Mapeamento tabela -> campo do sistema (`ingestion/normalize.py`)
Aplicado só quando o campo do sistema não vem na linha. Idempotente.

| Coluna da tabela | Campo do sistema | Observação |
|---|---|---|
| `pickup_task_id` | `pickup_task_id` | Chave única. **Texto.** |
| `event_date` | `occurrence_date` | `YYYY-MM-DD` |
| `done_datestamp`, `disabled_datestamp`, `pickup_start_datestamp` | `occurred_at` | Derivado (ver acima). **Confirmar** |
| `occurrence` | `seller_performance` | Valores na seção 7 |
| `spx_fault` | `fault_type` | `NSS SPX Fault` / `NSS Seller Fault` (a confirmar numa linha de no-show) |
| `justification` | `driver_justification` | |
| `shop_id` | `shop_id` | **Texto** (`DOP7919`) |
| `pickup_point_id` | `pickup_point_id` e `seller_group` | Texto; o grupo é o prefixo antes do `_` |
| `pickup_point_name` | `seller_name` | **Confirmar:** para DOP/Locker o nome parece ser de projeto, não de seller |
| `pickup_driver_id`, `pickup_driver_phone`, `driver_name` | `driver_id`, `driver_phone`, `driver_name` | Telefone normalizado para DDI 55 |
| `route_display_name`, `trip_id` | `route_name`, `trip_id` | |
| `station_code`, `regional` | mesmos nomes | |
| `dispatcher_email_address` | `dispatcher_email` | **Responsável pelo motorista** (planilha OF TEAM), não quem alocou a rota. Pode ser nulo |
| `supervisor_email_address` | `supervisor_email` | Supervisor do dispatcher. Pode ser nulo |
| `regional_pic` | `regional_manager` | **Nome** do gerente da regional |
| `raio`, `radius_diff`, `horario_funcionamento` | mesmos nomes | `radius_diff` = metros entre o motorista e a borda do geofence; pode ser nulo mesmo com `Fora do raio` |
| `open_hour`, `close_hour` | mesmos nomes | Se faltar o texto, deriva de `open_hour_decimal`/`close_hour_decimal` |
| `pickup_quantity`, `onhold_order_count` | mesmos nomes | |
| (sem coluna) | `allocated_by` | Quem alocou a rota **não vem**; os Indicadores usam `dispatcher_email` |
| (sem coluna) | `packages_recovered` | O DS diz que **o registro existe**; falta o nome da coluna ou tabela e a ligação com `pickup_task_id` |

Colunas conhecidas e **não usadas**: `id` (uuid de append), `task_status`, `driver_vehicle_type_name`, `pickup_station_name`, `fm_schedule_id`,
`horario_comercial`, `atualizacao_timestamp` (horário da **carga**, não do evento), `grass_date`, `grass_month`.

### Pedidos ao time do Data Suite, em ordem de prioridade
1. **Envelope e paginação da resposta** (as chaves de fora das linhas), URL, autenticação, e se a API aceita filtro por data.
2. **O instante do no-show como coluna própria** (o usado para decidir `horario_funcionamento`), com formato e fuso documentados. Hoje é derivado.
3. **Pacotes recuperados** por ocorrência, ligados ao `pickup_task_id`, com o instante da recuperação. **A linha de uma ocorrência revertida não deve
   sumir da carga**: se sumir, perde-se justamente o registro da recuperação.
4. Parâmetro opcional de **reprocessamento** (carga ou dia específico) e a **frequência da carga**.
5. Confirmar `seller_name` (`pickup_point_name`) e os valores de `spx_fault`, `raio` e `horario_funcionamento` numa linha de **no-show** (a amostra era `Full Pickup`).
6. Medir o resíduo: `SELECT occurrence, COUNT(*) FROM ... GROUP BY 1`. Linhas em `evaluate` são no-shows que nenhuma regra classificou e **não aparecem
   no sistema**. O `CASE` tem ramos mortos: `'Local Fechado'` (F maiúsculo, não casa com `Local fechado`), `justification = 'Seller Fault'` (compara o texto do
   motorista com o nome de um tipo) e `'No order'` (nunca produzido).
7. **Cobertura da planilha OF TEAM:** quantos drivers ficam sem `dispatcher_email`/`supervisor_email`. Linhas sem dispatcher não aparecem nos Indicadores por dispatcher.
8. Confirmar que **todos os PUPs seguem o formato** (`1234`, `1234_001`, `DOP7919_001`) e vêm preenchidos (consulta em 18.5).

### Formatos aceitos pela ingestão (cobertos por testes)
- Números como texto: `"55"`, `" 55 "` e `"55.0"` valem 55; vazio vale nulo (0 em quantidades). Texto não numérico descarta a linha.
- IDs (`pickup_task_id`, `shop_id`, `pickup_point_id`): **texto**, gravado como veio (só limpa espaços; `1234.0` vira `1234`).
- `occurrence_date`: `YYYY-MM-DD`; se vier com hora, usa só a data.
- `occurred_at`: ISO 8601 com ou sem espaço (sem fuso = Brasília) ou **epoch** em segundos ou milissegundos (instante UTC). A query original usa
  `ctime - 39600` (deslocamento de 11 h): se a API entregar um epoch já deslocado, o horário sairá errado.
- `radius_diff`: número; vazio, `NA` ou `"null"` viram nulo.
- **Linha inválida** (sem `pickup_task_id` ou `shop_id`, data ou número inválidos) é **ignorada e contada em `skipped`**, sem derrubar a rodada; o log
  registra só o `pickup_task_id` e o motivo (a linha tem telefone e não é gravada no log).

### Regras de sincronização (`ingestion/services.py`)
Upsert de ocorrências por `pickup_task_id` (a fila é reavaliada, exceto se já houver tratativa); tipos fora de `INGEST_PERFORMANCES` são ignorados (`ignored`);
membros por (e-mail, station), desativados e nunca apagados se sumirem da fonte, e `source=manual` nunca é sobrescrito; telefones normalizados para DDI 55.
O sync **nunca remove nem desativa** ocorrências que sumiram da fonte.

### Membros das stations (API ainda não vista)
Contrato proposto: `GET /station-members?updated_since&cursor` devolve `{items, next_cursor}`; item: `member_email`, `member_name`, `member_phone`,
`station_code`, `role`, `is_active`.

### Participação em treinamentos (ainda não existe)
O time de treinamentos mede, registra no Sheets, e depois vai para o DS e para o sistema. Contrato sugerido, **uma linha por driver por treinamento**:
`driver_id` (a chave que cruza com as ocorrências; nome não serve), `treinamento`, `data`, `status` (`Convocado`, `Presente` ou `Ausente`), `station_code`
(opcional). **% de participação = presentes ÷ convocados no período** (combinar com o time). Implementação prevista: um novo adapter no padrão de
`ingestion/sources`, um modelo simples e o preenchimento do cartão em `IndicatorsView.tsx`; com `driver_id` dos dois lados dá para cruzar treinamento x recorrência.

## 11. Modelo de dados

| Modelo (app) | Papel | Pontos importantes |
|---|---|---|
| `Occurrence` (occurrences) | Uma ocorrência vinda do DS | `pickup_task_id` único e **texto** (ex.: `PT20261021E11PP`); `shop_id` (`DOP7919` ou número) e `pickup_point_id` também são texto; `queue` pode ser nulo (sem fila não é tratável) |
| `Queue`, `QueueRule` (occurrences) | Fila e a regra que roteia a ocorrência para ela | Regra por `seller_performance`, justificativa e `fault_type`; campos vazios = qualquer valor |
| `TreatmentOption` (treatments) | Opções dos selects, por fila | `kind` = reversão ou justificativa; `requires_text`; `counts_as_reversed` |
| `Treatment` (treatments) | Tratativa de uma ocorrência | **OneToOne**; ficou em tabela separada para a ingestão nunca sobrescrevê-la |
| `ContactAttempt` (treatments) | Cada acionamento por WhatsApp (auditoria) | `sent_by` = quem clicou (login); `member` = o nome que assinou a mensagem |
| `MessageTemplate` (treatments) | Texto do WhatsApp, por fila | Variáveis na seção 7 |
| `StationMember` (accounts) | Quem pode tratar uma station | Único por (e-mail, station); `source` = `datasuite` ou `manual` |
| `RegionalAccess` (accounts) | Coordenador de uma regional | Acesso de tratativa a todas as stations dela |

Abrir uma **nova fila** é cadastro (admin): `Queue` + `QueueRule` + `TreatmentOption` + `MessageTemplate`, sem deploy.

## 12. Decisões de projeto (e por quê)

1. **Tratativa separada da ocorrência.** A ingestão faz upsert das ocorrências a cada rodada; se a tratativa vivesse na mesma
   linha, seria sobrescrita. Ocorrência já tratada também mantém a fila.
2. **Filas configuráveis por dados**, para abrir "No Show 3PL" e outras sem mexer em código.
3. **WhatsApp por link `wa.me`**, sem API oficial: o envio sai do WhatsApp de quem clica. A mensagem é assinada com o nome
   e telefone do dispatcher escolhido na lista (o logado vem pré-selecionado) e o `ContactAttempt` registra os dois.
4. **Mesma origem** (o Django serve o build do React): sem CORS, sessão e CSRF simples, um serviço só no Cloud Run.
5. **Painel visível a todos, telefone mascarado fora da station** (LGPD). Ver, tratar e acionar são permissões diferentes.
6. **Tentativas até o sucesso** = acionamentos por WhatsApp feitos **até a tratativa que reverteu** a ocorrência (zero =
   revertida sem acionamento registrado). Não há histórico de edições da tratativa: `updated_at` é a última edição.
7. **Dispatcher tem duas identidades.** "Quem alocou a rota" vem do DS (nome); "quem aciona e trata" é o e-mail do login. O
   vínculo é feito pelo **nome cadastrado na station**, sem acento nem caixa (`indicators/services.py::norm`). Se os nomes
   divergirem, a mesma pessoa aparece em **duas linhas** (e a tela avisa). A tabela agora traz `dispatcher_email_address`; ao ingeri-lo, o vínculo passa a ser por e-mail (o código **ainda usa o nome**).
8. **Indicadores são sensíveis.** Performance individual é mais delicada que a fila. O padrão é qualquer logado ver
   (coerente com "painel visível a todos"); `INDICATORS_RESTRICTED=1` limita a admin e coordenadores. É uma decisão de
   política da operação, não técnica.
9. **O período da tela de Tratativas é a data da tratativa**; nas demais telas é a data da ocorrência.
10. **Exportação CSV segura:** separador `;`, UTF-8 com BOM (Excel em pt-BR), sem telefones, e células que começam com
    `=`, `+`, `-` ou `@` recebem um apóstrofo (nomes de seller vêm de fora e o arquivo é aberto no Excel).
11. **Agregações em SQL** (insights, recorrência, indicadores). Só o vínculo de dispatchers e a contagem de sellers
    recorrentes por driver são montados em Python.
12. **Filtros na URL** para poder mandar o link de uma visão filtrada.
13. **IDs do DS são texto** (`pickup_task_id`, `shop_id`, `pickup_point_id`): a API real manda `PT...` e `DOP7919`. Nunca converter para inteiro.
14. **Só os tipos úteis viram registro** (`INGEST_PERFORMANCES`): a API devolve todas as ocorrências do dia, e gravar `Full Pickup` nacional
    encheria o banco de linhas sem tratativa. O filtro vale para a fonte real e para `--file`, não para o mock (que traz tipos extras de propósito).
15. **Nulo vem como o texto `"null"`** da API; é convertido em nulo na borda (`normalize.py`). `NA` não é nulo: é um valor válido de `raio`.

## 13. Testes e verificação

- **Backend:** `python manage.py test tests`. São 90 testes em `tests/test_flow.py` (ingestão e seus formatos, API, permissões, mascaramento
  de telefone, tratativa, WhatsApp, insights, recorrência, registro e CSV, indicadores, fallback do SPA). Usam o adapter
  mock, sem rede.
- **Frontend:** `npm run build` roda `tsc -b` (estrito) e o build. Não há testes unitários de componente.
- **Navegador:** **não há suíte de testes de navegador no repositório.** Durante o desenvolvimento foram feitas verificações
  com Chromium headless, e vale recriá-las (por exemplo com Playwright). O roteiro que foi usado:
  1. Servir o build pelo Django (`npm run build`, copiar `frontend/dist` para `backend/frontend_dist`).
  2. **Autenticar sem Google:** criar usuários Django e gravar uma sessão (`SessionStore`) com os campos de
     `SESSION_KEY`, `BACKEND_SESSION_KEY` e `HASH_SESSION_KEY`; injetar o cookie `sessionid` no navegador.
  3. Rodar com **três perfis:** administrador, membro de uma station e usuário sem vínculo.
  4. **Comparar o que a tela mostra com o que a API devolve** (contagens, primeira linha, KPIs), em vez de só checar que
     "aparece algo".
  5. Fluxos: acionar (POST `/contact/` devolve 201 e abre `wa.me`), tratar (PUT devolve 200 e os pendentes caem em 1),
     drill-downs entre telas, F5 em cada rota, exportação CSV, modo `INDICATORS_RESTRICTED=1`.
  6. Celular em 390 px e 360 px: **sem rolagem horizontal** da página e os 5 itens de navegação visíveis.
  7. Nenhum erro no console.
- Ao mexer na API, **atualize junto** `serializers`/views, `frontend/src/types.ts`, `api.ts`, `mockApi.ts` e os testes.

## 14. Deploy (GCP)

Nada disso foi executado ainda; é o plano.

- **Imagem:** `docker build --build-arg VITE_GOOGLE_CLIENT_ID=<id> -t occurrence-hub .`. O build do front entra em
  `backend/frontend_dist` e o WhiteNoise o serve. O `Dockerfile` força `VITE_USE_MOCK=0` (um `.env` de desenvolvimento
  com mock **nunca** pode virar produção).
- **Serviço Cloud Run** com as variáveis da seção 6: `DJANGO_SECRET_KEY` (Secret Manager), `DJANGO_ALLOWED_HOSTS`,
  `CSRF_TRUSTED_ORIGINS`, `DB_*` (Cloud SQL), `GOOGLE_CLIENT_ID`, `INGESTION_SOURCE=datasuite`, `DS_API_*`.
  Com `DJANGO_DEBUG` desligado, os cookies passam a ser `Secure` e o proxy HTTPS é respeitado.
- **O container só executa o `gunicorn`: ele NÃO roda migrações.** É preciso um passo de release (por exemplo um Cloud Run
  Job) com `python manage.py migrate` e `python manage.py seed_defaults` (idempotente) a cada deploy.
- **Ingestão:** um Cloud Run Job com `python manage.py sync_ingestion --only occurrences`, disparado pelo Cloud Scheduler. Como a
  API devolve só a última carga, **uma rodada que falhar não pode ser recuperada depois** (seção 10): agende com frequência maior
  que a da carga, com retry e alerta de falha. Os membros das stations podem rodar em outro ritmo (`--only members`).
- **Pendente:** `.gitlab-ci.yml`, configuração do Cloud SQL e o OAuth no GCP (origens autorizadas = URL do serviço).
- O login deve seguir o padrão do Training Platform SVP: aqui é ID token e sessão Django; se aquele projeto usar outro
  fluxo, só `apps/accounts/views.py` e a tela de login mudam.

## 15. Pendências priorizadas

As pendências que decorrem das reuniões de validação estão na seção 18 e **têm prioridade sobre as de P2**.

**P0: bloqueiam a produção**
1. **Ligar a API do Data Suite** (seção 19): **obter uma credencial válida (e saber se ela expira)**, confirmar envelope e paginação, rodar `check_source` e fazer a primeira carga.
   Faltam do DS: o instante do evento como **coluna própria** (hoje derivado de `done_datestamp`) e os **pacotes recuperados**.
2. Google OAuth real (Client ID, origens autorizadas) e alinhamento com o login do Training Platform.
3. Cloud SQL, Cloud Run, passo de migração, Job de ingestão com Scheduler, CI.

**P1**
4. **Hierarquia: ingestão feita.** `dispatcher_email`, `supervisor_email` e `regional_manager` já são gravados e os Indicadores ligam o dispatcher
   pelo e-mail. **Falta:** trocar "Alocada por" por "Dispatcher responsável" na Fila, decidir o uso de supervisor e gerente (alertas, filtros)
   e usar o gerente da regional como fonte automática de `RegionalAccess`, hoje feito à mão.
4a. **Alternância "PUP/Shop" x "seller group" no front** (Recorrência e Indicadores). O backend já está pronto: `entity=seller_group` na
    recorrência e `group_by=group` nos drivers. A API também devolve `pickup_point_id` e `seller_group` em cada ocorrência, e nenhuma tela os usa.
5. Pipeline de **participação em treinamentos** (Sheets, DS, adapter, cartão, cruzamento com recorrência).
6. Decidir a política de visibilidade dos Indicadores (`INDICATORS_RESTRICTED`).
7. Sincronização em lote (`bulk_create`/`bulk_update`) quando o volume nacional exigir: hoje é um upsert por linha.
7a. **Ocorrências que somem da carga seguinte** (seção 10): decidir o tratamento (por exemplo, marcar como "saiu da fonte" e
    tirar da Fila, o que também revelaria reversões espontâneas). Exige `last_seen` ou um status em `Occurrence`, uma
    migração, e cuidado para **só marcar após uma carga completa** (uma falha no meio das páginas não pode "remover" ocorrências).

**P2**
8. **(subiu para P1, seção 18)** Histórico de edições da tratativa (modelo append-only), útil para auditoria e para "tentativas" mais precisas.
9. Acessibilidade: o front usa textos de **8 a 10 px** em muitos pontos; subir para 12 px ou mais e rever contraste. As
   telas Tratativas, Recorrência e Indicadores já usam 11 a 13 px, então há inconsistência visual a resolver junto.
10. Filtros próprios de Tratativas e Recorrência (resultado, justificativa, pessoa, mínimo de dias) ainda não vão para a URL.
11. Nome do produto escrito à mão em 4 lugares (`App.tsx` cabeçalho e rodapé, `LoginScreen.tsx`, `index.html`): centralizar.
12. `occurrences/insights.py` compara `horario_funcionamento` com o texto **exato**, enquanto `recurrence.py` usa
    `startswith("Fora")`. Unificar.
13. Desempenho: `indicators/services.py::drivers()` carrega todos os drivers do recorte em memória para ordenar; materializar
    ou paginar no banco se houver milhares de drivers por consulta. Tabelas de Indicadores mostram só os 100 primeiros.
14. Novas filas (No Show 3PL, Partial Pickup, Disabled): cadastrar `Queue`, regras, opções e templates.

## 16. Armadilhas conhecidas

- **PowerShell:** o Windows PowerShell 5.1 **não aceita `&&`**; variáveis `$env:` valem só para o terminal onde foram
  definidas (um terminal novo precisa repetir `DJANGO_DEBUG` e `DJANGO_ALLOW_INSECURE`); `export` é de bash.
- **Abra o front no Chrome ou no Edge, não no navegador embutido do VS Code.** O Simple Browser abre a página dentro de um iframe, e os
  cookies de sessão do Django (`SameSite=Lax`) não valem nesse contexto: o login não persiste e a tela pode mostrar "Failed to load page".
- **Sempre a porta 5173 em desenvolvimento.** Sessão e CSRF dependem da mesma origem (o Vite faz o proxy). A 8000 serve só
  API, admin e, se existir, o build em `backend/frontend_dist`.
- **Cópias duplicadas do projeto.** Já houve edição na pasta errada: confira o caminho (o erro do Vite mostra o caminho
  completo) e feche servidores antigos. O Vite tem `strictPort: true`: com a 5173 ocupada ele **falha** (`Port 5173 is already in use`)
  em vez de subir em outra porta. Em outra porta (5174...) o CSRF recusa as escritas, porque só `localhost:5173` é confiável.
- **O `.venv` não é portátil.** Mudou a pasta, recrie o ambiente virtual.
- **O WhiteNoise serve `backend/frontend_dist` assim que ele existe.** Testes que assumem "sem build" não devem
  requisitar `/` (usam `/insights`).
- **Textos exatos do DS** (seção 7): mudou o texto, mudam os números sem erro.
- **A API devolve só a última carga.** Não há reprocessamento hoje: rodada perdida é dado perdido, e ocorrência que some da
  fonte permanece pendente no sistema (seção 10).
- **A API devolve todos os tipos de ocorrência do dia**, não só no-shows. Sem `INGEST_PERFORMANCES` o banco se enche de `Full Pickup`.
- **Nulo chega como o texto `"null"`.** Gravado cru, viraria e-mail `null` ou tipo de falha `null`; a normalização cuida disso (`normalize.py`).
- **Horários da API não têm fuso** (`"2026-10-21 11:49:02"`): o sistema os lê como Brasília. Se a API estiver em UTC, o `check_source` acusa "horário no futuro".
- **Código do DS é texto: nunca use `int()` nem `float()` num código com `_`.** O Python lê `"1234_001"` como `1234001` (o `_` é
  separador de dígitos, PEP 515): o sufixo some **em silêncio**, o grupo se perde e o valor pode colidir com outro seller. Foi um bug real
  do `pickup_point_id`; use `_to_code` em `ingestion/services.py`.
- **"SPX Fault" tem dois significados** na query do DS (`onhold_type`, vindo da justificativa, e `spx_fault`, vindo de raio e
  horário). O sistema usa só o segundo, como `fault_type` (ver seção 7).
- **Colunas do DS são `VARCHAR`.** Antes da correção, `"55.0"` descartava a linha em silêncio e uma data com hora ou um
  epoch **derrubava a sincronização inteira**. Hoje isso é tolerado e testado; ao mexer em `ingestion/services.py`, preserve
  que uma linha ruim nunca aborta a rodada e que o log nunca imprime a linha (tem telefone).
- **Datas:** o banco guarda UTC e o app trabalha em `America/Sao_Paulo`; filtros por data usam o fuso local. As ocorrências
  chegam do DS sem fuso e são interpretadas como horário de Brasília.
- **Dados de demonstração** podem gerar "0 h" de resolução (tratativa anterior à ocorrência, limitada a 0). Com dados reais
  isso não deve ocorrer.
- **Django ORM (lições dos testes):** não dê a uma anotação o mesmo nome de um campo do modelo (`id`, `name`...), e `Count`/`Sum`
  sobre joins de relação reversa **duplicam linhas** (use `distinct=True` ou subquery). O resumo de tratativas quebrava assim.
- **Mock x real:** `VITE_USE_MOCK` ausente ou `0` usa a API real. O mock não exercita CSRF, sessão nem permissões.

## 17. Convenções

- Interface e mensagens em **português do Brasil**; números como `1.234` e `6,8 h`; datas e horas em America/Sao_Paulo.
- O **nome do produto** é **No-Show Center**.
- Todo endpoint novo ganha teste em `tests/test_flow.py`, e o contrato (`types.ts`, `api.ts`, `mockApi.ts`) é atualizado junto.
- Telefone de driver **nunca** sai sem passar pela regra de escopo (`AccessScope.can_see_phone`) e **nunca** vai para o CSV.
- Regras de negócio com mais de uma leitura possível (reversão, tentativas, dispatcher) são **explicadas na própria tela**.
- Sem biblioteca de UI e sem dependências externas de runtime além do que está em `requirements.txt` e `package.json`.

## 18. Decisões das reuniões de validação (outubro/2026)

Reuniões de validação com a gestão da operação. **Resultado:** a V1 foi aprovada conceitualmente e o foco é a **primeira entrega
funcional** (ajustes essenciais, base de dados consolidada, validação com a operação). Acionamento massivo, automações e novos
indicadores ficam para depois: **não antecipar**. Reconhecer a autoria da regional que criou o painel original.

### 18.1 Decisões e impacto no código

| # | Decisão | Situação hoje | O que muda |
|---|---|---|---|
| 1 | Gestão **por station**, tratamento **colaborativo**, sem carteira fixa de sellers por pessoa; motoristas e rotas mudam todo dia | Já é assim: qualquer membro da station vê, aciona e trata | **Tensão com os Indicadores por dispatcher "dono do driver"** (`dispatcher_email_address`): como a rota muda a cada dia, vale medir o que cada pessoa **fez** (acionamentos, tratativas, tempo) mais do que "rotas dele". Decisão em aberto (18.4) |
| 2 | O histórico identifica **quem acionou e quem tratou**, mesmo com mais de um dispatcher | Acionamentos: sim (`ContactAttempt.sent_by`). **Tratativa: só a última**: `Treatment` é OneToOne e editar sobrescreve `treated_by` | Subir o histórico append-only de tratativas (era P2, agora P1) |
| 3 | Tratativa por **PUP/Shop ID**; indicadores consolidáveis por **seller group** | Tudo por `shop_id` | **Decidido:** seller group = prefixo do PUP antes do `_` (`1234`, `1234_001` e `1234_002` são um grupo). **Backend pronto** (campo `seller_group`, filtros, `entity=seller_group`, `group_by=group`). **Falta a alternância na tela** |
| 4 | Resultados: Coletado, **Coleta parcial**, Não revertido, **Baixa ajustada** (não conta automaticamente como reversão) | Coletado, Batida ajustada (**conta como reversão**), Não revertido | (a) criar "Coleta parcial"; (b) `Batida ajustada` passa a `counts_as_reversed=False`; (c) o booleano `counts_as_reversed` não basta: precisa de um **tipo de resultado** (total, parcial, ajuste, nenhum) em `TreatmentOption`, com migração dos dados existentes; (d) confirmar o rótulo: a ata diz "Baixa ajustada", a tela diz "Batida ajustada" |
| 5 | Separar **ocorrências revertidas** de **pacotes recuperados**, sem misturar bases de cálculo | Só ocorrências; "pacotes parados" é apenas um proxy | **Decidido: os pacotes recuperados vêm do DS** (o registro existe lá). Falta saber **qual coluna ou tabela** e **como liga à ocorrência** (idealmente por `pickup_task_id`). Plano: campo `Occurrence.packages_recovered` (nulo quando não houver dado), ingestão tolerante, e reversão por pacotes = recuperados ÷ pacotes pendentes, **com a base escrita na tela**. Como o dado vem da fonte, dá para **comparar o resultado declarado pelo dispatcher com o que o DS confirma** |
| 6 | Acionamento **individual** por WhatsApp na V1; **massivo** depois | Individual pronto | Massivo: checkboxes para escolher ocorrências do mesmo motorista e uma mensagem consolidada. Gravar **um `ContactAttempt` por ocorrência selecionada**, com um id de lote em comum, para manter a auditoria |
| 7 | Mensagem ao motorista mais simples | Template longo, com três parágrafos | Editável no `/admin` (`MessageTemplate`), **sem código** |
| 8 | Experiência: ações primeiro, fila separada da recorrência, destacar o encerramento da tratativa | Fila e Recorrência já são telas separadas; a ordenação padrão é "mais recentes" | Ordenação por **prioridade** (sem contato primeiro, depois pacotes e recorrência); destaque visual da tratativa encerrada |
| 9 | **Indicadores de adesão** (uso e frequência por station) | Não existe | Dá para construir **sem coluna nova**, com `ContactAttempt`, `Treatment` e `User.last_login`: por station, ocorrências x acionadas x tratadas, usuários ativos e última atividade. Cuidado: station **sem ocorrência** não é station **sem uso** |
| 10 | **Alertas automáticos** de pendências para supervisores (depois) | Não existe | Usa `supervisor_email_address` (já na tabela). **Responde para que servem supervisor e gerente:** alertas e visibilidade, e não requisito da V1 |
| 11 | Disponibilizar ao DS os **registros da plataforma** | Só exportação CSV | Definir como tratativas e contatos chegam ao DS/BI (API de leitura, exportação agendada...) |
| 12 | GitLab, ambiente, banco e persistência | `Dockerfile` escrito; **nada provisionado** | P0 da seção 15 |

### 18.2 Cuidados de linguagem
- **"Coleta parcial"** (resultado da **tratativa**: o que foi recuperado) **não é** **"Partial Pickup"** (tipo de **ocorrência** vindo do DS:
  o motorista coletou só uma parte). Usar nomes distintos na tela e nos materiais de treinamento.
- A ata chama o painel de "Painel NSS"; o produto se chama **No-Show Center**. Padronizar nos materiais de treinamento.

### 18.3 Checklist da ata x estado do código

| Item da ata (V1) | Estado |
|---|---|
| Padronizar a reversão por ocorrências e por pacotes | **Não feito** (decisões 4 e 5) |
| Incluir e validar a coleta parcial | **Não feito** (decisão 4) |
| Revisar organização e priorização da fila | **Parcial** (existe ordenação; falta prioridade, decisão 8) |
| Melhorar a apresentação das tratativas e do encerramento | **Não feito** (decisão 8) |
| Tratativa por PUP/Shop ID e consolidação por seller group | **Backend pronto**; falta a alternância "PUP/Shop" x "seller group" no front (decisão 3) |
| Consolidar as bases (time do DS) | **Em andamento** fora deste repositório |
| Ambiente, banco e publicação no GitLab | **Não feito** |

Implantação e adoção (apresentar à operação da regional original, apresentar na reunião de No Show, gravar o treinamento, definir os
indicadores de adesão): não são código, exceto os indicadores de adesão (decisão 9). **O treinamento inicial não precisa aguardar a base
consolidada**; se for usar a versão de demonstração, rode `seed_demo` (agora sem tempos de resolução negativos) e avise que os dados são fictícios.
Evoluções posteriores: acionamento massivo, alertas para supervisores, insights a partir do uso real. "Tentativas até a coleta" já tem uma
primeira versão (Indicadores); a ata a trata como estudo posterior.

### 18.4 Decisões

**Fechadas**
- **Pacotes recuperados vêm do DS**, e não do dispatcher. Nenhum campo novo no formulário da tratativa.
- **Seller group = prefixo do `pickup_point_id` antes do `_`** (`1234`, `1234_001`, `1234_002` são um grupo). O DS traz o PUP; o grupo é derivado na ingestão.

**Em aberto**
1. **Qual coluna ou tabela do DS** traz os pacotes recuperados e como liga à ocorrência (`pickup_task_id`).
2. **A linha de uma ocorrência revertida permanece na carga?** (seção 10, pedido 3.)
3. **Indicadores por dispatcher:** contar as rotas dos drivers sob a responsabilidade dele (`dispatcher_email_address`, planilha OF TEAM),
   as que ele alocou (a tabela não traz), ou medir só o que cada pessoa fez? A decisão 1 sugere o terceiro caminho.
4. **Ocorrência que some da carga seguinte** (seção 10): marcar como "saiu da fonte" e tirar da Fila?
5. **Rótulo:** "Batida ajustada" ou "Baixa ajustada".
6. **Visibilidade dos Indicadores** (`INDICATORS_RESTRICTED`, seção 12).

### 18.5 Consultas para validar com o DS

Rodar sobre `dwd_spx_fm_no_show_center_di_br` (Trino/Presto). Confirmam que a regra do prefixo cobre todos os PUPs:

```sql
-- (a) Formatos de PUP: só número, número com sufixo, vazio ou outro
SELECT CASE WHEN pickup_point_id IS NULL OR pickup_point_id = '' THEN 'vazio'
            WHEN regexp_like(pickup_point_id, '^[0-9]+$') THEN 'so_numeros'
            WHEN regexp_like(pickup_point_id, '^[0-9]+_[0-9]+$') THEN 'numero_sufixo'
            ELSE 'outro' END AS formato,
       COUNT(*) AS linhas
FROM ${SCHEMA}.dwd_spx_fm_no_show_center_di_br GROUP BY 1;

-- (b) Exemplos fora do padrão (por exemplo PUPs de DOP/Locker): cada um vira o seu próprio grupo
SELECT DISTINCT pickup_point_id
FROM ${SCHEMA}.dwd_spx_fm_no_show_center_di_br
WHERE pickup_point_id IS NOT NULL AND pickup_point_id <> '' AND NOT regexp_like(pickup_point_id, '^[0-9]+(_[0-9]+)?$')
LIMIT 50;

-- (c) O nome do ponto é o do seller ou o do PUP? (hoje usado como seller_name)
SELECT split_part(pickup_point_id, '_', 1) AS grupo, pickup_point_id, shop_id, pickup_point_name
FROM ${SCHEMA}.dwd_spx_fm_no_show_center_di_br
GROUP BY 1, 2, 3, 4 ORDER BY 1, 2 LIMIT 50;
```

Como ler: (a) mostra quantas linhas ficam sem grupo (`vazio`) e quantas têm formato inesperado (`outro`); (b) lista esses formatos; (c) mostra se
`pickup_point_name` muda de um PUP para outro dentro do mesmo grupo (nesse caso o nome exibido de um grupo é o de um dos PUPs).

## 19. Roteiro: ligar a API do Data Suite (primeira ingestão com dado real)

**Estado:** a API existe (endpoint `dataservice/...` do Data Suite) e uma amostra real já foi processada (envelope `rowNumber/values`, IDs em texto, `"null"`,
tipos misturados), validada com `check_source --file`, `sync_ingestion --file` e testes de navegador. **O que falta é a conexão HTTP real:** método,
autenticação, parâmetros, envelope externo e paginação da chamada **ainda não foram vistos**, e o adapter **nunca fez uma chamada real**.

**1. Descubra como chamar a API.** A página da API no console do Data Suite mostra o método (`GET` ou `POST`), os parâmetros e a **autenticação**
(qual cabeçalho e que tipo de credencial). Sem isso o resto é tentativa. **Peça também a validade do token e como renová-lo:** se ele expirar, o Job de produção precisa renová-lo sozinho (e guardar o novo valor no Secret Manager); um token colado à mão quebra quando vence. O token é segredo: peça e envie por cofre de senhas ou Secret Manager, nunca por chat.

**2. Configure por variável de ambiente** (nada disso vai para o repositório; o token vale só para o terminal onde foi digitado). Cole o token **sem** o prefixo `Bearer ` e
**entre aspas simples** no PowerShell (`'...'`); o adapter também remove prefixo, aspas e espaços por engano:
```powershell
$env:INGESTION_SOURCE = "datasuite"
$env:DS_API_OCCURRENCES_URL = "<URL completa do endpoint>"
$env:DS_API_TOKEN = "<token>"
# se a página da API pedir:
$env:DS_API_METHOD = "POST"
$env:DS_API_AUTH_HEADER = "Authorization"; $env:DS_API_AUTH_SCHEME = "Bearer"   # esquema vazio envia o token puro
$env:DS_API_EXTRA_HEADERS = '{"X-App-Key": "..."}'
$env:DS_API_BODY = '{"pageSize": 500}'
```

**3. Sonde a API:** `python manage.py check_source --probe`. Antes, confira o FORMATO do token sem mostrá-lo (`$t = $env:DS_API_TOKEN`, depois `$t.Length`, `$t -match '\s'`, `$t -match '[<>]'`, `($t -split '\.').Count`): um token de verdade tem centenas de caracteres, nenhum espaço, nenhum `<` ou `>` e 3 partes. Tamanho 19 com espaços e `<>` é o texto de exemplo. A sondagem faz **uma** chamada e mostra o método e a URL, os **nomes** dos cabeçalhos enviados (nunca os
valores), o status HTTP, e a **estrutura** da resposta (chaves, tipos e tamanhos, **nenhum valor**), além de dizer se reconheceu a lista de linhas e a
próxima página. O resultado é seguro para colar em chat ou ticket.

**4. Interprete a sondagem e ajuste**

| O que aparece | Causa provável | Ação |
|---|---|---|
| `Cabeçalhos enviados: (nenhum: faltam credenciais?)` | `DS_API_TOKEN` não definido | Definir o token (ou `DS_API_EXTRA_HEADERS`) |
| `HTTP 401` com `Bearer token is malformed` | **Formato** do token inválido: texto de exemplo (`<...>`), prefixo `Bearer ` repetido, aspas, espaços ou quebras de linha | A sondagem diagnostica o formato (sem mostrar o token) e o adapter já limpa prefixo, aspas e espaços. Se o aviso disser "TEXTO DE EXEMPLO", cole o token de verdade |
| `HTTP 401` com `invalid_token` (sem "malformed") | Token expirado, revogado ou emitido para outra API | Gerar um token novo no Data Suite para esta API |
| `HTTP 401` ou `403` (outros) | Credencial ou cabeçalho errado | Ajustar `DS_API_AUTH_HEADER`/`DS_API_AUTH_SCHEME` ou usar `DS_API_EXTRA_HEADERS` |
| `HTTP 405` | Método errado | `DS_API_METHOD=POST` |
| `HTTP 400` | Faltam parâmetros ou corpo | `DS_API_BODY` e `DS_API_EXTRA_PARAMS`, conforme a página da API |
| `O corpo da resposta não é JSON` | A URL é de uma página, não da API | Conferir a URL |
| `Resposta da API sem lista de linhas reconhecível (chaves de nível superior: [...])` | Envelope diferente | Acrescentar a chave em `ROW_LIST_KEYS` (`sources/datasuite.py`) |
| `Próxima página: não identificada` e a API tem mais linhas | Paginação com outro nome | Ajustar `CURSOR_KEYS` e o parâmetro `cursor` em `_paginate` (e `DS_API_BODY`/`DS_API_EXTRA_PARAMS` se a paginação for por página e tamanho) |

**5. Valide o conteúdo sem gravar:** `python manage.py check_source` (ou `--file amostra.json`; `--all-types` inclui os tipos ignorados). Mostra linhas lidas,
ignoradas por tipo, válidas e descartadas (com o motivo, sem os valores), os valores contra os textos esperados, o formato do PUP, a cobertura dos campos
críticos, os campos esperados que não vieram e os que o sistema não conhece. **Termina com erro** se faltar `pickup_task_id`, houver linha inválida, a fonte
vier vazia ou não houver nenhuma linha dos tipos que o sistema usa.

| O que aparece | Causa provável | Ação |
|---|---|---|
| "Nenhuma linha dos tipos que o sistema usa" | A amostra só tem `Full Pickup` etc. | Esperar uma carga com no-shows, ou `--all-types` |
| "Campos esperados que NÃO vieram" | Coluna sem equivalente | Ver o mapeamento (seção 10) e pedir ao DS |
| "Campos recebidos que o sistema NÃO conhece" | Coluna nova | Decidir se vira campo (modelo + migração + `ALIASES`) |
| Descartadas por "data/hora inválida" ou aviso "horário no futuro" | Formato ou **fuso** do instante do evento | Confirmar que `done_datestamp` etc. estão em Brasília; ver "Formatos aceitos" |
| "Valores inesperados" em `seller_performance`, `raio`... | Texto diferente do esperado | Alinhar com o DS. **Não** mapear no código sem confirmar |
| `evaluate` maior que zero | Resíduo do `CASE` do DS | Levar ao DS (seção 10, pedido 6) |
| Cobertura baixa de `dispatcher_email` | Planilha OF TEAM incompleta | Esperado em parte; levar ao DS (pedido 7) |
| `pickup_task_id` repetido | A API devolve mais de uma carga | Pedir só a última (já combinado) |

**6. Primeira carga em um banco descartável:** `python manage.py sync_ingestion --only occurrences`. Confira que `skipped` é **0**, que `ignored` corresponde aos
outros tipos, compare as contagens **com o DS** (total por dia e por `occurrence`) e abra 3 ocorrências na Fila.

**7. Só então produção:** Job com Scheduler, na frequência da carga, com retry e alerta de falha (seção 14).

**O que não fazer:** mapear valores desconhecidos "por parecerem certos"; tratar `atualizacao_timestamp` como instante do evento; ligar o Job sem alerta de falha
(carga perdida é dado perdido); colar o token, ou amostras com telefone e nome de motorista, em chat, issue ou ticket (a sondagem foi feita para não precisar).