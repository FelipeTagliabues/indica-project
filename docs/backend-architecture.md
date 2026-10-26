# Arquitetura do backend

## Estado após o Marco 4

O backend é uma aplicação Node.js + TypeScript separada do bundle Vite. Ele oferece infraestrutura, tratamento centralizado de erros, endpoint de liveness, cadastros persistentes, registro/consulta/correção de resultados diários e importação transacional de planilhas. O dashboard consome dados operacionais reais. Não há autenticação real, gestão de metas ou cancelamento pela interface.

As operações de escrita exigem `actorIdentifier`. Até existir autenticação, ele é armazenado como `AuditActorKind.INFORMED` e a interface deixa explícito que se trata de identificação declarada.

## Organização

```text
server/
  src/
    config/       leitura e validação do ambiente de execução
    errors/       erros esperados da aplicação
    lib/          acesso lazy ao Prisma Client
    middleware/   tratamento de 404 e erros
    routes/       health, cadastros, resultados e importações HTTP
    services/     parsing, validação e gravação transacional de importações
    app.ts        composição do Express
    index.ts      processo e encerramento gracioso
  scripts/        preflight e verificação segura do PostgreSQL
  test/           testes HTTP sem banco
  test-integration/ testes opt-in contra banco exclusivo
prisma/
  schema.prisma   contrato do modelo persistente
  migrations/     migration inicial aplicada somente em indica_dev
prisma.config.ts  configuração do Prisma ORM 7
```

## Configuração

O Prisma usa PostgreSQL e lê `DATABASE_URL` exclusivamente do ambiente. O arquivo `.env.example` contém apenas marcadores; não é uma credencial funcional.

O Prisma Client é criado de forma lazy por `getPrismaClient()`. Assim, o health check pode validar o processo HTTP sem abrir conexão com o banco. Sua resposta contém `database: "not_checked"` para não sugerir uma validação que não ocorreu.

Sem `DATABASE_URL`, rotas persistentes respondem HTTP 503 com `DATABASE_NOT_CONFIGURED`. A interface não mantém uma cópia operacional em estado local nem apresenta sucesso quando a API falha.

## Modelo persistente

- `Environment` e `Sku`: isolamento lógico e status de ativação.
- `Supervisor`: cadastro próprio vinculado ao ambiente.
- `Operator`: login globalmente único, admissão e inativação.
- `OperatorAssignment`: histórico de ambiente, SKU, supervisor e vigência.
- `IndicatorTarget`: metas versionadas por ambiente, SKU e indicador.
- `DailyResult`: resultado diário, métricas anuláveis e cancelamento lógico.
- `OperationalCalendarRule` e `OperationalCalendarException`: vigência, dias operacionais, horário de corte e exceções.
- `ImportBatch` e `ImportRowError`: histórico e erros por linha/campo.
- `AuditEvent`: operação, entidade, instante, responsável e valores anteriores/novos.

Datas civis usam `DATE`; instantes usam `TIMESTAMPTZ(3)`. Percentuais e NPS usam `DECIMAL`, evitando ponto flutuante binário. Métricas ausentes permanecem `NULL`, nunca são convertidas silenciosamente em zero.

## Integridade garantida pelo PostgreSQL

A migration inicial contém garantias que complementam o Prisma Schema Language:

- chaves estrangeiras compostas impedem que atribuições combinem ambiente, SKU e supervisor incompatíveis; a mesma proteção vale para metas, calendários e lotes vinculados a SKU;
- exclusion constraints com `btree_gist` impedem vigências sobrepostas para o mesmo operador, para a mesma meta e para o mesmo calendário operacional; elas são `DEFERRABLE INITIALLY IMMEDIATE`, permitindo que o backend adie a checagem dentro de uma transação de replanejamento;
- um gatilho exige que a data de cada resultado esteja contida na vigência da atribuição e bloqueia a linha consultada durante a validação, evitando corrida com alterações simultâneas;
- depois de existirem resultados, a identidade histórica da atribuição — operador, ambiente, SKU e supervisor — não pode ser reescrita, e sua vigência não pode ser reduzida de modo a excluir resultados existentes;
- a referência opcional ao lote só aceita lote do tipo `RESULTS`, do mesmo ambiente e, quando o lote especifica SKU, do mesmo SKU da atribuição;
- a unicidade `(assignmentId, resultDate)` não é parcial: um resultado cancelado continua ocupando sua chave operacional e não permite reinserção silenciosa;
- resultados exigem ao menos uma métrica informada. NPS aceita `-100..100`; retenção e rechamada aceitam `0..100`; TMA é inteiro não negativo em segundos. Ausência continua representada por `NULL`;
- metas respeitam as mesmas faixas; a meta de TMA, embora armazenada como decimal uniforme, precisa ter valor inteiro;
- cancelamentos exigem instante, motivo e responsável não vazios; atualizações incrementam a versão do resultado para controle de concorrência otimista;
- lotes validam contagens, transições terminal/em andamento, instante de conclusão, arquivo e responsável; erros por linha exigem número positivo, código e mensagem;
- eventos de alteração, correção e cancelamento exigem `previousValues` e `newValues`, além da identificação não vazia da entidade e do responsável.

