import cors from "cors";
import express, { type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "./db";

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

async function getOrCreatePessoa(payload: PessoaPayload): Promise<string> {
  const nome = trimText(payload.nome);
  const telefone = trimText(payload.telefone);

  if (!nome || !telefone) {
    throw new Error("Nome e telefone sao obrigatorios para pessoa.");
  }

  const { data: existing, error: searchError } = await supabase
    .from("pessoas")
    .select("id")
    .eq("nome", nome)
    .eq("telefone", telefone)
    .single();

  if (existing && !searchError) {
    return existing.id;
  }

  const pessoaId = uuidv4();
  const { error: insertError } = await supabase
    .from("pessoas")
    .insert({
      id: pessoaId,
      nome,
      telefone,
    });

  if (insertError) {
    throw new Error(`Erro ao criar pessoa: ${insertError.message}`);
  }

  return pessoaId;
}

async function resolvePessoaId(input: {
  pessoaId?: unknown;
  nome?: unknown;
  telefone?: unknown;
}): Promise<string> {
  const pessoaId = trimText(input.pessoaId);
  if (pessoaId) {
    const { data: pessoa, error } = await supabase
      .from("pessoas")
      .select("id")
      .eq("id", pessoaId)
      .single();

    if (error || !pessoa) {
      throw new Error("Pessoa selecionada nao encontrada.");
    }

    return pessoa.id;
  }

  return getOrCreatePessoa({
    nome: trimText(input.nome),
    telefone: trimText(input.telefone),
  });
}

function calcularPlanejamento(
  valorPremio: number,
  valorNumero: number,
  lucroDesejado: number
): {
  faturamentoAlvo: number;
  quantidadeNumeros: number;
} {
  const faturamentoAlvo = valorPremio + lucroDesejado;
  const quantidadeNumeros = Math.ceil(faturamentoAlvo / valorNumero);
  if (quantidadeNumeros > 9000) {
    throw new Error(
      "A quantidade de numeros necessaria ultrapassa o limite de 9000 para 4 digitos. Ajuste valor do numero ou meta de lucro."
    );
  }
  return { faturamentoAlvo, quantidadeNumeros };
}

function gerarNumerosAleatorios4Digitos(
  quantidade: number,
  existentes: Set<string> = new Set()
): string[] {
  const pool: string[] = [];
  for (let i = 1000; i <= 9999; i += 1) {
    const numero = format4Digits(i);
    if (!existentes.has(numero)) {
      pool.push(numero);
    }
  }

  if (quantidade > pool.length) {
    throw new Error(
      "Nao ha numeros de 4 digitos suficientes para gerar a quantidade desejada."
    );
  }

  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const current = pool[i] as string;
    pool[i] = pool[j] as string;
    pool[j] = current;
  }

  return pool.slice(0, quantidade);
}

async function getRifaOrThrow(rifaId: string): Promise<{
  id: string;
  descricao: string;
  valor_premio: number;
  valor_numero: number;
  lucro_desejado: number;
  faturamento_alvo: number;
  quantidade_numeros: number;
  data_sorteio: string;
  status: string;
  foto_premio: string | null;
}> {
  const { data: rifa, error } = await supabase
    .from("rifas")
    .select(
      `
      id,
      descricao,
      valor_premio,
      valor_numero,
      lucro_desejado,
      faturamento_alvo,
      quantidade_numeros,
      data_sorteio,
      status,
      foto_premio
    `
    )
    .eq("id", rifaId)
    .single();

  if (error || !rifa) {
    throw new Error("Rifa nao encontrada.");
  }

  return rifa;
}

