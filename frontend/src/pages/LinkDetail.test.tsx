import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";
import { BASE, makeUser } from "../test/handlers";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import LinkDetail from "./LinkDetail";

function mockLinkDetail() {
  server.use(
    http.get(`${BASE}/api/links/1`, () =>
      HttpResponse.json({
        id: 1,
        slug: "promo",
        destination_url: "https://exemplu.ro",
        name: "Link Detaliu",
        description: "",
        location_label: "Afiș",
        kind: "link",
        logo_image_id: null,
        is_active: true,
        created_at: "2026-01-01T00:00:00Z",
        short_url: "https://scurt.ro/promo",
        qr_url: "https://scurt.ro/promo.qr",
        total_visits: 42,
      })
    ),
    http.get(`${BASE}/api/links/1/stats`, () =>
      HttpResponse.json({ total: 42, scans: 10, clicks: 32, timeseries: [] })
    ),
    http.get(`${BASE}/api/gallery`, () =>
      HttpResponse.json({ images: [], used_bytes: 0, limit_bytes: 100000 })
    )
  );
}

describe("LinkDetail (smoke)", () => {
  it("randează detaliile linkului cu date mock fără să crape", async () => {
    mockLinkDetail();
    renderWithProviders(
      <Routes>
        <Route path="/links/:id" element={<LinkDetail />} />
      </Routes>,
      { routes: ["/links/1"] }
    );

    expect(await screen.findByText("Link Detaliu")).toBeInTheDocument();
    expect(await screen.findByText("42")).toBeInTheDocument(); // total intrări
    expect(screen.getByText("Scanări QR")).toBeInTheDocument();
    expect(screen.getByText("QR Code")).toBeInTheDocument();
  });

  it("ascunde editarea și ștergerea pe un link partajat doar-citire", async () => {
    server.use(
      http.get(`${BASE}/auth/me`, () =>
        HttpResponse.json(makeUser({ id: 5, is_admin: false, email: "bob@test.ro" }))
      ),
      http.get(`${BASE}/api/links/1`, () =>
        HttpResponse.json({
          id: 1,
          slug: "promo",
          destination_url: "https://exemplu.ro",
          name: "Partajat",
          description: "",
          location_label: "",
          kind: "link",
          logo_image_id: null,
          is_active: true,
          created_at: "2026-01-01T00:00:00Z",
          short_url: "https://scurt.ro/promo",
          qr_url: "https://scurt.ro/promo.qr",
          total_visits: 5,
          access: "shared",
          can_edit: false,
          owner_email: "owner@test.ro",
        })
      ),
      http.get(`${BASE}/api/links/1/stats`, () =>
        HttpResponse.json({ total: 5, scans: 0, clicks: 5, timeseries: [] })
      ),
      http.get(`${BASE}/api/gallery`, () =>
        HttpResponse.json({ images: [], used_bytes: 0, limit_bytes: 100000 })
      )
    );

    renderWithProviders(
      <Routes>
        <Route path="/links/:id" element={<LinkDetail />} />
      </Routes>,
      { routes: ["/links/1"] }
    );

    expect(await screen.findByText("Partajat")).toBeInTheDocument();
    expect(screen.getByText(/doar de vizualizare/)).toBeInTheDocument();
    expect(screen.getByText(/Proprietar: owner@test.ro/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Salvează/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Șterge/ })).not.toBeInTheDocument();
  });
});
