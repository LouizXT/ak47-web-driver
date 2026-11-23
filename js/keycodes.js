// HID keyboard usages, browser KeyboardEvent.code → usage, and keymap entry encoding.

// [usage, label, KeyboardEvent.code]
export const HID_KEYS = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((c, i) => [0x04 + i, c, 'Key' + c]),
  ...'1234567890'.split('').map((c, i) => [0x1e + i, c, 'Digit' + c]),
  [0x28, 'Enter', 'Enter'], [0x29, 'Esc', 'Escape'], [0x2a, 'Backspace', 'Backspace'], [0x2b, 'Tab', 'Tab'],
  [0x2c, 'Space', 'Space'], [0x2d, '-', 'Minus'], [0x2e, '=', 'Equal'], [0x2f, '[', 'BracketLeft'],
  [0x30, ']', 'BracketRight'], [0x31, '\\', 'Backslash'], [0x33, ';', 'Semicolon'], [0x34, "'", 'Quote'],
  [0x35, '`', 'Backquote'], [0x36, ',', 'Comma'], [0x37, '.', 'Period'], [0x38, '/', 'Slash'],
  [0x39, 'CapsLock', 'CapsLock'],
  ...Array.from({ length: 12 }, (_, i) => [0x3a + i, 'F' + (i + 1), 'F' + (i + 1)]),
  [0x46, 'PrintScreen', 'PrintScreen'], [0x47, 'ScrollLock', 'ScrollLock'], [0x48, 'Pause', 'Pause'],
  [0x49, 'Insert', 'Insert'], [0x4a, 'Home', 'Home'], [0x4b, 'PageUp', 'PageUp'], [0x4c, 'Delete', 'Delete'],
  [0x4d, 'End', 'End'], [0x4e, 'PageDown', 'PageDown'], [0x4f, '→', 'ArrowRight'], [0x50, '←', 'ArrowLeft'],
  [0x51, '↓', 'ArrowDown'], [0x52, '↑', 'ArrowUp'], [0x53, 'NumLock', 'NumLock'],
  [0x54, 'Num /', 'NumpadDivide'], [0x55, 'Num *', 'NumpadMultiply'], [0x56, 'Num -', 'NumpadSubtract'],
  [0x57, 'Num +', 'NumpadAdd'], [0x58, 'Num Enter', 'NumpadEnter'],
  ...'1234567890'.split('').map((c, i) => [0x59 + i, 'Num ' + c, 'Numpad' + c]),
  [0x63, 'Num .', 'NumpadDecimal'], [0x64, 'ISO \\', 'IntlBackslash'], [0x65, 'Menu', 'ContextMenu'],
  ...Array.from({ length: 12 }, (_, i) => [0x68 + i, 'F' + (i + 13), 'F' + (i + 13)]),
  [0x87, 'Ro', 'IntlRo'], [0x88, 'Kana', 'KanaMode'], [0x89, 'Yen', 'IntlYen'],
  [0x90, '한/영', 'Lang1'], [0x91, '한자', 'Lang2'],
  [0xe0, 'L-Ctrl', 'ControlLeft'], [0xe1, 'L-Shift', 'ShiftLeft'], [0xe2, 'L-Alt', 'AltLeft'], [0xe3, 'L-Win', 'MetaLeft'],
  [0xe4, 'R-Ctrl', 'ControlRight'], [0xe5, 'R-Shift', 'ShiftRight'], [0xe6, 'R-Alt', 'AltRight'], [0xe7, 'R-Win', 'MetaRight'],
];
export const USAGE_NAME = new Map(HID_KEYS.map(([u, n]) => [u, n]));
export const CODE_TO_USAGE = new Map(HID_KEYS.map(([u, , c]) => [c, u]));
// Korean IME layouts report the 한/영 and 한자 keys as these on Windows
CODE_TO_USAGE.set('HangulMode', 0x90); CODE_TO_USAGE.set('Hanja', 0x91);

export const MODS = [
  { bit: 0x01, label: 'L-Ctrl' }, { bit: 0x02, label: 'L-Shift' }, { bit: 0x04, label: 'L-Alt' }, { bit: 0x08, label: 'L-Win' },
  { bit: 0x10, label: 'R-Ctrl' }, { bit: 0x20, label: 'R-Shift' }, { bit: 0x40, label: 'R-Alt' }, { bit: 0x80, label: 'R-Win' },
];

