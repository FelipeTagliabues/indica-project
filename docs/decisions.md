# Decisões técnicas

## ADR-001 — Manter o projeto titular como SPA Vite

- Data: 2026-10-24
- Status: aceita

### Contexto

A referência usa TanStack Start com SSR, Nitro e configuração específica do Lovable. O projeto titular já foi criado como React + TypeScript + Vite e a experiência atual tem apenas três páginas sem loaders, ações de servidor ou renderização dependente de backend.

### Decisão

Usar React Router no cliente e preservar a estrutura Vite do titular. Os componentes visuais e regras de negócio foram migrados, enquanto arquivos gerados e wrappers específicos do Lovable não foram copiados.

### Consequências

- O projeto permanece simples de executar e compatível com a arquitetura solicitada.
- URLs diretas dependem de fallback para `index.html` no servidor de produção.
- Recursos futuros que precisem de SSR ou endpoints deverão ser implementados na infraestrutura escolhida para o produto, sem depender do runtime Lovable.

## ADR-002 — Não simular autenticação como se fosse real

- Data: 2026-10-24
- Status: aceita

### Contexto

A tela original afirma usar Google, mas o botão apenas abre `/painel`; não há cliente OAuth, sessão, allowlist ou credenciais no repositório.

### Decisão

Preservar a tela e o fluxo navegável para demonstração, acrescentando um aviso explícito de que a autenticação Google não está configurada.

### Consequências

- O protótipo pode ser avaliado localmente sem falsa garantia de segurança.
- O painel não deve ser publicado como ambiente restrito antes da integração de identidade.

## ADR-003 — Identificar dados demonstrativos e manter uploads efêmeros

- Data: 2026-10-24
- Status: aceita

### Contexto

A referência gera operadores fictícios e não possui banco. A solicitação proíbe apresentar demonstrações como dados operacionais e também proíbe criar banco ou executar migrações nesta etapa.

### Decisão

Manter o gerador determinístico e a importação CSV em memória, mas exibir o estado da origem dos dados no painel. A evolução mensal permanece marcada como ilustrativa.

### Consequências

- Nenhum dado demonstrativo é apresentado como operacional.
- Atualizar a página remove os uploads.
- Persistência, validação de schema e histórico ficam condicionados à definição da API e do banco oficiais.

## ADR-004 — Copiar apenas componentes efetivamente usados

- Data: 2026-10-24
- Status: aceita

### Contexto

A referência contém uma biblioteca ampla de componentes shadcn/ui, mas as páginas atuais usam diretamente apenas botão e select.

### Decisão

Migrar os componentes usados e suas dependências, preservando o comportamento e a aparência atuais. Componentes genéricos não referenciados não foram duplicados no titular.

### Consequências

- Menos dependências e superfície de manutenção.
- Novas telas podem adicionar componentes da referência conforme necessidade, sem alterar o design vigente.

## ADR-005 — Backend separado do bundle Vite

- Data: 2026-10-24
- Status: aceita

### Decisão

Manter o frontend como SPA Vite e organizar a API em `server/`, com TypeScript estrito e comandos próprios. O build raiz valida as duas aplicações.

### Consequências

- O design e o ciclo do frontend permanecem independentes.
- A implantação futura precisará executar dois artefatos ou definir um gateway/reverse proxy.
- O endpoint de health é apenas liveness e não consulta o banco.

## ADR-006 — Prisma ORM 7 com PostgreSQL e adapter `pg`

- Data: 2026-10-24
- Status: aceita

### Decisão

Usar Prisma ORM 7.10.1, `prisma.config.ts`, client gerado com saída explícita e `@prisma/adapter-pg`. A versão 8 não foi adotada porque ainda estava indicada como release candidate durante este marco.

### Consequências

- `DATABASE_URL` permanece fora do schema e dos arquivos versionados.
- Geração e validação do client não exigem conexão, mas exigem uma URL PostgreSQL sintaticamente válida no ambiente.
- A migration continua sujeita a revisão e autorização antes de aplicação.

## ADR-007 — Métricas anuláveis e histórico imutável por padrão

- Data: 2026-10-24
- Status: aceita

### Decisão

Resultados armazenam NPS, TMA em segundos, retenção e rechamada em colunas anuláveis. Ausência não é zero. Cancelamentos são lógicos, relações históricas usam `RESTRICT` e mudanças relevantes devem produzir auditoria nos próximos marcos.

