# Sistema de Rifas Offline

Aplicacao web local para gerenciar rifas, numeros vendidos e sorteios.

## Stack

- Frontend: React + Vite + TypeScript
- Backend: Node.js + Express + TypeScript
- Banco local: SQLite (`backend/data/rifas.db`)

## Requisitos

- Node.js 22+
- npm

## Como rodar

```bash
npm run dev
```

- Frontend: `http://localhost:5173`
- API local: `http://localhost:3333/api`

## Funcionalidades

- Criar rifas com descricao, valor do premio, data do sorteio e valor por numero.
- Cadastrar numeros manualmente por rifa.
- Associar pessoa (nome + telefone) a cada numero.
- Marcar numero como pago ou nao pago.
- Ver resumo por rifa:
  - total de numeros cadastrados
  - total arrecadado
  - indicador se arrecadado ultrapassou premio
- Realizar sorteio apenas entre numeros pagos.
- Exibir vencedor na tela e gravar historico do sorteio.

## Build

```bash
npm run build
```

## Estrutura

- `backend/src/server.ts`: API REST e regras de negocio.
- `backend/src/db.ts`: conexao e inicializacao do schema SQLite.
- `frontend/src/App.tsx`: interface principal de gestao.
- `frontend/src/services/api.ts`: cliente HTTP do frontend.

## Observacoes

- O banco fica em arquivo local, pensado para uso offline.
- Se quiser limpar os dados, apague `backend/data/rifas.db` com a aplicacao parada.
