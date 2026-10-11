/**
 * liltoon-bridge.js —— three-liltoon 适配层（M3 集成用）
 *
 * 目标：把「我们的 lilCfg / Unity 材质」喂给 `@mochiya/three-liltoon` 的运行时，
 *       同时**描边走我们自己的实现**（他们发布版的描边实测不可用）。
 *
 * ── 三个已实测的坑（本文件把它们固化成代码，避免以后再踩）──────────────
 *
 *  ① UV 约定：他们的 `normalizeLilToonTexture()` **强制 `texture.flipY = false`**
 *     （glTF 约定，原点左上）。而 three 的 FBXLoader 产出的是 FBX/OpenGL 约定
 *     （原点左下），原本靠 three 默认的 `flipY = true` 抵消 ⇒ 被他们关掉后贴图上下镜像。
 *     症状：袖子采到贴图里的粉白区、腿上采到深色区、头发发白。
 *     ⇒ **FBX 几何体必须调 `flipVForGltfConvention()`**；GLB 不用（本来就是 glTF 约定）。
 *
 *  ② URP 别名：`.mat` / glTF 扩展里可能同时有 `_BaseMap` / `_BaseColorMap`
 *     指向主贴图，而 lilToon 把它们当 `_MainTex` 的别名 ⇒ 按顺序 setTexture
 *     时**后设的会覆盖先设的**。⇒ `rawToProps()` 默认跳过这两个。
 *
 *  ③ 描边：他们发布版会创建描边代理并绘制（draw calls +1），但选到的顶点程序
 *     里 `_OutlineWidth` 只声明不使用 ⇒ 外壳不外扩 ⇒ 被本体遮住，任何宽度都看不见。
 *     ⇒ 描边一律交给我们自己的 `setLilOutline()`（字段名与 lilToon 1:1，见 `outlineFromRaw`）。
 *
 * 依赖 `assets/lilmap.inline.js`（228 条 `{我们的键 p, lilToon 属性名 l, 类型 t}` 双向映射）。
 */

import { LIL_MAP, LIL_BY_NAME } from './assets/lilmap.inline.js';

/** vendored 库的位置（index.html 用相对路径 ⇒ 打包与非打包两条路都能用） */
export const VENDOR_BASE = './vendor/three-liltoon';

/** 赋值贴图时要跳过的 URP 兼容别名（见文件头 ②） */
export const URP_TEX_ALIASES = ['_BaseMap', '_BaseColorMap'];

let _lib = null;
let _enableLease = null;
/** 「跳过无法归一化的字段」只报一次（同一批字段每个材质都会出现，否则刷屏） */
const _skipReported = new Set();

/**
 * 加载他们库的运行时（懒加载：只有切到这个后端才下载那 2.2 MB）
 * @returns {Promise<{LilToonMaterial:any, enableLilToon:Function}>}
 */
export async function loadBackend(base = VENDOR_BASE) {
  if (_lib) return _lib;
  const root = String(base).replace(/\/+$/, '');      // 去掉结尾斜杠，避免 //index.js
  _lib = await import(/* @vite-ignore */ root + '/index.js');
  return _lib;
}

/** 在渲染器上装好他们的自动 pass（描边/毛发/透明等），返回释放函数 */
export async function enableBackend(renderer, base = VENDOR_BASE) {
  const lib = await loadBackend(base);
  _enableLease = lib.enableLilToon(renderer);
  return _enableLease;
}

/* ------------------------------------------------------------------ *
 * 路径取值/写值（LIL_MAP 的 p 是点号路径，如 "outline.width" / "main2nd.color"）
 * ------------------------------------------------------------------ */

function getPath(obj, path) {
  let cur = obj;
  for (const k of path.split('.')) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[k];
  }
  return cur;
}

function setPath(obj, path, value) {
  const ks = path.split('.');
  let cur = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    if (typeof cur[ks[i]] !== 'object' || cur[ks[i]] === null) cur[ks[i]] = {};
    cur = cur[ks[i]];
  }
  cur[ks[ks.length - 1]] = value;
}

const isTextureType = (t) => t === 'texture';

const num = (x, d) => { const n = Number(x); return isFinite(n) ? n : (d === undefined ? 0 : d); };

