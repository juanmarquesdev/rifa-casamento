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

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Falha ao carregar imagem: ${src}`));
      image.src = src;
    });
  }

  async function loadFirstAvailableImage(sources: string[]): Promise<HTMLImageElement | null> {
    for (const source of sources) {
      try {
        return await loadImage(source);
      } catch {
        continue;
      }
    }
    return null;
  }

  async function handleExportImage() {
    if (!id || !rifaData) {
      return;
    }

    setExporting(true);
    try {
      const allNumbers = await fetchAllNumbersForExport(id);
      const sortedNumbers = [...allNumbers].sort((a, b) => Number(a.numero) - Number(b.numero));

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        throw new Error("Nao foi possivel criar contexto do canvas");
      }

      const padding = 34;
      const headerHeight = 500;
      const footerHeight = 720;
      const cols = 10;
      const cardWidth = 76;
      const cardHeight = 44;
      const gap = 10;
      const rows = Math.ceil(sortedNumbers.length / cols);
      const gridWidth = cols * cardWidth + (cols - 1) * gap;
      const canvasWidth = Math.max(980, padding * 2 + gridWidth);
      const gridStartY = padding + headerHeight;
      const gridHeight = rows * cardHeight + Math.max(0, rows - 1) * gap;

      canvas.width = canvasWidth;
      canvas.height = padding + headerHeight + gridHeight + footerHeight;

      ctx.fillStyle = "#c8d2c6";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = "#e8e4d9";
      roundRect(ctx, 14, 14, canvas.width - 28, canvas.height - 28, 20);
      ctx.fill();

      ctx.strokeStyle = "#7f8f81";
      ctx.lineWidth = 4;
      roundRect(ctx, 14, 14, canvas.width - 28, canvas.height - 28, 20);
      ctx.stroke();

      ctx.globalAlpha = 0.12;
      for (let i = 0; i < 8; i += 1) {
        ctx.fillStyle = "#5f715f";
        ctx.beginPath();
        ctx.ellipse(120 + i * 90, 150 + (i % 2) * 30, 35, 120, Math.PI / 8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      const date = new Date(rifaData.rifa.data_sorteio);
      const day = Number.isNaN(date.getTime()) ? "--" : String(date.getDate()).padStart(2, "0");
      const month = Number.isNaN(date.getTime())
        ? "MES"
        : date
            .toLocaleDateString("pt-BR", { month: "short" })
            .replace(".", "")
            .toUpperCase();

      const dateBubbleSize = 130;
      const bubbleX = canvas.width - padding - dateBubbleSize;
      const bubbleY = padding + 8;

      ctx.fillStyle = "#8fa192";
      ctx.beginPath();
      ctx.arc(bubbleX + dateBubbleSize / 2, bubbleY + dateBubbleSize / 2, dateBubbleSize / 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = "#6f8373";
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(bubbleX + dateBubbleSize / 2, bubbleY + dateBubbleSize / 2, dateBubbleSize / 2 - 5, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "#f7f6f1";
      ctx.textAlign = "center";
      ctx.font = "bold 26px Trebuchet MS";
      ctx.fillText("SORTEIO", bubbleX + dateBubbleSize / 2, bubbleY + 34);
      ctx.font = "bold 44px Trebuchet MS";
      ctx.fillText(day, bubbleX + dateBubbleSize / 2, bubbleY + 77);
      ctx.font = "bold 21px Trebuchet MS";
      ctx.fillText(month, bubbleX + dateBubbleSize / 2, bubbleY + 105);

      ctx.fillStyle = "#2f3a33";
      ctx.font = "58px Georgia";
      ctx.textAlign = "center";
      ctx.fillText("Rifa Casamento", canvas.width / 2, padding + 96);
      ctx.fillText("Samara e Juan", canvas.width / 2, padding + 168);

      ctx.fillStyle = "#4f5f54";
      ctx.font = "30px Georgia";
      ctx.fillText("Participe da Rifa e ajude-nos", canvas.width / 2, padding + 230);
      ctx.fillText("a realizar esse sonho!", canvas.width / 2, padding + 272);

      const instructionTitleY = padding + 322;
      ctx.fillStyle = "#7f9583";
      roundRect(ctx, canvas.width / 2 - 150, instructionTitleY - 28, 300, 46, 24);
      ctx.fill();
      ctx.strokeStyle = "#5f7261";
      ctx.lineWidth = 2;
      roundRect(ctx, canvas.width / 2 - 150, instructionTitleY - 28, 300, 46, 24);
      ctx.stroke();

      ctx.fillStyle = "#f6f4ee";
      ctx.font = "bold 24px Trebuchet MS";
      ctx.fillText("COMO FUNCIONA?", canvas.width / 2, instructionTitleY + 2);

      ctx.textAlign = "left";
      ctx.fillStyle = "#33423a";
      ctx.font = "21px Trebuchet MS";
      const infoRowTop = padding + 354;
      const instructionX = padding + 24;
      const instructionStartY = infoRowTop + 34;
      const instructions = [
        "1. Escolha entre os numeros disponiveis abaixo.",
        "2. Pague o valor da rifa por numero escolhido.",
        "3. Envie o comprovante e seus dados.",
        "4. Aguarde o sorteio e boa sorte!",
      ];
      instructions.forEach((line, index) => {
        ctx.fillText(line, instructionX, instructionStartY + index * 30);
      });

      const priceCardWidth = 300;
      const priceCardHeight = 132;
      const priceCardX = canvas.width - padding - priceCardWidth;
      const priceCardY = infoRowTop;

      ctx.fillStyle = "#f3f0e7";
      ctx.strokeStyle = "#90a08f";
      ctx.lineWidth = 2;
      roundRect(ctx, priceCardX, priceCardY, priceCardWidth, priceCardHeight, 16);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = "left";
      ctx.fillStyle = "#3d4c42";
      ctx.font = "bold 22px Trebuchet MS";
      ctx.fillText("Valor da Rifa", priceCardX + 16, priceCardY + 34);
      ctx.font = "bold 34px Trebuchet MS";
      ctx.fillText(formatCurrency(rifaData.rifa.valor_numero), priceCardX + 16, priceCardY + 80);
      ctx.font = "17px Trebuchet MS";
      ctx.fillText("por numero", priceCardX + 16, priceCardY + 110);

      const gridStartX = (canvas.width - gridWidth) / 2;
      ctx.textAlign = "center";

      sortedNumbers.forEach((numero, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = gridStartX + col * (cardWidth + gap);
        const y = gridStartY + row * (cardHeight + gap);
        const sold = Boolean(numero.pessoa_id);

        ctx.fillStyle = sold ? "#bac4b4" : "#f6f5f0";
        ctx.strokeStyle = sold ? "#7e8f7a" : "#9fae9b";
        ctx.lineWidth = 2;
        roundRect(ctx, x, y, cardWidth, cardHeight, 20);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = sold ? "#596a59" : "#3f4f42";
        ctx.font = "bold 24px Trebuchet MS";
        ctx.fillText(numero.numero, x + cardWidth / 2, y + 30);

        if (sold) {
          ctx.fillStyle = "#4d5c4d";
          ctx.font = "bold 12px Trebuchet MS";
          ctx.fillText("RESERVADO", x + cardWidth / 2, y + 41);
        }
      });

      const footerY = gridStartY + gridHeight;
      
      ctx.fillStyle = "#7d8d7c";
      roundRect(ctx, canvas.width / 2 - 270, footerY + 24, 540, 84, 32);
      ctx.fill();

      ctx.fillStyle = "#f8f7f2";
      ctx.font = "bold 27px Trebuchet MS";
      ctx.textAlign = "center";
      ctx.fillText(`PREMIO: ${formatCurrency(rifaData.rifa.valor_premio)}`, canvas.width / 2, footerY + 60);
      ctx.font = "bold 20px Trebuchet MS";
      ctx.fillText(`ou ${rifaData.rifa.descricao || "descricao da rifa"}`, canvas.width / 2, footerY + 90);

      const footerPanelX = 28;
      const footerPanelWidth = canvas.width - 56;
      const footerPanelRight = footerPanelX + footerPanelWidth;

      ctx.fillStyle = "#dce1d6";
      roundRect(ctx, footerPanelX, footerY + 124, footerPanelWidth, footerHeight - 154, 22);
      ctx.fill();

      const caricature = await loadFirstAvailableImage([
        "/caricatura-casal.png",
        "/casal-caricatura.png",
        "/assets/casal-caricatura.png",
      ]);

      const contactCardWidth = 360;
      const contactCardHeight = 280;
      const gapBetween = 40;
      const contentStartY = footerY + 148;
      const availableWidth = canvas.width - 56 - 48;
      const imageMaxWidth = availableWidth - contactCardWidth - gapBetween;
      const imageMaxHeight = footerHeight - 160;

      let caricatureWidth = 0;
      let caricatureHeight = 0;
      let caricatureX = 0;
      let caricatureY = 0;

      if (caricature) {
        const ratio = Math.min(imageMaxWidth / caricature.width, imageMaxHeight / caricature.height);
        caricatureWidth = caricature.width * ratio;
        caricatureHeight = caricature.height * ratio;
      }

      const imageAreaX = footerPanelRight - imageMaxWidth;
      const contactCardX = imageAreaX - gapBetween - contactCardWidth;
      const contactCardY = contentStartY + (imageMaxHeight - contactCardHeight) / 2;

      ctx.fillStyle = "#f3f0e7";
      ctx.strokeStyle = "#90a08f";
      ctx.lineWidth = 2;
      roundRect(ctx, contactCardX, contactCardY, contactCardWidth, contactCardHeight, 16);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = "center";
      ctx.fillStyle = "#3d4c42";
      ctx.font = "bold 26px Trebuchet MS";
      ctx.fillText("Contato Juan (Noivo)", contactCardX + contactCardWidth / 2, contactCardY + 48);
      ctx.font = "24px Trebuchet MS";
      ctx.fillText("(19) 99296-1995", contactCardX + contactCardWidth / 2, contactCardY + 88);

      ctx.strokeStyle = "#b0b8af";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(contactCardX + 30, contactCardY + 118);
      ctx.lineTo(contactCardX + contactCardWidth - 30, contactCardY + 118);
      ctx.stroke();

      ctx.fillStyle = "#3d4c42";
      ctx.font = "bold 26px Trebuchet MS";
      ctx.fillText("Chave Pix", contactCardX + contactCardWidth / 2, contactCardY + 162);
      ctx.font = "24px Trebuchet MS";
      ctx.fillText("(19) 99296-1995", contactCardX + contactCardWidth / 2, contactCardY + 202);
      ctx.font = "21px Trebuchet MS";
      ctx.fillStyle = "#5f6f5e";
      ctx.fillText("Nubank", contactCardX + contactCardWidth / 2, contactCardY + 238);

      caricatureX = footerPanelRight - caricatureWidth;
      caricatureY = contentStartY + (imageMaxHeight - caricatureHeight) / 2;

      if (caricature) {
        ctx.drawImage(caricature, caricatureX, caricatureY, caricatureWidth, caricatureHeight);
      } else {
        ctx.fillStyle = "#5f6f5e";
        ctx.font = "bold 18px Trebuchet MS";
        ctx.textAlign = "center";
        ctx.fillText("Adicione a caricatura em", imageAreaX + imageMaxWidth / 2, contentStartY + imageMaxHeight / 2 - 10);
        ctx.fillText("/frontend/public/caricatura-casal.png", imageAreaX + imageMaxWidth / 2, contentStartY + imageMaxHeight / 2 + 15);
      }

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
