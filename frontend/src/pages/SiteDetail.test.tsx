import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";
import { BASE, makeUser } from "../test/handlers";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import SiteDetail from "./SiteDetail";

function mockSiteDetail(siteOverrides: Record<string, unknown> = {}) {
  server.use(
    http.get(`${BASE}/api/sites/1`, () =>
      HttpResponse.json({
        id: 1,
        site_key: "key123456789",
        name: "Site Detaliu",
        domain: "detaliu.ro",
        min_engagement_seconds: 5,
        created_at: "2026-01-01T00:00:00Z",
        snippet: "<script src='track.js'></script>",
        ...siteOverrides,
      })
    ),
    http.get(`${BASE}/api/analytics/1/summary`, () =>
      HttpResponse.json({
        pageviews: 100,
        visitors: 50,
        sessions: 30,
        clicks: 12,
        avg_seconds: 42,
        bounce_rate: 20,
      })
    ),
    http.get(`${BASE}/api/analytics/1/timeseries`, () => HttpResponse.json([])),
    http.get(`${BASE}/api/analytics/1/top-pages`, () => HttpResponse.json([])),
    http.get(`${BASE}/api/analytics/1/top-elements`, () => HttpResponse.json([])),
    http.get(`${BASE}/api/analytics/1/breakdown`, () =>
      HttpResponse.json({ referrers: [], devices: [] })
    ),
    http.get(`${BASE}/api/analytics/1/paths`, () => HttpResponse.json([])),
    http.get(`${BASE}/api/analytics/1/sessions`, () => HttpResponse.json([])),
    http.get(`${BASE}/api/analytics/1/engagement`, () => HttpResponse.json([])),
    http.get(`${BASE}/api/analytics/1/campaigns`, () => HttpResponse.json([]))
  );
}

describe("SiteDetail (smoke)", () => {
  it("randează detaliile site-ului cu date mock fără să crape", async () => {
    mockSiteDetail();
    renderWithProviders(
      <Routes>
        <Route path="/sites/:id" element={<SiteDetail />} />
      </Routes>,
      { routes: ["/sites/1"] }
    );

    expect(await screen.findByText("Site Detaliu")).toBeInTheDocument();
    expect(screen.getByText(/Cod de instalare/)).toBeInTheDocument();
    // KPI-urile din summary
    expect(await screen.findByText("100")).toBeInTheDocument();
    expect(screen.getByText("Bounce rate")).toBeInTheDocument();
  });

  it("ascunde editarea și ștergerea pe un site partajat doar-citire", async () => {
    server.use(
      http.get(`${BASE}/auth/me`, () =>
        HttpResponse.json(makeUser({ id: 5, is_admin: false, email: "bob@test.ro" }))
      )
    );
    mockSiteDetail({
      name: "Partajat",
      access: "shared",
      can_edit: false,
      owner_email: "owner@test.ro",
    });

    renderWithProviders(
      <Routes>
        <Route path="/sites/:id" element={<SiteDetail />} />
      </Routes>,
      { routes: ["/sites/1"] }
    );

    expect(await screen.findByText("Partajat")).toBeInTheDocument();
    expect(screen.getByText(/Proprietar: owner@test.ro/)).toBeInTheDocument();
    // fără creion de editare
    expect(
      screen.queryByRole("button", { name: /Editează/ })
    ).not.toBeInTheDocument();
    // panoul de partajare nu apare (nu poate gestiona)
    expect(screen.queryByText("Partajează")).not.toBeInTheDocument();
  });
});
