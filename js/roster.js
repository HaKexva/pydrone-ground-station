// Known-drone roster.
// Several pyDrones advertise the identical name, so the Chrome picker shows
// them as indistinguishable rows. We key on device.id — stable per browser
// profile — and let the operator attach a human alias to each one.

const KEY = 'pydrone.roster.v1';

/**
 * Canonicalise a MAC to aa:bb:cc:dd:ee:ff, or null if it is not one.
 * Accepts colon, dash, dot or bare-hex input so operators can paste whatever
 * their controller or label prints.
 */
export function normalizeMac(input) {
  const hex = String(input ?? '').replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (hex.length !== 12) return null;
  return hex.match(/.{2}/g).join(':');
}

export class Roster {
  constructor(storage = globalThis.localStorage, key = KEY) {
    this.storage = storage;
    this.key = key;
  }

  #read() {
    try {
      const raw = this.storage?.getItem(this.key);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((d) => d && typeof d.id === 'string') : [];
    } catch {
      return []; // corrupt or unavailable storage must never break connecting
    }
  }

  #write(list) {
    try {
      this.storage?.setItem(this.key, JSON.stringify(list));
    } catch { /* private mode / quota — roster is a convenience, not a requirement */ }
    return list;
  }

  /** Most recently used first. */
  list() {
    return this.#read().sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0));
  }

  get(id) {
    return this.#read().find((d) => d.id === id) || null;
  }

  remember({ id, name }, at = Date.now()) {
    if (!id) return null;
    const list = this.#read();
    const found = list.find((d) => d.id === id);
    if (found) {
      found.name = name || found.name;
      found.lastSeen = at;
    } else {
      list.push({ id, name: name || 'pyDrone', alias: '', mac: '', lastSeen: at });
    }
    this.#write(list);
    return this.get(id);
  }

  rename(id, alias) {
    const list = this.#read();
    const found = list.find((d) => d.id === id);
    if (!found) return null;
    found.alias = (alias || '').trim().slice(0, 40);
    this.#write(list);
    return found;
  }

  /**
   * Record the drone's hardware MAC by hand.
   * The browser cannot read it — Web Bluetooth deliberately withholds MAC
   * addresses — so this is operator-supplied, purely to tie a roster entry to
   * the address printed by the controller.
   * @returns the updated entry, or null if the id is unknown or the MAC is malformed.
   */
  setMac(id, mac) {
    const list = this.#read();
    const found = list.find((d) => d.id === id);
    if (!found) return null;

    const raw = String(mac ?? '').trim();
    if (!raw) { found.mac = ''; this.#write(list); return found; }

    const norm = normalizeMac(raw);
    if (!norm) return null;
    found.mac = norm;
    this.#write(list);
    return found;
  }

  /** Look a drone up by the MAC the operator recorded. */
  byMac(mac) {
    const norm = normalizeMac(mac);
    return norm ? this.#read().find((d) => d.mac === norm) || null : null;
  }

  forget(id) {
    this.#write(this.#read().filter((d) => d.id !== id));
  }

  /** What to show in the UI: alias wins, then advertised name, then a short id. */
  label(entry) {
    if (!entry) return 'unknown';
    if (entry.alias) return entry.alias;
    if (entry.name && entry.name !== 'pyDrone') return entry.name;
    return `pyDrone · ${String(entry.id).slice(0, 6)}`;
  }
}
