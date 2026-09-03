/* 3105 patch builder + Locket Gold forger — runs 100% client-side (browser/node).
 * Mirrors YangJiiii/3105 PatchPackageCodec.swift (schema v3) and builder.py.
 * No network calls. No data leaves the device.
 */
'use strict';

const MAGIC = new TextEncoder().encode('3105PATCH\0'); // 10 bytes
const SCHEMA = 3;
const BUNDLE_ID = 'com.locket.Locket';
const GOLD_PRODUCT = 'locket_1600_1y';
const EXPIRES_ISO = '2099-12-31T23:59:59Z';

/* ---------------- base64 (chunked, stack-safe) ---------------- */
function b64encode(u8) {
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
  }
  return btoa(s);
}
function b64decode(b64) {
  const s = atob(b64);
  const u8 = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
  return u8;
}

/* ---------------- binary plist: decode ---------------- */
function bplistDecode(buf) {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (String.fromCharCode(...b.subarray(0, 8)) !== 'bplist00') throw new Error('not a binary plist');
  const n = b.length;
  const trailer = n - 32;
  const offSize = dv.getUint8(trailer + 6);
  const refSize = dv.getUint8(trailer + 7);
  const numObj = Number(dv.getBigUint64(trailer + 8));
  const topObj = Number(dv.getBigUint64(trailer + 16));
  const offTab = Number(dv.getBigUint64(trailer + 24));
  const readUint = (at, size) => {
    if (size === 1) return dv.getUint8(at);
    if (size === 2) return dv.getUint16(at);
    if (size === 4) return dv.getUint32(at);
    let v = 0n;
    for (let i = 0; i < size; i++) v = (v << 8n) | BigInt(dv.getUint8(at + i));
    return Number(v);
  };
  const offsets = [];
  for (let i = 0; i < numObj; i++) offsets.push(readUint(offTab + i * offSize, offSize));
  const cache = new Array(numObj);
  function readRef(at) { return readUint(at, refSize); }
  function readLen(obj, at) {
    let ln = obj & 0x0F, pos = at;
    if (ln === 0x0F) {
      const t = b[pos++];
      if ((t & 0xF0) !== 0x10) throw new Error('bad length int');
      const nb = 1 << (t & 0x0F);
      ln = readUint(pos, nb); pos += nb;
    }
    return [ln, pos];
  }
  function parse(idx) {
    if (cache[idx] !== undefined) return cache[idx];
    const at = offsets[idx];
    const obj = b[at];
    const type = obj & 0xF0;
    let v;
    if (obj === 0x00) v = null;
    else if (obj === 0x08) v = false;
    else if (obj === 0x09) v = true;
    else if (type === 0x10) {
      const nb = 1 << (obj & 0x0F);
      if (nb === 1) { const x = b[at + 1]; v = x > 127 ? x - 256 : x; }
      else if (nb === 2) { const x = dv.getUint16(at + 1); v = x > 32767 ? x - 65536 : x; }
      else if (nb === 4) { v = dv.getInt32(at + 1); }
      else {
        let s = 0n;
        for (let i = 0; i < 8; i++) s = (s << 8n) | BigInt(b[at + 1 + i]);
        if (s >> 63n) s -= 1n << 64n;
        v = Number(s);
      }
    } else if (type === 0x20) {
      const nb = 1 << (obj & 0x0F);
      v = nb === 4 ? dv.getFloat32(at + 1) : dv.getFloat64(at + 1);
    } else if (obj === 0x33) {
      v = new Date((dv.getFloat64(at + 1) + 978307200) * 1000);
    } else if (type === 0x40) {
      const [ln, pos] = readLen(obj, at + 1);
      v = b.slice(pos, pos + ln);
    } else if (type === 0x50) {
      const [ln, pos] = readLen(obj, at + 1);
      v = String.fromCharCode(...b.subarray(pos, pos + ln));
    } else if (type === 0x60) {
      const [ln, pos] = readLen(obj, at + 1);
      let s = '';
      for (let i = 0; i < ln; i++) s += String.fromCharCode(dv.getUint16(pos + i * 2));
      v = s;
    } else if (type === 0x80) {
      const nb = (obj & 0x0F) + 1;
      let x = 0n;
      for (let i = 0; i < nb; i++) x = (x << 8n) | BigInt(b[at + 1 + i]);
      v = { __uid: Number(x) };
    } else if (type === 0xA0 || type === 0xC0) {
      const [ln, pos] = readLen(obj, at + 1);
      const arr = [];
      let p = pos;
      for (let i = 0; i < ln; i++) { arr.push(parse(readRef(p))); p += refSize; }
      v = arr;
    } else if (type === 0xD0) {
      const [ln, pos] = readLen(obj, at + 1);
      const o = {};
      let p = pos;
      const keys = [];
      for (let i = 0; i < ln; i++) { keys.push(parse(readRef(p))); p += refSize; }
      for (let i = 0; i < ln; i++) { o[keys[i]] = parse(readRef(p)); p += refSize; }
      v = o;
    } else throw new Error('unsupported bplist obj 0x' + obj.toString(16));
    cache[idx] = v;
    return v;
  }
  return parse(topObj);
}

