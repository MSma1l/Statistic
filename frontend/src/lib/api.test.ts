import { afterEach, describe, expect, it, vi } from "vitest";
import {
  api,
  API_URL,
  can,
  canLinksArea,
  extractError,
  formatBytes,
  formatDuration,
  type User,
} from "./api";
import { makeUser } from "../test/handlers";

describe("lib/api — instanța axios", () => {
  it("are baseURL-ul de fallback local când VITE_API_URL nu e setat", () => {
    expect(API_URL).toBe("http://localhost:8000");
    expect(api.defaults.baseURL).toBe("http://localhost:8000");
  });

  it("trimite cookie-urile (withCredentials)", () => {
    expect(api.defaults.withCredentials).toBe(true);
  });
});

describe("lib/api — API_URL în funcție de VITE_API_URL", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("string GOL → same-origin (rămâne gol, nu cade pe fallback)", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_URL", "");
    const mod = await import("./api");
    expect(mod.API_URL).toBe("");
    expect(mod.api.defaults.baseURL).toBe("");
  });

  it("string setat → URL absolut", async () => {
    vi.resetModules();
    vi.stubEnv("VITE_API_URL", "https://api.exemplu.ro");
    const mod = await import("./api");
    expect(mod.API_URL).toBe("https://api.exemplu.ro");
    expect(mod.api.defaults.baseURL).toBe("https://api.exemplu.ro");
  });
});

describe("can / canLinksArea", () => {
  const base: User = makeUser({
    is_admin: false,
    can_sites: false,
    can_links: false,
    can_qr: false,
  });

  it("întoarce false pentru user null", () => {
    expect(can(null, "sites")).toBe(false);
    expect(canLinksArea(null)).toBe(false);
  });

  it("adminul are toate capabilitățile", () => {
    const admin = makeUser({ is_admin: true });
    expect(can(admin, "sites")).toBe(true);
    expect(can(admin, "links")).toBe(true);
    expect(can(admin, "qr")).toBe(true);
    expect(canLinksArea(admin)).toBe(true);
  });

  it("respectă flagurile individuale", () => {
    expect(can({ ...base, can_sites: true }, "sites")).toBe(true);
    expect(can({ ...base, can_links: true }, "links")).toBe(true);
    expect(can({ ...base, can_qr: true }, "qr")).toBe(true);
    expect(can(base, "sites")).toBe(false);
  });

  it("canLinksArea e adevărat dacă are links SAU qr", () => {
    expect(canLinksArea({ ...base, can_links: true })).toBe(true);
    expect(canLinksArea({ ...base, can_qr: true })).toBe(true);
    expect(canLinksArea(base)).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formatează bytes / KB / MB", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.00 MB");
  });
});

describe("formatDuration", () => {
  it("secunde", () => expect(formatDuration(45)).toBe("45s"));
  it("minute + secunde", () => expect(formatDuration(83)).toBe("1m 23s"));
  it("minute exacte", () => expect(formatDuration(120)).toBe("2m"));
  it("ore + minute", () => expect(formatDuration(7500)).toBe("2h 5m"));
  it("negativ → 0s", () => expect(formatDuration(-10)).toBe("0s"));
});

describe("extractError", () => {
  it("extrage detail-ul string dintr-o eroare axios", () => {
    const err = { isAxiosError: true, response: { data: { detail: "Email invalid" } } };
    expect(extractError(err)).toBe("Email invalid");
  });

  it("extrage primul mesaj dintr-un detail de tip listă (validare FastAPI)", () => {
    const err = {
      isAxiosError: true,
      response: { data: { detail: [{ msg: "field required" }] } },
    };
    expect(extractError(err)).toBe("field required");
  });

  it("folosește fallback-ul pentru erori non-axios", () => {
    expect(extractError(new Error("boom"))).toBe("A apărut o eroare");
    expect(extractError(new Error("boom"), "custom")).toBe("custom");
  });

  it("folosește fallback-ul când eroarea axios nu are detail", () => {
    const err = { isAxiosError: true, response: { data: {} } };
    expect(extractError(err, "fallback-ul")).toBe("fallback-ul");
  });
});
