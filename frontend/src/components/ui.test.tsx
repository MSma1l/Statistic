import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CopyButton, EmptyState, PageHeader, Spinner, StatCard } from "./ui";

describe("PageHeader", () => {
  it("afișează titlul, subtitlul și acțiunea", () => {
    render(
      <PageHeader
        title="Titlu"
        subtitle="Sub"
        action={<button>Acțiune</button>}
      />
    );
    expect(screen.getByRole("heading", { name: "Titlu" })).toBeInTheDocument();
    expect(screen.getByText("Sub")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acțiune" })).toBeInTheDocument();
  });
});

describe("StatCard", () => {
  it("afișează label și valoare", () => {
    render(<StatCard label="Vizite" value={42} />);
    expect(screen.getByText("Vizite")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});

describe("Spinner / EmptyState", () => {
  it("Spinner afișează textul de încărcare", () => {
    render(<Spinner />);
    expect(screen.getByText("Se încarcă…")).toBeInTheDocument();
  });
  it("EmptyState randează children", () => {
    render(<EmptyState>Nimic aici</EmptyState>);
    expect(screen.getByText("Nimic aici")).toBeInTheDocument();
  });
});

// navigator.clipboard e read-only în jsdom → îl definim cu defineProperty.
function stubClipboard(writeText: (v: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
}

describe("CopyButton", () => {
  it("copiază valoarea în clipboard și arată feedback", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    render(<CopyButton value="https://scurt.ro/x" label="Copiază link" />);
    const btn = screen.getByRole("button", { name: /Copiază link/ });
    await user.click(btn);

    expect(writeText).toHaveBeenCalledWith("https://scurt.ro/x");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Copiat!/ })).toBeInTheDocument()
    );
  });

  it("folosește label-ul implicit „Copiază” când nu e dat", () => {
    stubClipboard(vi.fn().mockResolvedValue(undefined));
    render(<CopyButton value="x" />);
    expect(screen.getByRole("button", { name: /Copiază/ })).toBeInTheDocument();
  });

  it("nu crapă dacă clipboard aruncă eroare", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockRejectedValue(new Error("nope"));
    stubClipboard(writeText);
    render(<CopyButton value="x" />);
    await user.click(screen.getByRole("button"));
    // rămâne în starea inițială, fără excepție
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /Copiază/ })).toBeInTheDocument();
  });
});
