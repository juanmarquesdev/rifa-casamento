import type { ComponentType, ReactNode } from "react";
import { ChartColumnBig, Gift, Tickets } from "lucide-react";
import { NavLink } from "react-router-dom";
import { cn } from "../../lib/utils";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const navItems: NavItem[] = [
  { to: "/", label: "Home", icon: Tickets },
  { to: "/dashboard", label: "Dashboard", icon: ChartColumnBig },
  { to: "/sorteio", label: "Sorteio", icon: Gift },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#dbeafe,transparent_38%),linear-gradient(160deg,#f8fafc,#eef2ff)] text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col px-3 pb-8 pt-5 md:px-6">
        <header className="mb-6 overflow-hidden rounded-3xl border border-slate-200 bg-white/70 p-5 shadow-lg backdrop-blur-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Painel de Rifas</h1>
              <p className="text-sm text-slate-500">Controle local, visual moderno e sorteio com animacao.</p>
            </div>
            <nav className="flex flex-wrap gap-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-semibold transition",
                      isActive
                        ? "border-sky-400 bg-sky-100 text-sky-700"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100",
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </div>
  );
}
