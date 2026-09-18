"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

export function ProvedorDeTema({ nonce, children }: { nonce?: string; children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} nonce={nonce}>
      {children}
    </ThemeProvider>
  );
}
