// Archon AK47 (Sonix 0C45:800A) protocol, reverse-engineered from DeviceDriver.exe v1.0.0.5.
// See PROTOCOL.md for the full write-up. Every function here mirrors a routine in the
// original driver; the address of that routine is noted next to it.

export const DEVICE_FILTERS = [
  { vendorId: 0x0c45, productId: 0x800a }, // USB wired
  { vendorId: 0x05ac, productId: 0x024f }, // 2.4G dongle "KB87 Dongle"
];

export const PACKET = 64;          // feature report payload (report ID 0, 65 bytes on the wire)
export const LCD_BLOCK = 4096;     // LCD output report payload (report ID 0, 4097 bytes on the wire)
export const CMD_DELAY = 35;       // <cmd_delaytime value="35"/>
export const LCD_W = 240, LCD_H = 135, GIF_HEAD = 256, GIF_MAX_FRAMES = 141;

// Command bytes (byte 1 of a "04 xx" command packet)
export const CMD = {
  BEGIN: 0x18,        // open a write session (acked)
  BEGIN_MACRO: 0x19,  // open a macro write session
  COMMIT: 0x02,       // save / close session (acked)
  REFRESH: 0xf0,      // apply after lighting & keymap writes (not acked)
  LIGHT: 0x13,        // lighting mode block, 1 data packet
  CUSTOM_LIGHT: 0x23, // per-key RGB, 9 data packets
  KEYMAP: 0x11,       // base layer keymap, 9 data packets
  KEYMAP_FN: 0x27,    // Fn layer keymap, 9 data packets
  MACRO: 0x15,        // macro table, N data packets
  SYSTEM: 0x17,       // system settings, 1 data packet
  TIME: 0x28,         // TFT clock sync, 1 data packet
  LCD_GIF: 0x72,      // TFT animation upload (4 KB blocks on the LCD interface)
  REALTIME: 0x20,     // streamed per-key RGB (real-time / music lighting)
  READ_LIGHT: 0xf5,   // read per-key RGB back
};

export const LIGHT_MODES = [
  // value, Korean label, English label, feature flags (from the driver's default table)
  // flags: 0x01 brightness, 0x02 speed, 0x04 direction(4-way), 0x08 direction(2-way), 0x10 color, 0x20 colorful
  { v: 1, ko: '고정', en: 'Static', f: 0x31 },
  { v: 2, ko: '누르면 켜짐', en: 'SingleOn', f: 0x33 },
  { v: 3, ko: '누르면 꺼짐', en: 'SingleOff', f: 0x33 },
  { v: 4, ko: '반짝임', en: 'Glittering', f: 0x33 },
  { v: 5, ko: '떨어짐', en: 'Falling', f: 0x33 },
  { v: 6, ko: '컬러풀', en: 'Colourful', f: 0x03 },
  { v: 7, ko: '숨쉬기', en: 'Breath', f: 0x33 },
  { v: 8, ko: '스펙트럼', en: 'Spectrum', f: 0x03 },
  { v: 9, ko: '바깥으로', en: 'Outward', f: 0x33 },
  { v: 10, ko: '스크롤', en: 'Scrolling', f: 0x3b },
  { v: 11, ko: '롤링', en: 'Rolling', f: 0x37 },
  { v: 12, ko: '회전', en: 'Rotating', f: 0x37 },
  { v: 13, ko: '폭발', en: 'Explode', f: 0x33 },
  { v: 14, ko: '발사', en: 'Launch', f: 0x33 },
  { v: 15, ko: '물결', en: 'Ripples', f: 0x33 },
  { v: 16, ko: '흐름', en: 'Flowing', f: 0x37 },
  { v: 17, ko: '맥동', en: 'Pulsating', f: 0x33 },
  { v: 18, ko: '기울기', en: 'Tilt', f: 0x37 },
  { v: 19, ko: '셔틀', en: 'Shuttle', f: 0x33 },
  { v: 0, ko: 'LED 끄기', en: 'LED Off', f: 0x00 },
];
export const BRIGHTNESS_MAX = 5, SPEED_MAX = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join(' ');

