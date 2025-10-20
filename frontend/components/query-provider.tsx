"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import React, { useState } from "react"

const ReactQueryDevtoolsProduction = () => null

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            gcTime: 5 * 60 * 1000,
          },
        },
      })
  )

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {process.env.NODE_ENV === "development" && (
        <React.Suspense fallback={null}>
          <ReactQueryDevtoolsAsync />
        </React.Suspense>
      )}
    </QueryClientProvider>
  )
}

const ReactQueryDevtoolsAsync = React.lazy(() =>
  import("@tanstack/react-query-devtools").then((module) => ({
    default: module.ReactQueryDevtools,
  }))
)