app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get("/api/dashboard", async (_req: Request, res: Response) => {
  try {
    // Totais de rifas
    const { data: rifasData, error: rifasError } = await supabase
      .from("rifas")
      .select("id, status, faturamento_alvo, valor_premio");

    if (rifasError) throw rifasError;

    const totalRifas = rifasData?.length || 0;
    const rifasAtivas = rifasData?.filter((r) => r.status === "ativa").length || 0;
    const rifasSorteadas = rifasData?.filter((r) => r.status === "sorteada").length || 0;
    const faturamentoAlvoGeral =
      rifasData?.reduce((sum, r) => sum + Number(r.faturamento_alvo || 0), 0) || 0;
    const premiosGeral =
      rifasData?.reduce((sum, r) => sum + Number(r.valor_premio || 0), 0) || 0;

    // Arrecadado total
    const { data: numerosData, error: numerosError } = await supabase
      .from("numeros_rifa")
      .select("valor_pago, pago, rifas!inner(valor_numero)")
      .eq("pago", true);

    if (numerosError) throw numerosError;

    const arrecadadoGeral =
      numerosData?.reduce((sum, n: any) => {
        const valor = n.valor_pago || n.rifas?.valor_numero || 0;
        return sum + Number(valor);
      }, 0) || 0;

    res.json({
      totais: {
        totalRifas,
        rifasAtivas,
        rifasSorteadas,
        faturamentoAlvoGeral,
        premiosGeral,
        arrecadadoGeral,
      },
    });
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
});

app.get("/api/rifas", async (req: Request, res: Response) => {
  try {
    const { page, pageSize, offset } = parsePagination(req);
    const search = trimText(req.query.search);

    let query = supabase
      .from("rifas")
      .select(
        `
        *,
        numeros:numeros_rifa(id, pessoa_id, pago, valor_pago)
      `,
        { count: "exact" }
      )
      .order("criada_em", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (search) {
      query = query.ilike("descricao", `%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    const rifasComResumo = data?.map((rifa: any) => {
      const totalNumeros = rifa.numeros?.length || 0;
      const vendidos =
        rifa.numeros?.filter((n: any) => n.pessoa_id !== null).length || 0;
      const disponiveis = totalNumeros - vendidos;
      const totalArrecadado =
        rifa.numeros
          ?.filter((n: any) => n.pago)
          .reduce((sum: number, n: any) => {
            const valor = n.valor_pago || rifa.valor_numero || 0;
            return sum + Number(valor);
          }, 0) || 0;
      const atingiuMeta = totalArrecadado >= Number(rifa.faturamento_alvo);

      const { numeros, ...rifaData } = rifa;
      return {
        ...rifaData,
        total_numeros: totalNumeros,
        vendidos,
        disponiveis,
        total_arrecadado: totalArrecadado,
        atingiu_meta: atingiuMeta ? 1 : 0,
      };
    });

    res.json({
      data: rifasComResumo,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    });
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
});

app.post("/api/rifas", async (req: Request, res: Response) => {
  const descricao = trimText(req.body.descricao);
  const valorPremio = asPositiveNumber(req.body.valorPremio);
  const valorNumero = asPositiveNumber(req.body.valorNumero);
  const lucroDesejado = asNonNegativeNumber(req.body.lucroDesejado);
  const dataSorteio = trimText(req.body.dataSorteio);
  const fotoPremio = trimText(req.body.fotoPremio) || null;

  if (
    !descricao ||
    !valorPremio ||
    !valorNumero ||
    lucroDesejado === null ||
    !dataSorteio
  ) {
    res.status(400).json({ message: "Dados invalidos para criar rifa." });
    return;
  }

  try {
    const { faturamentoAlvo, quantidadeNumeros } = calcularPlanejamento(
      valorPremio,
      valorNumero,
      lucroDesejado
    );
    const numeros = gerarNumerosAleatorios4Digitos(quantidadeNumeros);

    const rifaId = uuidv4();

    // Inserir rifa
    const { error: rifaError } = await supabase.from("rifas").insert({
      id: rifaId,
      descricao,
      valor_premio: valorPremio,
      valor_numero: valorNumero,
      lucro_desejado: lucroDesejado,
      faturamento_alvo: faturamentoAlvo,
      quantidade_numeros: quantidadeNumeros,
      data_sorteio: dataSorteio,
      status: "ativa",
      foto_premio: fotoPremio,
    });

    if (rifaError) throw rifaError;

    // Inserir números em lotes
    const numerosParaInserir = numeros.map((numero) => ({
      id: uuidv4(),
      rifa_id: rifaId,
      numero,
      pago: false,
    }));

    const { error: numerosError } = await supabase
      .from("numeros_rifa")
      .insert(numerosParaInserir);

    if (numerosError) throw numerosError;

    res.status(201).json({
      id: rifaId,
      quantidadeNumeros,
      faturamentoAlvo,
    });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.get("/api/rifas/:id", async (req: Request, res: Response) => {
  try {
    const rifa = await getRifaOrThrow(asParamString(req.params.id));

    // Buscar resumo dos números
    const { data: numerosData, error: numerosError } = await supabase
      .from("numeros_rifa")
      .select("id, pessoa_id, pago, valor_pago")
      .eq("rifa_id", rifa.id);

    if (numerosError) throw numerosError;

    const totalNumeros = numerosData?.length || 0;
    const vendidos =
      numerosData?.filter((n) => n.pessoa_id !== null).length || 0;
    const disponiveis = totalNumeros - vendidos;
    const pagos = numerosData?.filter((n) => n.pago).length || 0;
    const totalArrecadado =
      numerosData
        ?.filter((n) => n.pago)
        .reduce((sum, n) => {
          const valor = n.valor_pago || rifa.valor_numero || 0;
          return sum + Number(valor);
        }, 0) || 0;

    // Buscar sorteio se existir
    const { data: sorteio, error: sorteioError } = await supabase
      .from("sorteios")
      .select("id, numero, vencedor_nome, vencedor_telefone, criada_em")
      .eq("rifa_id", rifa.id)
      .single();

    res.json({
      rifa,
      resumo: {
        total_numeros: totalNumeros,
        vendidos,
        disponiveis,
        total_arrecadado: totalArrecadado,
        pagos,
      },
      sorteio: sorteioError ? null : sorteio,
    });
  } catch (error) {
    res.status(404).json({ message: (error as Error).message });
  }
});

app.put("/api/rifas/:id", async (req: Request, res: Response) => {
  const rifaId = asParamString(req.params.id);

  try {
    const current = await getRifaOrThrow(rifaId);

    const descricao = trimText(req.body.descricao) || current.descricao;
    const dataSorteio = trimText(req.body.dataSorteio) || current.data_sorteio;
    const status = trimText(req.body.status) || current.status;
    const fotoPremio = 
      req.body.fotoPremio === undefined
        ? current.foto_premio
        : trimText(req.body.fotoPremio) || null;

    const valorPremio =
      req.body.valorPremio === undefined
        ? current.valor_premio
        : asPositiveNumber(req.body.valorPremio);
    const valorNumero =
      req.body.valorNumero === undefined
        ? current.valor_numero
        : asPositiveNumber(req.body.valorNumero);
    const lucroDesejado =
      req.body.lucroDesejado === undefined
        ? current.lucro_desejado
        : asNonNegativeNumber(req.body.lucroDesejado);

    if (
      !descricao ||
      !dataSorteio ||
      !valorPremio ||
      !valorNumero ||
      lucroDesejado === null
    ) {
      res.status(400).json({ message: "Dados invalidos para atualizar rifa." });
      return;
    }

    const { faturamentoAlvo, quantidadeNumeros } = calcularPlanejamento(
      valorPremio,
      valorNumero,
      lucroDesejado
    );

    // Verificar quantos números já foram vendidos
    const { count: soldCount, error: countError } = await supabase
      .from("numeros_rifa")
      .select("*", { count: "exact", head: true })
      .eq("rifa_id", rifaId)
      .not("pessoa_id", "is", null);

    if (countError) throw countError;

    if (quantidadeNumeros < (soldCount || 0)) {
      res.status(400).json({
        message:
          "A nova configuracao exige menos numeros do que os ja vendidos. Ajuste valor/meta ou libere numeros vendidos primeiro.",
      });
      return;
    }

    // Buscar números existentes
    const { data: existing, error: existingError } = await supabase
      .from("numeros_rifa")
      .select("id, numero, pessoa_id")
      .eq("rifa_id", rifaId)
      .order("criado_em", { ascending: true });

    if (existingError) throw existingError;

    // Atualizar rifa
    const { error: updateError } = await supabase
      .from("rifas")
      .update({
        descricao,
        valor_premio: valorPremio,
        valor_numero: valorNumero,
        lucro_desejado: lucroDesejado,
        faturamento_alvo: faturamentoAlvo,
        quantidade_numeros: quantidadeNumeros,
        data_sorteio: dataSorteio,
        status,
        foto_premio: fotoPremio,
      })
      .eq("id", rifaId);

    if (updateError) throw updateError;

    const existingLength = existing?.length || 0;

    // Se precisa adicionar mais números
    if (quantidadeNumeros > existingLength) {
      const existingNumbers = new Set(existing?.map((item) => item.numero) || []);
      const toGenerate = quantidadeNumeros - existingLength;
      const generated = gerarNumerosAleatorios4Digitos(toGenerate, existingNumbers);

      const numerosParaInserir = generated.map((numero) => ({
        id: uuidv4(),
        rifa_id: rifaId,
        numero,
        pago: false,
      }));

      const { error: insertError } = await supabase
        .from("numeros_rifa")
        .insert(numerosParaInserir);

      if (insertError) throw insertError;
    }

    // Se precisa remover números
    if (quantidadeNumeros < existingLength) {
      const removable = existing?.filter((item) => item.pessoa_id === null).reverse() || [];
      const toRemove = existingLength - quantidadeNumeros;

      if (removable.length < toRemove) {
        throw new Error(
          "Nao foi possivel reduzir numeros porque nao ha numeros disponiveis suficientes para remover."
        );
      }

      const idsToRemove = removable.slice(0, toRemove).map((item) => item.id);
      const { error: deleteError } = await supabase
        .from("numeros_rifa")
        .delete()
        .in("id", idsToRemove);

      if (deleteError) throw deleteError;
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.delete("/api/rifas/:id", async (req: Request, res: Response) => {
  try {
    const { error } = await supabase
      .from("rifas")
      .delete()
      .eq("id", asParamString(req.params.id));

    if (error) throw error;

    res.json({ ok: true });
  } catch (error) {
    res.status(404).json({ message: (error as Error).message });
  }
});

app.get("/api/rifas/:id/numeros", async (req: Request, res: Response) => {
  const { page, pageSize, offset } = parsePagination(req);
  const rifaId = asParamString(req.params.id);

  try {
    await getRifaOrThrow(rifaId);

    const search = trimText(req.query.search);
    const statusFilter = trimText(req.query.status);

    let query = supabase
      .from("numeros_rifa")
      .select(
        `
        id,
        numero,
        pessoa_id,
        pago,
        valor_pago,
        vendido_em,
        criado_em,
        pessoas(nome, telefone)
      `,
        { count: "exact" }
      )
      .eq("rifa_id", rifaId)
      .order("numero", { ascending: true });

    if (search) {
      // Para busca, fazemos uma query mais complexa
      const { data: searchData, error: searchError } = await supabase
        .from("numeros_rifa")
        .select(
          `
          id,
          numero,
          pessoa_id,
          pago,
          valor_pago,
          vendido_em,
          criado_em,
          pessoas(nome, telefone)
        `,
          { count: "exact" }
        )
        .eq("rifa_id", rifaId)
        .order("numero", { ascending: true });

      if (searchError) throw searchError;

      const filtered = searchData?.filter((item: any) => {
        const searchLower = search.toLowerCase();
        return (
          item.numero.toLowerCase().includes(searchLower) ||
          item.pessoas?.nome?.toLowerCase().includes(searchLower) ||
          item.pessoas?.telefone?.toLowerCase().includes(searchLower)
        );
      });

      const total = filtered?.length || 0;
      const paginatedData = filtered?.slice(offset, offset + pageSize);

      const rows = paginatedData?.map((item: any) => ({
        id: item.id,
        numero: item.numero,
        pessoa_id: item.pessoa_id,
        pago: item.pago,
        valor_pago: item.valor_pago,
        vendido_em: item.vendido_em,
        criado_em: item.criado_em,
        nome: item.pessoas?.nome || null,
        telefone: item.pessoas?.telefone || null,
      }));

      res.json({
        data: rows,
        pagination: {
          page,
          pageSize,
          total,
          totalPages: Math.ceil(total / pageSize),
        },
      });
      return;
    }

    if (statusFilter === "disponivel") {
      query = query.is("pessoa_id", null);
    } else if (statusFilter === "vendido") {
      query = query.not("pessoa_id", "is", null);
    } else if (statusFilter === "pago") {
      query = query.eq("pago", true);
    } else if (statusFilter === "nao-pago") {
      query = query.not("pessoa_id", "is", null).eq("pago", false);
    }

    query = query.range(offset, offset + pageSize - 1);

    const { data, error, count } = await query;

    if (error) throw error;

    const rows = data?.map((item: any) => ({
      id: item.id,
      numero: item.numero,
      pessoa_id: item.pessoa_id,
      pago: item.pago,
      valor_pago: item.valor_pago,
      vendido_em: item.vendido_em,
      criado_em: item.criado_em,
      nome: item.pessoas?.nome || null,
      telefone: item.pessoas?.telefone || null,
    }));

    res.json({
      data: rows,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    });
  } catch (error) {
    res.status(404).json({ message: (error as Error).message });
  }
});

app.post(
  "/api/rifas/:rifaId/numeros/:numeroId/associar",
  async (req: Request, res: Response) => {
    const rifaId = asParamString(req.params.rifaId);
    const numeroId = asParamString(req.params.numeroId);

    try {
      const rifa = await getRifaOrThrow(rifaId);

      if (rifa.status !== "ativa") {
        res
          .status(400)
          .json({ message: "Somente rifas ativas permitem compra de numeros." });
        return;
      }

      const { data: numero, error: numeroError } = await supabase
        .from("numeros_rifa")
        .select("id, pessoa_id")
        .eq("id", numeroId)
        .eq("rifa_id", rifaId)
        .single();

      if (numeroError || !numero) {
        res.status(404).json({ message: "Numero nao encontrado para essa rifa." });
        return;
      }

      if (numero.pessoa_id) {
        res.status(409).json({ message: "Numero ja foi comprado." });
        return;
      }

      const pago = req.body.pago ? true : false;
      const valorPagoInput = req.body.valorPago;
      const valorPago =
        valorPagoInput === null ||
        valorPagoInput === undefined ||
        valorPagoInput === ""
          ? null
          : Number(valorPagoInput);

      if (valorPago !== null && (!Number.isFinite(valorPago) || valorPago < 0)) {
        res.status(400).json({ message: "Valor pago invalido." });
        return;
      }

      const pessoaId = await resolvePessoaId({
        pessoaId: req.body.pessoaId,
        nome: req.body.nome,
        telefone: req.body.telefone,
      });

      const { error: updateError } = await supabase
        .from("numeros_rifa")
        .update({
          pessoa_id: pessoaId,
          pago,
          valor_pago: valorPago,
          vendido_em: new Date().toISOString(),
        })
        .eq("id", numeroId);

      if (updateError) throw updateError;

      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: (error as Error).message });
    }
  }
);

app.post(
  "/api/rifas/:rifaId/numeros/associar-lote",
  async (req: Request, res: Response) => {
    const rifaId = asParamString(req.params.rifaId);

    try {
      const rifa = await getRifaOrThrow(rifaId);

      if (rifa.status !== "ativa") {
        res
          .status(400)
          .json({ message: "Somente rifas ativas permitem compra de numeros." });
        return;
      }

      const numeroIdsRaw = Array.isArray(req.body.numeroIds)
        ? req.body.numeroIds
        : [];
      const numeroIds = numeroIdsRaw
        .map((item: unknown) => trimText(item))
        .filter((item: string) => Boolean(item));

      if (numeroIds.length === 0) {
        res
          .status(400)
          .json({ message: "Informe ao menos um numero para associar." });
        return;
      }

      const uniqueNumeroIds = Array.from(new Set(numeroIds));
      if (uniqueNumeroIds.length !== numeroIds.length) {
        res
          .status(400)
          .json({ message: "Lista de numeros contem itens duplicados." });
        return;
      }

      const pago = req.body.pago ? true : false;
      const valorPagoInput = req.body.valorPago;
      const valorPago =
        valorPagoInput === null ||
        valorPagoInput === undefined ||
        valorPagoInput === ""
          ? null
          : Number(valorPagoInput);

      if (valorPago !== null && (!Number.isFinite(valorPago) || valorPago < 0)) {
        res.status(400).json({ message: "Valor pago invalido." });
        return;
      }

      const pessoaId = await resolvePessoaId({
        pessoaId: req.body.pessoaId,
        nome: req.body.nome,
        telefone: req.body.telefone,
      });

      const { data: numbers, error: numbersError } = await supabase
        .from("numeros_rifa")
        .select("id, pessoa_id")
        .eq("rifa_id", rifaId)
        .in("id", uniqueNumeroIds);

      if (numbersError) throw numbersError;

      if ((numbers?.length || 0) !== uniqueNumeroIds.length) {
        res
          .status(404)
          .json({
            message: "Um ou mais numeros nao foram encontrados para essa rifa.",
          });
        return;
      }

      const soldNumber = numbers?.find((item) => item.pessoa_id !== null);
      if (soldNumber) {
        res
          .status(409)
          .json({ message: "Um ou mais numeros selecionados ja foram comprados." });
        return;
      }

      const { error: updateError } = await supabase
        .from("numeros_rifa")
        .update({
          pessoa_id: pessoaId,
          pago,
          valor_pago: valorPago,
          vendido_em: new Date().toISOString(),
        })
        .in("id", uniqueNumeroIds);

      if (updateError) throw updateError;

      res.json({ ok: true, quantidade: uniqueNumeroIds.length });
    } catch (error) {
      res.status(400).json({ message: (error as Error).message });
    }
  }
);

app.patch(
  "/api/rifas/:rifaId/numeros/:numeroId",
  async (req: Request, res: Response) => {
    const rifaId = asParamString(req.params.rifaId);
    const numeroId = asParamString(req.params.numeroId);

    try {
      const { data: numero, error: numeroError } = await supabase
        .from("numeros_rifa")
        .select("id, pessoa_id")
        .eq("id", numeroId)
        .eq("rifa_id", rifaId)
        .single();

      if (numeroError || !numero) {
        res.status(404).json({ message: "Numero nao encontrado para essa rifa." });
        return;
      }

      if (!numero.pessoa_id) {
        res
          .status(400)
          .json({ message: "Numero ainda nao foi associado a uma pessoa." });
        return;
      }

      const updateData: any = {};

      if (req.body.pago !== undefined) {
        updateData.pago = req.body.pago ? true : false;
      }

      if (req.body.valorPago !== undefined) {
        if (req.body.valorPago === null || req.body.valorPago === "") {
          updateData.valor_pago = null;
        } else {
          const valorPago = Number(req.body.valorPago);
          if (!Number.isFinite(valorPago) || valorPago < 0) {
            res.status(400).json({ message: "Valor pago invalido." });
            return;
          }
          updateData.valor_pago = valorPago;
        }
      }

      if (Object.keys(updateData).length === 0) {
        res.status(400).json({ message: "Nenhum campo para atualizar." });
        return;
      }

      const { error: updateError } = await supabase
        .from("numeros_rifa")
        .update(updateData)
        .eq("id", numeroId);

      if (updateError) throw updateError;

      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: (error as Error).message });
    }
  }
);

app.delete(
  "/api/rifas/:rifaId/numeros/:numeroId/associacao",
  async (req: Request, res: Response) => {
    const rifaId = asParamString(req.params.rifaId);
    const numeroId = asParamString(req.params.numeroId);

    try {
      const { data: numero, error: numeroError } = await supabase
        .from("numeros_rifa")
        .select("id")
        .eq("id", numeroId)
        .eq("rifa_id", rifaId)
        .single();

      if (numeroError || !numero) {
        res.status(404).json({ message: "Numero nao encontrado para essa rifa." });
        return;
      }

      const { error: updateError } = await supabase
        .from("numeros_rifa")
        .update({
          pessoa_id: null,
          pago: false,
          valor_pago: null,
          vendido_em: null,
        })
        .eq("id", numeroId);

      if (updateError) throw updateError;

      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: (error as Error).message });
    }
  }
);

app.delete(
  "/api/rifas/:rifaId/numeros/:numeroId",
  async (req: Request, res: Response) => {
    const rifaId = asParamString(req.params.rifaId);
    const numeroId = asParamString(req.params.numeroId);

    try {
      const { data: numero, error: numeroError } = await supabase
        .from("numeros_rifa")
        .select("id, pessoa_id")
        .eq("id", numeroId)
        .eq("rifa_id", rifaId)
        .single();

      if (numeroError || !numero) {
        res.status(404).json({ message: "Numero nao encontrado para essa rifa." });
        return;
      }

      if (numero.pessoa_id) {
        res
          .status(400)
          .json({
            message:
              "Numero vendido nao pode ser removido. Libere a associacao primeiro.",
          });
        return;
      }

      const { error: deleteError } = await supabase
        .from("numeros_rifa")
        .delete()
        .eq("id", numeroId);

      if (deleteError) throw deleteError;

      // Atualizar quantidade de números na rifa
      const { data: rifa } = await supabase
        .from("rifas")
        .select("quantidade_numeros")
        .eq("id", rifaId)
        .single();

      if (rifa) {
        await supabase
          .from("rifas")
          .update({ quantidade_numeros: rifa.quantidade_numeros - 1 })
          .eq("id", rifaId);
      }

      res.json({ ok: true });
    } catch (error) {
      res.status(400).json({ message: (error as Error).message });
    }
  }
);

app.get("/api/pessoas", async (req: Request, res: Response) => {
  try {
    const { page, pageSize, offset } = parsePagination(req);
    const search = trimText(req.query.search);

    let query = supabase
      .from("pessoas")
      .select("id, nome, telefone, criada_em, atualizada_em", { count: "exact" })
      .order("nome", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (search) {
      query = query.or(`nome.ilike.%${search}%,telefone.ilike.%${search}%`);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      data,
      pagination: {
        page,
        pageSize,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    });
  } catch (error) {
    res.status(500).json({ message: (error as Error).message });
  }
});

app.post("/api/pessoas", async (req: Request, res: Response) => {
  try {
    const id = await getOrCreatePessoa({
      nome: req.body.nome,
      telefone: req.body.telefone,
    });
    res.status(201).json({ id });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.put("/api/pessoas/:id", async (req: Request, res: Response) => {
  const pessoaId = asParamString(req.params.id);
  const nome = trimText(req.body.nome);
  const telefone = trimText(req.body.telefone);

  if (!nome || !telefone) {
    res.status(400).json({ message: "Nome e telefone sao obrigatorios." });
    return;
  }

  try {
    const { error } = await supabase
      .from("pessoas")
      .update({
        nome,
        telefone,
      })
      .eq("id", pessoaId);

    if (error) {
      if (error.message.includes("duplicate key")) {
        res
          .status(409)
          .json({ message: "Ja existe pessoa com esse nome e telefone." });
        return;
      }
      throw error;
    }

    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.delete("/api/pessoas/:id", async (req: Request, res: Response) => {
  const pessoaId = asParamString(req.params.id);

  try {
    // Limpar associações de números
    await supabase
      .from("numeros_rifa")
      .update({
        pessoa_id: null,
        pago: false,
        valor_pago: null,
        vendido_em: null,
      })
      .eq("pessoa_id", pessoaId);

    // Limpar associação de sorteios
    await supabase
      .from("sorteios")
      .update({ pessoa_id: null })
      .eq("pessoa_id", pessoaId);

    // Deletar pessoa
    const { error } = await supabase
      .from("pessoas")
      .delete()
      .eq("id", pessoaId);

    if (error) throw error;

    res.json({ ok: true });
  } catch (error) {
    res.status(404).json({ message: (error as Error).message });
  }
});

app.get(
  "/api/rifas/:id/candidatos-sorteio",
  async (req: Request, res: Response) => {
    const rifaId = asParamString(req.params.id);

    try {
      await getRifaOrThrow(rifaId);

      const { data: candidatos, error } = await supabase
        .from("numeros_rifa")
        .select(
          `
          id,
          numero,
          pessoas(nome, telefone)
        `
        )
        .eq("rifa_id", rifaId)
        .eq("pago", true)
        .not("pessoa_id", "is", null)
        .order("numero", { ascending: true });

      if (error) throw error;

      const rows = candidatos?.map((item: any) => ({
        id: item.id,
        numero: item.numero,
        nome: item.pessoas?.nome || null,
        telefone: item.pessoas?.telefone || null,
      }));

      res.json({ data: rows });
    } catch (error) {
      res.status(404).json({ message: (error as Error).message });
    }
  }
);

app.post("/api/rifas/:id/sortear", async (req: Request, res: Response) => {
  const rifaId = asParamString(req.params.id);

  try {
    const rifa = await getRifaOrThrow(rifaId);

    // Verificar se já existe sorteio
    const { data: sorteioExistente, error: sorteioError } = await supabase
      .from("sorteios")
      .select("id, numero, vencedor_nome, vencedor_telefone, criada_em")
      .eq("rifa_id", rifaId)
      .single();

    if (sorteioExistente && !sorteioError) {
      res.status(409).json({
        message: "Essa rifa ja foi sorteada.",
        sorteio: sorteioExistente,
      });
      return;
    }

    // Buscar candidatos
    const { data: candidatos, error: candidatosError } = await supabase
      .from("numeros_rifa")
      .select(
        `
        id,
        numero,
        pessoa_id,
        pessoas(nome, telefone)
      `
      )
      .eq("rifa_id", rifaId)
      .eq("pago", true)
      .not("pessoa_id", "is", null);

    if (candidatosError) throw candidatosError;

    if (!candidatos || candidatos.length === 0) {
      res
        .status(400)
        .json({ message: "Nao ha numeros pagos para realizar o sorteio." });
      return;
    }

    const winner = candidatos[Math.floor(Math.random() * candidatos.length)];
    if (!winner) {
      res
        .status(500)
        .json({ message: "Falha inesperada ao selecionar vencedor." });
      return;
    }

    // Inserir sorteio
    const { error: insertSorteioError } = await supabase.from("sorteios").insert({
      id: uuidv4(),
      rifa_id: rifaId,
      numero_rifa_id: winner.id,
      numero: winner.numero,
      pessoa_id: winner.pessoa_id,
      vencedor_nome: (winner as any).pessoas?.nome || "Nao identificado",
      vencedor_telefone: (winner as any).pessoas?.telefone || "Nao informado",
    });

    if (insertSorteioError) throw insertSorteioError;

    // Atualizar status da rifa
    const { error: updateRifaError } = await supabase
      .from("rifas")
      .update({ status: "sorteada" })
      .eq("id", rifaId);

    if (updateRifaError) throw updateRifaError;

    const candidatosFormatados = candidatos.map((item: any) => ({
      id: item.id,
      numero: item.numero,
      nome: item.pessoas?.nome || null,
      telefone: item.pessoas?.telefone || null,
    }));

    res.json({
      rifa: {
        id: rifa.id,
        descricao: rifa.descricao,
      },
      candidatos: candidatosFormatados,
      vencedor: {
        numero: winner.numero,
        nome: (winner as any).pessoas?.nome || "Nao identificado",
        telefone: (winner as any).pessoas?.telefone || "Nao informado",
      },
    });
  } catch (error) {
    res.status(400).json({ message: (error as Error).message });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});
