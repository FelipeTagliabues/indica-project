# Registro do projeto Indica

## 2026-10-24 — Migração do protótipo Lovable

Não havia um arquivo `docs/project-log.md` no projeto titular no início desta etapa. Este é o primeiro registro encontrado e foi criado sem substituir documentação anterior.

### Referência analisada

- Projeto preservado, sem alterações: `tenure-team-pulseboard-main/`.
- Stack original: React 19, TypeScript, Vite 8, TanStack Start/Router/Query, Tailwind CSS 4, componentes shadcn/ui sobre Radix UI, Lucide, Recharts e Vitest.
- Rotas encontradas: `/`, `/login` e `/painel`.
- O código original não contém banco de dados, API operacional nem autenticação Google implementada.
- O login original apenas navega para o painel; a restrição de e-mails autorizados aparece somente em comentário.
- Os indicadores iniciais são gerados deterministicamente em memória para duas carteiras ilustrativas.
- O upload aceita CSV separado por vírgula ou ponto e vírgula e mantém os dados apenas no estado React da sessão.
- As fontes Manrope e Sora são carregadas do Google Fonts.
- A infraestrutura específica do Lovable usa TanStack Start/Nitro e captura de erros, mas não implementa regras adicionais do domínio.

### Implementação no projeto titular

- Substituído o conteúdo visual inicial do template Vite pela experiência Indica.
- Implementadas as páginas inicial, login e painel como SPA com React Router.
- Preservados layout, paleta azul/branco, tipografia, cartões, filtros, sidebar, ícones e gráficos da referência.
- Preservadas as regras de filtro por carteira, tempo de casa, supervisor e produto.
- Preservados os cálculos de médias, metas e sentidos de melhor desempenho por indicador.
- Preservados os workspaces e indicadores específicos de Pernambucanas e Nubank como dados demonstrativos da referência.
- Preservados o parser CSV e o armazenamento efêmero por carteira durante a sessão.
- Corrigida a codificação dos textos em português observada na leitura do snapshot local.
- Adicionados avisos visíveis que distinguem dados demonstrativos de um CSV importado pelo usuário.
- Adicionados metadados por página, favicon do Indica, testes de renderização e testes do parser/dados.
- O painel e a biblioteca de gráficos são carregados sob demanda para reduzir o JavaScript inicial.
- Criados este registro e `docs/decisions.md`.

### Dependências adicionadas

- `tailwindcss` e `@tailwindcss/vite`: sistema visual da referência.
- `lucide-react`: conjunto de ícones usado pela referência.
- `recharts`: gráficos de linha e barras do painel; mantida a série 2.x usada na referência para fidelidade.
- `@radix-ui/react-select`: selects acessíveis do painel.
- `@radix-ui/react-slot`, `class-variance-authority`, `clsx` e `tailwind-merge`: composição do botão e classes compatíveis com shadcn/ui.
- `react-router-dom`: roteamento SPA compatível com o Vite já existente no titular.
- `vitest`, `jsdom`, `@testing-library/react` e `@testing-library/jest-dom`: validação automatizada.

### Verificações executadas

- `npm install`: concluído; 0 vulnerabilidades reportadas pelo audit da instalação.
- `npm run build`: concluído com sucesso.
- `npm run test`: concluído com 4 testes aprovados.
- `npm run lint`: concluído sem erros.
- Servidor de desenvolvimento: iniciado e verificado com HTTP 200 em `/`, `/login` e `/painel`.
- Limitação: o ambiente não ofereceu navegador controlável para inspeção visual automatizada. O teste visual manual ainda é recomendado.

### Pendências externas

- Configurar um provedor OAuth Google e a lista de contas autorizadas.
- Definir API e persistência para usuários, workspaces, indicadores e históricos.
- Definir armazenamento seguro e processamento dos uploads.
- Substituir a série mensal ilustrativa por dados históricos reais.
- Definir variáveis de ambiente somente quando os serviços forem escolhidos; nenhum segredo foi criado ou copiado nesta etapa.

### Execução local

```sh
npm install
npm run dev
```

Por padrão, o Vite exibe a URL local no terminal, normalmente `http://localhost:5173`.

## 2026-10-24 — Marco 1: backend e persistência

### Implementado

