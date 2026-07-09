import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { BASE, adminUser, makeUser } from "../test/handlers";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import Settings from "./Settings";

function asAdmin() {
  server.use(http.get(`${BASE}/auth/me`, () => HttpResponse.json(adminUser)));
}

const other = makeUser({
  id: 2,
  email: "user2@test.ro",
  full_name: "User Doi",
  is_admin: false,
  can_sites: true,
  can_links: false,
  can_qr: false,
});

describe("Settings (doar admin)", () => {
  it("listează utilizatorii cu badge-uri de permisiuni", async () => {
    asAdmin();
    server.use(
      http.get(`${BASE}/auth/users`, () =>
        HttpResponse.json([adminUser, other])
      )
    );
    renderWithProviders(<Settings />);
    expect(await screen.findByText("Admin Test")).toBeInTheDocument();
    expect(screen.getByText("User Doi")).toBeInTheDocument();
    expect(screen.getByText("admin")).toBeInTheDocument();
    expect(screen.getByText("site")).toBeInTheDocument();
  });

  it("dezactivează „Creează” dacă parola are sub 6 caractere", async () => {
    asAdmin();
    server.use(http.get(`${BASE}/auth/users`, () => HttpResponse.json([adminUser])));
    const { user, container } = renderWithProviders(<Settings />);
    await screen.findByText("Admin Test");

    await user.click(screen.getByRole("button", { name: /Utilizator nou/ }));
    const inputs = container.querySelectorAll("input.input");
    const emailInput = inputs[0] as HTMLInputElement;
    const pwInput = container.querySelector(
      'input[type="password"]'
    ) as HTMLInputElement;

    await user.type(emailInput, "nou@test.ro");
    await user.type(pwInput, "123"); // prea scurt
    expect(screen.getByRole("button", { name: /^Creează$/ })).toBeDisabled();

    await user.type(pwInput, "456"); // acum 6 caractere
    expect(screen.getByRole("button", { name: /^Creează$/ })).toBeEnabled();
  });

  it("creează un utilizator cu permisiuni (POST include flagurile)", async () => {
    asAdmin();
    const db = [adminUser];
    let posted: any = null;
    server.use(
      http.get(`${BASE}/auth/users`, () => HttpResponse.json(db)),
      http.post(`${BASE}/auth/users`, async ({ request }) => {
        posted = await request.json();
        const created = makeUser({ id: 3, email: posted.email, is_admin: false });
        db.push(created);
        return HttpResponse.json(created);
      })
    );
    const { user, container } = renderWithProviders(<Settings />);
    await screen.findByText("Admin Test");

    await user.click(screen.getByRole("button", { name: /Utilizator nou/ }));
    const inputs = container.querySelectorAll("input.input");
    await user.type(inputs[0] as HTMLInputElement, "creat@test.ro");
    await user.type(
      container.querySelector('input[type="password"]') as HTMLInputElement,
      "parola123"
    );
    await user.click(screen.getByRole("button", { name: /^Creează$/ }));

    await waitFor(() => {
      expect(posted).toMatchObject({
        email: "creat@test.ro",
        password: "parola123",
        can_sites: true,
        can_links: true,
        can_qr: true,
        is_admin: false,
      });
    });
  });

  it("editează permisiunile altui utilizator (PATCH)", async () => {
    asAdmin();
    let patched: any = null;
    server.use(
      http.get(`${BASE}/auth/users`, () =>
        HttpResponse.json([adminUser, other])
      ),
      http.patch(`${BASE}/auth/users/2`, async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({ ok: true });
      })
    );
    const { user } = renderWithProviders(<Settings />);
    await screen.findByText("User Doi");

    // Adminul nu are buton de editare pentru sine → butonul aparține lui user2
    await user.click(screen.getByRole("button", { name: /Permisiuni/ }));
    // Activează „QR coduri”
    await user.click(screen.getByLabelText("QR coduri"));
    await user.click(
      screen.getByRole("button", { name: /Salvează permisiunile/ })
    );

    await waitFor(() => expect(patched).not.toBeNull());
    expect(patched).toMatchObject({ can_qr: true, can_sites: true });
  });
});
