"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Un query client por pestaña del navegador; se crea en el estado para que sobreviva a los re-renders, pero no a las recargas.
export default function Providers({ children }: { children: ReactNode }) {
  const [cliente] = useState(() => new QueryClient());
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}
