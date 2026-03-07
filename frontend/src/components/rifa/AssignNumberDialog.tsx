import { type FormEvent, useState } from "react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import type { Pessoa } from "../../types";

type AssignNumberDialogProps = {
  numero: string;
  titulo?: string;
  descricao?: string;
  triggerLabel?: string;
  pessoas: Pessoa[];
  onSubmit: (payload: {
    pessoaId?: string;
    nome?: string;
    telefone?: string;
    pago: boolean;
    valorPago: number | null;
  }) => Promise<void>;
  disabled?: boolean;
};

export function AssignNumberDialog({
  numero,
  titulo,
  descricao,
  triggerLabel,
  pessoas,
  onSubmit,
  disabled,
}: AssignNumberDialogProps) {
  const [open, setOpen] = useState(false);
  const [modoPessoa, setModoPessoa] = useState<"existente" | "novo">("existente");
  const [pessoaId, setPessoaId] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [pago, setPago] = useState(true);
  const [valorPago, setValorPago] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (modoPessoa === "existente" && !pessoaId) {
      return;
    }

    setSubmitting(true);
    try {
      await onSubmit({
        pessoaId: modoPessoa === "existente" ? pessoaId : undefined,
        nome: modoPessoa === "novo" ? nome.trim() : undefined,
        telefone: modoPessoa === "novo" ? telefone.trim() : undefined,
        pago,
        valorPago: valorPago.trim() ? Number(valorPago) : null,
      });
      setOpen(false);
      setModoPessoa("existente");
      setPessoaId("");
      setNome("");
      setTelefone("");
      setPago(true);
      setValorPago("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button disabled={disabled} size="sm">
          {triggerLabel ?? `Comprar numero ${numero}`}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titulo ?? `Associar Numero ${numero}`}</DialogTitle>
          <DialogDescription>{descricao ?? "Informe os dados da pessoa que comprou este numero."}</DialogDescription>
        </DialogHeader>

        <form className="grid gap-3" onSubmit={handleSubmit}>
          <Select value={modoPessoa} onValueChange={(value) => setModoPessoa(value as "existente" | "novo")}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha como selecionar comprador" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="existente">Pessoa pre-cadastrada</SelectItem>
              <SelectItem value="novo">Cadastrar nova pessoa</SelectItem>
            </SelectContent>
          </Select>

          {modoPessoa === "existente" ? (
            <Select value={pessoaId} onValueChange={setPessoaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a pessoa" />
              </SelectTrigger>
              <SelectContent>
                {pessoas.map((pessoa) => (
                  <SelectItem key={pessoa.id} value={pessoa.id}>
                    {pessoa.nome} - {pessoa.telefone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <>
              <Input
                value={nome}
                onChange={(event) => setNome(event.target.value)}
                placeholder="Nome"
                required
              />
              <Input
                value={telefone}
                onChange={(event) => setTelefone(event.target.value)}
                placeholder="Telefone"
                required
              />
            </>
          )}

          <label className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm">
            <input type="checkbox" checked={pago} onChange={(event) => setPago(event.target.checked)} />
            Numero ja pago
          </label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={valorPago}
            onChange={(event) => setValorPago(event.target.value)}
            placeholder="Valor pago (opcional)"
          />

          <DialogFooter>
            <Button type="submit" disabled={submitting || (modoPessoa === "existente" && !pessoaId)}>
              {submitting ? "Salvando..." : "Salvar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
