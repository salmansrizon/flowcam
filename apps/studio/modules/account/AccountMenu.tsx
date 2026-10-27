"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronDown, LogOut, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { supabaseBrowser } from "@/lib/supabase/client";
import { planLabel, type PlanLabel } from "./plan";
import { CreditBalance } from "../credits/CreditBalance";

type Who = { email: string; plan: PlanLabel } | "out" | null; // null while loading

/** The TopBar's account control: Sign in when signed out; email, plan and Sign out when signed in. */
export function AccountMenu() {
  const [who, setWho] = useState<Who>(null);

  useEffect(() => {
    const supabase = supabaseBrowser();
    let live = true;
    async function load() {
      const { data } = await supabase.auth.getUser();
      if (!live) return;
      if (!data.user) return setWho("out");
      // Read through the user's own row-level security.
      const { data: sub } = await supabase.from("subscriptions").select("plan,status,current_period_end").maybeSingle();
      if (live) setWho({ email: data.user.email ?? "Signed in", plan: planLabel(sub) });
    }
    void load();
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") setWho("out");
      else if (event === "SIGNED_IN") setTimeout(() => void load(), 0); // not inside the auth callback: it holds a lock
    });
    return () => {
      live = false;
      data.subscription.unsubscribe();
    };
  }, []);

  if (who === null) return <div className="h-8 w-20" aria-hidden />;
  if (who === "out") {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href="/sign-in">Sign in</Link>
      </Button>
    );
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Account menu">
          <UserRound />
          <span className="max-w-40 truncate">{who.email}</span>
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuLabel className="flex flex-col gap-1.5">
          <span className="truncate text-sm font-medium text-foreground">{who.email}</span>
          <Badge variant={who.plan === "Free" ? "secondary" : "default"} className="w-fit" data-testid="plan">
            {who.plan}
          </Badge>
          <CreditBalance />
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void supabaseBrowser().auth.signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
