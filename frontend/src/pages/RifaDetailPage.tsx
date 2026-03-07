import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ConfirmActionDialog } from "../components/common/ConfirmActionDialog";
import { PaginationControls } from "../components/common/PaginationControls";
import { AssignNumberDialog } from "../components/rifa/AssignNumberDialog";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { useToast } from "../components/ui/toast";
import {
  associarNumero,
  associarNumerosLote,
  atualizarNumero,
  buscarRifa,
  listarPessoas,
  listarNumeros,
  removerAssociacaoNumero,
  removerNumero,
} from "../services/api";
import type { NumeroRifa, Pessoa, RifaDetalheResponse } from "../types";
import { formatCurrency, formatDate } from "../lib/utils";

const pageSize = 30;

type AssignPayload = {
  pessoaId?: string;
  nome?: string;
  telefone?: string;
  pago: boolean;
  valorPago: number | null;
};

export function RifaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { notify } = useToast();
  const [rifaData, setRifaData] = useState<RifaDetalheResponse | null>(null);
  const [numbers, setNumbers] = useState<NumeroRifa[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [selectedNumberIds, setSelectedNumberIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("todos");
  const [numberToRelease, setNumberToRelease] = useState<NumeroRifa | null>(null);
  const [numberToDelete, setNumberToDelete] = useState<NumeroRifa | null>(null);

  async function loadRifa() {
    if (!id) {
      return;
    }

    try {
      const detail = await buscarRifa(id);
      setRifaData(detail);
    } catch (error) {
      notify({ title: "Erro ao carregar rifa", description: (error as Error).message, kind: "error" });
      navigate("/");
    }
  }

  async function loadNumbers(targetPage: number = page) {
    if (!id) {
      return;
    }

    setLoading(true);
    try {
      const response = await listarNumeros({
        rifaId: id,
        page: targetPage,
        pageSize,
        search: search.trim(),
        status: statusFilter === "todos" ? undefined : statusFilter,
      });
      setNumbers(response.data);
      setSelectedNumberIds((current) =>
        current.filter((numberId) => response.data.some((item) => item.id === numberId && !item.pessoa_id)),
      );
      setPage(response.pagination.page);
      setTotalPages(Math.max(1, response.pagination.totalPages));
    } catch (error) {
      notify({ title: "Erro ao carregar numeros", description: (error as Error).message, kind: "error" });
    } finally {
      setLoading(false);
    }
  }

  async function loadPessoas() {
    const allPeople: Pessoa[] = [];
    let currentPage = 1;
    let total = 1;

    try {
      while (currentPage <= total) {
        const response = await listarPessoas({
          page: currentPage,
          pageSize: 100,
        });
        allPeople.push(...response.data);
        total = Math.max(1, response.pagination.totalPages);
        currentPage += 1;
      }

      setPessoas(allPeople);
    } catch (error) {
      notify({
        title: "Erro ao carregar pessoas",
        description: (error as Error).message,
        kind: "error",
      });
    }
  }

  useEffect(() => {
    void Promise.all([loadRifa(), loadNumbers(1), loadPessoas()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const progress = useMemo(() => {
    if (!rifaData) {
      return 0;
    }
    return Math.min(
      100,
      Math.round((rifaData.resumo.total_arrecadado / Math.max(1, rifaData.rifa.faturamento_alvo)) * 100),
    );
  }, [rifaData]);

  const canSell = rifaData?.rifa.status === "ativa";
  const selectedCount = selectedNumberIds.length;

  async function handleAssign(numero: NumeroRifa, payload: AssignPayload) {
    if (!id) {
      return;
    }

    try {
      await associarNumero(id, numero.id, payload);
      notify({ title: `Numero ${numero.numero} associado`, kind: "success" });
      await Promise.all([loadRifa(), loadNumbers(page)]);
    } catch (error) {
      notify({ title: "Erro ao associar numero", description: (error as Error).message, kind: "error" });
      throw error;
    }
  }

  async function handleBatchAssign(payload: AssignPayload) {
    if (!id || selectedNumberIds.length === 0) {
      return;
    }

    try {
      await associarNumerosLote(id, {
        numeroIds: selectedNumberIds,
        pessoaId: payload.pessoaId,
        nome: payload.nome,
        telefone: payload.telefone,
        pago: payload.pago,
        valorPago: payload.valorPago,
      });
      notify({ title: `${selectedNumberIds.length} numeros associados`, kind: "success" });
      setSelectedNumberIds([]);
      await Promise.all([loadRifa(), loadNumbers(page), loadPessoas()]);
    } catch (error) {
      notify({ title: "Erro ao associar numeros", description: (error as Error).message, kind: "error" });
      throw error;
    }
  }

  function toggleSelectedNumber(numero: NumeroRifa) {
    if (numero.pessoa_id) {
      return;
    }

    setSelectedNumberIds((current) => {
      if (current.includes(numero.id)) {
        return current.filter((numberId) => numberId !== numero.id);
      }
      return [...current, numero.id];
    });
  }

  function selectAllAvailableOnPage() {
    const availableIds = numbers.filter((numero) => !numero.pessoa_id).map((numero) => numero.id);
    setSelectedNumberIds(availableIds);
  }

  async function fetchAllNumbersForExport(rifaId: string): Promise<NumeroRifa[]> {
    const allNumbers: NumeroRifa[] = [];
    let currentPage = 1;
    let total = 1;

    while (currentPage <= total) {
      const response = await listarNumeros({
        rifaId,
        page: currentPage,
        pageSize: 100,
      });
      allNumbers.push(...response.data);
      total = Math.max(1, response.pagination.totalPages);
      currentPage += 1;
    }

    return allNumbers;
  }

  async function handleExportImage() {
    if (!id || !rifaData) {
      return;
    }

    setExporting(true);
    try {
      const allNumbers = await fetchAllNumbersForExport(id);
      
      // Criar canvas para desenhar a imagem
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Não foi possível criar contexto do canvas");
      }

      // Configurações da imagem
      const padding = 40;
      const headerHeight = 280;
      const cols = 10;
      const cardWidth = 100;
      const cardHeight = 80;
      const gap = 12;
      const rows = Math.ceil(allNumbers.length / cols);
      
      canvas.width = padding * 2 + cols * cardWidth + (cols - 1) * gap;
      canvas.height = padding * 2 + headerHeight + rows * cardHeight + (rows - 1) * gap;

      // Fundo branco
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Título principal
      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 42px Arial";
      ctx.textAlign = "center";
      ctx.fillText(rifaData.rifa.descricao, canvas.width / 2, padding + 40);

      // Data de geração
      ctx.fillStyle = "#64748b";
      ctx.font = "16px Arial";
      ctx.fillText(
        `Gerado em ${new Date().toLocaleString("pt-BR")}`,
        canvas.width / 2,
        padding + 75
      );

      // Informações em cards
      const infoY = padding + 110;
      const infoBoxWidth = (canvas.width - padding * 2 - gap * 2) / 3;
      
      const infoData = [
        { label: "Data do Sorteio", value: formatDate(rifaData.rifa.data_sorteio) },
        { label: "Valor do Prêmio", value: formatCurrency(rifaData.rifa.valor_premio) },
        { label: "Preço por Número", value: formatCurrency(rifaData.rifa.valor_numero) },
      ];

      infoData.forEach((info, index) => {
        const x = padding + index * (infoBoxWidth + gap);
        
        // Box
        ctx.fillStyle = "#f1f5f9";
        ctx.strokeStyle = "#cbd5e1";
        ctx.lineWidth = 2;
        roundRect(ctx, x, infoY, infoBoxWidth, 60, 8);
        ctx.fill();
        ctx.stroke();
        
        // Label
        ctx.fillStyle = "#64748b";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.fillText(info.label, x + infoBoxWidth / 2, infoY + 25);
        
        // Value
        ctx.fillStyle = "#1e293b";
        ctx.font = "bold 18px Arial";
        ctx.fillText(info.value, x + infoBoxWidth / 2, infoY + 48);
      });

      // Resumo
      const soldCount = allNumbers.filter(n => n.pessoa_id).length;
      const availableCount = allNumbers.length - soldCount;
      
      const resumoY = infoY + 80;
      const resumoData = [
        { label: `Disponíveis: ${availableCount}`, color: "#10b981", bg: "#d1fae5" },
        { label: `Vendidos: ${soldCount}`, color: "#f59e0b", bg: "#fef3c7" },
        { label: `Total: ${allNumbers.length}`, color: "#64748b", bg: "#f1f5f9" },
      ];

      const resumoBoxWidth = 180;
      const totalResumoWidth = resumoData.length * resumoBoxWidth + (resumoData.length - 1) * gap;
      const resumoStartX = (canvas.width - totalResumoWidth) / 2;

      resumoData.forEach((item, index) => {
        const x = resumoStartX + index * (resumoBoxWidth + gap);
        
        ctx.fillStyle = item.bg;
        ctx.strokeStyle = item.color;
        ctx.lineWidth = 2;
        roundRect(ctx, x, resumoY, resumoBoxWidth, 45, 8);
        ctx.fill();
        ctx.stroke();
        
        ctx.fillStyle = item.color;
        ctx.font = "bold 16px Arial";
        ctx.textAlign = "center";
        ctx.fillText(item.label, x + resumoBoxWidth / 2, resumoY + 28);
      });

      // Desenhar grade de números
      const gridStartY = padding + headerHeight;
      
      allNumbers.forEach((numero, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = padding + col * (cardWidth + gap);
        const y = gridStartY + row * (cardHeight + gap);
        const sold = Boolean(numero.pessoa_id);

        // Card background e borda
        ctx.fillStyle = sold ? "#fef3c7" : "#d1fae5";
        ctx.strokeStyle = sold ? "#f59e0b" : "#10b981";
        ctx.lineWidth = sold ? 3 : 2;
        roundRect(ctx, x, y, cardWidth, cardHeight, 8);
        ctx.fill();
        ctx.stroke();

        // Número
        ctx.fillStyle = sold ? "#92400e" : "#065f46";
        ctx.font = "bold 24px monospace";
        ctx.textAlign = "center";
        ctx.fillText(numero.numero, x + cardWidth / 2, y + 32);

        // Status ou nome
        ctx.fillStyle = sold ? "#92400e" : "#065f46";
        ctx.font = "bold 11px Arial";
        
        if (sold && numero.nome) {
          // Quebrar nome em linhas se for muito longo
          const maxWidth = cardWidth - 8;
          const words = numero.nome.split(" ");
          let line = "";
          let lineY = y + 52;
          
          for (const word of words) {
            const testLine = line + (line ? " " : "") + word;
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && line) {
              ctx.fillText(line, x + cardWidth / 2, lineY);
              line = word;
              lineY += 13;
              if (lineY > y + cardHeight - 8) break; // Evitar overflow
            } else {
              line = testLine;
            }
          }
          if (line && lineY <= y + cardHeight - 8) {
            ctx.fillText(line, x + cardWidth / 2, lineY);
          }
        } else {
          ctx.fillText("LIVRE", x + cardWidth / 2, y + 58);
        }
      });

      // Converter canvas para blob e fazer download
      canvas.toBlob((blob) => {
        if (!blob) {
          throw new Error("Erro ao gerar imagem");
        }
        
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `rifa-${rifaData.rifa.descricao.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.png`;
        link.click();
        URL.revokeObjectURL(url);
        
        notify({ title: "Imagem exportada com sucesso", kind: "success" });
      }, "image/png");

    } catch (error) {
      notify({
        title: "Erro ao exportar imagem",
        description: (error as Error).message,
        kind: "error",
      });
    } finally {
      setExporting(false);
    }
  }

  // Função auxiliar para desenhar retângulos com bordas arredondadas
  function roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number
  ) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  async function togglePaid(numero: NumeroRifa) {
    if (!id) {
      return;
    }

    try {
      const nextPaid = numero.pago !== 1;
      await atualizarNumero(id, numero.id, {
        pago: nextPaid,
        valorPago: nextPaid ? numero.valor_pago ?? rifaData?.rifa.valor_numero ?? 0 : null,
      });
      notify({ title: `Numero ${numero.numero} atualizado`, kind: "success" });
      await Promise.all([loadRifa(), loadNumbers(page)]);
    } catch (error) {
      notify({ title: "Erro ao atualizar pagamento", description: (error as Error).message, kind: "error" });
    }
  }

  async function release(numero: NumeroRifa) {
    if (!id) {
      return;
    }

    try {
      await removerAssociacaoNumero(id, numero.id);
      notify({ title: `Numero ${numero.numero} liberado`, kind: "info" });
      await Promise.all([loadRifa(), loadNumbers(page)]);
    } catch (error) {
      notify({ title: "Erro ao liberar numero", description: (error as Error).message, kind: "error" });
    }
  }

  async function removeUnusedNumber(numero: NumeroRifa) {
    if (!id) {
      return;
    }

    try {
      await removerNumero(id, numero.id);
      notify({ title: "Numero removido", kind: "success" });
      await Promise.all([loadRifa(), loadNumbers(1)]);
    } catch (error) {
      notify({ title: "Erro ao remover numero", description: (error as Error).message, kind: "error" });
    }
  }

  if (!rifaData) {
    return <p className="text-sm text-slate-500">Carregando rifa...</p>;
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{rifaData.rifa.descricao}</CardTitle>
          <CardDescription>
            Sorteio em {formatDate(rifaData.rifa.data_sorteio)} | Valor por numero: {formatCurrency(rifaData.rifa.valor_numero)}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-2 md:grid-cols-4">
            <Badge variant="outline">Total: {rifaData.resumo.total_numeros}</Badge>
            <Badge variant="outline">Vendidos: {rifaData.resumo.vendidos}</Badge>
            <Badge variant="outline">Pagos: {rifaData.resumo.pagos}</Badge>
            <Badge variant={rifaData.resumo.total_arrecadado >= rifaData.rifa.faturamento_alvo ? "success" : "warning"}>
              Meta: {formatCurrency(rifaData.rifa.faturamento_alvo)}
            </Badge>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-sm text-slate-600">
              <span>Arrecadado</span>
              <strong>{formatCurrency(rifaData.resumo.total_arrecadado)}</strong>
            </div>
            <div className="h-2 rounded-full bg-slate-200">
              <div className="h-2 rounded-full bg-sky-600" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Numeros da Rifa</CardTitle>
            <CardDescription>
              Clique para cadastrar comprador. Numeros ja comprados ficam bloqueados para nova compra.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => navigate(`/rifas/${id}/participantes`)}>
              Ver participantes
            </Button>
            <Button variant="outline" onClick={handleExportImage} disabled={exporting}>
              {exporting ? "Exportando..." : "Exportar imagem"}
            </Button>
            <Button variant="outline" onClick={() => navigate("/sorteio")}>Tela de sorteio</Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            <Input
              className="max-w-sm"
              placeholder="Buscar numero, nome ou telefone"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-55">
                <SelectValue placeholder="Filtrar status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="disponivel">Disponivel</SelectItem>
                <SelectItem value="vendido">Vendido</SelectItem>
                <SelectItem value="pago">Pago</SelectItem>
                <SelectItem value="nao-pago">Nao pago</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="secondary" onClick={() => void loadNumbers(1)}>
              Aplicar filtros
            </Button>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
            <Badge variant="outline">Selecionados: {selectedCount}</Badge>
            <Button variant="outline" size="sm" onClick={selectAllAvailableOnPage} disabled={!canSell}>
              Selecionar disponiveis da pagina
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedNumberIds([])}
              disabled={selectedCount === 0}
            >
              Limpar selecao
            </Button>
            <AssignNumberDialog
              numero={String(selectedCount)}
              titulo={`Associar ${selectedCount} numeros`}
              descricao="Selecione uma pessoa para associar todos os numeros escolhidos de uma vez."
              triggerLabel={`Comprar ${selectedCount} selecionados`}
              pessoas={pessoas}
              onSubmit={handleBatchAssign}
              disabled={!canSell || selectedCount === 0}
            />
          </div>

          {loading ? <p className="text-sm text-slate-500">Carregando numeros...</p> : null}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {numbers.map((numero) => {
              const sold = Boolean(numero.pessoa_id);
              return (
                <Card
                  key={numero.id}
                  className={sold ? "border-amber-200 bg-amber-50/40" : "border-emerald-200 bg-emerald-50/40"}
                >
                  <CardHeader>
                    <CardTitle className="font-mono text-2xl">{numero.numero}</CardTitle>
                    <CardDescription>
                      {sold
                        ? `${numero.nome ?? "Sem nome"} (${numero.telefone ?? "Sem telefone"})`
                        : "Disponivel para venda"}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={sold ? "warning" : "success"}>{sold ? "Comprado" : "Livre"}</Badge>
                      <Badge variant={numero.pago ? "success" : "outline"}>{numero.pago ? "Pago" : "Nao pago"}</Badge>
                    </div>

                    {!sold ? (
                      <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700">
                        <input
                          type="checkbox"
                          checked={selectedNumberIds.includes(numero.id)}
                          onChange={() => toggleSelectedNumber(numero)}
                          disabled={!canSell}
                        />
                        Selecionar para compra em lote
                      </label>
                    ) : null}

                    {!sold ? (
                      <AssignNumberDialog
                        numero={numero.numero}
                        pessoas={pessoas}
                        onSubmit={async (payload) => handleAssign(numero, payload)}
                        disabled={sold || !canSell}
                      />
                    ) : null}

                    {sold ? (
                      <div className="grid gap-2">
                        <Button variant="secondary" size="sm" onClick={() => void togglePaid(numero)}>
                          {numero.pago ? "Marcar nao pago" : "Marcar pago"}
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setNumberToRelease(numero)}>
                          Liberar numero
                        </Button>
                      </div>
                    ) : (
                      <Button variant="outline" size="sm" onClick={() => setNumberToDelete(numero)}>
                        Excluir numero
                      </Button>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <PaginationControls page={page} totalPages={totalPages} onChangePage={(next) => void loadNumbers(next)} />
        </CardContent>
      </Card>

      <ConfirmActionDialog
        open={Boolean(numberToRelease)}
        onOpenChange={(open) => {
          if (!open) {
            setNumberToRelease(null);
          }
        }}
        title="Liberar numero"
        description={
          numberToRelease
            ? `Deseja liberar o numero ${numberToRelease.numero} para venda novamente?`
            : ""
        }
        confirmLabel="Liberar"
        onConfirm={async () => {
          if (!numberToRelease) {
            return;
          }
          await release(numberToRelease);
          setNumberToRelease(null);
        }}
      />

      <ConfirmActionDialog
        open={Boolean(numberToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setNumberToDelete(null);
          }
        }}
        title="Excluir numero"
        description={
          numberToDelete
            ? `Deseja excluir o numero ${numberToDelete.numero}?`
            : ""
        }
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={async () => {
          if (!numberToDelete) {
            return;
          }
          await removeUnusedNumber(numberToDelete);
          setNumberToDelete(null);
        }}
      />
    </div>
  );
}