function reportBytes(reports) {
  // Sum of item sizes per report ID, in bytes.
  const sizes = new Map();
  for (const r of reports || []) {
    let bits = 0;
    for (const it of r.items || []) bits += (it.reportSize || 0) * (it.reportCount || 0);
    sizes.set(r.reportId, (sizes.get(r.reportId) || 0) + bits / 8);
  }
  return sizes;
}

export function describeDevice(dev) {
  let feature = 0, output = 0;
  const pages = [];
  for (const c of dev.collections || []) {
    pages.push(`0x${c.usagePage.toString(16)}/0x${c.usage.toString(16)}`);
    for (const [, n] of reportBytes(c.featureReports)) feature = Math.max(feature, n);
    for (const [, n] of reportBytes(c.outputReports)) output = Math.max(output, n);
    for (const ch of c.children || []) {
      for (const [, n] of reportBytes(ch.featureReports)) feature = Math.max(feature, n);
      for (const [, n] of reportBytes(ch.outputReports)) output = Math.max(output, n);
    }
  }
  return { feature, output, pages };
}

export class AK47 {
  constructor({ log = () => {}, dryRun = false } = {}) {
    this.cfg = null;   // interface with the 64-byte feature report (MI_00 wired / MI_03 dongle)
    this.lcd = null;   // interface with the 4096-byte output report (TFT upload)
    this.log = log;
    this.dryRun = dryRun;
    this.busy = Promise.resolve();
  }

  get connected() { return !!this.cfg || this.dryRun; }

  async attach(devices) {
    for (const d of devices) {
      const info = describeDevice(d);
      if (!d.opened) await d.open();
      if (info.output >= LCD_BLOCK && !this.lcd) { this.lcd = d; this.log(`LCD 인터페이스 연결: ${d.productName} [${info.pages.join(', ')}]`, 'ok'); }
      else if (info.feature >= PACKET && !this.cfg) { this.cfg = d; this.log(`설정 인터페이스 연결: ${d.productName} [${info.pages.join(', ')}] feature=${info.feature}B`, 'ok'); }
      else this.log(`사용하지 않는 인터페이스: ${d.productName} [${info.pages.join(', ')}] feature=${info.feature}B output=${info.output}B`);
    }
    return { cfg: !!this.cfg, lcd: !!this.lcd };
  }

  async detach() {
    for (const d of [this.cfg, this.lcd]) { try { if (d?.opened) await d.close(); } catch {} }
    this.cfg = this.lcd = null;
  }

  // Serialise all transactions so UI clicks can't interleave sessions.
  run(fn) {
    const p = this.busy.then(fn, fn);
    this.busy = p.catch(() => {});
    return p;
  }

  // ---- low level (0x44f990 / 0x451f00 / 0x451fa0) ----
  async send(data, { ack = false, label = '' } = {}) {
    const buf = new Uint8Array(PACKET);
    buf.set(data.subarray(0, PACKET));
    await sleep(CMD_DELAY);
    this.log(`→ ${label ? label + ' ' : ''}${hex(buf)}`, 'tx');
    if (this.dryRun) return true;
    if (!this.cfg) throw new Error('키보드가 연결되어 있지 않습니다');
    await this.cfg.sendFeatureReport(0, buf);
    if (!ack) return true;
    await sleep(CMD_DELAY);
    let r = new Uint8Array((await this.cfg.receiveFeatureReport(0)).buffer);
    if (r.length === PACKET + 1) r = r.subarray(1); // some platforms prepend the report ID
    const ok = r[3] === 1;
    this.log(`← ${hex(r.subarray(0, 16))}${ok ? '' : '  (ACK 아님)'}`, ok ? 'rx' : 'warn');
    return ok;
  }

