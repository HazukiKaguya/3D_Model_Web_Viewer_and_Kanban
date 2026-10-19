/**
 * i18n/index.js —— 多语文案加载器（JSON 驱动 · 支持运行时切换语言 ✓）
 *
 *   语言来源（优先级）：URL ?lang=xx → window.__ba3dLang → <html lang> → 中文
 *   每个语言一个目录：i18n/<lang>/labels.json（动态标签）· page.json（页面静态文案）
 *      panel.json（面板/控件标签）· notes.json（面板长句说明）
 *   加新语言：复制 i18n/zh → 翻译 json → LANGS/PAGES/PANELS/NOTES 里各加一行 ✓
 *
 *   ⚠️ 运行中切换语言用 `setLang(code)` + `applyPageI18n()`：
 *      页面文本会被「当前语言 → 中文原文 → 目标语言」两段映射翻回去 ✓
 *      （所以可以反复来回切，不需要刷新页面 ✓ 自定义模型与参数也就不会丢 ✓）
 */
import zhLabels from './zh/labels.json' with { type: 'json' };
import enLabels from './en/labels.json' with { type: 'json' };
import jaLabels from './ja/labels.json' with { type: 'json' };
import koLabels from './ko/labels.json' with { type: 'json' };
import zhTwLabels from './zh-TW/labels.json' with { type: 'json' };
import zhPage from './zh/page.json' with { type: 'json' };
import enPage from './en/page.json' with { type: 'json' };
import jaPage from './ja/page.json' with { type: 'json' };
import koPage from './ko/page.json' with { type: 'json' };
import zhTwPage from './zh-TW/page.json' with { type: 'json' };
import zhPanel from './zh/panel.json' with { type: 'json' };
import enPanel from './en/panel.json' with { type: 'json' };
import jaPanel from './ja/panel.json' with { type: 'json' };
import koPanel from './ko/panel.json' with { type: 'json' };
import zhTwPanel from './zh-TW/panel.json' with { type: 'json' };
import zhNotes from './zh/notes.json' with { type: 'json' };
import enNotes from './en/notes.json' with { type: 'json' };
import jaNotes from './ja/notes.json' with { type: 'json' };
import koNotes from './ko/notes.json' with { type: 'json' };
import zhTwNotes from './zh-TW/notes.json' with { type: 'json' };

/** 已注册语言 */
export const LANGS = { zh: zhLabels, en: enLabels, ja: jaLabels, ko: koLabels, 'zh-tw': zhTwLabels };
/** 页面静态文案（中文原文 → 该语言） */
const PAGES = {
  zh: zhPage, en: enPage, ja: jaPage, ko: koPage, 'zh-tw': zhTwPage,
};
/** 面板/控件标签（中文原文 → 该语言）*/
const PANELS = { zh: zhPanel, en: enPanel, ja: jaPanel, ko: koPanel, 'zh-tw': zhTwPanel };
/** 面板长句说明 */
const NOTES = { zh: zhNotes, en: enNotes, ja: jaNotes, ko: koNotes, 'zh-tw': zhTwNotes };

/** 语言名规范化：zh-TW / zhtw / zh-hant / zh_HK ⇒ 'zh-tw'；未知 ⇒ '' */
export function normalizeLang(raw) {
  let v = String(raw == null ? '' : raw).toLowerCase().replace('_', '-').trim();
  if (!v) return '';
  if (/^zh-?(tw|hant|hk|mo)$/.test(v) || v === 'zhtw') return 'zh-tw';
  v = v.slice(0, 2);
  return Object.prototype.hasOwnProperty.call(LANGS, v) ? v : '';
}

function detectLang() {
  let v = '';
  try {
    const q = new URLSearchParams(location.search).get('lang');
    if (q) v = q;
  } catch (e) { /* file:// 下可能没有 search ✓ */ }
  if (!v && typeof window !== 'undefined' && window.__ba3dLang) v = window.__ba3dLang;
  if (!v && typeof document !== 'undefined' && document.documentElement) v = document.documentElement.lang || '';
  return normalizeLang(v) || 'zh';
}

/** 当前语言（运行时可变 ⇒ 其它模块用 live binding 也能看到新值 ✓）*/
export let LANG_CODE = detectLang();

/** 当前语言标签对象 */
export let LABELS = LANGS[LANG_CODE] || zhLabels;

/** 取词 */
export function PICK(zhText, enText, jaText) {
  return LANG_CODE === 'en' ? enText : LANG_CODE === 'ja' ? jaText : zhText;
}

