# Indica

Painel de indicadores operacionais migrado da referência Lovable local para React, TypeScript e Vite.

## Execução local

Instale as dependências e configure somente um PostgreSQL novo e exclusivo de desenvolvimento:

```sh
npm install
copy .env.example .env
# Substitua DATABASE_URL pelas credenciais autorizadas do banco exclusivo.
# Depois de confirmar essa exclusividade, altere INDICA_DATABASE_IS_EXCLUSIVE=true.
npm run db:preflight
npm run prisma:migrate:deploy
npm run db:verify
```

`db:preflight` é somente leitura e valida banco, usuário, permissões no schema `public` e disponibilidade de `btree_gist`. `prisma:migrate:deploy` aplica exclusivamente a migration já existente; não use `db push` nem recrie a migration.

Com a migration aplicada, inicie a API e o frontend em terminais separados:

```sh
npm run dev:api
npm run dev
```

Se `tsx watch` falhar no Windows com `uv_os_get_passwd ENOMEM`, compile e execute a API sem o watcher:

```sh
npm run build:api
npm run start:api
```

O Vite encaminha `/api` para `VITE_API_PROXY_TARGET`, usando `http://localhost:3333` por padrão. `VITE_API_URL` pode apontar para outra origem autorizada quando necessário.

O endpoint `GET http://localhost:3333/api/health` verifica apenas o processo HTTP. As páginas `/cadastros`, `/resultados`, `/importacoes` e `/painel` consultam a API e nunca usam armazenamento local ou mocks como substituto da persistência.

## Cadastros disponíveis

- Ambientes;
- SKUs vinculados ao ambiente;
- supervisores vinculados ao ambiente;
- operadores com login globalmente único, admissão e inativação;
- atribuições históricas com vigência, ambiente, SKU e supervisor.

As alterações exigem um responsável informado, marcado como não autenticado, e criam auditoria na mesma transação.

## Resultados e dashboard

- `/resultados` registra individualmente NPS, TMA, retenção do cartão e rechamada.
- TMA é digitado como minutos ou `MM:SS` e persistido em segundos.
- Percentuais aceitam até duas casas decimais.
- A atribuição é validada na data operacional.
- Registros existentes podem ser corrigidos após confirmação; valores anteriores e novos são auditados atomicamente.
- `/painel` consulta resultados reais por ambiente, SKU, período, supervisor, operador e tempo de casa.
- Metas ausentes são exibidas como não configuradas; dados ausentes nunca são convertidos em zero.

## Importação de planilhas

- `/importacoes` aceita `.xlsx` e `.csv` de até 5 MB e 5.000 linhas.
- A tela fornece modelos oficiais de operadores/atribuições e resultados diários em Excel e CSV.
- Cada arquivo contém um único ambiente; SKU, supervisor, operador e vigência são validados contra os cadastros reais.
- A prévia é somente leitura. A API repete toda a validação na confirmação e recusa arquivo alterado depois da prévia.
- Atualizações de operadores e substituições de resultados exigem confirmações específicas.
- Lote, alterações operacionais e auditoria são gravados atomicamente. Falha transacional reverte os dados operacionais e registra um lote com falha, sem sucesso parcial.
- O histórico exibe responsável informado, arquivo, ambiente, quantidades e erros persistidos.

Cabeçalhos do modelo de operadores:

```text
ambiente_codigo;login;nome;data_admissao;sku_codigo;supervisor_nome;vigencia_inicio;vigencia_fim
```

Cabeçalhos do modelo de resultados:

```text
ambiente_codigo;sku_codigo;login;data_resultado;nps;tma_minutos;retencao_cartao;rechamada
```

Datas usam `AAAA-MM-DD`; percentuais são informados em pontos percentuais e TMA aceita minutos ou `MM:SS`.

### Validação do backend

```sh
npm run prisma:validate
npm run prisma:generate
npm run typecheck:api
npm run test:api
npm run build
```

Testes PostgreSQL escrevem e removem somente seus próprios registros e são recusados sem as duas confirmações explícitas:

```sh
# Apenas após definir as duas variáveis como true no .env do banco exclusivo já migrado:
npm run test:integration:db
```

A migration em `prisma/migrations/20261024141000_initial_structure/` foi aplicada ao PostgreSQL exclusivo `indica_dev` e validada por `db:verify`. Não foi criada nem aplicada migration adicional no Marco 3.

Consulte [`docs/project-log.md`](docs/project-log.md) para o histórico da migração e [`docs/decisions.md`](docs/decisions.md) para as decisões técnicas.

> A autenticação Google ainda não está configurada. Cadastros, resultados, importações e dashboard dependem obrigatoriamente da API e do PostgreSQL; dados demonstrativos não são usados nesses fluxos.

## Documentação original do template

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```

You can also install [eslint-plugin-react-x](https://npmx.dev/package/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://npmx.dev/package/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])

```
