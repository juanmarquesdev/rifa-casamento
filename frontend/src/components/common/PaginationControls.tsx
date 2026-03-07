import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/button";

type PaginationControlsProps = {
  page: number;
  totalPages: number;
  onChangePage: (page: number) => void;
};

export function PaginationControls({ page, totalPages, onChangePage }: PaginationControlsProps) {
  if (totalPages <= 1) {
    return null;
  }

  return (
    <div className="mt-4 flex items-center justify-end gap-2">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onChangePage(page - 1)}>
        <ChevronLeft className="h-4 w-4" />
        Anterior
      </Button>
      <span className="text-sm text-slate-600">
        Pagina {page} de {totalPages}
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onChangePage(page + 1)}
      >
        Proxima
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
