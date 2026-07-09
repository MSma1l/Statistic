import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { Route, Routes } from "react-router-dom";
import { BASE } from "../test/handlers";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import SiteDetail from "./SiteDetail";

function mockSiteDetail() {
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
      { withAuth: false, routes: ["/sites/1"] }
    );

    expect(await screen.findByText("Site Detaliu")).toBeInTheDocument();
    expect(screen.getByText(/Cod de instalare/)).toBeInTheDocument();
    // KPI-urile din summary
    expect(await screen.findByText("100")).toBeInTheDocument();
    expect(screen.getByText("Bounce rate")).toBeInTheDocument();
  });
});