- Estrutura Node.js + TypeScript em `server/`, sem alteração visual no frontend.
- API Express mínima com `GET /api/health`, 404 e tratamento centralizado de erros.
- Prisma ORM 7.10.1 configurado para PostgreSQL pelo arquivo `prisma.config.ts`.
- Prisma Client com adapter `pg`, inicialização lazy e encerramento gracioso.
- Schema persistente para ambientes, SKUs, supervisores, operadores, atribuições, metas, resultados diários, calendário operacional, importações e auditoria.
- Login do operador único em todo o banco.
- Métricas diárias anuláveis, TMA em segundos e cancelamento lógico preservando o registro.
- Datas de vigência e índices para consultas históricas.
- Migration SQL inicial preparada em `prisma/migrations/20261024141000_initial_structure/`.
- Checks SQL adicionais para faixas, vigências, contagens, status e cancelamentos.
- `.env.example` sem segredo real.
- Testes HTTP do health check e do tratamento de rota inexistente.
- Documentação em `docs/backend-architecture.md`.

### Limites preservados

- Nenhuma migration foi executada.
- Nenhum banco foi criado, acessado ou alterado.
- Nenhum seed, `db push`, `migrate dev` ou `migrate deploy` foi executado.
- Nenhum CRUD, OAuth ou integração do dashboard foi implementado.
- O frontend e seus dados demonstrativos permanecem inalterados.

### Pendências

- Aprovar PostgreSQL e credenciais por ambiente.
- Revisar formalmente a migration antes de sua aplicação.
- Fechar regras de sobreposição de vigências e consistência cruzada de ambiente/SKU/supervisor.
- Aprovar timezone, calendário e política de duplicidades.

### Verificações do Marco 1

- Instalação das dependências: concluída, com 0 vulnerabilidades reportadas.
- `prisma validate`: schema válido.
- `prisma generate`: Prisma Client 7.10.1 gerado sem conexão com banco.
- `prisma migrate diff --from-empty --to-schema`: SQL produzido com sucesso, sem aplicar alterações.
- `npm run typecheck:api`: concluído sem erros.
- `npm run test:all`: 4 testes do frontend e 2 testes da API aprovados.
- `npm run lint`: concluído sem erros.
- `npm run build`: frontend e backend compilados com sucesso.

- Processo compilado: `GET /api/health` respondeu HTTP 200 com `database: "not_checked"`.

## 2026-10-24 — Marco 1.1: consolidação do modelo e da integridade

### Ajustes no modelo

- Adicionadas chaves candidatas `(id, environmentId)` em SKU e supervisor e relações compostas nas entidades dependentes.
- Atribuições agora só aceitam SKU e supervisor do ambiente informado.
- Metas, calendários e lotes com SKU também ficam protegidos contra combinações de ambiente incompatíveis.
- Adicionada `version` ao resultado diário para controle otimista de concorrência.
- Mantida a chave única `(assignmentId, resultDate)` sem filtro por status, impedindo duplicidade mesmo após cancelamento lógico.

### Integridade SQL da migration inicial

- Incluída a extensão `btree_gist` e exclusion constraints adiáveis para conflitos de vigência de atribuições, metas e calendários.
- Incluído gatilho que valida a atribuição vigente na data do resultado e a compatibilidade do lote de resultados, com bloqueio das linhas de referência durante a checagem.
- Incluído bloqueio de alterações que reescrevam a identidade de atribuições com resultados ou excluam resultados da vigência histórica.
- Incluído incremento automático da versão do resultado em atualizações.
- Reforçados checks de faixas, presença mínima de uma métrica, TMA inteiro em segundos, cancelamento completo, contagens e estado de lotes, erros de importação e snapshots de auditoria.
- As regras que dependem de autoria, autorização e coordenação entre alteração e `AuditEvent` foram mantidas como responsabilidade transacional do backend; nenhum CRUD foi criado neste marco.

### Arquivos alterados

- `prisma/schema.prisma`
- `prisma/migrations/20261024141000_initial_structure/migration.sql`
- `server/src/generated/prisma/` (artefatos regenerados pelo Prisma Client)
- `server/test/schema-integrity.test.ts` (novo)
- `docs/backend-architecture.md`
- `docs/decisions.md`
- `docs/project-log.md`

### Limites preservados

- Nenhuma migration foi aplicada e nenhum comando de escrita em banco foi executado.
- Nenhum banco foi acessado, criado ou modificado.
- Nenhuma página, estilo ou funcionalidade do frontend foi alterada.
- Nenhum CRUD, seed ou integração externa foi implementado.

### Pendências reais

- Confirmar que o PostgreSQL de destino permite a extensão `btree_gist`.
- Informar os valores oficiais de timezone, calendário e horário de corte de cada operação.
- Decidir, antes da primeira carga, se a unicidade global de login diferencia maiúsculas de minúsculas.

