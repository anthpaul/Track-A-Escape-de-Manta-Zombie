"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// One query client per browser tab; created in state so it survives re-renders but not reloads.
export default function Providers({ children }: { children: ReactNode }) {
  const [cliente] = useState(() => new QueryClient());
  return <QueryClientProvider client={cliente}>{children}</QueryClientProvider>;
}
