import cors from "cors";
import express, { type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "./db";

type PessoaPayload = {
  nome: string;
  telefone: string;
};

type Pagination = {
  page: number;
  pageSize: number;
  offset: number;
};

const app = express();
const port = Number(process.env.PORT) || 3333;

app.use(cors());
app.use(express.json());

function asPositiveNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function asNonNegativeNumber(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function trimText(value: unknown): string {
  return String(value ?? "").trim();
}

function asParamString(value: unknown): string {
  return trimText(Array.isArray(value) ? value[0] : value);
}

function parsePagination(req: Request): Pagination {
  const page = Math.max(1, Number(req.query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 12));
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
  };
}

function format4Digits(value: number): string {
  return String(value).padStart(4, "0");
}

function getOrCreatePessoa(payload: PessoaPayload): string {
  const nome = trimText(payload.nome);
  const telefone = trimText(payload.telefone);

  if (!nome || !telefone) {
    throw new Error("Nome e telefone sao obrigatorios para pessoa.");
  }

  const existing = db
    .prepare("SELECT id FROM pessoas WHERE nome = ? AND telefone = ?")
    .get(nome, telefone) as { id: string } | undefined;

  if (existing) {
    return existing.id;
  }

  const pessoaId = uuidv4();
  db.prepare(
    "INSERT INTO pessoas (id, nome, telefone, criada_em, atualizada_em) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
  ).run(pessoaId, nome, telefone);

  return pessoaId;
}

function resolvePessoaId(input: { pessoaId?: unknown; nome?: unknown; telefone?: unknown }): string {
  const pessoaId = trimText(input.pessoaId);
  if (pessoaId) {
    const pessoa = db
      .prepare("SELECT id FROM pessoas WHERE id = ?")
      .get(pessoaId) as { id: string } | undefined;

    if (!pessoa) {
      throw new Error("Pessoa selecionada nao encontrada.");
    }

    return pessoa.id;
  }

  return getOrCreatePessoa({
    nome: trimText(input.nome),
    telefone: trimText(input.telefone),
  });
}

function calcularPlanejamento(valorPremio: number, valorNumero: number, lucroDesejado: number): {
  faturamentoAlvo: number;
  quantidadeNumeros: number;
} {
  const faturamentoAlvo = valorPremio + lucroDesejado;
  const quantidadeNumeros = Math.ceil(faturamentoAlvo / valorNumero);
  if (quantidadeNumeros > 9000) {
    throw new Error(
      "A quantidade de numeros necessaria ultrapassa o limite de 9000 para 4 digitos. Ajuste valor do numero ou meta de lucro.",
    );
  }
  return { faturamentoAlvo, quantidadeNumeros };
}

function gerarNumerosAleatorios4Digitos(quantidade: number, existentes: Set<string> = new Set()): string[] {
  const pool: string[] = [];
  for (let i = 1000; i <= 9999; i += 1) {
    const numero = format4Digits(i);
    if (!existentes.has(numero)) {
      pool.push(numero);
    }
  }

  if (quantidade > pool.length) {
    throw new Error("Nao ha numeros de 4 digitos suficientes para gerar a quantidade desejada.");
  }

  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = pool[i] as string;
    pool[i] = pool[j] as string;
    pool[j] = current;
  }

  return pool.slice(0, quantidade);
}