### Verificações do Marco 1.1

- `npm run prisma:format`: schema formatado com sucesso.
- `npm run prisma:validate`: schema válido.
- `npm run prisma:generate`: Prisma Client 7.10.1 gerado sem conexão com banco.
- `npm run prisma:migration:sql`: diff SQL produzido com sucesso a partir de banco vazio, sem aplicação.
- `npm run typecheck:api`: concluído sem erros.
- `npm run test:all`: 4 testes do frontend e 5 testes da API/modelo aprovados.
- `npm run lint`: concluído sem erros.
- `npm run build`: frontend e backend compilados com sucesso.

## 2026-10-24 — Marco 2: banco de desenvolvimento e cadastros

### Banco de desenvolvimento

- Verificados `.env.example`, `prisma.config.ts`, schema, migration e scripts existentes.
- Não foi encontrado arquivo `.env` nem `DATABASE_URL` configurada.
- Nenhuma conexão foi tentada, pois não é possível comprovar que um banco desconhecido seja novo e exclusivo.
- A aplicação da migration, a inspeção real das constraints/gatilhos e os testes PostgreSQL ficaram bloqueados somente pela ausência da conexão autorizada.
- Adicionados `db:preflight` e `db:verify`, ambos protegidos por `INDICA_DATABASE_IS_EXCLUSIVE=true`.
- Preparado `prisma:migrate:deploy` como fluxo oficial para aplicar a migration existente, sem `db push` ou recriação.

### Cadastros implementados

- API para listar e cadastrar ambientes, SKUs, supervisores, operadores e atribuições históricas.
- Alteração auditada da situação do operador e encerramento/ajuste auditado da vigência da atribuição.
- Validação Zod, mensagens de domínio, login globalmente único e checagem prévia de ambiente/SKU/supervisor e sobreposição.
- Cadastro e `AuditEvent` gravados na mesma transação Prisma, com responsável `INFORMED`.
- Nova rota frontend `/cadastros`, integrada ao menu existente e construída com os mesmos tokens, componentes e padrões visuais.
- A interface consulta somente a API; falhas de persistência não geram sucesso nem fallback local.
- Proxy Vite de `/api` para a API local na porta 3333.
- Nenhum ambiente, SKU, supervisor, operador ou atribuição foi inserido automaticamente.

### Testes adicionados

- Testes HTTP sem banco para validação, indisponibilidade do banco, auditoria transacional, relações incompatíveis e conflito de vigência.
- Testes de interface para carga dos dados da API e falha explícita de persistência.
- Suíte PostgreSQL opt-in para persistência, unicidade, relações, vigências, gatilho de data, versionamento e unicidade após cancelamento.
- A suíte PostgreSQL exige `INDICA_DATABASE_IS_EXCLUSIVE=true` e `INDICA_ALLOW_EXCLUSIVE_DB_TESTS=true` e recusa bancos administrativos.

### Arquivos principais criados ou alterados

- `server/src/routes/registrations.ts`
- `server/src/middleware/error-handler.ts`
- `server/src/config/env.ts`
- `server/src/app.ts`
- `server/scripts/database-preflight.ts`
- `server/scripts/database-verify.ts`
- `server/tsconfig.scripts.json`
- `server/test/registrations.test.ts`
- `server/test-integration/registrations.postgres.test.ts`
- `server/vitest.integration.config.ts`
- `src/pages/RegistrationsPage.tsx`
- `src/lib/registrations-api.ts`
- `src/pages/DashboardPage.tsx`
- `src/App.tsx`
- `src/test/registrations-page.test.tsx`
- `vite.config.ts`, `.env.example`, `package.json` e documentação.

### Verificações do Marco 2

- `npm run db:preflight`: bloqueado antes de qualquer conexão, como esperado, por ausência de `DATABASE_URL` e de `INDICA_DATABASE_IS_EXCLUSIVE=true`.
- `npm run prisma:validate`: schema válido.
- `npm run prisma:generate`: Prisma Client 7.10.1 gerado sem conexão.
- `npm run typecheck:api`: código da API e scripts operacionais aprovados.
- `npm run test:all`: 6 testes do frontend e 10 testes da API/modelo aprovados.
- `npm run test:integration:db`: suíte descoberta; 3 testes ignorados por ausência da configuração explícita do banco exclusivo.
- `npm run lint`: concluído sem erros.
- `npm run build`: frontend e backend compilados com sucesso.
- Preview Vite: servidor local iniciou corretamente; inspeção visual automatizada não pôde ser concluída porque o ambiente não disponibilizou navegador controlável.
- Migration inicial: não aplicada.
- Verificação real de permissões, extensão, constraints e gatilhos: não executada por falta do PostgreSQL autorizado.

