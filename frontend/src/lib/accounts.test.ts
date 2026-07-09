import { beforeEach, describe, expect, it } from "vitest";
import { getSavedAccounts, removeAccount, saveAccount } from "./accounts";

const KEY = "statistic_accounts";

describe("lib/accounts", () => {
  beforeEach(() => localStorage.clear());

  it("întoarce listă goală când nu e nimic salvat", () => {
    expect(getSavedAccounts()).toEqual([]);
  });

  it("salvează și citește un cont", () => {
    saveAccount({ email: "a@test.ro", password: "secret" });
    const list = getSavedAccounts();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ email: "a@test.ro", password: "secret" });
  });

  it("pune contul cel mai recent primul (unshift)", () => {
    saveAccount({ email: "a@test.ro", password: "1" });
    saveAccount({ email: "b@test.ro", password: "2" });
    expect(getSavedAccounts().map((a) => a.email)).toEqual([
      "b@test.ro",
      "a@test.ro",
    ]);
  });

  it("deduplică pe email (case-insensitive) și mută în față", () => {
    saveAccount({ email: "a@test.ro", password: "vechi" });
    saveAccount({ email: "b@test.ro", password: "2" });
    saveAccount({ email: "A@TEST.RO", password: "nou" });
    const list = getSavedAccounts();
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ email: "A@TEST.RO", password: "nou" });
  });

  it("limitează la maxim 10 conturi", () => {
    for (let i = 0; i < 15; i++) {
      saveAccount({ email: `u${i}@test.ro`, password: "x" });
    }
    expect(getSavedAccounts()).toHaveLength(10);
  });

  it("șterge un cont (case-insensitive)", () => {
    saveAccount({ email: "a@test.ro", password: "1" });
    saveAccount({ email: "b@test.ro", password: "2" });
    removeAccount("A@TEST.RO");
    expect(getSavedAccounts().map((a) => a.email)).toEqual(["b@test.ro"]);
  });

  it("întoarce [] la JSON corupt în localStorage", () => {
    localStorage.setItem(KEY, "{not-json");
    expect(getSavedAccounts()).toEqual([]);
  });
});