### Consequências

- Consultas futuras deverão excluir cancelados quando apropriado e tratar `NULL` explicitamente.
- A unicidade por atribuição e data evita duplicidade silenciosa.
- Correções atualizarão o registro mediante confirmação e criarão `AuditEvent` com valores anteriores e novos.

## ADR-008 — Vigências exclusivas no PostgreSQL

- Data: 2026-10-24
- Status: aceita

### Decisão

Habilitar `btree_gist` na migration inicial e usar exclusion constraints para impedir intervalos sobrepostos de atribuições do mesmo operador, metas do mesmo indicador por ambiente/SKU e calendários do mesmo ambiente/SKU. As restrições são adiáveis, mas inicialmente imediatas, para suportar reorganizações atômicas de períodos.

### Consequências

- A integridade não depende apenas de uma consulta sujeita a corrida no backend.
- O serviço continuará antecipando conflitos para produzir mensagens de domínio e poderá adiar a constraint durante uma transação que reorganize mais de um período.
- A infraestrutura PostgreSQL precisa permitir a extensão `btree_gist` antes da primeira aplicação da migration.

## ADR-009 — Integridade composta de ambiente

- Data: 2026-10-24
- Status: aceita

### Decisão

Usar referências compostas `(id, environmentId)` para relacionar SKU e supervisor às atribuições e SKU às metas, calendários e lotes de importação. Manter também a referência direta ao ambiente para navegação e isolamento explícitos.

### Consequências

- Uma combinação de ambiente, SKU e supervisor incompatível é rejeitada pelo próprio banco.
- Os índices únicos compostos em SKU e supervisor existem para servir como alvos dessas chaves estrangeiras; não alteram a identidade primária em UUID.

## ADR-010 — Resultado único e histórico protegido

- Data: 2026-10-24
- Status: aceita

### Decisão

Manter uma única linha por atribuição e data, inclusive após cancelamento lógico. Correções atualizam essa linha, incrementam sua versão e devem gravar o snapshot anterior e posterior em `AuditEvent` na mesma transação. A migration valida a vigência da atribuição e impede que uma atribuição com resultados tenha sua identidade histórica reescrita ou sua vigência reduzida para fora das datas já registradas.

### Consequências

- Cancelamento não libera a chave para uma nova inserção e não apaga os valores anteriores.
- Concorrência de correção será tratada pelo backend com a coluna `version`.
- O banco exige a estrutura mínima da auditoria, enquanto atomicidade, identidade confiável do ator e autorização permanecem responsabilidade do serviço.

## ADR-011 — Cadastros e auditoria na mesma transação

- Data: 2026-10-24
- Status: aceita

### Decisão

Implementar os primeiros cadastros em `/api/registrations`. Toda criação e toda alteração de status ou vigência gravam o cadastro e seu `AuditEvent` na mesma transação Prisma. Enquanto não houver autenticação, o responsável é obrigatório, mas marcado como `INFORMED`.

### Consequências

- Uma falha na auditoria desfaz a alteração principal.
- A API não afirma que o responsável foi autenticado.
- Consultas prévias produzem mensagens claras, enquanto as constraints continuam protegendo contra concorrência.

## ADR-012 — Aplicação de migration protegida por preflight

- Data: 2026-10-24
- Status: aceita

### Decisão

Exigir `INDICA_DATABASE_IS_EXCLUSIVE=true` para os scripts que inspecionam o PostgreSQL. O fluxo autorizado usa `db:preflight`, `prisma migrate deploy` sobre a migration existente e `db:verify`; `db push` e recriação da migration permanecem proibidos.

### Consequências

- Uma URL isolada não basta: o responsável precisa confirmar explicitamente que o banco é novo e exclusivo.
- O preflight valida usuário, banco, permissões no schema `public` e disponibilidade de `btree_gist` sem escrever.
- A verificação posterior confirma migration, extensão, constraints e gatilhos pelo catálogo real do PostgreSQL.

## ADR-013 — Interface de cadastros sem fallback local

- Data: 2026-10-24
- Status: aceita

### Decisão