## 2026-10-24 — Correção da suíte PostgreSQL do Marco 2

- Confirmado que o Vitest não injetava explicitamente no processo de teste as variáveis não prefixadas por `VITE_`.
- Confirmado que `INDICA_ALLOW_EXCLUSIVE_DB_TESTS` estava definido como `false` no `.env`, fazendo a seleção antecipada de `describe.skip`.
- `server/vitest.integration.config.ts` passou a carregar o `.env` com `loadEnv(..., '')` e a injetar somente as três variáveis necessárias à suíte.
- A suíte deixou de usar skip condicional: configuração ausente ou insegura agora falha explicitamente no `beforeAll`.
- A segurança exige ambos os flags com valor literal `true`, banco `indica_dev` na URL e confirmação de `current_database() = 'indica_dev'` após a conexão.
- A recusa foi validada com uma URL descartável contendo outro nome de banco; nenhuma conexão foi aberta nesse cenário.
- `INDICA_ALLOW_EXCLUSIVE_DB_TESTS=true` foi habilitado no `.env` local para a execução expressamente autorizada.
- Os três testes PostgreSQL executaram e passaram; os registros temporários foram removidos pelo teardown da suíte.
- `npm run test:api` aprovou 10 testes; `npm run typecheck:api` e `npm run lint` também passaram.
- Nenhuma migration, `db push`, seed ou alteração de schema foi executada.
- Permanece um aviso de depreciação originado internamente em `@prisma/adapter-pg`/`pg`; ele não alterou o resultado funcional dos testes.

## 2026-10-25 — Marco 3: dashboard e registro diário real

### Verificação inicial

- A API compilada foi validada contra `indica_dev` em uma porta isolada, sem interromper uma instância antiga encontrada na porta 3333.
- `/cadastros` respondeu HTTP 200 e o proxy Vite consultou a API real.
- O banco continha 0 ambientes, SKUs, supervisores, operadores, atribuições, metas, calendários e resultados após o teardown dos testes; nenhum dado foi semeado.
- `tsx watch` apresentou `uv_os_get_passwd ENOMEM` neste ambiente Windows; a validação usou `build:api` e `start:api`.

### Implementado

- API `GET|POST /api/results` e `PUT /api/results/:id`.
- Registro individual obrigatório de NPS, TMA, retenção do cartão e rechamada.
- Percentuais com até duas casas decimais e TMA persistido em segundos.
- Validação da atribuição na data operacional e recusa de duplicidade no `POST`.
- Correção com confirmação explícita, controle otimista por `version` e auditoria anterior/posterior na mesma transação.
- Preservação de métricas ausentes como `null`, sem conversão para zero.
- Nova página `/resultados`, usando cadastros e atribuições persistidos.
- Dashboard migrado de dados demonstrativos para resultados reais, com filtros por ambiente, SKU, período, supervisor, operador e tempo de casa.
- Médias aritméticas sobre valores presentes, TMA em `MM:SS`, diferenças percentuais em pontos percentuais e ausência explícita de metas não cadastradas.
- Nenhuma importação em lote, autenticação ou gestão de metas foi adicionada.

### Arquivos principais criados ou alterados

- `server/src/routes/results.ts` (novo)
- `server/src/app.ts`
- `server/test/results.test.ts` (novo)
- `server/test-integration/registrations.postgres.test.ts`
- `src/lib/results-api.ts` (novo)
- `src/pages/ResultsPage.tsx` (novo)
- `src/pages/DashboardPage.tsx`
- `src/pages/RegistrationsPage.tsx`
- `src/App.tsx`
- `src/test/results-api.test.ts` (novo)
- `vite.config.ts`, `.env.example`, `README.md` e documentação.

### Banco e limites

- O schema Prisma e a migration inicial não foram alterados.
- Nenhuma migration, `db push` ou seed foi executado.
- Os testes PostgreSQL criaram apenas registros temporários identificados e os removeram no teardown.
- A inspeção visual automatizada permaneceu indisponível porque não há navegador controlável neste ambiente.

### Verificações do Marco 3