/* ---------------- binary plist: encode ---------------- */
function bplistEncode(root) {
  const objs = [];
  const out = [];
  function enc(v) {
    if (v === null || v === undefined) return objs.push({ t: 0x00 }) - 1;
    if (v === true) return objs.push({ t: 0x09 }) - 1;
    if (v === false) return objs.push({ t: 0x08 }) - 1;
    if (typeof v === 'number') {
      if (Number.isInteger(v)) {
        let nb, buf;
        if (v >= -128 && v <= 127) { nb = 1; buf = new Uint8Array([(v) & 255]); }
        else if (v >= -32768 && v <= 32767) { nb = 2; buf = new Uint8Array(2); new DataView(buf.buffer).setInt16(0, v); }
        else if (v >= -2147483648 && v <= 2147483647) { nb = 4; buf = new Uint8Array(4); new DataView(buf.buffer).setInt32(0, v); }
        else { nb = 8; buf = new Uint8Array(8); new DataView(buf.buffer).setBigInt64(0, BigInt(v)); }
        const code = { 1: 0x10, 2: 0x11, 4: 0x12, 8: 0x13 }[nb];
        return objs.push({ t: code, raw: buf }) - 1;
      }
      const buf = new Uint8Array(8); new DataView(buf.buffer).setFloat64(0, v);
      return objs.push({ t: 0x23, raw: buf }) - 1;
    }
    if (v instanceof Date) {
      const buf = new Uint8Array(8);
      new DataView(buf.buffer).setFloat64(0, v.getTime() / 1000 - 978307200);
      return objs.push({ t: 0x33, raw: buf }) - 1;
    }
    if (v instanceof Uint8Array) {
      return objs.push({ blob: v, cont: true }) - 1;
    }
    if (typeof v === 'string') {
      let ascii = true;
      for (let i = 0; i < v.length; i++) if (v.charCodeAt(i) > 127) { ascii = false; break; }
      if (ascii) return objs.push({ blob: new TextEncoder().encode(v), str: 'a' }) - 1;
      const buf = new Uint8Array(v.length * 2);
      const dv = new DataView(buf.buffer);
      for (let i = 0; i < v.length; i++) dv.setUint16(i * 2, v.charCodeAt(i));
      return objs.push({ blob: buf, str: 'u', ulen: v.length }) - 1;
    }
    if (Array.isArray(v)) {
      const refs = v.map(enc);
      return objs.push({ refs }) - 1;
    }
    if (typeof v === 'object') {
      const keys = Object.keys(v);
      const krefs = keys.map(enc);
      const vrefs = keys.map(k => enc(v[k]));
      return objs.push({ krefs, vrefs }) - 1;
    }
    throw new Error('cannot bplist-encode ' + typeof v);
  }
  const top = enc(root);
  const parts = [new TextEncoder().encode('bplist00')];
  const offsets = [];
  const refCount = objs.length;
  const refSize = refCount < 256 ? 1 : (refCount < 65536 ? 2 : 4);
  const writeRef = (arr, idx) => {
    if (refSize === 1) arr.push(idx);
    else if (refSize === 2) arr.push((idx >> 8) & 255, idx & 255);
    else arr.push((idx >>> 24) & 255, (idx >>> 16) & 255, (idx >>> 8) & 255, idx & 255);
  };
  let pos = 8;
  for (const o of objs) {
    offsets.push(pos);
    const bytes = [];
    if (o.t !== undefined && o.raw === undefined) { bytes.push(o.t); }
    else if (o.raw) { bytes.push(o.t); for (const x of o.raw) bytes.push(x); }
    else if (o.blob !== undefined && o.refs === undefined && o.krefs === undefined) {
      if (o.str === 'a') {
        const n = o.blob.length;
        if (n < 15) bytes.push(0x50 | n);
        else { bytes.push(0x5F); const li = n < 256 ? [0x10, n] : [0x11, (n >> 8) & 255, n & 255]; for (const x of li) bytes.push(x); }
        for (const x of o.blob) bytes.push(x);
      } else if (o.str === 'u') {
        const n = o.ulen;
        if (n < 15) bytes.push(0x60 | n);
        else { bytes.push(0x6F); const li = n < 256 ? [0x10, n] : [0x11, (n >> 8) & 255, n & 255]; for (const x of li) bytes.push(x); }
        for (const x of o.blob) bytes.push(x);
      } else {
        const n = o.blob.length;
        if (n < 15) bytes.push(0x40 | n);
        else { bytes.push(0x4F); const li = n < 256 ? [0x10, n] : [0x11, (n >> 8) & 255, n & 255]; for (const x of li) bytes.push(x); }
        for (const x of o.blob) bytes.push(x);
      }
    } else if (o.refs) {
      const n = o.refs.length;
      if (n < 15) bytes.push(0xA0 | n);
      else { bytes.push(0xAF); const li = n < 256 ? [0x10, n] : [0x11, (n >> 8) & 255, n & 255]; for (const x of li) bytes.push(x); }
      for (const r of o.refs) writeRef(bytes, r);
    } else if (o.krefs) {
      const n = o.krefs.length;
      if (n < 15) bytes.push(0xD0 | n);
      else { bytes.push(0xDF); const li = n < 256 ? [0x10, n] : [0x11, (n >> 8) & 255, n & 255]; for (const x of li) bytes.push(x); }
      for (const r of o.krefs) writeRef(bytes, r);
      for (const r of o.vrefs) writeRef(bytes, r);
    }
    const u8 = new Uint8Array(bytes);
    parts.push(u8);
    pos += u8.length;
  }
  const offTab = pos;
  let maxOff = 0;
  for (const o of offsets) if (o > maxOff) maxOff = o;
  const offSize = maxOff < 256 ? 1 : (maxOff < 65536 ? 2 : (maxOff < 4294967296 ? 4 : 8));
  const ot = [];
  for (const o of offsets) {
    if (offSize === 1) ot.push(o);
    else if (offSize === 2) ot.push((o >> 8) & 255, o & 255);
    else if (offSize === 4) ot.push((o >>> 24) & 255, (o >>> 16) & 255, (o >>> 8) & 255, o & 255);
    else { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(o)); for (const x of b) ot.push(x); }
  }
  parts.push(new Uint8Array(ot));
  const trailer = new Uint8Array(32);
  trailer[6] = offSize; trailer[7] = refSize;
  const tdv = new DataView(trailer.buffer);
  tdv.setBigUint64(8, BigInt(objs.length));
  tdv.setBigUint64(16, BigInt(top));
  tdv.setBigUint64(24, BigInt(offTab));
  parts.push(trailer);
  let total = 0;
  for (const p of parts) total += p.length;
  const res = new Uint8Array(total);
  let w = 0;
  for (const p of parts) { res.set(p, w); w += p.length; }
  return res;
}

