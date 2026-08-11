/**
 * The three localStorage guards every store needs, stated once. All of them are `unknown` in and
 * `unknown` out on purpose: parsing and validating a restored payload is the store's own business,
 * and folding it in here would be the abstraction that eventually needs a flag per caller.
 */

/** Reading localStorage throws outright when the browser blocks site data. */
export function openLocalStorage(document: Document): Storage | undefined {
  try {
    return document.defaultView?.localStorage;
  } catch {
    return undefined;
  }
}

/** `undefined` covers all three failure modes alike: no storage, no entry, unparseable entry. */
export function readJson(storage: Storage | undefined, key: string): unknown {
  try {
    const stored = storage?.getItem(key);
    return stored === null || stored === undefined ? undefined : JSON.parse(stored);
  } catch {
    return undefined;
  }
}

/** False means the value did not persist — a quota or a private-mode rejection, not a crash. */
export function writeJson(storage: Storage | undefined, key: string, value: unknown): boolean {
  if (storage === undefined) {
    return false;
  }
  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