export const MOUSE = [
  { v: 1, label: '왼쪽 클릭', e: [0x01, 0x01, 0x01, 0] },
  { v: 2, label: '가운데 클릭', e: [0x01, 0x01, 0x04, 0] },
  { v: 3, label: '오른쪽 클릭', e: [0x01, 0x01, 0x02, 0] },
  { v: 4, label: '더블 클릭', e: [0x01, 0x01, 0x03, 0] },
  { v: 5, label: '휠 위로', e: [0x01, 0x03, 0x01, 0] },
  { v: 6, label: '휠 아래로', e: [0x01, 0x03, 0xff, 0] },
  { v: 7, label: '마우스 버튼 4 (뒤로)', e: [0x01, 0x01, 0x08, 0] },
  { v: 8, label: '마우스 버튼 5 (앞으로)', e: [0x01, 0x01, 0x10, 0] },
];

// Consumer-page usages (keymap entry [0x03, lo, hi, 0])
export const CONSUMER = [
  { u: 0xcd, label: '재생/일시정지' }, { u: 0xb7, label: '정지' }, { u: 0xb6, label: '이전 곡' }, { u: 0xb5, label: '다음 곡' },
  { u: 0xe9, label: '볼륨 +' }, { u: 0xea, label: '볼륨 -' }, { u: 0xe2, label: '음소거' },
  { u: 0x192, label: '계산기' }, { u: 0x18a, label: '메일' }, { u: 0x194, label: '내 컴퓨터' }, { u: 0x183, label: '미디어 플레이어' },
  { u: 0x223, label: '웹 홈' }, { u: 0x227, label: '웹 새로고침' }, { u: 0x226, label: '웹 중지' },
  { u: 0x224, label: '웹 뒤로' }, { u: 0x225, label: '웹 앞으로' }, { u: 0x22a, label: '웹 즐겨찾기' }, { u: 0x221, label: '웹 검색' },
];

export const SHORTCUTS = [
  { label: '바탕화면 보기 (Win+D)', mods: 0x08, key: 0x07 },
  { label: '내 컴퓨터 (Win+E)', mods: 0x08, key: 0x08 },
  { label: '컴퓨터 잠금 (Win+L)', mods: 0x08, key: 0x0f },
  { label: '창 닫기 (Ctrl+W)', mods: 0x01, key: 0x1a },
  { label: '창 전환 (Alt+Tab)', mods: 0x04, key: 0x2b },
  { label: '복사 (Ctrl+C)', mods: 0x01, key: 0x06 },
  { label: '붙여넣기 (Ctrl+V)', mods: 0x01, key: 0x19 },
  { label: '잘라내기 (Ctrl+X)', mods: 0x01, key: 0x1b },
];

// Macro playback modes (keymap entry [0x06, macroIndex, mode, count]).
// The numeric values are inferred from the driver's UI order; see PROTOCOL.md.
export const MACRO_MODES = [
  { v: 1, label: '지정 횟수 재생' },
  { v: 2, label: '다시 누를 때까지 반복' },
  { v: 3, label: '누르고 있는 동안 반복' },
];

// Keymap action → 4-byte entry (0x4185c0)
export function encodeAction(a) {
  switch (a?.type) {
    case 'disable': return [0x05, 0x03, 0, 0];
    case 'key': {
      let mods = a.mods | 0, key = a.key | 0;
      if (key >= 0xe0 && key <= 0xe7 && !mods) { mods = 1 << (key - 0xe0); key = 0; }
      return [0x02, mods, key, 0];
    }
    case 'mouse': return (MOUSE.find((m) => m.v === a.v) || MOUSE[0]).e.slice();
    case 'consumer': return [0x03, a.u & 0xff, (a.u >> 8) & 0xff, 0];
    case 'macro': return [0x06, a.index | 0, a.mode | 0, a.count | 0];
    default: return [0, 0, 0, 0];
  }
}

export function describeAction(a) {
  if (!a) return '기본값';
  switch (a.type) {
    case 'disable': return '비활성화';
    case 'key': {
      const parts = MODS.filter((m) => a.mods & m.bit).map((m) => m.label);
      if (a.key) parts.push(USAGE_NAME.get(a.key) || `0x${a.key.toString(16)}`);
      return parts.join('+') || '(없음)';
    }
    case 'mouse': return (MOUSE.find((m) => m.v === a.v) || {}).label || '마우스';
    case 'consumer': return (CONSUMER.find((c) => c.u === a.u) || {}).label || `미디어 0x${a.u.toString(16)}`;
    case 'macro': return `매크로 #${a.index + 1}`;
    default: return '기본값';
  }
}

export function shortLabel(a) {
  if (!a) return '';
  switch (a.type) {
    case 'disable': return '⦸';
    case 'key': return describeAction(a).replace(/L-|R-/g, '');
    case 'mouse': return '🖱';
    case 'consumer': return '♪';
    case 'macro': return 'M' + (a.index + 1);
    default: return '';
  }
}
