// Browser port of lib/wa-codec.js — the WeakAuras !WA:2! codec with ZERO deps.
// Differences from the Node codec (which are the whole point of this file):
//   - deflate via the Web CompressionStream('deflate-raw') instead of zlib  -> encodeWA/decodeWA are ASYNC.
//   - Uint8Array / DataView instead of Node Buffer.
// The bit-level LibSerialize + LibDeflate-EncodeForPrint logic mirrors lib/wa-codec.js exactly, so a
// string this encoder produces round-trips through the Node codec (cross-tested in tools/webcodec-crosstest.js).
// Numeric map keys are preserved via a "$n$" prefix (e.g. "$n$262" == integer key 262), same as Node.

const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789()';
const CHARMAP = {};
for (let i = 0; i < CHARS.length; i++) CHARMAP[CHARS[i]] = i;
const NKEY = '$n$';

// ---------- print encoding (LibDeflate DecodeForPrint/EncodeForPrint) ----------
function decodeForPrint(str) {
  str = str.replace(/^\s+/, '').replace(/\s+$/, '');
  const out = [];
  let bitbuf = 0, bitcnt = 0;
  for (const ch of str) {
    const v = CHARMAP[ch];
    if (v === undefined) continue;
    bitbuf |= v << bitcnt; bitcnt += 6;
    while (bitcnt >= 8) { out.push(bitbuf & 0xff); bitbuf >>= 8; bitcnt -= 8; }
  }
  return Uint8Array.from(out);
}
function encodeForPrint(buf) {
  let s = '', bitbuf = 0, bitcnt = 0;
  for (const byte of buf) {
    bitbuf |= byte << bitcnt; bitcnt += 8;
    while (bitcnt >= 6) { s += CHARS[bitbuf & 63]; bitbuf >>= 6; bitcnt -= 6; }
  }
  if (bitcnt > 0) s += CHARS[bitbuf & 63];
  return s;
}

// ---------- raw deflate via Web streams (async) ----------
async function pipe(u8, transform) {
  const w = transform.writable.getWriter();
  w.write(u8); w.close();
  return new Uint8Array(await new Response(transform.readable).arrayBuffer());
}
const deflateRaw = u8 => pipe(u8, new CompressionStream('deflate-raw'));
const inflateRaw = u8 => pipe(u8, new DecompressionStream('deflate-raw'));

const latin1 = bytes => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return s; };

// ---------- deserialize (LibSerialize v1) ----------
class Reader {
  constructor(buf) { this.buf = buf; this.dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength); this.pos = 0; this.stringRefs = []; this.tableRefs = []; }
  byte() { return this.buf[this.pos++]; }
  intN(n) { let r = 0; for (let i = 0; i < n; i++) r = r * 256 + this.buf[this.pos++]; return r; }
  bytes(n) { const s = this.buf.subarray(this.pos, this.pos + n); this.pos += n; return s; }
  float() { const v = this.dv.getFloat64(this.pos, false); this.pos += 8; return v; }
  readString(len) { const s = latin1(this.bytes(len)); if (len > 2) this.stringRefs.push(s); return s; }
  keyOf(k) { return typeof k === 'number' ? NKEY + k : String(k); }
  readArray(count, value) {
    if (value === undefined) { value = { __array: [] }; this.tableRefs.push(value); }
    if (!value.__array) value.__array = [];
    for (let i = 0; i < count; i++) value.__array.push(this.readObject());
    return value;
  }
  readTable(count, value) {
    if (value === undefined) { value = {}; this.tableRefs.push(value); }
    for (let i = 0; i < count; i++) { const k = this.readObject(); const v = this.readObject(); value[this.keyOf(k)] = v; }
    return value;
  }
  readMixed(ac, mc) { const value = {}; this.tableRefs.push(value); this.readArray(ac, value); this.readTable(mc, value); return value; }
  readObject() {
    const value = this.byte();
    if (value % 2 === 1) return (value - 1) / 2;
    if (value % 4 === 2) {
      let typ = (value - 2) / 4; const count = Math.floor(typ / 4); typ = typ % 4;
      if (typ === 0) return this.readString(count);
      if (typ === 1) return this.readTable(count);
      if (typ === 2) return this.readArray(count);
      return this.readMixed((count % 4) + 1, Math.floor(count / 4) + 1);
    }
    if (value % 8 === 4) { const packed = this.byte() * 256 + value; return (value % 16 === 12) ? -(packed - 12) / 16 : (packed - 4) / 16; }
    return this.ext(value / 8);
  }
  ext(typ) {
    switch (typ) {
      case 0: return null;
      case 1: return this.intN(2); case 2: return -this.intN(2);
      case 3: return this.intN(3); case 4: return -this.intN(3);
      case 5: return this.intN(4); case 6: return -this.intN(4);
      case 7: return this.intN(7); case 8: return -this.intN(7);
      case 9: return this.float();
      case 10: return Number(latin1(this.bytes(this.byte())));
      case 11: return -Number(latin1(this.bytes(this.byte())));
      case 12: return true; case 13: return false;
      case 14: return this.readString(this.byte());
      case 15: return this.readString(this.intN(2));
      case 16: return this.readString(this.intN(3));
      case 17: return this.readTable(this.byte());
      case 18: return this.readTable(this.intN(2));
      case 19: return this.readTable(this.intN(3));
      case 20: return this.readArray(this.byte());
      case 21: return this.readArray(this.intN(2));
      case 22: return this.readArray(this.intN(3));
      case 23: return this.readMixed(this.byte(), this.byte());
      case 24: return this.readMixed(this.intN(2), this.intN(2));
      case 25: return this.readMixed(this.intN(3), this.intN(3));
      case 26: return this.stringRefs[this.byte() - 1];
      case 27: return this.stringRefs[this.intN(2) - 1];
      case 28: return this.stringRefs[this.intN(3) - 1];
      case 29: return this.tableRefs[this.byte() - 1];
      case 30: return this.tableRefs[this.intN(2) - 1];
      case 31: return this.tableRefs[this.intN(3) - 1];
      default: throw new Error('unknown ext type ' + typ);
    }
  }
}

