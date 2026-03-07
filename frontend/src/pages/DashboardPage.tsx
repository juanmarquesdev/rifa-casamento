import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Bar, BarChart, CartesianGrid, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { useToast } from "../components/ui/toast";
import { fetchDashboard, listarRifas } from "../services/api";
import { formatCurrency } from "../lib/utils";
import type { RifaResumo } from "../types";

const pieColors = ["#0284c7", "#16a34a", "#f59e0b", "#ef4444"];

export function DashboardPage() {
  const { notify } = useToast();
  const [loading, setLoading] = useState(false);
  const [dashboard, setDashboard] = useState({
    totalRifas: 0,
    rifasAtivas: 0,
    rifasSorteadas: 0,
    faturamentoAlvoGeral: 0,
    premiosGeral: 0,
    arrecadadoGeral: 0,
  });
  const [rifas, setRifas] = useState<RifaResumo[]>([]);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      try {
        const [totais, rifasData] = await Promise.all([
          fetchDashboard(),
          listarRifas({ page: 1, pageSize: 40 }),
        ]);
        setDashboard(totais.totais);
        setRifas(rifasData.data);
      } catch (error) {
        notify({
          title: "Falha ao carregar dashboard",
          description: (error as Error).message,
          kind: "error",
        });
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, [notify]);

  const rankingData = useMemo(
    () =>
      rifas
        .slice(0, 8)
        .map((rifa) => ({
          nome: rifa.descricao.slice(0, 14),
          Arrecadado: Number(rifa.total_arrecadado.toFixed(2)),
          Meta: Number(rifa.faturamento_alvo.toFixed(2)),
        })),
    [rifas],
  );

  const statusData = useMemo(
    () => [
      { name: "Ativas", value: dashboard.rifasAtivas },
      { name: "Sorteadas", value: dashboard.rifasSorteadas },
      {
        name: "Outras",
        value: Math.max(0, dashboard.totalRifas - dashboard.rifasAtivas - dashboard.rifasSorteadas),
      },
    ],
    [dashboard],
  );

  const coberturaMeta =
    dashboard.faturamentoAlvoGeral > 0
      ? Math.round((dashboard.arrecadadoGeral / dashboard.faturamentoAlvoGeral) * 100)
      : 0;

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle>Dashboard Analitico</CardTitle>
            <CardDescription>Visao consolidada para tomada de decisao.</CardDescription>
          </div>
          <Button asChild variant="outline">
            <Link to="/">Voltar para Home</Link>
          </Button>
        </CardHeader>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Total de Rifas</CardDescription>
            <CardTitle>{dashboard.totalRifas}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Arrecadado Geral</CardDescription>
            <CardTitle>{formatCurrency(dashboard.arrecadadoGeral)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Meta Financeira Global</CardDescription>
            <CardTitle>{formatCurrency(dashboard.faturamentoAlvoGeral)}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Cobertura da Meta</CardDescription>
            <CardTitle>{coberturaMeta}%</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <Card className="xl:col-span-3">
          <CardHeader>
            <CardTitle>Arrecadacao por Rifa</CardTitle>
            <CardDescription>Comparativo rapido entre arrecadado e meta planejada.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {loading ? (
              <p className="text-sm text-slate-500">Carregando...</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rankingData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="nome" />
                  <YAxis />
                  <Tooltip
                    formatter={(value) => {
                      const numeric = typeof value === "number" ? value : Number(value ?? 0);
                      return formatCurrency(numeric);
                    }}
                  />
                  <Bar dataKey="Arrecadado" fill="#0284c7" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="Meta" fill="#cbd5e1" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Status das Rifas</CardTitle>
            <CardDescription>Distribuicao de status no sistema.</CardDescription>
          </CardHeader>
          <CardContent className="h-80">
            {loading ? (
              <p className="text-sm text-slate-500">Carregando...</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={110} label>
                    {statusData.map((entry, index) => (
                      <Cell key={`${entry.name}-${index}`} fill={pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Resumo Rapido</CardTitle>
          <CardDescription>Indicadores principais para acompanhar a saude das rifas.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline">Ativas: {dashboard.rifasAtivas}</Badge>
          <Badge variant="outline">Sorteadas: {dashboard.rifasSorteadas}</Badge>
          <Badge variant={coberturaMeta >= 100 ? "success" : "warning"}>
            {coberturaMeta >= 100 ? "Meta global atingida" : "Meta global pendente"}
          </Badge>
        </CardContent>
      </Card>
    </div>
  );
}
