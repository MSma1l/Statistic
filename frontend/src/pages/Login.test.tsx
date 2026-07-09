import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { getSavedAccounts } from "../lib/accounts";
import { BASE, makeUser } from "../test/handlers";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import Login from "./Login";

// Etichetele din Login nu sunt legate de input-uri (fără htmlFor/id), așa că le
// selectăm după tip.
function emailInput(c: HTMLElement) {
  return c.querySelector('input[type="email"]') as HTMLInputElement;
}
function pwInput(c: HTMLElement) {
  return c.querySelector('input[type="password"]') as HTMLInputElement;
}

// Login folosește useAuth().login → are nevoie de AuthProvider (inclus în util).
// AuthProvider face GET /auth/me la montare; îl lăsăm 401 ca să nu fie „logat".
function anon() {
  server.use(
    http.get(`${BASE}/auth/me`, () => new HttpResponse(null, { status: 401 }))
  );
}

describe("Login", () => {
  it("trimite credențialele la submit", async () => {
    anon();
    let received: unknown = null;
    server.use(
      http.post(`${BASE}/auth/login`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(makeUser());
      })
    );
    const { user, container } = renderWithProviders(<Login />, { withAuth: true });

    await user.type(emailInput(container), "a@test.ro");
    await user.type(pwInput(container), "parola123");
    await user.click(screen.getByRole("button", { name: /Autentificare/ }));

    await waitFor(() =>
      expect(received).toEqual({ email: "a@test.ro", password: "parola123" })
    );
  });

  it("afișează mesajul de eroare la 401", async () => {
    anon();
    server.use(
      http.post(`${BASE}/auth/login`, () =>
        HttpResponse.json({ detail: "Email sau parolă greșite" }, { status: 401 })
      )
    );
    const { user, container } = renderWithProviders(<Login />, { withAuth: true });

    await user.type(emailInput(container), "a@test.ro");
    await user.type(pwInput(container), "gresit");
    await user.click(screen.getByRole("button", { name: /Autentificare/ }));

    expect(
      await screen.findByText("Email sau parolă greșite")
    ).toBeInTheDocument();
  });

  it("„remember” salvează contul la login reușit", async () => {
    anon();
    server.use(
      http.post(`${BASE}/auth/login`, () => HttpResponse.json(makeUser()))
    );
    const { user, container } = renderWithProviders(<Login />, { withAuth: true });

    // checkbox-ul „ține minte” e bifat implicit
    await user.type(emailInput(container), "salvat@test.ro");
    await user.type(pwInput(container), "pw12345");
    await user.click(screen.getByRole("button", { name: /Autentificare/ }));

    await waitFor(() => {
      const saved = getSavedAccounts();
      expect(saved.map((a) => a.email)).toContain("salvat@test.ro");
    });
  });

  it("NU salvează contul dacă „remember” e debifat", async () => {
    anon();
    server.use(
      http.post(`${BASE}/auth/login`, () => HttpResponse.json(makeUser()))
    );
    const { user, container } = renderWithProviders(<Login />, { withAuth: true });

    await user.type(emailInput(container), "nesalvat@test.ro");
    await user.type(pwInput(container), "pw12345");
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /Autentificare/ }));

    await waitFor(() =>
      expect(screen.queryByText("Se autentifică…")).not.toBeInTheDocument()
    );
    expect(getSavedAccounts()).toHaveLength(0);
  });

  it("afișează conturile salvate pentru login rapid", async () => {
    anon();
    localStorage.setItem(
      "statistic_accounts",
      JSON.stringify([{ email: "rapid@test.ro", password: "x" }])
    );
    renderWithProviders(<Login />, { withAuth: true });
    expect(await screen.findByText("Conturi salvate")).toBeInTheDocument();
    expect(screen.getByText("rapid@test.ro")).toBeInTheDocument();
  });
});
