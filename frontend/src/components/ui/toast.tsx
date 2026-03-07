import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { cn } from "../../lib/utils";

type ToastKind = "success" | "error" | "info";

type ToastData = {
  id: string;
  title: string;
  description?: string;
  kind: ToastKind;
};

type ToastContextValue = {
  notify: (input: Omit<ToastData, "id">) => void;
};

const ToastContext = React.createContext<ToastContextValue | null>(null);

const kindClassMap: Record<ToastKind, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  error: "border-rose-200 bg-rose-50 text-rose-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastData[]>([]);

  const notify = React.useCallback((input: Omit<ToastData, "id">) => {
    setToasts((prev) => [...prev, { ...input, id: crypto.randomUUID() }]);
  }, []);

  return (
    <ToastContext.Provider value={{ notify }}>
      <ToastPrimitive.Provider swipeDirection="right">
        {children}
        {toasts.map((toast) => (
          <ToastPrimitive.Root
            key={toast.id}
            open
            duration={3500}
            onOpenChange={(open) => {
              if (!open) {
                setToasts((prev) => prev.filter((item) => item.id !== toast.id));
              }
            }}
            className={cn(
              "group pointer-events-auto relative mb-2 w-90 rounded-xl border p-4 shadow-lg",
              kindClassMap[toast.kind],
            )}
          >
            <ToastPrimitive.Title className="text-sm font-semibold">{toast.title}</ToastPrimitive.Title>
            {toast.description ? (
              <ToastPrimitive.Description className="mt-1 text-xs opacity-90">
                {toast.description}
              </ToastPrimitive.Description>
            ) : null}
            <ToastPrimitive.Close className="absolute right-2 top-2 cursor-pointer rounded p-1 hover:bg-black/5">
              <X className="h-3.5 w-3.5" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed right-3 top-3 z-100 flex w-97.5 max-w-[95vw] flex-col outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}
