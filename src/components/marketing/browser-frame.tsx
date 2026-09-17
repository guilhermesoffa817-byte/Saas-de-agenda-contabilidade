// src/components/marketing/browser-frame.tsx
import type { ReactNode } from "react";

export function BrowserFrame({ children, url = "app.alicerce.com.br" }: { children: ReactNode; url?: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/10">
      <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-3">
        <div className="flex gap-1.5" aria-hidden>
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
          <span className="size-2.5 rounded-full bg-border" />
        </div>
        <div className="mx-auto w-full max-w-xs truncate rounded-md bg-background px-3 py-1 text-center text-xs text-muted-foreground">
          {url}
        </div>
      </div>
      <div className="pointer-events-none select-none" inert>
        {children}
      </div>
    </div>
  );
}