// convert Reader's __array wrappers into plain JS arrays where pure
function normalize(o) {
  if (o && typeof o === 'object' && !Array.isArray(o)) {
    const keys = Object.keys(o);
    if (o.__array && keys.length === 1) return o.__array.map(normalize);
    const r = {};
    if (o.__array) r.__array = o.__array.map(normalize);
    for (const k of keys) { if (k === '__array') continue; r[k] = normalize(o[k]); }
    return r;
  }
  return o;
}

export async function decodeWA(str) {
  str = str.trim();
  const m = str.match(/^!WA:(\d+)!/);
  if (!m) throw new Error('not a !WA! string');
  if (m[1] !== '2') throw new Error('only !WA:2! supported, got ' + m[1]);
  const raw = await inflateRaw(decodeForPrint(str.slice(m[0].length)));
  const reader = new Reader(raw);
  const serVersion = reader.byte();
  return { serVersion, data: normalize(reader.readObject()), rawLen: raw.length };
}

// ---------- serialize (non-optimizing: no dedup/embedded, but valid) ----------
class Writer {
  constructor() { this.out = []; }
  b(x) { this.out.push(x & 0xff); }
  beN(v, n) { for (let i = n - 1; i >= 0; i--) this.out.push(Math.floor(v / Math.pow(256, i)) & 0xff); }
  str(s) {
    const L = s.length;
    if (L < 256) { this.b(14 * 8); this.b(L); }
    else if (L < 65536) { this.b(15 * 8); this.beN(L, 2); }
    else { this.b(16 * 8); this.beN(L, 3); }
    for (let i = 0; i < L; i++) this.out.push(s.charCodeAt(i) & 0xff);   // latin1
  }
  num(v) {
    if (Number.isInteger(v)) {
      if (v >= 0 && v <= 127) { this.b(v * 2 + 1); return; }
      const neg = v < 0, m = Math.abs(v);
      if (m <= 0xffff) { this.b((neg ? 2 : 1) * 8); this.beN(m, 2); }
      else if (m <= 0xffffff) { this.b((neg ? 4 : 3) * 8); this.beN(m, 3); }
      else if (m <= 0xffffffff) { this.b((neg ? 6 : 5) * 8); this.beN(m, 4); }
      else { this.b((neg ? 8 : 7) * 8); this.beN(m, 7); }
    } else {
      this.b(9 * 8);
      const bb = new DataView(new ArrayBuffer(8)); bb.setFloat64(0, v, false);
      for (let i = 0; i < 8; i++) this.out.push(bb.getUint8(i));
    }
  }
  count3(base8, base16, base24, c) {
    if (c < 256) { this.b(base8 * 8); this.b(c); }
    else if (c < 65536) { this.b(base16 * 8); this.beN(c, 2); }
    else { this.b(base24 * 8); this.beN(c, 3); }
  }
  key(k) {
    if (k.startsWith(NKEY)) this.num(Number(k.slice(NKEY.length)));
    else this.str(k);
  }
  value(v) {
    if (v === null || v === undefined) { this.b(0); return; }
    const t = typeof v;
    if (t === 'boolean') { this.b((v ? 12 : 13) * 8); return; }
    if (t === 'number') { this.num(v); return; }
    if (t === 'string') { this.str(v); return; }
    if (Array.isArray(v)) { this.count3(20, 21, 22, v.length); for (const e of v) this.value(e); return; }
    const arr = v.__array;
    const mapKeys = Object.keys(v).filter(k => k !== '__array');
    if (arr) {
      const ac = arr.length, mc = mapKeys.length, w = Math.max(ac, mc);
      const base = w < 256 ? 23 : (w < 65536 ? 24 : 25), bytes = w < 256 ? 1 : (w < 65536 ? 2 : 3);
      this.b(base * 8); this.beN(ac, bytes); this.beN(mc, bytes);
      for (const e of arr) this.value(e);
      for (const k of mapKeys) { this.key(k); this.value(v[k]); }
    } else {
      this.count3(17, 18, 19, mapKeys.length);
      for (const k of mapKeys) { this.key(k); this.value(v[k]); }
    }
  }
}

export async function encodeWA(data) {
  const w = new Writer();
  w.b(1); // serialization version
  w.value(data);
  const compressed = await deflateRaw(Uint8Array.from(w.out));
  return '!WA:2!' + encodeForPrint(compressed);
}
