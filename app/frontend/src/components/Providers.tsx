"use client";

import { ReactNode } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <TooltipProvider delayDuration={150} skipDelayDuration={300}>
      {children}
      <Toaster position="top-right" richColors closeButton />
    </TooltipProvider>
  );
}
