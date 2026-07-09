import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { BASE, makeUser } from "../test/handlers";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import Dashboard from "./Dashboard";

function asUser(overrides = {}) {
  server.use(
    http.get(`${BASE}/auth/me`, () => HttpResponse.json(makeUser(overrides)))
  );
}

describe("Dashboard", () => {
  it("randează KPI-urile Pixel din datele mock", async () => {
    asUser({ is_admin: true });
    server.use(
      http.get(`${BASE}/api/analytics/overview`, () =>
        HttpResponse.json({
          sites_count: 3,
          pageviews: 1234,
          clicks: 56,
          visitors: 789,
          sessions: 40,
          top_sites: [
            { id: 1, name: "Site A", domain: "a.ro", views: 500 },
          ],
          top_pages: [],
          timeseries: [{ day: "2026-07-01", pageviews: 10, clicks: 2 }],
        })
      )
    );

    const { user } = renderWithProviders(<Dashboard />);

    // Dashboard e montat direct (fără gate-ul de loading din App), așa că tabul
    // inițial poate fi „links”. Selectăm explicit „Pixel”.
    await user.click(await screen.findByRole("button", { name: /Pixel/ }));

    expect(await screen.findByText("1234")).toBeInTheDocument();
    expect(screen.getByText("789")).toBeInTheDocument();
    expect(screen.getByText("Vizualizări")).toBeInTheDocument();
    // Site de top apare în listă
    await waitFor(() => expect(screen.getByText("Site A")).toBeInTheDocument());
  });

  it("afișează taburile Pixel și Linkuri pentru admin", async () => {
    asUser({ is_admin: true });
    renderWithProviders(<Dashboard />);
    expect(await screen.findByRole("button", { name: /Pixel/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Linkuri & QR/ })).toBeInTheDocument();
  });

  it("comută pe tabul Linkuri și afișează KPI-urile de linkuri", async () => {
    asUser({ is_admin: true });
    server.use(
      http.get(`${BASE}/api/links/overview`, () =>
        HttpResponse.json({
          links_count: 7,
          total: 99,
          scans: 20,
          clicks: 79,
          top_links: [],
          top_qr: [],
          by_location: [{ location: "Chișinău", count: 12 }],
          timeseries: [],
        })
      )
    );
    const { user } = renderWithProviders(<Dashboard />);

    await user.click(await screen.findByRole("button", { name: /Linkuri & QR/ }));
    expect(await screen.findByText("7")).toBeInTheDocument();
    expect(screen.getByText("Chișinău")).toBeInTheDocument();
  });

  it("un user doar cu linkuri nu vede taburile multiple (fără Pixel)", async () => {
    asUser({ is_admin: false, can_sites: false, can_links: true, can_qr: false });
    renderWithProviders(<Dashboard />);
    // Titlul de salut apare
    expect(await screen.findByText(/Salut,/)).toBeInTheDocument();
    // Nu există buton de tab „Pixel”
    expect(screen.queryByRole("button", { name: /Pixel/ })).not.toBeInTheDocument();
  });
});
