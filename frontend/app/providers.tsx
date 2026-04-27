"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 8_000,
            retry: 1,
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster
        richColors
        closeButton
        position="top-right"
        toastOptions={{
          duration: 3600,
          classNames: {
            toast: "rounded-2xl border-slate-200 shadow-xl",
            title: "font-semibold",
            description: "text-slate-500",
          },
        }}
      />
    </QueryClientProvider>
  );
}