/** 当前语言的「中文原文 → 该语言」总表 */
function mapsOf(code) {
  return Object.assign({}, PAGES[code] || {}, PANELS[code] || {}, NOTES[code] || {});
}

/** 标签树：中文值 → 目标语言值 */
function labelPairs(code) {
  const out = new Map();
  const cur = LANGS[code] || zhLabels;
  const walk = (a, b) => {
    if (a && typeof a === 'object') {
      for (const k of Object.keys(a)) walk(a[k], b ? b[k] : undefined);
      return;
    }
    if (typeof a === 'string' && typeof b === 'string' && a !== b) out.set(a, b);
  };
  walk(zhLabels, cur);
  return out;
}

/** 反查表：该语言文本 → 中文原文（用于「已经翻过一次」的 DOM 再翻成别的语言 ✓）*/
function reverseOf(code) {
  const out = new Map();
  for (const [k, v] of Object.entries(mapsOf(code))) {
    if (v && v !== k) out.set(String(v).trim(), k);
  }
  for (const [zhVal, curVal] of labelPairs(code)) out.set(String(curVal).trim(), zhVal);
  return out;
}

/**
 * 把页面文本翻译成当前语言 ✓ 可重复调用 ✓ 可跨语言来回切 ✓
 * 匹配顺序：
 *   ① 文本本身是中文原文（首次进入页面）⇒ 直接换成目标语言
 *   ② 文本是「上一次翻译的产物」⇒ 反查回中文原文，再换成目标语言
 */
/**
 * 把页面文本翻译成当前语言 ✓ 可重复调用 ✓ 可跨语言来回切 ✓
 *
 *   · **首次翻译时记住中文原文**（WeakMap，挂在节点上）
 *     ⇒ 之后无论切到哪种语言，都是从「中文原文」重新翻 ✓ 切回中文也能精确还原 ✓
 *     ⇒ 不依赖「反查表」，不会被同义/重复值搞混 ✓
 *   · 覆盖：文本节点 · title/placeholder/aria-label/alt · <title>
 */
const ORIG_TEXT = new WeakMap();
const ORIG_ATTR = new WeakMap();
let ORIG_TITLE = null;

export function applyPageI18n(root = (typeof document !== 'undefined' ? document.body : null)) {
  if (!root) return 0;
  const target = mapsOf(LANG_CODE);
  const lbl = labelPairs(LANG_CODE);
  const isZh = LANG_CODE === 'zh';
  let n = 0;

  /** 前缀词表（材质：xxx / 编辑姿势：xxx / 模型部件（12）这类拼接串 ✓）*/
  const prefixes = Object.keys(target).filter((k) => /[：:（(]$/.test(k)).sort((a, b) => b.length - a.length);

  /** 从中文原文得到目标语言文本；返回 '' = 这条没有译文 */
  const translate = (zhText) => {
    if (!zhText) return '';
    if (target[zhText]) return target[zhText];
    if (lbl.has(zhText)) return lbl.get(zhText);
    for (const k of prefixes) {
      if (zhText.startsWith(k)) return target[k] + zhText.slice(k.length);
    }
    return '';
  };

  /* ① 文本节点 */
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const node of nodes) {
    // 语言切换条自身不做翻译（标签固定用各语言母语写法 ✓）
    if (node.parentElement && node.parentElement.closest && node.parentElement.closest('[data-ba3d-noi18n]')) continue;
    const raw = node.nodeValue;
    const t = raw && raw.trim();
    if (!t) continue;
    let zh = ORIG_TEXT.get(node);
    if (zh === undefined) {
      const known = !!translate(t) || mapsOf('zh')[t] === t;   // 只对「能翻的词」记原文
      if (!known) continue;
      zh = t;
      ORIG_TEXT.set(node, zh);
    }
    const next = isZh ? zh : translate(zh);
    if (!next || next === t) continue;
    node.nodeValue = raw.replace(t, next);
    n++;
  }

  /* ② 元素属性：title / placeholder / aria-label / alt */
  const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
  const ewalker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT, null);
  const els = [];
  while (ewalker.nextNode()) els.push(ewalker.currentNode);
  for (const el of els) {
    if (el.closest && el.closest('[data-ba3d-noi18n]')) continue;
    let store = ORIG_ATTR.get(el);
    for (const attr of ATTRS) {
      const v = el.getAttribute && el.getAttribute(attr);
      if (!v) continue;
      const vt = v.trim();
      if (!store) { store = new Map(); ORIG_ATTR.set(el, store); }
      let zh = store.get(attr);
      if (zh === undefined) {
        if (!translate(vt)) continue;
        zh = vt;
        store.set(attr, zh);
      }
      const next = isZh ? zh : translate(zh);
      if (!next || next === vt) continue;
      el.setAttribute(attr, next);
      n++;
    }
  }

  /* ③ <title> */
  if (typeof document !== 'undefined' && document.title) {
    if (ORIG_TITLE === null) { if (translate(document.title)) ORIG_TITLE = document.title; }
    const next = ORIG_TITLE === null ? '' : (isZh ? ORIG_TITLE : translate(ORIG_TITLE));
    if (next && next !== document.title) { document.title = next; n++; }
  }

  if (document && document.documentElement) document.documentElement.lang = (LANG_CODE === 'zh-tw' ? 'zh-TW' : LANG_CODE);
  return n;
}

