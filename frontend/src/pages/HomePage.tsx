import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ConfirmActionDialog } from "../components/common/ConfirmActionDialog";
import { PaginationControls } from "../components/common/PaginationControls";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { useToast } from "../components/ui/toast";
import { atualizarRifa, criarRifa, deletarRifa, listarRifas } from "../services/api";
import { formatCurrency, formatDate, imageToBase64 } from "../lib/utils";
import type { RifaResumo } from "../types";

const pageSize = 8;

type RifaFormState = {
  descricao: string;
  valorPremio: string;
  valorNumero: string;
  lucroDesejado: string;
  dataSorteio: string;
  fotoPremio: string;
};

const initialForm: RifaFormState = {
  descricao: "",
  valorPremio: "",
  valorNumero: "",
  lucroDesejado: "",
  dataSorteio: "",
  fotoPremio: "",
};

export function HomePage() {
  const { notify } = useToast();
  const [loading, setLoading] = useState(false);
  const [rifas, setRifas] = useState<RifaResumo[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<RifaFormState>(initialForm);
  const [editing, setEditing] = useState<RifaResumo | null>(null);
  const [rifaToDelete, setRifaToDelete] = useState<RifaResumo | null>(null);

  async function loadData(targetPage: number = page) {
    setLoading(true);
    try {
      const rifasData = await listarRifas({
        page: targetPage,
        pageSize,
        search: search.trim(),
      });
      setRifas(rifasData.data);
      setPage(rifasData.pagination.page);
      setTotalPages(Math.max(1, rifasData.pagination.totalPages));
    } catch (error) {
      notify({
        title: "Falha ao carregar rifas",
        description: (error as Error).message,
        kind: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleImageUpload(event: React.ChangeEvent<HTMLInputElement>, isEdit: boolean = false) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const base64 = await imageToBase64(file, 1024);
      if (isEdit) {
        setEditing((prev) => (prev ? { ...prev, foto_premio: base64 } : null));
      } else {
        setForm((prev) => ({ ...prev, fotoPremio: base64 }));
      }
    } catch (error) {
      notify({
        title: "Erro ao carregar imagem",
        description: (error as Error).message,
        kind: "error",
      });
      event.target.value = '';
    }
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const created = await criarRifa({
        descricao: form.descricao.trim(),
        valorPremio: Number(form.valorPremio),
        valorNumero: Number(form.valorNumero),
        lucroDesejado: Number(form.lucroDesejado || 0),
        dataSorteio: form.dataSorteio,
        fotoPremio: form.fotoPremio || undefined,
      });

      notify({
        title: "Rifa criada",
        description: `Foram gerados ${created.quantidadeNumeros} numeros de 4 digitos.`,
        kind: "success",
      });
      setForm(initialForm);
      await loadData(1);
    } catch (error) {
      notify({
        title: "Erro ao criar rifa",
        description: (error as Error).message,
        kind: "error",
      });
    }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) {
      return;
    }

    try {
      await atualizarRifa(editing.id, {
        descricao: editing.descricao,
        valorPremio: editing.valor_premio,
        valorNumero: editing.valor_numero,
        lucroDesejado: editing.lucro_desejado,
        dataSorteio: editing.data_sorteio,
        fotoPremio: editing.foto_premio || undefined,
      });
      notify({ title: "Rifa atualizada", kind: "success" });
      setEditing(null);
      await loadData(page);
    } catch (error) {
      notify({
        title: "Erro ao atualizar rifa",
        description: (error as Error).message,
        kind: "error",
      });
    }
  }

  async function handleDeleteRifa(rifa: RifaResumo) {
    try {
      await deletarRifa(rifa.id);
      notify({
        title: "Rifa removida",
        description: "Registros relacionados foram removidos.",
        kind: "success",
      });
      await loadData(1);
    } catch (error) {
      notify({
        title: "Erro ao remover rifa",
        description: (error as Error).message,
        kind: "error",
      });
    }
  }

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Home de Rifas</CardTitle>
            <CardDescription>Operacao do dia a dia: listar, criar, editar e excluir rifas.</CardDescription>
          </div>
          <Dialog>
            <DialogTrigger asChild>
              <Button>Criar nova rifa</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nova Rifa</DialogTitle>
                <DialogDescription>
                  Informe o lucro desejado para o sistema calcular quantos numeros gerar automaticamente.
                </DialogDescription>
              </DialogHeader>
              <form className="grid gap-3" onSubmit={submitCreate}>
                <Input
                  value={form.descricao}
                  onChange={(event) => setForm((prev) => ({ ...prev, descricao: event.target.value }))}
                  placeholder="Descricao"
                  required
                />
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.valorPremio}
                  onChange={(event) => setForm((prev) => ({ ...prev, valorPremio: event.target.value }))}
                  placeholder="Valor do premio"
                  required
                />
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.valorNumero}
                  onChange={(event) => setForm((prev) => ({ ...prev, valorNumero: event.target.value }))}
                  placeholder="Valor por numero"
                  required
                />
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.lucroDesejado}
                  onChange={(event) => setForm((prev) => ({ ...prev, lucroDesejado: event.target.value }))}
                  placeholder="Quanto quer faturar de lucro"
                  required
                />
                <Input
                  type="date"
                  value={form.dataSorteio}
                  onChange={(event) => setForm((prev) => ({ ...prev, dataSorteio: event.target.value }))}
                  required
                />
                <div className="grid gap-1">
                  <label className="text-sm font-medium">Foto do prêmio (opcional, máx 1MB)</label>
                  <Input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e, false)}
                    className="cursor-pointer"
                  />
                  {form.fotoPremio && (
                    <div className="relative mt-2 h-32 w-32 overflow-hidden rounded border">
                      <img 
                        src={form.fotoPremio} 
                        alt="Preview"
                        className="h-full w-full object-cover"
                      />
                      <Button
                        type="button"
                        variant="destructive"
                        size="sm"
                        className="absolute right-1 top-1 h-6 w-6 p-0"
                        onClick={() => setForm((prev) => ({ ...prev, fotoPremio: "" }))}
                      >
                        ×
                      </Button>
                    </div>
                  )}
                </div>
                <DialogFooter>
                  <Button type="submit">Salvar</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </CardHeader>

        <CardContent>
          <div className="mb-4 flex flex-wrap gap-2">
            <Input
              className="max-w-sm"
              placeholder="Buscar rifa por descricao"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <Button variant="secondary" onClick={() => void loadData(1)}>
              Buscar
            </Button>
            <Button asChild variant="outline">
              <Link to="/dashboard">Ver dashboard analitico</Link>
            </Button>
          </div>

          {loading ? <p className="text-sm text-slate-500">Carregando...</p> : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {rifas.map((rifa) => {
              const progresso = Math.min(
                100,
                Math.round((rifa.total_arrecadado / Math.max(1, rifa.faturamento_alvo)) * 100),
              );
              return (
                <Card key={rifa.id} className="overflow-hidden">
                  {rifa.foto_premio && (
                    <div className="aspect-video w-full overflow-hidden bg-slate-100">
                      <img 
                        src={rifa.foto_premio} 
                        alt={rifa.descricao}
                        className="h-full w-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle className="line-clamp-1">{rifa.descricao}</CardTitle>
                    <CardDescription>Sorteio em {formatDate(rifa.data_sorteio)}</CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2">
                    <div className="flex items-center justify-between text-sm">
                      <span>Meta</span>
                      <strong>{formatCurrency(rifa.faturamento_alvo)}</strong>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span>Arrecadado</span>
                      <strong>{formatCurrency(rifa.total_arrecadado)}</strong>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200">
                      <div className="h-2 rounded-full bg-sky-500" style={{ width: `${progresso}%` }} />
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={Boolean(rifa.atingiu_meta) ? "success" : "warning"}>
                        {rifa.atingiu_meta ? "Meta atingida" : "Meta pendente"}
                      </Badge>
                      <Badge variant="outline">Vendidos: {rifa.vendidos}</Badge>
                      <Badge variant="outline">Disponiveis: {rifa.disponiveis}</Badge>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Button asChild size="sm">
                        <Link to={`/rifas/${rifa.id}`}>Entrar</Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/rifas/${rifa.id}/participantes`}>Participantes</Link>
                      </Button>
                      <Button variant="secondary" size="sm" onClick={() => {
                        const dataSorteio = rifa.data_sorteio.split('T')[0] || rifa.data_sorteio;
                        setEditing({ ...rifa, data_sorteio: dataSorteio });
                      }}>
                        Editar
                      </Button>
                      <Button variant="destructive" size="sm" onClick={() => setRifaToDelete(rifa)}>
                        Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <PaginationControls page={page} totalPages={totalPages} onChangePage={(next) => void loadData(next)} />
        </CardContent>
      </Card>

      <Dialog open={Boolean(editing)} onOpenChange={(open) => (!open ? setEditing(null) : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Rifa</DialogTitle>
            <DialogDescription>
              Altere os dados financeiros ou status. O sistema ajusta os numeros automaticamente.
            </DialogDescription>
          </DialogHeader>
          {editing ? (
            <form className="grid gap-3" onSubmit={submitEdit}>
              <Input
                value={editing.descricao}
                onChange={(event) =>
                  setEditing((prev) => (prev ? { ...prev, descricao: event.target.value } : null))
                }
                required
              />
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={editing.valor_premio}
                onChange={(event) =>
                  setEditing((prev) => (prev ? { ...prev, valor_premio: Number(event.target.value) } : null))
                }
                required
              />
              <Input
                type="number"
                min="0.01"
                step="0.01"
                value={editing.valor_numero}
                onChange={(event) =>
                  setEditing((prev) => (prev ? { ...prev, valor_numero: Number(event.target.value) } : null))
                }
                required
              />
              <Input
                type="number"
                min="0"
                step="0.01"
                value={editing.lucro_desejado}
                onChange={(event) =>
                  setEditing((prev) => (prev ? { ...prev, lucro_desejado: Number(event.target.value) } : null))
                }
                required
              />
              <Input
                type="date"
                value={editing.data_sorteio}
                onChange={(event) =>
                  setEditing((prev) => (prev ? { ...prev, data_sorteio: event.target.value } : null))
                }
                required
              />
              <div className="grid gap-1">
                <label className="text-sm font-medium">Foto do prêmio (opcional, máx 1MB)</label>
                <Input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleImageUpload(e, true)}
                  className="cursor-pointer"
                />
                {editing.foto_premio && (
                  <div className="relative mt-2 h-32 w-32 overflow-hidden rounded border">
                    <img 
                      src={editing.foto_premio} 
                      alt="Preview"
                      className="h-full w-full object-cover"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute right-1 top-1 h-6 w-6 p-0"
                      onClick={() => setEditing((prev) => (prev ? { ...prev, foto_premio: null } : null))}
                    >
                      ×
                    </Button>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button type="submit">Salvar alteracoes</Button>
              </DialogFooter>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <ConfirmActionDialog
        open={Boolean(rifaToDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setRifaToDelete(null);
          }
        }}
        title="Excluir rifa"
        description={
          rifaToDelete
            ? `Deseja realmente excluir a rifa "${rifaToDelete.descricao}"? A exclusao sera em cascata.`
            : ""
        }
        confirmLabel="Excluir"
        variant="destructive"
        onConfirm={async () => {
          if (!rifaToDelete) {
            return;
          }
          await handleDeleteRifa(rifaToDelete);
          setRifaToDelete(null);
        }}
      />
    </div>
  );
}
