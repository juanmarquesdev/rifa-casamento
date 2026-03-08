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
      await Promise.all([loadRifa(), loadNumbers(page), loadPessoas()]);
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

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Falha ao carregar imagem: ${src}`));
      image.src = src;
    });
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  function drawImageCover(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement,
    x: number,
    y: number,
    width: number,
    height: number
  ) {
    const sourceRatio = image.width / image.height;
    const targetRatio = width / height;

    let sourceWidth = image.width;
    let sourceHeight = image.height;
    let sourceX = 0;
    let sourceY = 0;

    if (sourceRatio > targetRatio) {
      sourceWidth = image.height * targetRatio;
      sourceX = (image.width - sourceWidth) / 2;
    } else {
      sourceHeight = image.width / targetRatio;
      sourceY = (image.height - sourceHeight) / 2;
    }

    ctx.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, x, y, width, height);
  }

  function calculateGridLayout(total: number, width: number, height: number) {
    const safeTotal = Math.max(1, total);
    const minCols = 3;
    const maxCols = Math.min(22, safeTotal);
    const preferredCols = Math.round(Math.sqrt(safeTotal * (width / height)) * 1.2);

    let best = {
      cols: clamp(preferredCols, minCols, maxCols),
      rows: Math.ceil(safeTotal / clamp(preferredCols, minCols, maxCols)),
      gap: 8,
    };

    let bestScore = Number.POSITIVE_INFINITY;

    for (let cols = minCols; cols <= maxCols; cols += 1) {
      const rows = Math.ceil(safeTotal / cols);
      const gap = clamp(Math.floor(Math.min(width / (cols * 10), height / (rows * 12))), 4, 12);
      const cellWidth = (width - gap * (cols - 1)) / cols;
      const cellHeight = (height - gap * (rows - 1)) / rows;
      if (cellWidth < 28 || cellHeight < 24) {
        continue;
      }

      const ratioPenalty = Math.abs(cellWidth / Math.max(1, cellHeight) - 1.65);
      const fillPenalty = Math.abs(rows * cols - safeTotal) / safeTotal;
      const score = ratioPenalty * 2 + fillPenalty;

      if (score < bestScore) {
        bestScore = score;
        best = { cols, rows, gap };
      }
    }

    return best;
  }

  async function handleExportImage() {
    if (!id || !rifaData) {
      return;
    }

    setExporting(true);

    try {
      const allNumbers = await fetchAllNumbersForExport(id);
      const sortedNumbers = [...allNumbers].sort((a, b) => Number(a.numero) - Number(b.numero));
      const imagemRifa = rifaData.rifa.imagem_rifa;

      if (!imagemRifa) {
        throw new Error("A rifa nao possui imagem para exportacao.");
      }

      const artImage = await loadImage(imagemRifa);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Nao foi possivel criar contexto do canvas");
      }

      const canvasWidth = 1080;
      const canvasHeight = 1920;
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;

      const baseColor = /^#[0-9A-F]{6}$/i.test(rifaData.rifa.cor_rifa)
        ? rifaData.rifa.cor_rifa.toUpperCase()
        : "#C8D2C6";
      const boxBg = "#FFFFFF";
      const boxStroke = "#DFE4DA";
      const textColor = "#5F7348";
      const soldBg = "#DCE7D1";
      const soldText = "#4D6236";
      const soldStroke = "#B7C8A4";

      const scaledArtHeight = Math.round((canvasWidth / artImage.width) * artImage.height);
      let topHeight = clamp(scaledArtHeight, 560, 1480);
      const minBottomHeight = 360;
      if (canvasHeight - topHeight < minBottomHeight) {
        topHeight = canvasHeight - minBottomHeight;
      }
      const bottomHeight = canvasHeight - topHeight;

      drawImageCover(ctx, artImage, 0, 0, canvasWidth, topHeight);

      ctx.fillStyle = baseColor;
      ctx.fillRect(0, topHeight, canvasWidth, bottomHeight);

      const paddingX = 32;
      const bottomInnerTop = topHeight + 24;
      const bottomInnerHeight = bottomHeight - 48;

      const gridTop = bottomInnerTop;
      const gridHeight = bottomInnerHeight;
      const gridWidth = canvasWidth - paddingX * 2;

      const { cols, rows, gap } = calculateGridLayout(sortedNumbers.length, gridWidth, gridHeight);
      const cardWidth = (gridWidth - gap * (cols - 1)) / cols;
      const cardHeight = (gridHeight - gap * (rows - 1)) / rows;
      const numberFontSize = clamp(cardHeight * 0.42, 16, 34);
      const reservedNumberFontSize = clamp(cardHeight * 0.3, 13, 28);
      const reservedNameFontSize = clamp(cardHeight * 0.2, 10, 16);

      ctx.textAlign = "center";
      sortedNumbers.forEach((numero, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = paddingX + col * (cardWidth + gap);
        const y = gridTop + row * (cardHeight + gap);
        const sold = Boolean(numero.pessoa_id);

        ctx.fillStyle = sold ? soldBg : boxBg;
        ctx.strokeStyle = sold ? soldStroke : boxStroke;
        ctx.lineWidth = 1.5;
        roundRect(ctx, x, y, cardWidth, cardHeight, clamp(cardHeight * 0.22, 7, 14));
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = sold ? soldText : textColor;
        ctx.font = `600 ${sold ? reservedNumberFontSize : numberFontSize}px Trebuchet MS`;
        ctx.fillText(numero.numero, x + cardWidth / 2, y + (sold ? cardHeight * 0.44 : cardHeight * 0.62));

        if (sold) {
          const rawName = (numero.nome || "Reservado").trim();
          const maxChars = Math.max(6, Math.floor(cardWidth / 8));
          const displayName =
            rawName.length > maxChars ? `${rawName.slice(0, Math.max(4, maxChars - 1))}…` : rawName;

          ctx.font = `600 ${reservedNameFontSize}px Trebuchet MS`;
          ctx.fillText(displayName, x + cardWidth / 2, y + cardHeight * 0.78);
        }
      });

      canvas.toBlob((blob) => {
        if (!blob) {
          notify({
            title: "Erro ao exportar imagem",
            description: "Erro ao gerar imagem",
            kind: "error",
          });
          return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `rifa-${rifaData.rifa.descricao.replace(/\s+/g, "-").toLowerCase()}-${Date.now()}.png`;
        link.click();
        URL.revokeObjectURL(url);

        notify({ title: "Modelo da rifa exportado com sucesso", kind: "success" });
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
      const nextPaid = !Boolean(numero.pago);
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
          <div className="flex items-start gap-4">
            <div className="flex-1">
              <CardTitle>{rifaData.rifa.descricao}</CardTitle>
              <CardDescription>
                Sorteio em {formatDate(rifaData.rifa.data_sorteio)} | Valor por numero: {formatCurrency(rifaData.rifa.valor_numero)}
              </CardDescription>
            </div>
          </div>
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
