import { AK47, DEVICE_FILTERS, LIGHT_MODES, LCD_W, LCD_H, GIF_MAX_FRAMES, toRGB565 } from './protocol.js';
import { KEYS } from './layout.js';
import { HID_KEYS, CODE_TO_USAGE, USAGE_NAME, MODS, MOUSE, CONSUMER, SHORTCUTS, MACRO_MODES, encodeAction, describeAction, shortLabel } from './keycodes.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const el = (tag, { dataset, ...props } = {}, ...kids) => {
  const e = Object.assign(document.createElement(tag), props);
  if (dataset) Object.assign(e.dataset, dataset);
  e.append(...kids); return e;
};
const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const rgb2hex = ([r, g, b]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
const PALETTE = ['#ff0000', '#ff7a00', '#ffd400', '#00e000', '#00e5ff', '#0050ff', '#a000ff', '#ff00a0', '#ffffff'];

// ---------- state ----------
const STORE = 'ak47-web-v1';
const defaults = () => ({
  light: { mode: 11, color: '#ff0000', colorful: 1, brightness: 5, speed: 3, direction: 0 },
  custom: {}, customBrightness: 5,
  keymap: { base: {}, fn: {} },
  macros: [{ name: '매크로 1', events: [] }],
  system: { winLock: 0, altF4Lock: 0, altTabLock: 0, fnSwitch: 0, sleepTime: 0, responseTime: 1 },
});
let S = defaults();
try { const raw = localStorage.getItem(STORE); if (raw) S = Object.assign(defaults(), JSON.parse(raw)); } catch {}
let saveT;
const save = () => { clearTimeout(saveT); saveT = setTimeout(() => { try { localStorage.setItem(STORE, JSON.stringify(S)); } catch {} }, 200); };

// ---------- log (developer console only) / toast ----------
// Packet traces go to the browser console; open DevTools to inspect them.
function log(msg, cls = '') {
  (cls === 'err' ? console.error : cls === 'warn' ? console.warn : console.debug)(`[AK47] ${msg}`);
}
let toastT;
function toast(msg, err = false) {
  const t = $('#toast'); t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
  clearTimeout(toastT); toastT = setTimeout(() => (t.className = 'toast'), 2600);
}

// ---------- device ----------
const kb = new AK47({ log });
// Developer option: open with ?sim to browse the UI without a keyboard (packets go to the console).
kb.dryRun = new URLSearchParams(location.search).has('sim');
const hasHID = 'hid' in navigator;
if (!hasHID) { $('#unsupported').classList.remove('hidden'); $('#btnConnect').disabled = true; }

function updateStatus() {
  const on = !!kb.cfg || kb.dryRun;
  document.body.classList.toggle('connected', on);
  $('#app').classList.toggle('hidden', !on);
  $('#status').textContent = kb.dryRun ? '시뮬레이션' : kb.cfg ? `연결됨${kb.lcd ? ' · LCD' : ''}` : '';
  $('#btnDisconnect').classList.toggle('hidden', kb.dryRun);
}
async function requestAndAttach() {
  if (!hasHID) return toast('WebHID를 지원하지 않는 브라우저입니다', true);
  try {
    const devs = await navigator.hid.requestDevice({ filters: DEVICE_FILTERS });
    if (!devs.length) return;
    await kb.attach(devs);
    // Pick up sibling interfaces the user already granted earlier.
    await kb.attach((await navigator.hid.getDevices()).filter((d) => !devs.includes(d) && d !== kb.cfg && d !== kb.lcd));
    if (!kb.cfg) toast('설정용 인터페이스를 찾지 못했습니다. 목록의 다른 항목을 선택해 보세요.', true);
  } catch (e) { log(e.message, 'err'); toast(e.message, true); }
  updateStatus();
}
$('#btnConnect').onclick = requestAndAttach;
$('#btnLcd').onclick = requestAndAttach;
$('#btnDisconnect').onclick = async () => { await kb.detach(); log('연결 해제'); updateStatus(); };
if (hasHID) {
  navigator.hid.getDevices().then(async (ds) => {
    const mine = ds.filter((d) => DEVICE_FILTERS.some((f) => f.vendorId === d.vendorId && f.productId === d.productId));
    if (mine.length) { try { await kb.attach(mine); } catch (e) { log(e.message, 'err'); } updateStatus(); }
  });
  navigator.hid.addEventListener('disconnect', (e) => {
    if (e.device === kb.cfg) kb.cfg = null;
    if (e.device === kb.lcd) kb.lcd = null;
    log(`장치 분리됨: ${e.device.productName}`, 'warn'); updateStatus();
  });
  navigator.hid.addEventListener('connect', async (e) => {
    if (!DEVICE_FILTERS.some((f) => f.vendorId === e.device.vendorId && f.productId === e.device.productId)) return;
    try { await kb.attach([e.device]); } catch (err) { log(err.message, 'err'); } updateStatus();
  });
}
async function act(btn, fn, okMsg) {
  if (!kb.connected) return toast('키보드 연결이 끊어졌습니다. 다시 연결해 주세요', true);
  btn.disabled = true;
  try { await fn(); toast(okMsg); log(okMsg, 'ok'); }
  catch (e) { log(`오류: ${e.message}`, 'err'); toast(e.message, true); }
  finally { btn.disabled = false; }
}

// ---------- tabs ----------
$$('.tabs button').forEach((b) => (b.onclick = () => {
  $$('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.id === 'tab-' + b.dataset.tab));
}));
function swatches(container, onPick) {
  container.replaceChildren(...PALETTE.map((c) => el('button', { title: c, style: `background:${c}`, onclick: () => onPick(c) })));
}

// ---------- keyboard renderer ----------
const KB_X = 54, KB_Y = 29, KB_W = 692, KB_H = 246;
function renderKeyboard(container, { onDown, onEnter } = {}) {
  container.replaceChildren();
  const els = new Map();
  for (const k of KEYS) {
    const d = el('div', { className: 'k' }, el('span', { className: 'm' }), el('span', { className: 'n', textContent: k.name }));
    Object.assign(d.style, { left: `${((k.x - KB_X) / KB_W) * 100}%`, top: `${((k.y - KB_Y) / KB_H) * 100}%`, width: `${(k.w / KB_W) * 100}%`, height: `${(k.h / KB_H) * 100}%` });
    d.addEventListener('pointerdown', (e) => { e.preventDefault(); onDown?.(k, e); });
    d.addEventListener('pointerenter', (e) => { if (e.buttons & 1) onEnter?.(k, e); });
    container.append(d); els.set(k, d);
  }
  return els;
}

// ---------- 조명 모드 ----------
const modeGrid = $('#modeGrid');
modeGrid.replaceChildren(...LIGHT_MODES.map((m) => el('button', { dataset: { v: m.v }, onclick: () => { S.light.mode = m.v; save(); syncLight(); } }, el('span', { textContent: m.ko }), el('small', { textContent: m.en }))));
swatches($('#lightSwatches'), (c) => { S.light.color = c; S.light.colorful = 0; save(); syncLight(); });
function syncLight() {
  const L = S.light, m = LIGHT_MODES.find((x) => x.v === L.mode) || LIGHT_MODES[0];
  $$('#modeGrid button').forEach((b) => b.classList.toggle('on', +b.dataset.v === L.mode));
  $$('#tab-light [data-need]').forEach((f) => f.classList.toggle('hidden', !(m.f & +f.dataset.need)));
  $('#bri').value = L.brightness; $('#briOut').textContent = L.brightness;
  $('#spd').value = L.speed; $('#spdOut').textContent = L.speed;
  $$('#dirSeg button').forEach((b) => b.classList.toggle('on', +b.dataset.v === L.direction));
  $('#colorful').checked = !!L.colorful; $('#lightColor').value = L.color;
}
$('#bri').oninput = (e) => { S.light.brightness = +e.target.value; save(); syncLight(); };
$('#spd').oninput = (e) => { S.light.speed = +e.target.value; save(); syncLight(); };
$$('#dirSeg button').forEach((b) => (b.onclick = () => { S.light.direction = +b.dataset.v; save(); syncLight(); }));
$('#colorful').onchange = (e) => { S.light.colorful = e.target.checked ? 1 : 0; save(); };
$('#lightColor').oninput = (e) => { S.light.color = e.target.value; S.light.colorful = 0; save(); syncLight(); };
$('#applyLight').onclick = (e) => act(e.target, () => {
  const [r, g, b] = hex2rgb(S.light.color);
  return kb.setLighting({ ...S.light, r, g, b });
}, '조명 모드를 적용했습니다');
syncLight();

// ---------- 키별 조명 ----------
let eyedrop = false;
const customEls = renderKeyboard($('#kbCustom'), { onDown: paintKey, onEnter: paintKey });
function paintKey(k) {
  if (eyedrop) { const c = S.custom[k.li]; if (c) $('#paintColor').value = rgb2hex(c); eyedrop = false; $('#eyedrop').classList.remove('on'); return; }
  S.custom[k.li] = hex2rgb($('#paintColor').value); save(); syncCustom();
}
function syncCustom() {
  for (const [k, d] of customEls) {
    const c = S.custom[k.li];
    d.style.background = c ? rgb2hex(c) : '';
    d.classList.toggle('glow', !!c && c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11 > 140);
  }
  $('#cbri').value = S.customBrightness; $('#cbriOut').textContent = S.customBrightness;
}
swatches($('#paintSwatches'), (c) => ($('#paintColor').value = c));
$('#fillAll').onclick = () => { const c = hex2rgb($('#paintColor').value); KEYS.forEach((k) => (S.custom[k.li] = c)); save(); syncCustom(); };
$('#clearAll').onclick = () => { S.custom = {}; save(); syncCustom(); };
$('#eyedrop').onclick = (e) => { eyedrop = !eyedrop; e.target.classList.toggle('on', eyedrop); };
$('#cbri').oninput = (e) => { S.customBrightness = +e.target.value; save(); syncCustom(); };
$('#applyCustom').onclick = (e) => act(e.target, () => kb.setCustomLighting(new Map(Object.entries(S.custom).map(([li, c]) => [+li, c])), S.customBrightness), '키별 조명을 적용했습니다');
$('#readCustom').onclick = (e) => act(e.target, async () => {
  const m = await kb.readCustomLighting();
  const known = new Set(KEYS.map((k) => k.li));
  if (m.size) { S.custom = {}; for (const [li, c] of m) if (known.has(li) && (c[0] || c[1] || c[2])) S.custom[li] = c; save(); syncCustom(); }
}, '키보드에서 색을 읽었습니다');
syncCustom();

// ---------- 키 매핑 ----------
let layer = 'base', selKey = null, capturing = false;
const mapEls = renderKeyboard($('#kbMap'), { onDown: (k) => selectKey(k) });
function syncMap() {
  const lm = S.keymap[layer];
  for (const [k, d] of mapEls) {
    const a = lm[k.ki];
    d.querySelector('.m').textContent = shortLabel(a);
    d.classList.toggle('mapped', !!a);
    d.classList.toggle('locked', layer === 'fn' && k.fnLock);
    d.classList.toggle('sel', k === selKey);
  }
}
$$('#layerSeg button').forEach((b) => (b.onclick = () => {
  layer = b.dataset.v; $$('#layerSeg button').forEach((x) => x.classList.toggle('on', x === b));
  if (selKey && layer === 'fn' && selKey.fnLock) selKey = null;
  syncMap(); loadEditor();
}));
$('#resetLayer').onclick = () => { if (confirm(`${layer === 'fn' ? 'Fn' : '기본'} 레이어의 모든 지정을 지울까요?`)) { S.keymap[layer] = {}; save(); syncMap(); loadEditor(); } };
$('#applyKeymap').onclick = (e) => act(e.target, () => {
  const entries = new Map();
  for (const [ki, a] of Object.entries(S.keymap[layer])) entries.set(+ki, encodeAction(a));
  return kb.setKeymap(entries, layer === 'fn');
}, `${layer === 'fn' ? 'Fn' : '기본'} 레이어 키 매핑을 저장했습니다`);

// editor controls
$('#keMods').replaceChildren(...MODS.map((m) => el('label', {}, el('input', { type: 'checkbox', value: m.bit }), m.label)));
$('#keKey').replaceChildren(el('option', { value: 0, textContent: '(없음)' }), ...HID_KEYS.map(([u, n]) => el('option', { value: u, textContent: `${n}  (0x${u.toString(16).padStart(2, '0')})` })));
$('#keShortcut').replaceChildren(...SHORTCUTS.map((s, i) => el('option', { value: i, textContent: s.label })));
$('#keMouse').replaceChildren(...MOUSE.map((m) => el('option', { value: m.v, textContent: m.label })));
$('#keConsumer').replaceChildren(...CONSUMER.map((c) => el('option', { value: c.u, textContent: c.label })));
$('#keMacroMode').replaceChildren(...MACRO_MODES.map((m) => el('option', { value: m.v, textContent: `${m.v}: ${m.label}` })));
function fillMacroSelect() { $('#keMacro').replaceChildren(...S.macros.map((m, i) => el('option', { value: i, textContent: `#${i + 1} ${m.name}` }))); }
function showPane(type) { $$('.ke-pane').forEach((p) => p.classList.toggle('on', p.dataset.pane === type)); }
$('#keType').onchange = (e) => showPane(e.target.value);

function selectKey(k) {
  if (layer === 'fn' && k.fnLock) return toast('이 키는 Fn 레이어에서 바꿀 수 없습니다');
  selKey = k; syncMap(); loadEditor();
}
function loadEditor() {
  $('#keBody').classList.toggle('hidden', !selKey);
  if (!selKey) { $('#keSel').textContent = '— 키를 선택하세요'; return; }
  const a = S.keymap[layer][selKey.ki];
  $('#keSel').textContent = `— ${selKey.name} (${layer === 'fn' ? 'Fn 레이어' : '기본'}) : ${describeAction(a)}`;
  let type = a?.type || 'default';
  const sc = a?.type === 'key' ? SHORTCUTS.findIndex((s) => s.mods === a.mods && s.key === a.key) : -1;
  if (sc >= 0) { type = 'shortcut'; $('#keShortcut').value = sc; }
  $('#keType').value = type; showPane(type);
  $$('#keMods input').forEach((i) => (i.checked = a?.type === 'key' && !!(a.mods & +i.value)));
  $('#keKey').value = a?.type === 'key' ? a.key : selKey.code;
  if (a?.type === 'mouse') $('#keMouse').value = a.v;
  if (a?.type === 'consumer') $('#keConsumer').value = a.u;
  fillMacroSelect();
  if (a?.type === 'macro') { $('#keMacro').value = a.index; $('#keMacroMode').value = a.mode; $('#keMacroCount').value = a.count; }
}
$('#keSet').onclick = () => {
  if (!selKey) return;
  const t = $('#keType').value;
  let a = null;
  if (t === 'disable') a = { type: 'disable' };
  else if (t === 'key') {
    const mods = $$('#keMods input').reduce((m, i) => m | (i.checked ? +i.value : 0), 0);
    a = { type: 'key', mods, key: +$('#keKey').value };
    if (!mods && a.key === selKey.code) a = null; // same as default
  } else if (t === 'shortcut') { const s = SHORTCUTS[+$('#keShortcut').value]; a = { type: 'key', mods: s.mods, key: s.key }; }
  else if (t === 'mouse') a = { type: 'mouse', v: +$('#keMouse').value };
  else if (t === 'consumer') a = { type: 'consumer', u: +$('#keConsumer').value };
  else if (t === 'macro') a = { type: 'macro', index: +$('#keMacro').value || 0, mode: +$('#keMacroMode').value, count: Math.min(255, Math.max(1, +$('#keMacroCount').value || 1)) };
  if (a) S.keymap[layer][selKey.ki] = a; else delete S.keymap[layer][selKey.ki];
  save(); syncMap(); loadEditor();
};
$('#keCapture').onclick = (e) => { capturing = true; e.target.textContent = '키를 누르세요…'; };
window.addEventListener('keydown', (e) => {
  if (!capturing) return;
  e.preventDefault();
  const u = CODE_TO_USAGE.get(e.code);
  capturing = false; $('#keCapture').textContent = '키 눌러서 지정';
  if (u == null) return toast(`지원하지 않는 키: ${e.code}`, true);
  $('#keKey').value = u;
}, true);
syncMap();

// ---------- 매크로 ----------
let curMacro = 0, recording = false, lastT = 0;
function macroBytes() { try { return AK47.buildMacroTable(S.macros.map((m) => m.events)); } catch { return null; } }
function syncMacros() {
  curMacro = Math.min(curMacro, S.macros.length - 1);
  $('#macroList').replaceChildren(...S.macros.map((m, i) => el('li', { className: i === curMacro ? 'on' : '', onclick: () => { curMacro = i; syncMacros(); } },
    el('span', { textContent: `#${i + 1} ${m.name}` }), el('small', { textContent: `${m.events.length}개` }))));
  const m = S.macros[curMacro];
  $('#macroName').value = m?.name || '';
  const built = macroBytes();
  const used = built ? built.packets * 64 : 0xe00;
  $('#macroMeter').style.width = `${Math.min(100, (used / 0xe00) * 100)}%`;
  $('#macroSize').textContent = built ? `사용량 ${used} / ${0xe00} 바이트 (${built.packets}패킷)` : '저장 공간 초과! 이벤트를 줄이세요.';
  const body = $('#evBody');
  body.replaceChildren(...(m?.events || []).map((ev, i) => {
    const isKey = ev.t === 'down' || ev.t === 'up';
    const label = isKey ? (USAGE_NAME.get(ev.code) || `0x${ev.code.toString(16)}`) : ({ 1: '왼쪽', 2: '오른쪽', 4: '가운데' }[ev.code] || ev.code) + ' 버튼';
    const dn = ev.t === 'down' || ev.t === 'mdown';
    const inp = el('input', { type: 'number', min: 10, max: 65535, value: ev.delay, onchange: (e) => { ev.delay = Math.max(10, Math.min(65535, +e.target.value || 10)); save(); syncMacros(); } });
    return el('tr', {}, el('td', { textContent: i + 1 }), el('td', { className: dn ? 'dn' : 'up', textContent: (isKey ? '키 ' : '마우스 ') + (dn ? '누름 ↓' : '뗌 ↑') }),
      el('td', { textContent: label }), el('td', {}, inp),
      el('td', {}, el('button', { className: 'ghost sm', textContent: '✕', onclick: () => { m.events.splice(i, 1); save(); syncMacros(); } })));
  }));
  fillMacroSelect();
}
$('#macroAdd').onclick = () => { if (S.macros.length >= 100) return toast('매크로는 최대 100개입니다', true); S.macros.push({ name: `매크로 ${S.macros.length + 1}`, events: [] }); curMacro = S.macros.length - 1; save(); syncMacros(); };
$('#macroDel').onclick = () => {
  if (!S.macros.length || !confirm('선택한 매크로를 삭제할까요? 뒤 번호 매크로의 번호가 하나씩 당겨집니다.')) return;
  S.macros.splice(curMacro, 1); if (!S.macros.length) S.macros.push({ name: '매크로 1', events: [] });
  // keep keymap macro references pointing at the same macros
  for (const lm of Object.values(S.keymap)) for (const [ki, a] of Object.entries(lm)) if (a.type === 'macro') { if (a.index === curMacro) delete lm[ki]; else if (a.index > curMacro) a.index--; }
  save(); syncMacros(); syncMap();
};
$('#macroName').oninput = (e) => { if (S.macros[curMacro]) { S.macros[curMacro].name = e.target.value; save(); $$('#macroList li span')[curMacro].textContent = `#${curMacro + 1} ${e.target.value}`; fillMacroSelect(); } };
$('#evClear').onclick = () => { S.macros[curMacro].events = []; save(); syncMacros(); };
$('#evAddDelay').onclick = () => { const d = Math.max(10, +$('#defDelay').value || 30); S.macros[curMacro].events.forEach((e) => (e.delay = d)); save(); syncMacros(); };
const recPad = $('#recPad');
function setRec(on) {
  recording = on; lastT = 0;
  $('#recBtn').classList.toggle('on', on); $('#recBtn').textContent = on ? '■ 녹화 중지' : '● 녹화 시작';
  recPad.classList.toggle('on', on); recPad.textContent = on ? '녹화 중… (이 영역 안에서 입력)' : '녹화 중에는 이 영역에서 키보드와 마우스 버튼을 누르세요';
  if (on) recPad.focus();
}
function pushEv(t, code) {
  const now = performance.now(), evs = S.macros[curMacro].events, def = Math.max(10, +$('#defDelay').value || 30);
  if (evs.length && lastT && $('#recDelay').checked) evs[evs.length - 1].delay = Math.max(10, Math.min(65535, Math.round(now - lastT)));
  evs.push({ t, code, delay: def }); lastT = now; save(); syncMacros();
}
$('#recBtn').onclick = () => setRec(!recording);
recPad.addEventListener('keydown', (e) => { if (!recording) return; e.preventDefault(); if (e.repeat) return; const u = CODE_TO_USAGE.get(e.code); if (u != null) pushEv('down', u); });
recPad.addEventListener('keyup', (e) => { if (!recording) return; e.preventDefault(); const u = CODE_TO_USAGE.get(e.code); if (u != null) pushEv('up', u); });
const MBTN = { 0: 1, 1: 4, 2: 2 }; // DOM button → firmware mask (left=1, right=2, middle=4)
recPad.addEventListener('mousedown', (e) => { if (!recording || !(e.button in MBTN)) return; e.preventDefault(); pushEv('mdown', MBTN[e.button]); });
recPad.addEventListener('mouseup', (e) => { if (!recording || !(e.button in MBTN)) return; e.preventDefault(); pushEv('mup', MBTN[e.button]); });
recPad.addEventListener('contextmenu', (e) => recording && e.preventDefault());
recPad.addEventListener('blur', () => recording && setRec(false));
$('#applyMacros').onclick = (e) => act(e.target, () => kb.setMacros(S.macros.map((m) => m.events)), `매크로 ${S.macros.length}개를 저장했습니다`);
syncMacros();

// ---------- 시스템 ----------
const sysMap = { sysWin: 'winLock', sysAltF4: 'altF4Lock', sysAltTab: 'altTabLock', sysFn: 'fnSwitch', sysSleep: 'sleepTime', sysResp: 'responseTime' };
for (const [id, k] of Object.entries(sysMap)) {
  const i = $('#' + id);
  if (i.type === 'checkbox') { i.checked = !!S.system[k]; i.onchange = () => { S.system[k] = i.checked ? 1 : 0; save(); }; }
  else { i.value = S.system[k]; i.onchange = () => { S.system[k] = +i.value; save(); }; }
}
$('#applySystem').onclick = (e) => act(e.target, () => kb.setSystem(S.system), '시스템 설정을 저장했습니다');

// ---------- TFT ----------
setInterval(() => ($('#clockNow').textContent = new Date().toLocaleString('ko-KR', { hour12: false })), 500);
$('#syncTime').onclick = (e) => act(e.target, () => kb.syncTime(new Date()), '시간을 동기화했습니다');

let gifFrames = [], previewT;
const pv = $('#lcdPreview'), pctx = pv.getContext('2d');
function drawFit(ctx, src, sw, sh, fit) {
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, LCD_W, LCD_H);
  let dw = LCD_W, dh = LCD_H, dx = 0, dy = 0;
  if (fit !== 'stretch') {
    const s = fit === 'cover' ? Math.max(LCD_W / sw, LCD_H / sh) : Math.min(LCD_W / sw, LCD_H / sh);
    dw = sw * s; dh = sh * s; dx = (LCD_W - dw) / 2; dy = (LCD_H - dh) / 2;
  }
  ctx.drawImage(src, dx, dy, dw, dh);
}
async function decodeFrames(file) {
  const fit = $('#gifFit').value, out = [];
  const c = new OffscreenCanvas(LCD_W, LCD_H), ctx = c.getContext('2d', { willReadFrequently: true });
  if ('ImageDecoder' in window && file.type === 'image/gif') {
    const dec = new ImageDecoder({ data: await file.arrayBuffer(), type: file.type });
    await dec.tracks.ready;
    const n = Math.min(dec.tracks.selectedTrack.frameCount, GIF_MAX_FRAMES);
    for (let i = 0; i < n; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      drawFit(ctx, image, image.displayWidth, image.displayHeight, fit);
      out.push({ img: ctx.getImageData(0, 0, LCD_W, LCD_H), delay: Math.round((image.duration || 100000) / 1000) });
      image.close();
    }
    dec.close();
  } else {
    const bmp = await createImageBitmap(file);
    drawFit(ctx, bmp, bmp.width, bmp.height, fit);
    out.push({ img: ctx.getImageData(0, 0, LCD_W, LCD_H), delay: 1000 });
  }
  return out;
}
function playPreview() {
  clearTimeout(previewT);
  if (!gifFrames.length) return;
  let i = 0;
  const step = () => { const f = gifFrames[i]; pctx.putImageData(f.img, 0, 0); i = (i + 1) % gifFrames.length; if (gifFrames.length > 1) previewT = setTimeout(step, frameDelay(f)); };
  step();
}
const frameDelay = (f) => Math.max(2, Math.min(510, +$('#gifDelay').value || f.delay || 100));
async function loadGif() {
  const file = $('#gifFile').files[0];
  if (!file) return;
  try {
    gifFrames = await decodeFrames(file);
    $('#gifInfo').textContent = `${file.name} · ${gifFrames.length}프레임${gifFrames.length >= GIF_MAX_FRAMES ? ' (최대치로 잘림)' : ''} · 예상 크기 ${Math.ceil((256 + gifFrames.length * LCD_W * LCD_H * 2) / 1024)}KB`;
    $('#uploadGif').disabled = false; playPreview();
  } catch (e) { log(`이미지 읽기 실패: ${e.message}`, 'err'); toast('이미지를 읽지 못했습니다', true); }
}
$('#gifFile').onchange = loadGif; $('#gifFit').onchange = loadGif; $('#gifDelay').onchange = playPreview;
$('#uploadGif').onclick = (e) => act(e.target, async () => {
  const swap = $('#gifSwap').checked, prog = $('#gifProg');
  prog.classList.remove('hidden');
  const frames = gifFrames.map((f) => ({ rgb565: toRGB565(f.img.data, swap), delay: frameDelay(f) }));
  try { await kb.uploadGif(frames, 1, (p) => (prog.firstElementChild.style.width = `${p * 100}%`)); }
  finally { setTimeout(() => prog.classList.add('hidden'), 1500); }
}, '화면 애니메이션을 업로드했습니다');

updateStatus();