- `npm run prisma:validate`: aprovado.
- `npm run prisma:generate`: aprovado; Prisma Client 7.10.1 gerado.
- `npm run typecheck:api`: aprovado.
- `npm run test:all`: aprovado; 9 testes do frontend e 15 testes unitários da API.
- `npm run test:integration:db`: aprovado; 4 testes reais contra `indica_dev`, 0 ignorados.
- `npm run lint`: aprovado.
- `npm run build`: aprovado para frontend e API. O Vite emitiu apenas o aviso não bloqueante de chunk principal acima de 500 kB.
- Verificação HTTP: `/cadastros` respondeu 200 e o proxy Vite encaminhou consultas reais para a API; `/api/results` recusou corretamente consulta sem filtros obrigatórios.
- Nenhuma migration, `db push`, seed ou alteração do schema foi executada no Marco 3.

## 2026-10-25 — Correção da integração de cadastros

- Confirmado que `src/lib/registrations-api.ts` usa `/api/registrations/*`, o router declara os sufixos correspondentes e `server/src/app.ts` o monta uma única vez em `/api/registrations`.
- O erro `GET /api/registrations/environments` 404 era causado por um processo Node obsoleto, iniciado em 24/10, ainda ocupando a porta 3333 com uma versão anterior da API que expunha apenas o health check.
- O processo obsoleto foi encerrado e a API recém-compilada passou a responder pelo contrato atual; nenhum endpoint duplicado ou alias foi criado.
- Adicionado teste HTTP de regressão para ambientes, SKUs, supervisores, operadores e atribuições, incluindo a resposta vazia `{ data: [] }`.
- A API real em `indica_dev` respondeu 200 nas cinco listagens sem inclusão automática de registros. O proxy Vite também respondeu 200 para `/api/registrations/environments`.
- Verificações: 16 testes da API, 9 testes do frontend, typecheck da API, lint e build aprovados.
- Nenhum schema, migration ou dado operacional foi alterado.

## 2026-10-25 — Marco 4: importação de planilhas

### Implementado

- Tela `/importacoes` integrada ao menu e à identidade visual existente.
- Upload multipart de Excel e CSV, com limite de 5 MB e 5.000 linhas.
- Modelos oficiais para operadores/atribuições e resultados, disponíveis em `.xlsx` e `.csv`.
- Validação integral antes da escrita: cabeçalhos, obrigatoriedade, datas, precisão/faixas, referências, atribuição vigente, duplicidades internas, conflitos de vigência e registros existentes.
- Prévia com totais, ação por linha e erros por linha/coluna.
- Confirmação específica para atualizar operadores e substituir resultados existentes.
- Fingerprint do arquivo e nova validação no momento da confirmação.
- Gravação atômica do lote, operadores, atribuições, resultados e auditoria.
- Rollback real em falha e registro posterior do lote `FAILED`, sem alterações operacionais parciais.
- Histórico persistido com arquivo, tipo, ambiente, responsável, contagens e erros.

### Arquivos principais

- `server/src/services/import-service.ts` (novo)
- `server/src/routes/imports.ts` (novo)
- `server/src/app.ts`
- `server/src/middleware/error-handler.ts`
- `server/test/imports.test.ts` (novo)
- `server/test-integration/imports.postgres.test.ts` (novo)
- `src/lib/imports-api.ts` (novo)
- `src/pages/ImportsPage.tsx` (novo)
- `src/test/imports-page.test.tsx` (novo)
- `src/App.tsx` e menus das páginas operacionais
- `package.json`, `package-lock.json`, `README.md` e documentação.

### Dependências

- `exceljs`: leitura e geração dos modelos Excel.
- `multer`: recebimento multipart em memória com limite explícito.
- `@types/multer`: tipos TypeScript de desenvolvimento.
- Override de `uuid` transitivo do ExcelJS para 11.1.1; `npm audit --omit=dev` passou sem vulnerabilidades.

### Banco e limites

- O schema Prisma e a migration inicial foram reutilizados sem alterações.
- Nenhuma migration, `db push` ou seed foi executado.
- Os testes PostgreSQL criam registros identificados e os removem no teardown.
- Arquivos inválidos na fase de prévia não são persistidos no histórico, pois nenhuma escrita é autorizada antes da confirmação.

### Verificações do Marco 4