  async sendBulk(bytes, label) {
    // Payloads longer than one packet are sent as consecutive 64-byte packets without ACK.
    for (let o = 0; o < bytes.length; o += PACKET) await this.send(bytes.subarray(o, o + PACKET), { label: `${label} ${o / PACKET + 1}/${Math.ceil(bytes.length / PACKET)}` });
  }

  cmd(op, { b2 = 0, packets = 0, extra } = {}) {
    const p = new Uint8Array(PACKET);
    p[0] = 0x04; p[1] = op; p[2] = b2; p[8] = packets & 0xff; p[9] = (packets >> 8) & 0xff;
    if (extra) for (const [i, v] of Object.entries(extra)) p[i] = v;
    return p;
  }

  begin() { return this.send(this.cmd(CMD.BEGIN), { ack: true, label: 'BEGIN' }); }
  commit() { return this.send(this.cmd(CMD.COMMIT), { ack: true, label: 'COMMIT' }); }
  refresh() { return this.send(this.cmd(CMD.REFRESH), { label: 'REFRESH' }); }

  // ---- lighting (0x42b430) ----
  lightBlock({ mode, r = 0, g = 0, b = 0, colorful = 0, brightness = 5, speed = 3, direction = 0 }) {
    const d = new Uint8Array(PACKET);
    d[0] = mode;
    if (mode !== 0) {
      d[1] = r; d[2] = g; d[3] = b;
      d[8] = colorful ? 1 : 0; d[9] = brightness; d[10] = speed; d[11] = direction;
    }
    d[14] = 0xaa; d[15] = 0x55;
    return d;
  }

  setLighting(opts) {
    return this.run(async () => {
      await this.begin();
      await this.send(this.cmd(CMD.LIGHT, { packets: 1 }), { ack: true, label: 'LIGHT' });
      await this.send(this.lightBlock(opts), { label: 'light data' });
      await this.commit();
      await this.refresh();
    });
  }

  // ---- per-key custom lighting (0x44c3d0 + 0x44c4e0) ----
  // colors: Map<lightIndex, [r,g,b]>
  setCustomLighting(colors, brightness = 5) {
    return this.run(async () => {
      // 1) switch lighting to the custom mode (0x80)
      await this.begin();
      await this.send(this.cmd(CMD.LIGHT, { packets: 1 }), { ack: true, label: 'LIGHT' });
      const m = new Uint8Array(PACKET);
      m[0] = 0x80; m[9] = brightness; m[14] = 0xaa; m[15] = 0x55;
      await this.send(m, { label: 'custom mode' });
      await this.commit();
      await this.refresh();
      // 2) per-key table: 144 slots × [index, r, g, b]
      const t = new Uint8Array(9 * PACKET);
      for (const [li, [r, g, b]] of colors) {
        if (li < 0 || li > 143) continue;
        t[li * 4] = li; t[li * 4 + 1] = r; t[li * 4 + 2] = g; t[li * 4 + 3] = b;
      }
      t[574] = 0xaa; t[575] = 0x55;
      await this.begin();
      await this.send(this.cmd(CMD.CUSTOM_LIGHT, { packets: 9 }), { ack: true, label: 'CUSTOM_LIGHT' });
      await this.sendBulk(t, 'rgb');
      await this.commit();
      await this.refresh();
    });
  }

  // ---- read per-key RGB back (0x42b210, experimental) ----
  readCustomLighting() {
    return this.run(async () => {
      if (this.dryRun) { this.log('dry-run: 읽기는 건너뜀', 'warn'); return new Map(); }
      await this.send(this.cmd(CMD.READ_LIGHT, { packets: 9 }), { label: 'READ_LIGHT' });
      const all = new Uint8Array(9 * PACKET);
      for (let i = 0; i < 9; i++) {
        await sleep(CMD_DELAY);
        let r = new Uint8Array((await this.cfg.receiveFeatureReport(0)).buffer);
        if (r.length === PACKET + 1) r = r.subarray(1);
        all.set(r.subarray(0, PACKET), i * PACKET);
        this.log(`← rgb ${i + 1}/9 ${hex(r.subarray(0, 16))}…`, 'rx');
      }
      await this.commit();
      const out = new Map();
      for (let li = 0; li < 143; li++) out.set(li, [all[li * 4 + 1], all[li * 4 + 2], all[li * 4 + 3]]);
      return out;
    });
  }

