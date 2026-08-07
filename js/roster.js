// Known-drone roster.
// Several pyDrones advertise the identical name, so the Chrome picker shows
// them as indistinguishable rows. We key on device.id — stable per browser
// profile — and let the operator attach a human alias to each one.

const KEY = 'pydrone.roster.v1';

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
      list.push({ id, name: name || 'pyDrone', alias: '', lastSeen: at });
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
