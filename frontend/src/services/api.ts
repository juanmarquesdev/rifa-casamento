import type {
  CandidatoSorteio,
  DashboardResponse,
  NumeroRifa,
  PaginatedResponse,
  Pessoa,
  RifaDetalheResponse,
  RifaResumo,
  SorteioResponse,
} from "../types";

const API_BASE_URL = "http://localhost:3333/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof body?.message === "string" ? body.message : "Erro na requisicao.";
    throw new Error(message);
  }

  return body as T;
}

export function fetchDashboard() {
  return request<DashboardResponse>("/dashboard");
}

export function listarRifas(input: {
  page: number;
  pageSize: number;
  search?: string;
}) {
  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
  });
  if (input.search) {
    params.set("search", input.search);
  }
  return request<PaginatedResponse<RifaResumo>>(`/rifas?${params.toString()}`);
}

export function buscarRifa(rifaId: string) {
  return request<RifaDetalheResponse>(`/rifas/${rifaId}`);
}

export function criarRifa(payload: {
  descricao: string;
  valorPremio: number;
  valorNumero: number;
  lucroDesejado: number;
  dataSorteio: string;
  fotoPremio?: string;
}) {
  return request<{ id: string; quantidadeNumeros: number; faturamentoAlvo: number }>("/rifas", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function atualizarRifa(
  rifaId: string,
  payload: Partial<{
    descricao: string;
    valorPremio: number;
    valorNumero: number;
    lucroDesejado: number;
    dataSorteio: string;
    status: "ativa" | "sorteada" | "cancelada";
    fotoPremio: string;
  }>,
) {
  return request<{ ok: boolean }>(`/rifas/${rifaId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function deletarRifa(rifaId: string) {
  return request<{ ok: boolean }>(`/rifas/${rifaId}`, {
    method: "DELETE",
  });
}

export function listarNumeros(input: {
  rifaId: string;
  page: number;
  pageSize: number;
  search?: string;
  status?: string;
}) {
  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
  });
  if (input.search) {
    params.set("search", input.search);
  }
  if (input.status) {
    params.set("status", input.status);
  }

  return request<PaginatedResponse<NumeroRifa>>(`/rifas/${input.rifaId}/numeros?${params.toString()}`);
}

export function associarNumero(
  rifaId: string,
  numeroId: string,
  payload: {
    pessoaId?: string;
    nome?: string;
    telefone?: string;
    pago: boolean;
    valorPago?: number | null;
  },
) {
  return request<{ ok: boolean }>(`/rifas/${rifaId}/numeros/${numeroId}/associar`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function associarNumerosLote(
  rifaId: string,
  payload: {
    numeroIds: string[];
    pessoaId?: string;
    nome?: string;
    telefone?: string;
    pago: boolean;
    valorPago?: number | null;
  },
) {
  return request<{ ok: boolean; quantidade: number }>(`/rifas/${rifaId}/numeros/associar-lote`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function atualizarNumero(
  rifaId: string,
  numeroId: string,
  payload: {
    pago?: boolean;
    valorPago?: number | null;
  },
) {
  return request<{ ok: boolean }>(`/rifas/${rifaId}/numeros/${numeroId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function removerAssociacaoNumero(rifaId: string, numeroId: string) {
  return request<{ ok: boolean }>(`/rifas/${rifaId}/numeros/${numeroId}/associacao`, {
    method: "DELETE",
  });
}

export function removerNumero(rifaId: string, numeroId: string) {
  return request<{ ok: boolean }>(`/rifas/${rifaId}/numeros/${numeroId}`, {
    method: "DELETE",
  });
}

export function candidatosSorteio(rifaId: string) {
  return request<{ data: CandidatoSorteio[] }>(`/rifas/${rifaId}/candidatos-sorteio`);
}

export function listarPessoas(input: {
  page: number;
  pageSize: number;
  search?: string;
}) {
  const params = new URLSearchParams({
    page: String(input.page),
    pageSize: String(input.pageSize),
  });
  if (input.search) {
    params.set("search", input.search);
  }

  return request<PaginatedResponse<Pessoa>>(`/pessoas?${params.toString()}`);
}

export function sortearRifa(rifaId: string) {
  return request<SorteioResponse>(`/rifas/${rifaId}/sortear`, {
    method: "POST",
  });
}
