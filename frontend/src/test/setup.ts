import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { api } from "../lib/api";
import { server } from "./server";

// Sub jsdom, adapterul XHR al axios + MSW se blochează la cereri cu FormData
// (upload). Forțăm adapterul „http” (Node), pe care interceptorul MSW îl
// gestionează fiabil, inclusiv multipart. Doar în teste.
api.defaults.adapter = "http";

// Lanțul AuthProvider (/auth/me) → query-uri pagină prin MSW+axios poate depăși
// timeout-ul implicit de 1000ms. Îl mărim ca testele să fie stabile.
configure({ asyncUtilTimeout: 5000 });

// jsdom nu implementează ResizeObserver, de care recharts ResponsiveContainer
// are nevoie. Îl poliumplem cu un no-op ca să nu crape graficele.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver =
  globalThis.ResizeObserver || (ResizeObserverStub as never);

// Pornim serverul MSW pentru toate testele. `error` la request-uri neacoperite
// ne prinde apelurile de rețea neintenționate.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
});

afterAll(() => server.close());
