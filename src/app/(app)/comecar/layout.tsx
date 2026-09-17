import type { ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";

export default function LayoutComecar({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-secondary/40">
      {children}
      <Toaster position="top-center" />
    </div>
  );
}
