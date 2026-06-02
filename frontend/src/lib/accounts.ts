// Conturi salvate pentru login rapid pe ACEST dispozitiv (localStorage).
// Notă de securitate: parola e stocată local în browser. Folosește această opțiune
// doar pe un dispozitiv personal, nu pe unul partajat.

const KEY = "statistic_accounts";

export interface SavedAccount {
  email: string;
  password: string;
  name?: string;
}

export function getSavedAccounts(): SavedAccount[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedAccount[]) : [];
  } catch {
    return [];
  }
}

export function saveAccount(acc: SavedAccount): void {
  const list = getSavedAccounts().filter(
    (a) => a.email.toLowerCase() !== acc.email.toLowerCase()
  );
  list.unshift(acc);
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, 10)));
}

export function removeAccount(email: string): void {
  const list = getSavedAccounts().filter(
    (a) => a.email.toLowerCase() !== email.toLowerCase()
  );
  localStorage.setItem(KEY, JSON.stringify(list));
}