- `npm run prisma:validate`: aprovado; schema existente válido e inalterado.
- `npm run test:all`: aprovado; 10 testes do frontend e 21 testes unitários/HTTP da API.
- `npm run test:integration:db`: aprovado; 8 testes reais em 2 arquivos, incluindo importação válida, arquivos inválidos sem escrita, substituição confirmada e rollback forçado.
- `npm run typecheck:api`: aprovado.
- `npm run lint`: aprovado.
- `npm run build`: aprovado para frontend e API; permaneceu apenas o aviso não bloqueante do chunk principal acima de 500 kB.
- `npm audit --omit=dev`: aprovado, 0 vulnerabilidades.
- Verificação HTTP local: `/importacoes`, histórico, modelo CSV e modelo Excel responderam 200 pelo proxy Vite. O histórico permaneceu vazio após o teardown dos testes.
- A inspeção visual automatizada não foi executada porque o ambiente não disponibilizou navegador controlável.
- Nenhuma migration, `db push`, seed ou alteração do schema foi executada.

## 2026-10-25 — Etapa 1: autenticação completa

### Implementado

- Cadastro com nome, e-mail normalizado, senha Argon2id e papel público fixo `USER`.
- Confirmação de e-mail por token aleatório, temporário, de uso único e armazenado somente como hash; reenvio com cooldown e invalidação dos anteriores.
- Login de contas ativas, sessão opaca persistida no PostgreSQL, cookie `HttpOnly`/`SameSite=Strict` (`Secure` em produção), CSRF, expiração por inatividade/absoluta e logout com revogação.
- Recuperação de senha sem enumeração de conta, token temporário e revogação atômica de sessões após a troca.
- SMTP transacional via Nodemailer, sem logs de tokens, e telas integradas para todos os fluxos.
- Proteção das quatro páginas operacionais e das APIs de cadastros, resultados e importações.
- Auditoria migrada de ator informado pelo cliente para a identidade autenticada da sessão.

### Banco

- Criada e aplicada no PostgreSQL exclusivo `indica_dev` a migration aditiva `20261025153000_user_authentication`.
- Adicionados `users`, `auth_tokens`, `user_sessions`, enums, índices, FKs e checks temporais/de identidade.
- O preflight confirmou o banco `indica_dev`, permissões e `btree_gist`; não houve reset, `db push` ou seed.

### Qualidade

- Adicionada suíte PostgreSQL com os 15 cenários obrigatórios de autenticação.
- A execução inicial revelou e corrigiu a diferença de milissegundos entre `lastSeenAt` da aplicação e `createdAt` do banco; ambos agora são gravados com o mesmo instante.
- `npm run test:integration:db`: 23/23 testes aprovados em 3 arquivos após a correção.
- `npm run test:all`: 10/10 testes web e 21/21 testes HTTP/unitários da API aprovados.
- `npm run typecheck:api`, `npm run lint` e `npm run build`: aprovados; o build manteve apenas o aviso não bloqueante de chunk web acima de 500 kB.
- `npm run db:verify`: confirmou as duas migrations, `btree_gist`, 12 constraints verificadas e 3 gatilhos no `indica_dev`.
- `npm audit --omit=dev`: 0 vulnerabilidades.
- O preview local iniciou com sucesso; a inspeção visual automatizada não foi possível porque o navegador integrado não está disponível neste ambiente.
- Credenciais SMTP reais continuam externas e não foram fornecidas nem copiadas para o repositório.

## 2026-10-25 — Correção da configuração local de autenticação

- Confirmado que `server/src/config/env.ts` carrega o `.env` da raiz por `dotenv/config` e que `server/src/auth/config.ts` exige `APP_BASE_URL` válida e `AUTH_CSRF_SECRET` com pelo menos 32 caracteres.
- A causa de `AUTH_NOT_CONFIGURED` era a ausência dessas duas chaves no `.env` local usado pelo processo da API.
- Configurado localmente `APP_BASE_URL=http://localhost:5173`, `AUTH_COOKIE_NAME=indica_session` e um segredo aleatório de 64 caracteres gerado por `crypto.randomBytes`. O `.env` permanece ignorado e o segredo não foi registrado em logs ou arquivos versionados.
- A API compilada foi reiniciada na porta 3333 e o health check respondeu 200.
- Smoke test pelo proxy real do Vite confirmou que o cadastro chega à API, cria conta `PENDING`/`USER` e persiste hash Argon2id. Sem SMTP configurado, a resposta avança corretamente para `EMAIL_PROVIDER_NOT_CONFIGURED`; a conta sintética foi removida em seguida.
- Adicionados testes do cliente web para `credentials: include`, restauração de sessão e envio do cabeçalho CSRF em escritas.