Relações históricas usam `RESTRICT`. A única cascata é a remoção dos erros de um lote junto com o próprio lote; a API operacional não deverá expor exclusão física de lotes.

## Regras transacionais do backend

O banco protege invariantes estruturais, mas não consegue validar sozinho a intenção e a autoria de uma operação. O backend executa na mesma transação:

- a criação do resultado e seu `AuditEvent`;
- a correção confirmada de um resultado e o `AuditEvent` com snapshot completo anterior e posterior;
- qualquer alteração retroativa de vigência permitida pelas restrições, com auditoria e tratamento amigável de conflito;
- a validação prévia de sobreposição, duplicidade e atribuição vigente, mantendo as constraints como última barreira contra concorrência.

Continuam para marcos futuros o cancelamento lógico pela API e a validação completa de calendário/data futura/horário de corte.

O backend deve usar a coluna `version` no predicado de atualização para detectar edição concorrente. O gatilho incrementa essa versão, mas não substitui a checagem otimista feita pelo serviço.

## Pendências externas ainda abertas

- Qualquer PostgreSQL além de `indica_dev` precisará autorizar `btree_gist`; o ambiente de desenvolvimento já foi validado.
- Timezone, dias operacionais e horário de corte são dados configuráveis por vigência, mas os valores oficiais de cada operação ainda precisam ser fornecidos.
- O login é globalmente único com a comparação padrão do PostgreSQL. Caso a regra desejada seja unicidade sem diferenciar maiúsculas de minúsculas, será necessária uma decisão explícita de normalização antes da carga inicial.

## Endpoint disponível

`GET /api/health`

Resposta de liveness:

```json
{
  "status": "ok",
  "service": "indica-api",
  "database": "not_checked",
  "timestamp": "2026-10-24T00:00:00.000Z"
}
```

O health check não consulta o banco. Rotas inexistentes recebem erro JSON padronizado com HTTP 404.

## API de cadastros

Base: `/api/registrations`

- `GET|POST /environments`
- `GET|POST /skus`
- `GET|POST /supervisors`
- `GET|POST /operators`
- `PATCH /operators/:id/status`
- `GET|POST /assignments`
- `PATCH /assignments/:id/period`

Criações e alterações são transacionais e geram `AuditEvent`. A API antecipa relações incompatíveis e sobreposição de vigências para fornecer mensagens de domínio; chaves estrangeiras, checks e exclusion constraints permanecem como proteção final contra corridas.

## API de resultados

Base: `/api/results`

- `GET /` consulta resultados ativos por ambiente, SKU e período, com filtros opcionais de supervisor e operador; também retorna as metas vigentes na data final.
- `POST /` cria um registro individual, exigindo os quatro indicadores e atribuição válida na data.
- `PUT /:id` substitui um registro após confirmação explícita e validação otimista da `version`.

NPS, retenção e rechamada aceitam até duas casas decimais. TMA é inteiro não negativo em segundos. A serialização preserva métricas ausentes como `null`; médias do dashboard consideram somente valores presentes. Retenção e rechamada são comparadas em pontos percentuais. Metas não existentes nunca são inferidas.

## API de importações

Base: `/api/imports`

- `GET /` lista até 100 lotes recentes e seus erros, com filtros opcionais por ambiente e tipo.
- `GET /templates/:type?format=xlsx|csv` entrega os modelos oficiais.
- `POST /validate` recebe multipart com `type` e `file`, valida o arquivo inteiro sem escrita e devolve prévia, ações e erros por linha/coluna.
- `POST /commit` recebe novamente o mesmo arquivo, fingerprint da prévia, responsável e confirmações explícitas. A API compara o arquivo, repete a validação e só então inicia a transação.

