import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import type { User } from "../lib/api";
import { BASE, makeUser } from "../test/handlers";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import Layout from "./Layout";

async function renderLayoutAs(overrides: Partial<User>) {
  server.use(
    http.get(`${BASE}/auth/me`, () => HttpResponse.json(makeUser(overrides)))
  );
  const utils = renderWithProviders(<Layout />);
  // Așteaptă ca shell-ul (numele appului) să apară după rezolvarea /auth/me.
  await screen.findByText("Statistic");
  return utils;
}

function nav() {
  return screen.getByRole("navigation");
}

describe("Layout — navigație pe permisiuni", () => {
  it("adminul vede toate secțiunile inclusiv „Utilizatori”", async () => {
    await renderLayoutAs({ is_admin: true });
    const n = within(nav());
    expect(n.getByText("Tablou de bord")).toBeInTheDocument();
    expect(n.getByText(/Site-uri/)).toBeInTheDocument();
    expect(n.getByText(/Linkuri & QR/)).toBeInTheDocument();
    expect(n.getByText("Galerie")).toBeInTheDocument();
    expect(n.getByText("Utilizatori")).toBeInTheDocument();
  });

  it("user doar cu can_sites vede Site-uri, dar nu Linkuri/Galerie/Utilizatori", async () => {
    await renderLayoutAs({
      is_admin: false,
      can_sites: true,
      can_links: false,
      can_qr: false,
    });
    const n = within(nav());
    expect(n.getByText(/Site-uri/)).toBeInTheDocument();
    expect(n.queryByText(/Linkuri & QR/)).not.toBeInTheDocument();
    expect(n.queryByText("Galerie")).not.toBeInTheDocument();
    expect(n.queryByText("Utilizatori")).not.toBeInTheDocument();
  });

  it("user cu can_qr vede zona Linkuri & Galerie, dar nu Site-uri", async () => {
    await renderLayoutAs({
      is_admin: false,
      can_sites: false,
      can_links: false,
      can_qr: true,
    });
    const n = within(nav());
    expect(n.getByText(/Linkuri & QR/)).toBeInTheDocument();
    expect(n.getByText("Galerie")).toBeInTheDocument();
    expect(n.queryByText(/Site-uri/)).not.toBeInTheDocument();
    expect(n.queryByText("Utilizatori")).not.toBeInTheDocument();
  });

  it("non-adminul nu vede „Utilizatori”", async () => {
    await renderLayoutAs({ is_admin: false, can_links: true });
    expect(within(nav()).queryByText("Utilizatori")).not.toBeInTheDocument();
  });

  it("afișează emailul utilizatorului și butonul de delogare", async () => {
    await renderLayoutAs({ email: "cine@test.ro", full_name: "Cine Va" });
    expect(screen.getByText("Cine Va")).toBeInTheDocument();
    expect(screen.getByText("cine@test.ro")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Delogare/ })).toBeInTheDocument();
  });
});

describe("Layout — comutare conturi salvate", () => {
  it("arată butonul „Schimbă cont” dacă există alt cont salvat", async () => {
    localStorage.setItem(
      "statistic_accounts",
      JSON.stringify([{ email: "altul@test.ro", password: "x" }])
    );
    await renderLayoutAs({ email: "eu@test.ro" });
    await waitFor(() =>
      expect(screen.getByText(/Schimbă cont/)).toBeInTheDocument()
    );
  });
});
