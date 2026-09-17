import type { ReactNode } from "react";

import { CabecalhoMarketing } from "@/components/marketing/cabecalho";
import { RodapeMarketing } from "@/components/marketing/rodape";
import { SmoothScroll } from "@/components/marketing/smooth-scroll";

export default function LayoutMarketing({ children }: { children: ReactNode }) {
  return (
    <SmoothScroll>
      <div className="tema-papel flex min-h-dvh flex-col bg-background text-foreground">
        <CabecalhoMarketing />
        <main className="flex-1">{children}</main>
        <RodapeMarketing />
      </div>
    </SmoothScroll>
  );
}
