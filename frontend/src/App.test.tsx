import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import App from "./App";
import { BASE, adminUser, makeUser } from "./test/handlers";
import { server } from "./test/server";
import { renderWithProviders } from "./test/utils";

function anon() {
  server.use(
    http.get(`${BASE}/auth/me`, () => new HttpResponse(null, { status: 401 }))
  );
}
function loggedIn(overrides = {}) {
  server.use(
    http.get(`${BASE}/auth/me`, () => HttpResponse.json(makeUser(overrides)))
  );
}

describe("App — guards de rutare (neautentificat)", () => {
  it("redirecționează la /login când nu ești logat", async () => {
    anon();
    renderWithProviders(<App />, { withAuth: true, routes: ["/"] });
    expect(await screen.findByText("Analytics & Tracking")).toBeInTheDocument();
  });

  it("orice rută protejată → /login cât timp ești anonim", async () => {
    anon();
    renderWithProviders(<App />, { withAuth: true, routes: ["/sites"] });
    expect(await screen.findByText("Analytics & Tracking")).toBeInTheDocument();
  });
});

describe("App — guards de rutare (autentificat)", () => {
  it("adminul vede Dashboard-ul pe „/”", async () => {
    loggedIn(adminUser);
    renderWithProviders(<App />, { withAuth: true, routes: ["/"] });
    expect(await screen.findByText(/Salut,/)).toBeInTheDocument();
  });

  it("adminul poate accesa /sites", async () => {
    loggedIn(adminUser);
    renderWithProviders(<App />, { withAuth: true, routes: ["/sites"] });
    // „Site-uri (Pixel)” apare și în nav și în titlu → țintim titlul (heading).
    expect(
      await screen.findByRole("heading", { name: "Site-uri (Pixel)" })
    ).toBeInTheDocument();
  });

  it("user fără can_sites e redirecționat de la /sites la Dashboard", async () => {
    loggedIn({
      is_admin: false,
      can_sites: false,
      can_links: true,
      can_qr: false,
    });
    renderWithProviders(<App />, { withAuth: true, routes: ["/sites"] });
    // Nu ajunge pe pagina Sites; „*” → Navigate „/” → Dashboard
    expect(await screen.findByText(/Salut,/)).toBeInTheDocument();
    expect(screen.queryByText("Site-uri (Pixel)")).not.toBeInTheDocument();
  });

  it("non-adminul e redirecționat de la /settings la Dashboard", async () => {
    loggedIn({
      is_admin: false,
      can_sites: true,
      can_links: true,
      can_qr: true,
    });
    renderWithProviders(<App />, { withAuth: true, routes: ["/settings"] });
    expect(await screen.findByText(/Salut,/)).toBeInTheDocument();
  });

  it("adminul poate accesa /settings (Utilizatori)", async () => {
    loggedIn(adminUser);
    renderWithProviders(<App />, { withAuth: true, routes: ["/settings"] });
    expect(
      await screen.findByRole("heading", { name: "Utilizatori" })
    ).toBeInTheDocument();
  });
});