/* ---------------- minimal XML plist parse (for uploaded XML plists) ---------------- */
function xmlPlistParse(text) {
  const tag = (s, i) => {
    const m = /^<([a-zA-Z]+)(\s[^>]*)?(\/?)>/.exec(s.slice(i));
    return m ? { name: m[1], selfClose: !!m[3], len: m[0].length } : null;
  };
  let pos = 0;
  const skipDecl = () => {
    while (true) {
      while (pos < text.length && /\s/.test(text[pos])) pos++;
      if (text.startsWith('<?', pos)) pos = text.indexOf('?>', pos) + 2;
      else if (text.startsWith('<!DOCTYPE', pos)) { let d = 0; while (pos < text.length) { if (text[pos] === '[') d++; if (text[pos] === ']') d--; if (text[pos] === '>' && d === 0) { pos++; break; } pos++; } }
      else if (text.startsWith('<!--', pos)) pos = text.indexOf('-->', pos) + 3;
      else break;
    }
  };
  const unesc = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  function parseVal() {
    skipDecl();
    const t = tag(text, pos);
    if (!t) throw new Error('xml parse error at ' + pos);
    pos += t.len;
    const inner = () => { const e = text.indexOf('<', pos); const s = text.slice(pos, e); pos = e; return s; };
    const close = nm => { skipDecl(); const c = tag(text, pos); if (!c || c.name !== nm || c.selfClose) throw new Error('expected </' + nm + '>'); pos += c.len; };
    switch (t.name) {
      case 'plist': { const v = parseVal(); close('plist'); return v; }
      case 'dict': {
        const o = {};
        while (true) {
          skipDecl();
          const n = tag(text, pos);
          if (text.startsWith('</dict>', pos)) { pos += 7; break; }
          if (!n || n.name !== 'key') throw new Error('expected <key>');
          pos += n.len;
          const ke = text.indexOf('</key>', pos);
          const k = unesc(text.slice(pos, ke)); pos = ke + 6;
          o[k] = parseVal();
        }
        return o;
      }
      case 'array': {
        const a = [];
        while (true) {
          skipDecl();
          if (text.startsWith('</array>', pos)) { pos += 8; break; }
          a.push(parseVal());
        }
        return a;
      }
      case 'string': { const s = unesc(inner()); close('string'); return s; }
      case 'integer': { const s = inner().trim(); close('integer'); return parseInt(s, 10); }
      case 'real': { const s = inner().trim(); close('real'); return parseFloat(s); }
      case 'true': return true;
      case 'false': return false;
      case 'date': { const s = inner().trim(); close('date'); return new Date(s); }
      case 'data': {
        let s = '';
        while (true) { const e = text.indexOf('<', pos); s += text.slice(pos, e); pos = e; if (text.startsWith('</data>', pos)) break; }
        pos += 7;
        return b64decode(s.replace(/\s+/g, ''));
      }
      default: throw new Error('unsupported xml tag <' + t.name + '>');
    }
  }
  skipDecl();
  return parseVal();
}
function parsePlist(buf) {
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  if (u8.length >= 8 && String.fromCharCode(...u8.subarray(0, 6)) === 'bplist') return bplistDecode(u8);
  return xmlPlistParse(new TextDecoder().decode(u8));
}