  // ---- keymap (0x4185c0) ----
  // entries: Map<keyIndex, [b0,b1,b2,b3]>, fn: Fn layer
  setKeymap(entries, fn = false) {
    return this.run(async () => {
      const t = new Uint8Array(9 * PACKET);
      for (const [ki, e] of entries) if (ki >= 0 && ki < 144) t.set(e.slice(0, 4), ki * 4);
      t[574] = 0xaa; t[575] = 0x55;
      await this.begin();
      await this.send(this.cmd(fn ? CMD.KEYMAP_FN : CMD.KEYMAP, { packets: 9 }), { ack: true, label: fn ? 'KEYMAP_FN' : 'KEYMAP' });
      await this.sendBulk(t, 'keymap');
      await this.commit();
      await this.refresh();
    });
  }

  // ---- macros (0x42dba0) ----
  // macros: Array<Array<{t:'down'|'up'|'mdown'|'mup', code, delay}>>, at most 100
  static buildMacroTable(macros) {
    const buf = new Uint8Array(0xe00).fill(0);
    let off = 0x190; // 100 × 4-byte offset table
    macros.slice(0, 100).forEach((events, i) => {
      if (!events || !events.length) { buf.set([0xff, 0xff, 0xff, 0xff], i * 4); return; }
      buf[i * 4] = off & 0xff; buf[i * 4 + 1] = off >> 8;
      let n = 0;
      const put = (b0, b1, b2, b3) => {
        const p = off + 8 + n * 4;
        if (p + 4 > buf.length - 2) throw new Error('매크로 저장 공간이 부족합니다 (최대 3.5KB)');
        buf[p] = b0; buf[p + 1] = b1; buf[p + 2] = b2; buf[p + 3] = b3; n++;
      };
      for (const ev of events) {
        if (ev.t === 'down') put(0, 0, ev.code, 0xb0);
        else if (ev.t === 'up') put(0, 0, ev.code, 0x30);
        else if (ev.t === 'mdown') put(0, 0, ev.code, 0x90);
        else if (ev.t === 'mup') put(0, 0, ev.code, 0x10);
        const d = Math.max(10, ev.delay | 0);
        put(d & 0xff, (d >> 8) & 0xff, 0, 0x50);
      }
      buf[off] = n & 0xff; buf[off + 1] = n >> 8;
      off = off + n * 4 + 8;
    });
    const packets = Math.floor(off / PACKET) + (off % PACKET === 0 ? 1 : 2);
    const out = buf.subarray(0, packets * PACKET);
    out[packets * PACKET - 2] = 0xaa; out[packets * PACKET - 1] = 0x55;
    return { data: out, packets };
  }

  setMacros(macros) {
    return this.run(async () => {
      const { data, packets } = AK47.buildMacroTable(macros);
      await this.send(this.cmd(CMD.BEGIN_MACRO), { ack: true, label: 'BEGIN_MACRO' });
      await this.send(this.cmd(CMD.MACRO, { packets }), { ack: true, label: 'MACRO' });
      await sleep(30);
      await this.sendBulk(data, 'macro');
      await sleep(30);
      await this.commit();
    });
  }

  // ---- system settings (0x414020) ----
  setSystem({ winLock = 0, altF4Lock = 0, altTabLock = 0, fnSwitch = 0, sleepTime = 0, responseTime = 0 }) {
    return this.run(async () => {
      await this.begin();
      await this.send(this.cmd(CMD.SYSTEM, { b2: 1, packets: 1 }), { ack: true, label: 'SYSTEM' });
      const d = new Uint8Array(PACKET);
      d[0] = 0x00; d[1] = 0x01;
      d[2] = winLock ? 1 : 0; d[3] = altF4Lock ? 1 : 0; d[4] = altTabLock ? 1 : 0;
      d[5] = fnSwitch; d[6] = sleepTime; d[8] = responseTime;
      d[62] = 0xaa; d[63] = 0x55;
      await this.send(d, { label: 'system data' });
      await this.commit();
    });
  }

