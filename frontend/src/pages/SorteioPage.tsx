import { useEffect, useMemo, useState } from "react";
import { motion, useAnimationControls } from "framer-motion";
import Confetti from "react-confetti";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../components/ui/select";
import { useToast } from "../components/ui/toast";
import { candidatosSorteio, listarRifas, sortearRifa } from "../services/api";
import type { CandidatoSorteio, RifaResumo, SorteioResponse } from "../types";

const SLOT_WIDTH = 180;
const SLOT_GAP = 12;
const SLOT_STEP = SLOT_WIDTH + SLOT_GAP;
const CENTER_OFFSET = SLOT_STEP;

function pickRandom(candidates: CandidatoSorteio[]): CandidatoSorteio {
  return candidates[Math.floor(Math.random() * candidates.length)] as CandidatoSorteio;
}

function buildReel(candidates: CandidatoSorteio[], winner: SorteioResponse["vencedor"]): {
  items: CandidatoSorteio[];
  winnerIndex: number;
} {
  const items: CandidatoSorteio[] = [];

  for (let i = 0; i < 44; i += 1) {
    items.push(pickRandom(candidates));
  }

  for (let i = 0; i < 6; i += 1) {
    items.push(pickRandom(candidates));
  }

  const winnerIndex = items.length;
  items.push({ id: "winner", numero: winner.numero, nome: winner.nome, telefone: winner.telefone });

  for (let i = 0; i < 5; i += 1) {
    items.push(pickRandom(candidates));
  }

  return { items, winnerIndex };
}

export function SorteioPage() {
  const { notify } = useToast();
  const controls = useAnimationControls();
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [rifas, setRifas] = useState<RifaResumo[]>([]);
  const [rifaId, setRifaId] = useState("");
  const [candidates, setCandidates] = useState<CandidatoSorteio[]>([]);
  const [running, setRunning] = useState(false);
  const [showWinner, setShowWinner] = useState(false);
  const [winner, setWinner] = useState<SorteioResponse["vencedor"] | null>(null);
  const [reelItems, setReelItems] = useState<CandidatoSorteio[]>([]);

  const selectedRifa = useMemo(() => rifas.find((item) => item.id === rifaId) ?? null, [rifaId, rifas]);

  useEffect(() => {
    async function loadRifas() {
      try {
        const response = await listarRifas({ page: 1, pageSize: 100 });
        setRifas(response.data.filter((item) => item.status === "ativa"));
      } catch (error) {
        notify({ title: "Erro ao carregar rifas", description: (error as Error).message, kind: "error" });
      }
    }

    void loadRifas();
  }, [notify]);

  useEffect(() => {
    async function loadCandidates() {
      if (!rifaId) {
        setCandidates([]);
        return;
      }
      try {
        const data = await candidatosSorteio(rifaId);
        setCandidates(data.data);
      } catch (error) {
        notify({ title: "Erro ao carregar candidatos", description: (error as Error).message, kind: "error" });
      }
    }

    void loadCandidates();
  }, [notify, rifaId]);

  useEffect(() => {
    function updateViewport() {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    }

    updateViewport();
    window.addEventListener("resize", updateViewport);

    return () => {
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  async function handleDraw() {
    if (!rifaId || candidates.length === 0) {
      return;
    }

    try {
      setRunning(true);
      setShowWinner(false);
      const response = await sortearRifa(rifaId);
      setWinner(response.vencedor);

      const { items, winnerIndex } = buildReel(response.candidatos, response.vencedor);
      setReelItems(items);

      controls.set({ x: CENTER_OFFSET });
      await controls.start({
        x: CENTER_OFFSET - winnerIndex * SLOT_STEP,
        transition: {
          duration: 3.1,
          ease: [0.08, 0.88, 0.22, 1],
        },
      });

      setShowWinner(true);
      notify({ title: "Sorteio iniciado", kind: "info" });
    } catch (error) {
      notify({ title: "Erro ao sortear", description: (error as Error).message, kind: "error" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Tela de Sorteio</CardTitle>
          <CardDescription>
            Selecione uma rifa ativa, acompanhe o carrossel desacelerando e veja o vencedor em tela cheia.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="flex flex-wrap gap-2">
            <Select value={rifaId} onValueChange={setRifaId}>
              <SelectTrigger className="w-90">
                <SelectValue placeholder="Selecione a rifa" />
              </SelectTrigger>
              <SelectContent>
                {rifas.map((rifa) => (
                  <SelectItem key={rifa.id} value={rifa.id}>
                    {rifa.descricao}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={() => void handleDraw()} disabled={!rifaId || candidates.length === 0 || running}>
              {running ? "Sorteando..." : "Sortear agora"}
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Candidatos pagos: {candidates.length}</Badge>
            {selectedRifa ? <Badge variant="outline">Rifa: {selectedRifa.descricao}</Badge> : null}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="mb-2 flex items-center justify-between text-sm font-medium text-slate-600">
              <span>Carrossel do sorteio</span>
              {running ? <Badge variant="warning">Rodando...</Badge> : <Badge variant="outline">Pronto</Badge>}
            </div>

            <div className="relative mx-auto overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50" style={{ maxWidth: "576px" }}>
              <div className="pointer-events-none absolute bottom-0 left-1/2 top-0 z-20 w-[3px] -translate-x-1/2 bg-sky-500/80 shadow-[0_0_20px_rgba(14,165,233,0.65)]" />
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-24 bg-gradient-to-r from-white to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-24 bg-gradient-to-l from-white to-transparent" />

              <motion.div
                animate={controls}
                initial={{ x: CENTER_OFFSET }}
                className="flex min-h-52 items-center gap-3 px-3 py-4"
                style={{ willChange: "transform" }}
              >
                {(reelItems.length > 0 ? reelItems : candidates).map((item, index) => (
                  <motion.div
                    key={`${item.id}-${item.numero}-${index}`}
                    whileHover={{ scale: 1.02 }}
                    className="h-40 w-[180px] shrink-0 rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
                  >
                    <div className="font-mono text-4xl font-black text-slate-800">{item.numero}</div>
                    <div className="mt-2 line-clamp-2 text-sm font-semibold text-slate-700">{item.nome}</div>
                    <div className="mt-1 line-clamp-1 text-xs text-slate-500">{item.telefone}</div>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>
        </CardContent>
      </Card>

      {showWinner && winner ? (
        <div className="fixed inset-0 z-90 flex flex-col items-center justify-center bg-slate-950/90 p-6 text-center text-white">
          <Confetti width={viewport.width} height={viewport.height} numberOfPieces={420} recycle={false} />
          <p className="text-sm uppercase tracking-[0.35em] text-sky-200">Vencedor</p>
          <h2 className="mt-2 font-mono text-7xl font-black text-sky-300">{winner.numero}</h2>
          <p className="mt-4 text-4xl font-bold">{winner.nome}</p>
          <p className="text-lg text-slate-300">{winner.telefone}</p>
          <Button className="mt-8" size="lg" onClick={() => setShowWinner(false)}>
            Fechar resultado
          </Button>
        </div>
      ) : null}
    </div>
  );
}