export function setLang(code) {
  const next = normalizeLang(code);
  if (!next) return LANG_CODE;
  LANG_CODE = next;
  LABELS = LANGS[next] || zhLabels;
  if (typeof window !== 'undefined') window.__ba3dLang = (next === 'zh-tw' ? 'zh-TW' : next);
  if (document && document.documentElement) document.documentElement.lang = (next === 'zh-tw' ? 'zh-TW' : next);
  return LANG_CODE;
}

/** 当前语言的「URL 用」写法：zh / zh-TW / en / ja / ko */
export function langParam() {
  return LANG_CODE === 'zh-tw' ? 'zh-TW' : LANG_CODE;
}

/**
 * 页面/面板会动态重建 ⇒ 监听 DOM 变化，自动补翻译（幂等 ✓ 防抖 ✓）
 */
export function startI18nObserver() {
  if (typeof document === 'undefined' || !document.body) return;
  let timer = 0;
  const run = () => { try { applyPageI18n(); } catch (e) { /* 忽略单次失败 ✓ */ } };
  const obs = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  });
  obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  run();
}

/** 语言切换条：当前语言加粗不可点，其余为链接（保留除 lang 外的 query 参数 ✓）*/
const SWITCH_ITEMS = [
  ['zh', '简体中文'],
  ['zh-TW', '繁體中文'],
  ['en', 'English'],
  ['ja', '日本語'],
  ['ko', '한국어'],
];

/**
 * 渲染切换条 ✓
 * 点击时若页面提供了 `window.ba3dApplyLang`（index.html 里定义）⇒ **原地切换不刷新** ✓
 * 没有的话就退化成普通链接跳转 ✓
 */
export function mountLangSwitch(el) {
  if (typeof document === 'undefined') return null;
  const box = el || document.getElementById('ba3dLangSwitch');
  if (!box) return null;
  let params;
  try { params = new URLSearchParams((typeof location !== 'undefined' && location.search) || ''); } catch (e) { params = new URLSearchParams(''); }
  params.delete('lang');
  const rest = params.toString();
  const suffix = rest ? '&' + rest : '';
  box.textContent = '';
  const lab = document.createElement('span');
  lab.className = 'bls-label';
  lab.textContent = 'Language';
  box.appendChild(lab);
  for (const [code, text] of SWITCH_ITEMS) {
    const sep = document.createElement('span');
    sep.className = 'bls-sep';
    sep.textContent = '|';
    box.appendChild(sep);
    const active = normalizeLang(code) === LANG_CODE;
    if (active) {
      const cur = document.createElement('span');
      cur.className = 'bls-cur';
      cur.textContent = text;
      cur.setAttribute('aria-current', 'true');
      box.appendChild(cur);
    } else {
      const a = document.createElement('a');
      a.className = 'bls-link';
      a.href = '?lang=' + encodeURIComponent(code) + suffix;
      a.dataset.lang = code;
      a.textContent = text;
      a.addEventListener('click', (ev) => {
        const fn = (typeof window !== 'undefined') ? window.ba3dApplyLang : null;
        if (typeof fn === 'function') {
          ev.preventDefault();
          fn(code);
        }
      });
      box.appendChild(a);
    }
  }
  return box;
}

export default { LANGS, get LANG_CODE() { return LANG_CODE; }, get LABELS() { return LABELS; }, PICK, applyPageI18n, setLang, langParam, normalizeLang, startI18nObserver, mountLangSwitch };
