import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../test/utils";
import { BASE, makeUser } from "../test/handlers";
import { server } from "../test/server";
import { AuthProvider, useAuth } from "./auth";

function Consumer() {
  const { user, loading, login, logout } = useAuth();
  if (loading) return <div>loading</div>;
  return (
    <div>
      <div data-testid="user">{user ? user.email : "anon"}</div>
      <button onClick={() => login("x@test.ro", "pw")}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  );
}

describe("AuthProvider", () => {
  it("trece din loading în user după GET /auth/me", async () => {
    server.use(
      http.get(`${BASE}/auth/me`, () =>
        HttpResponse.json(makeUser({ email: "me@test.ro" }))
      )
    );
    renderWithProviders(<Consumer />);
    expect(screen.getByText("loading")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("me@test.ro")
    );
  });

  it("rămâne anonim când /auth/me întoarce 401", async () => {
    server.use(
      http.get(`${BASE}/auth/me`, () => new HttpResponse(null, { status: 401 }))
    );
    renderWithProviders(<Consumer />);
    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("anon")
    );
  });

  it("login setează userul", async () => {
    server.use(
      http.get(`${BASE}/auth/me`, () => new HttpResponse(null, { status: 401 })),
      http.post(`${BASE}/auth/login`, () =>
        HttpResponse.json(makeUser({ email: "logat@test.ro" }))
      )
    );
    const { user } = renderWithProviders(<Consumer />);
    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("anon")
    );
    await user.click(screen.getByText("login"));
    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("logat@test.ro")
    );
  });

  it("logout curăță userul", async () => {
    server.use(http.post(`${BASE}/auth/logout`, () => HttpResponse.json({})));
    const { user } = renderWithProviders(<Consumer />);
    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("admin@test.ro")
    );
    await user.click(screen.getByText("logout"));
    await waitFor(() =>
      expect(screen.getByTestId("user")).toHaveTextContent("anon")
    );
  });

  it("useAuth aruncă eroare în afara AuthProvider", () => {
    function Bad() {
      useAuth();
      return null;
    }
    // Suprimăm zgomotul erorii React din consolă.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderWithProviders(<Bad />, { withAuth: false })).toThrow(
      /AuthProvider/
    );
    spy.mockRestore();
  });
});

// Verificăm și că AuthProvider poate fi importat/instanțiat direct (fără util).
describe("AuthProvider (montare directă)", () => {
  it("randează children", async () => {
    renderWithProviders(
      <AuthProvider>
        <span>copil</span>
      </AuthProvider>,
      { withAuth: false }
    );
    expect(await screen.findByText("copil")).toBeInTheDocument();
  });
});