function getRifaOrThrow(rifaId: string): {
  id: string;
  descricao: string;
  valor_premio: number;
  valor_numero: number;
  lucro_desejado: number;
  faturamento_alvo: number;
  quantidade_numeros: number;
  data_sorteio: string;
  status: string;
} {
  const rifa = db
    .prepare(
      `
      SELECT
        id,
        descricao,
        valor_premio,
        valor_numero,
        lucro_desejado,
        faturamento_alvo,
        quantidade_numeros,
        data_sorteio,
        status
      FROM rifas
      WHERE id = ?
    `,
    )
    .get(rifaId) as
    | {
        id: string;
        descricao: string;
        valor_premio: number;
        valor_numero: number;
        lucro_desejado: number;
        faturamento_alvo: number;
        quantidade_numeros: number;
        data_sorteio: string;
        status: string;
      }
    | undefined;

  if (!rifa) {
    throw new Error("Rifa nao encontrada.");
  }

  return rifa;
}

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get("/api/dashboard", (_req: Request, res: Response) => {
  const totals = db
    .prepare(
      `
      SELECT
        COUNT(*) AS total_rifas,
        SUM(CASE WHEN status = 'ativa' THEN 1 ELSE 0 END) AS rifas_ativas,
        SUM(CASE WHEN status = 'sorteada' THEN 1 ELSE 0 END) AS rifas_sorteadas,
        COALESCE(SUM(faturamento_alvo), 0) AS faturamento_alvo_geral,
        COALESCE(SUM(valor_premio), 0) AS premios_geral
      FROM rifas
    `,
    )
    .get() as
    | {
        total_rifas: number | null;
        rifas_ativas: number | null;
        rifas_sorteadas: number | null;
        faturamento_alvo_geral: number | null;
        premios_geral: number | null;
      }
    | undefined;

  const arrecadado = db
    .prepare(
      `
      SELECT COALESCE(SUM(COALESCE(n.valor_pago, r.valor_numero)), 0) AS arrecadado_geral
      FROM numeros_rifa n
      INNER JOIN rifas r ON r.id = n.rifa_id
      WHERE n.pago = 1
    `,
    )
    .get() as { arrecadado_geral: number | null } | undefined;

  res.json({
    totais: {
      totalRifas: Number(totals?.total_rifas ?? 0),
      rifasAtivas: Number(totals?.rifas_ativas ?? 0),
      rifasSorteadas: Number(totals?.rifas_sorteadas ?? 0),
      faturamentoAlvoGeral: Number(totals?.faturamento_alvo_geral ?? 0),
      premiosGeral: Number(totals?.premios_geral ?? 0),
      arrecadadoGeral: Number(arrecadado?.arrecadado_geral ?? 0),
    },
  });
});

app.get("/api/rifas", (req: Request, res: Response) => {
  const { page, pageSize, offset } = parsePagination(req);
  const search = trimText(req.query.search);

  const where = search ? "WHERE r.descricao LIKE ?" : "";
  const params: unknown[] = [];
  if (search) {
    params.push(`%${search}%`);
  }

  const totalRow = db.prepare(`SELECT COUNT(*) AS total FROM rifas r ${where}`).get(...params) as {
    total: number;
  };

  const rows = db
    .prepare(
      `
      SELECT
        r.id,
        r.descricao,
        r.valor_premio,
        r.valor_numero,
        r.lucro_desejado,
        r.faturamento_alvo,
        r.quantidade_numeros,
        r.data_sorteio,
        r.status,
        r.criada_em,
        COUNT(n.id) AS total_numeros,
        SUM(CASE WHEN n.pessoa_id IS NOT NULL THEN 1 ELSE 0 END) AS vendidos,
        SUM(CASE WHEN n.pessoa_id IS NULL THEN 1 ELSE 0 END) AS disponiveis,
        COALESCE(SUM(CASE WHEN n.pago = 1 THEN COALESCE(n.valor_pago, r.valor_numero) ELSE 0 END), 0) AS total_arrecadado,
        CASE
          WHEN COALESCE(SUM(CASE WHEN n.pago = 1 THEN COALESCE(n.valor_pago, r.valor_numero) ELSE 0 END), 0) >= r.faturamento_alvo THEN 1
          ELSE 0
        END AS atingiu_meta
      FROM rifas r
      LEFT JOIN numeros_rifa n ON n.rifa_id = r.id
      ${where}
      GROUP BY r.id
      ORDER BY r.criada_em DESC
      LIMIT ? OFFSET ?
    `,
    )
    .all(...params, pageSize, offset);

  res.json({
    data: rows,
    pagination: {
      page,
      pageSize,
      total: Number(totalRow.total),
      totalPages: Math.ceil(Number(totalRow.total) / pageSize),
    },
  });
});

