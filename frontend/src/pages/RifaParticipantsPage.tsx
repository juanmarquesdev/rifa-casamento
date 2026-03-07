import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { useToast } from "../components/ui/toast";
import { buscarRifa, listarNumeros } from "../services/api";
import type { NumeroRifa, RifaDetalheResponse } from "../types";
import { formatDate } from "../lib/utils";

type ParticipanteRifa = {
  pessoaId: string;
  nome: string;
  telefone: string;
  numeros: string[];
  pagos: number;
  naoPagos: number;
};

export function RifaParticipantsPage() {
  const { id } = useParams<{ id: string }>();
  const { notify } = useToast();
  const [loading, setLoading] = useState(false);
  const [rifaData, setRifaData] = useState<RifaDetalheResponse | null>(null);
  const [participants, setParticipants] = useState<ParticipanteRifa[]>([]);
  const [search, setSearch] = useState("");

  async function fetchAllNumbersForRaffle(rifaId: string): Promise<NumeroRifa[]> {
    const allNumbers: NumeroRifa[] = [];
    let currentPage = 1;
    let totalPages = 1;

    while (currentPage <= totalPages) {
      const response = await listarNumeros({
        rifaId,
        page: currentPage,
        pageSize: 100,
      });
      allNumbers.push(...response.data);
      totalPages = Math.max(1, response.pagination.totalPages);
      currentPage += 1;
    }

    return allNumbers;
  }

  useEffect(() => {
    async function loadData() {
      if (!id) {
        return;
      }

      setLoading(true);
      try {
        const [detail, allNumbers] = await Promise.all([
          buscarRifa(id),
          fetchAllNumbersForRaffle(id),
        ]);

        const soldNumbers = allNumbers.filter((item) => item.pessoa_id);
        const grouped = new Map<string, ParticipanteRifa>();

        for (const numero of soldNumbers) {
          if (!numero.pessoa_id) {
            continue;
          }

          const existing = grouped.get(numero.pessoa_id);
          if (existing) {
            existing.numeros.push(numero.numero);
            if (numero.pago) {
              existing.pagos += 1;
            } else {
              existing.naoPagos += 1;
            }
            continue;
          }

          grouped.set(numero.pessoa_id, {
            pessoaId: numero.pessoa_id,
            nome: numero.nome ?? "Sem nome",
            telefone: numero.telefone ?? "Sem telefone",
            numeros: [numero.numero],
            pagos: numero.pago ? 1 : 0,
            naoPagos: numero.pago ? 0 : 1,
          });
        }

        const normalized = Array.from(grouped.values())
          .map((item) => ({
            ...item,
            numeros: [...item.numeros].sort((a, b) => a.localeCompare(b)),
          }))
          .sort((a, b) => a.nome.localeCompare(b.nome));

        setRifaData(detail);
        setParticipants(normalized);
      } catch (error) {
        notify({
          title: "Erro ao carregar participantes",
          description: (error as Error).message,
          kind: "error",
        });
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [id, notify]);

  const filteredParticipants = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return participants;
    }

    return participants.filter((participant) => {
      const inName = participant.nome.toLowerCase().includes(normalizedSearch);
      const inPhone = participant.telefone.toLowerCase().includes(normalizedSearch);
      const inNumbers = participant.numeros.some((numero) => numero.includes(normalizedSearch));
      return inName || inPhone || inNumbers;
    });
  }, [participants, search]);

  if (!rifaData) {
    return <p className="text-sm text-slate-500">Carregando participantes...</p>;
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Participantes da Rifa</CardTitle>
            <CardDescription>
              {rifaData.rifa.descricao} | Sorteio em {formatDate(rifaData.rifa.data_sorteio)}
            </CardDescription>
          </div>
          <Button asChild variant="outline">
            <Link to={`/rifas/${rifaData.rifa.id}`}>Voltar para rifa</Link>
          </Button>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Participantes: {participants.length}</Badge>
            <Badge variant="outline">Numeros vendidos: {rifaData.resumo.vendidos}</Badge>
            <Badge variant="outline">Numeros disponiveis: {rifaData.resumo.disponiveis}</Badge>
          </div>

          <Input
            className="max-w-sm"
            placeholder="Buscar por nome, telefone ou numero"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          {loading ? <p className="text-sm text-slate-500">Carregando...</p> : null}

          {!loading && filteredParticipants.length === 0 ? (
            <p className="text-sm text-slate-500">Nenhum participante encontrado para essa rifa.</p>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredParticipants.map((participant) => (
              <Card key={participant.pessoaId}>
                <CardHeader>
                  <CardTitle className="text-base">{participant.nome}</CardTitle>
                  <CardDescription>{participant.telefone}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">Qtd: {participant.numeros.length}</Badge>
                    <Badge variant="success">Pagos: {participant.pagos}</Badge>
                    <Badge variant="warning">Nao pagos: {participant.naoPagos}</Badge>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Numeros</p>
                    <div className="flex flex-wrap gap-1.5">
                      {participant.numeros.map((numero) => (
                        <span
                          key={`${participant.pessoaId}-${numero}`}
                          className="rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-xs"
                        >
                          {numero}
                        </span>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