Adicionar `/cadastros` reutilizando a identidade visual do painel. A página lê e grava exclusivamente por meio da API e, diante de falha ou ausência do banco, apresenta estado indisponível sem salvar em memória, `localStorage` ou dados simulados.

### Consequências

- Um cadastro só recebe confirmação depois da resposta de persistência e da atualização da listagem.
- O dashboard demonstrativo permanece separado e inalterado em sua origem de dados.
- O Vite encaminha `/api` à API local durante o desenvolvimento.

## ADR-014 — Registro individual completo e correção auditada

- Data: 2026-10-25
- Status: aceita

### Decisão

O endpoint individual exige NPS, TMA, retenção do cartão e rechamada. TMA chega à API em segundos; os demais valores aceitam no máximo duas casas decimais. Duplicidades não são sobrescritas pelo `POST`: a interface deve abrir o registro existente, confirmar a substituição e enviar `PUT` com a versão conhecida.

### Consequências

- Criação e auditoria são atômicas.
- Correção e auditoria anterior/posterior são atômicas.
- A coluna `version` detecta alterações concorrentes e o gatilho continua responsável pelo incremento.
- O schema permanece anulável para outros fluxos aprovados, mas a operação individual deste marco exige os quatro indicadores.

## ADR-015 — Dashboard exclusivamente operacional

- Data: 2026-10-25
- Status: aceita

### Decisão

Substituir no dashboard o gerador demonstrativo e o upload efêmero por consultas à API real. Aplicar filtros de ambiente, SKU, período, supervisor, operador e tempo de casa; calcular médias apenas sobre valores presentes e mostrar metas somente quando cadastradas.

### Consequências

- Banco vazio produz estado vazio, nunca dados fictícios.
- Percentuais são comparados em pontos percentuais; TMA permanece armazenado em segundos e é apresentado como `MM:SS`.
- O parser CSV legado não participa do fluxo operacional e importação em lote permanece fora deste marco.

## ADR-016 — Importação validada em duas fases e transação única

- Data: 2026-10-25
- Status: aceita

### Decisão

Receber Excel e CSV em memória, com limite de 5 MB e 5.000 linhas, e executar a importação em duas fases. A prévia valida o arquivo inteiro sem escrita e devolve um fingerprint SHA-256. A confirmação reenvia o arquivo, exige o mesmo fingerprint, repete todas as validações contra o banco e só então grava lote, dados e auditoria em uma transação.

Cada arquivo pertence a um único ambiente para respeitar o escopo obrigatório de `ImportBatch`. Operadores podem se repetir em linhas de vigências históricas distintas; a duplicidade bloqueante é login + início da vigência, e períodos sobrepostos continuam proibidos. Resultados usam login + data como chave operacional no arquivo.

### Consequências

- Não existe cache de arquivo, mock, `localStorage` ou gravação operacional antes da confirmação.
- Alterações de operadores e substituições dos quatro indicadores exigem confirmações independentes.
- Uma falha de escrita reverte o lote operacional inteiro. O evento de falha é registrado somente após o rollback, em lote `FAILED`, sem manter alterações parciais.
- Excel e CSV alimentam o mesmo normalizador e as mesmas regras de domínio.
- O schema e a migration inicial permanecem inalterados.

## ADR-017 — Sessão opaca, confirmação obrigatória e autoria confiável

- Data: 2026-10-25
- Status: aceita

### Decisão

Autenticar por e-mail e senha com Argon2id, exigir confirmação antes do acesso e persistir sessões opacas no PostgreSQL. O navegador recebe cookie `HttpOnly`, `SameSite=Strict` e `Secure` em produção; operações inseguras exigem CSRF. Tokens de confirmação e recuperação são aleatórios, temporários, de uso único e persistidos apenas como hash. Cadastro público cria somente papel `USER`.

### Consequências

- Senhas, tokens brutos e verificadores de sessão não são expostos pela API nem armazenados em texto puro.
- Redefinir a senha incrementa `sessionVersion` e revoga todas as sessões existentes na mesma transação.
- Auditorias operacionais usam a identidade autenticada definida pelo servidor; a decisão transitória do ADR-011 sobre ator `INFORMED` deixa de valer para as rotas protegidas.
- SMTP é dependência externa obrigatória para entrega real. O limitador em memória atende a instância única atual e deverá ter armazenamento compartilhado antes de escalar horizontalmente.