Arquivos aceitos têm até 5 MB e 5.000 linhas. CSV aceita vírgula ou ponto e vírgula, com aspas no padrão CSV; Excel usa a primeira planilha. Cada arquivo pertence a um único ambiente. O lote pode abranger mais de um SKU, caso em que `ImportBatch.skuId` permanece nulo.

Na importação de operadores, a chave interna da atribuição é login + início da vigência. Repetir o mesmo operador em vigências históricas diferentes é permitido, desde que nome e admissão sejam consistentes e os períodos não se sobreponham. A atualização de nome/admissão existente exige confirmação explícita.

Na importação de resultados, login + data é único dentro do arquivo. Os quatro indicadores são obrigatórios. TMA é convertido de minutos ou `MM:SS` para segundos. Resultado ativo existente só é substituído após confirmação e controle pela versão lida; resultado cancelado não é recriado.

Lote concluído, dados e eventos de auditoria são gravados na mesma transação. Uma falha reverte toda alteração operacional; depois do rollback, a API registra separadamente um lote `FAILED` com erro `TRANSACTION_ROLLBACK`. Arquivos inválidos durante a prévia não geram escrita. Se o estado mudar entre prévia e confirmação, a tentativa confirmada pode registrar o lote falho e seus erros, sem alterações operacionais parciais.

## Banco de desenvolvimento

O PostgreSQL exclusivo de desenvolvimento `indica_dev` está configurado. A migration inicial foi aplicada e `db:verify` confirmou extensão, constraints e gatilhos. O fluxo de referência permanece:

1. criar externamente um PostgreSQL novo e exclusivo;
2. preencher `DATABASE_URL` e confirmar `INDICA_DATABASE_IS_EXCLUSIVE=true`;
3. executar `npm run db:preflight`, que faz apenas consultas de contexto, permissões e extensão;
4. executar `npm run prisma:migrate:deploy`, usando a migration existente;
5. executar `npm run db:verify` e `npm run test:integration:db` com a confirmação adicional dos testes.

`db:verify` confere a migration registrada pelo Prisma, `btree_gist`, constraints e gatilhos esperados. A suíte de integração valida persistência, login único, relações, conflitos de vigência, gatilho de data do resultado, versionamento e unicidade após cancelamento.

## Comandos seguros

```sh
npm run dev:api
npm run typecheck:api
npm run test:api
npm run prisma:validate
npm run prisma:generate
npm run prisma:migration:sql
npm run db:preflight
npm run prisma:migrate:deploy
npm run db:verify
npm run test:integration:db
```

`prisma:migration:sql` apenas imprime um diff de banco vazio para o schema; ele não aplica a migration. `prisma:migrate:deploy` é o único comando de aplicação preparado para este marco e só deve ser usado após o preflight no banco exclusivo. Não use `migrate dev`, `db push`, `db execute` ou `migrate resolve`.

## Autenticação

`User` armazena identidade, papel, status, confirmação e versão global de sessão. `AuthToken` guarda somente SHA-256 de tokens aleatórios para confirmação e recuperação; expiração e uso único são validados atomicamente. `UserSession` guarda o hash do verificador do cookie, expiração por inatividade, limite absoluto e revogação. Senhas usam Argon2id (19 MiB, 2 iterações e paralelismo 1).

O cookie contém apenas ID da sessão e verificador aleatório, é `HttpOnly`, `SameSite=Strict` e `Secure` em produção. Escritas nas APIs protegidas também exigem token CSRF derivado por HMAC e entregue após login/restauração da sessão. A identidade de auditoria é sobrescrita pelo backend com o e-mail autenticado e usa `AuditActorKind.AUTHENTICATED`; valores enviados pelo cliente não determinam autoria.

Rotas públicas: `POST /api/auth/register`, `confirm-email`, `resend-confirmation`, `login`, `forgot-password` e `reset-password`. `GET /api/auth/session` e `POST /api/auth/logout` exigem sessão; logout também exige CSRF. Todas as rotas de cadastros, resultados e importações são protegidas.

O limitador de tentativas atual é conservador e mantido em memória do processo. Para implantação com mais de uma instância, ele deverá ser substituído por armazenamento compartilhado sem alterar o contrato HTTP. O envio usa SMTP via Nodemailer e depende das variáveis documentadas no `.env.example`; tokens nunca são retornados nem registrados em log.
