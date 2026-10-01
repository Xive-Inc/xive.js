/**
 * discord.js's `Collection`: a Map with the array helpers bots lean on. The subset that real bots
 * use, with the same names and argument order.
 *
 * @template K, V
 * @extends {Map<K, V>}
 */
export class Collection extends Map {
  /** @param {(value: V, key: K, collection: this) => unknown} fn */
  find(fn) {
    for (const [k, v] of this) if (fn(v, k, this)) return v;
    return undefined;
  }

  /** @param {(value: V, key: K, collection: this) => unknown} fn */
  findKey(fn) {
    for (const [k, v] of this) if (fn(v, k, this)) return k;
    return undefined;
  }

  /** @param {(value: V, key: K, collection: this) => unknown} fn @returns {Collection<K, V>} */
  filter(fn) {
    const out = new Collection();
    for (const [k, v] of this) if (fn(v, k, this)) out.set(k, v);
    return out;
  }

  /** @template T @param {(value: V, key: K, collection: this) => T} fn @returns {T[]} */
  map(fn) {
    return [...this].map(([k, v]) => fn(v, k, this));
  }

  /** @param {(value: V, key: K, collection: this) => unknown} fn */
  some(fn) {
    for (const [k, v] of this) if (fn(v, k, this)) return true;
    return false;
  }

  /** @param {(value: V, key: K, collection: this) => unknown} fn */
  every(fn) {
    for (const [k, v] of this) if (!fn(v, k, this)) return false;
    return true;
  }

  /** @template T @param {(acc: T, value: V, key: K) => T} fn @param {T} initial */
  reduce(fn, initial) {
    let acc = initial;
    for (const [k, v] of this) acc = fn(acc, v, k);
    return acc;
  }

  /** @param {number} [n] */
  first(n) {
    const values = [...this.values()];
    return n === undefined ? values[0] : values.slice(0, n);
  }

  /** @param {number} [n] */
  last(n) {
    const values = [...this.values()];
    return n === undefined ? values[values.length - 1] : values.slice(-n);
  }

  firstKey() {
    return this.keys().next().value;
  }

  lastKey() {
    return [...this.keys()].pop();
  }

  random() {
    const values = [...this.values()];
    return values[Math.floor(Math.random() * values.length)];
  }

  /** @param {(value: V, key: K) => void} fn */
  each(fn) {
    this.forEach((v, k) => fn(v, k));
    return this;
  }

  /** @param {(a: V, b: V) => number} [compare] @returns {Collection<K, V>} */
  sort(compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)) {
    const entries = [...this].sort(([, a], [, b]) => compare(a, b));
    this.clear();
    for (const [k, v] of entries) this.set(k, v);
    return this;
  }

  clone() {
    return new Collection(this);
  }

  toJSON() {
    return [...this.values()];
  }
}
