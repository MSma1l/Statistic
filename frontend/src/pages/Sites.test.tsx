import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import type { Site } from "../lib/api";
import { BASE } from "../test/handlers";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import Sites from "./Sites";

function site(overrides: Partial<Site> = {}): Site {
  return {
    id: 1,
    site_key: "abcdef123456xyz",
    name: "Site Test",
    domain: "test.ro",
    min_engagement_seconds: 5,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("Sites", () => {
  it("afișează starea goală când nu sunt site-uri", async () => {
    server.use(http.get(`${BASE}/api/sites`, () => HttpResponse.json([])));
    renderWithProviders(<Sites />, { withAuth: false });
    expect(
      await screen.findByText(/Niciun site încă/)
    ).toBeInTheDocument();
  });

  it("listează site-urile din API", async () => {
    server.use(
      http.get(`${BASE}/api/sites`, () =>
        HttpResponse.json([
          site({ id: 1, name: "Alpha" }),
          site({ id: 2, name: "Beta", domain: "beta.ro" }),
        ])
      )
    );
    renderWithProviders(<Sites />, { withAuth: false });
    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("creează un site nou (form → POST → refetch)", async () => {
    const db: Site[] = [];
    let posted: unknown = null;
    server.use(
      http.get(`${BASE}/api/sites`, () => HttpResponse.json(db)),
      http.post(`${BASE}/api/sites`, async ({ request }) => {
        posted = await request.json();
        const created = site({ id: 10, name: "Nou creat", domain: "nou.ro" });
        db.push(created);
        return HttpResponse.json(created);
      })
    );

    const { user } = renderWithProviders(<Sites />, { withAuth: false });
    await screen.findByText(/Niciun site încă/);

    await user.click(screen.getByRole("button", { name: /Site nou/ }));
    await user.type(screen.getByPlaceholderText("Site-ul meu"), "Nou creat");
    await user.type(screen.getByPlaceholderText("exemplu.ro"), "nou.ro");
    await user.click(screen.getByRole("button", { name: /^Creează$/ }));

    await waitFor(() =>
      expect(posted).toEqual({ name: "Nou creat", domain: "nou.ro" })
    );
    expect(await screen.findByText("Nou creat")).toBeInTheDocument();
  });

  it("butonul Creează e dezactivat fără nume", async () => {
    server.use(http.get(`${BASE}/api/sites`, () => HttpResponse.json([])));
    const { user } = renderWithProviders(<Sites />, { withAuth: false });
    await screen.findByText(/Niciun site încă/);
    await user.click(screen.getByRole("button", { name: /Site nou/ }));
    expect(screen.getByRole("button", { name: /^Creează$/ })).toBeDisabled();
  });

  it("afișează badge-uri în funcție de access", async () => {
    server.use(
      http.get(`${BASE}/api/sites`, () =>
        HttpResponse.json([
          site({ id: 1, name: "Al meu", access: "owner", can_edit: true }),
          site({
            id: 2,
            name: "Ca admin",
            access: "admin",
            can_edit: true,
            owner_email: "vlad@test.ro",
          }),
          site({
            id: 3,
            name: "Partajat RO",
            access: "shared",
            can_edit: false,
            owner_email: "ana@test.ro",
          }),
        ])
      )
    );
    renderWithProviders(<Sites />, { withAuth: false });

    // owner → fără badge
    expect(await screen.findByText("Al meu")).toBeInTheDocument();
    // admin → „Al lui {owner_email}"
    expect(screen.getByText("Al lui vlad@test.ro")).toBeInTheDocument();
    // shared fără can_edit → „Partajat" + „doar citire"
    expect(screen.getByText("Partajat")).toBeInTheDocument();
    expect(screen.getByText("doar citire")).toBeInTheDocument();
  });

  it("afișează eroarea de la server la creare eșuată", async () => {
    server.use(
      http.get(`${BASE}/api/sites`, () => HttpResponse.json([])),
      http.post(`${BASE}/api/sites`, () =>
        HttpResponse.json({ detail: "Nume deja folosit" }, { status: 400 })
      )
    );
    const { user } = renderWithProviders(<Sites />, { withAuth: false });
    await screen.findByText(/Niciun site încă/);
    await user.click(screen.getByRole("button", { name: /Site nou/ }));
    await user.type(screen.getByPlaceholderText("Site-ul meu"), "X");
    await user.click(screen.getByRole("button", { name: /^Creează$/ }));
    expect(await screen.findByText("Nume deja folosit")).toBeInTheDocument();
  });
});
