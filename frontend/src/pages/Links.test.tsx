import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import type { TrackedLink } from "../lib/api";
import { BASE, makeUser } from "../test/handlers";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import Links from "./Links";

function link(overrides: Partial<TrackedLink> = {}): TrackedLink {
  return {
    id: 1,
    slug: "promo",
    destination_url: "https://exemplu.ro",
    name: "Campanie",
    description: "",
    location_label: "",
    kind: "link",
    logo_image_id: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    short_url: "https://scurt.ro/promo",
    qr_url: "https://scurt.ro/promo.qr",
    total_visits: 42,
    ...overrides,
  };
}

function asAdmin() {
  server.use(
    http.get(`${BASE}/auth/me`, () => HttpResponse.json(makeUser({ is_admin: true })))
  );
}

describe("Links", () => {
  it("afișează starea goală", async () => {
    asAdmin();
    server.use(http.get(`${BASE}/api/links`, () => HttpResponse.json([])));
    renderWithProviders(<Links />);
    expect(await screen.findByText(/Niciun link încă/)).toBeInTheDocument();
  });

  it("listează linkurile din API", async () => {
    asAdmin();
    server.use(
      http.get(`${BASE}/api/links`, () =>
        HttpResponse.json([
          link({ id: 1, name: "Link A", total_visits: 10 }),
          link({ id: 2, name: "QR B", kind: "qr", total_visits: 5 }),
        ])
      )
    );
    renderWithProviders(<Links />);
    expect(await screen.findByText("Link A")).toBeInTheDocument();
    expect(screen.getByText("QR B")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("afișează badge-uri în funcție de access", async () => {
    asAdmin();
    server.use(
      http.get(`${BASE}/api/links`, () =>
        HttpResponse.json([
          link({ id: 1, name: "Al meu", access: "owner", can_edit: true }),
          link({
            id: 2,
            name: "Ca admin",
            access: "admin",
            can_edit: true,
            owner_email: "vlad@test.ro",
          }),
          link({
            id: 3,
            name: "Partajat RO",
            access: "shared",
            can_edit: false,
            owner_email: "ana@test.ro",
          }),
        ])
      )
    );
    renderWithProviders(<Links />);

    expect(await screen.findByText("Al meu")).toBeInTheDocument();
    expect(screen.getByText("Al lui vlad@test.ro")).toBeInTheDocument();
    expect(screen.getByText("Partajat")).toBeInTheDocument();
    expect(screen.getByText("doar citire")).toBeInTheDocument();
  });

  it("butonul de creare e dezactivat fără slug + destinație (validare)", async () => {
    asAdmin();
    server.use(http.get(`${BASE}/api/links`, () => HttpResponse.json([])));
    const { user } = renderWithProviders(<Links />);
    await screen.findByText(/Niciun link încă/);

    await user.click(screen.getByRole("button", { name: /Creează/ }));
    const submit = () =>
      screen.getAllByRole("button", { name: /^Creează$/ }).at(-1)!;
    expect(submit()).toBeDisabled();

    await user.type(screen.getByPlaceholderText("promo-vara"), "slug-nou");
    expect(submit()).toBeDisabled(); // încă lipsește destinația

    await user.type(
      screen.getByPlaceholderText("https://exemplu.ro/pagina"),
      "https://dest.ro"
    );
    expect(submit()).toBeEnabled();
  });

  it("creează un link (POST cu payload corect → refetch)", async () => {
    asAdmin();
    const db: TrackedLink[] = [];
    let posted: any = null;
    server.use(
      http.get(`${BASE}/api/links`, () => HttpResponse.json(db)),
      http.post(`${BASE}/api/links`, async ({ request }) => {
        posted = await request.json();
        const created = link({ id: 99, name: "Făcut", slug: "slug-nou" });
        db.push(created);
        return HttpResponse.json(created);
      })
    );
    const { user } = renderWithProviders(<Links />);
    await screen.findByText(/Niciun link încă/);

    await user.click(screen.getByRole("button", { name: /Creează/ }));
    await user.type(screen.getByPlaceholderText("promo-vara"), "slug-nou");
    await user.type(
      screen.getByPlaceholderText("https://exemplu.ro/pagina"),
      "https://dest.ro"
    );
    await user.click(screen.getAllByRole("button", { name: /^Creează$/ }).at(-1)!);

    await waitFor(() => {
      expect(posted).toMatchObject({
        slug: "slug-nou",
        destination_url: "https://dest.ro",
      });
    });
    expect(await screen.findByText("Făcut")).toBeInTheDocument();
  });
});
