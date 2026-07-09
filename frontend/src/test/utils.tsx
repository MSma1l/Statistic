import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement, ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";
import { AuthProvider } from "../lib/auth";

/** QueryClient nou per test, cu retry dezactivat → teste deterministe. */
export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

interface Options extends Omit<RenderOptions, "wrapper"> {
  route?: string;
  routes?: string[];
  withAuth?: boolean;
  queryClient?: QueryClient;
}

/**
 * Randează `ui` înfășurat în providerii aplicației (QueryClient + MemoryRouter +
 * opțional AuthProvider). Întoarce și un `user` (userEvent) pregătit.
 */
export function renderWithProviders(ui: ReactElement, opts: Options = {}) {
  const {
    route = "/",
    routes = [route],
    withAuth = true,
    queryClient = makeQueryClient(),
    ...rest
  } = opts;

  function Wrapper({ children }: { children: ReactNode }) {
    const inner = withAuth ? <AuthProvider>{children}</AuthProvider> : children;
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter
          initialEntries={routes}
          initialIndex={routes.length - 1}
          future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
        >
          {inner}
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  return {
    user: userEvent.setup(),
    queryClient,
    ...render(ui, { wrapper: Wrapper, ...rest }),
  };
}