/**
 * 颜色统一成 [r,g,b,a] 数组。
 *
 * ⚠️ 必须覆盖字符串形式：我们的 lilCfg 里有些颜色字段是 CSS 写法（'#ffffff'），
 *   直接塞给 three 的 uniform4fv 会抛
 *   "The provided value cannot be converted to a sequence"（实测 75 个报错）。
 *   归一化不了的一律返回 null ⇒ 调用方跳过，绝不把垃圾值塞进 uniform。
 */
function normColor(v) {
  if (Array.isArray(v) && v.length >= 3) return [num(v[0]), num(v[1]), num(v[2]), v[3] === undefined ? 1 : num(v[3], 1)];
  if (typeof v === 'number') {          // 0xRRGGBB
    return [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255, 1];
  }
  if (typeof v === 'string') {
    const s = v.trim();
    const hex = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
    if (hex) {
      let h = hex[1];
      if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
      return [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255,
        parseInt(h.slice(4, 6), 16) / 255, h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1];
    }
    const rgb = /^rgba?\(([^)]+)\)$/i.exec(s);
    if (rgb) {
      const p = rgb[1].split(',').map((x) => parseFloat(x));
      if (p.length >= 3 && p.every((x) => isFinite(x))) {
        return [p[0] / 255, p[1] / 255, p[2] / 255, p[3] === undefined ? 1 : p[3]];
      }
    }
    return null;
  }
  if (v && typeof v === 'object') {
    if ('r' in v) return [num(v.r), num(v.g), num(v.b), v.a === undefined ? 1 : num(v.a, 1)];
    if ('x' in v) return [num(v.x), num(v.y), num(v.z), v.w === undefined ? 1 : num(v.w, 1)];   // Vector4 当颜色
  }
  return null;
}