app.post("/api/rifas", (req: Request, res: Response) => {
  const descricao = trimText(req.body.descricao);
  const valorPremio = asPositiveNumber(req.body.valorPremio);
  const valorNumero = asPositiveNumber(req.body.valorNumero);
  const lucroDesejado = asNonNegativeNumber(req.body.lucroDesejado);
  const dataSorteio = trimText(req.body.dataSorteio);

  if (!descricao || !valorPremio || !valorNumero || lucroDesejado === null || !dataSorteio) {
    res.status(400).json({ message: "Dados invalidos para criar rifa." });
    return;
  }

  try {
    const { faturamentoAlvo, quantidadeNumeros } = calcularPlanejamento(valorPremio, valorNumero, lucroDesejado);
    const numeros = gerarNumerosAleatorios4Digitos(quantidadeNumeros);

    const rifaId = uuidv4();
    const insertRifa = db.prepare(
      `
      INSERT INTO rifas (
        id,
        descricao,
        valor_premio,
        valor_numero,
        lucro_desejado,
        faturamento_alvo,
        quantidade_numeros,
        data_sorteio,
        status,
        criada_em,
        atualizada_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ativa', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    );

    const insertNumero = db.prepare(
      `
      INSERT INTO numeros_rifa (
        id,
        rifa_id,
        numero,
        pessoa_id,
        pago,
        valor_pago,
        vendido_em,
        criado_em,
        atualizado_em
      ) VALUES (?, ?, ?, NULL, 0, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    );

    const tx = db.transaction(() => {
      insertRifa.run(
        rifaId,
        descricao,
        valorPremio,
        valorNumero,
        lucroDesejado,
        faturamentoAlvo,
        quantidadeNumeros,
        dataSorteio,
      );

      for (const numero of numeros) {
        insertNumero.run(uuidv4(), rifaId, numero);
      }
    });

    tx();

    res.status(201).json({
      id: rifaId,
      quantidadeNumeros,
      faturamentoAlvo,
    });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.get("/api/rifas/:id", (req: Request, res: Response) => {
  try {
    const rifa = getRifaOrThrow(asParamString(req.params.id));

    const resumo = db
      .prepare(
        `
        SELECT
          COUNT(*) AS total_numeros,
          SUM(CASE WHEN pessoa_id IS NOT NULL THEN 1 ELSE 0 END) AS vendidos,
          SUM(CASE WHEN pessoa_id IS NULL THEN 1 ELSE 0 END) AS disponiveis,
          COALESCE(SUM(CASE WHEN pago = 1 THEN COALESCE(valor_pago, ?) ELSE 0 END), 0) AS total_arrecadado,
          SUM(CASE WHEN pago = 1 THEN 1 ELSE 0 END) AS pagos
        FROM numeros_rifa
        WHERE rifa_id = ?
      `,
      )
      .get(rifa.valor_numero, rifa.id);

    const sorteio = db
      .prepare(
        `
        SELECT
          id,
          numero,
          vencedor_nome,
          vencedor_telefone,
          criada_em
        FROM sorteios
        WHERE rifa_id = ?
      `,
      )
      .get(rifa.id);

    res.json({
      rifa,
      resumo,
      sorteio: sorteio ?? null,
    });
  } catch (error) {
    res.status(404).json({ message: (error as Error).message });
  }
});

app.put("/api/rifas/:id", (req: Request, res: Response) => {
  const rifaId = asParamString(req.params.id);

  let current: ReturnType<typeof getRifaOrThrow>;
  try {
    current = getRifaOrThrow(rifaId);
  } catch (error) {
    res.status(404).json({ message: (error as Error).message });
    return;
  }

  const descricao = trimText(req.body.descricao) || current.descricao;
  const dataSorteio = trimText(req.body.dataSorteio) || current.data_sorteio;
  const status = trimText(req.body.status) || current.status;

  const valorPremio =
    req.body.valorPremio === undefined ? current.valor_premio : asPositiveNumber(req.body.valorPremio);
  const valorNumero =
    req.body.valorNumero === undefined ? current.valor_numero : asPositiveNumber(req.body.valorNumero);
  const lucroDesejado =
    req.body.lucroDesejado === undefined
      ? current.lucro_desejado
      : asNonNegativeNumber(req.body.lucroDesejado);

  if (!descricao || !dataSorteio || !valorPremio || !valorNumero || lucroDesejado === null) {
    res.status(400).json({ message: "Dados invalidos para atualizar rifa." });
    return;
  }

  try {
    const { faturamentoAlvo, quantidadeNumeros } = calcularPlanejamento(valorPremio, valorNumero, lucroDesejado);

    const soldCount = db
      .prepare("SELECT COUNT(*) AS total FROM numeros_rifa WHERE rifa_id = ? AND pessoa_id IS NOT NULL")
      .get(rifaId) as { total: number };

    if (quantidadeNumeros < Number(soldCount.total)) {
      res.status(400).json({
        message:
          "A nova configuracao exige menos numeros do que os ja vendidos. Ajuste valor/meta ou libere numeros vendidos primeiro.",
      });
      return;
    }

    const existing = db
      .prepare("SELECT id, numero, pessoa_id FROM numeros_rifa WHERE rifa_id = ? ORDER BY criado_em ASC")
      .all(rifaId) as Array<{ id: string; numero: string; pessoa_id: string | null }>;

    const updateRifa = db.prepare(
      `
      UPDATE rifas
      SET
        descricao = ?,
        valor_premio = ?,
        valor_numero = ?,
        lucro_desejado = ?,
        faturamento_alvo = ?,
        quantidade_numeros = ?,
        data_sorteio = ?,
        status = ?,
        atualizada_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    );

    const insertNumero = db.prepare(
      `
      INSERT INTO numeros_rifa (
        id,
        rifa_id,
        numero,
        pessoa_id,
        pago,
        valor_pago,
        vendido_em,
        criado_em,
        atualizado_em
      ) VALUES (?, ?, ?, NULL, 0, NULL, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    );

    const removeNumero = db.prepare("DELETE FROM numeros_rifa WHERE id = ?");

    const tx = db.transaction(() => {
      updateRifa.run(
        descricao,
        valorPremio,
        valorNumero,
        lucroDesejado,
        faturamentoAlvo,
        quantidadeNumeros,
        dataSorteio,
        status,
        rifaId,
      );

      if (quantidadeNumeros > existing.length) {
        const existingNumbers = new Set(existing.map((item) => item.numero));
        const toGenerate = quantidadeNumeros - existing.length;
        const generated = gerarNumerosAleatorios4Digitos(toGenerate, existingNumbers);
        for (const numero of generated) {
          insertNumero.run(uuidv4(), rifaId, numero);
        }
      }

      if (quantidadeNumeros < existing.length) {
        const removable = existing.filter((item) => item.pessoa_id === null).reverse();
        const toRemove = existing.length - quantidadeNumeros;
        if (removable.length < toRemove) {
          throw new Error("Nao foi possivel reduzir numeros porque nao ha numeros disponiveis suficientes para remover.");
        }
        for (let i = 0; i < toRemove; i += 1) {
          removeNumero.run(removable[i]?.id);
        }
      }
    });

    tx();
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.delete("/api/rifas/:id", (req: Request, res: Response) => {
  const result = db.prepare("DELETE FROM rifas WHERE id = ?").run(asParamString(req.params.id));
  if (result.changes === 0) {
    res.status(404).json({ message: "Rifa nao encontrada." });
    return;
  }

  res.json({ ok: true });
});

app.get("/api/rifas/:id/numeros", (req: Request, res: Response) => {
  const { page, pageSize, offset } = parsePagination(req);
  const rifaId = asParamString(req.params.id);

  try {
    getRifaOrThrow(rifaId);
  } catch (error) {
    res.status(404).json({ message: (error as Error).message });
    return;
  }

  const search = trimText(req.query.search);
  const statusFilter = trimText(req.query.status);

  const conditions: string[] = ["n.rifa_id = ?"];
  const params: unknown[] = [rifaId];

  if (search) {
    conditions.push("(n.numero LIKE ? OR p.nome LIKE ? OR p.telefone LIKE ?)");
    const pattern = `%${search}%`;
    params.push(pattern, pattern, pattern);
  }

  if (statusFilter === "disponivel") {
    conditions.push("n.pessoa_id IS NULL");
  } else if (statusFilter === "vendido") {
    conditions.push("n.pessoa_id IS NOT NULL");
  } else if (statusFilter === "pago") {
    conditions.push("n.pago = 1");
  } else if (statusFilter === "nao-pago") {
    conditions.push("n.pessoa_id IS NOT NULL AND n.pago = 0");
  }

  const where = `WHERE ${conditions.join(" AND ")}`;

  const total = db
    .prepare(
      `
      SELECT COUNT(*) AS total
      FROM numeros_rifa n
      LEFT JOIN pessoas p ON p.id = n.pessoa_id
      ${where}
    `,
    )
    .get(...params) as { total: number };

  const rows = db
    .prepare(
      `
      SELECT
        n.id,
        n.numero,
        n.pessoa_id,
        n.pago,
        n.valor_pago,
        n.vendido_em,
        n.criado_em,
        p.nome,
        p.telefone
      FROM numeros_rifa n
      LEFT JOIN pessoas p ON p.id = n.pessoa_id
      ${where}
      ORDER BY n.numero ASC
      LIMIT ? OFFSET ?
    `,
    )
    .all(...params, pageSize, offset);

  res.json({
    data: rows,
    pagination: {
      page,
      pageSize,
      total: Number(total.total),
      totalPages: Math.ceil(Number(total.total) / pageSize),
    },
  });
});

app.post("/api/rifas/:rifaId/numeros/:numeroId/associar", (req: Request, res: Response) => {
  const rifaId = asParamString(req.params.rifaId);
  const numeroId = asParamString(req.params.numeroId);

  let rifa: ReturnType<typeof getRifaOrThrow>;
  try {
    rifa = getRifaOrThrow(rifaId);
  } catch (error) {
    res.status(404).json({ message: (error as Error).message });
    return;
  }

  if (rifa.status !== "ativa") {
    res.status(400).json({ message: "Somente rifas ativas permitem compra de numeros." });
    return;
  }

  const numero = db
    .prepare("SELECT id, pessoa_id FROM numeros_rifa WHERE id = ? AND rifa_id = ?")
    .get(numeroId, rifaId) as { id: string; pessoa_id: string | null } | undefined;

  if (!numero) {
    res.status(404).json({ message: "Numero nao encontrado para essa rifa." });
    return;
  }

  if (numero.pessoa_id) {
    res.status(409).json({ message: "Numero ja foi comprado." });
    return;
  }

  const pago = req.body.pago ? 1 : 0;
  const valorPagoInput = req.body.valorPago;
  const valorPago =
    valorPagoInput === null || valorPagoInput === undefined || valorPagoInput === ""
      ? null
      : Number(valorPagoInput);

  if (valorPago !== null && (!Number.isFinite(valorPago) || valorPago < 0)) {
    res.status(400).json({ message: "Valor pago invalido." });
    return;
  }

  try {
    const pessoaId = resolvePessoaId({
      pessoaId: req.body.pessoaId,
      nome: req.body.nome,
      telefone: req.body.telefone,
    });

    db.prepare(
      `
      UPDATE numeros_rifa
      SET pessoa_id = ?,
          pago = ?,
          valor_pago = ?,
          vendido_em = CURRENT_TIMESTAMP,
          atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    ).run(pessoaId, pago, valorPago, numeroId);

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.post("/api/rifas/:rifaId/numeros/associar-lote", (req: Request, res: Response) => {
  const rifaId = asParamString(req.params.rifaId);

  let rifa: ReturnType<typeof getRifaOrThrow>;
  try {
    rifa = getRifaOrThrow(rifaId);
  } catch (error) {
    res.status(404).json({ message: (error as Error).message });
    return;
  }

  if (rifa.status !== "ativa") {
    res.status(400).json({ message: "Somente rifas ativas permitem compra de numeros." });
    return;
  }

  const numeroIdsRaw = Array.isArray(req.body.numeroIds) ? req.body.numeroIds : [];
  const numeroIds = numeroIdsRaw
    .map((item: unknown) => trimText(item))
    .filter((item: string) => Boolean(item));

  if (numeroIds.length === 0) {
    res.status(400).json({ message: "Informe ao menos um numero para associar." });
    return;
  }

  const uniqueNumeroIds = Array.from(new Set(numeroIds));
  if (uniqueNumeroIds.length !== numeroIds.length) {
    res.status(400).json({ message: "Lista de numeros contem itens duplicados." });
    return;
  }

  const pago = req.body.pago ? 1 : 0;
  const valorPagoInput = req.body.valorPago;
  const valorPago =
    valorPagoInput === null || valorPagoInput === undefined || valorPagoInput === ""
      ? null
      : Number(valorPagoInput);

  if (valorPago !== null && (!Number.isFinite(valorPago) || valorPago < 0)) {
    res.status(400).json({ message: "Valor pago invalido." });
    return;
  }

  try {
    const pessoaId = resolvePessoaId({
      pessoaId: req.body.pessoaId,
      nome: req.body.nome,
      telefone: req.body.telefone,
    });

    const placeholders = uniqueNumeroIds.map(() => "?").join(",");
    const numbers = db
      .prepare(
        `
        SELECT id, pessoa_id
        FROM numeros_rifa
        WHERE rifa_id = ?
          AND id IN (${placeholders})
      `,
      )
      .all(rifaId, ...uniqueNumeroIds) as Array<{ id: string; pessoa_id: string | null }>;

    if (numbers.length !== uniqueNumeroIds.length) {
      res.status(404).json({ message: "Um ou mais numeros nao foram encontrados para essa rifa." });
      return;
    }

    const soldNumber = numbers.find((item) => item.pessoa_id !== null);
    if (soldNumber) {
      res.status(409).json({ message: "Um ou mais numeros selecionados ja foram comprados." });
      return;
    }

    const updateNumero = db.prepare(
      `
      UPDATE numeros_rifa
      SET pessoa_id = ?,
          pago = ?,
          valor_pago = ?,
          vendido_em = CURRENT_TIMESTAMP,
          atualizado_em = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    );

    const tx = db.transaction(() => {
      for (const numeroId of uniqueNumeroIds) {
        updateNumero.run(pessoaId, pago, valorPago, numeroId);
      }
    });

    tx();
    res.json({ ok: true, quantidade: uniqueNumeroIds.length });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.patch("/api/rifas/:rifaId/numeros/:numeroId", (req: Request, res: Response) => {
  const rifaId = asParamString(req.params.rifaId);
  const numeroId = asParamString(req.params.numeroId);

  const numero = db
    .prepare("SELECT id, pessoa_id FROM numeros_rifa WHERE id = ? AND rifa_id = ?")
    .get(numeroId, rifaId) as { id: string; pessoa_id: string | null } | undefined;

  if (!numero) {
    res.status(404).json({ message: "Numero nao encontrado para essa rifa." });
    return;
  }

  if (!numero.pessoa_id) {
    res.status(400).json({ message: "Numero ainda nao foi associado a uma pessoa." });
    return;
  }

  const fields: string[] = [];
  const values: unknown[] = [];

  if (req.body.pago !== undefined) {
    fields.push("pago = ?");
    values.push(req.body.pago ? 1 : 0);
  }

  if (req.body.valorPago !== undefined) {
    if (req.body.valorPago === null || req.body.valorPago === "") {
      fields.push("valor_pago = NULL");
    } else {
      const valorPago = Number(req.body.valorPago);
      if (!Number.isFinite(valorPago) || valorPago < 0) {
        res.status(400).json({ message: "Valor pago invalido." });
        return;
      }
      fields.push("valor_pago = ?");
      values.push(valorPago);
    }
  }

  if (fields.length === 0) {
    res.status(400).json({ message: "Nenhum campo para atualizar." });
    return;
  }

  values.push(numeroId);
  db.prepare(`UPDATE numeros_rifa SET ${fields.join(", ")}, atualizado_em = CURRENT_TIMESTAMP WHERE id = ?`).run(
    ...values,
  );
  res.json({ ok: true });
});

app.delete("/api/rifas/:rifaId/numeros/:numeroId/associacao", (req: Request, res: Response) => {
  const rifaId = asParamString(req.params.rifaId);
  const numeroId = asParamString(req.params.numeroId);

  const numero = db
    .prepare("SELECT id FROM numeros_rifa WHERE id = ? AND rifa_id = ?")
    .get(numeroId, rifaId) as { id: string } | undefined;

  if (!numero) {
    res.status(404).json({ message: "Numero nao encontrado para essa rifa." });
    return;
  }

  db.prepare(
    `
    UPDATE numeros_rifa
    SET pessoa_id = NULL,
        pago = 0,
        valor_pago = NULL,
        vendido_em = NULL,
        atualizado_em = CURRENT_TIMESTAMP
    WHERE id = ?
  `,
  ).run(numeroId);

  res.json({ ok: true });
});

app.delete("/api/rifas/:rifaId/numeros/:numeroId", (req: Request, res: Response) => {
  const rifaId = asParamString(req.params.rifaId);
  const numeroId = asParamString(req.params.numeroId);

  const numero = db
    .prepare("SELECT id, pessoa_id FROM numeros_rifa WHERE id = ? AND rifa_id = ?")
    .get(numeroId, rifaId) as { id: string; pessoa_id: string | null } | undefined;

  if (!numero) {
    res.status(404).json({ message: "Numero nao encontrado para essa rifa." });
    return;
  }

  if (numero.pessoa_id) {
    res.status(400).json({ message: "Numero vendido nao pode ser removido. Libere a associacao primeiro." });
    return;
  }

  db.prepare("DELETE FROM numeros_rifa WHERE id = ?").run(numeroId);
  db.prepare("UPDATE rifas SET quantidade_numeros = quantidade_numeros - 1, atualizada_em = CURRENT_TIMESTAMP WHERE id = ?").run(
    rifaId,
  );

  res.json({ ok: true });
});

app.get("/api/pessoas", (req: Request, res: Response) => {
  const { page, pageSize, offset } = parsePagination(req);
  const search = trimText(req.query.search);

  const where = search ? "WHERE nome LIKE ? OR telefone LIKE ?" : "";
  const params: unknown[] = [];
  if (search) {
    const pattern = `%${search}%`;
    params.push(pattern, pattern);
  }

  const total = db.prepare(`SELECT COUNT(*) AS total FROM pessoas ${where}`).get(...params) as {
    total: number;
  };

  const rows = db
    .prepare(
      `
      SELECT id, nome, telefone, criada_em, atualizada_em
      FROM pessoas
      ${where}
      ORDER BY nome ASC
      LIMIT ? OFFSET ?
    `,
    )
    .all(...params, pageSize, offset);

  res.json({
    data: rows,
    pagination: {
      page,
      pageSize,
      total: Number(total.total),
      totalPages: Math.ceil(Number(total.total) / pageSize),
    },
  });
});

app.post("/api/pessoas", (req: Request, res: Response) => {
  try {
    const id = getOrCreatePessoa({
      nome: req.body.nome,
      telefone: req.body.telefone,
    });
    res.status(201).json({ id });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.put("/api/pessoas/:id", (req: Request, res: Response) => {
  const pessoaId = asParamString(req.params.id);
  const nome = trimText(req.body.nome);
  const telefone = trimText(req.body.telefone);

  if (!nome || !telefone) {
    res.status(400).json({ message: "Nome e telefone sao obrigatorios." });
    return;
  }

  try {
    const result = db
      .prepare(
        `
        UPDATE pessoas
        SET nome = ?, telefone = ?, atualizada_em = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
      )
      .run(nome, telefone, pessoaId);

    if (result.changes === 0) {
      res.status(404).json({ message: "Pessoa nao encontrada." });
      return;
    }

    res.json({ ok: true });
  } catch (error) {
    const message = (error as Error).message;
    if (message.includes("UNIQUE constraint failed")) {
      res.status(409).json({ message: "Ja existe pessoa com esse nome e telefone." });
      return;
    }
    res.status(400).json({ message });
  }
});

app.delete("/api/pessoas/:id", (req: Request, res: Response) => {
  const pessoaId = asParamString(req.params.id);

  const tx = db.transaction(() => {
    db.prepare(
      `
      UPDATE numeros_rifa
      SET pessoa_id = NULL,
          pago = 0,
          valor_pago = NULL,
          vendido_em = NULL,
          atualizado_em = CURRENT_TIMESTAMP
      WHERE pessoa_id = ?
    `,
    ).run(pessoaId);

    db.prepare("UPDATE sorteios SET pessoa_id = NULL WHERE pessoa_id = ?").run(pessoaId);

    const result = db.prepare("DELETE FROM pessoas WHERE id = ?").run(pessoaId);
    return result.changes;
  });

  const changes = tx();
  if (!changes) {
    res.status(404).json({ message: "Pessoa nao encontrada." });
    return;
  }

  res.json({ ok: true });
});

app.get("/api/rifas/:id/candidatos-sorteio", (req: Request, res: Response) => {
  const rifaId = asParamString(req.params.id);

  try {
    getRifaOrThrow(rifaId);
  } catch (error) {
    res.status(404).json({ message: (error as Error).message });
    return;
  }

  const candidatos = db
    .prepare(
      `
      SELECT
        n.id,
        n.numero,
        p.nome,
        p.telefone
      FROM numeros_rifa n
      INNER JOIN pessoas p ON p.id = n.pessoa_id
      WHERE n.rifa_id = ?
        AND n.pago = 1
        AND n.pessoa_id IS NOT NULL
      ORDER BY n.numero ASC
    `,
    )
    .all(rifaId);

  res.json({ data: candidatos });
});

app.post("/api/rifas/:id/sortear", (req: Request, res: Response) => {
  const rifaId = asParamString(req.params.id);

  let rifa: ReturnType<typeof getRifaOrThrow>;
  try {
    rifa = getRifaOrThrow(rifaId);
  } catch (error) {
    res.status(404).json({ message: (error as Error).message });
    return;
  }

  const sorteioExistente = db
    .prepare(
      `
      SELECT id, numero, vencedor_nome, vencedor_telefone, criada_em
      FROM sorteios
      WHERE rifa_id = ?
    `,
    )
    .get(rifaId);

  if (sorteioExistente) {
    res.status(409).json({
      message: "Essa rifa ja foi sorteada.",
      sorteio: sorteioExistente,
    });
    return;
  }

  const candidatos = db
    .prepare(
      `
      SELECT
        n.id,
        n.numero,
        n.pessoa_id,
        p.nome,
        p.telefone
      FROM numeros_rifa n
      INNER JOIN pessoas p ON p.id = n.pessoa_id
      WHERE n.rifa_id = ?
        AND n.pago = 1
        AND n.pessoa_id IS NOT NULL
    `,
    )
    .all(rifaId) as Array<{
    id: string;
    numero: string;
    pessoa_id: string;
    nome: string;
    telefone: string;
  }>;

  if (candidatos.length === 0) {
    res.status(400).json({ message: "Nao ha numeros pagos para realizar o sorteio." });
    return;
  }

  const winner = candidatos[Math.floor(Math.random() * candidatos.length)];
  if (!winner) {
    res.status(500).json({ message: "Falha inesperada ao selecionar vencedor." });
    return;
  }

  const tx = db.transaction(() => {
    db.prepare(
      `
      INSERT INTO sorteios (
        id,
        rifa_id,
        numero_rifa_id,
        numero,
        pessoa_id,
        vencedor_nome,
        vencedor_telefone,
        criada_em
      ) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `,
    ).run(
      uuidv4(),
      rifaId,
      winner.id,
      winner.numero,
      winner.pessoa_id,
      winner.nome,
      winner.telefone,
    );

    db.prepare("UPDATE rifas SET status = 'sorteada', atualizada_em = CURRENT_TIMESTAMP WHERE id = ?").run(
      rifaId,
    );
  });

  tx();

  res.json({
    rifa: {
      id: rifa.id,
      descricao: rifa.descricao,
    },
    candidatos,
    vencedor: {
      numero: winner.numero,
      nome: winner.nome,
      telefone: winner.telefone,
    },
  });
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