/* ---------------- crypto ---------------- */
const te = new TextEncoder();
async function aesGcmSeal(keyBytes, pt, aad) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, k, pt));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0); out.set(ct, 12);
  return out;
}
async function sha256(d) { return new Uint8Array(await crypto.subtle.digest('SHA-256', d)); }
function uuidUpper() {
  const u = crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
    return ((c === 'x' ? r : (r & 3) | 8)).toString(16);
  });
  return u.toUpperCase();
}
function nowIsoZ() { return new Date().toISOString().replace(/\.\d+Z$/, 'Z'); }

/* ---------------- Locket Gold forge ---------------- */
function extractUid(etagsObj) {
  for (const k of Object.keys(etagsObj)) {
    const m = /\/v1\/subscribers\/([^\/'"?]+)\/?$/.exec(k);
    if (m) return { uid: m[1], key: k };
  }
  return null;
}
function forgeSubscriber(uid, subObj) {
  const now = nowIsoZ();
  const nowMs = Date.now();
  const s = subObj.subscriber;
  s.entitlements = {
    Gold: { expires_date: EXPIRES_ISO, grace_period_expires_date: null, product_identifier: GOLD_PRODUCT, purchase_date: now }
  };
  s.subscriptions = {
    [GOLD_PRODUCT]: {
      billing_issues_detected_at: null, expires_date: EXPIRES_ISO, grace_period_expires_date: null,
      is_sandbox: false, original_purchase_date: now, ownership_type: 'PURCHASED', period_type: 'normal',
      purchase_date: now, refunded_at: null, store: 'app_store', unsubscribe_detected_at: null
    }
  };
  subObj.request_date = now;
  subObj.request_date_ms = nowMs;
  return subObj;
}

/* ---------------- .3105 package build ---------------- */
async function buildPackage(files) {
  const now = new Date();
  const pkgId = uuidUpper();
  const rules = files.map(f => ({
    id: uuidUpper(), bundleID: f.bundleID, relativePath: f.relativePath,
    replacementFilename: f.replacementFilename, replacementData: f.data
  }));
  const project = {
    id: pkgId, name: "b'Locket", author: 'b', isPrivate: false,
    createdAt: now, updatedAt: now,
    bundleIdentifiers: [BUNDLE_ID], directories: [], rules
  };
  const digests = {};
  for (const r of rules) digests[r.id] = await sha256(r.replacementData);
  const payload = bplistEncode({ project, replacementDigests: digests });
  const contentKey = crypto.getRandomValues(new Uint8Array(32));
  const fp = await sha256(contentKey);
  const encPayload = await aesGcmSeal(contentKey, payload, te.encode(`3105PATCH/v${SCHEMA}/payload/${pkgId}`));
  const envelope = {
    schemaVersion: SCHEMA, packageID: pkgId, isPasswordProtected: false,
    keyFingerprint: fp, publicContentKey: contentKey, encryptedPayload: encPayload
  };
  const body = bplistEncode(envelope);
  const out = new Uint8Array(MAGIC.length + body.length);
  out.set(MAGIC, 0); out.set(body, MAGIC.length);
  return out;
}

/* Full flow: uploaded etags bytes (+optional app plist bytes) */
async function forgeFromEtagsFile(etagsBytes, appPlistBytes) {
  const etags = parsePlist(etagsBytes);
  const found = extractUid(etags);
  if (!found) throw new Error('NO_UID');
  const { uid, key } = found;
  let entry = etags[key];
  if (entry instanceof Uint8Array) entry = JSON.parse(new TextDecoder().decode(entry));
  if (typeof entry === 'string') entry = JSON.parse(entry);
  const subObj = JSON.parse(new TextDecoder().decode(b64decode(entry.data)));
  forgeSubscriber(uid, subObj);
  entry.data = b64encode(te.encode(JSON.stringify(subObj)));
  etags[key] = te.encode(JSON.stringify(entry));
  const etagsOut = bplistEncode(etags);
  const rcSuite = bplistEncode({
    [`com.revenuecat.userdefaults.purchaserInfo.${uid}`]: te.encode(JSON.stringify(subObj)),
    [`com.revenuecat.userdefaults.purchaserInfoLastUpdated.${uid}`]: new Date()
  });
  const rules = [
    { bundleID: BUNDLE_ID, relativePath: 'Library/Preferences/com.revenuecat.user_defaults.plist', replacementFilename: 'com.revenuecat.user_defaults.plist', data: rcSuite },
    { bundleID: BUNDLE_ID, relativePath: 'Library/Preferences/com.locket.Locket.revenuecat.etags.plist', replacementFilename: 'com.locket.Locket.revenuecat.etags.plist', data: etagsOut }
  ];
  if (appPlistBytes) {
    const app = parsePlist(appPlistBytes);
    const now = new Date();
    app['/subscription_local_trial_started_at'] = now;
    app['/subscription_local_trial_ended_at'] = new Date('2099-12-31T23:59:59Z');
    rules.push({ bundleID: BUNDLE_ID, relativePath: 'Library/Preferences/com.locket.Locket.plist', replacementFilename: 'com.locket.Locket.plist', data: bplistEncode(app) });
  }
  const pkg = await buildPackage(rules);
  return { uid, pkg, rules: rules.length };
}

/* Fallback flow: manual UID only (RC suite only, weaker persistence) */
async function forgeFromUid(uid) {
  uid = uid.trim();
  if (!uid) throw new Error('EMPTY_UID');
  const now = nowIsoZ(), nowMs = Date.now();
  const subObj = {
    request_date: now, request_date_ms: nowMs,
    subscriber: {
      entitlements: { Gold: { expires_date: EXPIRES_ISO, grace_period_expires_date: null, product_identifier: GOLD_PRODUCT, purchase_date: now } },
      first_seen: now, last_seen: now, management_url: null, non_subscriptions: {},
      original_app_user_id: uid, original_application_version: null, original_purchase_date: null,
      other_purchases: {},
      subscriptions: { [GOLD_PRODUCT]: { billing_issues_detected_at: null, expires_date: EXPIRES_ISO, grace_period_expires_date: null, is_sandbox: false, original_purchase_date: now, ownership_type: 'PURCHASED', period_type: 'normal', purchase_date: now, refunded_at: null, store: 'app_store', unsubscribe_detected_at: null } }
    }
  };
  const rcSuite = bplistEncode({
    [`com.revenuecat.userdefaults.purchaserInfo.${uid}`]: te.encode(JSON.stringify(subObj)),
    [`com.revenuecat.userdefaults.purchaserInfoLastUpdated.${uid}`]: new Date()
  });
  const pkg = await buildPackage([
    { bundleID: BUNDLE_ID, relativePath: 'Library/Preferences/com.revenuecat.user_defaults.plist', replacementFilename: 'com.revenuecat.user_defaults.plist', data: rcSuite }
  ]);
  return { uid, pkg };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { bplistEncode, bplistDecode, parsePlist, buildPackage, forgeFromEtagsFile, forgeFromUid, extractUid, SCHEMA, BUNDLE_ID };
}
