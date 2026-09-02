import { Link, useNavigate } from "@tanstack/react-router";
import { Briefcase, FileStack, FileUp, LayoutDashboard, LogOut, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/master-resume", label: "Master Resume", icon: FileStack },
  { to: "/import", label: "Import PDF", icon: FileUp },
  { to: "/jobs", label: "Jobs", icon: Briefcase },
  { to: "/profile", label: "Profile", icon: UserRound },
] as const;


export function AppShell({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error(error.message);
      return;
    }
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border bg-card/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-4 py-3 sm:px-6">
          <Link to="/dashboard" className="font-display text-lg font-semibold tracking-tight">
            Mau<span className="text-evidence">·</span>JobFit
          </Link>
          <nav className="order-3 flex w-full items-center gap-1 sm:order-2 sm:w-auto">
            {nav.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                activeProps={{ className: "bg-secondary !text-foreground font-medium" }}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto order-2 flex items-center gap-3 sm:order-3">
            <span className="hidden max-w-[16rem] truncate text-xs text-muted-foreground sm:inline">
              {user?.email}
            </span>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="size-4" aria-hidden />
              Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">{children}</main>
    </div>
  );
}