/** 向量（vec2/3/4）统一成数字数组；归一化不了返回 null */
function normVector(v) {
  if (Array.isArray(v)) {
    const a = v.map((x) => num(x, NaN));
    return a.length && a.every((x) => isFinite(x)) ? a : null;
  }
  if (v && typeof v === 'object') {
    const a = ['x', 'y', 'z', 'w'].map((k) => v[k]).filter((x) => x !== undefined);
    if (a.length >= 2 && a.every((x) => typeof x === 'number' && isFinite(x))) return a;
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 我们的 lilCfg → 他们的 properties
 * ------------------------------------------------------------------ */

/**
 * 把我们的 lilCfg 转成 lilToon 原名属性袋（贴图不在此列，交给 texturesOf()）
 * @param {object} cfg 我们的 lilCfg（可含嵌套 outline / main2nd / main3rd / rim ...）
 * @param {object} [opt] { only: string[] 只输出这些 lilToon 属性名 }
 */
export function cfgToProps(cfg, opt = {}) {
  const out = {};
  const skipped = [];
  const only = opt.only ? new Set(opt.only) : null;
  for (const { p, l, t } of LIL_MAP) {
    if (isTextureType(t)) continue;                 // 贴图另走 setTexture
    if (only && !only.has(l)) continue;
    const v = getPath(cfg, p);
    if (v === undefined || v === null) continue;
    if (t === 'color') {
      const c = normColor(v);
      if (c) out[l] = c; else skipped.push(l + '(color)');
      continue;
    }
    if (t === 'vector') {
      const a = normVector(v);
      if (a) out[l] = a; else skipped.push(l + '(vector)');
      continue;
    }
    if (t === 'float' || t === 'range' || t === 'int') {
      const n = num(v, NaN);
      if (isFinite(n)) out[l] = n; else skipped.push(l + '(' + t + ')');
      continue;
    }
    out[l] = v;
  }
  /**
   * ★★ 描边属性一律**不交给他们**（`stripOutline` 默认开）。
   *
   * 为什么必须做：他们的 `AutomaticPasses` 会根据
   *   `renderMode !== 'transparent' && _UseOutline !== 0 && _OutlineWidth > 0`
   * 自动加一个描边代理网格。而他们的描边实测不可用 ——
   * 在我们这套配置下它会画出一大坨**深紫色实体外壳**把角色整个盖住
   * （颜色正是我们的 `_OutlineColor`，所以一眼能认出来）。
   *
   * 这不是"可选优化"：只要把 `outline.enable/width` 映射过去，
   * 就会出现那个巨大的色块（用户实测报过）。
   * **描边由我们自己的 setLilOutline() 负责**，所以这里必须清干净。
   */
  if (opt.stripOutline === false && out._OutlineWidth !== undefined) {
    out._OutlineWidth = out._OutlineWidth * 0.01;   // 临时实验：单位换算
  }
  if (opt.stripOutline !== false) {
    for (const k of Object.keys(out)) if (k.indexOf('_Outline') === 0) delete out[k];
    out._UseOutline = 0;
  }
  if (skipped.length && !opt.quietSkip) {
    /* 只报一次，别把控制台刷满（同一批字段每个材质都会出现） */
    const key = skipped.join(',');
    if (!_skipReported.has(key)) { _skipReported.add(key); console.debug('[bridge] 跳过无法归一化的字段：' + key); }
  }
  return out;
}

/** 我们的 lilCfg 里的贴图字段 → { lilToon 属性名: 贴图URL或贴图对象 } */
export function cfgTextures(cfg) {
  const out = {};
  for (const { p, l, t } of LIL_MAP) {
    if (!isTextureType(t)) continue;
    const v = getPath(cfg, p);
    if (v === undefined || v === null) continue;
    if (typeof v === 'string' || (v && v.url)) out[l] = (v && v.url) ? v.url : v;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Unity 材质（lilToon 原名属性袋）→ 他们的 properties
 * ------------------------------------------------------------------ */

/**
 * 直接吃 `.mat` 解析出来的属性袋（或 glTF 扩展里的 MOCHIYA_materials_liltoon）
 * @param {object} raw  { _UseShadow:1, _Color:[...], _MainTex:{url}, ... }
 * @param {object} [opt] { keepAliases: boolean 是否保留 _BaseMap/_BaseColorMap（默认丢）}
 */
export function rawToProps(raw, opt = {}) {
  const out = {};
  const drop = opt.keepAliases ? [] : URP_TEX_ALIASES;
  for (const [k, v] of Object.entries(raw || {})) {
    if (drop.indexOf(k) >= 0) continue;
    if (v && typeof v === 'object' && ('url' in v || 'isTexture' in v || 'image' in v)) continue; // 贴图
    if (Array.isArray(v) && v.length === 4 && typeof v[0] === 'number') { out[k] = v.slice(); continue; }
    out[k] = v;
  }
  /* 同 cfgToProps：描边属性不交给他们（他们的描边会画出巨大色块，见那边的注释） */
  if (opt.stripOutline !== false) {
    for (const k of Object.keys(out)) if (k.indexOf('_Outline') === 0) delete out[k];
    out._UseOutline = 0;
  }
  return out;
}

/** 从属性袋里挑出贴图 { lilToon 属性名: url|Texture } */
export function rawTextures(raw, opt = {}) {
  const out = {};
  const drop = opt.keepAliases ? [] : URP_TEX_ALIASES;
  for (const [k, v] of Object.entries(raw || {})) {
    if (drop.indexOf(k) >= 0) continue;
    if (typeof v === 'string' && /\.(?:png|jpg|jpeg|tga|psd|webp)$/i.test(v)) { out[k] = v; continue; }
    if (v && typeof v === 'object' && ('url' in v || 'isTexture' in v)) out[k] = v.url || v;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * ① UV 约定补偿
 * ------------------------------------------------------------------ */

/**
 * 把 FBX 几何体的 UV 翻成 glTF 约定（V → 1-V）
 *
 * ⚠️ 只在**源的 UV 是 FBX/OpenGL 约定**时调用。GLB/glTF 源不要调（本来就是左上原点）。
 * 判定依据建议：加载器是 FBXLoader ⇒ 要翻；GLTFLoader ⇒ 不翻。
 *
 * @returns {number} 处理过的网格数
 */
export function flipVForGltfConvention(root) {
  let n = 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    for (const key of Object.keys(o.geometry.attributes)) {
      if (!/^uv\d*$/.test(key)) continue;
      const a = o.geometry.attributes[key];
      for (let i = 0; i < a.count; i++) a.setY(i, 1 - a.getY(i));
      a.needsUpdate = true;
    }
    n++;
  });
  return n;
}

/** 反操作（幂等实验/回滚用） */
export function unflipV(root) { return flipVForGltfConvention(root); }

/* ------------------------------------------------------------------ *
 * ③ 描边：材质里的 _Outline* → 我们自己描边的字段
 * ------------------------------------------------------------------ */

/** 我们描边实现接受的字段（与 viewer.js setLilOutline 的 ALLOW 表一致） */
export const OUTLINE_FIELDS = ['enable', 'color', 'tex', 'width', 'widthMask', 'fixWidth', 'vertexR2Width',
  'zBias', 'cull', 'litEnable', 'litColor', 'litScale', 'litOffset', 'skipPattern', 'fixWidthMode',
  'litApplyTex', 'vectorTex', 'vectorScale', 'vectorUVMode', 'litShadowReceive', 'litShadowBlur',
  'shaderColorMult', 'litShadowDebug'];

/**
 * lilToon 原名属性袋 → 我们的 outline 配置
 * （两边命名本就一一对应：_OutlineWidth → outline.width，_OutlineLitScale → outline.litScale …）
 */
export function outlineFromRaw(raw) {
  const out = {};
  for (const [l, arr] of Object.entries(LIL_BY_NAME)) {
    if (!/^_Outline/.test(l)) continue;
    if (!(l in (raw || {}))) continue;
    for (const { p, t } of arr) {
      if (p.indexOf('outline.') !== 0) continue;
      const field = p.slice('outline.'.length);
      if (OUTLINE_FIELDS.indexOf(field) < 0) continue;
      const v = raw[l];
      if (t === 'color') {
        const c = normColor(v);
        if (c) out[field] = c;                 // 归一化不了就跳过，不塞垃圾值
        continue;
      }
      if (t === 'vector') {
        const a = normVector(v);
        if (a) out[field] = a;
        continue;
      }
      out[field] = v;
    }
  }
  return out;
}

/** 我们的 outline 配置 → lilToon 原名（导出/回写 Unity 时用，方向与上面相反） */
export function outlineToRaw(outline) {
  const out = {};
  for (const { p, l, t } of LIL_MAP) {
    if (p.indexOf('outline.') !== 0) continue;
    const field = p.slice('outline.'.length);
    if (!(field in (outline || {}))) continue;
    const v = outline[field];
    out[l] = (t === 'color') ? normColor(v) : v;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * 材质构建
 * ------------------------------------------------------------------ */

/**
 * 用他们的运行时建一个表面材质（不含描边）
 * @param {any} lib loadBackend() 的返回值
 * @param {object} properties lilToon 原名属性袋
 * @param {object} [opt] { plain: boolean 用默认参数补全 }
 */
export function createSurfaceMaterial(lib, properties, opt = {}) {
  const mat = new lib.LilToonMaterial({ properties: properties || {} });
  if (opt.plain) { /* 留口子：以后需要"纯净参数"时在这里补 */ }
  return mat;
}

/**
 * 给材质挂贴图（跳过 URP 别名；按语义给色彩空间）
 * @param {any} material 他们的材质
 * @param {Record<string, any>} texMap { lilToon 属性名: Texture }
 */
export function applyTextures(material, texMap) {
  const done = [], failed = [];
  for (const [name, tex] of Object.entries(texMap || {})) {
    if (URP_TEX_ALIASES.indexOf(name) >= 0) continue;
    if (!tex) continue;
    try { material.setTexture(name, tex); done.push(name); }
    catch (e) { failed.push(name + ':' + String(e.message).slice(0, 60)); }
  }
  return { done, failed };
}

export default {
  VENDOR_BASE, URP_TEX_ALIASES, OUTLINE_FIELDS,
  loadBackend, enableBackend,
  cfgToProps, cfgTextures, rawToProps, rawTextures,
  flipVForGltfConvention, unflipV,
  outlineFromRaw, outlineToRaw,
  createSurfaceMaterial, applyTextures,
};
