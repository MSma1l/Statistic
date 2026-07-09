import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import type { GalleryImage } from "../lib/api";
import { BASE } from "../test/handlers";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import Gallery from "./Gallery";

function img(overrides: Partial<GalleryImage> = {}): GalleryImage {
  return {
    id: 1,
    filename: "logo.png",
    content_type: "image/png",
    size_bytes: 2048,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("Gallery", () => {
  it("afișează bara de spațiu folosit / limită", async () => {
    server.use(
      http.get(`${BASE}/api/gallery`, () =>
        HttpResponse.json({
          images: [],
          used_bytes: 1024 * 1024,
          limit_bytes: 25 * 1024 * 1024,
        })
      )
    );
    renderWithProviders(<Gallery />, { withAuth: false });
    expect(
      await screen.findByText("1.00 MB / 25.00 MB")
    ).toBeInTheDocument();
  });

  it("afișează starea goală când nu sunt imagini", async () => {
    server.use(
      http.get(`${BASE}/api/gallery`, () =>
        HttpResponse.json({ images: [], used_bytes: 0, limit_bytes: 100 })
      )
    );
    renderWithProviders(<Gallery />, { withAuth: false });
    expect(await screen.findByText(/Nicio imagine încă/)).toBeInTheDocument();
  });

  it("listează imaginile din galerie", async () => {
    server.use(
      http.get(`${BASE}/api/gallery`, () =>
        HttpResponse.json({
          images: [img({ id: 1, filename: "unu.png" }), img({ id: 2, filename: "doi.jpg" })],
          used_bytes: 4096,
          limit_bytes: 100000,
        })
      )
    );
    renderWithProviders(<Gallery />, { withAuth: false });
    expect(await screen.findByText("unu.png")).toBeInTheDocument();
    expect(screen.getByText("doi.jpg")).toBeInTheDocument();
  });

  it("încarcă o imagine (upload → POST → refetch)", async () => {
    const db: GalleryImage[] = [];
    let uploaded = false;
    server.use(
      http.get(`${BASE}/api/gallery`, () =>
        HttpResponse.json({ images: db, used_bytes: 0, limit_bytes: 100000 })
      ),
      http.post(`${BASE}/api/gallery`, () => {
        uploaded = true;
        db.push(img({ id: 5, filename: "urcat.png" }));
        return HttpResponse.json(img({ id: 5, filename: "urcat.png" }));
      })
    );

    const { user, container } = renderWithProviders(<Gallery />, { withAuth: false });
    await screen.findByText(/Nicio imagine încă/);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["x"], "urcat.png", { type: "image/png" });
    await user.upload(input, file);

    await waitFor(() => expect(uploaded).toBe(true));
    expect(await screen.findByText("urcat.png")).toBeInTheDocument();
  });

  it("bara devine roșie peste 90% (verificăm doar că randează fără să crape)", async () => {
    server.use(
      http.get(`${BASE}/api/gallery`, () =>
        HttpResponse.json({ images: [], used_bytes: 95, limit_bytes: 100 })
      )
    );
    renderWithProviders(<Gallery />, { withAuth: false });
    expect(await screen.findByText("95 B / 100 B")).toBeInTheDocument();
  });
});
