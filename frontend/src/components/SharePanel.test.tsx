import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import type { Share } from "../lib/api";
import { BASE, adminUser, makeUser } from "../test/handlers";
import { server } from "../test/server";
import { renderWithProviders } from "../test/utils";
import SharePanel from "./SharePanel";

function share(overrides: Partial<Share> = {}): Share {
  return {
    id: 1,
    user_id: 2,
    user_email: "bob@test.ro",
    can_edit: false,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("SharePanel", () => {
  it("nu randează nimic dacă utilizatorul nu poate gestiona resursa", () => {
    const { container } = renderWithProviders(
      <SharePanel resourceType="site" resourceId={1} canManage={false} />
    );
    expect(container.querySelector(".card")).toBeNull();
  });

  it("afișează utilizatorii cu care e deja partajat", async () => {
    server.use(
      http.get(`${BASE}/api/shares`, () =>
        HttpResponse.json([
          share({ id: 1, user_email: "bob@test.ro", can_edit: true }),
          share({ id: 2, user_id: 3, user_email: "ana@test.ro", can_edit: false }),
        ])
      )
    );
    renderWithProviders(
      <SharePanel resourceType="site" resourceId={1} canManage={true} />
    );
    expect(await screen.findByText("bob@test.ro")).toBeInTheDocument();
    expect(screen.getByText("ana@test.ro")).toBeInTheDocument();
  });

  it("adaugă un utilizator nou (POST cu payload corect → refetch)", async () => {
    const db: Share[] = [];
    let posted: any = null;
    server.use(
      http.get(`${BASE}/auth/users`, () =>
        HttpResponse.json([
          adminUser,
          makeUser({ id: 2, email: "bob@test.ro", full_name: "Bob" }),
        ])
      ),
      http.get(`${BASE}/api/shares`, () => HttpResponse.json(db)),
      http.post(`${BASE}/api/shares`, async ({ request }) => {
        posted = await request.json();
        const created = share({ id: 9, user_id: 2, user_email: "bob@test.ro", can_edit: true });
        db.push(created);
        return HttpResponse.json(created, { status: 201 });
      })
    );

    const { user } = renderWithProviders(
      <SharePanel
        resourceType="site"
        resourceId={7}
        ownerEmail="owner@test.ro"
        canManage={true}
      />
    );

    // Așteptăm ca opțiunea (din /auth/users) să apară în selector
    await screen.findByRole("option", { name: /Bob/ });
    const select = screen.getByLabelText("Alege utilizator");
    await user.selectOptions(select, "2");
    // bifează „Poate edita" din formularul de adăugare (ultimul checkbox e cel de adăugare)
    const addCheckbox = screen
      .getAllByRole("checkbox")
      .at(-1)!;
    await user.click(addCheckbox);
    await user.click(screen.getByRole("button", { name: /Adaugă/ }));

    await waitFor(() =>
      expect(posted).toEqual({
        resource_type: "site",
        resource_id: 7,
        user_id: 2,
        can_edit: true,
      })
    );
    expect(await screen.findByText("bob@test.ro")).toBeInTheDocument();
  });

  it("comută dreptul de editare (PATCH)", async () => {
    let patched: any = null;
    server.use(
      http.get(`${BASE}/api/shares`, () =>
        HttpResponse.json([share({ id: 5, user_email: "bob@test.ro", can_edit: false })])
      ),
      http.patch(`${BASE}/api/shares/5`, async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json(
          share({ id: 5, user_email: "bob@test.ro", can_edit: true })
        );
      })
    );

    const { user } = renderWithProviders(
      <SharePanel resourceType="link" resourceId={1} canManage={true} />
    );

    const row = await screen.findByTestId("share-5");
    const checkbox = within(row).getByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);

    await waitFor(() => expect(patched).toEqual({ can_edit: true }));
  });

  it("revocă o partajare (DELETE → dispare din listă)", async () => {
    const db: Share[] = [share({ id: 5, user_email: "bob@test.ro" })];
    let deletedId: string | null = null;
    server.use(
      http.get(`${BASE}/api/shares`, () => HttpResponse.json(db)),
      http.delete(`${BASE}/api/shares/:id`, ({ params }) => {
        deletedId = String(params.id);
        db.length = 0;
        return new HttpResponse(null, { status: 204 });
      })
    );

    const { user } = renderWithProviders(
      <SharePanel resourceType="site" resourceId={1} canManage={true} />
    );

    expect(await screen.findByText("bob@test.ro")).toBeInTheDocument();
    await user.click(
      screen.getByRole("button", { name: /Revocă accesul pentru bob@test.ro/ })
    );

    await waitFor(() => expect(deletedId).toBe("5"));
    await waitFor(() =>
      expect(screen.queryByText("bob@test.ro")).not.toBeInTheDocument()
    );
  });
});
