import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

const dataDir = path.resolve(__dirname, "../data");
const dbPath = path.join(dataDir, "rifas.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS rifas (
  id TEXT PRIMARY KEY,
  descricao TEXT NOT NULL,
  valor_premio REAL NOT NULL,
  valor_numero REAL NOT NULL,
  lucro_desejado REAL NOT NULL DEFAULT 0,
  faturamento_alvo REAL NOT NULL DEFAULT 0,
  quantidade_numeros INTEGER NOT NULL DEFAULT 0,
  data_sorteio TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ativa',
  criada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pessoas (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  telefone TEXT NOT NULL,
  criada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(nome, telefone)
);

CREATE TABLE IF NOT EXISTS numeros_rifa (
  id TEXT PRIMARY KEY,
  rifa_id TEXT NOT NULL,
  numero TEXT NOT NULL,
  pessoa_id TEXT,
  pago INTEGER NOT NULL DEFAULT 0,
  valor_pago REAL,
  vendido_em TEXT,
  criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(rifa_id) REFERENCES rifas(id) ON DELETE CASCADE,
  FOREIGN KEY(pessoa_id) REFERENCES pessoas(id) ON DELETE SET NULL,
  UNIQUE(rifa_id, numero)
);

CREATE TABLE IF NOT EXISTS sorteios (
  id TEXT PRIMARY KEY,
  rifa_id TEXT NOT NULL UNIQUE,
  numero_rifa_id TEXT NOT NULL,
  numero TEXT NOT NULL,
  pessoa_id TEXT,
  vencedor_nome TEXT NOT NULL,
  vencedor_telefone TEXT NOT NULL,
  criada_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(rifa_id) REFERENCES rifas(id) ON DELETE CASCADE,
  FOREIGN KEY(numero_rifa_id) REFERENCES numeros_rifa(id) ON DELETE RESTRICT,
  FOREIGN KEY(pessoa_id) REFERENCES pessoas(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_numeros_rifa_rifa ON numeros_rifa(rifa_id);
CREATE INDEX IF NOT EXISTS idx_numeros_rifa_pessoa ON numeros_rifa(pessoa_id);
CREATE INDEX IF NOT EXISTS idx_numeros_rifa_numero ON numeros_rifa(rifa_id, numero);
`);

function hasColumn(tableName: string, columnName: string): boolean {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
  return columns.some((column) => column.name === columnName);
}

function migrateRifasTable(): void {
  if (!hasColumn("rifas", "lucro_desejado")) {
    db.exec("ALTER TABLE rifas ADD COLUMN lucro_desejado REAL NOT NULL DEFAULT 0");
  }
  if (!hasColumn("rifas", "faturamento_alvo")) {
    db.exec("ALTER TABLE rifas ADD COLUMN faturamento_alvo REAL NOT NULL DEFAULT 0");
  }
  if (!hasColumn("rifas", "quantidade_numeros")) {
    db.exec("ALTER TABLE rifas ADD COLUMN quantidade_numeros INTEGER NOT NULL DEFAULT 0");
  }
  if (!hasColumn("rifas", "atualizada_em")) {
    db.exec("ALTER TABLE rifas ADD COLUMN atualizada_em TEXT");
    db.exec("UPDATE rifas SET atualizada_em = CURRENT_TIMESTAMP WHERE atualizada_em IS NULL OR atualizada_em = ''");
  }

  db.exec(`
    UPDATE rifas
    SET faturamento_alvo = CASE
      WHEN faturamento_alvo <= 0 THEN valor_premio + lucro_desejado
      ELSE faturamento_alvo
    END,
    quantidade_numeros = CASE
      WHEN quantidade_numeros <= 0 THEN CAST((valor_premio + lucro_desejado + valor_numero - 0.0000001) / valor_numero AS INTEGER)
      ELSE quantidade_numeros
    END
  `);
}

function migratePessoasTable(): void {
  if (!hasColumn("pessoas", "atualizada_em")) {
    db.exec("ALTER TABLE pessoas ADD COLUMN atualizada_em TEXT");
    db.exec("UPDATE pessoas SET atualizada_em = CURRENT_TIMESTAMP WHERE atualizada_em IS NULL OR atualizada_em = ''");
  }
}

function migrateNumerosTableIfNeeded(): void {
  const needsRebuild = !hasColumn("numeros_rifa", "vendido_em") || !hasColumn("numeros_rifa", "atualizado_em");
  if (!needsRebuild) {
    return;
  }

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec(`
    CREATE TABLE numeros_rifa_new (
      id TEXT PRIMARY KEY,
      rifa_id TEXT NOT NULL,
      numero TEXT NOT NULL,
      pessoa_id TEXT,
      pago INTEGER NOT NULL DEFAULT 0,
      valor_pago REAL,
      vendido_em TEXT,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(rifa_id) REFERENCES rifas(id) ON DELETE CASCADE,
      FOREIGN KEY(pessoa_id) REFERENCES pessoas(id) ON DELETE SET NULL,
      UNIQUE(rifa_id, numero)
    );

    INSERT INTO numeros_rifa_new (id, rifa_id, numero, pessoa_id, pago, valor_pago, vendido_em, criado_em, atualizado_em)
    SELECT
      id,
      rifa_id,
      CASE
        WHEN CAST(numero AS TEXT) GLOB '[0-9][0-9][0-9][0-9]' THEN CAST(numero AS TEXT)
        ELSE printf('%04d', CAST(numero AS INTEGER))
      END,
      pessoa_id,
      COALESCE(pago, 0),
      valor_pago,
      CASE WHEN pessoa_id IS NULL THEN NULL ELSE criada_em END,
      COALESCE(criada_em, CURRENT_TIMESTAMP),
      CURRENT_TIMESTAMP
    FROM numeros_rifa;

    DROP TABLE numeros_rifa;
    ALTER TABLE numeros_rifa_new RENAME TO numeros_rifa;
  `);
  db.exec("PRAGMA foreign_keys = ON");
}

function migrateSorteiosTable(): void {
  if (!hasColumn("sorteios", "vencedor_nome")) {
    db.exec("ALTER TABLE sorteios ADD COLUMN vencedor_nome TEXT");
  }
  if (!hasColumn("sorteios", "vencedor_telefone")) {
    db.exec("ALTER TABLE sorteios ADD COLUMN vencedor_telefone TEXT");
  }
  if (!hasColumn("sorteios", "numero")) {
    db.exec("ALTER TABLE sorteios ADD COLUMN numero TEXT");
  }

  db.exec(`
    UPDATE sorteios
    SET numero = CASE
      WHEN numero IS NULL THEN printf('%04d', CAST(numero AS INTEGER))
      ELSE numero
    END
    WHERE numero IS NULL OR numero = ''
  `);

  db.exec(`
    UPDATE sorteios
    SET vencedor_nome = COALESCE(vencedor_nome, (SELECT nome FROM pessoas p WHERE p.id = sorteios.pessoa_id), 'Nao identificado'),
        vencedor_telefone = COALESCE(vencedor_telefone, (SELECT telefone FROM pessoas p WHERE p.id = sorteios.pessoa_id), 'Nao informado')
  `);

  db.exec("UPDATE sorteios SET vencedor_nome = COALESCE(vencedor_nome, 'Nao identificado')");
  db.exec("UPDATE sorteios SET vencedor_telefone = COALESCE(vencedor_telefone, 'Nao informado')");
}

migrateRifasTable();
migratePessoasTable();
migrateNumerosTableIfNeeded();
migrateSorteiosTable();

export default db;