  // ---- TFT clock (0x423ae0) ----
  syncTime(date = new Date(), slot = 1) {
    return this.run(async () => {
      await this.begin();
      await this.send(this.cmd(CMD.TIME, { packets: 1 }), { ack: true, label: 'TIME' });
      const d = new Uint8Array(PACKET);
      d[1] = slot; d[2] = 0x5a;
      d[3] = date.getFullYear() % 2000; d[4] = date.getMonth() + 1; d[5] = date.getDate();
      d[6] = date.getHours(); d[7] = date.getMinutes(); d[8] = date.getSeconds();
      d[10] = date.getDay();
      d[62] = 0xaa; d[63] = 0x55;
      await this.send(d, { label: 'time data' });
      await this.commit();
    });
  }

  // ---- TFT animation (0x422b20) ----
  // frames: Array<{rgb565: Uint8Array(LCD_W*LCD_H*2), delay: ms}>
  static buildGif(frames) {
    frames = frames.slice(0, GIF_MAX_FRAMES);
    const frameBytes = LCD_W * LCD_H * 2;
    const size = GIF_HEAD + frames.length * frameBytes;
    const blocks = Math.ceil(size / LCD_BLOCK);
    const buf = new Uint8Array(blocks * LCD_BLOCK).fill(0xff);
    buf[0] = frames.length;
    frames.forEach((f, i) => {
      buf[1 + i] = Math.min(255, Math.max(1, Math.floor(f.delay / 2)));
      buf.set(f.rgb565, GIF_HEAD + i * frameBytes);
    });
    return { data: buf, blocks };
  }

  uploadGif(frames, slot = 1, onProgress = () => {}) {
    return this.run(async () => {
      const { data, blocks } = AK47.buildGif(frames);
      if (!this.lcd && !this.dryRun) throw new Error('LCD 인터페이스(4KB 출력 리포트)가 연결되어 있지 않습니다. "LCD 인터페이스 추가"를 눌러 주세요.');
      await this.begin();
      await this.send(this.cmd(CMD.LCD_GIF, { b2: slot, packets: blocks }), { ack: true, label: `LCD_GIF ${blocks} blocks` });
      for (let i = 0; i < blocks; i++) {
        const chunk = data.subarray(i * LCD_BLOCK, (i + 1) * LCD_BLOCK);
        if (this.dryRun) { if (i < 2 || i === blocks - 1) this.log(`→ lcd block ${i + 1}/${blocks} ${hex(chunk.subarray(0, 16))}…`, 'tx'); }
        else {
          const ackP = this.waitInput(this.lcd, 300);
          await this.lcd.sendReport(0, chunk);
          await ackP;
        }
        onProgress((i + 1) / blocks);
      }
      await this.commit();
    });
  }

  waitInput(dev, ms) {
    return new Promise((resolve) => {
      const t = setTimeout(() => { dev.removeEventListener('inputreport', h); resolve(null); }, ms);
      const h = (e) => { clearTimeout(t); dev.removeEventListener('inputreport', h); resolve(e.data); };
      dev.addEventListener('inputreport', h);
    });
  }
}

// RGBA (canvas) → RGB565 little-endian, row-major, top-down (mui.dll GetImageRGB565Data)
export function toRGB565(rgba, swap = false) {
  const out = new Uint8Array((rgba.length / 4) * 2);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 2) {
    const v = ((rgba[i] & 0xf8) << 8) | ((rgba[i + 1] & 0xfc) << 3) | (rgba[i + 2] >> 3);
    if (swap) { out[j] = v >> 8; out[j + 1] = v & 0xff; } else { out[j] = v & 0xff; out[j + 1] = v >> 8; }
  }
  return out;
}
