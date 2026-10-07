/**
 * viewer.js —— 三维角色查看器核心。
 *
 * 取景/场景照搬 20261003_cbb057.html，其余为后来逐步加入的功能：
 *   · 打光预设（白昼 / 早晨·傍晚 / 黑夜）
 *   · 渲染模式（原始 PBR / 卡通 Cel）
 *   · 可配置旋转基准位置（X/Z）
 *   · 光环绑定头部骨骼
 *   · 嘴部修复（照搬 kivo.wiki：拆 UV 岛 + 嘴部图集）
 *   · 描边（three 的 OutlineEffect：反壳法）
 */
import * as THREE from 'three';

/**
 * lilToon 属性映射（**自动生成** ✗ 见 scripts/embed-lilmap.mjs ✓）
 *
 * ⚠️ 从 ./assets/lilmap.inline.js 导入而不是 JSON ——
 *   viewer.js 有两条加载路径（index.html 不打包 · embed 用 dist 单文件 ✓）
 *   JSON 模块在不打包那条路上会坏 ✓
 */
import { LIL_MAP, LIL_BY_NAME, LIL_DERIVED, LIL_PRESET_GUID } from './assets/lilmap.inline.js';
/**
 * lilToon 官方预设（**自动生成** ✗ 见 scripts/gen-lilpresets.mjs ✓）
 *
 * ⚠️⚠️ 为什么不再手写：实测手写版有
 *     · **漏字段** —— Hair-Anime 没写 backlight ⇒ 套用后残留上一次的值 ✓
 *     · **值不一致** —— `rim.blend` 手写 1 ✗ lilToon 是 3（不同混合模式 ✓）
 *   ⇒ 现在直接从 `lilToon/Presets/*.asset`（Unity 自己序列化的 ✓）生成 ✓
 */
import { LIL_PRESETS } from './assets/lilpresets.inline.js';
/**
 * lilToon 的 64 个着色器（**自动生成** ✗ 见 scripts/gen-lilshaders.mjs ✓）
 *
 * ⚠️⚠️ 为什么需要它：`lilToonPreset.cs:71` 会 `material.shader = preset.shader` ✓
 *   · 64 个 shader 里**可见名（材质面板能选的）只有 1 个**（`lilToon` ✓）
 *   · 其余 63 个是 Hidden/_lil 变体 ⇒ **材质面板选不到** ✓
 *     玻璃/折射 ⇒ Hidden/lilToonRefraction · 毛发 ⇒ Hidden/lilToonFur · …
 *   ⇒ 「导出时给出正确的子着色器」是**唯一**能让那些功能在 Unity 里生效的方式 ✓
 */
import { LIL_SHADERS, LIL_RENDER_MODES } from './assets/lilshaders.inline.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';


/**
 * 打光预设（只改灯光，不碰背景；背景由背景菜单独立控制）。
 * 白昼 = 基线默认；早晨/傍晚 = 同一个黄金时刻；黑夜 = 冷蓝月光。
 */
const LIGHTING_PRESETS = {
  day: {
    label: '白昼',
    hemi: { sky: 0xffffff, ground: 0x30354a, intensity: 0.5 },
    key: { color: 0xffffff, intensity: 2.0, position: [3, 6, 4] },
    rim: { color: 0x7fa8ff, intensity: 1.2 },
    fill: { color: 0xffd9b3, intensity: 0.4 },
    exposure: 1.0,
  },
  golden: {
    label: '早晨 / 傍晚',
    hemi: { sky: 0xffd9b0, ground: 0x5a4632, intensity: 0.45 },
    key: { color: 0xffb469, intensity: 2.1, position: [-4, 2.5, 4] },
    rim: { color: 0xff8a5c, intensity: 1.5 },
    fill: { color: 0xffc98a, intensity: 0.45 },
    exposure: 1.08,
  },
  night: {
    label: '黑夜',
    hemi: { sky: 0x5a6f9e, ground: 0x0a0e18, intensity: 0.28 },
    key: { color: 0x8fb4ff, intensity: 1.25, position: [2, 4, 5] },
    rim: { color: 0x4a6fc0, intensity: 0.9 },
    fill: { color: 0x2a3a5c, intensity: 0.2 },
    exposure: 0.85,
  },
};

/* ══════════════════════════════════════════════════════════════════
 *  lilToon 预设 ⇄ lilCfg（Unity .asset 互操作 ✓）
 *
 *  ⚠️⚠️ 分两层（和 scripts/lilpreset.mjs 同构 ✗ 那边是 node 版的原型 ✓）：
 *
 *    · **格式层** —— Unity YAML ⇄ { colors, vectors, floats }
 *      只认我们需要的部分 ✗ 不做通用 YAML ✓
 *
 *    · **语义层** —— 借 LIL_MAP / LIL_BY_NAME / LIL_DERIVED 翻译键名
 *
 *  ⚠️ 关键设计（都踩过坑 ✓）：
 *    · 数值按 **float32** 处理（Unity 的材质全是 float32 ✓）
 *      写回时找**最短能往返 float32 的十进制** ⇒ 比 Unity 自己的写法更干净 ✓
 *    · 派生映射（_UseRim ↔ rim.blend ✓）优先级**高于**普通映射 ✗
 *      而且普通映射**不许覆盖**派生写过的路径 ✓
 *    · 一个 lilToon 属性可能映射到我们**多个键**（1→N ✓）
 *      也可能由我们**多个字段聚合成一个向量**（N→1 ✓）
 * ══════════════════════════════════════════════════════════════════ */

/** lilCfg 路径取值（outline.width 这种 ✓）*/
function lilCfgGet(cfg, p) {
  let o = cfg;
  for (const s of String(p).split('.')) { if (o == null) return undefined; o = o[s]; }
  return o;
}

/** lilCfg 路径设值（中间层不在就建 ✓）*/
function lilCfgSet(cfg, p, v) {
  const segs = String(p).split('.');
  let o = cfg;
  for (let i = 0; i < segs.length - 1; i++) { if (o[segs[i]] == null) o[segs[i]] = {}; o = o[segs[i]]; }
  o[segs[segs.length - 1]] = v;
}

/** 分量名 → 下标 ✓ */
const LIL_COMP = { x: 0, y: 1, z: 2, w: 3 };

/**
 * 解析 Unity 的 lilToon 预设 / 材质 YAML。
 *
 * ⚠️ 段落名用**同义词表**兼容两种文件：
 *     预设：colors / vectors / floats
 *     材质：m_SavedProperties 里的 m_Colors / m_Vectors / m_Floats
 */
function parseLilPresetYaml(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').split('\n');
  const SEC = { colors: 'colors', m_Colors: 'colors', vectors: 'vectors', m_Vectors: 'vectors', floats: 'floats', m_Floats: 'floats' };
  /**
   * ⚠️ bases / category 也要读 —— 它们是**预设能不能在 Unity 里显示**的关键 ✓
   *   lilSettingAndPresetGUI.cs:191  按 category 归类（7 个折叠分类 ✓）
   *   lilSettingAndPresetGUI.cs:194  按钮文字取 bases[].name
   *   ⇒ 空 bases ⇒ **渲染出一个没有文字的按钮**
   *     （用户实测：「我 unity 实际找了下没找到」✓ 就是这个原因 ✓）
   */
  const out = { name: null, category: null, bases: [], colors: {}, vectors: {}, floats: {} };
  let cur = null, curKey = null, inSaved = false;
  for (const raw of lines) {
    const t = raw.trim();
    if (!t || t.startsWith('%') || t.startsWith('---')) continue;
    /* ★ bases 段（多语言名 ✗ 决定 Unity 里的按钮文字 ✓）*/
    const mb = t.match(/^-\s*language:\s*(.*)$/);
    if (mb) { out.bases.push({ language: mb[1].trim(), name: '' }); continue; }
    const mnb = t.match(/^name:\s*(.*)$/);
    if (mnb && out.bases.length && !out.bases[out.bases.length - 1].name) {
      out.bases[out.bases.length - 1].name = mnb[1].trim(); continue;
    }
    const mc = t.match(/^category:\s*(-?\d+)\s*$/);
    if (mc) { out.category = Number(mc[1]); continue; }
    const mn = t.match(/^m_Name:\s*(.+)$/);
    if (mn && out.name === null) { out.name = mn[1].trim(); continue; }
    const msec = t.match(/^([A-Za-z_]\w*):\s*$/);
    if (msec) {
      const k = msec[1];
      if (k === 'm_SavedProperties') { inSaved = true; cur = null; continue; }
      if (SEC[k]) { cur = SEC[k]; curKey = null; continue; }
      cur = null; curKey = null; continue;
    }
    if (!cur) continue;
    const mname = t.match(/^-\s*name:\s*([A-Za-z_]\w*)\s*$/);
    if (mname) { curKey = mname[1]; continue; }
    const mval = t.match(/^value:\s*(.+)$/);
    if (mval && curKey) {
      const v = mval[1].trim();
      if (cur === 'colors') {
        const m = v.match(/^\{r:\s*([^,}]+),\s*g:\s*([^,}]+),\s*b:\s*([^,}]+),\s*a:\s*([^}]+)\}$/);
        if (m) out.colors[curKey] = [1, 2, 3, 4].map((n) => Math.fround(Number(m[n])));
      } else if (cur === 'vectors') {
        const m = v.match(/^\{x:\s*([^,}]+),\s*y:\s*([^,}]+),\s*z:\s*([^,}]+),\s*w:\s*([^}]+)\}$/);
        if (m) out.vectors[curKey] = [1, 2, 3, 4].map((n) => Math.fround(Number(m[n])));
      } else if (/^-?[\d.]+(?:[eE][-+]?\d+)?$/.test(v)) {
        out.floats[curKey] = Math.fround(Number(v));
      }
      curKey = null;
      continue;
    }
    /* 材质里的贴图引用 ⇒ 我们只记名字（当前不需要 ✗ 值忽略 ✓）*/
    const mtex = t.match(/^-\s*(_[A-Za-z]\w*):\s*$/);
    if (mtex && inSaved) { curKey = null; continue; }
  }
  return out;
}

/**
 * 生成 Unity 能认的 lilToon **预设** YAML（MonoBehaviour ✓）。
 * ⚠️ 不生成 .mat —— 材质要写 m_TexEnvs ✗ 每个贴图都要 Unity 的 GUID ✓
 *   那是下一步（B）的事 ✓
 */
function buildLilPresetYaml(p) {
  /**
   * ⚠️ 数字：先归 float32 ✗ 再找**最短能往返**的十进制 ✓
   *   Unity 自己用旧版 .NET 的 float.ToString("R") ✗ 不是最短 ✓
   *   （0.35f 会被它写成 0.35000002 ✓）我们写更干净的 ✗ 值完全等价 ✓
   */
  const num = (x) => {
    const n = Number(x);
    if (!isFinite(n)) return '0';
    const f = Math.fround(n);
    if (Number.isInteger(f) && Math.abs(f) < 1e15) return String(f);
    for (let q = 1; q <= 9; q++) {
      const s = f.toPrecision(q);
      if (Math.fround(Number(s)) === f) return /e/i.test(s) ? String(f) : String(Number(s));
    }
    return String(f);
  };
  const out = [];
  out.push('%YAML 1.1', '%TAG !u! tag:unity3d.com,2011:', '--- !u!114 &11400000', 'MonoBehaviour:');
  out.push('  m_ObjectHideFlags: 0', '  m_CorrespondingSourceObject: {fileID: 0}',
    '  m_PrefabInstance: {fileID: 0}', '  m_PrefabAsset: {fileID: 0}', '  m_GameObject: {fileID: 0}',
    '  m_Enabled: 1', '  m_EditorHideFlags: 0');
  out.push('  m_Script: {fileID: 11500000, guid: ' + LIL_PRESET_GUID + ', type: 3}');
  const nm = p.name || 'BA3D-LilToon';
  out.push('  m_Name: ' + nm);
  out.push('  m_EditorClassIdentifier: ');
  /**
   * ⚠️⚠️ **bases 必须至少一条 · 且 name 非空** ——
   *
   *   lilToon 用 bases[].name 当**按钮文字**（lilSettingAndPresetGUI.cs:194-206 ✓）：
   *       string showName = '';
   *       for(k in bases) showName = bases[k].name;
   *       if(EditorButton(showName)) ApplyPreset(...)
   *   ⇒ 空的 bases ⇒ showName 是空串 ⇒ **没有文字的按钮**
   *     ⇒ 看起来「预设根本没出现」（用户实测找不到 ✓）
   *
   *   ⚠️ language 用 **English** ✗ 匹配逻辑是「先取第一条当默认 ✗
   *     再找 language == 当前编辑器语言的那条覆盖」
   *     ⇒ 只写 English ⇒ 中文编辑器下也用它 ✓ 不会空 ✓
   */
  out.push('  bases:');
  out.push('  - language: English');
  out.push('    name: ' + nm);
  /**
   * ⚠️ category 决定它出现在**哪个折叠分类**下（:191 ✓）：
   *   0=Skin · 1=Hair · 2=Cloth · 3=Nature · 4=Inorganic · 5=Effect · 6=Other
   *   ⇒ 不写则默认 0（Skin）✗ 用户可能在别的分类下找 ✓ 显式写更稳 ✓
   */
  out.push('  category: ' + (Number.isInteger(p.category) ? p.category : 0));
  /**
   * ⚠️⚠️ **shader 必须写**（`lilToonPreset.cs:71` `material.shader = preset.shader` ✓）——
   *   主着色器 `lilToon`（lts）只有 4 个 pass ✗ **没有 OUTLINE** ✓
   *   ⇒ 材质用 lts 时 `_UseOutline = 1` **也不渲染描边** ✓
   *   ⇒ 而 64 个变体里**只有 1 个可见名**（材质面板选不到其余 ✓）
   *   ⇒ 所以只能靠预设绑定 ✗ 这里必须写 ✓
   *
   *   ⚠️ 格式抄官方预设：`{fileID: 4800000, guid: <32 位>, type: 3}`
   *      （`4800000` = Unity 里 Shader 资源的 class id ✓）
   *      没有就写 `{fileID: 0}` = 不改材质的 shader ✓
   */
  out.push('  shader: ' + (p.shader
    ? '{fileID: 4800000, guid: ' + p.shader + ', type: 3}'
    : '{fileID: 0}'));
  out.push('  renderingMode: ' + (p.renderingMode || 'Opaque'));
  out.push('  colors:');
  for (const k of Object.keys(p.colors || {})) {
    const v = p.colors[k];
    if (!Array.isArray(v)) continue;
    out.push('  - name: ' + k);
    out.push('    value: {r: ' + num(v[0]) + ', g: ' + num(v[1]) + ', b: ' + num(v[2]) + ', a: ' + num(v[3]) + '}');
  }
  out.push('  vectors:');
  for (const k of Object.keys(p.vectors || {})) {
    const v = p.vectors[k];
    if (!Array.isArray(v)) continue;
    out.push('  - name: ' + k);
    out.push('    value: {x: ' + num(v[0]) + ', y: ' + num(v[1]) + ', z: ' + num(v[2]) + ', w: ' + num(v[3]) + '}');
  }
  out.push('  floats:');
  for (const k of Object.keys(p.floats || {})) {
    if (!isFinite(p.floats[k])) continue;
    out.push('  - name: ' + k);
    out.push('    value: ' + num(p.floats[k]));
  }
  return out.join('\n') + '\n';
}

/**
 * 预设 → lilCfg 的**补丁对象**（只含我们能表达的字段 ✓）。
 * @returns {{ patch:object, applied:number, skipped:string[] }}
 */
function lilPresetToPatch(preset) {
  const patch = {};
  const applied = [];
  const skipped = [];
  /* ★ 派生映射优先（开关类 ✓ 普通映射里找不到它们 ✓）*/
  const derivedPaths = {};
  for (const d of LIL_DERIVED) {
    const v = preset.floats && preset.floats[d.l];
    if (v === undefined) continue;
    lilCfgSet(patch, d.p, Math.round(v) ? d.on : d.off);
    derivedPaths[d.p] = 1;
    applied.push(d.p);
  }
  const put = (lilName, value) => {
    /**
     * ⚠️⚠️ **派生映射的名字也算「已识别」** ——
     *   否则我们自己导出的文件再导回来会报一堆「未识别」✓
     *   （实测：导出 176 条 ⇒ 再导入报 skipped 6 ✗ 全是 _UseXxx ✓）
     *   这类名字走的是 DERIVED 通道 ✗ 不在 LIL_BY_NAME 里 ✓
     */
    if (LIL_DERIVED.some((d) => d.l === lilName)) return;
    const list = LIL_BY_NAME[lilName];
    if (!list || !list.length) { skipped.push(lilName); return; }
    let any = false;
    for (const e of list) {
      /* ⚠️ 派生写过的路径不许被普通映射覆盖 ✓ */
      if (derivedPaths[e.p]) continue;
      let v = value;
      if (e.c) {
        if (!Array.isArray(value)) continue;
        v = value[LIL_COMP[e.c]];
      }
      lilCfgSet(patch, e.p, v);
      applied.push(e.p);
      any = true;
    }
    if (!any && !list.some((e) => derivedPaths[e.p])) skipped.push(lilName);
  };
  for (const [k, v] of Object.entries(preset.colors || {})) if (v) put(k, v);
  for (const [k, v] of Object.entries(preset.vectors || {})) if (v) put(k, v);
  for (const [k, v] of Object.entries(preset.floats || {})) if (isFinite(v)) put(k, v);
  return { patch, applied: applied.length, skipped: Array.from(new Set(skipped)) };
}

/**
 * lilCfg → 预设结构（{ name, colors, vectors, floats } ✓）。
 * ⚠️ 分量映射要**先聚合再写**（多个字段 → 一个向量 ✓）
 */
function lilCfgToPreset(cfg, name) {
  const colors = {}, vectors = {}, floats = {};
  const vecAcc = {};
  for (const e of LIL_MAP) {
    const v = lilCfgGet(cfg, e.p);
    if (v === undefined) continue;
    if (e.c) {
      if (!vecAcc[e.l]) vecAcc[e.l] = [0, 0, 0, 0];
      vecAcc[e.l][LIL_COMP[e.c]] = Number(v) || 0;
      continue;
    }
    if (e.t === 'color') { if (Array.isArray(v) && v.length >= 3) colors[e.l] = [0, 1, 2, 3].map((i) => Number(v[i] == null ? 1 : v[i])); }
    else if (e.t === 'vector') { if (Array.isArray(v)) vectors[e.l] = [0, 1, 2, 3].map((i) => Number(v[i] == null ? 0 : v[i])); }
    else if (e.t === 'range' || e.t === 'float' || e.t === 'int') {
      const n = Number(v);
      if (isFinite(n)) floats[e.l] = e.t === 'int' ? Math.round(n) : n;
    }
    /* texture ⇒ 预设里不含贴图引用 ⇒ 跳过 ✓ */
  }
  for (const k of Object.keys(vecAcc)) vectors[k] = vecAcc[k];
  /* ★ 派生映射：我们只有「开关」⇒ 写回 _UseXxx ✓ */
  for (const d of LIL_DERIVED) {
    const v = lilCfgGet(cfg, d.p);
    if (v === undefined) continue;
    floats[d.l] = Number(v) > 0 ? 1 : 0;
  }
  return { name: name || 'BA3D-LilToon', category: 0, colors, vectors, floats };
}

/* ══════════════════════════════════════════════════════════════════
 *  子着色器推导 / 预设分类（和 scripts/lilpreset.mjs 同构 ✓）
 *
 *  ⚠️⚠️⚠️ **为什么必须推导**（读 lilToon 源码 + 用户点破 ✓）：
 *
 *    · **我们实现的是「包含子着色器内容的超集」** ——
 *      outline / matcap / rim / backlight / fur / gem … 全做进了**同一条 GLSL** ✓
 *    · **Unity 的 lilToon 主着色器只含基础 pass** ——
 *      `lts.shader` 只有 4 个 UsePass：FORWARD · FORWARD_ADD ·
 *      SHADOW_CASTER · META ⇒ **没有 OUTLINE** ✓
 *      `lts_o.shader` 才有 FORWARD_OUTLINE / FORWARD_ADD_OUTLINE /
 *      SHADOW_CASTER_OUTLINE ✓
 *    ⇒ 材质用 lts ✗ 即使 `_UseOutline = 1` ✗ 描边**也不渲染** ✓
 *    ⇒ 而 lilToon 编辑器**按 `_UseOutline` 自动切 shader** ✓
 *      （所以 Unity 里会看到 Hidden/lilToonOutline ✓）
 *
 *  ⇒ 导出预设时**必须一并给出正确的子着色器** ✓
 * ══════════════════════════════════════════════════════════════════ */

/** 预设分类（`lilPresetCategory` ✓ 和 Unity 面板那七项一致 ✓）*/
const LIL_CATEGORIES = ['皮肤', '头发', '布料', '自然', '无机物', '效果', '其他'];

/** 按**材质名**猜分类（只是方便下拉 ✗ Unity 里其实可以任意套 ✓）*/
function guessLilCategory(matName) {
  const n = String(matName || "").toLowerCase();
  if (/hair|头发|髪|bangs|ahoge/.test(n)) return 1;
  if (/cloth|衣服|布|dress|shirt|skirt|coat|pants|shoe|boot|sock|tie|ribbon|服/.test(n)) return 2;
  if (/skin|皮肤|face|head|body|arm|leg|hand|neck|ear|eye|mouth|teeth|tongue|brow|lash|肌|顔|体|目|口|歯|舌|眉/.test(n)) return 0;
  if (/fur|毛皮|草|leaf|tree|nature|自然/.test(n)) return 3;
  if (/metal|glass|无机|宝石|机械|iron|steel|gem|blade|weapon/.test(n)) return 4;
  if (/effect|特效|glow|aura|magic|beam/.test(n)) return 5;
  return 6;
}

/** 从 shader 名推 renderingMode（照 lilToonPreset.cs:85-91 ✓）*/
function lilRenderModeOfShaderName(name) {
  const n = String(name || "");
  if (/FurTwoPass/.test(n)) return "FurTwoPass";
  if (/FurCutout/.test(n)) return "FurCutout";
  if (/Fur/.test(n)) return "Fur";
  if (/Gem/.test(n)) return "Gem";
  if (/RefractionBlur/.test(n)) return "RefractionBlur";
  if (/Refraction/.test(n)) return "Refraction";
  if (/TwoPassTransparent/.test(n)) return "TwoPassTransparent";
  if (/OnePassTransparent/.test(n)) return "OnePassTransparent";
  if (/Transparent/.test(n)) return "Transparent";
  if (/Cutout/.test(n)) return "Cutout";
  return "Opaque";
}

/**
 * **推导目标子着色器**（配置 ⇒ Unity 里该用哪个 shader ✓）。
 *
 * 优先级**三级**（测试后修正过 ✓）：
 *   ① `manual`（预设自带的 sh / 用户手选 ✓）—— **必须**优先
 *      证据：Inorganic-Glass 的 `_TransparentMode` 没被改（Opaque ✓）
 *            却绑了 `Hidden/lilToonRefraction` ⇒ 「折射」**不在参数里** ✓
 *   ② `transparentMode`（lilToon 的 `_TransparentMode` ✓）⇒ 渲染模式
 *      0=Opaque 1=Cutout 2=Transparent 3=Refraction 4=Fur 5=FurCutout 6=Gem
 *      ⚠️ 我们的默认是 **-1 = 不改** ⇒ 按 0（Opaque ✓）
 *   ③ `outline.enable` ⇒ 换**带描边**版本（没有就退回不带 ✗ 但说明原因 ✓）
 */
const LIL_TRANSPARENT_MODES = ['Opaque', 'Cutout', 'Transparent', 'Refraction', 'Fur', 'FurCutout', 'Gem'];
function lilDeriveShader(cfg, manual, preferTwoPass) {
  const list = LIL_SHADERS || [];
  const find = (n) => list.find((s) => s.name === n) || null;
  if (manual) {
    const s = find(String(manual)) || list.find((x) => x.guid === String(manual));
    if (s) return { name: s.name, guid: s.guid, file: s.file, why: "手动指定" };
  }
  const c = cfg || {};
  const t = Number(c.transparentMode);
  const tm = isFinite(t) && t >= 0 ? Math.round(t) : 0;
  let mode = LIL_TRANSPARENT_MODES[tm] || "Opaque";
  if (mode === "Transparent" && preferTwoPass) mode = "TwoPassTransparent";
  const wantOut = !!(c.outline && c.outline.enable);
  const BASE = {
    Opaque: "lilToon",
    Cutout: "Hidden/lilToonCutout",
    Transparent: "Hidden/lilToonTransparent",
    OnePassTransparent: "Hidden/lilToonOnePassTransparent",
    TwoPassTransparent: "Hidden/lilToonTwoPassTransparent",
    Refraction: "Hidden/lilToonRefraction",
    Fur: "Hidden/lilToonFur",
    FurCutout: "Hidden/lilToonFurCutout",
    Gem: "Hidden/lilToonGem",
  };
  const bn = BASE[mode] || BASE.Opaque;
  if (!wantOut) {
    const s = find(bn);
    return s ? { name: s.name, guid: s.guid, file: s.file, why: mode } : null;
  }
  const on = mode === "Opaque" ? "Hidden/lilToonOutline" : bn + "Outline";
  const so = find(on);
  if (so) return { name: so.name, guid: so.guid, file: so.file, why: mode + " + 描边" };
  const sb = find(bn);
  return sb ? { name: sb.name, guid: sb.guid, file: sb.file, why: mode + "（该模式无描边变体 ✓）" } : null;
}
/**
 * ★★ 嵌入看板的**默认取景垂直偏移**（CSS 像素 ✓）
 *
 *   ⚠️ 主页面是 22（`cfg.framingOffsetY` 的默认值 ✓）
 *     而嵌入看板通常更矮 ⇒ 角色**向下展开**的动画（倒地 / 死亡 ✓）会被切 ✓
 *   ⇒ 这里给一个更大的值 ✗ 让画面整体下移、下方留白更多 ✓
 *     （用户：「网页内嵌看板那里 ✗ 我们需要整个场景显示的切片往下一点 ✗
 *       让就死亡动画可以完整显示」✓）
 *
 *   ⚠️ 想覆盖就在容器上写 `data-ba3d-framing-offset="140"` ✓
 *
 *   ⚠️⚠️⚠️ **这个常量必须在模块顶层** ——
 *     我第一版把它插在 `function dataAttrs` 前面 ✗ 而那是在
 *     `createViewer` **里面** ⇒ `autoMount`（模块顶层 ✓）看不到它 ⇒
 *     `Embed-demo 初始化失败：EMBED_FRAMING_OFFSET_Y is not defined` ✓
 *     （用户直接报了这个错 ✓）
 */
  /**
   * ⚠️ 80 太靠上了（用户：「现在内嵌看板太靠上了 ✗ 折中一下」✓）
   *   ⇒ 取 42（主页面 22 ✗ 嵌入 42 ⇒ 约 1.9 倍 ✓）
   *   ⚠️ 单位是**容器的 CSS 像素**（`framingReferenceHeight` 为 0 时
   *     参考高度 = 容器高 ✓）⇒ 同一个值在不同高度的容器里效果不同 ✓
   */
  const EMBED_FRAMING_OFFSET_Y = 42;

export function createViewer(container, opts = {}) {
  /** 容器上的 data-ba3d-* 属性（便于纯 HTML 内嵌，可被 opts 覆盖） */

function dataAttrs(el) {
    const d = (el && el.dataset) || {};
    const o = {};
    if (d.ba3dModel) o.modelUrl = d.ba3dModel;
    if (d.ba3dMouth) o.mouthAtlasUrl = d.ba3dMouth;
    if (d.ba3dConfig) o.configUrl = d.ba3dConfig;
    if (d.ba3dAutoRotate !== undefined) o.autoRotate = d.ba3dAutoRotate === 'true';
    if (d.ba3dDrag !== undefined) o.dragContainer = d.ba3dDrag !== 'false';
    /**
     * ★ 场景辅助显示**默认全关**（嵌入看板不该有网格 / 坐标轴 / 视角指示器 ✓）
     *   ⇒ 嵌入方想开就写 `data-ba3d-grid="true"` 之类 ✓
     */
    if (d.ba3dGrid !== undefined) o.showGrid = d.ba3dGrid !== 'false';
    if (d.ba3dAxes !== undefined) o.showAxes = d.ba3dAxes !== 'false';
    if (d.ba3dGizmo !== undefined) o.showViewGizmo = d.ba3dGizmo !== 'false';
    if (d.ba3dLightHelper !== undefined) o.showLightHelper = d.ba3dLightHelper !== 'false';
    /**
     * ★★ `data-ba3d-framing-offset` —— **嵌入看板专用的取景垂直偏移**（CSS 像素 ✓）
     *
     *   ⚠️ 用户：「网页内嵌看板那里 ✗ 我们需要**整个场景显示的切片往下一点** ✗
     *     让**死亡动画可以完整显示**」
     *
     *   `framingOffsetY` 正值 = **取景下移 ⇒ 画面内容上移** ✓
     *   ⇒ 增大它 ⇒ 角色在画面里**往上挪**✗ 下方留出**更多空间**给倒地的动作 ✓
     *
     *   ⚠️⚠️ **必须带 `__framingOffsetForced` 标记** ——
     *     配置文件里的 `renderer.framingOffsetY` 会在 `applyConfigPostLoad`
     *     里把它**覆盖掉**（第 8056 行 ✓）⇒ 嵌入想用不同的值 ✗ 得在配置之后
     *     再压一次 ✓（见 `applyConfigPostLoad` 里那段 ✓）
     */
    if (d.ba3dFramingOffset !== undefined) {
      o.framingOffsetY = Number(d.ba3dFramingOffset) || 0;
      o.__framingOffsetYForced = o.framingOffsetY;   // ★ 另存一份（framingOffsetY 会被配置覆盖 ✓）
      o.__framingOffsetForced = true;
    }
    return o;
  }

  const cfg = {
    // —— 模型 / 资源（可被 config JSON 覆盖）——
    modelUrl: './assets/model.glb',
    // 默认 null：**不指定就不做嘴部修复**。
    // 修复是给「嘴混在 EyeMouth 网格里、渲染成黑块」的那批模型用的（models/ba 那几个），
    // 而像 models/BlueArchiveModels 那批，每种口型本来就是独立网格 + morph target 驱动
    //（权重 1 = 把口型甩到 17 倍网格尺寸之外＝隐藏，动画设成 0 才显形），
    // 强行套修复反而会把眼睛当嘴拆掉。所以要修就得在 json / data-ba3d-mouth 里显式给出图集。
    mouthAtlasUrl: null,
    // —— 配置来源：直接给对象(config) 或 给 JSON 的 URL(configUrl) ——
    config: null,
    configUrl: null,
    autoConfig: true,            // 没显式给配置时，自动找与模型同名的 .json（sample.glb → sample.json）
    modelRotation: null,         // 加载后给模型加旋转，单位【度】，如 [-90, 0, 0]（FBX 常见 Z-up 需要它）
    modelName: null,             // 原始文件名提示（上传时用）。blob: URL 没有后缀，靠它判格式最快
    textureBase: null,           // 贴图基准目录（FBX 用），如 "./Texture/"。等价于 fbxLoader.setResourcePath()
    textureMap: null,            // 贴图精确映射 { "FBX里存的路径或文件名": "实际URL" }（FBX 里常存艺术家机器的绝对路径）
    // —— 其它 ——
    autoRotate: false,
    autoRotateSpeed: 0.6,
    targetHeight: 2.0,
  /**
   * ★ 落地微调（世界单位 ✗ 默认 0 ✓）
   *
   * ⚠️ 为什么需要它：
   *   `fitToView` 用 `measureContentBox(root)` 的 `min.y` 把模型落到 y=0 ✓
   *   但**蒙皮网格的包围盒是绑定姿势（bind pose）的** ⇒
   *   动画一动 ✗ 脚的真实高度就变了 ⇒ 影子和脚之间出现缝 ✓
   *   （用户的长期反馈：「角色脚步没有接地 ✗ 影子和身体是分开的」✓）
   *
   * ⇒ 正数把模型**抬高** ✗ 负数**压下去** ✓
   *   用 `viewer.probeGround()` 量出缝有多大 ✗ 再填这里 ✓
   */
  groundOffsetY: 0,
  /** ★ 修正模型位置（XYZ ✗ 世界单位 ✓）—— 移动的是**模型本体** ✗ 影子跟着动 ✓ */
  modelOffset: { x: 0, y: 0, z: 0 },
  /** ★ 场景模式：'action'（= Unity 的 run ✓）· 'edit'（= Unity 的 edit ✓）*/
  sceneMode: 'action',
  /**
   * ★ 加载后**自动贴地一次**（默认开 ✓）
   *
   * 量法：`measurePosedBottom` 对蒙皮后的顶点采样 ✗ 找真实最低点 ✓
   *
   * ⚠️⚠️ **只在加载后贴一次 ✗ 不能每帧贴** ——
   *     跳跃 / 蹲下 / 抬腿这些动作本身就是让脚离地的 ✓
   *     每帧贴会把它们压平 ⇒ 角色像被钉在地上 ✓
   *
   * ⚠️ 而且要**等动画推进几帧**再量 —— 刚 load 完时姿势还是绑定姿势 ✗
   *     那正是 fitToView 已经用过的 ⇒ 量出来 gap≈0 ✗ 白贴 ✓
   */
  autoGroundSnap: true,
    fov: 30,
    shadows: true,
    /**
     * 阴影偏移（保持 viewer 一直以来的原值，未做调优）。
     *
     * 曾尝试把 normalBias 从 0.02 调到 0，理由是"脸与头发互相穿插、命中距离仅 0.001"，
     * 但**实测无效且让光照变得奇怪**，已回退 ✗。这两个留作可配置项，默认即原值。
     */
    shadowBias: -0.0003,
    shadowNormalBias: 0.02,
    envIntensity: 0.8,
    backgrounds: [0x10131a, 0x1e2230, 0x000000, 0xf2f4f8],
    backgroundTransparent: true, // 默认透明背景（便于内嵌时透出网页内容）
    dragContainer: false,        // 左键按在模型上时拖动整个容器（内嵌场景用 data-ba3d-drag 开启）
    framing: 'auto',             // 'auto' = 基线取景；'tight' = 按真实内容居中
    framingReferenceHeight: 0,   // >0 时：相机参数按这个面板高度算成固定世界量 → 面板按百分比缩放时画面整体等比缩放
    modelHeightPx: 360,          // 角色在参考画布上的屏幕高度（CSS 像素）——模型无关的「默认缩放」
    /**
   * 取景垂直偏移（CSS 像素 ✗ 正值 = 取景下移 ⇒ **画面内容上移** ✓）
   *
   * ★ 默认给 **22**（不是 0）—— 实测调出来的：
   *   `CH0155_Vital_Death` 在 4 秒处整体掉到画面下半 ✗ 底部超出下边缘 0.0934 NDC ✓
   *   `framingReferenceHeight = 430` ⇒ 半高 215px ⇒ 0.0934 × 215 ≈ 20px ✓
   *   取 22 留一点余量 ✓
   *
   * ⚠️ 这不是「抬高地面」—— 地面仍在 y=0 ✗ 脚也仍在 y=0（贴地 ✓）✗
   *     动的是**相机对准点**✗ 让上下余量更平均 ✓
   *     （抬模型会把刚修好的踩地破坏掉 ✗ 影子又会和脚分开 ✓）
   *
   * ⚠️ 24 个动作逐个量过：改成 22 之后最紧的动作是 `CH0155_Exs_Cutin`
   *     （它本来就贴边 ✗ 偏移不能给太大 ✓）
   */
  framingOffsetY: 22,
  /**
   * ★ 场景辅助显示（对齐 Unity 的 Scene 视图 ✓）—— **默认全关** ✓
   *
   * ⚠️⚠️ 它们属于「开发 / 场景编辑」的辅助 ✗ 不该出现在**嵌入看板**里 ✓
   *   （用户的原话：「网格在网页看板那里 ✗ 应该是关闭的」✓）
   *
   * ⇒ 改成**默认全关** ✗ 由**主页面 `index.html` 显式打开** ✓
   *   嵌入方（`autoMount` / `data-ba3d`）想要就用 data 属性开：
   *     data-ba3d-grid / data-ba3d-axes / data-ba3d-gizmo / data-ba3d-light-helper
   *
   * ⚠️ 这和 `showAxes` / `showLightHelper` 原来的默认值一致（本来就是关 ✓）
   */
  showAxes: false,          // 原点 XYZ 坐标轴
  showGrid: false,          // 地面网格（主页面会打开 ✓）
  showLightHelper: false,   // 主光方向指示
  showViewGizmo: false,     // 视角指示器（主页面会打开 ✓）
  axesLength: 1.6,
  gridSize: 8,
  gridDivisions: 16,
    stripRootMotion: 'compensate', // 根位移处理：'compensate' 对象级抵消（默认，不动动画轨道）/ 'root' 只压最外层 / 'xyz' 全链压平 / 'xz' 保留跳跃 / false 关闭
    pressHoldMs: 200,            // 左键在模型上按住多久才算「按下」（否则算点击）
    mouthCell: null,             // 默认口型（图集格 0~63）：动作没驱动嘴部骨骼时用哪一格；null = 第一个口型
    // —— 卡通（Cel / Toon）着色参数 ——
    celSteps: 2,                 // 明暗分档数：2 = 只有"受光/阴影"两级 → 除阴影外完全平（≈无光照）
    celDark: 0.80,               // 最暗档亮度（1.0 = 全亮）。0.80 = 阴影只比受光淡一档（实测定标：原 0.72 偏重）
    celShadowTint: null,         // 暗部色调，如 [0.72, 0.62, 0.85]；null = 只变暗不变色
    celShadowMin: 0.3,           // 投射阴影里保留多少主光（0 = 硬阴影，1 = 没有投射阴影）；实测定标 0.3
    celFaceShadowMin: 0.7,       // 面部投射阴影浓度（唯一的"面部阴影"参数）。0 = 最深，>=0.95 = 没有面部阴影；null = 跟随 celShadowMin
    celFaceLight: false,         // 面部光照修正：脸/眼/眉法线强制朝向摄像机
    facePattern: 'Face|EyeMouth|Eyebrow|Mouth',   // 哪些材质名算"脸"
    faceNoShadow: false,         // 【派生字段，不要直接配置】由 celFaceShadowMin（未设则 celShadowMin）决定：>=0.95 视为无面部阴影
    outlineSkipPattern: 'Halo',  // 这些材质名不描边（薄板反壳会戳穿自身 → 闪烁）
    attachProps: null,           // 把脱落的道具骨骼挂到角色骨骼上（实测不可靠，见实现处注释）
    hideParts: null,             // 隐藏这些网格（正则片段，匹配网格名或材质名），如 "Calculator|Dron"
    hideOptional: true,          // GLB 里标了 extras.optional 的部件默认隐藏，只有动作用到时才显示
    hideByBoneScale: 0.5,        // 网格骨架里所有骨头缩放都小于此值 → 视为隐藏（模型常用缩放道具来表达"不显示"）；0 = 关闭
    lightingScale: 1,            // 打光预设的整体亮度倍率（1 = 原样）
    /**
     * 光照夹取（lilToon 的 _LightMinLimit / _LightMaxLimit）。
     *
     *   lilToon 的默认是 min=0.05 max=1 · 而且**永远生效** ✓
     *   夹的是**灯光颜色**（lil_common_macro.hlsl:2079）：
     *       lightColor = clamp( lightColor, _LightMinLimit, _LightMaxLimit );
     *   ⇒ 不是最终像素 ⇒ 分档还在 ✗ 只是整体亮度被限住 ⇒ 暗部不会全黑、亮部不过曝 ✓
     *
     * ⚠️ 我们默认**关**（lightClampOn = false）⇒ 保持查看器原有观感 ✓
     *    想要和 Unity 一致就打开 ✓
     *
     * ⚠️⚠️ **上限的默认值不是 lilToon 的 1** · 而是 2.2 ✓ 原因：
     *     lilToon 的 _LightMaxLimit = 1 是按 **Unity 主光强度 ≈ 1** 定的 ·
     *     而我们灯光预设里主光的 intensity 是 **2.0（白昼）/ 2.1（晨昏）/ 1.25（黑夜）** ✓
     *     照抄 1 ⇒ 主光被夹到 1.0 ⇒ 整个模型暗一半（不是「防过曝」· 是「砍亮度」✓）
     *     ⇒ 上限取 2.2（≈ 最亮那档主光）⇒ 开夹取只做「抬暗部地板」这件事 ✓
     *
     *     ⇒ 想压过曝就手动把上限往低调 · 想只抬暗部就保持 2.2 ✓
     *     ⇒ 下限才是这个功能真正有用的那个（0.05 = lilToon 默认 · 很轻微 ✓）
     */
    lightClampOn: false,
    lightMinLimit: 0.05,   // _LightMinLimit
    lightMaxLimit: 2.2,    // _LightMaxLimit（⚠️ 见下面说明：我们的主光强度是 2.0~2.1 ✓）
    noCastPattern: null,         // 这些材质名的网格不投影（如 "Hair"）。配合 faceNoShadow:false
                                 // 就能做到「脸保留自阴影、但刘海不在脸上投影」
    visibilityRules: null,       // 按动作名控制网格显隐：[{ mesh, clipContains, invert }]
    mouthIdle: false,            // 兜底口型：动作没驱动嘴部骨骼时，让口型自己循环（默认关）
    mouthIdleMs: 180,            // 兜底口型每格停留时长（毫秒）
    ...dataAttrs(container),
    ...opts,
  };
  let mouthAtlasUrl = cfg.mouthAtlasUrl;

  /* ---------- 渲染器 ---------- */
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true, // 允许透明背景
    premultipliedAlpha: false,
    powerPreference: 'high-performance',
    /**
     * ⚠️ 必须 true 才能用 Stencil（lilToon 的 _Stencil* ✓）✗
     *    three r160 默认不开 ✗ 而模板缓冲无法在 context 创建后再加 ✗ 只能这里决定 ✓
     *    代价：帧缓冲多一个 8 位模板附件 ✗ 实测无感 ✓
     */
    stencil: true,
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = cfg.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  /* ---------- 场景 / 相机 ---------- */
  const scene = new THREE.Scene();
  scene.background = null; // 透明（由 setBackground 控制）

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(
    cfg.fov,
    (container.clientWidth || 1) / (container.clientHeight || 1),
    0.05,
    200
  );
  camera.position.set(0, 1.2, 4.5);

  /* ---------- 灯光 ---------- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x30354a, 0.5);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xffffff, 2.0);
  keyLight.position.set(3, 6, 4);
  if (cfg.shadows) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(2048, 2048);
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 30;
    keyLight.shadow.camera.left = -4;
    keyLight.shadow.camera.right = 4;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -1;
    /**
     * 阴影偏移 —— 这两个值直接决定**贴身的接触影**能不能留下来。
     *
     * 实测（Raycaster 从面部顶点朝主光打射线）：这批模型的脸和头发是
     * **互相穿插**的，脸上有 51%~86% 的顶点被头发挡住，但**命中距离只有 0.000~0.001**。
     * normalBias 会把阴影采样沿法线推开，原来的 0.02 是接触距离的 **20 倍** ✗
     * —— 于是脸上的投影被整个抹掉（身体间隙大得多，所以身体的影还在，正好对上现象）。
     *
     * 所以 normalBias 默认设 0，靠 bias 压痤疮。
     */
    keyLight.shadow.bias = cfg.shadowBias;
    keyLight.shadow.normalBias = cfg.shadowNormalBias;
  }
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x7fa8ff, 1.2);
  rimLight.position.set(-4, 3, -5);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(0xffd9b3, 0.4);
  fillLight.position.set(-1, 1, 3);
  scene.add(fillLight);

  /* ---------- 控制器 ---------- */
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.85;
  controls.zoomSpeed = 0.9;
  controls.panSpeed = 0.5;
  controls.screenSpacePanning = true;
  controls.minDistance = 0.5;
  controls.maxDistance = 25;
  // 720° 全方位无极旋转：不限制极角。
  //   minPolarAngle=0        → 可以正上方俯视（头顶）
  //   maxPolarAngle=Math.PI  → 可以正下方仰视（裙底）
  // 基线原文件限到 0.15π~0.55π，看不到脚下；这里放开。
  controls.maxPolarAngle = Math.PI;
  controls.minPolarAngle = 0;
  controls.target.set(0, 0.9, 0);
  controls.update();

  /* ---------- 地面阴影 ---------- */
  let ground = new THREE.Mesh(
    new THREE.CircleGeometry(8, 64),
    new THREE.ShadowMaterial({ opacity: 0.3 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = cfg.shadows;
  ground.visible = cfg.shadows;
  scene.add(ground);

  /* ---------- 状态 ---------- */
  /* ============================================================
   * ★ 场景辅助显示（对齐 Unity 的 Scene 视图 Gizmos ✓）
   *
   *   axesGroup   原点 XYZ 坐标轴（红 X / 绿 Y / 蓝 Z ✓）
   *   gridHelper  地面网格（y=0 ✗ 和阴影圆盘同一个平面 ✓）
   *   lightHelper 主光方向指示（从光源位置指向原点的一条线 + 端点小球 ✓）
   *
   * ⚠️ 全部挂在 `helpers` 这个 Group 下 ✗ 方便一次性开关 ✓
   * ⚠️ 都不参与阴影 / 不被描边（不在 modelRoot 里 ⇒ 描边遍历看不到 ✓）
   * ============================================================ */
  const helpers = new THREE.Group();
  helpers.name = '__sceneHelpers';
  scene.add(helpers);
  let axesHelper = null;
  let gridHelper = null;
  let lightHelper = null;

  function buildAxes(len) {
    const g = new THREE.Group();
    const L = len || 1.6;
    // 三条轴：红 X / 绿 Y / 蓝 Z（Unity 的配色 ✓）
    const mk = (dir, color) => {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        dir.clone().multiplyScalar(L),
      ]);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95, depthTest: false });
      const line = new THREE.Line(geo, mat);
      line.renderOrder = 900;
      return line;
    };
    g.add(mk(new THREE.Vector3(1, 0, 0), 0xff5a5a));
    g.add(mk(new THREE.Vector3(0, 1, 0), 0x6ee07a));
    g.add(mk(new THREE.Vector3(0, 0, 1), 0x5a9dff));
    // 轴的负方向用虚线感（细一点、透明度低一些 ✓）
    const mkNeg = (dir, color) => {
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), dir.clone().multiplyScalar(-L * 0.5)]);
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.3, depthTest: false });
      const line = new THREE.Line(geo, mat);
      line.renderOrder = 900;
      return line;
    };
    g.add(mkNeg(new THREE.Vector3(1, 0, 0), 0xff5a5a));
    g.add(mkNeg(new THREE.Vector3(0, 1, 0), 0x6ee07a));
    g.add(mkNeg(new THREE.Vector3(0, 0, 1), 0x5a9dff));
    g.userData.__kind = 'axes';
    return g;
  }

  function buildGrid(size, div) {
    const gl = new THREE.GridHelper(size || 8, div || 16, 0x6b7a92, 0x3a4457);
    gl.material.transparent = true;
    gl.material.opacity = 0.55;
    gl.material.depthWrite = false;
    gl.renderOrder = -2;
    gl.position.y = 0.0005;   // 略高于阴影圆盘 ✗ 避免 z-fighting ✓
    gl.userData.__kind = 'grid';
    return gl;
  }

  function buildLightHelper() {
    const g = new THREE.Group();
    const mat = new THREE.LineBasicMaterial({ color: 0xffd479, transparent: true, opacity: 0.7, depthTest: false });
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), mat);
    line.renderOrder = 901;
    g.add(line);
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xffd479, transparent: true, opacity: 0.9, depthTest: false })
    );
    dot.renderOrder = 901;
    g.add(dot);
    g.userData.__line = line;
    g.userData.__dot = dot;
    g.userData.__kind = 'light';
    return g;
  }

  /** 按配置重建 / 显示隐藏辅助显示（幂等 ✗ 可重复调用 ✓）*/
  function applySceneHelpers() {
    const wantAxes = !!cfg.showAxes;
    const wantGrid = !!cfg.showGrid;
    const wantLight = !!cfg.showLightHelper;
    if (wantAxes && !axesHelper) { axesHelper = buildAxes(cfg.axesLength); helpers.add(axesHelper); }
    if (!wantAxes && axesHelper) { helpers.remove(axesHelper); disposeDeep(axesHelper); axesHelper = null; }
    if (wantGrid && !gridHelper) { gridHelper = buildGrid(cfg.gridSize, cfg.gridDivisions); helpers.add(gridHelper); }
    if (!wantGrid && gridHelper) { helpers.remove(gridHelper); disposeDeep(gridHelper); gridHelper = null; }
    if (wantLight && !lightHelper) { lightHelper = buildLightHelper(); helpers.add(lightHelper); }
    if (!wantLight && lightHelper) { helpers.remove(lightHelper); disposeDeep(lightHelper); lightHelper = null; }
    updateLightHelper();
  }

  /* ============================================================
   * ★ 右下角视角指示器（Unity 的 Scene 视图右上角那个小坐标轴 ✓）
   *
   * ⚠️ 用一个**独立的 2D canvas** 叠加在场景窗口里 ✗ 不占 WebGL 通道 ✓
   *    （开第二个 WebGLRenderer 太贵 ✗ 而且会抢上下文 ✓）
   *
   * 画法：把世界三条轴按**相机的旋转**转一下 ✗ 取 xy 投影 ✗ 画三条线 + 端点字母 ✓
   * ⚠️ 只用旋转（不用位置）⇒ 它就是「当前视角的朝向」✗ 和 Unity 一样 ✓
   * ============================================================ */
  let gizmoCanvas = null;
  let gizmoCtx = null;

  function ensureGizmoCanvas() {
    if (gizmoCanvas && gizmoCanvas.isConnected) return gizmoCanvas;
    const host = (container && container.parentElement) || container;
    if (!host) return null;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    gizmoCanvas = document.createElement('canvas');
    gizmoCanvas.width = 96; gizmoCanvas.height = 96;
    gizmoCanvas.style.cssText = [
      // ⚠️ 放**右上角** —— 右下角被「状态」浮窗占着 ✗ 左下角是工具栏 ✓
      //    （Unity 的 Scene 视图也是右上角 ✓）
      'position:absolute', 'right:10px', 'top:34px',
      'width:96px', 'height:96px',
      'pointer-events:none', 'z-index:6', 'opacity:.92',
    ].join(';');
    host.appendChild(gizmoCanvas);
    gizmoCtx = gizmoCanvas.getContext('2d');
    return gizmoCanvas;
  }

  /** 每帧画一次（很便宜 ✗ 3 条线 ✓）*/
  function drawViewGizmo() {
    if (!cfg.showViewGizmo) {
      if (gizmoCanvas) gizmoCanvas.style.display = 'none';
      return;
    }
    const cv = ensureGizmoCanvas();
    if (!cv || !gizmoCtx) return;
    cv.style.display = '';
    const ctx = gizmoCtx, W = cv.width, H = cv.height;
    const cx = W / 2, cy = H / 2, R = W * 0.32;
    ctx.clearRect(0, 0, W, H);
    // 相机旋转的逆 ⇒ 把世界轴转到「相机空间」
    const q = camera.quaternion.clone().invert();
    const axes = [
      { v: new THREE.Vector3(1, 0, 0), c: '#ff5a5a', t: 'X' },
      { v: new THREE.Vector3(0, 1, 0), c: '#6ee07a', t: 'Y' },
      { v: new THREE.Vector3(0, 0, 1), c: '#5a9dff', t: 'Z' },
    ];
    // 先画「朝后」的（z<0）✗ 再画「朝前」的 ⇒ 有前后遮挡感 ✓
    const pts = axes.map((a) => {
      const p = a.v.clone().applyQuaternion(q);
      return { ...a, sx: cx + p.x * R, sy: cy - p.y * R, sz: p.z };
    });
    pts.sort((a, b) => a.sz - b.sz);
    for (const p of pts) {
      const front = p.sz > 0;
      ctx.globalAlpha = front ? 1 : 0.42;
      ctx.strokeStyle = p.c;
      ctx.lineWidth = front ? 2 : 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p.sx, p.sy);
      ctx.stroke();
      // 端点圆点 + 字母
      ctx.fillStyle = p.c;
      ctx.beginPath();
      ctx.arc(p.sx, p.sy, front ? 6 : 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = front ? 1 : 0.6;
      ctx.fillStyle = '#0d1017';
      ctx.font = 'bold ' + (front ? 9 : 8) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.t, p.sx, p.sy + 0.5);
    }
    ctx.globalAlpha = 1;
  }

  /** 主光指示线：从主光位置指向原点（方向光的 position 就是「太阳方向」✓）*/
  /**
   * ★ 相机在**地面以下**时藏掉地面网格 ✓
   *
   *   ⚠️ 仰视（正下方往上看 ✓）时 ✗ 网格正好在相机和角色之间 ⇒
   *     **网格线整个盖在模型上** ⇒ 完全看不清 ✓
   *     （用户第一张截图就是这个现象 ✓）
   *
   *   ⇒ Unity / Blender 的 Grid 是**单面**的 ✗ 从下面看不见 ✓
   *     我们的 `GridHelper` 是线 ✗ 没有正反面 ⇒ 只能靠**可见性**模拟 ✓
   *
   *   ⚠️ 放在 `updateLightHelper()` 里调用它是**蹭现成的每帧钩子** ✓
   *     （这个函数在动画循环里每帧都跑 ✓）
   */
  function updateGridVisibility() {
    if (!gridHelper) return;
    if (!cfg.showGrid) return;                      // 用户自己关了就别管 ✓
    const gy = ground ? ground.position.y : 0;
    // 相机低于地面 1cm 以上 ⇒ 藏网格 ✓
    gridHelper.visible = camera.position.y > gy - 0.01;
  }

  function updateLightHelper() {
    updateGridVisibility();
    if (!lightHelper || !keyLight) return;
    const p = keyLight.position.clone();
    const len = p.length() || 1;
    // 归一化到固定长度（光其实在无穷远 ✗ 只是画个方向 ✓）
    const r = 3.2;
    const tip = p.clone().multiplyScalar(r / len);
    const line = lightHelper.userData.__line;
    line.geometry.setFromPoints([tip, new THREE.Vector3(0, 0, 0)]);
    line.geometry.computeBoundingSphere();
    lightHelper.userData.__dot.position.copy(tip);
  }

  /** 递归释放（辅助显示重建时会换几何体 ✓）*/
  function disposeDeep(o) {
    if (!o) return;
    o.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        const ms = Array.isArray(c.material) ? c.material : [c.material];
        ms.forEach((m) => m && m.dispose && m.dispose());
      }
    });
  }

  let modelRoot = null;
  let mixer = null;
  const clock = new THREE.Clock();
  const meshCache = [];
  let clips = [];
  let currentAction = null;
  let currentClipName = null;
  let wireframeOn = false;
  let skeletonHelper = null;
  let animPlaying = true;
  let autoRotate = cfg.autoRotate;
  let bgIdx = 0;
  let bgTransparent = cfg.backgroundTransparent !== false; // 默认透明背景
  let bgColor = new THREE.Color(cfg.backgrounds[0]);
  let currentLighting = 'day';
  // 旋转基准位置（水平偏移，用户可配置）。角色默认站地面（脚在 y=0）。
  let pivotX = 0;
  let pivotZ = 0;
  let disposed = false;

  const state = {
    get model() { return modelRoot; },
    get meshCount() { return meshCache.length; },
    get autoRotate() { return autoRotate; },
    get wireframe() { return wireframeOn; },
    get skeleton() { return !!skeletonHelper; },
    get animPlaying() { return animPlaying; },
    get currentAnimation() { return currentClipName; },
    get currentLighting() { return currentLighting; },
    get pivot() { return { x: pivotX, z: pivotZ }; },
  };

  /* ---------- 归一化 ---------- */
  /**
   * 注意：`Box3.setFromObject` 遇到 SkinnedMesh 会走 `SkinnedMesh.computeBoundingBox()`
   * （CPU 蒙皮），结果取决于当时的骨骼矩阵状态，**可能算出巨大/错误的盒子**
   * （实测会膨胀到 36×43×138，导致相机飞到 200 开外、角色小到看不见）。
   * 所以这里只在归一化时算一次，把尺寸记在 modelSize 上，之后 frameModel 直接复用。
   */
  let modelSize = null;
  /** 整盒尺寸（SkinnedMesh 的 CPU 蒙皮包围体，不可靠）—— 只给基线 auto 取景沿用，保证老观感不变 */
  let boxSize = null;

  /**
   * 「真实蒙皮内容」的世界空间 AABB。
   * 上面那个整盒靠不住（实测比真实内容大 1.5 倍，且中心/落地都偏），
   * 需要精确居中/量尺寸时用这个：逐顶点跑一次 CPU 蒙皮取包围盒（只在加载时算一次）。
   */
  let contentBox = null;

  function measureContentBox(root) {
    const bb = new THREE.Box3();
    const v = new THREE.Vector3();
    let any = false, bad = 0;
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const pos = o.geometry.getAttribute('position');
      if (!pos) return;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (o.isSkinnedMesh && o.getVertexPosition) o.getVertexPosition(i, v);
        v.applyMatrix4(o.matrixWorld);
        // 个别网格的蒙皮结果会是 NaN（实测 bandxiaoxia 里 CH0155_Star / CH0221_SkillProb_Semla），
        // 而**一个 NaN 就能让整个 Box3 变成 NaN** → 归一化会被跳过 → 模型保持原始尺度、小到看不见。
        // 所以必须逐点过滤。
        if (!isFinite(v.x) || !isFinite(v.y) || !isFinite(v.z)) { bad++; continue; }
        bb.expandByPoint(v);
        any = true;
      }
    });
    if (bad) {
      console.warn('[measure] 有 ' + bad + ' 个顶点的蒙皮结果是 NaN，已跳过（否则整个包围盒会失效）');
    }
    return any ? bb : null;
  }

  function fitModelToView(root) {
    // 归一化基准用「真实蒙皮内容」，不用整盒包围体：
    //   · 整盒来自 SkinnedMesh 的 CPU 蒙皮包围体，各模型偏差不同
    //     （实测 CH0155 偏大约 1.5 倍），于是同一份配置在不同模型上大小不一
    //   · 用真实内容 → targetHeight 就是「角色的真实高度」，与模型无关
    //     （同数值在任何模型上得到同样的屏幕大小）
    const rawContent = measureContentBox(root);
    const refBox = rawContent || new THREE.Box3().setFromObject(root);
    const refSize = refBox.getSize(new THREE.Vector3());
    const maxDim = Math.max(refSize.x, refSize.y, refSize.z);
    if (!isFinite(maxDim) || maxDim === 0) {
      console.warn('[fit] 归一化基准不是有效数值（' + maxDim + '），跳过缩放 —— 模型会保持原始尺度');
      return;
    }

    // 缩放：targetHeight = 角色真实高度（世界单位）
    root.scale.setScalar(cfg.targetHeight / maxDim);

    // 居中：用真实内容 —— 水平居中 + 脚落地（y=0）
    const centered = measureContentBox(root) || new THREE.Box3().setFromObject(root);
    const c = centered.getCenter(new THREE.Vector3());
    root.position.x -= c.x;
    root.position.z -= c.z;
    root.position.y -= centered.min.y;

    // 位置改过了，重新量一次；取景也统一用「真实内容尺寸」
    contentBox = measureContentBox(root) || centered;
    modelSize = contentBox.getSize(new THREE.Vector3());
    // 整盒尺寸仍旧记一份：基线（auto）取景沿用它，保证观感不变
    boxSize = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
    if (!isFinite(boxSize.x) || !isFinite(boxSize.y) || !isFinite(boxSize.z)) {
      console.warn('[fit] 整盒尺寸算出 NaN（个别网格蒙皮异常），改用真实内容尺寸');
      boxSize = modelSize.clone();
    }
    // 同时量一次「真实内容」的包围盒（tight 取景要用）
    contentBox = measureContentBox(root);
    // ⚠️ 记下「落地后的 y」✗ applyGroundOffset 从这里加偏移 ✓
    root.userData.__baseY = root.position.y;
    // ★ 位置修正的基准（XYZ ✗ 见 applyGroundOffset ✓）
    root.userData.__basePos = root.position.clone();
    // ⚠️ 取景中心也记一份 —— 贴地会整体下移 ✗ 取景得跟着走（见 frameModel ✓）
    root.userData.__baseCenterY = (measureContentBox(root) || centered).getCenter(new THREE.Vector3()).y;
  }

  /* ---------- 相机对准 ---------- */
  /** 基线的参考画布高度：在此高度下 dist = maxDim × 2.2 */
  const FRAMING_REF_H = 640;
  let lastCssH = 0;

  function frameModel() {
    if (!modelRoot) return;
    // 复用归一化时算出的尺寸，绝不在这里重新 setFromObject（见上）
    const size = modelSize
      ? modelSize.clone()
      : new THREE.Vector3(cfg.targetHeight, cfg.targetHeight, cfg.targetHeight);
    const maxDim = Math.max(size.x, size.y, size.z);

    // tight 模式：用「真实蒙皮内容」的中心对准
    //（整盒的中心/落地都是错的，会导致角色偏心 + 悬空）
    let center;
    if (cfg.framing === 'tight' && contentBox) {
      center = contentBox.getCenter(new THREE.Vector3());
    } else {
      center = new THREE.Vector3(0, size.y * 0.5, 0); // 盒已居中、脚在 y=0
    }

    // 画布高度取哪个值来算相机参数：
    //  · 配置了 framingReferenceHeight → 用那个固定值
    //       相机参数成为固定的世界量 ⇒ 面板按百分比缩放时画面整体等比缩放
    //  · 没配 → 用当前画布高度
    //       相机距离随画布等比 ⇒ 角色在屏幕上的像素大小与容器无关（锁定像素）
    const cssH = Math.max(1, container.clientHeight || FRAMING_REF_H);
    const refH = cfg.framingReferenceHeight > 0 ? cfg.framingReferenceHeight : cssH;
    let boxDim = boxSize
      ? Math.max(boxSize.x, boxSize.y, boxSize.z)
      : Math.max(size.x, size.y, size.z);
    if (!isFinite(boxDim) || boxDim <= 0) boxDim = Math.max(size.x, size.y, size.z);

    // 相机距离
    let dist;
    if (cfg.framing === 'tight' && cfg.framingReferenceHeight > 0) {
      // 「锁定屏幕高度」：让角色真实内容在参考画布上正好占 modelHeightPx 个 CSS 像素。
      //   contentPx = contentWorldH × refH / (2 × dist × tan(fov/2))
      //   → 解出 dist。因为 contentWorldH 已由 targetHeight 归一化过，
      //     所以同一个 modelHeightPx 在任何模型上都是同样的屏幕大小。
      const wantPx = cfg.modelHeightPx > 0 ? cfg.modelHeightPx : 360;
      dist = (size.y * refH) / (2 * Math.tan((cfg.fov * Math.PI / 180) / 2) * wantPx);
    } else if (cfg.framing === 'tight') {
      // 锁定像素（不配参考高度时）：距离随画布高等比
      dist = boxDim * 2.2 * (refH / FRAMING_REF_H);
    } else {
      // 基线：保持原有观感（用整盒，与内容归一化的改动互相抵消）
      dist = boxDim * 2.2;
    }

    // 取景垂直偏移（CSS 像素，正值 = 取景下移 → 画面内容上移）
    // 用途：模型某些动作（如倒地）会把内容压在画面下方，整体下移取景可以把上下余量拉平。
    // 换算：refH 这个高度下每世界单位占多少 CSS 像素（所以它也跟着等比缩放）
    let shiftY = 0;
    if (cfg.framingOffsetY) {
      const pxPerUnit = refH / (2 * dist * Math.tan((cfg.fov * Math.PI / 180) / 2));
      shiftY = -cfg.framingOffsetY / pxPerUnit;
    }

    // 旋转轴 = 对准点 + 用户可配置的水平偏移（默认 0，不影响基线）
    /**
     * ★ 取景中心要**跟着落地微调走**。
     *
     * ⚠️ `center` 来自 `contentBox` ✗ 而它是 `fitToView` 时量的（贴地**之前** ✓）⇒
     *   贴地把模型整体下移了 `groundOffsetY` ✗ 取景中心却还停在旧位置 ⇒
     *   偏移小时看不出来（实测 24 个动作余量都 ≥11% ✓）✗
     *   但滑杆能拖到 ±0.5（= 身高的 25%）⇒ 那时候就会顶出画面 ✓
     *   ⇒ 用户的直觉是对的：「地表要不要跟着抬」——
     *     地面不用动（脚已经踩在 y=0 ✓）✗ 要动的是**取景** ✓
     */
    const __gOff = Number(cfg.groundOffsetY) || 0;
    /**
     * ★★ 旋转中心 = **模型的真实中心**（跟着「修正模型位置」走 ✓）
     *
     * ⚠️⚠️ 原来这里用的是 `pivotX / pivotZ`（「取景中心偏移」✓）——
     *   那套东西**只动相机对准点** ✗ 模型和影子都没动 ✓
     *   看起来「模型移位了」✗ 但其实只是相机在看别处 ⇒
     *   旋转中心没动 · 影子也没动 ⇒ **不直观** ✓
     *
     *   （用户的原话：那套「本来就是为了实现旋转时角色在旋转中心」
     *     而他要的是「直观把模型移动到 000 ✗ 不动旋转轴 · 动角色位置」✓）
     *
     * ⇒ 现在直接用 `modelOffset` 三轴：
     *     · 模型真的移了（影子 / 描边 / 光照全跟着 ✓）
     *     · 相机对准点 = 模型的新中心 ⇒ **旋转天然以角色为中心** ✓
     */
    const mo = getModelOffset();
    /**
     * ⚠️⚠️⚠️ **水平对准点用「过原点的中轴线」（x/z = 0）· 不用 `center.x/z`** ——
     *
     *   原来看的是**模型内容中心**（`contentBox` 的 center ✓ 本模型 x ≈ -0.1 ✓）⇒
     *   初始取景是「对着模型中心」✗ 不是「沿世界轴正视」✓
     *
     *   而 `applyViewPreset('front')` 会把 x/z 归零 ✓
     *   ⇒ 如果**先 frameModel 再摆正视** ⇒ 相机会横移 ~0.1 + 竖直跳一下 ✓
     *     （用户报的：「为什么刚载入时相机位置不一样会跳变一下」✓）
     *
     *   ⚠️ 竖直方向还有一处不同：`frameModel` 会把相机抬高 `elev`（略微俯视 ✓）
     *      而 `applyViewPreset` 是「相机与目标同高」⇒ 竖直也会跳 ✓
     *
     *   ⇒ ✅ 正解：**让初始取景本身就是「沿中轴线的正视」** ✗
     *      而不是「先摆一个 ✗ 再掰到正视」✓
     *      · 水平：x/z 用 modelOffset（模型挪到哪 ✗ 中轴就跟着到哪 ✓）
     *      · 竖直：保留 `elev` 的轻微俯视（观感更好 ✗ 且这是初始状态不是跳变 ✓）
     *      · 相机位置本来就在 `target.z + dist` ⇒ **天然落在世界 +Z 轴上** ✓
     */
    /**
     * ★★★ **相机对准点恒为「过原点的竖直中轴线」（x = z = 0）** ——
     *
     *   ⚠️⚠️⚠️ 我上一轮写错成 `new THREE.Vector3(mo.x, …, mo.z)` ✗
     *     以为「目标跟着模型偏移走」更直观 ✓
     *     结果：相机跟着 modelOffset 漂到 x=0.13 ⇒ **不再是正视** ✓
     *     （用户：「你现在初始加载的相机视角又不是正视了」✓）
     *
     *   ⚠️ 用户把 `modelOffset` 的职责说得很清楚：
     *
     *       「它就是**表明模型要在 x0z0 且脚贴地面的中轴线上**
     *         需要的**模型移动补偿**」
     *       「**不会影响相机取景** · 不会影响场景地面等的移动」
     *
     *   ⇒ 所以分工是：
     *     · `modelOffset` ⇒ **只作用在模型根节点上**
     *       （`applyGroundOffset()` 干这件事 ✗ 和这里无关 ✓）
     *     · 相机对准点 ⇒ **恒为 (0, y, 0)** ✗ 谁都别想动它 ✓
     *     · 场景地面 / 网格 ⇒ 也在 y=0 的原点 ⇒ 同样不受影响 ✓
     *
     *   ⇒ 这样「模型被摆到中轴线上」和「相机沿中轴线正视」就**自动对齐** ✓
     *     而两者都不需要互相知道 ✓
     */
    const target = new THREE.Vector3(0, center.y + shiftY, 0);
    controls.target.copy(target);

    // 相机抬高量：基线是固定世界量 size.y*0.08。
    // tight 模式下改成「随 dist 等比」，否则缩小容器时抬高角变大，
    // 透视会让内容的投影包络跟着变大（实测 420 高时左侧包络从 149 涨到 192）。
    const elev = cfg.framing === 'tight'
      ? dist * ((size.y * 0.08) / (Math.max(size.x, size.y, size.z) * 2.2))
      : size.y * 0.08;

    camera.position.set(target.x, center.y + elev + shiftY, target.z + dist);
    controls.minDistance = dist * 0.25;
    controls.maxDistance = dist * 4;
    controls.update();
    lastCssH = cssH;
  }

  /* ---------- 动画播放 ---------- */
  function playClip(clip) {
    if (!mixer || !clip) return;
    if (currentAction) currentAction.fadeOut(0.2);
    currentAction = mixer.clipAction(clip);
    currentAction.reset().setLoop(THREE.LoopRepeat).fadeIn(0.2).play();
    currentClipName = clip.name;
    // 保持与「播放/暂停」开关一致
    mixer.timeScale = animPlaying ? 1 : 0;
    applyVisibilityRules();   // 盾牌/武器这类"只在特定动作里出现"的网格（手写规则）
    if (cfg.hideOptional) applyOptionalParts();   // GLB 标了 optional 的部件按动作自动显隐
    // 通知页面「动作已切换」——页面据此同步选单，不必去读查看器内部状态
    emit('ba3d:action', { name: clip.name });
  }

  /**
   * 骨架里"最顶层的那根骨骼" —— 要挑**子树最大**的那根。
   *
   * 不能简单取"第一个没有骨骼父级的骨骼"：models/BlueArchiveModels 那批模型里，
   * 道具（无人机 / 计算器 / 面具 / 服装配件）的骨骼是**与角色骨架平级的独立根**，
   * 先撞上的往往是它们 —— 实测 Shiroko.glb 就挑中了 bone_dron_root，
   * 结果原地化压的是无人机的 position（Bip001 反而没处理），无人机还被钉死。
   * 角色主骨架的子树有 100+ 根骨骼，道具只有 0~23 根，按子树大小挑最稳。
   */
  function findTopBone() {
    if (!modelRoot) return null;
    let best = null, bestCount = -1;
    modelRoot.traverse((o) => {
      if (!o.isBone) return;
      let p = o.parent, hasBoneParent = false;
      while (p) { if (p.isBone) { hasBoneParent = true; break; } p = p.parent; }
      if (hasBoneParent) return;
      let count = 0;
      o.traverse(() => { count++; });
      if (count > bestCount) { bestCount = count; best = o; }
    });
    return best;
  }

  /* ---------- 根位移补偿（对象级，完全不碰动画轨道） ---------- */
  /**
   * 把角色的「根位移」在**对象层**抵消掉，而不是去改写动画轨道。
   *
   * 旧做法（压平 `Bip001` / `bone_root` 的 position 轨道）有个致命副作用：
   * 那些挂在**模型根下、不随骨架移动**的道具（牛奶盒 / 冰激凌 / 计算器 / 无人机）
   * 会和身体**分家** —— 实测 Natsu 的牛奶盒从嘴边(57% 身高)跑到头顶(90%)，
   * Airi 的冰激凌同样如此。
   *
   * 新做法：**动画照常播放**（骨骼之间的内部关系一丝不动，道具自然还挂在原处），
   * 每帧读出根骨骼相对 modelRoot 的位移，把 modelRoot 反向偏移，从而把角色钉在画面里。
   *
   * 关键细节：用「相对 modelRoot 的局部坐标」而不是世界坐标 ——
   * 世界坐标里含了上一帧的偏移量，会形成自反馈（抬起→判定不需要→落回）；
   * 而 worldToLocal 会把 modelRoot 自身的平移除干净，天然无反馈。
   *
   * 只抵消水平(X/Z)、保留竖向 —— 跳跃/倒地的上下位移是动作本身要表达的。
   */
  let rootComp = null;

  function prepareRootCompensation() {
    rootComp = null;
    if (cfg.stripRootMotion !== 'compensate' || !modelRoot) return false;
    const top = findTopBone();
    if (!top) return false;
    modelRoot.updateMatrixWorld(true);
    const w = new THREE.Vector3();
    top.getWorldPosition(w);
    const local = modelRoot.worldToLocal(w.clone());
    rootComp = { node: top, base: local.clone(), basePos: modelRoot.position.clone() };
    console.debug('[rootMotion] 对象级补偿已启用，基准节点 =', top.name);
    return true;
  }

  function applyRootCompensation() {
    if (!rootComp || !modelRoot) return;
    const w = new THREE.Vector3();
    rootComp.node.getWorldPosition(w);
    const local = modelRoot.worldToLocal(w.clone());
    // ⚠️ worldToLocal 会**除以模型缩放**（归一化后 scale≈1.7），
    // 所以局部增量要乘回缩放才是真正的世界位移，否则只抵消掉 1/scale。
    const sc = modelRoot.scale.x || 1;
    const dx = (local.x - rootComp.base.x) * sc;
    const dz = (local.z - rootComp.base.z) * sc;
    modelRoot.position.x = rootComp.basePos.x - dx;
    modelRoot.position.z = rootComp.basePos.z - dz;
  }

  /**
   * ★★ 量「脚有没有踩在 y=0 上」—— 用**蒙皮后**的真实顶点，不是包围盒 ✓
   *
   * ⚠️ 为什么不能直接用包围盒：
   *   `SkinnedMesh.boundingBox` 来自**绑定姿势**的几何体 ✓
   *   模型站直时它是对的 ✗ 一旦播放动画（蹲 / 抬手 / 抬腿 ✓）就不准了 ✓
   *   ⇒ 必须对每个顶点做一次**蒙皮变换**（`applyBoneTransform` ✓）才算数 ✓
   *
   * ⚠️ 顶点可能几十万 ✗ 全量算太贵 ⇒ 采样（默认每个网格约 2000 个点 ✓）✓
   *   脚部的顶点密度足够高 ✗ 采到最低点没问题 ✓
   *
   * @returns {{minY:number|null, groundY:number, gap:number|null, sampled:number, meshes:number}}
   */
  /**
   * ★ 找「脚部骨骼」的判据
   *
   * ⚠️⚠️ 为什么要单独认脚：
   *   有些模型在**脚边带了道具**（CH0155 是牛奶盒 ✓）✗
   *   道具的最低点**比脚还低** ⇒ 按全局最低点落地 ⇒
   *   **道具贴地 · 脚悬空** ✓（用户原话：「牛奶盒在地面 ✗ 脚就悬空了」）
   *
   * ⚠️ 不能只用骨骼位置 —— 骨骼在**脚踝** ✗ 摆到 y=0 会让脚陷进去 ✓
   *   ⇒ 必须看**蒙皮到脚部骨骼的那些顶点**的最低点 ✓
   */
  const FOOT_BONE_RE = /foot|toe|ankle|ball|sole|足|踝|脚/i;

  function measurePosedBottom(root, perMesh) {
    const limit = perMesh || 2000;
    const v = new THREE.Vector3();
    let minY = Infinity, sampled = 0, meshes = 0;
    let footMinY = Infinity, footSampled = 0;   // ★ 只统计脚部骨骼蒙皮的顶点 ✓
    const __diag = { skinnedMeshes: 0, withSkinAttr: 0, boneNames: [], matched: 0 };
    if (!root) return { minY: null, groundY: 0, gap: null, sampled: 0, meshes: 0 };
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      // 描边壳是放大过的反壳 ✗ 不参与 ✓
      if (o.userData && o.userData.__isLilOutline) return;
      if (o.isSkinnedMesh) {
        __diag.skinnedMeshes++;
        if (o.geometry.attributes.skinIndex && o.geometry.attributes.skinWeight) __diag.withSkinAttr++;
        if (__diag.boneNames.length < 6 && o.skeleton && o.skeleton.bones) {
          for (const b of o.skeleton.bones) {
            if (__diag.boneNames.length >= 6) break;
            __diag.boneNames.push(b.name || '(无名)');
          }
        }
      }
      const pos = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
      if (!pos || !pos.count) return;
      meshes++;
      const step = Math.max(1, Math.floor(pos.count / limit));
      for (let i = 0; i < pos.count; i += step) {
        v.fromBufferAttribute(pos, i);
        /* ★ 取权重最大的那根骨骼当「主导骨骼」（道具通常挂在手 / 独立根上 ✓）*/
        let __dom = -1, __dw = -1;
        if (o.isSkinnedMesh && o.geometry.attributes.skinIndex && o.geometry.attributes.skinWeight) {
          const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
          /**
           * ⚠️⚠️⚠️ **不能用 `at.array[i*4+c]`** ——
           *   这些几何体的 skinIndex / skinWeight 是 **InterleavedBufferAttribute**
           *   （交错缓冲 ✓）⇒ `.array` 是**共享的大缓冲** ⇒
           *   按下标读会拿到**垃圾值** ✓
           *   （实测读出 `firstDom = 14985` ✗ 而骨架只有 101 根骨骼 ✓）
           *
           * ⇒ 用 `getX/getY/getZ/getW` —— 两种属性类型都有 ✗ 交错时会自己算偏移 ✓
           */
          const w4 = [sw.getX(i), sw.getY(i), sw.getZ(i), sw.getW(i)];
          const i4 = [si.getX(i), si.getY(i), si.getZ(i), si.getW(i)];
          for (let c = 0; c < 4; c++) {
            if (w4[c] > __dw) { __dw = w4[c]; __dom = i4[c]; }
          }
        }
        if (o.isSkinnedMesh && typeof o.applyBoneTransform === 'function') {
          o.applyBoneTransform(i, v);          // 蒙皮（返回网格局部空间 ✓）
        } else if (o.isSkinnedMesh && typeof o.boneTransform === 'function') {
          o.boneTransform(i, v);               // three < r151 的旧名
        }
        v.applyMatrix4(o.matrixWorld);          // → 世界空间
        if (v.y < minY) minY = v.y;
        /* 诊断：把「第一个有效主导骨骼」记下来（看不出脚就靠它定位 ✓）*/
        if (__dom >= 0 && __diag.firstDom === undefined) {
          __diag.firstDom = __dom;
          __diag.firstDomName = (o.skeleton && o.skeleton.bones && o.skeleton.bones[__dom])
            ? (o.skeleton.bones[__dom].name || '(无名)') : '(越界)';
          __diag.firstDomY = +v.y.toFixed(4);
          __diag.skeletonBoneCount = o.skeleton ? o.skeleton.bones.length : 0;
        }
        if (__dom < 0) __diag.noDom = (__diag.noDom || 0) + 1;
        // ★ 这个顶点主要受脚部骨骼驱动吗 ⇒ 单独记一份 ✓
        if (__dom >= 0 && o.skeleton && o.skeleton.bones && __dom < o.skeleton.bones.length
            && o.skeleton.bones[__dom]
            && FOOT_BONE_RE.test(o.skeleton.bones[__dom].name || '')) {
          if (v.y < footMinY) footMinY = v.y;
          footSampled++;
          __diag.matched++;
          if (__diag.hitBone === undefined) __diag.hitBone = o.skeleton.bones[__dom].name;
        }
        sampled++;
      }
    });
    const my = isFinite(minY) ? minY : null;
    const fy = isFinite(footMinY) ? footMinY : null;
    const gy = ground ? ground.position.y : 0;
    /**
     * ★★ 落地优先用**脚底**（有脚部骨骼就必用 ✓）✗ 没有才退回全局最低 ✓
     *   ⇒ 道具比脚低时不会再把角色顶起来 ✓
     */
    const use = fy !== null ? fy : my;
    return {
      minY: my, footMinY: fy, useY: use, groundY: gy,
      gap: use === null ? null : +(use - gy).toFixed(4),
      minYGap: my === null ? null : +(my - gy).toFixed(4),
      footSampled, sampled, meshes,
      /** 诊断：蒙皮属性 / 骨骼名（定位「认不出脚」用 ✓）*/
      diag: __diag,
    };
  }

  /* ============================================================
   * ★ 光照编辑（对齐 Unity 的 Directional Light ✓）
   *
   * ⚠️ `keyLight` 是**方向光** ✗ 它的 `position` 只表示**方向**（光源在无穷远 ✓）
   *   ⇒ 与其让人填 xyz ✗ 不如给**方位角 / 仰角** —— Unity 的习惯也是转朝向 ✓
   *
   *   azimuth   [0,360)  绕 Y 轴 ✗ 0 = +Z 方向（模型的正面 ✓）✗ 顺时针增加
   *   elevation [-89,89] 仰角 ✗ 0 = 地平线 · 90 = 正上方
   *
   * ⚠️ 预设里的 `key.position` 是直接给的 xyz ⇒
   *     **读**的时候要反解成角度（positionToAngles ✓）✗ 这样两边能共存 ✓
   * ============================================================ */
  const KEY_DIST = 8;   // 换算用的距离 ✗ 只影响指示器画多长 ✓

  function anglesToPosition(azDeg, elDeg, dist) {
    const a = (Number(azDeg) || 0) * Math.PI / 180;
    const e = Math.max(-89, Math.min(89, Number(elDeg) || 0)) * Math.PI / 180;
    const r = dist || KEY_DIST;
    return new THREE.Vector3(
      r * Math.cos(e) * Math.sin(a),
      r * Math.sin(e),
      r * Math.cos(e) * Math.cos(a)
    );
  }

  function positionToAngles(v) {
    const p = v.clone().normalize();
    const el = Math.asin(Math.max(-1, Math.min(1, p.y))) * 180 / Math.PI;
    let az = Math.atan2(p.x, p.z) * 180 / Math.PI;
    if (az < 0) az += 360;
    return { azimuth: +az.toFixed(2), elevation: +el.toFixed(2) };
  }

  /** 读当前主光 / 环境光（角度是从 position 反解的 ✓）*/
  function readLightState() {
    const ang = positionToAngles(keyLight.position);
    return {
      azimuth: ang.azimuth,
      elevation: ang.elevation,
      keyColor: '#' + keyLight.color.getHexString(),
      keyIntensity: +keyLight.intensity.toFixed(4),
      hemiSky: '#' + hemi.color.getHexString(),
      hemiGround: '#' + hemi.groundColor.getHexString(),
      hemiIntensity: +hemi.intensity.toFixed(4),
      rimIntensity: +rimLight.intensity.toFixed(4),
      fillIntensity: +fillLight.intensity.toFixed(4),
      exposure: +renderer.toneMappingExposure.toFixed(4),
      preset: cfg.lightingPreset || null,
    };
  }

  /**
   * 改主光 / 环境光。
   *
   * ⚠️ 一旦手动改过 ✗ 就把 `cfg.lightingPreset` 置空 ——
   *   否则下次 `applyLighting()` 会把用户改的值全盖掉 ✓
   *
   * ⚠️ 卡通模式下 `applyLighting` 会给强度乘系数（key ×1.22 ✗ rim/fill ×0.15 ✓）⇒
   *   这里直接写**最终值** ✗ 不走那条路（否则用户看到的值和实际不符 ✓）
   */
  function writeLightState(o) {
    if (!o) return readLightState();
    /**
     * ⚠️⚠️⚠️ **「手动改过」必须是「值真的变了」· 不能只要调了就算** ——
     *
     *   原来：`if (o.azimuth !== undefined) { …; touchedKey = true; }`
     *     ⇒ 有人把**当前值原样写回**也判成「手动改过」⇒
     *       `cfg.lightingPreset` 被清空 ⇒ **预设丢失** ✓
     *     ⇒ 导出的表现：本该是 `"lighting": "day"` ✗
     *       却变成一坨 `lightState: { azimuth, elevation, keyColor, … }` ✓
     *       （用户报的：「sample 里也不是直接显示预设光照 ✗ 而是一堆光照参数」✓）
     *
     *   ⇒ 加上**真的变了**才置位 ✓（1e-6 容差避开浮点噪声 ✓）
     */
    let touchedKey = false, touchedHemi = false, touchedOther = false;
    const EPS = 1e-6;
    const changed = (a, b) => Math.abs(Number(a) - Number(b)) > EPS;
    if (o.azimuth !== undefined || o.elevation !== undefined) {
      const cur = positionToAngles(keyLight.position);
      const az = o.azimuth !== undefined ? Number(o.azimuth) : cur.azimuth;
      const el = o.elevation !== undefined ? Number(o.elevation) : cur.elevation;
      if (changed(az, cur.azimuth) || changed(el, cur.elevation)) touchedKey = true;
      keyLight.position.copy(anglesToPosition(az, el));
    }
    if (o.keyIntensity !== undefined) {
      if (changed(o.keyIntensity, keyLight.intensity)) touchedKey = true;
      keyLight.intensity = Math.max(0, Number(o.keyIntensity) || 0);
    }
    if (o.keyColor !== undefined) {
      try {
        const want = new THREE.Color(String(o.keyColor));
        if (want.getHex() !== keyLight.color.getHex()) touchedKey = true;
        keyLight.color.copy(want);
      } catch (e) {}
    }
    if (o.hemiIntensity !== undefined) {
      if (changed(o.hemiIntensity, hemi.intensity)) touchedHemi = true;
      hemi.intensity = Math.max(0, Number(o.hemiIntensity) || 0);
    }
    if (o.hemiSky !== undefined) {
      try { const w = new THREE.Color(String(o.hemiSky)); if (w.getHex() !== hemi.color.getHex()) touchedHemi = true; hemi.color.copy(w); } catch (e) {}
    }
    if (o.hemiGround !== undefined) {
      try { const w = new THREE.Color(String(o.hemiGround)); if (w.getHex() !== hemi.groundColor.getHex()) touchedHemi = true; hemi.groundColor.copy(w); } catch (e) {}
    }
    /* 边缘补光 / 正面补光 / 曝光：同样按「值真的变了」判定，理由同上 */
    if (o.rimIntensity !== undefined) {
      const w = Math.max(0, Number(o.rimIntensity) || 0);
      if (changed(w, rimLight.intensity)) touchedOther = true;
      rimLight.intensity = w;
    }
    if (o.fillIntensity !== undefined) {
      const w = Math.max(0, Number(o.fillIntensity) || 0);
      if (changed(w, fillLight.intensity)) touchedOther = true;
      fillLight.intensity = w;
    }
    if (o.exposure !== undefined) {
      const w = Number(o.exposure) || 1;
      if (changed(w, renderer.toneMappingExposure)) touchedOther = true;
      renderer.toneMappingExposure = w;
    }
    /**
     * ⚠️⚠️⚠️ **手动改过光照 ⇒ 两个地方都要清** ——
     *
     *   原来只清了 `cfg.lightingPreset`，漏了模块变量 `currentLighting` ✓
     *   ⇒ 而 `applyRender()` 末尾会 `applyLightingPreset(currentLighting)` ✓
     *     （见本文件里「卡通模式下光照重新补偿」那处 ✓）
     *   ⇒ `setLilConfig()` = `applyLilConfig()` + `applyRender()` ✓
     *     ⇒ **调任何一个 lilToon 参数都会把光照按预设原值重算一遍** ✓
     *     ⇒ 用户报的：「调整大多数参数时，自己调整的光照都会回到当前所选
     *        光照预设的初始状态」✓✓✓
     *
     *   而且 `currentLighting` 的初值是 `'day'`（第 1011 行 ✓），
     *   **永远不为 null** ⇒ 上面那条重套**必然发生** ✓
     *
     *   ⚠️ 这正是本文件里已经记过的同一个病（见 applyLightingPreset 的注释 ✓）：
     *     「凡是『模块变量 + cfg 字段』双份的，写入时必须两边一起写」
     *     前面三次是 mouthAtlasUrl / groundOffsetY / currentLighting ↔ cfg，
     *     这次是**同一个 currentLighting 的反方向**（读的时候忘了它 ✓）
     */
    if (touchedKey || touchedHemi || touchedOther) {
      cfg.lightingPreset = null;   // 导出时按「手动值」写 lightState
      currentLighting = null;      // 运行时不再按预设重套（applyRender 会跳过）
    }
    updateLightHelper();
    return readLightState();
  }

  /* ============================================================
   * ★ 相机编辑（对齐 Unity 的 Scene 视图 ✓）
   *
   * ⚠️ 轨道控制器（OrbitControls ✓）由 `camera.position` + `controls.target` 决定 ⇒
   *   只要改这两个 ✗ 调 `controls.update()` 就能生效 ✓
   *
   * ⚠️ 快捷视角保留**当前距离**（否则会突然拉到很远 ✗ 用户会晕 ✓）
   * ============================================================ */
  function readCameraState() {
    const p = camera.position, t = controls.target;
    return {
      position: [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)],
      target: [+t.x.toFixed(4), +t.y.toFixed(4), +t.z.toFixed(4)],
      distance: +p.distanceTo(t).toFixed(4),
      fov: +camera.fov.toFixed(2),
    };
  }

  /**
   * 写相机。
   *
   * ⚠️ 只传 `position` 时**保持看向当前 target** ✓
   * ⚠️ 只传 `target` 时相机**跟着平移**（保持相对方位 ✗ 和 Unity 的「移动观察点」一致 ✓）
   */
  function writeCameraState(o) {
    if (!o) return readCameraState();
    if (Array.isArray(o.target) && o.target.length === 3) {
      const nt = new THREE.Vector3(Number(o.target[0]) || 0, Number(o.target[1]) || 0, Number(o.target[2]) || 0);
      const delta = nt.clone().sub(controls.target);
      controls.target.copy(nt);
      if (!Array.isArray(o.position)) camera.position.add(delta);   // 跟着平移 ✓
    }
    if (Array.isArray(o.position) && o.position.length === 3) {
      camera.position.set(Number(o.position[0]) || 0, Number(o.position[1]) || 0, Number(o.position[2]) || 0);
    }
    if (o.fov !== undefined && isFinite(Number(o.fov))) {
      camera.fov = Math.max(5, Math.min(120, Number(o.fov)));
      camera.updateProjectionMatrix();
    }
    if (o.distance !== undefined && isFinite(Number(o.distance))) {
      const dir = camera.position.clone().sub(controls.target);
      if (dir.lengthSq() < 1e-9) dir.set(0, 0, 1);
      dir.normalize().multiplyScalar(Math.max(0.05, Number(o.distance)));
      camera.position.copy(controls.target).add(dir);
    }
    controls.update();
    return readCameraState();
  }

  /**
   * 轴对齐快捷视角（Unity 的 Scene 视图最常用的六个 ✓）。
   *
   * ⚠️ 保留当前距离 + 当前目标点 ⇒ 只是换个方向看 ✓
   * ⚠️ 正上方 / 正下方用略偏的方向 —— 纯垂直时轨道控制器的 up 会退化（万向锁 ✓）✓
   */
  function applyViewPreset(name) {
    const d = Math.max(0.5, camera.position.distanceTo(controls.target));
    const dirs = {
      front: [0, 0, 1], back: [0, 0, -1],
      right: [1, 0, 0], left: [-1, 0, 0],
      /**
       * ⚠️⚠️ **正上方 / 正下方要用正的方向** ——
       *   原来写的是 `[0.0001, ±1, 0.0001]`（想避开万向锁 ✓ 但偏得太小 ✓）
       *   而下面又写死 `camera.up.set(0, 1, 0)` ⇒
       *   对 `top` 来说视线方向和 up **几乎共线** ⇒ `lookAt` 退化 ⇒
       *   **视口朝向不稳定 / 可能翻转** ✓
       *   （实测 top 的位置偏移只有 0.0004 ✓）
       *
       *   ⇒ 用正方向 ✗ 靠**换一个不共线的 up** 来避免退化（见下 ✓）
       */
      top: [0, 1, 0],
      /**
       * ⚠️⚠️ **仰视不能用 `[0,-1,0]`** ——
       *   那会把相机放到目标正下方 `d` 远处（实测 y = -3.65 ✓）
       *   ⇒ **地面网格整个盖在角色上** ⇒ 看不清 ✓
       *   ⚠️ 而且我在 `controls.update()` **之前**夹 y 是**没用的** ——
       *     `update()` 会按球坐标把相机重新算回去 ✓
       *     （实测：夹到 0.25 ✗ 结果还是 -0.30 ✓）
       *
       *   ⇒ 直接让**方向本身**不钻地：低角度仰拍 ✓
       *     `[0, -0.15, 1]` 归一化后 y ≈ -0.148 ⇒ 相机落在 y ≈ 0.15
       *     ⇒ 在地面之上 ✗ 从低处往上看角色 ⇒ 这才是好用的「仰视」✓
       */
      /**
       * ⚠️⚠️ **仰视 = 从正下方往上看**（Unity / Blender 的 Bottom 视图 ✓）
       *
       *   我前面**连着改错两次**：
       *     第一版：`[0.0001, -1, 0.0001]` ⇒ 方向对 ✗ 但 up 和视线共线 ⇒ 朝向退化
       *     第二版：`[0, -0.15, 1]`     ⇒ **斜的** ✗ 根本不是仰视了 ✓
       *   用户的诉求一直很清楚：**按 Unity / Blender 的惯例 ✗ 直的** ✓
       *
       *   ⇒ 回到 `[0, -1, 0]` ✗ 朝向问题靠 `up` 解决（见下 ✓）
       *   ⇒ 地面网格的遮挡另想办法（相机低于地面时藏网格 ✓）
       */
      bottom: [0, -1, 0],
    };
    const dir = dirs[name];
    if (!dir) return readCameraState();
    const v = new THREE.Vector3(dir[0], dir[1], dir[2]).normalize().multiplyScalar(d);
    /**
     * ★★ 轴向视图**对着「过原点的竖直中轴线」**（Unity / Blender 的惯例 ✓）
     *
     *   ⚠️ 原来是把相机放在 `controls.target ± 方向×距离` ✓
     *     而 target 是**模型中心**（本模型 x = -0.1 ✓）⇒
     *     所谓「正视 / 侧视」其实是对着**模型中心**打 ✗ 不是沿世界轴看 ✓
     *     ⇒ 四张轴向视图都**偏了 0.1** ✓
     *
     *   （用户：「快捷视角你相机正、后、左、右能不能都是
     *     **对着 000 向上打出的中轴线**？」✓）
     *
     *   ⇒ 水平四视图把目标的 x/z **归零** ✗ 只保留 y ✓
     *     这样相机就落在世界轴上 ✗ 视线是沿着轴向的 ✓
     *     ⚠️ 俯视 / 仰视本来就是竖直看 ✗ 不受影响（也顺手归零 ✓）
     *     ⚠️ 归零的是**相机对准点** ✗ 模型位置一点没动 ✓
     */
    const t = controls.target.clone();
    t.x = 0; t.z = 0;
    controls.target.copy(t);
    camera.position.copy(t).add(v);
    /**
     * ⚠️⚠️⚠️ **仰视不能钻到地面以下** ——
     *   原来 bottom 把相机放到 `target.y - d`（实测 y = -3.65 ✓）
     *   ⇒ **地面网格整个盖在角色上**（网格线穿过模型 ✓）⇒ 完全看不清 ✓
     *   （用户报的「俯视、仰视出问题了」✓）
     *
     *   ⇒ 夹到地面之上一点点 ✗ 变成「从低处往上看」的仰角 ✓
     *     ⚠️ 代价：不再是数学上的正下方 ✗ 但**看得见**才是有用的 ✓
     */
    /**
     * ⚠️ 这里原来有一段「把相机夹在地面之上」的补丁 ✗ 已删 ✓
     *   它让仰视不再是仰视（相机被顶到 y=0.25 ✗ 变成低角度前视 ✓）
     *   ⇒ 网格遮挡的问题改用「低于地面时藏网格」解决 ✓
     */
    /**
     * ⚠️⚠️ **正上 / 正下时必须换 up** ——
     *   视线方向和 `(0,1,0)` 共线 ⇒ `lookAt` 退化 ✗ 视口朝向随机 ✓
     *   ⇒ 俯视用 `(0,0,-1)`（屏幕上方 = -Z ✗ 和常见约定一致 ✓）
     *     仰视用 `(0,0,1)` ✓
     */
    /**
     * ⚠️⚠️⚠️ **俯视 / 仰视的 up 用 `(0,0,1)`** —— 也就是**正常的朝向** ✓
     *
     *   我第一版写的是 `dir[1] > 0 ? -1 : 1` ⇒ 俯视用 `(0,0,-1)` ✓
     *   那会让**角色的正面（+Z）指向屏幕下方** ⇒ 画面里模型是**倒的** ✓
     *   （用户：「我的意思是 ✗ 就正常的朝向，好不好」✓）
     *
     *   ⇒ 统一用 `(0,0,1)`：屏幕上方 = +Z = 角色正面 ⇒ 正着看 ✓
     *     而且它对俯视和仰视都成立（因为两者视线都是竖直的 ✓）
      */
    if (Math.abs(dir[1]) > 0.99) camera.up.set(0, 0, 1);
    else camera.up.set(0, 1, 0);
    controls.update();
    /**
     * ⚠️⚠️ **切完预设立刻刷一次网格可见性** ——
     *   只挂在每帧钩子里实测**没生效**（仰视时网格照样盖在角色上 ✓）
     *   ⇒ 在预设这条路径上**直接调一次** ✗ 确定性 ✓
     */
    if (typeof updateGridVisibility === 'function') updateGridVisibility();
    return readCameraState();
  }

  /* ============================================================
   * ★ 修正模型位置 XYZ（用户的「基准 + 落地微调」合并需求 ✓）
   *
   * ⚠️ 和「取景中心偏移」（`pivotX/pivotZ` ⇒ `cfg.pivot` ✓）**不是一回事**：
   *     移动**模型**   ⇒ 影子 / 描边 / 光照全跟着动
   *     移动**取景中心** ⇒ 只有相机在看哪儿变了 ✗ 影子不动 ✓
   *   ⇒ 这个组是前者（用户要的是「修正模型位置」✓）
   *
   * ⚠️ Y 这一项**就是**原来的「落地微调」—— 自动贴地也写它 ✓
   * ============================================================ */
  function getModelOffset() {
    const o = cfg.modelOffset || (cfg.modelOffset = { x: 0, y: 0, z: 0 });
    return { x: Number(o.x) || 0, y: Number(o.y) || 0, z: Number(o.z) || 0 };
  }

  function setModelOffset(p) {
    const o = getModelOffset();
    if (p && p.x !== undefined) o.x = Number(p.x) || 0;
    if (p && p.y !== undefined) o.y = Number(p.y) || 0;
    if (p && p.z !== undefined) o.z = Number(p.z) || 0;
    cfg.modelOffset = o;
    // ⚠️ 兼容老字段：groundOffsetY 就是 modelOffset.y ✓
    cfg.groundOffsetY = o.y;
    applyGroundOffset();
    frameModel();          // 取景中心跟着走（和落地微调一个道理 ✓）
    return getModelOffset();
  }

  /* ============================================================
   * ★ 动作 / 编辑 两种模式（对齐 Unity 的 Play / Edit ✓）
   *
   *   action（= Unity 的 run ✓）  正常播放用户选的动作
   *   edit  （= Unity 的 edit ✓） 暂停 ✗ 并套一个「方便看模型」的姿势：
   *        ① 名字里有 T-POSE / TPose / T_Pose ⇒ 首选
   *        ② 否则名字里带 `_Cam` 的动作（用户点名的 ✓）
   *        ③ 都没有 ⇒ 退回当前动作的第 0 帧（暂停 ✓）
   *
   *   ⇒ 退出去时恢复进入前的动作 + 播放状态 ✓
   * ============================================================ */
  /** 找一个「适合看模型」的动作名（找不到返回 null ✓）*/
  function findEditPoseClip() {
    if (!clips || !clips.length) return null;
    const norm = (s) => String(s || '').toLowerCase().replace(/[\s_-]/g, '');
    // ① T-POSE 家族
    for (const c of clips) {
      const n = norm(c.name);
      if (n.includes('tpose') || n.includes('tpost') || n === 'tpose' || n === 'tpost') return c.name;
    }
    // ② 带 _Cam 的（用户点名的 ✓）
    for (const c of clips) {
      if (/_cam/i.test(String(c.name || ''))) return c.name;
    }
    return null;
  }

  function readSceneMode() {
    return { mode: cfg.sceneMode || 'action', restoreClip: cfg.__editRestoreClip || null, usedClip: cfg.__editUsedClip || null };
  }

  /**
   * ⚠️⚠️ **不要用 `this`** —— 本函数是**模块作用域的函数** ✗
   *   而调用它的是 viewer 对象上的同名方法 ✓
   *   虽然写了 `setSceneMode.call(this, m)` ✗ 但那条路不可靠（踩过：姿势没套上 ✓）
   *   ⇒ 改成**显式把 api 对象传进来** ✓
   */
  /**
   * ★★ 显示模式（`view` / `edit`）—— 用户的「场景显示切换」需求 ✓
   *
   *   view（= 原来的 action ✓）  **只显示地面网格**，其余辅助全关
   *                              网格 8 / 分格 16 / 轴长 1.6
   *   edit                      辅助显示**全开** ✗
   *                              网格和轴长**拉到最大**（24 / 48 / 4 ✓）
   *
   * ⚠️ 和「动作模式」是**同一个开关**（用户说「edit/view（action）模式」✓）
   *   ⇒ 内部仍用 'action' / 'edit'（不改数据 ✗ 只改显示名 ✓）
   *
   * ⚠️ 滑杆范围：网格大小 2..24 · 坐标轴长 0.4..4 ⇒ 「最大」取这两个上界 ✓
   */
  const HELPER_PRESETS = {
    view: { showGrid: true,  showAxes: false, showLightHelper: false, showViewGizmo: false,
            gridSize: 8,  gridDivisions: 16, axesLength: 1.6 },
    edit: { showGrid: true,  showAxes: true,  showLightHelper: true,  showViewGizmo: true,
            gridSize: 24, gridDivisions: 48, axesLength: 4 },
  };

  /** 把辅助显示套成某个模式的预设（返回套完的状态 ✓）*/
  function applyHelperPreset(mode) {
    /**
     * ⚠️⚠️ **不能调 `setSceneHelpers` / `getSceneHelpers`** ——
     *   那两个是 **viewer 对象上的 API 方法** ✗ 不是模块级函数 ⇒
     *   在这里直接调会 `is not defined`（实测就踩了 ✓）
     *   ⇒ 直接写 `cfg` ✗ 再调模块级的重建函数 ✓
     */
    const p = HELPER_PRESETS[mode === 'edit' ? 'edit' : 'view'];
    cfg.showGrid = !!p.showGrid;
    cfg.showAxes = !!p.showAxes;
    cfg.showLightHelper = !!p.showLightHelper;
    cfg.showViewGizmo = !!p.showViewGizmo;
    cfg.gridSize = p.gridSize;
    cfg.gridDivisions = p.gridDivisions;
    cfg.axesLength = p.axesLength;
    applySceneHelpers();
    return {
      showAxes: !!cfg.showAxes, showGrid: !!cfg.showGrid,
      showLightHelper: !!cfg.showLightHelper, showViewGizmo: !!cfg.showViewGizmo,
      axesLength: cfg.axesLength, gridSize: cfg.gridSize, gridDivisions: cfg.gridDivisions,
    };
  }

  function setSceneMode(m, api) {
    const want = m === 'edit' ? 'edit' : 'action';
    if ((cfg.sceneMode || 'action') === want) return readSceneMode();
    // ★ 切模式时把辅助显示套成对应预设（view 只留网格 / edit 全开 ✓）
    applyHelperPreset(want === 'edit' ? 'edit' : 'view');
    if (want === 'edit') {
      cfg.__editRestoreClip = currentClipName || null;
      const pick = findEditPoseClip();
      cfg.__editUsedClip = pick;
      if (pick) {
        const got = (api && api.setAnimation) ? api.setAnimation(pick) : null;
        if (got) {
          /**
           * ⚠️⚠️⚠️ **必须硬切 ✗ 不能只靠 `setAnimation` 的淡化** ——
           *
           *   `playClip()` 用的是 0.2 秒交叉淡化：
           *       currentAction.fadeOut(0.2)
           *       …newAction…fadeIn(0.2).play()
           *       mixer.timeScale = animPlaying ? 1 : 0
           *
           *   而 `setSceneMode` 紧接着把 `timeScale` 压成 **0** ⇒
           *   **淡化永远走不完** ⇒ 新 clip 的权重停在 0 ⇒
           *   **画面上还是旧姿势** ✗ 但 `currentClipName` 已经是新的 ✓
           *
           *   ⇒ 这就是「看起来没套上」的真正原因
           *     （用户猜到的：「要么就是动画暂停太快 ✗ 动作还没切过去」✓）
           *
           * ⇒ 解法：停掉淡化 + 把权重**直接推到 1** + `mixer.update(0)`
           *   立刻求值一次 ⇒ 姿势马上生效 ✗ 不依赖时间 ✓
           */
          /**
           * ⚠️⚠️⚠️ **`setEffectiveWeight(1)` 不够** ——
           *   `fadeIn(0.2)` 会装一个**权重插值器** ✗ 它在 `mixer.update()` 里
           *   会**覆盖**掉手设的 weight ⇒ 而 `timeScale = 0` 让插值永远停在 0 ⇒
           *   新 clip 的权重一直是 0 ⇒ 画面上还是旧姿势 ✓
           *   （实测：骨骼指纹显示切完 edit 后姿势**没变** ✓ 而日志说「套用 ✓ 权重=1」✓）
           *
           * ⇒ **彻底解法：不要交叉淡化** ✓
           *     `mixer.stopAllAction()` 把旧 action 全停掉（不再混合 ✓）✗
           *     单独挂新 clip ✗ 权重 1 ✗ `update(0)` 立刻求值 ✓
           *     ⇒ 没有混合 ⇒ 不存在「权重停在 0」这回事 ✓
           */
          const editClip = (clips || []).find((c) => c.name === got)
            || (clips || []).find((c) => String(c.name || '').toLowerCase() === String(got).toLowerCase());
          if (editClip) {
            mixer.stopAllAction();
            const act = mixer.clipAction(editClip);
            act.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).play();
            currentAction = act;
            currentClipName = editClip.name;
            if (mixer) mixer.update(0);         // ← 立刻求值出新姿势 ✓
            console.debug('[scene] edit 模式：套用动作「' + editClip.name + '」（stopAllAction + 单挂 ✓）');
          } else {
            console.warn('[scene] edit 模式：找不到 clip「' + got + '」⇒ 只能暂停 ✓');
          }
        } else {
          console.warn('[scene] edit 模式：想套「' + pick + '」但 setAnimation 返回空 ⇒ 这个 clip 没找到 ✓');
        }
      } else {
        console.debug('[scene] edit 模式：没有 T-POSE / _Cam 动作 ⇒ 停在第 0 帧 ✓');
      }
      // 暂停（此时权重已经是 1 ⇒ 停在哪一帧都是新姿势 ✓）
      if (mixer) mixer.timeScale = 0;
      cfg.sceneMode = 'edit';
    } else {
      if (mixer) mixer.timeScale = 1;
      const back = cfg.__editRestoreClip;
      cfg.sceneMode = 'action';
      if (back && api && api.setAnimation) api.setAnimation(back);
      console.debug('[scene] action 模式：恢复动作「' + (back || '（无 ✓）') + '」✓');
    }
    return readSceneMode();
  }

  /** 把 cfg.groundOffsetY 应用到模型根（幂等 ✗ 每次都从 baseY 算 ✓）*/

  /**
   * ★ 加载后**自动贴地一次**（幂等 ✗ 贴过就不再贴 ✓）
   *
   * ⚠️ 等 12 帧再量 —— 刚 load 完姿势还是绑定姿势 ✗ 量出来 gap≈0 没意义 ✓
   * ⚠️ 量到之后把 `-gap` 加进 `cfg.groundOffsetY`（走同一条通路 ✗ 面板滑杆会同步 ✓）
   * ⚠️ 只在**没有手动调过**的时候自动贴（用户拖过滑杆 ⇒ 尊重他的值 ✓）
   */
  /**
   * ★ 把 `modelOffset(x,y,z)` 应用到模型根。
   *
   * ⚠️ 三个轴一起管 —— X/Z 是新增的（原来只有 Y = 落地微调 ✓）
   * ⚠️ 基准是 `__basePos`（`fitToView` 落地后的位置 ✓）✗ 每次都从它算 ⇒ 幂等 ✓
   *
   * ⚠️ 和「取景中心偏移」（`cfg.pivot` / `pivotX·pivotZ` ✓）**不是一回事**：
   *     移动模型       ⇒ 影子 / 描边 / 光照全跟着动
   *     移动取景中心   ⇒ 只有相机在看哪儿变了 ✗ 影子不动 ✓
   */
  function applyGroundOffset() {
    if (!modelRoot) return 0;
    const o = getModelOffset();
    if (!modelRoot.userData.__basePos) {
      modelRoot.userData.__basePos = modelRoot.position.clone();
      modelRoot.userData.__baseY = modelRoot.position.y;   // 兼容旧代码 ✓
    }
    const b = modelRoot.userData.__basePos;
    modelRoot.position.set(b.x + o.x, b.y + o.y, b.z + o.z);
    return o.y;
  }

  let autoSnapFrames = 0;
  function maybeAutoSnapGround() {
    if (!cfg.autoGroundSnap || !modelRoot) return 0;
    if (modelRoot.userData.__autoSnapped) return 0;
    if (modelRoot.userData.__autoSnapSkip) return 0;   // 用户手动调过 ⇒ 让位 ✓
    autoSnapFrames++;
    if (autoSnapFrames < 12) return 0;                  // 等动画推进 ✓
    modelRoot.userData.__autoSnapped = true;
    const p = measurePosedBottom(modelRoot);
    if (p.gap === null || !isFinite(p.gap)) return 0;
    /**
     * ⚠️ 只在缝**明显**时才贴（> 0.5% 身高 ✓）——
     *   微小误差贴了反而可能过冲（蒙皮采样有噪声 ✓）
     */
    const h = (modelSize && modelSize.y) || cfg.targetHeight || 2;
    if (Math.abs(p.gap) < h * 0.005) {
      console.debug('[ground] 自动贴地：缝 ' + p.gap.toFixed(4) + ' 很小 ⇒ 不用贴 ✓');
      return 0;
    }
    // ⚠️ 同样必须写 modelOffset（只写 groundOffsetY 是不会生效的 ✓）
    const want = getModelOffset().y - p.gap;
    cfg.groundOffsetY = want;
    setModelOffset({ y: want });
    frameModel();   // ★ 取景跟着走（自动贴地也是一次位置变化 ✓）
    const q = measurePosedBottom(modelRoot);
    console.debug('[ground] 自动贴地：缝 ' + p.gap.toFixed(4) + ' → '
      + (q.gap === null ? '?' : q.gap.toFixed(4))
      + '（补偿 ' + want.toFixed(4) + ' · 采样 ' + p.sampled + ' 点 / ' + p.meshes + ' 网格 ✓）');
    // 让面板同步（若已接线 ✓）
    if (typeof window !== 'undefined' && typeof window.__ba3dSyncGroundUI === 'function') {
      try { window.__ba3dSyncGroundUI(want); } catch (e) {}
    }
    return want;
  }

  /**
   * 抹掉根节点链上的「水平位移」（root motion）—— 把角色原地化。
   *
   * 有些动作（Move_Ing 行走、Cafe_my_event073_idolstage 舞台表演）会平移根节点。
   * 这个模型归一化时整体放大了约 150 倍，于是 0.0126 的原始位移变成约 1.9 个
   * 世界单位 —— 角色总共才 2 单位高，等于整个人走出画面，面板再大也装不下
   * （实测包络要 1755 × 4164 px）。
   *
   * 载体的名字和类型都因角色而异，**不能写死**：本模型里它是 Object3D `Bip001`
   * （不是 Bone，但子树含全部 141 根骨骼），上面还有 `bone_root`。所以判定方式
   * 是「从最顶层骨骼往上走，凡是带 position 动画的祖先」全都算根节点 ——
   * 这些节点只是容器，肢体动作都在它们下面的骨骼里，不影响动作表现。
   *
   * 做法：把 position 轨道的位移压成常量（取第一帧），即每帧都把角色
   * 「瞬间移回原位」。可选轴由 cfg.stripRootMotion 决定：
   *   'xyz'（默认）—— 三个轴都压平，角色**永远**留在画面里
   *                    （代价：跳跃高度、倒地坠落这类纵向位移也会被抹掉）
   *   'xz'         —— 只压水平位移，保留跳跃/倒地
   *   false        —— 完全不处理
   */
  function stripRootMotion() {
    if (!modelRoot || !clips.length) return 0;
    const mode = cfg.stripRootMotion === false ? 'none'
      : cfg.stripRootMotion === 'none' ? 'none'
      : cfg.stripRootMotion === 'xz' ? 'xz'
      : cfg.stripRootMotion === 'compensate' ? 'compensate'
      : cfg.stripRootMotion === 'xyz' ? 'xyz'
      : cfg.stripRootMotion === 'root' ? 'root'
      : 'compensate';   // 默认：对象级补偿（不碰动画轨道）
    if (mode === 'none' || mode === 'compensate') return 0;   // compensate 走对象级，不动轨道
    const allAxes = mode === 'xyz' || mode === 'root';

    // 1) 收集所有带 position 动画的节点名
    const animated = new Set();
    for (const clip of clips) {
      for (const t of clip.tracks) {
        if (t.name.endsWith('.position')) animated.add(t.name.slice(0, -'.position'.length));
      }
    }
    if (!animated.size) return 0;

    // 2) 从最顶层骨骼往上，取所有带位置动画的祖先
    const topBone = findTopBone();
    if (!topBone) {
      console.warn('[rootMotion] 模型里没有骨骼，跳过原地化');
      return 0;
    }
    // 从最顶层骨骼往上收集带位置动画的祖先（Set 保序：先加的是骨骼端，最后加的是最外层）
    let keys = new Set();
    for (let p = topBone; p; p = p.parent) {
      if (p.name && animated.has(p.name)) keys.add(p.name + '.position');
      if (p === modelRoot) break;
    }
    if (!keys.size) return 0;

    /**
     * 默认模式 'root'：**只压最外层那一个**（模型自己的根，通常是 bone_root）。
     *
     * 为什么不能像以前那样把整条链都压平：链上中间那些节点（典型的 Bip001，
     * 位于 bone_root 与骨架之间）一旦被钉死，**挂在 bone_root 下、但不受 Bip001 影响的东西
     * 就会和身体分家**。实测 Natsu.glb 的牛奶盒（骨骼 bone_Milk 挂在 bone_root 下）：
     *
     *     不压平          → 牛奶盒在 57% 身高（嘴边，与 bluearchive.wiki 一致）✓
     *     压平 Bip001     → 牛奶盒跑到 90% 身高（头顶）✗   ← 就是压中间节点害的
     *     只压 bone_root  → 牛奶盒仍在 57% ✓
     *
     * 而这批 BA 模型的根位移本来就极小（实测 5 个模型走路时水平漂移只有 0.018~0.046 单位，
     * 角色高 2 单位），压不压都出不了画面 —— 收益远小于代价。
     * 真需要激进压平的模型，把 stripRootMotion 设成 'xyz' 或 'xz' 即可。
     */
    if (mode === 'root' && keys.size > 1) {
      keys = new Set([[...keys].pop()]);
    }

    // 3) 压成常量
    let fixed = 0;
    for (const clip of clips) {
      for (const track of clip.tracks) {
        if (!keys.has(track.name)) continue;
        const v = track.values;
        const x0 = v[0], y0 = v[1], z0 = v[2];
        let moved = false;
        for (let i = 0; i < v.length; i += 3) {
          if (v[i] !== x0) { v[i] = x0; moved = true; }
          if (allAxes && v[i + 1] !== y0) { v[i + 1] = y0; moved = true; }
          if (v[i + 2] !== z0) { v[i + 2] = z0; moved = true; }
        }
        if (moved) fixed++;
      }
    }
    if (fixed) {
      console.debug('[rootMotion] 已原地化根节点位移（' + mode + '）：' + [...keys].join(', ') +
        '（共 ' + fixed + ' 条轨道）');
    }
    return fixed;
  }

  /**
   * 把光环重新挂到头部骨骼。
   *
   * 这个模型里 CH0155_Halo 是**未蒙皮**的静态网格，节点链是
   *   CH0155_Halo <- HaloRoot <- CH0155 <- RootNode
   * 挂在静态的 HaloRoot 上，且 24 段动画都没有驱动光环节点 ——
   * 结果就是头动、光环不动，看起来「脱头」。
   *
   * 做法：用 Object3D.attach 把 HaloRoot 挪到头部骨骼（Bip001_Head）下面，
   * 再用「纯矩阵偏移」覆盖 attach 的分解结果（避免骨骼链带缩放时分解漂移），
   * 并关掉 matrixAutoUpdate，让光环严格等于 head.matrixWorld * offset。
   */
  function bindHaloToHead() {
    if (!modelRoot) return;
    const haloRoot = modelRoot.getObjectByName('HaloRoot');
    // 骨骼名是 Bip001_Head（下划线）；找不到就用「名字含 head 的骨骼」兜底
    let head = modelRoot.getObjectByName('Bip001_Head');
    if (!head) {
      modelRoot.traverse((o) => {
        if (!head && o.isBone && /head/i.test(o.name)) head = o;
      });
    }
    if (!haloRoot || !head || haloRoot.parent === head) return;

    head.updateWorldMatrix(true, true);
    haloRoot.updateWorldMatrix(true, true);
    const offset = new THREE.Matrix4().copy(head.matrixWorld).invert().multiply(haloRoot.matrixWorld);

    head.attach(haloRoot);
    haloRoot.matrix.copy(offset);
    haloRoot.matrixAutoUpdate = false;
  }

  /* ---------- 嘴部修复：照搬 kivo.wiki 的做法（拆出嘴部 → MeshBasicMaterial + 嘴部图集） ---------- */
  /**
   * kivo 的真实实现（逆向自 _site/chunks/info-DmbEhvrw.js）：
   *   1. 把网格按 UV 岛拆开（生成 xxx_Split_0/1/2...）
   *   2. 找出「嘴」那一块（按包围盒定位），其余块移除
   *   3. 嘴块材质换成 new MeshBasicMaterial({ map: mouthTexture, transparent: true })
   *   4. 图集是 mouthColumns × mouthRows 格；mouthTexture.repeat / offset 用来选格
   *   5. setMouthOffset(index) 切口型；纹理 flipY=false、Nearest 采样
   *
   * 本模型实测：嘴 = EyeMouth 网格里 **z 最低**的那个 UV 岛（岛0，25 顶点、38 三角形），
   * 它的 UV 框是 u[0.0087,0.2414] v[0.7926,0.9574]（原来采样贴图纯黑占位 → 所以是黑嘴）。
   * 把 UV 框映射到图集某一格：
   *     repeat = (1/cols) / (u1-u0)
   *     offset = col/cols - u0 * repeat
   */
  
  const MOUTH_COLS = 8;
  const MOUTH_ROWS = 8;
  // 口型格（图集里 0~15 是粉色真实嘴形）：闭 → 微张 → 张开 → 大口
  const MOUTH_CELLS = [5, 10, 0, 2, 1, 14, 3, 15];

  let mouthMesh = null;
  let mouthTex = null;   // 图集纹理（跨材质切换复用）
  let mouthMat = null;
  let mouthBone = null;
  let mouthCell = -1;
  let mouthUV = null;    // { u0, u1, v0, v1 }
  let mouthBase = null;  // 原 EyeMouth 材质（借 metalness/roughness，让嘴与脸亮度一致）

  /** 选图集格（照 kivo 的 setMouthOffset） */
  function setMouthCell(cell) {
    if (!mouthMat || !mouthMat.map || !mouthUV) return false;
    const { u0, u1, v0, v1 } = mouthUV;
    const col = ((cell % MOUTH_COLS) + MOUTH_COLS) % MOUTH_COLS;
    const row = ((Math.floor(cell / MOUTH_COLS) % MOUTH_ROWS) + MOUTH_ROWS) % MOUTH_ROWS;
    const rx = (1 / MOUTH_COLS) / ((u1 - u0) || 1e-6);
    const ry = (1 / MOUTH_ROWS) / ((v1 - v0) || 1e-6);
    const map = mouthMat.map;
    map.repeat.set(rx, ry);
    map.offset.set(col / MOUTH_COLS - u0 * rx, row / MOUTH_ROWS - v0 * ry);
    // 图集还没加载完时不要标脏：否则 three 每帧都会刷
    // "Texture marked for update but no image data found."
    if (map.image) map.needsUpdate = true;
    mouthCell = cell;
    return true;
  }

  /**
   * 配置的「默认口型」图集格（renderer.mouthCell）。
   * 用途：有些模型的 GLB 里没有任何嘴部动画数据（实测 CH0273），嘴型会一直固定 ——
   * 这时用哪一格就由它决定（不配则用 MOUTH_CELLS[0]，也就是第一个口型）。
   */
  function defaultMouthCell() {
    const v = cfg.mouthCell;
    if (v !== null && v !== undefined && isFinite(Number(v))) {
      return Math.max(0, Math.min(MOUTH_COLS * MOUTH_ROWS - 1, Math.round(Number(v))));
    }
    return MOUTH_CELLS[0];
  }

  /** 嘴部图集纹理（只加载一次，材质切换时复用，repeat/offset 得以保留） */
  function ensureMouthTexture() {
    if (!mouthAtlasUrl) return null;   // 没配图集就别去加载
    if (mouthTex) return mouthTex;
    mouthTex = new THREE.TextureLoader().load(
      mouthAtlasUrl,
      (t) => {
        t.flipY = false;
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = THREE.ClampToEdgeWrapping;
        t.wrapT = THREE.ClampToEdgeWrapping;
        t.magFilter = THREE.LinearFilter;
        t.minFilter = THREE.LinearMipmapLinearFilter;
        t.generateMipmaps = true;
        t.needsUpdate = true;
        // 图集到位后补一次当前口型
        const c = mouthCell >= 0 ? mouthCell : MOUTH_CELLS[0];
        mouthCell = -1;
        setMouthCell(c);
        console.debug('[viewer] 嘴部图集已加载：', mouthAtlasUrl, t.image && t.image.width + 'x' + t.image.height);
      },
      undefined,
      (err) => {
        console.error('[viewer] 嘴部图集加载失败：', mouthAtlasUrl, err);
      }
    );
    mouthTex.flipY = false;
    mouthTex.colorSpace = THREE.SRGBColorSpace;
    mouthTex.magFilter = THREE.LinearFilter;
    mouthTex.minFilter = THREE.LinearMipmapLinearFilter;
    return mouthTex;
  }

  /**
   * 嘴部材质：跟脸一样受光（这样打光/渲染模式切换时亮度自动一致）
   *   · PBR 模式 → MeshStandardMaterial（借用原 EyeMouth 的 metalness/roughness）
   *   · Cel 模式 → MeshToonMaterial（同一张分档梯度图）
   */
  function makeMouthMaterial() {
    const tex = ensureMouthTexture();
    const common = {
      map: tex,
      transparent: true,
      alphaTest: 0.01,
      depthWrite: false,
      side: THREE.FrontSide,
    };
    let mat;
    if (renderMode === 'unlit') {
      mat = new THREE.MeshBasicMaterial(Object.assign({ toneMapped: false }, common));
    } else if (renderMode === 'toon') {
      mat = new THREE.MeshToonMaterial(Object.assign({}, common));
      // 和脸用同一套注入，否则嘴与脸的明暗分档会不一致
      patchToonMaterial(mat, !!(celCfg.faceLight && celFaceRe().test('mouth_atlas')));
    } else {
      mat = new THREE.MeshStandardMaterial(Object.assign({
        metalness: mouthBase && mouthBase.metalness !== undefined ? mouthBase.metalness : 0.4,
        roughness: mouthBase && mouthBase.roughness !== undefined ? mouthBase.roughness : 0.3,
      }, common));
    }
    mat.name = 'mouth_atlas';
    mat.userData.__mouth = true;
    return mat;
  }

  /**
   * 按 kivo 的方式拆出嘴部：
   *   · 原 EyeMouth 网格只保留「非嘴」三角形（眼睛/睫毛/眼窝照旧）
   *   · 嘴部三角形独立成一个 SkinnedMesh（绑同一骨架），用图集材质
   */
  /**
   * 收集所有「眼睛 + 嘴」那张贴图所在的网格。
   *
   * 角色前缀各代不同（CH0155_ / CH0273_ / CH0167_ …），父节点名不能写死：
   * 之前写死 `CH0155_Body`，换 CH0273 就查不到 → 直接跳过修复，而且是**静默失败**。
   * 现在一律按材质名来找。
   *
   * 注意同一材质可能被用在**多个**网格上（CH0167/yuni 就有 3 个：
   * 嘴 32 三角、脸描边 88 三角、眼睛 92 三角），所以这里返回全部候选，
   * 由 pickMouthMesh 再挑出真正的嘴。
   */
  function eyeMouthMeshes() {
    if (!modelRoot) return [];
    const out = [];
    modelRoot.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m) => m && /EyeMouth/i.test(m.name || ''))) out.push(o);
    });
    if (out.length) return out;
    // 退路：网格名或材质名含 Mouth
    modelRoot.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const names = [o.name || ''].concat(mats.map((m) => (m && m.name) || ''));
      if (names.some((s) => /mouth/i.test(s))) out.push(o);
    });
    return out;
  }

  /**
   * 顶点是否「被索引真正用到」。
   * 有些导出会把整张顶点表复制到每个 primitive：CH0167_Body_2 有 8089 个顶点
   * 却只有 32 个三角形，其余全是游离顶点（z≈0）。不排除它们的话，
   * 「最低 z 的 UV 岛」会选中一个游离顶点，永远找不到嘴。
   */
  function usedVertexMask(idx, n) {
    const used = new Uint8Array(n);
    for (let i = 0; i < idx.count; i++) used[idx.getX(i)] = 1;
    return used;
  }

  /** UV 岛并查集（返回 find 函数） */
  function buildIslands(idx, n) {
    const parent = new Int32Array(n);
    for (let i = 0; i < n; i++) parent[i] = i;
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const triCount = idx.count / 3;
    for (let t = 0; t < triCount; t++) {
      const a = find(idx.getX(t * 3)), b = find(idx.getX(t * 3 + 1)), c = find(idx.getX(t * 3 + 2));
      if (b !== a) parent[b] = a;
      const a2 = find(a), c2 = find(c);
      if (c2 !== a2) parent[c2] = a2;
    }
    return { find, triCount };
  }

  /**
   * 一个网格里「最低 z 的 UV 岛」：返回它的 z 和 UV 框（只看被索引用到的顶点）。
   * 嘴在脸上最低处，所以这个岛通常就是嘴 —— 但多网格共享材质时不够用，
   * 还要看 UV 落在哪（见 pickMouthMesh）。
   */
  function lowestIsland(mesh) {
    const geo = mesh.geometry;
    const pos = geo.getAttribute('position'), uv = geo.getAttribute('uv'), idx = geo.index;
    if (!pos || !idx) return null;
    const n = pos.count;
    const used = usedVertexMask(idx, n);
    const { find } = buildIslands(idx, n);
    const islandZ = new Map();
    for (let i = 0; i < n; i++) {
      if (!used[i]) continue;
      const r = find(i), z = pos.getZ(i);
      const cur = islandZ.get(r);
      if (cur === undefined || z < cur) islandZ.set(r, z);
    }
    let root = -1, bestZ = Infinity;
    for (const [r, z] of islandZ) if (z < bestZ) { bestZ = z; root = r; }
    if (root < 0) return null;
    const b = { z: bestZ, u0: Infinity, u1: -Infinity, v0: Infinity, v1: -Infinity, verts: 0 };
    if (uv) {
      for (let i = 0; i < n; i++) {
        if (!used[i] || find(i) !== root) continue;
        const u = uv.getX(i), v = uv.getY(i);
        b.verts++;
        if (u < b.u0) b.u0 = u; if (u > b.u1) b.u1 = u;
        if (v < b.v0) b.v0 = v; if (v > b.v1) b.v1 = v;
      }
    }
    return b;
  }

  /**
   * 这几代 BA 模型共用的「嘴在图集里的 UV 区域」。
   * 实测 CH0155 / CH0273 / CH0167 的嘴部 UV 都落在 u≈[0.009,0.241] v≈[0.793,0.957]。
   * 可用 renderer.mouthUv = [u0,u1,v0,v1] 覆盖。
   */
  const MOUTH_UV_ZONE = { u0: 0.009, u1: 0.241, v0: 0.793, v1: 0.957 };

  /**
   * 从候选里挑出「真正的嘴」。
   *
   * 判据是**选中岛的 UV 落不落在嘴部区域**，而不是"谁 z 最低"：
   * CH0155 里共用 EyeMouth 材质的还有 Star（眼睛高光）网格，它的 z 比嘴更低，
   * 单看 z 会挑错，把高光替换成嘴型。
   * 全部候选都不在区域内时，才退回"z 最低"的那个。
   */
  function pickMouthMesh(cands) {
    const z0 = Array.isArray(cfg.mouthUv) && cfg.mouthUv.length === 4 ? cfg.mouthUv : null;
    const zone = z0 ? { u0: z0[0], u1: z0[1], v0: z0[2], v1: z0[3] } : MOUTH_UV_ZONE;
    const pad = 0.02;
    const inZone = (b) => b && b.u1 >= b.u0 && b.v1 >= b.v0 &&
      b.u0 >= zone.u0 - pad && b.u1 <= zone.u1 + pad &&
      b.v0 >= zone.v0 - pad && b.v1 <= zone.v1 + pad;

    let fallback = null, fallbackZ = Infinity;
    for (const m of cands) {
      const low = lowestIsland(m);
      if (!low) continue;
      if (inZone(low)) return m;                       // 命中嘴部区域 → 就是它
      if (low.z < fallbackZ) { fallbackZ = low.z; fallback = m; }
    }
    if (cands.length > 1) {
      console.warn('[fixMouth] ' + cands.length + ' 个候选网格的 UV 都不在已知嘴部区域内，' +
        '退回"z 最低"的那个 —— 若嘴显示异常，用 renderer.mouthUv 指定区域');
    }
    return fallback || cands[0] || null;
  }

  function fixMouth() {
    if (!modelRoot) return 0;
    const cands = eyeMouthMeshes();
    if (!cands.length) {
      console.warn('[fixMouth] 没找到嘴部网格（材质名含 EyeMouth / 网格名含 Mouth 都没匹配到），跳过嘴部修复');
      return 0;
    }
    const mesh = pickMouthMesh(cands);
    if (!mesh || !mesh.geometry) return 0;
    if (cands.length > 1) {
      console.debug('[fixMouth] 有 ' + cands.length + ' 个网格共用 EyeMouth 材质（' +
        cands.map((m) => m.name).join(', ') + '），按嘴部 UV 区域选中：' + mesh.name);
    }

    const geo = mesh.geometry;
    const pos = geo.getAttribute('position');
    const uvA = geo.getAttribute('uv');
    const idx = geo.index;
    if (!pos || !uvA || !idx) return 0;

    // 1) UV 岛（并查集）—— 只统计被索引真正用到的顶点
    //    （有些导出把整张顶点表复制到每个 primitive，游离顶点的 z≈0 会冒充"最低的岛"）
    const n = pos.count;
    const used = usedVertexMask(idx, n);
    const { find, triCount } = buildIslands(idx, n);

    // 2) 每岛的最低 z（本模型 z 是高度）→ 最低的那个岛就是嘴
    const islandZ = new Map();
    for (let i = 0; i < n; i++) {
      if (!used[i]) continue;
      const r = find(i);
      const z = pos.getZ(i);
      const cur = islandZ.get(r);
      if (cur === undefined || z < cur) islandZ.set(r, z);
    }
    let mouthRoot = -1, bestZ = Infinity;
    for (const [r, z] of islandZ) if (z < bestZ) { bestZ = z; mouthRoot = r; }
    if (mouthRoot < 0) return 0;
    const isMouth = (i) => find(i) === mouthRoot;

    // 3) 拆索引
    const restIdx = [], mouthIdx = [];
    for (let t = 0; t < triCount; t++) {
      const a = idx.getX(t * 3), b = idx.getX(t * 3 + 1), c = idx.getX(t * 3 + 2);
      if (isMouth(a) && isMouth(b) && isMouth(c)) mouthIdx.push(a, b, c);
      else restIdx.push(a, b, c);
    }
    if (!mouthIdx.length) {
      console.warn('[fixMouth] 按「z 最低的 UV 岛」拆不出任何三角形，跳过嘴部修复');
      return 0;
    }
    // 嘴只占整张脸图的一小块；占比过大说明「最低 z 的岛」不是嘴（模型轴向不同？）
    if (mouthIdx.length / 3 > triCount * 0.5) {
      console.warn('[fixMouth] 选中的 UV 岛占整网格 ' +
        Math.round((mouthIdx.length / 3) / triCount * 100) + '% 三角形，可能不是嘴（模型竖直轴可能不是 z），请检查');
    }

    // 4) 嘴部 UV 框
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let i = 0; i < n; i++) {
      if (!used[i] || !isMouth(i)) continue;
      const u = uvA.getX(i), v = uvA.getY(i);
      if (u < u0) u0 = u; if (u > u1) u1 = u;
      if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    mouthUV = { u0, u1, v0, v1 };

    // 5) 原网格只留非嘴部分（黑嘴从此不再渲染）
    //    CH0167/yuni 的嘴是单独一个网格（拆完剩 0 个三角形），
    //    这时直接隐藏原网格 —— 空索引的几何体容易触发额外告警。
    if (restIdx.length === 0) {
      mesh.visible = false;
    } else {
      const restGeo = geo.clone();
      restGeo.setIndex(restIdx);
      restGeo.computeBoundingBox();
      restGeo.computeBoundingSphere();
      mesh.geometry = restGeo;
    }

    // 6) 嘴部独立网格
    const mouthGeo = geo.clone();
    mouthGeo.setIndex(mouthIdx);
    mouthGeo.computeBoundingBox();
    mouthGeo.computeBoundingSphere();
    mouthMesh = new THREE.SkinnedMesh(mouthGeo, null);
    mouthMesh.bind(mesh.skeleton, mesh.bindMatrix);
    mouthMesh.bindMode = mesh.bindMode;
    mouthMesh.position.copy(mesh.position);
    mouthMesh.quaternion.copy(mesh.quaternion);
    mouthMesh.scale.copy(mesh.scale);
    mouthMesh.castShadow = false;
    mouthMesh.receiveShadow = true; // 与脸一致（脸也收阴影），否则阴处嘴会偏亮
    mouthMesh.frustumCulled = false;
    mouthMesh.renderOrder = (mesh.renderOrder || 0) + 1;
    mouthMesh.name = (mesh.name || 'eyeMouth') + '_Mouth_Split';
    // 借原 EyeMouth 材质的金属度/粗糙度，让嘴与脸的受光表现一致
    mouthBase = (Array.isArray(mesh.material) ? mesh.material : [mesh.material])
      .find((m) => m.name && /EyeMouth/i.test(m.name)) || null;
    mouthMat = makeMouthMaterial();
    mouthMesh.material = mouthMat;
    mesh.parent.add(mouthMesh);

    // 骨骼名大小写各代不同（bone_mouth / bone_Mouth），忽略大小写找
    mouthBone = modelRoot.getObjectByName('bone_mouth') || null;
    if (!mouthBone) {
      modelRoot.traverse((o) => {
        if (!mouthBone && o.isBone && /^bone_mouth$/i.test(o.name || '')) mouthBone = o;
      });
    }
    if (!mouthBone) {
      console.warn('[fixMouth] 没找到 bone_mouth / bone_Mouth 骨骼 → 嘴型不会随动作变化（固定为第一个口型）');
    }
    mouthCell = -1;
    setMouthCell(defaultMouthCell());
    buildMouthDriverSet();
    console.debug('[fixMouth] 已按 kivo 方式拆出嘴部：网格=' + (mesh.name || '?') +
      '，嘴 ' + (mouthIdx.length / 3) + ' 三角形（z 最低的 UV 岛），其余 ' + (restIdx.length / 3) + ' 三角形' +
      '，嘴部 UV u[' + u0.toFixed(4) + ',' + u1.toFixed(4) + '] v[' + v0.toFixed(4) + ',' + v1.toFixed(4) + ']');
    return mouthIdx.length / 3;
  }

  /**
   * 记录「哪些动作真的驱动了嘴部骨骼」。
   * 有些模型的 GLB 里压根没有嘴部动画数据（实测 CH0273：42 段动画、每段 142 条轨道，
   * 没有一条和嘴相关），这时嘴型会一直固定 —— 可以开 renderer.mouthIdle 用兜底循环。
   */
  let mouthDriverClips = null;
  function buildMouthDriverSet() {
    mouthDriverClips = new Set();
    if (!mouthBone) return;
    const key = mouthBone.name + '.scale';
    for (const c of clips) {
      if (c.tracks.some((t) => t.name === key)) mouthDriverClips.add(c.name);
    }
    if (mouthDriverClips.size === 0) {
      console.warn('[fixMouth] 没有任何动作驱动「' + mouthBone.name + '.scale」→ 嘴型不会随动作变化' +
        '（该 GLB 没有嘴部动画数据）。需要的话在 JSON 里设 renderer.mouthIdle = true 用兜底循环。');
    }
  }

  /* ---------- 按动作控制网格显隐（盾牌/武器只在特定动作里出现） ---------- */
  /**
   * 有些模型的盾牌/武器**只在特定动作里出现**，但 GLB 的动画数据里并没有"隐藏"这件事
   *（实测 Hoshino_Original：盾牌绑在 bone_shield_root 上、缩到 0 确实会消失，
   *  但 42 段动画里它的 scale 只在 [0.70, 1.00]，没有任何一段去缩它）。
   * 那是游戏引擎按动作配置的显隐 —— 只能由我们用「动作名 → 网格显隐」的规则补上。
   *
   * 配置（renderer.visibilityRules）—— 三种指定"什么时候显示"的写法，任选一种：
   *   { "mesh": "Shield", "clipContains": "Shield" }        动作名含 Shield 时显示
   *   { "mesh": "Shield", "clips": ["Hoshino_Original_Shield_A"] }  精确列出动作名（**完全匹配**，不是子串）
   *   { "mesh": "Shield", "always": true }                   一直显示（用来强制恢复）
   * 可选 "invert": true 取反。
   *
   * 为什么不能靠"盾牌有没有动"来判断：实测 Hoshino_Original 里盾牌是**常驻挂在手臂骨骼上**的，
   * 手臂一动它相对角色就会位移 —— 4 段 Shield 动作反而位移是 0（举得很稳），
   * 而 Exs_Cutin 位移 0.011 最大。位移会判反，骨骼缩放在这 4 段也恒为 1.0，
   * 数据里没有可靠信号，只能靠命名/显式列表。
   */
  function applyVisibilityRules() {
    const rules = cfg.visibilityRules;
    if (!Array.isArray(rules) || !rules.length || !modelRoot) return 0;
    const clip = String(currentClipName || '');
    let touched = 0;
    for (const r of rules) {
      if (!r || !r.mesh) continue;
      let re, cre = null;
      try { re = new RegExp(r.mesh, 'i'); } catch { console.warn('[visibility] 无效的 mesh 正则：', r.mesh); continue; }
      if (r.clipContains) { try { cre = new RegExp(r.clipContains, 'i'); } catch { console.warn('[visibility] 无效的 clipContains 正则：', r.clipContains); continue; } }
      let show;
      if (r.always === true) show = true;
      else if (Array.isArray(r.clips) && r.clips.length) {
        // 完全匹配：整个动作名必须等于列表里的一项（忽略大小写与首尾空格）
        const cur = clip.trim().toLowerCase();
        show = r.clips.some((c) => String(c).trim().toLowerCase() === cur);
      } else show = cre ? cre.test(clip) : true;
      if (r.invert) show = !show;
      modelRoot.traverse((o) => {
        if (o.isMesh && re.test(o.name || '')) { o.visible = show; touched++; }
      });
    }
    applyLockedVisibility();   // 被锁定部件的可见性优先
    return touched;
  }

  /** 没配规则但模型看起来需要规则时，给一条可以直接抄的提示 */
  function hintVisibilityRules() {
    if (Array.isArray(cfg.visibilityRules) && cfg.visibilityRules.length) return;
    if (!modelRoot || !clips.length) return;
    const meshNames = [];
    modelRoot.traverse((o) => { if (o.isMesh && o.name) meshNames.push(o.name); });
    for (const key of ['shield', 'weapon']) {
      const re = new RegExp(key, 'i');
      const meshHit = meshNames.filter((n) => re.test(n));
      const hit = clips.filter((c) => re.test(c.name)).length;
      if (meshHit.length && hit > 0 && hit < clips.length) {
        console.info('[visibility] 检测到网格「' + meshHit.join(', ') + '」+ ' + hit + '/' + clips.length +
          ' 段含「' + key + '」的动作。若希望它只在那些动作里显示，配：\n' +
          '  "renderer": { "visibilityRules": [{ "mesh": "' + key + '", "clipContains": "' + key + '" }] }');
      }
    }
  }

/**
 * ★★ lilToon 官方预设 —— **从 lilToon/Presets/*.asset 生成**（勿手改 ✓）
 *
 *   生成器：`scripts/gen-lilpresets.mjs` ✗ 数据源是 Unity 自己序列化的 19 个 .asset ✓
 *   导入在文件顶部（`assets/lilpresets.inline.js` ✓）
 *
 *   ⚠️ 原来的手写版实测有两类问题：
 *      · 漏字段（Hair-Anime 没写 backlight ⇒ 套用后残留上次的值 ✓）
 *      · 值不一致（`rim.blend` 手写 1 ✗ lilToon 是 3 ⇒ 混合模式不同 ✓）
 *   ⇒ 用户拿「我们导出的 .asset」和「Unity 导出的」对比时开关是反的 ✓
 *
 *   ⚠️ `LIL_PRESETS` 的元素形状：{ n: 预设名, l: 中文标签, ...我们的 lilCfg 补丁 }
 *      ⇒ 顺序由生成器的 ORDER 决定（皮肤 → 头发 → 衣服 → 其它 ✓）
 */
  const LIL_PRESET_ORDER = ["Cloth-Anime","Cloth-Illust","Cloth-Outline","Cloth-Standard","Hair-Anime","Hair-Illust","Hair-Outline","Hair-OutlineRimLight","Hair-Standard","Inorganic-Glass","Inorganic-LiteGlass","Inorganic-Metal (MatCap)","Inorganic-Metal","Nature-Fur","Skin-Anime","Skin-Flat","Skin-Illust","Skin-Outline","Skin-OutlineShadow"];
  const lilCfg = {
    enabled: false,

    /**
     * —— 主色贴图的 UV / 色调（lilToon 的 _MainTexHSVG / _MainTex_ScrollRotate ✓）——
     *
     * ⚠️ 这两项在 lilToon 里的**作用范围完全不同**：
     *   _MainTexHSVG          → 只作用在**基础色**上（lil_common_frag.hlsl:317 ✓）
     *   _MainTex_ScrollRotate → 改的是**共享的 fd.uvMain**（:259 / :263 ✓）·
     *                           之后很多采样都用它 ⇒ 影响面大 ✓
     *
     * ⇒ 我们只做「主色贴图自己的 UV」（方案 A ✓）·
     *   Unity 里阴影/描边等也会跟着滚 ✗ 这边不会 ⇒ 已在文档里记录为已知差异 ✓
     */
    /** _MainTexHSVG：(色相偏移, 饱和度倍率, 明度倍率, Gamma) ✗ 默认 (0,1,1,1) ✓ */
    mainTexHSVG: [0, 1, 1, 1],
    /** _MainTex_ScrollRotate：(滚动速度X, 滚动速度Y, 旋转角, 旋转角速度) ✗ 默认全 0 ✓ */
    mainTexScrollRotate: [0, 0, 0, 0],
    /**
     * —— 渲染状态（lilToon 的 _TransparentMode / _Cutoff / _Cull ✓）——
     *
     * ⚠️ 三个都默认 **-1 = 不改** ✗ 也就是沿用模型自带的值 ✓
     *    这样默认行为和以前**完全一致** ✗ 想强制才动 ✓
     *
     * ⚠️ 这三个是**每材质**可覆盖的（lilToon 里就是材质属性 ✓）✗
     *    面板上切换「材质」时它们也跟着变 ✓
     */
    /**
     * _TransparentMode（lilToon 的枚举：0 Opaque · 1 Cutout · 2 Transparent ·
     *                   3 Refraction · 4 Fur · 5 FurCutout · 6 Gem ✓）
     *
     * ⚠️ Web 侧只实现前三个 ✗ 后四个要专门 shader（lilToon 里是独立文件 ✓）
     *    ⇒ 选到 3~6 时按 **Transparent** 处理并打日志 ✓
     */
    transparentMode: -1,
    /** _Cutoff（默认 0.5）✗ 只在 Cutout 模式下有意义 ✓ */
/**
 * ⚠️⚠️⚠️ **-1 = 未指定**（和 `transparentMode` / `cull` 一致 ✓）——
 *
 *   原来是 **0.5** ✗ 而 `syncDissolveAlphaTest()` 里有一条规则：
 *
 *       ④ 模式没改（-1）但**单独给了 cutoff** ✗ 且模型原本 alphaTest > 0
 *          ⇒ 用 cutoff ✓
 *
 *   ⇒ `cutoff` 永远是 0.5 ⇒ **这条规则永远成立** ✓
 *     ⇒ 只要模型材质的原始 `alphaTest > 0` ✗ 就被强制改成 0.5 ✓
 *     ⇒ **贴图 alpha < 0.5 的像素被裁掉** ⇒ 看起来「材质变透明了」✓✓✓
 *
 *   （实测：CH0155_Face_Toon 套「皮肤 · 动画」后脸变成一块白斑 ✓
 *     套用前后 `cutoff` 都是 0.5 ⇒ 不是预设带来的 ✗ 是**默认值**带来的 ✓）
 *
 *   ⇒ 改成 -1 ⇒ 「未指定就别碰材质的 alphaTest」✓
 *     需要 Cutout 时把 `transparentMode` 设成 1 ⇒ 那条规则会正确用 cutoff ✓
 */
cutoff: -1,
    /**
     * _Cull（0=Off 双面 · 1=Front 只正面 · 2=Back 只背面 ✓）
     * ⚠️ Unity 的枚举顺序与 three 的 side **不一样** ✗ 见 applyLilRenderState ✓
     */
    cull: -1,
    // —— 分档（阴影）三层，对应 _Shadow* ——
    /**
     * ★★ **阴影总开关**（lilToon 的 `_UseShadow` ✓）
     *
     * ⚠️⚠️ 这个字段**以前完全没映射** ⇒ 预设里的「关阴影」我们收不到 ✓
     *
     *   实测：19 个官方预设里有 **5 个**带 `_UseShadow = 0`：
     *       Inorganic-Glass · Inorganic-LiteGlass ·
     *       Inorganic-Metal (MatCap) · **Skin-Flat** · **Skin-Outline**
     *     ⇒ 套了它们之后 Unity 里**没有阴影** ✗ 而我们阴影还在 ✓
     *
     *   ⚠️ 语义（`lil_common_frag.hlsl` 里 `_UseShadow` 是编译期开关 ✓）：
     *      = 0 ⇒ **整个阴影计算跳过** ⇒ 表面只用光照色 ✓
     *      注意这与 `_ShadowReceive = 0` **不同**：
     *        · `_ShadowReceive = 0` ⇒ 不接收**实时阴影贴图**（`lerp(1.0, shadow, 0)` ✓）
     *          但 `_ShadowStrength` 的分档阴影**仍然在** ✓
     *        · `_UseShadow = 0` ⇒ **连分档阴影都没有** ✓
     *      （我们之前把 `_ShadowReceive` 实现对了 ✓ 公式和 lilToon 一致 ✓）
     */
    useShadow: 1,
    shadowStrength: 1.0,            // _ShadowStrength  0 = 不压暗
    /**
     * 阴影环境光（three 专属的补充参数 ✗ lilToon 没有对应的）
     *
     * 为什么需要：three 的 toon 把环境光**单独加在分档之外**
     *   irradiance = ambient + lightProbe + gradient * directLight
     * 而 lilToon 的 indirectCol 是**整体替换**（含环境光）。
     * 于是我们的阴影有个「环境光地板」✗ 光越强 ✗ 受光面越亮 ✗
     * 阴影区却只跟着的环境光走 ✗ 相对对比度被稀释 ✗
     * 表现就是「光照强的时候阴影反而不够明显」✓
     *
     * 这个值 = 阴影区保留多少环境光：
     *   1.0 = 不削减（默认 ✗ 和之前完全一样）
     *   0.5 = 阴影区环境光减半
     *   0.0 = 阴影区完全没有环境光（阴影最深）
     */
    shadowAmbient: 1.0,
    // 默认值取自 lilToon 19 个官方预设的众数（不是 shader Properties 值 ✗）
    //   _ShadowColor  众数 [0.7,0.75,0.85] (6/19)
    //   _ShadowBorder 众数 0.1 (9/19)  ← 这个最关键
    //   _ShadowBlur   众数 0.1 (10/19)
    shadowColor: [0.7, 0.75, 0.85],
    shadowBorder: 0.1,
    /**
     * _ShadowBorderRange —— 阴影边界范围的额外扩展。
     *
     * lil_common_functions.hlsl:21（lilTooningNoSaturateScale 的 5 参重载）：
     *   borderMin = saturate( border - blur * 0.5 - borderRange )
     *   borderMax = saturate( border + blur * 0.5 )
     * 也就是只把过渡带的「下沿」往阴影侧再推 borderRange。
     */
    shadowBorderRange: 0.0,
    /**
     * _ShadowMainStrength —— 阴影色再乘一次主色的强度。
     *
     * lil_common_frag.hlsl:1098
     *   indirectCol = lerp(indirectCol, indirectCol * fd.albedo, _ShadowMainStrength)
     *
     * ⚠️ 我们的近似：用材质的 diffuse 均匀色代替 fd.albedo（贴图色）。
     *    因为 getGradientIrradiance 定义在 map_fragment 之前，
     *    那时 diffuseColor 还没算出来（见 three 的 toon 片段着色器行序）。
     */
    shadowMainStrength: 0.0,
    /**
     * 每层阴影是否接收「实时投射阴影」（lil_common_frag.hlsl:946-950）：
     *   calculatedShadow = saturate( fd.attenuation + distance( fd.L, fd.origL ) )
     *   lns.x *= lerp( 1.0, calculatedShadow, _ShadowReceive );
     *   lns.y *= lerp( 1.0, calculatedShadow, _Shadow2ndReceive );
     *   lns.z *= lerp( 1.0, calculatedShadow, _Shadow3rdReceive );
     * 0 = 该层完全不受投射阴影影响，1 = 完全接收。
     */
    shadowReceive: 1.0,
    shadow2ndReceive: 1.0,
    shadow3rdReceive: 1.0,
    shadowBlur: 0.1,
    shadow2ndColor: [0.6, 0.65, 0.75],   // 众数 (4/19)
    shadow2ndBorder: 0.15,
    shadow2ndBlur: 0.1,
    shadow3rdColor: null,           // null = 不用第三层
    shadow3rdBorder: 0.25,
    shadow3rdBlur: 0.1,
    /**
     * 三层阴影各自的法线强度（_ShadowNormalStrength 等 ✗ lts.shader:166 / 172 / 178 ✓）
     *
     *   N1 = lerp( fd.origN, fd.N, _ShadowNormalStrength );      // :854
     *   N2 = lerp( fd.origN, fd.N, _Shadow2ndNormalStrength );   // :855
     *   N3 = lerp( fd.origN, fd.N, _Shadow3rdNormalStrength );   // :857
     *
     * 0 = 分档边界按**几何法线**算（不受法线贴图影响 ✓）
     * 1 = 完整受法线贴图影响 ✓
     * ⇒ 法线贴图很夸张时 ✗ 把阴影的强度调小 ✗ 分档边界会更干净 ✓
     */
    shadowNormalStrength: 1,
    shadow2ndNormalStrength: 1,
    shadow3rdNormalStrength: 1,


    // 顶点色遮罩（lilToon 的 triMask ✗ 默认机制 ✓）
    //   顶点色 R 通道 → MatCap 权重 ✗ G → Rim 权重 ✗ B → 自发光权重
    // ⚠️ 模型**没有顶点色**时自动回退成「权重恒为 1」✗ 不会让效果消失 ✓
    //    （BA 那批 GLB 就没有顶点色 ✗ VRChat 模型才有 ✓）
    useVertexMask: true,

    /**
     * 描边（lilToon 的 Outline，默认关闭）
     *
     * 与 lilToon 的对应关系（lts.shader 474~556 行）：
     *   lilToon 把描边做成**另一个材质**（Hidden/lilToonOutline，编辑器生成的变体）。
     *   这里等价地：给每个网格挂一个**共享几何的克隆网格**，BackSide 反壳。
     *
     * 关键（lilGetOutlineWidth / lilCalcOutlinePosition）：
     *   · 宽度先乘 0.01
     *   · 乘 _OutlineWidthMask 的 .r
     *   · 乘顶点色 .r 或 .a（_OutlineVertexR2Width）
     *   · 乘 lerp(1, 到相机距离, _OutlineFixWidth) —— 世界单位 ↔ 屏幕恒定粗细的插值
     *   · 沿法线外扩；_OutlineVertexR2Width=2 时改用顶点色当法线
     *   · 最后沿"指向相机"方向推 _OutlineZBias
     */
    /**
     * 法线贴图（lil_common_frag.hlsl:555 / :579 ✓）
     *
     * lilToon 的机制：
     *   normalmap = lilUnpackNormalScale( SAMPLE(_BumpMap), _BumpScale );
     *   normalmap = lilBlendNormal( normalmap,
     *                 lilUnpackNormalScale( SAMPLE(_Bump2ndMap),
     *                   _Bump2ndScale * SAMPLE(_Bump2ndScaleMask).r ) );
     *   fd.N     = normalize( mul( normalmap, fd.TBN ) );
     *   fd.origN = normalize( input.normalWS );    ← 几何法线
     *
     * ★ three 里这些东西大半是现成的：
     *   · mat.normalMap + mat.normalScale 走 three 原生管线
     *   · three 的 normal_fragment_begin 里已经算好：
     *       mat3 tbn = mat3( vTangent, vBitangent, normal );  ← 有切线时
     *       mat3 tbn = getTangentFrame( ... );                ← 没切线时自动用导数兜底
     *       vec3 nonPerturbedNormal = normal;                 ← 这就是 fd.origN
     *   ⇒ 所以 1st 交给 three ✗ 2nd 自己混 ✗ 再让各效果按强度取用 ✓
     *
     * ⚠️ _BumpScale 是**标量**（Range -10~10 ✓）✗ three 的 normalScale 是 vec2 ✗ 两个分量填同一个值 ✓
     */
    bump: {
      use: false,        // _UseBumpMap
      tex: null,         // _BumpMap（url）
      scale: 1,          // _BumpScale
    },
    bump2nd: {
      use: false,        // _UseBump2ndMap
      tex: null,         // _Bump2ndMap（url）
      scale: 1,          // _Bump2ndScale
      scaleMask: null,   // _Bump2ndScaleMask（url ✗ 采样 .r 乘到 scale ✓）
      uvMode: 0,         // _Bump2ndMap_UVMode（0=uv0 ✗ 1/2/3 需要 uv1~3 暂不支持 ✓）
    },

    outline: {
      /**
       * ★ 半透明材质要不要**整个跳过**描边（默认 false = 画出来 ✓）
       *
       * ⚠️ lilToon **没有**这条规则 —— 它给透明材质也画描边 ✗
       *    只是描边 pass 继承材质的 _TransparentMode（走混合 ✓）
       * ⇒ 我们也照做（默认 false ✓）✗ 描边壳会跟着透明 + 不写深度 ✓
       *
       * ⚠️ 留这个开关是为了应对「薄板 + 反壳会糊一片」的极端情况 ✓
       *    （那种情况可以打开它退回老行为 ✓）
       */
      skipTransparent: false,
      enable: false,                   // _UseOutline = 0
      color: [0.6, 0.56, 0.73, 1.0],   // _OutlineColor
      tex: null,                       // _OutlineTex（URL，null = 纯色）
      width: 0.08,                     // _OutlineWidth（内部 ×0.01）
      widthMask: null,                 // _OutlineWidthMask（URL，取 .r）
      /**
       * 描边贴图的 UV 变换（_OutlineTex_ST）✗ lil_common_functions.hlsl:438
       *     uv * ST.xy + ST.zw
       *   = [ tilingX, tilingY, offsetX, offsetY ] ✗ 默认 [1,1,0,0] ✓
       */
      texST: [1, 1, 0, 0],
      /**
       * 描边贴图的滚动 / 旋转（_OutlineTex_ScrollRotate）✗ :436
       *     outuv = uv * ST.xy + ST.zw;
       *     outuv = lilRotateUV( outuv, SR.z + SR.w * _Time.y ) + frac( SR.xy * _Time.y );
       *   = [ scrollX, scrollY, angle, angleSpeed ] ✗ 默认 [0,0,0,0] ✓
       */
      texScrollRotate: [0, 0, 0, 0],
      /**
       * 描边贴图的 HSV 调整（_OutlineTexHSVG）✗ lil_common_frag.hlsl:370
       *     fd.col.rgb = lilToneCorrection( fd.col.rgb, _OutlineTexHSVG );
       *   lilToneCorrection（:328）：
       *     c = pow( abs(c), hsvg.w );         // gamma
       *     hsv = ( h + hsvg.x, saturate(s * hsvg.y), saturate(v * hsvg.z) )
       *   = [ 色相偏移, 饱和度倍率, 明度倍率, gamma ] ✗ 默认 [0,1,1,1] ✓
       */
      texHSVG: [0, 1, 1, 1],

      /**
       * 描边自己的模板参数（lts.shader:566-572 的 _OutlineStencil* ✓）。
       *
       * ⚠️ 用**平铺键**而不是嵌套对象 ✗ 因为 applyLilConfig 的组循环只处理一层 ✓
       *    嵌套对象会走到 num() ✗ 静默丢弃 ✓
       */
      stencilEnable: false,       // _OutlineStencilRef 的启用开关
      stencilRef: 0,              // _OutlineStencilRef
      stencilReadMask: 255,       // _OutlineStencilReadMask
      stencilWriteMask: 255,      // _OutlineStencilWriteMask
      stencilComp: 8,             // _OutlineStencilComp（8 = Always ✓）
      stencilPass: 0,             // _OutlineStencilPass（0 = Keep ✓）
      stencilFail: 0,             // _OutlineStencilFail
      stencilZFail: 0,            // _OutlineStencilZFail
      fixWidth: 0.5,                   // _OutlineFixWidth：0=世界单位 1=屏幕恒定
      /**
       * _OutlineFixWidth 的求值方式。
       *
       * ⚠️ lilToon 原版是 lerp(1.0, saturate(length(headDirection)), fixWidth)，
       *    但 saturate 把距离**截断在 1.0**，而相机距离通常远大于 1，
       *    于是 factor 恒为 1，fixWidth 拉 0 还是 1 结果完全一样 —— 参数实际失效。
       *
       *   'lilToon' （默认）= 保留 saturate，完全对齐 lilToon 行为
       *   'screen'          = 去掉 saturate，fixWidth=1 时描边**屏幕粗细恒定**
       *                       （缩远不变细，这是该参数名字本来的意图）
       */
      fixWidthMode: 'lilToon',

      /**
       * 不做描边的部件（正则 ✗ 匹配网格名或材质名 ✓）。
       *
       * 对应 lilToon 的 _OutlineDeleteMesh —— lilToon 把描边做成独立材质 ✗
       * 美术只要不给某个网格加描边材质即可 ✓ 这里用正则等价实现。
       *
       * 默认跳过嘴部：嘴巴被描边会很难看（BA 的嘴部网格名含 Mouth ✗ 材质是 mouth_atlas ✓）
       */
      skipPattern: 'mouth',
      vertexR2Width: 0,                // _OutlineVertexR2Width：0=不用 1=R 2=A(+法线)
      zBias: 0.0,                      // _OutlineZBias
      cull: 'back',                    // 'back' = 只画背面（lilToon 默认 Cull Front）
      litEnable: true,                 // _OutlineEnableLighting
      litColor: [1.0, 0.2, 0.0, 0.0],  // _OutlineLitColor（alpha=0 ⇒ 默认不受光）
      litApplyTex: false,             // _OutlineLitApplyTex：受光色再乘描边贴图
      /**
       * _OutlineLitShadowReceive —— 描边受光时是否被主光的阴影遮挡。
       *
       * lilToon：outlineLitFactor *= fd.attenuation
       * 我们：手动把 three 的阴影管线接进描边材质（MeshBasicMaterial 默认没有）✗
       *      再用 getShadowMask()（1=受光 0=全阴影）乘到 litF 上 ✓
       *
       * ⚠️ 三个必需件（缺一个顶点着色器就编不过）：
       *   ① #include <packing>  —— unpackRGBAToDepth / unpackRGBATo2Half 来自这里
       *   ② shadowmap_vertex 必须在 worldpos_vertex **之后** —— 它依赖 worldPosition
       *   ③ 声明 uniform bool receiveShadow —— three 会无条件 setValue ✗ 只需声明 ✓ 但必须在 shadowmask chunk **之前**（GLSL 先声明后使用）
       */
      litShadowReceive: false,
      /**
       * 诊断开关：把 getShadowMask() 直接画成描边颜色。
       *   白 = 受光 ✗ 黑 = 阴影 ✓
       * 用来区分「阴影遮罩没生效」和「生效了但视觉不明显」两种情况 ✓
       */
      litShadowDebug: false,
      /**
       * _OutlineLitShadowReceive 的阴影模糊倍率。
       *   实际采样半径 = 灯光自己的 shadow.radius × 这个倍率
       *   0 = 硬边 ✗ 1 = 跟随灯光 ✗ 越大越糊 ✓
       */
      litShadowBlur: 1.0,
      /**
       * 着色器里是否再乘一次描边色（uOutlineColor）。
       *
       * MeshBasicMaterial 的片元最后会乘一次 material.color，
       * 而材质构造时 mat.color 已经被设成描边色，所以：
       *
       *   false（默认 ✗ 正确）→ 描边色只乘一次 ✗ 受光色保持纯净
       *   true            → 着色器里再乘一次 ✗ 受光色会被描边色染暗（旧行为）
       */
      shaderColorMult: false,
      /**
       * _OutlineVectorTex —— 用贴图覆盖描边的外扩方向（手绘描边）。
       *
       * lilToon：贴图按**切线空间**法线解算 ✗ 经 TBN 转到对象空间：
       *   vec3 v = unpackNormal(tex2D(_OutlineVectorTex, uv)) * _OutlineVectorScale;
       *   outlineN = mul(v, tbnOS);
       *
       * ⚠️ three 的 MeshBasicMaterial 只有开了 USE_TANGENT 才有 tangent 属性。
       *    有 tangent 时用真实 TBN（与 Unity 一致）✗ 没有时用法线近似 ✗ 会有差异 ✓
       */
      vectorTex: null,                // URL
      vectorScale: 1.0,               // _OutlineVectorScale（-10 ~ 10）
      vectorUVMode: 0,                // _OutlineVectorUVMode：0=uv 1=uv1 2=uv2 3=uv3
      litScale: 10.0,                  // _OutlineLitScale
      litOffset: -8.0,                 // _OutlineLitOffset
    },

    // —— Rim Light（双色），对应 _Rim* ——
    rim: {
      blend: 0,                 // 0 = 关闭（等价于 lilToon 的 _UseRim = false）
      color: [1, 1, 1],
      border: 0.5,              // _RimBorder       众数 0.5 (13/19)
      blur: 0.1,                // _RimBlur         众数 0.1 (11/19)
      fresnelPower: 3,          // _RimFresnelPower 众数 3   (12/19)
      dirStrength: 0,               // 0 = 均匀，>0 = 受光侧更亮
      dirRange: 0,
      indirColor: [1, 1, 1],
      indirBorder: 0.5,
      indirBlur: 0.1,
      indirRange: 0,
      blendMode: 1,                 // 0 Normal / 1 Add / 2 Screen / 3 Multiply
      enableLighting: 1,            // 1 = rim 亮度受主光颜色影响
      mainStrength: 0,
      normalStrength: 1,
      shadowMask: 0.0,              // _RimShadowMask：Rim 是否被实时阴影压暗（lil_common_frag.hlsl:1680）
    },

    // —— MatCap，对应 _MatCap* ——
    matcap: {
      /**
       * MatCap 的三个进阶参数（lil_common_frag.hlsl:1521-1542 / :1591-1611）
       *
       * ⚠️ _MatCapVRParallaxStrength 在**非 VR 下是空操作**：
       *     lil_common_macro.hlsl:696 lilBlendVRParallax
       *       #if defined(USING_STEREO_MATRICES)
       *           return lerp(a, b, c);
       *       #else
       *           return b;            ← 直接返回视线方向 · 强度参数没用上
       *       #endif
       *   ⇒ 浏览器里调它不会有任何效果 · 这是 lilToon 的设计 · 不是我们的缺陷
       *     面板上保留只是为了和 lilToon 的参数表一一对应
       */
      vrParallax: 0,     // _MatCapVRParallaxStrength（⚠️ 非 VR 下无效）
      lod: 0,            // _MatCapLod（MatCap 贴图的 LOD bias）
      customNormal: false, // _MatCapCustomNormal（用一张 MatCap 专用法线图替换 N）
      bumpMap: null,     // _MatCapBumpMap（url）
      bumpScale: 1,      // _MatCapBumpScale
      url: null,                    // 贴图 URL
      blend: 1,
      blendMode: 0,
      enableLighting: 1,
      mainStrength: 0,
      normalStrength: 1,
      mul: false,                   // false = 加色，true = 乘 albedo（注：这是 lilToon lite 版的形式 ✓）
      shadowMask: 0.0,              // _MatCapShadowMask：MatCap 是否被实时阴影压暗（lil_common_frag.hlsl:1546）
      color: [1, 1, 1, 1],          // _MatCapColor —— 完整版才有的染色 ✓
      blendMask: null,              // _MatCapBlendMask（取 **RGB** ✗ 逐通道混合 ✓）
      backfaceMask: 1,              // _MatCapBackfaceMask：0=两面 1=只正面 2=只背面（默认 1 ✓）
    },

    /**
     * MatCap 2nd（lil_common_frag.hlsl:1585 lilGetMatCap2nd）
     *
     * 第二个 MatCap 槽位 ✗ 参数与 1st 完全同构 ✓
     * 用途：同一部位表现两种材质 —— 剑刃+剑身 / 布料+金属扣 / 发丝+发梢渐变 ✓
     *
     * 执行顺序（lil_pass_forward_normal.hlsl:435 / 440）：
     *     Backlight → MatCap → MatCap2nd → Rim → Emission ✓
     *   即 2nd 叠在 1st **之上** ✓
     */
    matcap2nd: {
      /**
       * MatCap 的三个进阶参数（lil_common_frag.hlsl:1521-1542 / :1591-1611）
       *
       * ⚠️ _MatCapVRParallaxStrength 在**非 VR 下是空操作**：
       *     lil_common_macro.hlsl:696 lilBlendVRParallax
       *       #if defined(USING_STEREO_MATRICES)
       *           return lerp(a, b, c);
       *       #else
       *           return b;            ← 直接返回视线方向 · 强度参数没用上
       *       #endif
       *   ⇒ 浏览器里调它不会有任何效果 · 这是 lilToon 的设计 · 不是我们的缺陷
       *     面板上保留只是为了和 lilToon 的参数表一一对应
       */
      vrParallax: 0,     // _MatCap2ndVRParallaxStrength（⚠️ 非 VR 下无效）
      lod: 0,            // _MatCap2ndLod（MatCap 贴图的 LOD bias）
      customNormal: false, // _MatCap2ndCustomNormal（用一张 MatCap 专用法线图替换 N）
      bumpMap: null,     // _MatCap2ndBumpMap（url）
      bumpScale: 1,      // _MatCap2ndBumpScale
      url: null,                    // _MatCap2ndTex
      blend: 0,                     // _MatCap2ndBlend（0 = 关闭）
      blendMode: 0,                 // _MatCap2ndBlendMode
      enableLighting: 1,            // _MatCap2ndEnableLighting
      mainStrength: 0,              // _MatCap2ndMainStrength（乘 albedo）
      normalStrength: 1,
      mul: false,
      shadowMask: 0,                // _MatCap2ndShadowMask
      color: [1, 1, 1, 1],          // _MatCap2ndColor
      blendMask: null,              // _MatCap2ndBlendMask（取 **RGB** ✓）
      backfaceMask: 1,              // _MatCap2ndBackfaceMask
    },

    // —— 自发光，对应 _Emission* ——
    emission: {
      use: false,        // _UseEmission（⚠️ 之前漏了这个字段 ✗ applyLilConfig 的校验会把它丢掉 ✓）
      color: [1, 1, 1],
      blend: 0,
      blendMode: 1,                 // 默认 Add
      uvMode: 0,        // _EmissionMap_UVMode（0=uv0 ✗ 4=视角球面 ✗ 1/2/3 需要 uv1~3 暂不支持 ✓）
      mainStrength: 0,
      tex: null,                     // _EmissionMap 贴图 URL
      blendMask: null,              // _EmissionBlendMask（**RGBA** 整体乘到 emissionColor ✓）
      },

    // —— 背光，对应 _Backlight* ——
    /**
     * 反射 + 镜面高光（lil_common_frag.hlsl:1315-1334 · :1350-1370）
     *
     * ⚠️ lilToon 里整块被 #if defined(LIL_FEATURE_REFLECTION) 包着 ·
     *    而它来自 _UseReflection ⇒ **默认 0** ✓
     *    19 个官方预设里只有 3 个开（Inorganic-Glass / LiteGlass / Metal ✓）
     *    ⇒ 这就是「金属 / 玻璃类材质的高光」· 皮肤/衣服/头发都不开 ✓
     *
     * ⚠️ 已确认 _ApplySpecular / _Smoothness 虽然默认写 1 ·
     *    但在 _UseReflection = 0 时是**空写**（块被编译掉 ✓）
     */
    /**
     * 抖动（lil_common_frag.hlsl:524-546）
     *
     *   if(_UseDither == 1)
     *       fd.col.a = fd.col.a >= ( lilSamplePointRepeat( _DitherTex,
     *                                  input.positionCS.xy, _DitherTex_TexelSize.zw ).r * 255 + 1 )
     *                            / ( _DitherMaxValue + 2 );
     *
     * 辅助函数（lil_common_macro.hlsl:321）：
     *   uint2 uv = (uint2)positionCS.xy % (uint2)size;   // 屏幕像素坐标取模
     *   return tex2D(tex, uv / size);
     *
     * ⇒ 把连续的 alpha 量化成**屏幕空间的有序点阵**
     *   配合距离淡出用 ⇒ 远处用「点阵消失」代替半透明（省 overdraw）
     *
     * ⚠️ lilToon 里前面还有一句 lilDistanceFadeAlphaOnly（仅 Cutout 下）
     *    那需要**基础材质的 _DistanceFade** ⇒ 我们还没做（记为 A2）
     *    ⇒ 这里只做抖动那一步 ⇒ 单独用也成立
     *
     * ⚠️ GLSL ES 1.00 没有 uint ⇒ 用 mod() + floor() 等价实现
     */
    dither: {
      use: false,        // _UseDither（默认 0）
      url: null,         // _DitherTex（默认 "white" ⇒ 全 1）
      maxValue: 255,     // _DitherMaxValue
    },
    reflection: {
      use: false,            // _UseReflection（⚠️ 默认 0 ⇒ 整块关 ✓）
      apply: true,           // _ApplySpecular（默认 1）
      toon: true,            // _SpecularToon（默认 1 ⇒ 走卡通化那条路）
      border: 0.5,           // _SpecularBorder
      blur: 0.0,             // _SpecularBlur
      normalStrength: 1.0,   // _SpecularNormalStrength
      smoothness: 1.0,       // _Smoothness ⇒ perceptualRoughness = 1-它 · roughness = 它的平方
      reflectance: 0.04,     // _Reflectance（非金属的镜面反射率）
      metallic: 0.0,         // _Metallic
      color: [1, 1, 1, 1],   // _ReflectionColor（HDR）
      blendMode: 1,          // _ReflectionBlendMode（0正常 1加算 2屏幕 3乘算 · 默认 1）
      aaStrength: 1.0,       // _AAStrength（卡通边的 AA 强度 · 0 = 硬边 ✓）
    },
    backlight: {
      blend: 0,                 // 0 = 关闭（等价于 lilToon 的 _UseBacklight = false）
      color: [1, 1, 1],
      border: 0.35,
      blur: 0.05,
      directivity: 5.0,
      viewStrength: 1,
      normalStrength: 1,
      mainStrength: 0,
    },

    /**
     * 自发光第二层（lil_common_frag.hlsl:1888-1899 lilEmission2nd ✓）
     *
     * ⚠️ 和 1st **完全同构** ✗ 只是所有参数带 2nd 后缀 ✗ 各有一份独立的贴图/遮罩 ✓
     *    两者都会**加算到 emissionColor** ✗ 所以是叠加发光 ✗ 不是替换 ✓
     *    顺序：Emission1st → Emission2nd（lil_pass_forward_normal.hlsl:462 / 468 ✓）
     */
    emission2nd: {
      use: false,        // _UseEmission2nd
      color: [1, 1, 1, 1],   // _Emission2ndColor
      blend: 0,          // _Emission2ndBlend
      blendMode: 0,      // _Emission2ndBlendMode（0正常 1加算 2屏幕 3乘算 ✓）
      uvMode: 0,         // _Emission2ndMap_UVMode
      tex: null,         // _Emission2ndMap（url）
      blendMask: null,   // _Emission2ndBlendMask（url ✗ RGBA 整体乘 ✓）
    },

    /**
     * 主色层 2nd / 3rd（lil_common_frag.hlsl:725 lilGetMain2nd / :757 lilGetMain3rd）
     *
     * 在同一个材质上再叠两层基础色 ✗ 每层有独立的贴图 / 混合模式 / 遮罩 / 剔除 ✓
     *
     * ★ _Main2ndEnableLighting 不是开关 ✗ 是「这一层有多大比例参与光照」：
     *     lil_pass_forward_normal.hlsl:342（光照**前**）
     *         fd.col.rgb = lilBlendColor( fd.col.rgb, color2nd.rgb,
     *                                     color2nd.a * _Main2ndEnableLighting, _Main2ndTexBlendMode );
     *     lil_pass_forward_normal.hlsl:376（光照**后**）
     *         fd.col.rgb = lilBlendColor( fd.col.rgb, color2nd.rgb,
     *                                     color2nd.a - color2nd.a * _Main2ndEnableLighting, ... );
     *   ⇒ 1.0 = 完全受光照（会被明暗分档影响 ✗ 像皮肤的一部分 ✓）
     *     0.0 = 完全不受光照（保持原色 ✗ 像贴纸/自发光 ✓）
     *   所以实现上要**两处注入** ✗ 和 lilToon 一样 ✓
     *
     * 用途：脸部腮红 / 衣服花纹 / 纹身 / 眼影 / 可独立淡出的配件 ✓
     */
    main2nd: {
      /**
       * ★ Decal 调试（0=正常 · 1=跳过边缘 AA · 2=把 decal UV 输出成颜色 · 3=只看 alpha）
       *
       * 「开了 Decal 但画面没变化」时用它二分定位：
       *   1 ⇒ 有变化  ⇒ 是**边缘 AA** 把 alpha 清成 0 了（decal UV 出了 [0,1] ✓）
       *   2 ⇒ 有变化  ⇒ 采样代码在跑 ✗ 问题在 alpha/混合
       *   3 ⇒ 有变化  ⇒ 采样到了 ✗ 问题在颜色/混合
       *   都没变化     ⇒ 这段 GLSL 根本没进着色器（注入问题 ✓）
       */
      decalDebug: 0,      /**
       * ★ Decal（贴花 ✗ lil_common_functions.hlsl:473 lilCalcDecalUV ✓）
       *
       * ⚠️ Decal **不是独立层** ⇒ 它是这一层的一个**模式**（_Main2ndTexIsDecal ✓）
       *    开启后把贴图按「贴花」方式铺（可镜像 / 单侧 / 图集动画 ✓）
       *
       * ⚠️ 实际模型多半把 uvMode 设成 1（UV1 ✓）—— 因为贴花本来就是「换一套 UV 贴上去」
       * ⚠️ isLeftOnly / isRightOnly 靠 vBa3dRightHand（切线 w 的符号 ✓）分区
       *    没有切线的模型 ⇒ 恒为 1.0（和 lilToon 的初值一致 ✓）
       */
      isDecal: false,          // _Main2ndTexIsDecal
      isLeftOnly: false,       // _Main2ndTexIsLeftOnly
      isRightOnly: false,      // _Main2ndTexIsRightOnly
      shouldCopy: false,       // _Main2ndTexShouldCopy（左半镜像到右半）
      shouldFlipMirror: false, // _Main2ndTexShouldFlipMirror
      shouldFlipCopy: false,   // _Main2ndTexShouldFlipCopy
      // _Main2ndTexDecalAnimation：(列数, 行数, 固定帧, 帧率) ✗ 默认 (1,1,1,30)
      decalAnimation: [1, 1, 1, 30],
      // _Main2ndTexDecalSubParam：(宽, 高, 向中心吸附, 1) ✗ 默认 (1,1,0,1)
      decalSubParam: [1, 1, 0, 1],
      // _Main2ndTex_ST：(缩放x, 缩放y, 偏移x, 偏移y)
      texST: [1, 1, 0, 0],
      // _Main2ndTexAngle：UV 旋转角
      texAngle: 0,
/**
       * _Main2ndTexAlphaMode（Int · 默认 0）：
       *   0 = 不改变   1 = 用这一层的 alpha 替换   2 = 相乘
       *   3 = 相加（截断）  4 = 相减（截断）
       * ⚠️ lilToon 里整块被 `#if LIL_RENDER != 0` 包着 ⇒ 只在 Cutout / Transparent 下生效
       * ⚠️ 用完会把这一层的 alpha **置 1**（lil_common_frag.hlsl:805）⇒
       *    接下来的**颜色混合**按满强度算（这一句很容易漏）
       */
      alphaMode: 0,      use: false,                 // _UseMain2ndTex
      color: [1, 1, 1, 1],        // _Color2nd
      tex: null,                  // _Main2ndTex
      uvMode: 0,                  // _Main2ndTex_UVMode：0=uv0 4=视角球面（1/2/3 需要 uv1~3 ✗ 暂不支持）
      blendMode: 0,               // _Main2ndTexBlendMode：0 Normal / 1 Add / 2 Screen / 3 Multiply
      enableLighting: 1,          // _Main2ndEnableLighting：参与光照的比例
      blendMask: null,            // _Main2ndBlendMask（取 R 通道）
      cull: 0,                    // _Main2ndTex_Cull：0=两面 1=只背面 2=只正面

      /**
       * 层溶解（lil_common_frag.hlsl:725 → lil_common_functions.hlsl:626 lilCalcDissolve ✓）
       *
       * ⚠️ 它和顶层 Dissolve **不一样**：
       *   · 顶层 Dissolve 是**丢弃像素**（alphaTest ✓）+ 边缘发光 ✓
       *   · 层溶解只是把**这一层的 alpha 乘 0/1** ✗ 不丢弃像素 ✓
       *     边缘颜色是**加算到自发光**（lil_pass_forward_normal.hlsl:479 ✓）
       *     ⇒ fd.emissionColor += _Main2ndDissolveColor.rgb * dissolveAlpha ✓
       *
       * 公式（dissolveParams = (mode, dirMode, threshold, softness) ✓）：
       *   mode 0 = 关闭 ✗ 1 = 贴图阈值 ✗ 2 = UV 2D ✗ 3 = 3D 坐标
       *   dirMode 1 → 用 dot(方向) ✗ 否则用 distance
       *   dissolveAlpha = 1 - saturate( |值 - threshold| / softness )   ← 边缘强度
       *   这一层的 alpha *= (值 > threshold ? 1 : 0)                     ← 硬裁剪
       */
      dissolveMode: 0,           // _Main2ndDissolveParams.r
      dissolveDir: 0,            // .g（1 = 方向 ✗ 0 = 距离）
      dissolveThreshold: 0.5,    // .b
      dissolveSoftness: 0.1,     // .a
      dissolvePos: [0, 0, 0, 0], // _Main2ndDissolvePos（xy 用于 mode 2 ✗ xyz 用于 mode 3 ✗ w = 旋转角）
      dissolveColor: [1, 1, 1],  // _Main2ndDissolveColor（加算到自发光 ✓）
      dissolveMask: null,        // _Main2ndDissolveMask（url ✗ 采样 .r ✓）
      dissolveMaskST: [1, 1, 0, 0],
      dissolveNoiseMask: null,   // _Main2ndDissolveNoiseMask（url ✓）
      dissolveNoiseMaskST: [1, 1, 0, 0],
      dissolveNoiseScrollRotate: [0, 0, 0, 0],
      dissolveNoiseStrength: 0,  // _Main2ndDissolveNoiseStrength ✓
      /**
       * 距离淡出（_Main2ndDistanceFade ✗ lil_common_frag.hlsl:796 ✓）
       *
       * lilToon 是一个 float4：(near, far, strength, 未用 ✓)
       * ⚠️ 这里拆成 3 个标量 ✗ 面板上比一个 vec4 好调 ✓
       *   语义完全一样 ✗ GLSL 里再合起来用 ✓
       *
       * 效果：离相机 **near 以内**完全不淡 ✗ far 以外淡到 strength 指定的程度 ✓
       *   strength 1 = 完全淡掉（这一层消失 ✓）✗ 0 = 不淡 ✓
       *   ⚠️ near == far 会除零 ✗ 代码里用 max(1e-5, ...) 兜底 ✓
       */
      distFadeNear: 0,       // _Main2ndDistanceFade.x
      distFadeFar: 0,        // .y（默认 = near ⇒ 不淡 ✓）
      distFadeStrength: 0,   // .z
    },
    main3rd: {
      /**
       * ★ Decal 调试（0=正常 · 1=跳过边缘 AA · 2=把 decal UV 输出成颜色 · 3=只看 alpha）
       *
       * 「开了 Decal 但画面没变化」时用它二分定位：
       *   1 ⇒ 有变化  ⇒ 是**边缘 AA** 把 alpha 清成 0 了（decal UV 出了 [0,1] ✓）
       *   2 ⇒ 有变化  ⇒ 采样代码在跑 ✗ 问题在 alpha/混合
       *   3 ⇒ 有变化  ⇒ 采样到了 ✗ 问题在颜色/混合
       *   都没变化     ⇒ 这段 GLSL 根本没进着色器（注入问题 ✓）
       */
      decalDebug: 0,      /**
       * ★ Decal（贴花 ✗ lil_common_functions.hlsl:473 lilCalcDecalUV ✓）
       *
       * ⚠️ Decal **不是独立层** ⇒ 它是这一层的一个**模式**（_Main3rdTexIsDecal ✓）
       *    开启后把贴图按「贴花」方式铺（可镜像 / 单侧 / 图集动画 ✓）
       *
       * ⚠️ 实际模型多半把 uvMode 设成 1（UV1 ✓）—— 因为贴花本来就是「换一套 UV 贴上去」
       * ⚠️ isLeftOnly / isRightOnly 靠 vBa3dRightHand（切线 w 的符号 ✓）分区
       *    没有切线的模型 ⇒ 恒为 1.0（和 lilToon 的初值一致 ✓）
       */
      isDecal: false,          // _Main3rdTexIsDecal
      isLeftOnly: false,       // _Main3rdTexIsLeftOnly
      isRightOnly: false,      // _Main3rdTexIsRightOnly
      shouldCopy: false,       // _Main3rdTexShouldCopy（左半镜像到右半）
      shouldFlipMirror: false, // _Main3rdTexShouldFlipMirror
      shouldFlipCopy: false,   // _Main3rdTexShouldFlipCopy
      // _Main3rdTexDecalAnimation：(列数, 行数, 固定帧, 帧率) ✗ 默认 (1,1,1,30)
      decalAnimation: [1, 1, 1, 30],
      // _Main3rdTexDecalSubParam：(宽, 高, 向中心吸附, 1) ✗ 默认 (1,1,0,1)
      decalSubParam: [1, 1, 0, 1],
      // _Main3rdTex_ST：(缩放x, 缩放y, 偏移x, 偏移y)
      texST: [1, 1, 0, 0],
      // _Main3rdTexAngle：UV 旋转角
      texAngle: 0,
/**
       * _Main3rdTexAlphaMode（Int · 默认 0）：
       *   0 = 不改变   1 = 用这一层的 alpha 替换   2 = 相乘
       *   3 = 相加（截断）  4 = 相减（截断）
       * ⚠️ lilToon 里整块被 `#if LIL_RENDER != 0` 包着 ⇒ 只在 Cutout / Transparent 下生效
       * ⚠️ 用完会把这一层的 alpha **置 1**（lil_common_frag.hlsl:805）⇒
       *    接下来的**颜色混合**按满强度算（这一句很容易漏）
       */
      alphaMode: 0,      use: false,
      color: [1, 1, 1, 1],
      tex: null,
      uvMode: 0,
      blendMode: 0,
      enableLighting: 1,
      blendMask: null,
      cull: 0,

      /**
       * 层溶解（lil_common_frag.hlsl:821 → lil_common_functions.hlsl:626 lilCalcDissolve ✓）
       *
       * ⚠️ 它和顶层 Dissolve **不一样**：
       *   · 顶层 Dissolve 是**丢弃像素**（alphaTest ✓）+ 边缘发光 ✓
       *   · 层溶解只是把**这一层的 alpha 乘 0/1** ✗ 不丢弃像素 ✓
       *     边缘颜色是**加算到自发光**（lil_pass_forward_normal.hlsl:479 ✓）
       *     ⇒ fd.emissionColor += _Main3rdDissolveColor.rgb * dissolveAlpha ✓
       *
       * 公式（dissolveParams = (mode, dirMode, threshold, softness) ✓）：
       *   mode 0 = 关闭 ✗ 1 = 贴图阈值 ✗ 2 = UV 2D ✗ 3 = 3D 坐标
       *   dirMode 1 → 用 dot(方向) ✗ 否则用 distance
       *   dissolveAlpha = 1 - saturate( |值 - threshold| / softness )   ← 边缘强度
       *   这一层的 alpha *= (值 > threshold ? 1 : 0)                     ← 硬裁剪
       */
      dissolveMode: 0,           // _Main3rdDissolveParams.r
      dissolveDir: 0,            // .g（1 = 方向 ✗ 0 = 距离）
      dissolveThreshold: 0.5,    // .b
      dissolveSoftness: 0.1,     // .a
      dissolvePos: [0, 0, 0, 0], // _Main3rdDissolvePos（xy 用于 mode 2 ✗ xyz 用于 mode 3 ✗ w = 旋转角）
      dissolveColor: [1, 1, 1],  // _Main3rdDissolveColor（加算到自发光 ✓）
      dissolveMask: null,        // _Main3rdDissolveMask（url ✗ 采样 .r ✓）
      dissolveMaskST: [1, 1, 0, 0],
      dissolveNoiseMask: null,   // _Main3rdDissolveNoiseMask（url ✓）
      dissolveNoiseMaskST: [1, 1, 0, 0],
      dissolveNoiseScrollRotate: [0, 0, 0, 0],
      dissolveNoiseStrength: 0,  // _Main3rdDissolveNoiseStrength ✓
      /**
       * 距离淡出（_Main3rdDistanceFade ✗ lil_common_frag.hlsl:796 ✓）
       *
       * lilToon 是一个 float4：(near, far, strength, 未用 ✓)
       * ⚠️ 这里拆成 3 个标量 ✗ 面板上比一个 vec4 好调 ✓
       *   语义完全一样 ✗ GLSL 里再合起来用 ✓
       *
       * 效果：离相机 **near 以内**完全不淡 ✗ far 以外淡到 strength 指定的程度 ✓
       *   strength 1 = 完全淡掉（这一层消失 ✓）✗ 0 = 不淡 ✓
       *   ⚠️ near == far 会除零 ✗ 代码里用 max(1e-5, ...) 兜底 ✓
       */
      distFadeNear: 0,       // _Main3rdDistanceFade.x
      distFadeFar: 0,        // .y（默认 = near ⇒ 不淡 ✓）
      distFadeStrength: 0,   // .z
    },

    /**
     * Dissolve（lil_common_functions.hlsl:626 lilCalcDissolve）
     *
     * 参数对应：
     *   mode      _DissolveParams.r   0=关 1=贴图阈值 2=UV(平面/圆形) 3=对象空间(平面/球形)
     *   linear    _DissolveParams.g   1=线性(平面) 0=圆形(球形)
     *   threshold _DissolveParams.b   阈值
     *   softness  _DissolveParams.a   边缘羽化宽度（0 会除零 ✗ 内部兜底 0.001）
     *   pos       _DissolvePos        (xyz 中心/方向 ✗ w = UV 旋转)
     *   color     _DissolveColor.rgb  边缘颜色（加色 ✗ 见 lil_common_frag.hlsl:1962）
     *   maskTex   _DissolveMask       模式 1 用的遮罩贴图
     *   noiseTex / noiseStrength      噪声扰动（lilCalcDissolveWithNoise ✗ :642）
     */
    /**
     * 模板缓冲（Stencil）—— 对应 lilToon 的 _Stencil*（lts.shader:535-541 ✓）
     *
     * ⚠️ 这是**作者向**的技术 ✗ 用来「用 A 的形状遮罩 B」✗ 不是一种观感风格 ✓
     *    典型用法：
     *      角色网格：Pass = Replace ✗ Ref = 1（把自己标记进模板缓冲）
     *      魔法阵  ：Comp = Equal ✗ Ref = 1（只画在角色占的像素上）
     *    查看器里用处有限 ✗ 但 three 原生支持 ✗ 参数直通即可 ✓
     *
     * Unity 的枚举 → three 常量（两套编号完全不同 ✗ 见 applyStencil 的映射表 ✓）
     */
    stencil: {
      use: false,        // 是否启用（对应 lilToon 靠材质开关关闭 ✓）
      ref: 0,            // _StencilRef        0~255
      readMask: 255,     // _StencilReadMask   0~255
      writeMask: 255,    // _StencilWriteMask  0~255
      comp: 8,           // _StencilComp       Unity CompareFunction（8 = Always ✗ 默认 ✓）
      pass: 0,           // _StencilPass       Unity StencilOp（0 = Keep ✓）
      fail: 0,           // _StencilFail
      zfail: 0,          // _StencilZFail
    },

    dissolve: {
      mode: 0,
      linear: 1,
      threshold: 0.5,
      softness: 0.03,   // 边缘羽化宽度 ✗ 太大时整只都会进边缘带（尤其球形模式）✓
      pos: [0, 0, 0, 0],
      color: [1, 1, 1],
      maskTex: null,
      noiseTex: null,
      noiseStrength: 0.0,
    },
  };

  /**
   * 按材质名覆盖 lilCfg —— lilToon 的预设本来就是「每个材质槽选一个」的。
   *
   *   lilCfg                     全局默认（面板选「全部」时改的就是它）
   *   lilCfgByMaterial[材质名]   该材质的覆盖（面板选中某材质时改这里）
   *
   * 最终生效 = 深合并（一层）✗ 见 lilCfgFor()
   */
  let lilCfgByMaterial = {};

  /**
   * 一层深合并：嵌套对象（outline / rim / matcap / emission / backlight）逐字段合并 ✗
   * 其余直接覆盖 ✓
   */
  function mergeLilCfg(base, over) {
    if (!over) return base;
    const out = Object.assign({}, base);
    for (const k of Object.keys(over)) {
      const v = over[k], b = base[k];
      const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
      out[k] = (isObj(v) && isObj(b)) ? Object.assign({}, b, v) : v;
    }
    return out;
  }

  /**
   * ★★ 规范化：**有主贴图 ⇒ 这一层就算启用**
   *
   * 用户的心智模型是「选了贴图 = 这层在用了」· 而 lilToon 的 _UseMain2ndTex
   * 是单独一个开关 ⇒ 不打开的话 lilMainLayerGLSL 第一行就 return null ⇒
   * 面板上后面所有参数（Decal / ST / 镜像 / 图集 …）全部没反应 ·
   * 但贴图那行明明显示了文件名 ⇒ 看起来「设了却没效果」 ✓
   *
   * ⚠️ 之前只在两处做过（面板 mkTex 的 onchange / applyLilConfig 的 tex 分支 ✓）·
   *    但那两处都要求「用户重新选一次贴图」✗ 已经选过的老配置不会触发 ✓
   *    （实测：用户硬刷新后 use 依然是 0 ✗ 只能手动开 ✓）
   * ⇒ 这里在**读取路径**上兜底 ⇒ 无论配置从哪来（面板 / JSON / 老配置 ✓）
   *    只要 tex 有值且 use 是假 ⇒ 就当成启用 ✓
   *
   * ⚠️ 不改写配置本身（只影响读取 ✓）⇒ 用户仍可显式关掉「启用」吗？
   *    不能 —— 只要贴图还在就会被当成开 ✓
   *    想关掉请点贴图那行的「清除」✓（这也是符合直觉的 ✓）
   */
  function normalizeLayerUse(c) {
    if (!c) return c;
    for (const g of ['main2nd', 'main3rd']) {
      const L = c[g];
      if (L && L.tex && !L.use) L.use = true;
    }
    return c;
  }

  /** 取某个材质最终生效的 lilCfg（没覆盖就是全局那份 ✗ 直接返回引用避免无谓分配）*/
  function lilCfgFor(mat) {
    const nm = mat && mat.name;
    if (!nm || !lilCfgByMaterial[nm]) return normalizeLayerUse(lilCfg);
    return normalizeLayerUse(mergeLilCfg(lilCfg, lilCfgByMaterial[nm]));
  }

  /** 取某个材质最终生效的 celCfg（cel 侧目前不做按材质 ✗ 保留接口）*/
  function celCfgFor() { return celCfg; }
  let lilMatCapTex = null;          // 载入后的 MatCap 贴图
  /** lilCfg 的出厂默认值快照 —— 导出配置时用它做 diff（等于默认就不写进 JSON ✓） */
  const LIL_DEFAULTS = JSON.parse(JSON.stringify(lilCfg));

  const celCfg = {
    shadowMin: 0.3,   // 投射阴影里保留多少主光（0 = 原来的硬阴影，1 = 完全没有阴影）；实测定标 0.3
    faceShadowMin: 0.7,  // 面部单独一档；null = 跟随 shadowMin。0 = 最深，>=0.95 = 没有面部阴影
    steps: 4,          // 明暗分档数（2 = 硬边两级）
    dark: 0.55,        // 最暗档亮度（1.0 = 全亮）
    shadowTint: null,  // 暗部色调 THREE.Color | null
    /**
     * 分档色（阶段 1 ①「每段各自颜色」）。
     *
     *   null  = **老公式**（mix(shadowTint, white, dark..1 线性)）✗ 默认 ✓
     *   否则  = 4 个 [r,g,b] ✗ 从**最暗段**到**最亮段**线性插值出每一段的颜色 ✓
     *
     * ⚠️ 默认 null 是刻意的 —— 老公式一个字节都不变 ✗ 想用新功能才打开 ✓
     *    这样「cel 模式没变」这条回归保证仍然成立 ✓
     */
    bandRamp: null,
    /**
     * 段与段之间的**过渡带宽度**（阶段 1 ①）。
     *
     *   0    = 硬边（floor ✓ 和老公式一致 ✓）
     *   0.5  = 段内后半段平滑过渡
     *   1    = 整段都是过渡（接近连续渐变）
     *
     * ⚠️ 只对 bandRamp 生效 ✗ bandRamp = null 时这个值被忽略 ✓
     */
    bandSoft: 0,
    faceLight: false,  // 面部光照修正
    facePattern: 'Face|EyeMouth|Eyebrow|Mouth',
  };
  /** celCfg 的出厂默认值快照（同上，用于导出 diff） */
  const CEL_DEFAULTS = JSON.parse(JSON.stringify(celCfg));
  let celProgramVersion = 0;   // 参数被烘进 GLSL 源码，变了必须让 three 重新编译
  let lilMaterialVersion = 0;   // 按材质覆盖变了这个要 ++ ✗ 让带覆盖的材质重编译
  /**
   * 渲染 = 两个**正交**的轴（以前混在一个 shading 里 ✗）：
   *
   *   renderMode  材质模型       'pbr' | 'toon' | 'unlit'   用哪个 three.js 材质类
   *   shaderMode  着色器注入      'none' | 'cel' | 'lilToon' 往 toon 材质里注入什么 GLSL
   *
   * shader 只在 render='toon' 时有意义 ✗；若配了 shader 却把 render 设成 pbr/unlit，
   * 会自动把 render 提到 toon 并打印提示 ✓。
   *
   * 旧的 `shading` 配置键继续可用 ✓（两个轴的快捷组合）：
   *   shading:'pbr'   ⇔ render:'pbr',  shader:'none'
   *   shading:'cel'   ⇔ render:'toon', shader:'cel'
   *   shading:'unlit' ⇔ render:'unlit',shader:'none'
   */
  let renderMode = 'toon';   // 默认：卡通材质
  let shaderMode = 'cel';    // 默认：我们的 cel 分档（lilToon 需显式开启）

  /** 当前卡通参数快照 */
  function celSnapshot() {
    const c = celCfg.shadowTint;
    return {
      steps: celCfg.steps,
      dark: celCfg.dark,
      shadowMin: celCfg.shadowMin,
      faceShadowMin: celCfg.faceShadowMin,
      shadowTint: c ? [+c.r.toFixed(4), +c.g.toFixed(4), +c.b.toFixed(4)] : null,
      faceLight: celCfg.faceLight,
      facePattern: celCfg.facePattern,
      // 分档色：null 就原样带过去（导出 diff 时要能区分「没用」和「用了全白」✓）
      bandRamp: Array.isArray(celCfg.bandRamp)
        ? celCfg.bandRamp.map((c) => [+c[0].toFixed(4), +c[1].toFixed(4), +c[2].toFixed(4)])
        : null,
      bandSoft: celCfg.bandSoft,
    };
  }

  /** 改卡通参数（配置映射和页面 API 都走这里） */
  function setCelParams(o) {
    o = o || {};
    if (o.steps !== undefined) celCfg.steps = Math.max(2, Math.min(16, Math.round(Number(o.steps)) || 4));
    if (o.dark !== undefined) celCfg.dark = Math.max(0, Math.min(1, Number(o.dark)));
    if (o.shadowMin !== undefined) celCfg.shadowMin = Math.max(0, Math.min(1, Number(o.shadowMin)));
    if (o.faceShadowMin !== undefined) {
      celCfg.faceShadowMin = (o.faceShadowMin === null || o.faceShadowMin === undefined)
        ? null : Math.max(0, Math.min(1, Number(o.faceShadowMin)));
    }
    if (o.shadowTint !== undefined) {
      if (o.shadowTint) {
        const a = o.shadowTint;
        celCfg.shadowTint = new THREE.Color(Number(a[0]) || 0, Number(a[1]) || 0, Number(a[2]) || 0);
      } else celCfg.shadowTint = null;
    }
    if (o.faceLight !== undefined) celCfg.faceLight = !!o.faceLight;
    if (o.facePattern !== undefined) celCfg.facePattern = String(o.facePattern);
    if (o.bandRamp !== undefined) {
      if (Array.isArray(o.bandRamp) && o.bandRamp.length >= 2) {
        celCfg.bandRamp = o.bandRamp.slice(0, 4).map((c) => {
          const a = Array.isArray(c) ? c : [1, 1, 1];
          const cl = (x) => Math.max(0, Math.min(1, Number(x) || 0));
          return [cl(a[0]), cl(a[1]), cl(a[2])];
        });
        // 不足 4 个就复制最后一个补齐（避免 GLSL 里少一个颜色 ✓）
        while (celCfg.bandRamp.length < 4) celCfg.bandRamp.push(celCfg.bandRamp[celCfg.bandRamp.length - 1].slice());
      } else celCfg.bandRamp = null;
    }
    if (o.bandSoft !== undefined) celCfg.bandSoft = Math.max(0, Math.min(1, Number(o.bandSoft) || 0));
    // 浓度滑块同时决定"面部接不接收阴影"（覆盖 PBR 通路）
    cfg.faceNoShadow = deriveFaceNoShadow();
    applyFaceNoShadow();

    celProgramVersion++;
    // 双保险：即使某个材质被复用，也强制 three 重新检查程序缓存
    if (modelRoot) {
      modelRoot.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { if (m) m.needsUpdate = true; });
      });
    }
    applyRender(renderMode);   // 参数烘进了 GLSL → 重建材质，让 three 重新编译
  }

  /** 注入用的 getGradientIrradiance（参数烘成字面量） */
  function celGradientGLSL(cfgIn, ccIn) {
    // 支持按材质覆盖：不传就用全局配置
    const cfg = cfgIn || lilCfg;
    const cc = ccIn || celCfg;
    const steps = Math.max(2, Math.min(16, Math.round(cc.steps) || 4));
    const dark = Math.max(0, Math.min(1, Number(cc.dark)));
    const c = cc.shadowTint;
    const tint = c
      ? 'vec3(' + c.r.toFixed(4) + ', ' + c.g.toFixed(4) + ', ' + c.b.toFixed(4) + ')'
      : 'vec3(1.0)';

    const num = (v, d) => (v === undefined || v === null || !isFinite(Number(v)) ? d : Number(v));
    const col = (a) => 'vec3(' + Number(a[0]).toFixed(4) + ', ' + Number(a[1]).toFixed(4) + ', ' + Number(a[2]).toFixed(4) + ')';
    /**
     * 取某一层的 alpha（= 这一层多强 ✗ lilToon 的 _ShadowXxxColor.a）
     * 没有第 4 个分量时按 1 处理（我们的默认值就是 3 元素 ✓）
     */
    const alphaOf = (a) => ((Array.isArray(a) && a.length >= 4 && isFinite(Number(a[3]))) ? Math.max(0, Math.min(1, Number(a[3]))) : 1);

    if (shaderMode === 'lilToon') {
      /**
       * lilToon 的分档。
       *
       * ⚠️ 两个必须注意的点（第一版就栽在这里）：
       *   ① GLSL **不允许函数嵌套定义**（和 HLSL 不同）——
       *      所以分档函数 lilToon() 必须作为**顶层函数**独立发出，不能写在 getGradientIrradiance 里。
       *   ② 数学本体是**线性重映射**，不是 smoothstep：
       *      lil_common_functions.hlsl:21
       *          borderMin = saturate(border - blur * 0.5)
       *          borderMax = saturate(border + blur * 0.5)
       *          return (value - borderMin) / saturate(borderMax - borderMin)
       */
      const L = [];
      // 注意：ba3dLilToon() 由 patchToonMaterial 在 <common> 里统一发出 ✓
      //     这里**不能**再定义一次 —— GLSL 重定义会直接编译失败 ✗
      L.push('vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {');
      L.push('\tfloat dotNL = dot( normal, lightDirection );');
      L.push('\tfloat t = clamp( dotNL * 0.5 + 0.5, 0.0, 1.0 );');
      /**
       * ★ 三层阴影各自的 t（_Shadow{,2nd,3rd}NormalStrength · lil_common_frag.hlsl:928-931）
       *
       * lilToon 是 N1/N2/N3 各算一次 shade · 我们这里是同一套公式 · 只是换法线
       * ba3dShadowN1/2/3 默认就是归一化的 normal（全局初始化值 · 而且强度全 1 时根本不会覆盖）
       *   ⇒ 不开这个特性时 t1n === t2n === t3n === t · 行为完全一致 ✓
       */
      L.push('\tfloat t1n = clamp( dot( ba3dShadowN1, lightDirection ) * 0.5 + 0.5, 0.0, 1.0 );');
      L.push('\tfloat t2n = clamp( dot( ba3dShadowN2, lightDirection ) * 0.5 + 0.5, 0.0, 1.0 );');
      L.push('\tfloat t3n = clamp( dot( ba3dShadowN3, lightDirection ) * 0.5 + 0.5, 0.0, 1.0 );');
      L.push('\tvec3 outCol = vec3( 1.0 );');
      /**
       * ★★ **`_UseShadow = 0` ⇒ 整个阴影块跳过**（lilToon 里它是编译期开关 ✓）
       *
       *   ⚠️ 和 `_ShadowReceive = 0` 的区别：
       *     · `_ShadowReceive = 0` ⇒ 不接收**实时阴影贴图** ✗ 但分档阴影**仍在** ✓
       *     · `_UseShadow    = 0` ⇒ **连分档阴影都没有** ✓
       *   ⇒ 用 `if (!__useShadow)` 把后面几条 mix 全跳过 ⇒ outCol 保持 1.0 ✓
       *     （JS 侧生成 ⇒ 关了就**不生成那段 GLSL** ⇒ 连编译都省了 ✓）
       */
      const __useShadow = Math.round(num(cfg.useShadow, 1)) !== 0;
      if (!__useShadow) {
        L.push('\t// _UseShadow = 0 ⇒ 阴影整段跳过（outCol 保持 1.0 ✓）');
      } else {
      // 每层是否接收实时阴影（lil_common_frag.hlsl:946-950）
      //   lns.x *= lerp( 1.0, calculatedShadow, _ShadowReceive )
      L.push('\tfloat t1 = t1n * mix( 1.0, ba3dShadowMaskG, ' + Math.max(0, Math.min(1, num(cfg.shadowReceive, 1))).toFixed(4) + ' );');
      // _ShadowBorderRange 只作用于第一层的过渡带下沿（lil_common_functions.hlsl:21）
      L.push('\tfloat s1 = 1.0 - ba3dLilToonRange( t1, ' + num(cfg.shadowBorder, 0.5).toFixed(4) + ', ' + num(cfg.shadowBlur, 0.1).toFixed(4) + ', ' + Math.max(0, num(cfg.shadowBorderRange, 0)).toFixed(4) + ' );');
      L.push('\toutCol = mix( outCol, ' + col(cfg.shadowColor || [0.82, 0.76, 0.85]) + ', s1 * ' + alphaOf(cfg.shadowColor || [0.82, 0.76, 0.85]).toFixed(4) + ' );');
      L.push('\tfloat t2 = t2n * mix( 1.0, ba3dShadowMaskG, ' + Math.max(0, Math.min(1, num(cfg.shadow2ndReceive, 1))).toFixed(4) + ' );');
      L.push('\tfloat s2 = 1.0 - ba3dLilToon( t2, ' + num(cfg.shadow2ndBorder, 0.15).toFixed(4) + ', ' + num(cfg.shadow2ndBlur, 0.1).toFixed(4) + ' );');
      L.push('\toutCol = mix( outCol, ' + col(cfg.shadow2ndColor || [0.68, 0.66, 0.79]) + ', s2 * ' + alphaOf(cfg.shadow2ndColor || [0.68, 0.66, 0.79]).toFixed(4) + ' );');
      if (cfg.shadow3rdColor) {
        L.push('\tfloat t3 = t3n * mix( 1.0, ba3dShadowMaskG, ' + Math.max(0, Math.min(1, num(cfg.shadow3rdReceive, 1))).toFixed(4) + ' );');
        L.push('\tfloat s3 = 1.0 - ba3dLilToon( t3, ' + num(cfg.shadow3rdBorder, 0.25).toFixed(4) + ', ' + num(cfg.shadow3rdBlur, 0.1).toFixed(4) + ' );');
        L.push('\toutCol = mix( outCol, ' + col(cfg.shadow3rdColor) + ', s3 * ' + alphaOf(cfg.shadow3rdColor).toFixed(4) + ' );');
      }
      }   // ← 结束「useShadow 开」的分支 ✓

      // ⚠️ _ShadowMainStrength 不在这里做 ✗
      //    getGradientIrradiance 定义在 map_fragment 之前 ✗ 那时 diffuseColor（含贴图）还没算出来 ✓
      //    改用片元末尾注入 ✗ 见 patchToonMaterial 里的 ba3dShadowMainStrength ✓
      /**
       * 浓度（_ShadowStrength）
       *
       * ⚠️ 允许 0~2 ✗ 超过 1 时靠 mix 的**外推**继续压暗：
       *     mix( vec3( 1.0 ), outCol, 1.5 ) = 1 + 1.5 * ( outCol - 1 )  ← 比 outCol 更暗
       *
       * 为什么需要 >1：three 的 toon 里环境光是**在分档之外单独加**的
       * （lights_fragment_begin: irradiance = ambient + lightProbe + gradient*directLight）
       * 所以阴影有个「环境光地板」✗ 浓度=1（= 正好等于阴影色）时还不够暗 ✓
       */
      L.push('\treturn mix( vec3( 1.0 ), outCol, ' + Math.max(0, Math.min(2, num(cfg.shadowStrength, 1))).toFixed(4) + ' );');
      L.push('}');
      return L.join('\n');
    }

    /**
     * ★ 阶段 1 ①「N 段 + 每段各自颜色 + 过渡带宽度」
     *
     * bandRamp = null 时走**老公式**（下面那段）· 一个字节都不变 ✓
     * 设置了就换成分档色版本 ✓
     */
    const ramp = Array.isArray(cc.bandRamp) && cc.bandRamp.length >= 2 ? cc.bandRamp : null;
    if (ramp) {
      const soft = Math.max(0, Math.min(1, Number(cc.bandSoft) || 0));
      const C = (i) => {
        const a = ramp[Math.min(i, ramp.length - 1)] || [1, 1, 1];
        return 'vec3(' + Number(a[0]).toFixed(4) + ', ' + Number(a[1]).toFixed(4) + ', ' + Number(a[2]).toFixed(4) + ')';
      };
      return [
        /**
         * ⚠️ GLSL **不允许函数嵌套定义**（和 HLSL 不同 · 第一版就栽在这里 ✓）
         *    ⇒ 查表函数必须是**顶层** · 所以它排在 getGradientIrradiance 前面 ✓
         *
         * 4 个色标把 0~1 分成 3 段 · 每段内线性插值 ✓
         * 段号用 step 选 · 规避 GLSL ES 1.00 不能用变量下标数组的限制 ✓
         */
        'vec3 ba3dRamp4( float u ) {',
        '\tfloat x = clamp( u, 0.0, 1.0 ) * 3.0;',
        '\tvec3 a = mix( ' + C(0) + ', ' + C(1) + ', clamp( x, 0.0, 1.0 ) );',
        '\tvec3 b = mix( ' + C(1) + ', ' + C(2) + ', clamp( x - 1.0, 0.0, 1.0 ) );',
        '\tvec3 c = mix( ' + C(2) + ', ' + C(3) + ', clamp( x - 2.0, 0.0, 1.0 ) );',
        '\treturn mix( mix( a, b, step( 1.0, x ) ), c, step( 2.0, x ) );',
        '}',
        'vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {',
        '\tfloat dotNL = dot( normal, lightDirection );',
        '\tfloat t = clamp( dotNL * 0.5 + 0.5, 0.0, 1.0 );',
        '\tfloat x = t * ' + (steps - 1) + '.0;',
        '\tfloat bi = floor( x );',
        '\tfloat bf = x - bi;',
        '\tfloat s = ' + soft.toFixed(4) + ' > 0.0005 ? smoothstep( 0.0, ' + soft.toFixed(4) + ', bf ) : 0.0;',
        '\tfloat d = max( ' + (steps - 1) + '.0, 1.0 );',
        '\tfloat u0 = bi / d;',
        '\tfloat u1 = min( u0 + 1.0 / d, 1.0 );',
        '\treturn mix( ba3dRamp4( u0 ), ba3dRamp4( u1 ), s );',
        '}',
      ].join('\n');
    }

    return [
      'vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {',
      '\tfloat dotNL = dot( normal, lightDirection );',
      '\tfloat t = clamp( dotNL * 0.5 + 0.5, 0.0, 1.0 );',
      '\tfloat q = floor( t * ' + steps + '.0 ) / max( ' + steps + '.0 - 1.0, 1.0 );',
      '\tq = clamp( q, 0.0, 1.0 );',
      '\tfloat v = ' + dark.toFixed(4) + ' + ' + (1 - dark).toFixed(4) + ' * q;',
      '\treturn mix( ' + tint + ', vec3( 1.0 ), v );',
      '}',
    ].join('\n');
  }

  /**
   * lilToon 的其余特性（阶段 1 的 ②③④）—— 公式照抄源码 ✗ 行号见 LILTOON1.x.md 第六节。
   *
   * 注入点：片元着色器末尾的 `#include <dithering_fragment>` ✓
   *   （MeshToonMaterial 与 MeshBasicMaterial 都有这个 include，末尾注入最稳 ✓）
   *
   * ⚠️ 两个反复踩到的坑：
   *   ① GLSL **不允许函数嵌套定义** → 辅助函数一律作为顶层函数发出 ✓
   *   ② 视图空间法线用 three 的 `normal` 变量 ✓；
   *      视角方向不敢赌 lit 材质的 vViewPosition ✗，改成自己注入一个 varying vBa3dViewPos ✓
   *
   * 颜色/阈值全部烘成字面量 ✗（和 cel 分档一样 ✗ 改参数靠重建材质 ✗），
   * 只有 MatCap 贴图需要 uniform ✓。
   */
  /**
   * MatCap 通用块（1st / 2nd 共用）—— 对应 lil_common_frag.hlsl:1536-1562 / :1604-1630
   *
   * 完整版的公式：
   *     matCapColor  = _MatCapColor * tex2D( _MatCapTex, matUV );
   *     matCapColor.rgb = lerp( matCapColor.rgb, matCapColor.rgb * fd.lightColor, _MatCapEnableLighting );
   *     matCapColor.a   = lerp( matCapColor.a,   matCapColor.a   * fd.shadowmix,  _MatCapShadowMask );
   *     matCapColor.a   = fd.facing < ( _MatCapBackfaceMask - 1.0 ) ? 0.0 : matCapColor.a;
   *     matCapColor.rgb = lerp( matCapColor.rgb, matCapColor.rgb * fd.albedo, _MatCapMainStrength );
   *     fd.col.rgb = lilBlendColor( fd.col.rgb, matCapColor.rgb,
   *                                 _MatCapBlend * matCapColor.a * matCapMask, _MatCapBlendMode );
   *
   * ⚠️ 我们保留了原有的 `mul` 开关（加色 / 乘 albedo ✓）✗
   *    那是 lilToon **lite 版**的形式（:1446）✗ 完整版没有它 ✓
   *    为了不破坏已有配置 ✗ 继续支持 ✓ 默认关 ✓
   *
   * @param M       matcap 配置（1st 或 2nd ✓）
   * @param texUni  贴图 uniform 名
   * @param triCall 顶点色遮罩调用（ba3dMaskR() ✓）
   * @param tag     日志用标签
   */
  /**
   * 镜面高光 / 反射 —— 照抄 lilToon 的 lilCalcSpecular（lil_common_frag.hlsl:1315-1334）
   *
   *   N  = lerp( fd.origN, fd.N, _SpecularNormalStrength );
   *   H  = normalize( fd.V + L );
   *   nh = saturate( dot( N, H ) );
   *   if ( _SpecularToon )
   *       return lilTooningScale( _AAStrength, pow( nh, 1.0 / fd.roughness ), _SpecularBorder, _SpecularBlur );
   *
   * 以及混合（:1348）：
   *   fd.col.rgb = lilBlendColor( fd.col.rgb, reflectionColor.rgb * lightColorSpc,
   *                               reflectCol * reflectionColor.a, _ReflectionBlendMode );
   *
   * roughness 的来源（lil_common.hlsl:200 + lil_common_frag.hlsl:1437-1438）：
   *   perceptualRoughness = 1.0 - _Smoothness
   *   roughness           = perceptualRoughness * perceptualRoughness
   *
   * ⚠️ 全部在**视图空间**算（three 的 normal / vViewPosition / directionalLights 都是视图空间 ✓）：
   *   fd.N     → normal（或已算好的 ba3dN ✓）
   *   fd.origN → nonPerturbedNormal（或 ba3dNrmOrig ✓）
   *   fd.V     → normalize( vBa3dViewPos )  = 表面→相机 ✓
   *   fd.L     → directionalLights[0].direction = 表面→灯 ✓
   *   fd.lightColor → ba3dLightCol ✓
   *
   * ⚠️⚠️ **必须特判 roughness → 0**：
   *   _Smoothness = 1（默认）⇒ roughness = 0 ⇒ HLSL 里 pow( nh, 1.0/0.0 ) = pow( nh, +INF )
   *   HLSL: pow( x, +INF ) 对 x<1 返回 0、x>=1 返回 1（等价于 step(1, nh) ✓）
   *   GLSL: pow 的指数为无穷是**未定义行为** ⇒ 这里显式写成「nh >= 1 ? 1 : 0」 ✓
   *
   * ⚠️ 未实现的部分（有意）：
   *   · _ReflectionCubeTex 环境立方体贴图 —— Unity 靠 Reflection Probe · 查看器里没有
   *     ⇒ 只做镜面高光那一路（可见的那部分 ✓）
   *   · 非卡通路径的完整 GGX —— _SpecularToon 默认 1 ⇒ 预设都走卡通路 ·
   *     这里给非卡通一个足够接近的近似（不做几何项/菲涅尔 ✓）
   */
  function lilSpecularGLSL(R, tag) {
    const num = (v, d) => (v === undefined || v === null || !isFinite(Number(v)) ? d : Number(v));
    const cl = (v, d) => Math.max(0, Math.min(1, num(v, d)));
    if (!R || !R.use) return '';
    const aa = cl(R.aaStrength, 1);
    const toon = R.toon !== false;
    const border = cl(R.border, 0.5);
    const blur = cl(R.blur, 0);
    const nstr = cl(R.normalStrength, 1);
    const smooth = cl(R.smoothness, 1);
    const reflect = cl(R.reflectance, 0.04);
    const metal = cl(R.metallic, 0);
    const bmode = Math.round(Math.max(0, Math.min(3, num(R.blendMode, 1))));
    const c = Array.isArray(R.color) ? R.color : [1, 1, 1, 1];
    const cr = num(c[0], 1).toFixed(4), cg = num(c[1], 1).toFixed(4), cb = num(c[2], 1).toFixed(4);
    const ca = cl(c[3], 1);
    // roughness = (1 - smoothness)^2
    const pr = 1 - smooth;
    const rough = pr * pr;
    const invRough = rough > 1e-3 ? (1 / rough).toFixed(4) : '0.0';
    const L = [];
    L.push('\t{');
    L.push('\t\t// _SpecularNormalStrength：在 origN 与 N 之间插值');
    L.push('\t\tvec3 ba3dSpN = normalize( mix( ba3dNrmOrig, ba3dN, ' + nstr.toFixed(4) + ' ) );');
    L.push('\t\t// 半角向量与 nh');
    L.push('\t\tvec3 ba3dSpH = normalize( ba3dV + ba3dL );');
    L.push('\t\tfloat ba3dSpNH = clamp( dot( ba3dSpN, ba3dSpH ), 0.0, 1.0 );');
    if (toon) {
      if (rough > 1e-3) {
        L.push('\t\tfloat ba3dSpTerm = pow( ba3dSpNH, ' + invRough + ' );');
      } else {
        // ⚠️ roughness = 0 ⇒ HLSL 的 pow( nh, +INF ) ⇒ 显式写出来（GLSL 里 pow 无穷指数未定义 ✓）
        L.push('\t\t// roughness = 0（_Smoothness = 1）⇒ 等价于 HLSL 的 pow( nh, +INF ) = step(1, nh)');
        L.push('\t\tfloat ba3dSpTerm = ba3dSpNH >= 1.0 ? 1.0 : 0.0;');
      }
      // lilTooningNoSaturateScale(aa, v, border, blur) = (v-lo)/saturate(hi-lo + fwidth(v)*aa)
      L.push('\t\tfloat ba3dSpLo = clamp( ' + border.toFixed(4) + ' - ' + blur.toFixed(4) + ' * 0.5, 0.0, 1.0 );');
      L.push('\t\tfloat ba3dSpHi = clamp( ' + border.toFixed(4) + ' + ' + blur.toFixed(4) + ' * 0.5, 0.0, 1.0 );');
      L.push('\t\tfloat ba3dSpCol2 = clamp( ( ba3dSpTerm - ba3dSpLo ) / max( 1e-4, ba3dSpHi - ba3dSpLo + fwidth( ba3dSpTerm ) * ' + aa.toFixed(4) + ' ), 0.0, 1.0 );');
    } else {
      // 非卡通：粗糙度越大越糊（近似 Blinn 的幂次 ✓）
      L.push('\t\tfloat ba3dSpTerm = pow( ba3dSpNH, ' + (rough > 1e-3 ? invRough : '1024.0') + ' );');
      L.push('\t\tfloat ba3dSpCol2 = ba3dSpTerm * ' + (reflect + metal * (1 - reflect)).toFixed(4) + ';');
    }
    L.push('\t\tvec3 ba3dSpColor = vec3( ' + cr + ', ' + cg + ', ' + cb + ' ) * ba3dLightCol;');
    L.push('\t\tgl_FragColor.rgb = ba3dBlend( gl_FragColor.rgb, ba3dSpColor, clamp( ba3dSpCol2 * ' + ca.toFixed(4) + ', 0.0, 1.0 ), ' + bmode + 'u );');
    L.push('\t}');
    const out = L.join('\n');
    if (tag) console.debug('[reflection] ' + tag + '：toon=' + (toon ? 1 : 0) + ' border=' + border + ' blur=' + blur
      + ' normalStrength=' + nstr + ' smoothness=' + smooth + ' roughness=' + rough.toFixed(4)
      + ' reflectance=' + reflect + ' metallic=' + metal + ' blendMode=' + bmode + ' aa=' + aa);
    return out;
  }
  function lilMatCapGLSL(M, texUni, triCall, tag, nrmVar) {
    // nrmVar：这个 MatCap 该用哪条法线（ba3dNCap / ba3dNCap2 · 见 lilShaderGLSL 前导）
    const num = (v, d) => (v === undefined || v === null || !isFinite(Number(v)) ? d : Number(v));
    if (!M || !M.url || num(M.blend, 0) === 0) return '';
    const bs = Math.max(0, Math.min(1, num(M.blend, 1)));
    const el = Math.max(0, Math.min(1, num(M.enableLighting, 1)));
    const sm = Math.max(0, Math.min(1, num(M.shadowMask, 0)));
    const ms = Math.max(0, Math.min(1, num(M.mainStrength, 0)));
    const bmode = Math.round(Math.max(0, Math.min(3, num(M.blendMode, 0))));
    const bfm = Math.round(Math.max(0, Math.min(2, num(M.backfaceMask, 1))));
    const c = Array.isArray(M.color) ? M.color : [1, 1, 1, 1];
    const tint = 'vec3(' + [0, 1, 2].map((i) => num(c[i], 1).toFixed(4)).join(', ') + ')';
    const ca = num(c[3], 1);
    const L = [];
    L.push('\t{');
    /**
     * _MatCapLod → texture2D 的第 3 个参数（LOD bias · GLSL ES 3.0 的片元着色器支持）
     * _MatCapCustomNormal + _MatCapBumpMap + _MatCapBumpScale（lil_common_frag.hlsl:1526）
     *   if (_MatCapCustomNormal) {
     *     normalmap = lilUnpackNormalScale( SAMPLE(_MatCapBumpMap), _MatCapBumpScale );
     *     N = normalize( mul( normalmap, fd.TBN ) );   ← **整个替换 N**
     *   }
     */
    const lodV = num(M.lod, 0);
    const cnUni = (texUni === 'ba3dMatCap2nd') ? 'ba3dMatCap2ndBumpMap' : 'ba3dMatCapBumpMap';
    const useCN = !!M.customNormal && !!M.bumpMap;
    L.push('\t\tvec3 ba3dCapN = ' + (nrmVar || 'ba3dNCap') + ';');
    if (useCN) {
      const cbs = Math.max(-10, Math.min(10, num(M.bumpScale, 1))).toFixed(4);
      L.push('\t\t{');
      L.push('\t\t\tvec3 ba3dCapBn = texture2D( ' + cnUni + ', vBa3dUv ).xyz * 2.0 - 1.0;');
      L.push('\t\t\tba3dCapBn.xy *= ' + cbs + ';');
      L.push('\t\t\tba3dCapN = normalize( tbn * normalize( ba3dCapBn ) );');
      L.push('\t\t}');
    }
    const lodArg = (Math.abs(lodV) > 1e-6) ? (', ' + lodV.toFixed(4)) : '';
    /**
     * ★ MatCap 的 UV —— 照抄 lilCalcMatCapUV（lil_common_functions.hlsl:550）
     *
     *   float3 normalVD = ...;                                       // 视线方向
     *   normalVD = lilIsPerspective() && matcapPerspective ? normalVD : lilCameraDirection();
     *   float3 bitangentVD = zRotCancel ? float3(0,1,0) : LIL_MATRIX_V._m10_m11_m12;
     *   bitangentVD = lilOrthoNormalize(bitangentVD, normalVD);
     *   float3 tangentVD = cross(normalVD, bitangentVD);
     *   float3x3 tbnVD = float3x3(tangentVD, bitangentVD, normalVD);
     *   float2 uvMat = mul(tbnVD, normalWS).xy;                      // ← 三个点积
     *   uvMat = uvMat * 0.5 + 0.5;
     *
     * ⚠️ HLSL 的 mul(float3x3(a,b,c), v) 是**行点积** ⇒ (dot(a,v), dot(b,v), dot(c,v))
     *    GLSL 的 mat3(a,b,c) * v 是**列组合** ⇒ 两者不同 ✗ 直接写两个 dot 最不容易错 ✓
     *
     * ⚠️ 全部在**世界空间**算：ba3dCapN 是视图空间法线 ⇒ inverseTransformDirection 转回世界 ✓
     *    （lilToon 那边参数名叫 normalWS ✗ 但实际是对象空间 ✗ 我们统一用世界空间等价 ✓）
     *
     * ⚠️ lilCameraDirection()（非透视时的固定方向）在 Unity 是 V 矩阵第三行
     *    ⇒ three 里对应 viewMatrix[2].xyz（相机**后方**轴 ✓）
     *
     * 旧实现是 ( viewMatrix * vec4(viewNormal,0) ).xy —— 把已经是视图空间的法线
     * 又乘了一次 viewMatrix ⇒ 等价于「世界法线的 XY」✗ 不是 lilToon 的那套基底 ✓
     */
    const zrcV = Math.max(0, Math.min(1, num(M.zRotCancel, 1))).toFixed(4);
    const prpV = Math.max(0, Math.min(1, num(M.perspective, 1))).toFixed(4);
    L.push('\t\tvec3 ba3dCapNw = inverseTransformDirection( normalize( ba3dCapN ), viewMatrix );');
    // ① 视线方向：透视修正开 ⇒ 逐像素（相机→片元）；关 ⇒ 固定相机朝向
    L.push('\t\tvec3 ba3dNvd = ( ' + prpV + ' > 0.5 && !isOrthographic )'
      + ' ? normalize( cameraPosition - vBa3dPositionWS )'
      + ' : normalize( vec3( viewMatrix[ 2 ] ) );');
    // ② 副切线：zRotCancel 开 ⇒ 世界 up；关 ⇒ 相机矩阵第二行
    L.push('\t\tvec3 ba3dBtd = ' + zrcV + ' > 0.5 ? vec3( 0.0, 1.0, 0.0 ) : normalize( vec3( viewMatrix[ 1 ] ) );');
    // ③ lilOrthoNormalize：去掉副切线里沿视线方向的分量
    L.push('\t\tba3dBtd = normalize( ba3dBtd - ba3dNvd * dot( ba3dNvd, ba3dBtd ) );');
    L.push('\t\tvec3 ba3dTgd = cross( ba3dNvd, ba3dBtd );');
    // ④ mul(tbnVD, normalWS).xy ⇒ (dot(tangent,N), dot(bitangent,N))
    L.push('\t\tvec2 uvMat = vec2( dot( ba3dTgd, ba3dCapNw ), dot( ba3dBtd, ba3dCapNw ) ) * 0.5 + 0.5;');
    L.push('\t\tvec3 matcap = ' + tint + ' * texture2D( ' + texUni + ', uvMat' + lodArg + ' ).rgb;');
    L.push('\t\tvec3 ba3dCapMul = mix( vec3( 1.0 ), ba3dLightCol, ' + el.toFixed(4) + ' );');
    L.push('\t\tvec3 ba3dCapSrc = ' + (M.mul ? 'gl_FragColor.rgb * matcap' : 'gl_FragColor.rgb + matcap') + ' * ba3dCapMul;');
    if (ms > 0) {
      // _MatCapMainStrength：matCapColor.rgb = lerp( rgb, rgb * albedo, mainStrength )
      L.push('\t\tba3dCapSrc = mix( ba3dCapSrc, ba3dCapSrc * diffuseColor.rgb, ' + ms.toFixed(4) + ' );');
    }
    L.push('\t\tfloat ba3dCapShadow = mix( 1.0, ba3dShadowMaskG, ' + sm.toFixed(4) + ' );');
    const maskUni = (texUni === 'ba3dMatCap2nd') ? 'ba3dMatCap2ndBlendMask' : 'ba3dMatCapBlendMask';
    const hasMask = !!M.blendMask;
    if (hasMask) {
      // _MatCapBlendMask：取 **RGB** ✗ 逐通道混合（lil_common_frag.hlsl:1557 / :1625）
      L.push('\t\tvec3 ba3dCapMask = texture2D( ' + maskUni + ', vBa3dUv ).rgb;');
    }
    let aExpr = bs.toFixed(4) + ' * ' + ca.toFixed(4) + ' * ' + triCall + ' * ba3dCapShadow';
    if (hasMask) aExpr = 'vec3( ' + aExpr + ' ) * ba3dCapMask';
    const __fn = hasMask ? 'ba3dBlend3' : 'ba3dBlend';
    const __zero = hasMask ? 'vec3( 0.0 )' : '0.0';
    L.push('\t\tgl_FragColor.rgb = ' + __fn + '( gl_FragColor.rgb, ba3dCapSrc, ' +
      (bfm === 0 ? aExpr
        : bfm === 1 ? '( gl_FrontFacing ? ' + aExpr + ' : ' + __zero + ' )'
        : '( gl_FrontFacing ? ' + __zero + ' : ' + aExpr + ' )') + ', ' + bmode + 'u );');
    L.push('\t}');
    const out = L.join('\n');
    if (tag) console.debug('[matcap] ' + tag + '：blend=' + bs + ' mode=' + bmode + ' enableLighting=' + el
      + ' shadowMask=' + sm + ' mainStrength=' + ms + ' backfaceMask=' + bfm
      + ' blendMask=' + (M.blendMask ? '有' : '无') + ' 采遮罩=' + (hasMask ? '是' : '否')
      + ' lod=' + lodV + ' 自定法线=' + (useCN ? '有' : '无') + ' vrParallax=' + num(M.vrParallax, 0) + '（非VR无效）'
      + ' zRotCancel=' + num(M.zRotCancel, 1) + ' perspective=' + num(M.perspective, 1));
    return out;
  }

  /**
   * 自发光一层的 GLSL（1st / 2nd 共用 ✗ lil_common_frag.hlsl:1815 / 1899 ✓）。
   *
   * lilToon 的两层完全同构 ✗ 参数只差 2nd 后缀 ✗ 所以抽成一个生成器 ✓
   *
   * 采样语义：（lil_common_frag.hlsl:1829-1843 / 1913-1927 ✓）
   *   emissionColor  = _EmissionColor          ← 含 alpha
   *   emissionColor *= texture2D(_EmissionMap)  ← rgb 调制
   *   emissionColor *= texture2D(_EmissionBlendMask)  ← **RGBA 整体乘**（rgb 调色 ✗ a 调权重 ✓）
   *   权重 = _EmissionBlend * emissionColor.a * fd.triMask.b（顶点色 B ✓）
   *
   * ⚠️ 遮罩的采样必须在 if (tex) **外面** ✗ 否则没贴图时采样不生成 ✗ 但权重引用了它 ✓
   *    （这个坑踩过一次：'ba3dEmiMask' : undeclared identifier ✓）
   */
  function lilEmissionGLSL(E, texUni, maskUni, varName, tag) {
    // ⚠️ 局部 helper ✗ 外部（lilShaderGLSL / lilMatCapGLSL …）的 num/v3 在这里看不到
    //    踩过五次同一类：hex · capRe · rgb2h · num（patchToonMaterial）· num+v3（这里）
    const num = (v, d) => (v === undefined || v === null || !isFinite(Number(v)) ? d : Number(v));
    const v3 = (arr, d) => 'vec3(' + [0, 1, 2].map((i) => num(arr && arr[i], d[i]).toFixed(4)).join(', ') + ')';
    /**
     * ⚠️ 两个门槛都要判 ✗ 对应 lilToon 的 _UseEmission 与 _EmissionBlend：
     *     · _UseEmission 是总开关（面板的「启用」滑杆 ✓）
     *     · _EmissionBlend = 0 时也不显示 ✓
     *   之前只判了 blend ✗ 所以「启用」那条滑杆是坏的（调了没反应 ✓）
     *   1st / 2nd 各自独立 ✗ lilToon 里两层就是两个开关 ✓
     */
    if (!E || !E.use || num(E.blend, 0) === 0) return null;
    const bs = Math.max(0, Math.min(1, num(E.blend, 1)));
    const L2 = [];
    L2.push('\t{');
    L2.push('\t\tvec3 ' + varName + ' = ' + v3(E.color, [1, 1, 1]) + ';');
    if (E.tex) {
      L2.push('\t\t' + varName + ' *= texture2D( ' + texUni + ', vBa3dUv ).rgb;');
    }
    let maskVar = null;
    if (E.blendMask) {
      maskVar = varName + 'Mask';
      L2.push('\t\tvec4 ' + maskVar + ' = texture2D( ' + maskUni + ', vBa3dUv );');
      L2.push('\t\t' + varName + ' *= ' + maskVar + '.rgb;');
    }
    const alpha = maskVar ? (' * ' + maskVar + '.a') : '';
    L2.push('\t\tgl_FragColor.rgb = ba3dBlend( gl_FragColor.rgb, ' + varName + ', '
      + bs.toFixed(4) + ' * ba3dMaskB()' + alpha + ', ' + Math.round(num(E.blendMode, 0)) + 'u );');
    L2.push('\t}');
    if (tag) console.debug('[emission] ' + tag + '：blend=' + bs.toFixed(3) + ' mode=' + Math.round(num(E.blendMode, 0))
      + ' tex=' + (E.tex ? '有' : '无') + ' mask=' + (E.blendMask ? '有' : '无') + ' uvMode=' + Math.round(num(E.uvMode, 0)));
    return L2;
  }

  function lilShaderGLSL(cfgIn) {
    // 支持按材质覆盖：不传就用全局配置
    const cfg = cfgIn || lilCfg;
    const R = cfg.rim, M = cfg.matcap, E = cfg.emission, B = cfg.backlight;
    const num = (v, d) => (v === undefined || v === null || !isFinite(Number(v)) ? d : Number(v));
    const v3 = (a, d) => 'vec3(' + [0, 1, 2].map((i) => Number((a && a[i] !== undefined ? a[i] : d[i])).toFixed(4)).join(', ') + ')';
    // 四项全关 → 不生成任何东西（避免白白引用 normal / directionalLights）
    /**
     * ⚠️ 这道闸门必须把**所有**装饰层都算进来 ✗ 之前漏了 emission2nd ✓
     *    症状：1st 关掉时 2nd 完全没效果 ⇒ 但 lilToon 里两层是**独立**的 ✓
     *    另外 emission 要判 use ✗ 否则「启用」滑杆调 0 也关不掉 ✓
     *    （rim / matcap / backlight 没有 use 字段 ✗ 它们的开关就是 blend ✓）
     */
    const E2 = cfg.emission2nd;
    const anyOn = (R && num(R.blend, 0) !== 0) || (M && M.url && num(M.blend, 0) !== 0)
      || (cfg.matcap2nd && cfg.matcap2nd.url && num(cfg.matcap2nd.blend, 0) !== 0)
      || (E && E.use && num(E.blend, 0) !== 0)
      || (E2 && E2.use && num(E2.blend, 0) !== 0)
      || (B && num(B.blend, 0) !== 0)
      || (cfg.reflection && cfg.reflection.use);

    if (!anyOn) return '';

    const L = [];

    L.push('');
    L.push('// ===== lilToon 风格（阶段 1）=====');
    L.push('{');
    L.push('\tvec3 ba3dN = normalize( normal );');
    /**
     * ★ 各效果各自的法线（lilToon 的 fd.N / fd.origN + per-feature NormalStrength）
     *
     * lilToon 里每个效果都会做一次：
     *   N = lerp( fd.origN, fd.N, _XXXNormalStrength )
     *     Backlight :1114 · MatCap :1398 · Rim :1538 · Shadow :854-857
     *
     * fd.origN = 几何法线 · fd.N = 法线贴图之后的
     *   ⇒ three 里对应：nonPerturbedNormal · normal
     *     （nonPerturbedNormal 是 three 的 normal_fragment_begin 无条件声明的 · 就是 origN）
     *
     * 0 = 这个效果完全按几何法线算（不受法线贴图影响）
     * 1 = 完全受法线贴图影响
     */
    L.push('\tvec3 ba3dNrmOrig = normalize( nonPerturbedNormal );');
    /**
     * ⚠️ 这 4 个强度必须在 **JS 侧先算成字符串** ✗ 不能把 JS 表达式拼进 GLSL ✓
     *    踩过一次：写成 R('B && B.normalStrength', 1) 返回的是一段 JS 源码 ✗
     *    结果着色器里出现 `Math.max( 0, Math.min( 1, num( B && B.normalStrength, 1 ) ) )`
     *    ⇒ 报 'Math' : undeclared identifier / 'toFixed' : invalid method ✓
     */
    const nsBack = Math.max(0, Math.min(1, num(B && B.normalStrength, 1))).toFixed(4);
    const nsCap  = Math.max(0, Math.min(1, num(M && M.normalStrength, 1))).toFixed(4);
    const nsCap2 = Math.max(0, Math.min(1, num(cfg.matcap2nd && cfg.matcap2nd.normalStrength, 1))).toFixed(4);
    const nsRim  = Math.max(0, Math.min(1, num(R && R.normalStrength, 1))).toFixed(4);
    L.push('\tvec3 ba3dNBack = normalize( mix( ba3dNrmOrig, ba3dN, ' + nsBack + ' ) );');
    L.push('\tvec3 ba3dNCap = normalize( mix( ba3dNrmOrig, ba3dN, ' + nsCap + ' ) );');
    L.push('\tvec3 ba3dNCap2 = normalize( mix( ba3dNrmOrig, ba3dN, ' + nsCap2 + ' ) );');
    L.push('\tvec3 ba3dNRim = normalize( mix( ba3dNrmOrig, ba3dN, ' + nsRim + ' ) );');
    L.push('\tvec3 ba3dV = normalize( vBa3dViewPos );');
    L.push('\tvec3 ba3dL = normalize( directionalLights[ 0 ].direction );');
    L.push('\tvec3 ba3dLightCol = directionalLights[ 0 ].color;');
    L.push('\tfloat ba3dNL = dot( ba3dN, ba3dL );');

    /**
     * ⚠️ 各装饰层的**执行顺序要和 lilToon 一致**：
     *   lil_pass_forward_normal.hlsl:401 / 435 / 440 / 447 / 462 / 468
     *     Backlight → MatCap → MatCap2nd → Rim → Emission1st → Emission2nd
     *   （前面还有 352 / 360 的 Main2nd / Main3rd ✓）
     * 顺序错了在「同区域多个效果叠加」时观感会不同 ✗ 尤其 Backlight 是加色 ✓
     */
    // —— 背光（lil_common_frag.hlsl:1233 lilBacklight）——
    if (B && num(B.blend, 0) !== 0) {
      L.push('\t{');
      L.push('\t\tvec3 N = ba3dNBack;');
      L.push('\t\tvec3 V = normalize( vBa3dViewPos );');
      L.push('\t\tfloat hl = dot( ba3dL, V );');
      L.push('\t\tfloat factor = pow( saturate( -hl * 0.5 + 0.5 ), ' + Math.max(0.001, num(B.directivity, 5)).toFixed(4) + ' );');
      L.push('\t\tvec3 Ldir = normalize( -V * ' + num(B.viewStrength, 1).toFixed(4) + ' + ba3dL );');
      L.push('\t\tfloat ln = dot( Ldir, N ) * 0.5 + 0.5;');
      L.push('\t\tln = ba3dLilToon( ln, ' + num(B.border, 0.35).toFixed(4) + ', ' + num(B.blur, 0.05).toFixed(4) + ' );');
      L.push('\t\tgl_FragColor.rgb += saturate( factor * ln ) * ' + v3(B.color, [1, 1, 1]) + ' * ba3dLightCol;');
      L.push('\t}');
    }

    // —— MatCap / MatCap 2nd（lil_common_frag.hlsl:1536-1562 / :1604-1630）——
    //   顺序：MatCap → MatCap2nd（和 lil_pass_forward_normal.hlsl:435 / 440 一致 ✓）
    //   乘顶点色 R 通道遮罩（lilToon: fd.triMask.r ✗）
    {
      /**
       * —— 反射 / 镜面高光（lil_pass_forward_normal.hlsl:425「// Reflection」）——
       *
       * ⚠️ 顺序：Reflection 在 Backlight **之后**、MatCap **之前** ✓
       *    完整装饰层顺序（lil_pass_forward_normal.hlsl:325-460）：
       *      Anisotropy → AudioLink → Main2nd → Main3rd → Shadow → Backlight
       *      → **Reflection** → MatCap → MatCap2nd → Rim → Glitter → Emission1st → Emission2nd
       */
      const __spc = lilSpecularGLSL(cfg.reflection, '1st');
      if (__spc) L.push(__spc);
      const __cap1 = lilMatCapGLSL(M, 'ba3dMatCap', 'ba3dMaskR()', '1st', 'ba3dNCap');
      if (__cap1) L.push(__cap1);
      const __cap2 = lilMatCapGLSL(cfg.matcap2nd, 'ba3dMatCap2nd', 'ba3dMaskR()', '2nd', 'ba3dNCap2');
      if (__cap2) L.push(__cap2);
    }

    // —— Rim（lil_common_frag.hlsl:1643 lilGetRim）——
    if (R && num(R.blend, 0) !== 0) {
      const bs = Math.max(0, Math.min(1, num(R.blend, 1)));
      L.push('\t{');
      L.push('\t\tvec3 N = ba3dNRim;');
      L.push('\t\tvec3 V = normalize( vBa3dViewPos );');
      L.push('\t\tfloat nvabs = abs( dot( N, V ) );');
      L.push('\t\tfloat lnRaw = dot( ba3dL, N ) * 0.5 + 0.5;');
      L.push('\t\tfloat lnDir = saturate( ( lnRaw + ' + num(R.dirRange, 0).toFixed(4) + ' ) / ( 1.0 + ' + num(R.dirRange, 0).toFixed(4) + ' ) );');
      L.push('\t\tfloat lnIndir = saturate( ( 1.0 - lnRaw + ' + num(R.indirRange, 0).toFixed(4) + ' ) / ( 1.0 + ' + num(R.indirRange, 0).toFixed(4) + ' ) );');
      L.push('\t\tfloat rim = pow( saturate( 1.0 - nvabs ), ' + num(R.fresnelPower, 1).toFixed(4) + ' );');
      L.push('\t\tfloat rimDir = mix( rim, rim * lnDir, ' + num(R.dirStrength, 0).toFixed(4) + ' );');
      L.push('\t\tfloat rimIndir = rim * lnIndir * ' + num(R.dirStrength, 0).toFixed(4) + ';');
      L.push('\t\trimDir = ba3dLilToon( rimDir, ' + num(R.border, 0.5).toFixed(4) + ', ' + num(R.blur, 0.65).toFixed(4) + ' );');
      L.push('\t\trimIndir = ba3dLilToon( rimIndir, ' + num(R.indirBorder, 0.5).toFixed(4) + ', ' + num(R.indirBlur, 0.1).toFixed(4) + ' );');
      L.push('\t\tvec3 ba3dRimMul = mix( vec3( 1.0 ), ba3dLightCol, ' + Math.max(0, Math.min(1, num(R.enableLighting, 1))).toFixed(4) + ' );');
      // 乘顶点色 G 通道遮罩（lilToon: fd.triMask.g ✗）
      L.push('\t\tfloat ba3dRimMask = ba3dMaskG();');
      // _RimShadowMask（lil_common_frag.hlsl:1680）
      //   rimDir = lerp( rimDir, rimDir * fd.shadowmix, _RimShadowMask )
      // fd.shadowmix 就是第一层阴影分档值 ✗ 我们用 ba3dShadowMaskG ✓
      L.push('\t\tfloat ba3dRimShadow = mix( 1.0, ba3dShadowMaskG, ' + num(R.shadowMask, 0).toFixed(4) + ' );');
      L.push('\t\tgl_FragColor.rgb = ba3dBlend( gl_FragColor.rgb, ' + v3(R.color, [1, 1, 1]) + ' * ba3dRimMul, rimDir * ' + bs.toFixed(4) + ' * ba3dRimMask * ba3dRimShadow, ' + Math.round(num(R.blendMode, 1)) + 'u );');
      L.push('\t\tgl_FragColor.rgb = ba3dBlend( gl_FragColor.rgb, ' + v3(R.indirColor, [1, 1, 1]) + ' * ba3dRimMul, rimIndir * ' + bs.toFixed(4) + ' * ba3dRimMask * ba3dRimShadow, ' + Math.round(num(R.blendMode, 1)) + 'u );');
      L.push('\t}');
    }

    // —— 自发光 1st + 2nd（lil_common_frag.hlsl:1815 / 1899 ✓）——
    //   顺序：Emission1st → Emission2nd（lil_pass_forward_normal.hlsl:462 / 468 ✓）
    {
      const __emi1 = lilEmissionGLSL(E, 'ba3dEmissionMap', 'ba3dEmissionBlendMask', 'ba3dEmi', '1st');
      if (__emi1) for (const ln of __emi1) L.push(ln);
    }
    {
      const __emi2 = lilEmissionGLSL(cfg.emission2nd, 'ba3dEmission2ndMap', 'ba3dEmission2ndBlendMask', 'ba3dEmi2', '2nd');
      if (__emi2) for (const ln of __emi2) L.push(ln);
    }

    L.push('}');
    const out = L.join('\n');
    /**
     * ⚠️ HLSL-ism 检查 —— 这个坑已经踩过一次（导致整个片元编译失败、模型变剪影）：
     * lilToon 源码是 HLSL ✗ 而 three 用的是 GLSL ✗ 两者函数名有差异。
     *   lerp      → GLSL 是 mix（three 只定义了标量版 lerp，向量版没有重载）
     *   frac      → fract
     *   atan2     → atan(y, x)
     *   tex2D     → texture2D
     *   mul(m, v) → m * v
     *   saturate  three 有定义 ✓（clamp 的宏）
     */
    const HLSL_ISMS = ['lerp(', 'frac(', 'atan2(', 'tex2D(', 'mul('];
    for (const bad of HLSL_ISMS) {
      if (out.indexOf(bad) >= 0) console.error('[lilToon] GLSL 里出现 HLSL 写法 "' + bad + '"，会导致着色器编译失败！');
    }
    return out;
  }

  /**
   * Dissolve（lil_common_functions.hlsl:626 lilCalcDissolve / :642 WithNoise）
   *
   * 返回两段：
   *   before —— 注入到 **#include <alphatest_fragment> 之前**
   *             算遮罩 ✗ 乘到 diffuseColor.a ✗ 并把边缘因子存进全局 ba3dDissolveEdge ✓
   *   after  —— 注入到末尾（dithering_fragment ✓）
   *             gl_FragColor.rgb += _DissolveColor.rgb * dissolveAlpha
   *             （lil_common_frag.hlsl:1962 ✗ 加色 ✗ 不是 mix ✓）
   *
   * 参数全部烘成字面量（和别处一致 ✗ 改参数靠重建材质 ✓）✗
   * 只有遮罩/噪声贴图需要 uniform ✓
   */
  /**
   * 主色层 2nd / 3rd 的 GLSL（lil_common_frag.hlsl:725 lilGetMain2nd / :757 lilGetMain3rd）
   *
   * 返回两段：
   *   before —— 注入到 **#include <lights_fragment_begin> 之前**
   *             算 color2nd ✗ 用 a * enableLighting 的权重混进 diffuseColor.rgb
   *             并把 color2nd 存进全局 ba3dColor2nd（光照后还要用 ✓）
   *   after  —— 注入到末尾（dithering_fragment ✓）
   *             用 a * (1 - enableLighting) 的权重再混一次 ✗ 即「不受光照的那部分」✓
   *
   * ⚠️ 注入点必须在 lights_fragment_begin **之前** ✗
   *    因为 normal 是在 normal_fragment_begin 里声明的 ✗ 而它早于 lights ✓
   *    同时它是改 diffuseColor.rgb 的最后机会（albedo 会在 lights 里被用掉 ✓）
   */
  /**
   * @param cfgIn  该材质合并后的 lilCfg
   * @param which  '2nd' | '3rd'
   * @param alphaRender  该材质当前是不是「非 Opaque」渲染模式（Cutout 或 Transparent）
   *        对应 lilToon 的 `#if LIL_RENDER != 0`（lil_common_frag.hlsl:798）
   *        只有这时 AlphaMode 才生效
   *        ⚠️ three 里没有 LIL_RENDER ⇒ 由调用方看 mat.alphaTest / mat.transparent 得出
   */
  function lilMainLayerGLSL(cfgIn, which, alphaRender) {
    const cfg = cfgIn || lilCfg;
    const Lc = cfg[which === '3rd' ? 'main3rd' : 'main2nd'];
    /**
     * ⚠️⚠️ **无条件**打一行「这一层到底有没有开」
     *
     * 之前的 `[decal]` 日志是在 `hasTex && isDecal` **里面**打的 ⇒
     * 当层没启用 / 没贴图时**一行都不打** ⇒ 反而看不出问题在哪 ✓
     * （实测：用户切材质后日志里连 [decal] 都没了 ⇒ 说明那一层是关的 ✓）
     *
     * ⇒ 现在每次都打 ✗ 一眼看出「是层没开」还是「开了但没效果」 ✓
     */
    if (typeof console !== 'undefined') {
      console.debug('[layer] ' + which
        + ' | use=' + (Lc && Lc.use ? 1 : 0)
        + ' tex=' + (Lc && Lc.tex ? '有' : '**无**')
        + ' isDecal=' + (Lc && Lc.isDecal ? 1 : 0)
        + ' uvMode=' + (Lc ? Math.round(Number(Lc.uvMode) || 0) : '-')
        + ' blendMode=' + (Lc ? Math.round(Number(Lc.blendMode) || 0) : '-')
        + ' enableLighting=' + (Lc ? Number(Lc.enableLighting) : '-'));
    }
    if (!Lc || !Lc.use) return null;
    const num = (v, d) => (v === undefined || v === null || !isFinite(Number(v)) ? d : Number(v));
    const v3 = (a, d) => 'vec3(' + [0, 1, 2].map((i) => num(a && a[i], d[i]).toFixed(4)).join(', ') + ')';
    const alpha = (a) => num(a && a[3], 1);
    const el = Math.max(0, Math.min(1, num(Lc.enableLighting, 1)));
    const bm = Math.round(Math.max(0, Math.min(3, num(Lc.blendMode, 0))));
    const uvMode = Math.round(num(Lc.uvMode, 0));
    const cull = Math.round(Math.max(0, Math.min(2, num(Lc.cull, 0))));
    const hasTex = !!Lc.tex;
    const hasMask = !!Lc.blendMask;
    const varName = which === '3rd' ? 'ba3dColor3rd' : 'ba3dColor2nd';
    const texUni = which === '3rd' ? 'ba3dMain3rdTex' : 'ba3dMain2ndTex';
    const maskUni = which === '3rd' ? 'ba3dMain3rdBlendMask' : 'ba3dMain2ndBlendMask';

    // UV 表达式
    let uvExpr = 'vBa3dUv';
    if (uvMode === 4) {
      // 视角球面 UV（和 MatCap 同一套：lilCalcMatCapUV）
      uvExpr = '( viewMatrix * vec4( normalize( normal ), 0.0 ) ).xy * 0.5 + 0.5';
    } else if (uvMode === 1) {
      uvExpr = 'vBa3dUv1';   // ★ UV1（Decal 通常用这个 ✓）
    } else if (uvMode >= 2 && uvMode <= 3) {
      console.debug('[main' + which + '] uvMode=' + uvMode + ' 需要 uv' + uvMode + ' ✗ 我们只上行了 uv0/uv1（glTF 的 TEXCOORD_2 一般也没有）✗ 回退到 uv0');
    }

    const B = [];
    B.push('');
    B.push('// ===== 主色层 ' + which + '（lilGetMain' + which + '）=====');
    B.push('{');
    B.push('\tvec4 ba3dLc = vec4( ' + v3(Lc.color, [1, 1, 1]) + ', ' + alpha(Lc.color).toFixed(4) + ' );');
    /**
     * ★ Decal 采样（lil_common_functions.hlsl:473 lilCalcDecalUV + :533 图集动画 + :748 边缘 AA）
     *
     *   float2 uv2 = lilCalcDecalUV( uv, uv_ST, angle, isLeftOnly, isRightOnly,
     *                               shouldCopy, shouldFlipMirror, shouldFlipCopy, isRightHand );
     *   // ↑ 逐行：
     *   //   if(shouldCopy) outUV.x = abs(outUV.x - 0.5) + 0.5;      // 左半镜像到右半
     *   //   outUV = outUV * uv_ST.xy + uv_ST.zw;
     *   //   if(shouldFlipCopy && uv.x < 0.5) outUV.x = 1.0 - outUV.x;
     *   //   if(shouldFlipMirror && isRightHand) outUV.x = 1.0 - outUV.x;
     *   //   if(isLeftOnly  &&  isRightHand) outUV.x = -1.0;          // 采样到边界外 ⇒ 看不见
     *   //   if(isRightOnly && !isRightHand) outUV.x = -1.0;
     *   //   outUV = (outUV - uv_ST.zw) / uv_ST.xy;                   // ★ 旋转前先逆 ST
     *   //   outUV = lilRotateUV( outUV, angle );
     *   //   outUV = outUV * uv_ST.xy + uv_ST.zw;
     *
     *   float2 uv2samp = lilCalcAtlasAnimation( uv2, decalAnimation, decalSubParam );
     *   //   float2 o = lerp( float2(uv.x, 1.0-uv.y), 0.5, subParam.z );
     *   //   uint ox = animTime % (uint)anim.x;   uint oy = animTime / (uint)anim.x;
     *   //   o = ( o + float2(ox,oy) ) * subParam.xy / anim.xy;
     *   //   o.y = 1.0 - o.y;
     *   //   animTime = anim.w == 0 ? (uint)anim.z : (uint)(LIL_TIME*anim.w) % (uint)anim.z
     *
     *   outCol.a *= lilIsIn0to1( uv2, saturate( nv - 0.05 ) );
     *   //   value = 0.5 - abs(f-0.5);  return saturate( value / clamp(fwidth(value), 1e-4, nv) )
     *   //   ⚠️ HLSL 里 float2 传给 float 参数 ⇒ **隐式截断成 .x** ⇒ 只判 x 方向 ✓
     *
     * ⚠️ GLSL ES 1.00 没有 uint ⇒ 用 floor() + mod() 等价
     * ⚠️ nv（fd.nv）在 three 里 = dot( 法线, 表面→相机 方向 )
     */
    const isDecal = !!Lc.isDecal;
    if (hasTex && !isDecal) {
      B.push('\tba3dLc *= texture2D( ' + texUni + ', ' + uvExpr + ' );');
    } else if (hasTex && isDecal) {
      const st = Array.isArray(Lc.texST) ? Lc.texST : [1, 1, 0, 0];
      const stx = num(st[0], 1).toFixed(6), sty = num(st[1], 1).toFixed(6);
      const stz = num(st[2], 0).toFixed(6), stw = num(st[3], 0).toFixed(6);
      const ang = num(Lc.texAngle, 0).toFixed(6);
      const an = Array.isArray(Lc.decalAnimation) ? Lc.decalAnimation : [1, 1, 1, 30];
      const sp = Array.isArray(Lc.decalSubParam) ? Lc.decalSubParam : [1, 1, 0, 1];
      const ax = Math.max(1e-5, num(an[0], 1)), ay = Math.max(1e-5, num(an[1], 1));
      const az = Math.max(0, num(an[2], 1)), aw = num(an[3], 30);
      const px = num(sp[0], 1).toFixed(6), py = num(sp[1], 1).toFixed(6), pz = num(sp[2], 0).toFixed(6);
      const D = [];
      D.push('\t// _Main' + which + 'TexIsDecal：lilCalcDecalUV（lil_common_functions.hlsl:473）');
      D.push('\tvec2 ba3dDcUv = ' + uvExpr + ';');
      D.push('\tvec2 ba3dDcRaw = ' + uvExpr + ';   // FlipCopy 判据用的是**原始** uv.x');
      if (Lc.shouldCopy) D.push('\tba3dDcUv.x = abs( ba3dDcUv.x - 0.5 ) + 0.5;');
      D.push('\tba3dDcUv = ba3dDcUv * vec2( ' + stx + ', ' + sty + ' ) + vec2( ' + stz + ', ' + stw + ' );');
      if (Lc.shouldFlipCopy) D.push('\tif ( ba3dDcRaw.x < 0.5 ) ba3dDcUv.x = 1.0 - ba3dDcUv.x;');
      if (Lc.shouldFlipMirror) D.push('\tif ( vBa3dRightHand > 0.5 ) ba3dDcUv.x = 1.0 - ba3dDcUv.x;');
      if (Lc.isLeftOnly) D.push('\tif ( vBa3dRightHand > 0.5 ) ba3dDcUv.x = -1.0;   // 右半隐藏');
      if (Lc.isRightOnly) D.push('\tif ( vBa3dRightHand < 0.5 ) ba3dDcUv.x = -1.0;   // 左半隐藏');
      D.push('\tba3dDcUv = ( ba3dDcUv - vec2( ' + stz + ', ' + stw + ' ) ) / vec2( ' + stx + ', ' + sty + ' );');
      D.push('\t{ float si = sin( ' + ang + ' ); float co = cos( ' + ang + ' );');
      D.push('\t  vec2 o = ba3dDcUv - 0.5;');
      D.push('\t  ba3dDcUv = vec2( o.x * co - o.y * si, o.x * si + o.y * co ) + 0.5; }');
      D.push('\tba3dDcUv = ba3dDcUv * vec2( ' + stx + ', ' + sty + ' ) + vec2( ' + stz + ', ' + stw + ' );');
      D.push('\t// 图集帧动画（lilCalcAtlasAnimationAtAnimTime · lil_common_functions.hlsl:533）');
      D.push('\tvec2 ba3dDcSamp;');
      D.push('\t{ vec2 o = mix( vec2( ba3dDcUv.x, 1.0 - ba3dDcUv.y ), vec2( 0.5 ), ' + pz + ' );');
      D.push('\t  float ba3dAnimN = ' + (aw === 0 ? az.toFixed(6) : 'mod( floor( uBa3dTime * ' + aw.toFixed(6) + ' ), ' + Math.max(1, az).toFixed(6) + ' )') + ';');
      D.push('\t  float ba3dOx = mod( ba3dAnimN, ' + ax.toFixed(6) + ' );');
      D.push('\t  float ba3dOy = floor( ba3dAnimN / ' + ax.toFixed(6) + ' );');
      D.push('\t  o = ( o + vec2( ba3dOx, ba3dOy ) ) * vec2( ' + px + ', ' + py + ' ) / vec2( ' + ax.toFixed(6) + ', ' + ay.toFixed(6) + ' );');
      D.push('\t  ba3dDcSamp = vec2( o.x, 1.0 - o.y ); }');
      D.push('\tvec4 ba3dDcCol = texture2D( ' + texUni + ', ba3dDcSamp );');
      D.push('\t// 边缘 AA（lilIsIn0to1( uv2, saturate( nv - 0.05 ) ) ✗ 只判 x ✓）');
      D.push('\t{ float ba3dDcIn = 0.5 - abs( ba3dDcUv.x - 0.5 );');
      D.push('\t  float ba3dNv = clamp( dot( normalize( normal ), normalize( vBa3dViewPos ) ), 0.0, 1.0 );');
      D.push('\t  ba3dDcCol.a *= saturate( ba3dDcIn / clamp( fwidth( ba3dDcIn ), 0.0001, saturate( ba3dNv - 0.05 ) ) ); }');
      const dbg = Math.round(Math.max(0, Math.min(3, num(Lc.decalDebug, 0))));
      if (dbg === 1) {
        // 跳过边缘 AA（保留采样 ✓）
        D.push('\t// [调试 1] 跳过边缘 AA：ba3dDcCol.a 保持贴图原值');
      } else if (dbg === 2) {
        // 把 decal UV 输出成颜色：R=uv.x · G=uv.y · B=1 ⇒ 一眼看出 UV 落在哪
        D.push('\t// [调试 2] 把 decal UV 输出成颜色（R=uv.x G=uv.y）· alpha=1');
        D.push('\tba3dDcCol = vec4( fract( ba3dDcUv.x ), fract( ba3dDcUv.y ), 1.0, 1.0 );');
      } else if (dbg === 3) {
        // 只把 alpha 变成 1（保留 RGB ⇒ 看颜色对不对）
        D.push('\t// [调试 3] alpha 强制 1（保留 RGB）');
        D.push('\tba3dDcCol.a = 1.0;');
      }
      D.push('\tba3dLc *= ba3dDcCol;');
      D.forEach((l) => B.push(l));
      /**
       * ⚠️ 把**生成器实际看到的入参**全打出来
       *   —— 之前只打了 bool 和 anim/sub ⇒ 看不到 texST ⇒
       *      分不清「面板没送到」还是「送到了但公式没效果」 ✓
       *   —— `raw` 是 Lc 上原始的值（未做 num/default 归一）⇒ 一眼看出面板有没有写进来 ✓
       */
      if (typeof console !== 'undefined') console.debug('[decal] ' + which
        + ' | use=' + (Lc.use ? 1 : 0) + ' tex=' + (Lc.tex ? '有' : '**无**')
        + ' isDecal=' + (Lc.isDecal ? 1 : 0) + ' uvMode=' + uvMode
        + ' | copy=' + (Lc.shouldCopy ? 1 : 0) + ' flipMirror=' + (Lc.shouldFlipMirror ? 1 : 0)
        + ' flipCopy=' + (Lc.shouldFlipCopy ? 1 : 0) + ' left=' + (Lc.isLeftOnly ? 1 : 0)
        + ' right=' + (Lc.isRightOnly ? 1 : 0)
        + ' | anim=(' + ax + ',' + ay + ',' + az + ',' + aw + ') sub=(' + px + ',' + py + ',' + pz + ')'
        + ' | texST=(' + stx + ',' + sty + ',' + stz + ',' + stw + ')'
        + ' rawTexST=' + JSON.stringify(Lc.texST)
        + ' rawAnim=' + JSON.stringify(Lc.decalAnimation)
        + ' rawSub=' + JSON.stringify(Lc.decalSubParam)
        + ' decalDebug=' + Math.round(Math.max(0, Math.min(3, num(Lc.decalDebug, 0)))));
    }
    if (hasMask) B.push('\tba3dLc.a *= texture2D( ' + maskUni + ', vBa3dUv ).r;');
    /**
     * 层溶解（lilCalcDissolve ✗ lil_common_functions.hlsl:626 ✓）
     *
     * ⚠️ 和顶层 Dissolve 的区别：不丢弃像素 ✗ 只把**这一层的 alpha 乘 0/1** ✓
     *    边缘强度写到全局 ba3dDisEdge2nd/3rd ✗ 由 after 块加算成发光边 ✓
     *    （lilToon 是 fd.emissionColor += _Main2ndDissolveColor * alpha ·
     *      lil_pass_forward_normal.hlsl:479 · 我们在 dithering 阶段直接加 rgb ✗ 等价 ✓）
     *
     * 公式（dissolveParams = (mode, dirMode, threshold, softness) ✓）：
     *   mode 1 = 贴图阈值 ✗ 2 = UV 2D ✗ 3 = 3D 坐标
     *   dirMode 1 → 用 dot(方向) ✗ 否则用 distance
     *   edge   = 1 - saturate( |值 - threshold| / softness )
     *   alpha *= (值 > threshold ? 1 : 0)
     */
    const dmode = Math.round(Math.max(0, Math.min(3, num(Lc.dissolveMode, 0))));
    const edgeVar = which === '3rd' ? 'ba3dDisEdge3rd' : 'ba3dDisEdge2nd';
    if (window.__ba3dDebugUI && dmode > 0) {
      console.debug('[layer' + which + '] 层溶解 mode=' + dmode
        + ' shape=' + (num(Lc.dissolveDir, 0) === 1 ? 'Line' : 'Point')
        + ' thr=' + num(Lc.dissolveThreshold, 0.5) + ' soft=' + num(Lc.dissolveSoftness, 0.1)
        + ' pos=' + JSON.stringify(Lc.dissolvePos || [0, 0, 0, 0])
        + ' color=' + JSON.stringify(Lc.dissolveColor || [1, 1, 1])
        + ' mask=' + (Lc.dissolveMask ? '有' : '无') + ' noise=' + (Lc.dissolveNoiseMask ? '有' : '无'));
    }
    // ⚠️ 这两个必须在**函数级** ✗ 不能放在 if (dmode > 0) 里面 ✓
    //    因为下面的 return 里 uniforms 要引用它们 ✗ 块内声明的外面看不到 ✓
    //    （踩过一次：hasDNoise is not defined ✗ 整个材质编译失败 ✓）
    const hasDMask = !!Lc.dissolveMask;
    const hasDNoise = !!Lc.dissolveNoiseMask;
    if (dmode > 0) {
      const thr = num(Lc.dissolveThreshold, 0.5).toFixed(4);
      const soft = Math.max(1e-5, num(Lc.dissolveSoftness, 0.1)).toFixed(5);
      const dmDir = Math.round(num(Lc.dissolveDir, 0)) === 1;
      const dpos = Lc.dissolvePos || [0, 0, 0, 0];
      const dpx = num(dpos[0], 0).toFixed(4);
      const dpy = num(dpos[1], 0).toFixed(4);
      const dpz = num(dpos[2], 0).toFixed(4);
      const dns = num(Lc.dissolveNoiseStrength, 0).toFixed(4);
      const dmUni = which === '3rd' ? 'ba3dMain3rdDisMask' : 'ba3dMain2ndDisMask';
      const dnUni = which === '3rd' ? 'ba3dMain3rdDisNoise' : 'ba3dMain2ndDisNoise';
      const dv = 'ba3dDis' + which;
      const P = (x) => B.push(x);
      P('  // 层溶解 dissolveMode=' + dmode + ' thr=' + thr + ' soft=' + soft);
      P('  {');
      P('    float ' + dv + 'Mask = 1.0;');
      if (dmode === 1 && hasDMask) P('    ' + dv + 'Mask = texture2D( ' + dmUni + ', vBa3dUv ).r;');
      if (hasDNoise) P('    float ' + dv + 'Noise = ( texture2D( ' + dnUni + ', vBa3dUv ).r - 0.5 ) * ' + dns + ';');
      else P('    float ' + dv + 'Noise = 0.0;');
      P('    float ' + dv + ' = 0.0;');
      if (dmode === 1) {
        P('    float ' + dv + 'V = ' + dv + 'Mask + ' + dv + 'Noise;');
        P('    ' + dv + ' = 1.0 - clamp( abs( ' + dv + 'V - ' + thr + ' ) / ' + soft + ', 0.0, 1.0 );');
        P('    ' + dv + 'Mask = ' + dv + 'V > ' + thr + ' ? 1.0 : 0.0;');
      } else if (dmode === 2) {
        /**
         * ⚠️ 模式 2（UV）的 Shape=Line 分支 ✗ lilToon 用的是：
         *      lilRotateUV( uv, dissolvePos.w ).x
         *    也就是「把 uv 绕 (0.5,0.5) 旋转 dissolvePos.w 弧度 ✗ 取旋转后的 x」✓
         *    （lil_common_functions.hlsl:419 ✓）
         *  我一开始写成了 dot( uv, normalize(pos.xy) ) ✗ 那是**错的** ✓
         *  ⚠️ 那个公式在模式 3（Position）里才是对的 ✗ 别搞混 ✓
         *  ⚠️ ba3dRotateUV 只存在于**描边**着色器里 ✗ 这里要内联 ✓
         */
        const dw = num(dpos[3], 0).toFixed(6);
        /**
         * ⚠️ 这三个临时变量必须**按层命名** ✗ 不能叫 ba3dRC / ba3dRS / ba3dRU ✓
         *    因为 2nd 和 3rd 的溶解代码会一起进同一个着色器 ✗
         *    两层都选 Line 形状时就会**重复声明** ⇒ GLSL 报 redefinition ✓
         */
        const rc = 'ba3dRC' + which, rs = 'ba3dRS' + which, ru = 'ba3dRU' + which;
        const uvC = dmDir
          ? '( ' + ru + '.x * ' + rc + ' - ' + ru + '.y * ' + rs + ' ) + 0.5'
          : 'distance( vBa3dUv, vec2( ' + dpx + ', ' + dpy + ' ) )';
        if (dmDir) {
          P('    float ' + rc + ' = cos( ' + dw + ' );');
          P('    float ' + rs + ' = sin( ' + dw + ' );');
          P('    vec2 ' + ru + ' = vBa3dUv - 0.5;');
        }
        P('    ' + dv + ' = ' + uvC + ' + ' + dv + 'Noise;');
        P('    ' + dv + 'Mask = ' + dv + ' > ' + thr + ' ? 1.0 : 0.0;');
        P('    ' + dv + ' = 1.0 - clamp( abs( ' + dv + ' - ' + thr + ' ) / ' + soft + ', 0.0, 1.0 );');
      } else {
        // ⚠️ 模式 3 用**世界空间归一化后**的位置 · 和顶层 Dissolve 同一套（模型可能 150 单位）
        const dsc = dissolvePosScale();
        const kx = dsc.k[0].toFixed(6), ky = dsc.k[1].toFixed(6), kz = dsc.k[2].toFixed(6);
        const cx = dsc.c[0].toFixed(6), cy = dsc.c[1].toFixed(6), cz = dsc.c[2].toFixed(6);
        const posE = 'vec3( ( vBa3dPositionWS.x - ' + cx + ' ) * ' + kx
          + ', ( vBa3dPositionWS.y - ' + cy + ' ) * ' + ky
          + ', ( vBa3dPositionWS.z - ' + cz + ' ) * ' + kz + ' )';
        const pC = dmDir
          ? 'dot( ' + posE + ', normalize( vec3( ' + dpx + ', ' + dpy + ', ' + dpz + ' ) + vec3( 0.0, 0.0, 1e-6 ) ) )'
          : 'distance( ' + posE + ', vec3( ' + dpx + ', ' + dpy + ', ' + dpz + ' ) )';
        P('    ' + dv + ' = ' + pC + ' + ' + dv + 'Noise;');
        P('    ' + dv + 'Mask = ' + dv + ' > ' + thr + ' ? 1.0 : 0.0;');
        P('    ' + dv + ' = 1.0 - clamp( abs( ' + dv + ' - ' + thr + ' ) / ' + soft + ', 0.0, 1.0 );');
      }
      P('    ba3dLc.a *= ' + dv + 'Mask;');
      P('    ' + edgeVar + ' = ' + dv + ';');
      P('  }');
    }
    /**
     * 距离淡出（lil_common_frag.hlsl:796 ✓）
     *
     *   color2nd.a = lerp( color2nd.a,
     *                       color2nd.a * saturate( (fd.depth - DF.x) / (DF.y - DF.x) ),
     *                       DF.z );
     *
     * ⚠️ fd.depth 的真相（lil_common_macro.hlsl:621 / 2314 ✓）：
     *     fd.depth = length( lilHeadDirection( fd.positionWS ) )
     *     lilHeadDirection 的定义就是 lilViewDirection ✗ 名字是 VR 头显留下的 ✓
     *   ⇒ fd.depth = **到相机的距离** ✗ 不是「到头部骨骼」✓
     *
     * ⇒ 在 three 里就是 distance( cameraPosition, vBa3dPositionWS ) ✓
     *   （cameraPosition 是 three 片元着色器的内置 uniform ✓）
     *
     * lerp(a, a*k, z) 等价于 a * mix(1, k, z) ✗ 直接写乘更省 ✓
     */
    const dfNear = num(Lc.distFadeNear, 0);
    const dfFar = num(Lc.distFadeFar, 0);
    const dfStr = Math.max(0, Math.min(1, num(Lc.distFadeStrength, 0)));
    if (dfStr > 0) {
      const span = Math.max(1e-5, dfFar - dfNear);
      B.push('  // 距离淡出 near=' + dfNear.toFixed(3) + ' far=' + dfFar.toFixed(3) + ' strength=' + dfStr.toFixed(3));
      B.push('  ba3dLc.a *= mix( 1.0, saturate( ( distance( cameraPosition, vBa3dPositionWS ) - ' + dfNear.toFixed(4)
        + ' ) / ' + span.toFixed(6) + ' ), ' + dfStr.toFixed(4) + ' );');
    }
    if (cull === 1) B.push('\tif ( gl_FrontFacing ) ba3dLc.a = 0.0;');
    if (cull === 2) B.push('\tif ( !gl_FrontFacing ) ba3dLc.a = 0.0;');

    /**
     * ★ _MainXxxTexAlphaMode（lil_common_frag.hlsl:799-806 / :895-902）
     *
     *     if(_Main2ndTexAlphaMode != 0) {
     *         if(... == 1) fd.col.a = color2nd.a;
     *         if(... == 2) fd.col.a = fd.col.a * color2nd.a;
     *         if(... == 3) fd.col.a = saturate(fd.col.a + color2nd.a);
     *         if(... == 4) fd.col.a = saturate(fd.col.a - color2nd.a);
     *         color2nd.a = 1;              // ★ 置 1
     *     }
     *
     * ⚠️ 整块在 `#if LIL_RENDER != 0` 里 ⇒ 只在 Cutout / Transparent 下生效
     * ⚠️ 必须在 ba3dLc 算完（含 mask / 溶解 / 距离淡出 / cull）**之后**、
     *    颜色混合**之前** —— 因为最后那句置 1 会影响颜色混合的权重
     */
    const amode = Math.round(Math.max(0, Math.min(4, num(Lc.alphaMode, 0))));
    if (amode !== 0 && alphaRender) {
      B.push('\t// _Main' + which + 'TexAlphaMode = ' + amode + '（lil_common_frag.hlsl:799-806）');
      if (amode === 1) B.push('\tdiffuseColor.a = ba3dLc.a;');
      else if (amode === 2) B.push('\tdiffuseColor.a = diffuseColor.a * ba3dLc.a;');
      else if (amode === 3) B.push('\tdiffuseColor.a = saturate( diffuseColor.a + ba3dLc.a );');
      else if (amode === 4) B.push('\tdiffuseColor.a = saturate( diffuseColor.a - ba3dLc.a );');
      B.push('\tba3dLc.a = 1.0;   // 用完置 1 ⇒ 颜色混合按满强度');
    }
    B.push('\t' + varName + ' = ba3dLc;');
    B.push('\tdiffuseColor.rgb = ba3dBlend( diffuseColor.rgb, ba3dLc.rgb, ba3dLc.a * ' + el.toFixed(4) + ', ' + bm + 'u );');
    B.push('}');

    const A = [];
    A.push('// 主色层 ' + which + '：不受光照的那部分（enableLighting=' + el.toFixed(2) + ' ✓）');
    A.push('gl_FragColor.rgb = ba3dBlend( gl_FragColor.rgb, ' + varName + '.rgb, '
      + varName + '.a * ' + (1 - el).toFixed(4) + ', ' + bm + 'u );');
    // 层溶解的发光边（lil_pass_forward_normal.hlsl:479 · 加色 ✓）
    if (dmode > 0) {
      A.push('gl_FragColor.rgb += ' + v3(Lc.dissolveColor, [1, 1, 1]) + ' * ' + edgeVar + ';');
    }

    /**
     * ★★ afterMaterial —— 挂在 `#include <lights_fragment_begin>` **之后**
     *
     * 为什么需要它：three 的 toon 光照用的是 `material.diffuseColor`（struct ✓）✗
     * 不是局部的 `diffuseColor` ⇒ 在 include **之前**改 `diffuseColor` 对光照无效 ✓
     * 而 `material` 是在 include **里面**赋值的 ⇒ 只能在其后改 ✓
     *
     * 内容：把这一层的颜色按 `enableLighting` 的权重混进光照用的漫反射色 ✓
     *   · el = 1 ⇒ 完全用层色（和 before 里那句等价 ✗ 但那个对光照没用 ✓）
     *   · el = 0 ⇒ 不动（未受光的那部分由 after 块加 ✓）
     */
    const AM = [];
    if (el > 0) {
      AM.push('// 主色层 ' + which + '：喂给光照用的漫反射色（material.diffuseColor ✓）');
      /**
       * ⚠️⚠️ **不能写 `ba3dLc`** —— 它是 before 那个 `{ }` 块里的局部变量 ✗
       *    而 afterMaterial 挂在块**外面**（include 之后 ✓）⇒ 引用它会编译失败 ✓
       *    （GLSL 没有块外可见性 ✗ 这是我自己刚埋的坑 ✓）
       * ⇒ 用前导里声明过的 `' + varName + '`（= ba3dColor2nd / ba3dColor3rd ✓）
       *    它在 `#include <common>` 那段就声明了 ⇒ 任何位置都可见 ✓
       */
      AM.push('material.diffuseColor.rgb = mix( material.diffuseColor.rgb, ' + varName + '.rgb, ' + varName + '.a * '
        + el.toFixed(4) + ' );');
    }

    return {
      before: B.join('\n'),
      after: A.join('\n'),
      afterMaterial: AM.length ? AM.join('\n') : null,
      uniforms: {
        tex: hasTex ? Lc.tex : null,
        mask: hasMask ? Lc.blendMask : null,
        // 层溶解的两张贴图（都是数据贴图 · 采样 .r ✓）
        disMask: dmode === 1 ? Lc.dissolveMask : null,
        disNoise: hasDNoise ? Lc.dissolveNoiseMask : null,
      },
      varName: varName,
    };
  }
  /**
   * 模式 3（对象空间）的位置归一化系数 —— 返回 1 / 模型包围盒对角线。
   *
   * ⚠️ lilToon 是在 Unity 里用的 ✗ 角色一般 1~2 单位高 ✗ 所以 _DissolvePos 填 0~2 很直观 ✓
   *    而这个查看器加载的模型可能是 150 单位（CH0155 实测）✗
   *    直接用原始坐标的话 ✗ 阈值得填 75 ✗ 完全没法调 ✓
   *    所以这里按包围盒对角线归一化 ✗ 模式 3 的「位置 / 阈值」就回到 0~1 量级 ✓
   *    （模式 2 用 UV ✗ 本来就是 0~1 ✗ 不需要 ✗）
   */
  let __dissolveScaleCache = { root: null, k: [1, 1, 1], c: [0, 0, 0] };
  function dissolvePosScale() {
    if (__dissolveScaleCache.root === modelRoot) return __dissolveScaleCache;
    let k = [1, 1, 1], c = [0, 0, 0];
    try {
      if (modelRoot) {
        const box = new THREE.Box3().setFromObject(modelRoot);
        if (box.isEmpty && !box.isEmpty()) {
          const size = new THREE.Vector3(), center = new THREE.Vector3();
          box.getSize(size);
          box.getCenter(center);
          /**
           * ⚠️ **按轴**归一化 ✗ 不是只按最长边。
           *
           * 只按最长边的话：高瘦角色在 x/z 方向只占 ±0.15 左右 ✗
           * 而 y 方向占 ±0.5 ✗ 于是
           *   · 球形模式：球壳几乎永远扫不到位（表面被压扁在 x/z 附近）✓
           *   · 平面模式：阈值范围不到 0.5 就结束了 ✓
           * 按轴归一化后模型映到**单位立方体** ✗ 中心在原点 ✗
           *   · 球形：半径 0 ~ 0.87 ✗ 阈值 0~0.5 能扫过大部分表面 ✓
           *   · 平面：±0.5 ✗ 阈值 0 正好切一半 ✓
           */
          const sx = (isFinite(size.x) && size.x > 1e-6) ? 1 / size.x : 1;
          const sy = (isFinite(size.y) && size.y > 1e-6) ? 1 / size.y : 1;
          const sz = (isFinite(size.z) && size.z > 1e-6) ? 1 / size.z : 1;
          k = [sx, sy, sz];
          if (isFinite(center.x)) c = [center.x, center.y, center.z];
        }
      }
    } catch (e) { console.debug('[dissolve] 包围盒计算失败 ✗ 归一化取默认', e); }
    __dissolveScaleCache = { root: modelRoot, k: k, c: c };
    console.debug('[dissolve] 世界空间归一化：k=(' + k.map((x) => x.toFixed(5)).join(', ') + ')'
      + ' 尺寸=(' + k.map((x) => (1 / x).toFixed(3)).join(', ') + ')'
      + ' center=(' + c.map((x) => x.toFixed(2)).join(', ') + ')');
    return __dissolveScaleCache;
  }

  function lilDissolveGLSL(cfgIn) {
    const cfg = cfgIn || lilCfg;
    const D = cfg.dissolve || {};
    const num = (v, d) => (v === undefined || v === null || !isFinite(Number(v)) ? d : Number(v));
    const mode = Math.round(Math.max(0, Math.min(3, num(D.mode, 0))));
    if (!mode) return null;
    /**
     * ⚠️ shape（_DissolveParams.g ✗ 我们的 `linear` 键 ✓）必须**四舍五入** ✓
     *    lilToon 2.3.4 新增（lil_common_functions.hlsl:662）：
     *        dissolveParams.xy = round(dissolveParams.xy);   // mode, shape
     *    ⇒ mode 与 shape **都**取整 ✓
     *    我们 mode 已经 Math.round 了 · shape 原来是 `!== 0` ⇒
     *      配置里写 "linear": 0.5 会被我们当成 Line · 而 lilToon 会 round 成 Point ✓
     *    （1.3.x 没有这行 · 是 2.3.4 补的 ✓）
     */
    const linear = Math.round(num(D.linear, 1)) === 1 ? 1 : 0;
    const th = num(D.threshold, 0.5);
    // lilToon 直接除以 softness ✗ 为 0 会炸 ✗ 这里兜底
    const soft = Math.max(0.001, Math.abs(num(D.softness, 0.1)));
    const pos = Array.isArray(D.pos) && D.pos.length >= 4 ? D.pos.map((x) => num(x, 0)) : [0, 0, 0, 0];
    const col = Array.isArray(D.color) ? D.color : [1, 1, 1];
    const colV = 'vec3(' + [0, 1, 2].map((i) => num(col[i], 1).toFixed(4)).join(', ') + ')';
    const hasMask = !!D.maskTex;
    const hasNoise = !!D.noiseTex;
    const noiseStr = num(D.noiseStrength, 0);
    // 模式 3 的对象空间归一化系数（见 dissolvePosScale 的注释）
    // 模式 3：把对象空间坐标平移到模型中心 ✗ 再缩放到 ~[-0.5, 0.5]
    // 这样「位置 / 方向」填 (0,0,0) 就是模型中心 ✗ 阈值 0~0.5 就是半径 ✓
    let posExpr = 'vBa3dPositionOS';
    if (mode === 3) {
      const sc = dissolvePosScale();
      // 按轴缩放：vec3(kx, ky, kz) ✗ 模型映到单位立方体 ✓
      // ⚠️ 用**世界坐标** ✗ 和 Box3 同一个空间（见顶点注入处的说明）
      posExpr = '( vBa3dPositionWS - vec3(' + sc.c.map((x) => x.toFixed(4)).join(', ') + ') ) * vec3('
        + sc.k.map((x) => x.toFixed(6)).join(', ') + ')';
    }

    const L = [];
    L.push('');
    L.push('// ===== Dissolve（lil_common_functions.hlsl:626）=====');
    L.push('{');
    L.push('\tfloat ba3dDissolveAlpha = 0.0;');
    L.push('\tfloat ba3dDissolveMaskVal = 1.0;');
    L.push('\tfloat ba3dSample = 1.0;');
    if (hasMask) L.push('\tba3dSample = texture2D( ba3dDissolveMask, vBa3dUv ).r;');
    if (hasNoise) {
      L.push('\tba3dSample += ( texture2D( ba3dDissolveNoiseMask, vBa3dUv ).r - 0.5 ) * ' + noiseStr.toFixed(4) + ';');
    }
    if (mode === 1) {
      // 模式 1：贴图阈值（贴图禁用时 lilToon 也取 1.0 ✗ 结果是不消失 ✓）
      L.push('\tba3dDissolveAlpha = 1.0 - saturate( abs( ba3dSample - ' + th.toFixed(4) + ' ) / ' + soft.toFixed(4) + ' );');
      L.push('\tba3dDissolveMaskVal = ba3dSample > ' + th.toFixed(4) + ' ? 1.0 : 0.0;');
    } else if (mode === 2) {
      // 模式 2：UV 空间 ✗ 线性用 dot ✗ 圆形用 distance
      const px = pos[0], py = pos[1];
      const pv = 'vec2(' + px.toFixed(4) + ', ' + py.toFixed(4) + ')';
      if (linear) {
        /**
         * ⚠️ lilToon 的模式 2 线性有**两份不同的实现**：
         *   无噪声（lil_common_functions.hlsl:652）→ lilRotateUV( uv, _DissolvePos.w ).x
         *   有噪声（:675）                        → dot( uv, normalize(_DissolvePos.xy) ) + noise
         * 前者只用一个旋转角 ✗ xy 完全用不上 ✗ 对查看器来说极难猜 ✓
         * 后者直接 dot 原始 uv ✗ 方向为负时结果落在 [-1, 0] ✗
         *   阈值一旦 > 0 就**永远不成立** ✗ 模型整个消失（踩过 ✓）
         *
         * 这里统一成「UV 方向上的线性渐变」✗ 并**居中**到 0~1：
         *     dot( uv - 0.5, normalize(pos.xy) ) + 0.5
         * 于是阈值 0~1 就是沿该方向扫过整张贴图 ✗ 语义和模式 3 的平面一致 ✓
         */
        const len = Math.hypot(px, py);
        const dir = len < 1e-6 ? 'vec2( 0.0, -1.0 )' : 'normalize( ' + pv + ' )';
        L.push('\tba3dDissolveAlpha = dot( vBa3dUv - 0.5, ' + dir + ' ) + 0.5;');
      } else {
        // 圆形：中心直接用 uv 坐标（(0.5, 0.5) 就是贴图中心 ✓）
      L.push('\tba3dDissolveAlpha = distance( vBa3dUv, ' + pv + ' );');
      }
      L.push('\tba3dDissolveMaskVal *= ba3dDissolveAlpha > ' + th.toFixed(4) + ' ? 1.0 : 0.0;');
      L.push('\tba3dDissolveAlpha = 1.0 - saturate( abs( ba3dDissolveAlpha - ' + th.toFixed(4) + ' ) / ' + soft.toFixed(4) + ' );');
    } else {
      // 模式 3：对象空间 ✗ 线性用 dot（平面 ✗ 圆形用 distance（球形 ✗）
      const px = pos[0], py = pos[1], pz = pos[2];
      const pv = 'vec3(' + px.toFixed(4) + ', ' + py.toFixed(4) + ', ' + pz.toFixed(4) + ')';
      if (linear) {
        const len = Math.sqrt(px * px + py * py + pz * pz);
        /**
         * ⚠️ 方向全零时的兜底改成「竖直方向」(0,-1,0)。
         *    原来兜底是 +Z ✗ 而 Q 版角色的**厚度**方向很薄（约身宽 1/3 ✓）✗
         *    垂直于 z 的平面会几乎同时命中整个身体 ✗ 看起来和球形模式没区别 ✓
         *    竖直平面才是「从下往上切」这个最常见的用法 ✓
         */
        const dir = len < 1e-6 ? 'vec3( 0.0, -1.0, 0.0 )' : 'normalize( ' + pv + ' )';
        L.push('\tba3dDissolveAlpha = dot( ' + posExpr + ', ' + dir + ' );');
      } else {
        L.push('\tba3dDissolveAlpha = distance( ' + posExpr + ', ' + pv + ' );');
      }
      L.push('\tba3dDissolveMaskVal *= ba3dDissolveAlpha > ' + th.toFixed(4) + ' ? 1.0 : 0.0;');
      L.push('\tba3dDissolveAlpha = 1.0 - saturate( abs( ba3dDissolveAlpha - ' + th.toFixed(4) + ' ) / ' + soft.toFixed(4) + ' );');
    }
    L.push('\tdiffuseColor.a *= ba3dDissolveMaskVal;');
    L.push('\tba3dDissolveEdge = ba3dDissolveAlpha;');
    L.push('}');
    // 每次出现**新的参数组合**就打一行（同一组合只打一次 ✗ 噪声很小 ✓）
    {
      const sig = mode + '/' + linear + '/' + th.toFixed(3) + '/' + soft.toFixed(3) + '/' + pos.join(',');
      if (!lilDissolveGLSL.__logged) lilDissolveGLSL.__logged = {};
      if (!lilDissolveGLSL.__logged[sig]) {
        lilDissolveGLSL.__logged[sig] = true;
        console.debug('[dissolve] 生成 GLSL：模式=' + mode + ' 线性=' + linear
          + ' 阈值=' + th.toFixed(3) + ' 羽化=' + soft.toFixed(3)
          + ' 位置/方向=(' + pos.join(', ') + ')'
          + ' 遮罩=' + (hasMask ? '有' : '无') + ' 噪声=' + (hasNoise ? '有(' + noiseStr + ')' : '无'));
      }
    }
    return {
      before: L.join('\n'),
      after: 'gl_FragColor.rgb += ' + colV + ' * ba3dDissolveEdge;   // _DissolveColor（加色）',
      uniforms: { mask: hasMask ? D.maskTex : null, noise: hasNoise ? D.noiseTex : null },
    };
  }
  /**
   * 同步 Dissolve 需要的 alphaTest（遍历模型 ✗ 逐个材质设）。
   *
   * ⚠️ 为什么不能只在 patchToonMaterial 里设：
   *    那个函数只在**材质创建时**跑 ✗ 如果某次配置变更是「复用材质 + 只重编程序」✗
   *    它就再也不跑了 ✗ alphaTest 会停在旧值 ✓
   *    所以每次 applyLilOutline()（= 每次 lilToon 配置变更 ✓）都再同步一遍 ✓
   *
   * three 的判定：material.alphaTest > 0 → 定义 USE_ALPHATEST ✓
   */
  /**
   * 同步渲染状态（_TransparentMode / _Cutoff / _Cull ✓）。
   *
   * ⚠️ 和 syncDissolveAlphaTest / syncLayerDoubleSide / syncStencil 同样的理由：
   *    applyLilRenderState 只在 patchToonMaterial 里跑 ✗ 而**材质会被复用** ✗
   *    复用时 patchToonMaterial 不再执行 ⇒ 面板改了没反应 ✓
   *    ⇒ 每次配置变更都整体遍历一遍 ✓
   */
  function syncRenderState() {
    if (!modelRoot) return;
    modelRoot.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (!m || !m.isMeshToonMaterial) return;
        applyLilRenderState(m, lilCfgFor(m));
      });
    });
  }
  function syncDissolveAlphaTest() {
    if (!modelRoot) return;
    modelRoot.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (!m || !m.isMeshToonMaterial) return;
        if (m.userData.__ba3dOrigAlphaTest === undefined) {
          m.userData.__ba3dOrigAlphaTest = m.alphaTest || 0;
        }
        /**
         * ★ alphaTest 的**唯一权威**就在这里
         *
         * 优先级（从高到低）：
         *   ① 溶解开着（lilToon 且 mode > 0）⇒ 必须 ≥ 0.5 才会真正丢弃 ✓
         *      否则 dissolve 只在边缘加色 ✗ 不会切出洞 ✓
         *   ② _TransparentMode = 1（Cutout）⇒ 用 _Cutoff ✓
         *   ③ _TransparentMode = 0 / ≥2（Opaque / Transparent）⇒ 0 ✓
         *   ④ 模式没改（-1）但单独给了 cutoff ✗ 且本来就是 Cutout ⇒ 用 cutoff ✓
         *   ⑤ 否则 ⇒ 还原成模型原值 ✓
         */
        const __cf = lilCfgFor(m);
        const d = (__cf.dissolve) || {};
        const on = Math.round(Math.max(0, Math.min(3, Number(d.mode) || 0))) > 0;
        const __num = (v, dd) => (v === undefined || v === null || !isFinite(Number(v)) ? dd : Number(v));
        const __tm = Math.round(__num(__cf.transparentMode, -1));
        /**
         * ⚠️ `cutoff` 现在可以**未指定**（-1 ✓）。
         *   `__co` 只在「确实要用」的分支里算 ✓ ——
         *   规则 ④ 会先判断「有没有明确给过 cutoff」✓
         */
        const __coRaw = __num(__cf.cutoff, -1);
        const __coGiven = __coRaw >= 0;   // -1 = 未指定 ⇒ 不碰材质的 alphaTest ✓
        const __co = Math.max(0, Math.min(1, __coGiven ? __coRaw : 0.5));
        const __orig = m.userData.__ba3dOrigAlphaTest || 0;
        let want;
        if (shaderMode === 'lilToon' && on) {
          want = Math.max(0.5, __orig);
        } else if (__tm === 1) {
          /* ★ 明确是 Cutout ⇒ 用 `_Cutoff` ✓ */
          want = __co;
        } else if (__tm === 0 || __tm >= 2) {
          want = 0;
        } else {
          /**
           * ⚠️⚠️⚠️ **这里原来还有一条「规则 ④」✗ 已经删掉** ——
           *
           *   原规则：`else if (__cf.cutoff !== undefined && __orig > 0) want = __co;`
           *   意图：用户只改了 cutoff ✗ 没改模式 ⇒ 也认 ✓
           *
           *   ⚠️ 但它是**错的**，两个原因：
           *
           *     ① **语义错**：lilToon 的 `_Cutoff` display 名就是
           *        「**Alpha Cutoff**」⇒ **只在 Cutout 模式生效** ✓
           *        模式不是 Cutout 时它**根本不该影响 alphaTest** ✓
           *
           *     ② **实现错**：`cutoff` 的默认值是 0.5（永远有值 ✓）
           *        ⇒ 「给了 cutoff」这个条件**永远成立** ✓
           *        ⇒ 只要材质原始 `alphaTest > 0` ✗ 就被强制改成 0.5 ✓
           *        ⇒ **贴图 alpha < 0.5 的像素被裁掉**
           *        ⇒ 表现：「材质变透明了 / 脸变成一块白斑」✓✓✓
           *
           *   （实测：CH0155_Face_Toon 套「皮肤 · 动画」后脸变白斑 ✓
           *     套用前后 `cutoff` 都是 0.5 ⇒ 不是预设带来的 ✗
           *     是**默认值 + 这条规则**共同造成的 ✓）
           *
           *   ⚠️ 而且**预设本来就带 `_Cutoff = 0.5`**（lilToon 的默认 ✓）
           *      ⇒ 我们把它当「改过」是**误读** ✓
           *        预设只存「和 lilToon 默认不同的」✗ 而 0.5 就是默认 ✓
           *        ⇒ 生成预设时**不该带** `_Cutoff`（下一步一起修 ✓）
           *
           *   ⇒ 正确语义：**只有明确 Cutout（`__tm === 1`）才用 cutoff** ✓
           */
          want = __orig;
        }

        if (m.alphaTest !== want) {
          m.alphaTest = want;
          m.needsUpdate = true;
        }
      });
    });
  }

  /**
   * 同步「主色层剔除」需要的双面渲染（遍历模型 ✗ 逐个材质设）。
   *
   * ⚠️ 和 syncDissolveAlphaTest 同样的问题：材质可能被复用 ✗
   *    patchToonMaterial 不会再跑 ✗ 所以每次配置变更都要再同步一遍 ✓
   */
  /**
   * 同步模板参数（遍历模型 ✗ 本体与描边各一套 ✓）。
   *
   * ⚠️ 和 syncDissolveAlphaTest / syncLayerDoubleSide 同样的理由：
   *    材质可能被复用 ✗ patchToonMaterial 不会再跑 ✗ 所以每次配置变更都要再同步 ✓
   */
  function syncStencil() {
    if (!modelRoot) return;
    modelRoot.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (!m) return;
        if (o.userData && o.userData.__isLilOutline) {
          // 描边网格：要按**源材质**取描边配置 ✓
          // ⚠️ 描边网格是源网格的**子节点**（applyLilOutline 里 m.add(om) ✓）✗
          //    所以源网格是 o.parent ✗ 不是某个 userData 字段
          //    （我一开始写了个不存在的 __srcMesh ✗ 导致这段静默失效 ✓）
          const src = o.parent;
          const sm = src ? (Array.isArray(src.material) ? src.material[0] : src.material) : null;
          const OC = (sm && sm.isMeshToonMaterial) ? (lilCfgFor(sm).outline || {}) : {};
          // 诊断：确认这条分支真的走到了 ✗ 以及解析出的配置是什么 ✓
          if (window.__ba3dDebugUI && !syncStencil.__logged) {
            syncStencil.__logged = true;
            console.debug('[stencil] 描边分支：parent=' + (src ? (src.name || '(无名)') : '无')
              + ' 源材质=' + (sm ? (sm.name || '(无名)') + '(isToon=' + !!sm.isMeshToonMaterial + ')' : '无')
              + ' stencilEnable=' + JSON.stringify(OC.stencilEnable)
              + ' comp=' + JSON.stringify(OC.stencilComp) + ' ref=' + JSON.stringify(OC.stencilRef));
          }
          applyStencil(m, OC.stencilEnable ? {
            use: true, ref: OC.stencilRef, readMask: OC.stencilReadMask, writeMask: OC.stencilWriteMask,
            comp: OC.stencilComp, pass: OC.stencilPass, fail: OC.stencilFail, zfail: OC.stencilZFail,
          } : null, OC.stencilEnable ? ('描边/' + ((sm && sm.name) || '?')) : null);
          return;
        }
        if (!m.isMeshToonMaterial) return;
        applyStencil(m, lilCfgFor(m).stencil, null);
      });
    });
  }

  function syncLayerDoubleSide() {
    if (!modelRoot) return;
    modelRoot.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (!m || !m.isMeshToonMaterial) return;
        if (m.userData.__ba3dOrigSide === undefined) m.userData.__ba3dOrigSide = m.side;
        const cfg = lilCfgFor(m);
        /**
         * ⚠️⚠️ 用户**显式**设了 _Cull（cfg.cull >= 0）时 ⇒ 这里**不要碰 side** ✓
         *
         * 原因：lilToon 里有两层 cull ——
         *     _Cull            基础材质的剔除
         *     _Main2nd/3rdTex_Cull   各**层**自己的剔除
         *   而 three 里层不是一个独立材质 ✗ 只能整体切 side ⇒ 两者会冲突 ✓
         *
         * 原来的代码**无条件**设 side ⇒ 把 applyLilRenderState 设的值覆盖掉 ✗
         *   现象：面板上调「剔除」**完全没反应** ✓（用户实测 6/7 两条都 FAIL ✓）
         *
         * 优先级：显式的 _Cull > 由层 cull 推导出的双面 ✓
         */
        const cu = Number(cfg.cull);
        if (cu >= 0) return;                      // 交给 applyLilRenderState ✓
        const need = (shaderMode === 'lilToon')
          && [cfg.main2nd, cfg.main3rd].some((Lc) => Lc && Lc.use && Math.round(Number(Lc.cull) || 0) !== 0);
        const want = need ? THREE.DoubleSide : m.userData.__ba3dOrigSide;
        if (m.side !== want) { m.side = want; m.needsUpdate = true; }
      });
    });
  }

  /** 面部材质名匹配（非法正则 → 永不匹配，不让它影响其它材质） */
  function celFaceRe() {
    try { return new RegExp(celCfg.facePattern, 'i'); } catch { return /$^/; }
  }

  /**
   * 修复「零法线」几何体（fixZeroNormals）。
   *
   * models/BlueArchiveModels 里**大量模型的光环网格没有 NORMAL 属性** ——
   * 按 glTF 规范，GLTFLoader 遇到缺失的法线会填一整个**零向量**缓冲。
   * 零法线在受光材质（PBR / Cel）下光照结果恒为 0 → **渲染成纯黑**；
   * 而 unlit 用的是 MeshBasicMaterial，**根本不读法线**，所以显示正常。
   * 这正是「只有无光照模式下光环正常」的原因。
   *
   * 实测（扫描 60 个模型）：29/1078 个网格是零法线，其中 **28 个都是光环**，
   * 例如 Airi_Original_Halo_1、Hoshino_Origina_Halo、Akari_Halo、Aris_Original_Halo_1…
   * 而 CH0155_Halo_1（Natsu）法线正常（1.000）—— 所以这个 bug 是**逐模型**的。
   *
   * 处理：对法线为零或非有限的几何体调用 computeVertexNormals() 重算。
   * 重算得到面法线（平面着色），对光环这种薄片正合适。
   */
  function fixZeroNormals() {
    if (!modelRoot) return 0;
    let fixed = 0;
    modelRoot.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const pos = o.geometry.getAttribute('position');
      if (!pos) return;
      const n = o.geometry.getAttribute('normal');
      if (!n) { o.geometry.computeVertexNormals(); fixed++; return; }
      // 抽样判断是否整片都是零法线（正常网格不必付全量代价）
      const step = Math.max(1, Math.floor(n.count / 64));
      let bad = 0, checked = 0;
      for (let i = 0; i < n.count; i += step) {
        const x = n.getX(i), y = n.getY(i), z = n.getZ(i);
        checked++;
        if (!isFinite(x) || !isFinite(y) || !isFinite(z) || (x * x + y * y + z * z) < 1e-12) bad++;
      }
      if (checked && bad === checked) {
        o.geometry.computeVertexNormals();
        fixed++;
        console.info('[fixZeroNormals] 重算法线：' + o.name + ' (' + n.count + ' 顶点)');
      }
    });
    if (fixed) console.info('[fixZeroNormals] 共修复 ' + fixed + ' 个网格');
    return fixed;
  }

  /**
   * 按「骨骼缩放」自动隐藏道具（hideByBoneScale）。
   *
   * 这批模型普遍用**把驱动骨骼缩到很小**来表达"这个道具现在不显示"：
   * 实测 Airi.glb 的冰激凌 —— bone_Icecream.scale 在 Cafe_* 三段是 0.315
   * （蒙皮后只剩 29% 大小），Formation_Pickup / Exs 是 1.0，Tactical_Start 0.761。
   * 但 0.315 并不是 0，所以一个缩小版冰激凌仍然挂在脑门上 ✗。
   *
   * 判据：**该网格骨架里的所有骨头缩放都小于阈值** → 视为隐藏。
   * 用"所有"而不是"取最小"，是为了不误伤角色本体 —— 本体有 100+ 根骨骼，
   * 总有骨头接近 1，永远不会全部低于阈值；道具只有 1~2 根，很容易命中。
   *
   * 每帧判定（缩放是在动作里变化的），但会跳过 hideOptional 管理的网格，避免互相打架。
   */
  let boneScaleHideSet = null;   // hideOptional 管理的网格，本规则不碰

  /**
   * 预筛候选：只有**骨头很少**的蒙皮网格才可能"整根被缩到很小"。
   *
   * 原来的实现每帧 traverse 全场景 + 遍历每个网格的所有骨骼 ✗ —— FBX 动辄上千根骨骼
   * （实测某个 FBX 有 1220 根），14 个网格 × 上千根 = 每帧上万次判定，
   * 实测出现 "requestAnimationFrame handler took 76ms" ✗。
   *
   * 而这个规则本来就是给**道具**用的（1~2 根骨头），角色本体根本不可能全部缩到阈值以下 ✗，
   * 所以按骨头数量一次性筛掉，之后每帧只查那几个候选 ✓。
   */
  const BONE_SCALE_MAX_BONES = 8;
  let boneScaleTargets = null;

  function collectBoneScaleTargets() {
    boneScaleTargets = [];
    if (!modelRoot) return 0;
    modelRoot.traverse((o) => {
      if (!o.isMesh || !o.isSkinnedMesh || !o.skeleton) return;
      const bones = o.skeleton.bones;
      if (!bones || !bones.length || bones.length > BONE_SCALE_MAX_BONES) return;
      if (boneScaleHideSet && boneScaleHideSet.has(o)) return;   // 交给 hideOptional
      boneScaleTargets.push(o);
    });
    if (boneScaleTargets.length) console.debug('[hideByBoneScale] 候选网格 ' + boneScaleTargets.length + ' 个（骨头 ≤ ' + BONE_SCALE_MAX_BONES + '）');
    return boneScaleTargets.length;
  }

  function applyBoneScaleHide() {
    if (!cfg.hideByBoneScale || !boneScaleTargets || !boneScaleTargets.length) return;
    const th = Number(cfg.hideByBoneScale);
    if (!(th > 0)) return;
    for (let k = 0; k < boneScaleTargets.length; k++) {
      const o = boneScaleTargets[k];
      const bones = o.skeleton.bones;
      let allSmall = true;
      for (let i = 0; i < bones.length; i++) {
        const sc = bones[i].scale;
        if (sc.x >= th || sc.y >= th || sc.z >= th) { allSmall = false; break; }
      }
      o.visible = !allSmall;
    applyLockedVisibility();
    }
  }

  /**
   * 隐藏指定网格（hideParts）。
   *
   * models/BlueArchiveModels 里有一批"脱落道具"（计算器 / 无人机 / 面具 / 服装配件），
   * 它们的骨骼是与角色骨架平级的独立根，位置由游戏引擎决定 —— GLB 里就是错的，
   * 且靠 attachProps 换父级也修不好（动画的局部值是按原父级写的）。
   * 这种道具最实际的处理就是**藏掉**：
   *
   *   "hideParts": "Calculator|Dron|Prop_Mask"
   *
   * 匹配网格名或材质名（不区分大小写）。
   */
  function applyHideParts() {
    if (!modelRoot) return 0;
    if (!cfg.hideParts) return 0;
    let re;
    try { re = new RegExp(cfg.hideParts, 'i'); } catch { console.warn('[hideParts] 非法正则：', cfg.hideParts); return 0; }
    let n = 0;
    modelRoot.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const hit = re.test(o.name || '') || mats.some((m) => m && re.test(m.name || ''));
      if (!hit) return;
      o.visible = false;
      n++;
    });
    if (n) console.info('[hideParts] 已隐藏', n, '个网格（', cfg.hideParts, '）');
    return n;
  }

  /**
   * 「可选部件」按需显示 —— 对应参考实现的 data-hide-parts="optional"。
   *
   * lihaohong6/BlueArchiveModels 那批模型在 GLB **节点**上带 extras 标记：
   *     Hoshino_Original_Shield_Weapon → { "optional": true, "prop0": true }
   *     Juri_Original_Weapon           → { "optional": true, "prop0": true }
   * GLTFLoader 会把 extras 放进 object.userData，所以直接读 userData.optional。
   * （实测 295 个模型里 17 个带 optional，另有 switch0~3 用于服装/形态切换。）
   *
   * 语义：**默认隐藏，只有当某个动作真的驱动它时才显示**。
   * 实测完全对上：Hoshino 的盾牌只在 Exs / Exs_Cutin 出现（2/36），
   * Juri 的武器只在 Formation_Idle / Tactical_Start 出现（2/8）。
   * 这正好把手写的 visibilityRules 自动化了。
   */
  let optionalParts = null;

  function collectOptionalParts() {
    optionalParts = [];
    if (!modelRoot) return 0;
    modelRoot.traverse((o) => {
      if (!o.userData || o.userData.optional !== true) return;
      const meshes = [];
      o.traverse((c) => { if (c.isMesh) meshes.push(c); });
      if (!meshes.length) return;
      // 它（连同蒙皮骨骼）的名字集合 —— 用来判断哪些动作"动过它"
      const names = new Set();
      o.traverse((c) => {
        if (c.name) names.add(c.name);
        if (c.isSkinnedMesh && c.skeleton) c.skeleton.bones.forEach((b) => { if (b && b.name) names.add(b.name); });
      });
      const used = new Set();
      for (const clip of clips) {
        if (clip.tracks.some((t) => names.has(t.name.slice(0, t.name.lastIndexOf('.'))))) used.add(clip.name);
      }
      optionalParts.push({ name: o.name || '(未命名)', meshes, clips: used, prop: !!o.userData.prop0 });
      if (!boneScaleHideSet) boneScaleHideSet = new Set();
      for (const m of meshes) boneScaleHideSet.add(m);
    });
    if (optionalParts.length) {
      console.info('[hideOptional] 找到', optionalParts.length, '个可选部件：' +
        optionalParts.map((p) => p.name + '(' + p.clips.size + ' 段动作使用)').join(', '));
    }
    return optionalParts.length;
  }

  /** 按当前动作刷新可选部件的显隐；返回显示出来的个数 */
  function applyOptionalParts() {
    if (!optionalParts || !optionalParts.length) return 0;
    let shown = 0;
    for (const part of optionalParts) {
      const on = part.clips.has(currentClipName);
      for (const m of part.meshes) m.visible = on;
      if (on) shown++;
    }
    applyLockedVisibility();   // 被锁定部件优先
    return shown;
  }

  /**
   * 把"脱落的道具骨骼"挂到角色骨骼上（attachProps）。
   *
   * models/BlueArchiveModels 里，道具（计算器 / 盾牌 / 无人机 / 面具 / 服装配件）的骨骼是
   * **与 Bip001_Pelvis 平级的独立根**，游戏里由引擎挂到手上，GLB 本身挂不上 ——
   * 结果道具停在绑定位置、永远不动。动画其实一直在驱动它，但驱动的是
   * "相对于正确父级"的局部变换，父级不对就全错。
   *
   *   "attachProps": [{ "bone": "bone_Calculator", "to": "Bip001_R_Hand" }]
   *
   * ⚠️ **结论：在纯 GLB 数据下修不好，别在这上面花时间。** 三轮实测：
   *
   *   ① 穷举候选父级（双手中/前臂/上臂/武器插槽/骨盆/脊椎，共 10 个）
   *      —— 没有任何一个比"原状"更接近手，抖动反而普遍涨 10~200 倍。
   *   ② 三种钉死法（保持世界 / 位姿归零 / 完全重置）
   *      —— 距离和抖动**全部比原状更差**。
   *   ③ 原状往往就是最优：Yuuka 的计算器距右手 0.296、抖动仅 0.011
   *      （稳稳端在身前，其实是对的）；Hoshino 的盾牌换父级后抖动 2.3
   *      —— 角色才 2 单位高，等于完全乱飞。
   *
   * 原因：这些道具的动画局部变换是**在"脱离的根"空间里**写好的，游戏引擎
   * 另有一套挂接表，GLB 里没有。参考实现（bluearchive.wiki 用的那个 gadget）
   * 对此的答案也是 **data-hide-parts="optional"** —— 藏，而不是修。
   *
   * 所以：标了 extras.optional 的用 hideOptional（已自动处理）；
   * 没标又确实别扭的，用 hideParts 藏掉。
   */
  function applyAttachProps() {
    if (!modelRoot) return 0;
    const list = cfg.attachProps;
    if (!Array.isArray(list) || !list.length) return 0;
    let n = 0;
    for (const it of list) {
      if (!it || !it.bone || !it.to) continue;
      const src = modelRoot.getObjectByName(it.bone);
      const dst = modelRoot.getObjectByName(it.to);
      if (!src || !dst) { console.warn('[attachProps] 找不到节点：', it.bone, '或', it.to); continue; }
      if (src === dst || src.parent === dst) continue;
      let cycle = false;
      for (let q = dst; q; q = q.parent) if (q === src) { cycle = true; break; }
      if (cycle) { console.warn('[attachProps] 不能把', it.bone, '挂到自己的子孙', it.to); continue; }
      modelRoot.updateMatrixWorld(true);
      dst.attach(src);
      n++;
      console.info('[attachProps] 已把', it.bone, '挂到', it.to);
    }
    return n;
  }

  /**
   * 面部不接收阴影（faceNoShadow）。
   *
   * 白昼光下头发会在脸上投一道很明显的影，很难看 —— 官方渲染里脸基本是"干净"的。
   * 这里直接把面部网格的 receiveShadow 关掉：阴影贴图不再作用在脸上，
   * 但头发投在**身体**上的阴影不受影响。
   *
   * 判定复用 facePattern（和面部光照修正同一套"哪些材质算脸"），
   * 所以卡通模式（材质名带 _Toon 后缀）也照样匹配。
   */
  /**
   * 面部是否接收阴影 —— **不再单独配置，由浓度派生**。
   *
   *   celFaceShadowMin >= 0.95（滑块最右）→ 视为"没有面部阴影"，直接不接收
   *   否则                                 → 面部接收阴影
   * （未设 celFaceShadowMin 时看全局 celShadowMin）
   *
   * 为什么要派生而不是各管各的：浓度滑块走的是**卡通着色器的软化**，
   * 对 PBR 通路无效 ✗。而 receiveShadow 在 lights_fragment_begin 里被
   * **所有材质类型**（toon / standard / lambert / phong）检查 ✓，
   * 所以让滑块同时驱动它，一个参数就能覆盖两个通路。
   */
  const FACE_NO_SHADOW_AT = 0.95;

  function deriveFaceNoShadow() {
    const c = celCfg.faceShadowMin;
    const v = (c === null || c === undefined) ? celCfg.shadowMin : Number(c);
    return !(isFinite(v) && v < FACE_NO_SHADOW_AT);
  }

  function applyFaceNoShadow() {
    if (!modelRoot) return 0;
    const re = celFaceRe();
    let nCast = 0;
    let castRe = null;
    if (cfg.noCastPattern) {
      try { castRe = new RegExp(cfg.noCastPattern, 'i'); } catch { castRe = null; }
    }
    modelRoot.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const nameHit = (rx) => mats.some((m) => {
        if (!m) return false;
        if (rx.test(m.name || '')) return true;
        const src = m.userData && m.userData.__src;
        return !!(src && rx.test(src.name || ''));
      });

      // ① 面部不接收阴影
      if (re && nameHit(re)) o.receiveShadow = !cfg.faceNoShadow;

      // ② 指定材质不投影 —— 用它换掉"脸完全不收阴影"：
      //    脸恢复接收阴影（自阴影回来），但头发不进阴影图，刘海就不会在脸上投一片
      if (castRe && nameHit(castRe)) { o.castShadow = false; nCast++; }
    });
    return nCast;
  }

  /** 给卡通材质挂注入；参数变了靠 customProgramCacheKey + needsUpdate 触发重编译 */
  /**
   * 给**任意受光材质**（含 PBR 的 MeshStandardMaterial）挂上「投射阴影软化」。
   *
   * 这段逻辑与材质无关 ✗ —— 它改写的是 lights_fragment_begin 里的 getShadow(...)，
   * 而 toon / standard / lambert 用的是同一个 chunk ✓。
   * 所以 celShadowMin（阴影浓淡）与 celFaceShadowMin（脸部）在 PBR 下同样能生效 ✓。
   *
   * ⚠️ 刻意与 patchToonMaterial 里的那份**并存**而不是抽公共函数：
   *     toon 路径已经验证可用，这里只做「新增」不碰它 ✓（宁可有少量重复，也不动已验证的代码）
   */
  function patchShadowSoften(mat, isFace) {
    mat.userData.__shadowVersion = celProgramVersion;
    const prevKey = mat.userData.__shadowKeyed ? null : mat.customProgramCacheKey;
    mat.userData.__shadowKeyed = true;
    mat.customProgramCacheKey = () => 'ba3d-shadow:' + celProgramVersion + ':' + (isFace ? 'f' : 'b')
      // ⚠️ 必须 .call(mat)！three 默认的 customProgramCacheKey 是
      //     { return this.onBeforeCompile.toString(); }
      //     存成裸方法引用后 this 会变成 undefined → 读 this.onBeforeCompile 直接抛错 ✗
      + (prevKey ? '|' + prevKey.call(mat) : '');
    // ⚠️ 只在**第一次** patch 时接管原有的 onBeforeCompile。
    //    否则 celProgramVersion 变化导致重复 patch 时，prevOBC 会指向我们自己上一次的
    //    回调 → 软化逻辑被链式执行多遍 ✗
    const prevOBC = mat.userData.__shadowPatched ? null : mat.onBeforeCompile;
    mat.userData.__shadowPatched = true;
    mat.onBeforeCompile = (shader, renderer) => {
      if (prevOBC) prevOBC.call(mat, shader, renderer);   // 同理：保留 mat 作为 this
        const faceShadow = isFace && celCfg.faceShadowMin !== null && celCfg.faceShadowMin !== undefined;
        const keep = Math.max(0, Math.min(1, Number(faceShadow ? celCfg.faceShadowMin : celCfg.shadowMin)));
        if (keep > 0) {
          const dirRaw = 'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
          const spotRaw = 'getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] )';
          const k = keep.toFixed(4);
          const soften = (src) => src
            .split(dirRaw).join('mix( ' + k + ', 1.0, ' + dirRaw + ' )')
            .split(spotRaw).join('mix( ' + k + ', 1.0, ' + spotRaw + ' )');
          /**
           * ⚠️ 必须替换 **#include 本身**，不能去replace展开后的语句。
           * three 的调用顺序是：
           *   WebGLRenderer → material.onBeforeCompile( parameters, renderer )   ← 回调在这里
           *   WebGLProgram  → resolveIncludes( fragmentShader )                  ← include 才展开
           * 也就是说回调拿到的还是**含 #include 的原始源码**，
           * 直接找 getShadow(...) 那一行是找不到的（cel 渐变能生效，正因为它替换的是 include）。
           * 于是这里取 ShaderChunk 里的原文、软化后再整体顶替 include。
           */
          const INCLUDE = '#include <lights_fragment_begin>';
          const chunk = (THREE.ShaderChunk && THREE.ShaderChunk.lights_fragment_begin) || '';
          const softChunk = chunk ? soften(chunk) : '';
          const hitChunk = softChunk && softChunk !== chunk && shader.fragmentShader.includes(INCLUDE);
          if (hitChunk) {
            shader.fragmentShader = shader.fragmentShader.replace(INCLUDE, softChunk);
          } else if (shader.fragmentShader.includes(dirRaw)) {
            // 兜底：某些版本/路径下 include 已被展开
            shader.fragmentShader = soften(shader.fragmentShader);
          }
        }
    };
    return mat;
  }
  function patchToonMaterial(mat, isFace) {
    /**
     * ⚠️ 局部 helper ✗ 这个函数**不能**用 lilShaderGLSL / lilMatCapGLSL 里那些同名局部函数。
     *    它们各自在自己的作用域里定义了 num / v3 / col … ✗ 外面根本看不到 ✓
     *
     *    踩过四次同一类坑：
     *      · hex（TDZ ✗ 模块 const）
     *      · capRe（被删掉了 ✗ 但代码还在引用）
     *      · rgb2h（只有别的 IIFE 定义过）
     *      · num（只有几个 GLSL 生成器定义过）← 就是这次 ✓
     *    症状都一样：ReferenceError ✗ 而且都在 try/catch 里 ✗ 只出现在控制台 ✓
     */
    const num = (v, d) => (v === undefined || v === null || !isFinite(Number(v)) ? d : Number(v));
    // ⚠️ 必须**动态**读 celProgramVersion：写死成 userData.__celKey 的话，
    // setCel() 递增版本号后 cache key 不变，three 既不重编也不重建 —— 参数改了没反应。
    mat.userData.__celVersion = celProgramVersion;
    mat.userData.__celShader = shaderMode;   // 复用判定要用：cel ↔ lilToon 必须重建
    // ⚠️ cacheKey 必须带材质名 ✗ 否则不同材质的程序会被复用 ✗ 参数就串了 ✓
    const __cfgM = lilCfgFor(mat);
    const __hasOv = __cfgM !== lilCfg;
    /**
     * Dissolve 的 alphaTest 管理 —— **必须在 onBeforeCompile 之前**。
     *
     * ⚠️ 这是踩过的坑：把 mat.alphaTest 放在 onBeforeCompile 回调里赋值 ✗
     *    那时 WebGLProgram 已经开始编译 ✗ USE_ALPHATEST 这个宏早已确定 ✗
     *    结果 alphatest_fragment 里的 discard **不会生效** ✗
     *    表现是「模型变成剪影」—— alpha 被改小但不丢弃 ✗
     *    不透明渲染下 alpha 又被忽略 ✗ 所以看起来只是变暗/变黑 ✓
     *
     * three 的判定：material.alphaTest > 0 → 定义 USE_ALPHATEST ✓
     * 所以这里用 userData 记住材质原本的 alphaTest ✗ 关掉 Dissolve 时还原 ✓
     */
    {
      if (mat.userData.__ba3dOrigAlphaTest === undefined) {
        mat.userData.__ba3dOrigAlphaTest = mat.alphaTest || 0;
      }
      /**
       * 主色层 2nd / 3rd 的「剔除」需要**双面渲染**才能看到背面。
       *
       * ⚠️ 踩过的坑：cull=1（只背面 ✓）在 side=FrontSide 的材质上**永远没有片元** ✗
       *    因为背面在光栅化阶段就被剔除了 ✗ 片元里的 gl_FrontFacing 恒为 true ✗
       *    于是 a 被恒置 0 ✗ 表现是「叠加消失」✗ 看起来像坏了 ✓
       *    cull=2（只正面 ✓）则完全没变化 ✗ 和 cull=0 一样 ✓
       *    —— 两个现象都在实测里出现过 ✓
       *
       * 解法：只要任意一层开了剔除 ✗ 就把材质改成 DoubleSide ✗ 关掉时还原 ✓
       */
      {
        if (mat.userData.__ba3dOrigSide === undefined) {
          mat.userData.__ba3dOrigSide = mat.side;
        }
        const __needDS = (shaderMode === 'lilToon')
          && [__cfgM.main2nd, __cfgM.main3rd].some((Lc) => Lc && Lc.use && Math.round(Number(Lc.cull) || 0) !== 0);
        const __wantSide = __needDS ? THREE.DoubleSide : mat.userData.__ba3dOrigSide;
        if (mat.side !== __wantSide) {
          mat.side = __wantSide;
          mat.needsUpdate = true;
        }
      }
      /**
       * 法线贴图 1st：交给 three 原生管线（lil_common_frag.hlsl:555 ✓）
       *
       *   three 侧：mat.normalMap + mat.normalScale ⇒ USE_NORMALMAP_TANGENTSPACE
       *     normal_fragment_maps 里：
       *       vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
       *       mapN.xy *= normalScale;
       *       normal = normalize( tbn * mapN );
       *
       * ⚠️ lilToon 的 _BumpScale 是**标量**（Range -10~10 ✓）✗ three 的 normalScale 是 vec2 ✓
       *    ⇒ 两个分量填同一个值 ✓
       * ⚠️ 贴图必须是**线性空间**（法线数据不是颜色 ✓）✗ 用 NoColorSpace ✓
       */
      {
        const __bc = __cfgM.bump || {};
        const __bUrl = (shaderMode === 'lilToon' && __bc.use) ? __bc.tex : null;
        const __bTex = __bUrl ? resolveNormalTexture(__bUrl) : null;
        if (__bTex) {
          mat.normalMap = __bTex;
          const __bS = Math.max(-10, Math.min(10, num(__bc.scale, 1)));
          mat.normalScale.set(__bS, __bS);
        } else {
          mat.normalMap = null;
          mat.normalScale.set(1, 1);
        }
        // 2nd 法线贴图也要 tbn ✗ 但 three 只在有 normalMap 时才声明它 ✓
        //   ⇒ 只有 2nd（没有 1st）时挂一张 1×1 的**平坦法线** ✗ 保证 tbn 存在 ✓
        const __b2c = __cfgM.bump2nd || {};
        const __b2Url = (shaderMode === 'lilToon' && __b2c.use) ? __b2c.tex : null;
        // ⚠️ MatCap 的自定义法线也要 tbn ✗ 所以一起算进「需要 tbn」的判断（第 3 个来源）
        const __cnUrl = (__cfgM.matcap && __cfgM.matcap.customNormal && __cfgM.matcap.bumpMap)
          || (__cfgM.matcap2nd && __cfgM.matcap2nd.customNormal && __cfgM.matcap2nd.bumpMap) || null;
        if (!mat.normalMap && (__b2Url || __cnUrl)) {
          mat.normalMap = normalPlaceholder();
          mat.normalScale.set(1, 1);
        }
        if (window.__ba3dDebugUI && shaderMode === 'lilToon') {
          console.debug('[normal] 1st: use=' + (__bc.use ? 1 : 0) + ' tex=' + (__bc.tex ? '有' : '无')
            + ' → 生效=' + (__bUrl ? '是' : '**否（要开「1st 启用」）**') + ' scale=' + num(__bc.scale, 1)
            + ' | 2nd: use=' + (__b2c.use ? 1 : 0) + ' tex=' + (__b2c.tex ? '有' : '无')
            + ' → 生效=' + (__b2Url ? '是' : '否') + ' | tbn=' + (mat.normalMap ? '已启用' : '未启用'));
        }
      }

      // 模板缓冲（lilToon 的 _Stencil* ✗ three 原生支持 ✓）
      applyStencil(mat, __cfgM.stencil, (shaderMode === 'lilToon' && __cfgM.stencil && __cfgM.stencil.use) ? (mat.name || '?') : null);
      // 渲染状态（_TransparentMode / _Cutoff / _Cull ✗ 默认全 -1 = 不改 ✓）
      applyLilRenderState(mat, __cfgM);
      const __d0 = Math.round(Math.max(0, Math.min(3, Number((__cfgM.dissolve || {}).mode) || 0)));
      const __wantAt = (shaderMode === 'lilToon' && __d0 > 0)
        ? Math.max(0.5, mat.userData.__ba3dOrigAlphaTest || 0)
        : mat.userData.__ba3dOrigAlphaTest;
      if (mat.alphaTest !== __wantAt) {
        mat.alphaTest = __wantAt;
        mat.needsUpdate = true;   // 改 alphaTest 必须让 three 重编程序 ✓
      }
    }
    /**
     * ⚠️ cacheKey 必须带材质名 ✗ 否则不同材质的程序会被复用 ✗ 参数就串了 ✓
     * ⚠️ 也必须**无条件**带 lilMaterialVersion ✗
     *    因为「这个材质有没有覆盖」是打补丁那一刻的判定 ✗ 之后才加覆盖的话 ✗
     *    它的 key 不会变 → three 既不重编也不重建 ✗ 表现就是「设了没反应」✓
     *    带上版本号后 ✗ 任何按材质改动都会让材质重编译 ✓ 对配置界面来说开销可接受 ✓
     */
    mat.customProgramCacheKey = () => 'ba3d-cel:' + celProgramVersion + ':' + shaderMode + ':' + (mat.name || '')
      + ':v' + lilMaterialVersion;
    mat.onBeforeCompile = (shader) => {
      // shader='none' → 不注入任何东西，就是 three 原生的 MeshToonMaterial
      if (shaderMode === 'none') return;
      if (window.__ba3dDebugUI && mat.userData.__ba3dDisLog !== shaderMode + ':' + mat.alphaTest) {
        mat.userData.__ba3dDisLog = shaderMode + ':' + mat.alphaTest;
        const __dd = __cfgM.dissolve || {};
        if (Math.round(Number(__dd.mode) || 0) > 0 || mat.alphaTest > 0) {
          console.debug('[dissolve] mat=' + (mat.name || '?')
            + ' mode=' + Math.round(Number(__dd.mode) || 0)
            + ' alphaTest=' + mat.alphaTest
            + ' defs=' + (shader.defines && shader.defines.USE_ALPHATEST ? 'USE_ALPHATEST=有' : 'USE_ALPHATEST=无')
            + ' 会注入=' + (shaderMode === 'lilToon' && Math.round(Number(__dd.mode) || 0) > 0));
        }
      }
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <gradientmap_pars_fragment>', celGradientGLSL(__cfgM, celCfgFor(mat)));

      /**
       * 遮罩取值函数（lilToon 的 triMask ✗）。
       *
       * ⚠️ 注入位置**必须是 color_pars_fragment 之后** ✗
       *    vColor 这个 varying 是在 color_pars_fragment 里声明的 ✓
       *    放在 #include <common> 会报 "vColor : undeclared identifier" ✗
       *    （GLSL 要求声明先于使用 ✗ 不像 JS 有提升 ✓）
       *    实测放 <common> 时 cel 与 lilToon 两种模式**全部**编译失败 ✗
       *
       * ⚠️ 也不能放 lilShaderGLSL() ✗ 那个块注入在 dithering_fragment ✗ 位于 main() 内 ✗
       *    GLSL 不允许函数嵌套定义 ✓
       */
      if (shader.fragmentShader.includes('#include <color_pars_fragment>')) {
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <color_pars_fragment>',
          '#include <color_pars_fragment>\n' +
          'float ba3dMaskR( void ) {\n#ifdef USE_COLOR\n\treturn vColor.r;\n#else\n\treturn 1.0;\n#endif\n}\n' +
          'float ba3dMaskG( void ) {\n#ifdef USE_COLOR\n\treturn vColor.g;\n#else\n\treturn 1.0;\n#endif\n}\n' +
          'float ba3dMaskB( void ) {\n#ifdef USE_COLOR\n\treturn vColor.b;\n#else\n\treturn 1.0;\n#endif\n}\n');
      }
      // 诊断：把"实际注入的是哪套分档"记在材质上 ✗
      // 这是 100% 决定性的证据 —— 不看配置、不看变量，直接看编译进着色器的代码
      mat.userData.__fragKind = /ba3dLilToon\( t,/.test(shader.fragmentShader) ? 'lilToon'
        : (/floor\( t \*/.test(shader.fragmentShader) ? 'cel' : 'none');
      mat.userData.__fragShaderAtCompile = shaderMode;

      // —— lilToon 特性：Rim / MatCap / 自发光 / 背光 ——
      // ⚠️ 这里【不能】用 if (shaderMode !== 'lilToon') return 做守卫 ✗
      //     因为它前面还有「阴影软化（阴影浓淡 / 脸部）」那段代码，
      //     early-return 会让那两个滑块整个失效（已经踩过这个坑）。
      //     四项特性默认全关时 lilShaderGLSL() 返回空串 ✓ 本来就不会有任何效果，无需守卫。
      // 自己注入视角方向 varying（不赌 lit 材质是否定义了 vViewPosition）
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vBa3dViewPos;')
        // ⚠️ 自己注入 uv varying ✗ 不赌材质有没有开 USE_UV（vUv 只在有贴图时才存在 ✓）
        .replace('#include <uv_pars_vertex>', '#include <uv_pars_vertex>\nvarying vec2 vBa3dUv;\n' +
            /**
             * ⚠️⚠️ three **自己**会声明 uv1 —— 在 WebGLProgram 的 vertex 前缀里：
             *      #ifdef USE_UV1
             *          attribute vec2 uv1;
             *      #endif
             *   而本模型的材质用了 uv1 ⇒ USE_UV1 被定义 ⇒ 我们再声明一次就是
             *      ERROR: 0:269: 'uv1' : redefinition    ← 实测踩到 (WebGL 直接不 link)
             *   （我第一次查 three 源码没找到 ✗ 因为那行前面有个**制表符** ✗ 正则漏了）
             *   ⇒ 用 #ifndef 兜住：three 声明了就跳过、没声明就我们补 ✓
             */
            '#ifndef USE_UV1\n' +
            'attribute vec2 uv1;\n' +
            '#endif\n' +
            'varying vec2 vBa3dUv1;\n' +
            'varying float vBa3dRightHand;\n' +
            '\nvarying vec3 vBa3dPositionOS;\nvarying vec3 vBa3dPositionWS;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>'
          + '\n' + '\tvBa3dUv = uv;'
          + '\n' + '\tvBa3dPositionOS = position;'
          + '\n' + '\tvBa3dUv1 = uv1;'
          /**
           * ★ isRightHand（lil_pass_forward_normal.hlsl:341）
           *      fd.isRightHand = input.tangentWS.w > 0.0;
           *   初值 true（lil_common.hlsl:162）⇒ 没有切线时回退 1.0
           *   ⚠️ three 只在 USE_TANGENT 时声明 tangent ⇒ 必须 #ifdef
           *      （无条件声明 attribute vec4 tangent 会和 three 重复 ⇒ 编译失败）
           *   ⚠️ uv1 不同：three 只自动声明 position/normal/uv ⇒
           *      无条件写 attribute vec2 uv1 是安全的
           *      （几何体没这个属性时 WebGL 读出 (0,0) ⇒ 无害）
           */
          + '\n' + '#ifdef USE_TANGENT'
          + '\n' + '\tvBa3dRightHand = ( tangent.w > 0.0 ) ? 1.0 : 0.0;'
          + '\n' + '#else'
          + '\n' + '\tvBa3dRightHand = 1.0;'
          + '\n' + '#endif')
                /**
         * ★ 对象空间 vs 世界空间 —— Dissolve 模式 3 的归一化必须和包围盒同一个空间。
         *
         * 踩过的坑：包围盒用 THREE.Box3().setFromObject()（**世界空间** ✓）
         *   而着色器里用的是 object 空间的 position（**对象空间** ✓）
         *   两者单位可以差几十上百倍 ✗ 于是「减去中心」几乎没效果 ✗ 归一化全错 ✓
         *   控制台上那行 k/center 看起来正常 ✗ 但代入着色器就是不对 ✓
         *
         * 现在统一走**世界空间**：
         *   · 顶点：vBa3dPositionWS = ( modelMatrix * vec4( transformed, 1 ) ).xyz
         *     （放在 project_vertex 之后 ✗ 此时 transformed 已完成蒙皮与形态目标 ✓）
         *   · 包围盒：Box3.setFromObject(modelRoot) —— 同一个空间 ✓
         */
        .replace('#include <project_vertex>', '#include <project_vertex>\n\tvBa3dViewPos = -mvPosition.xyz;\n\tvBa3dPositionWS = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>',
          '#include <common>\nvarying vec3 vBa3dViewPos;\n' +
          'varying vec2 vBa3dUv;\n' +
          'varying vec2 vBa3dUv1;\n' +
          'varying float vBa3dRightHand;\n' +
          'varying vec3 vBa3dPositionOS;\n' +
          'varying vec3 vBa3dPositionWS;\n' +
          'float ba3dDissolveEdge = 0.0;   // Dissolve 边缘因子（末尾加色用）\n' +
          // 主色层 2nd / 3rd 的中间结果：光照前算出来 ✗ 光照后还要用（见 lilMainLayerGLSL）✓
          'vec4 ba3dColor2nd = vec4(1.0);\n' +
        // 层溶解的边缘强度（1st/2nd 各一份 ✗ 由 before 阶段写入 ✗ after 阶段加色 ✓）
        'float ba3dDisEdge2nd = 0.0;\n' +
        'float ba3dDisEdge3rd = 0.0;\n' +
        // ★ 三层阴影各自的法线（_Shadow{,2nd,3rd}NormalStrength · lil_common_frag.hlsl:928-931）
        //   ⚠️ getGradientIrradiance 是个**独立函数** · 拿不到主作用域的局部变量
        //      ⇒ 用全局 · 赋值点放在 lights_fragment_begin 之前（那时 normal 已经算好）
        //   ⚠️ 默认强度 1 ⇒ mix(origN, N, 1) = N ⇒ 不开这个特性时行为**完全一致**
        'vec3 ba3dShadowN1 = vec3( 0.0, 0.0, 1.0 );\n' +
        'vec3 ba3dShadowN2 = vec3( 0.0, 0.0, 1.0 );\n' +
        'vec3 ba3dShadowN3 = vec3( 0.0, 0.0, 1.0 );\n' +
          'vec4 ba3dColor3rd = vec4(1.0);\n' +
          // 两个顶层辅助函数（GLSL 不允许嵌套定义）
          // 实时阴影遮罩（1=受光 0=全阴影）✗ 由下面的 lights_fragment_begin 之前赋值 ✓
          // ⚠️ 必须在这里（<common> 之后）声明 ✗ 因为 getGradientIrradiance 定义在
          //    gradientmap_pars_fragment ✗ 比 diffuseColor（map_fragment 前）更早 ✓
          'float ba3dShadowMaskG = 1.0;\n' +
          // lil_common_functions.hlsl:21 的 5 参重载（多一个 borderRange）
          'float ba3dLilToonRange( const float value, const float border, const float blur, const float borderRange ) {\n' +
          '\tfloat bMin = saturate( border - blur * 0.5 - borderRange );\n' +
          '\tfloat bMax = saturate( border + blur * 0.5 );\n' +
          '\treturn saturate( ( value - bMin ) / saturate( bMax - bMin ) );\n' +
          '}\n' +
          'float ba3dLilToon( const float value, const float border, const float blur ) {\n' +
          '\tfloat bMin = saturate( border - blur * 0.5 );\n' +
          '\tfloat bMax = saturate( border + blur * 0.5 );\n' +
          '\treturn saturate( ( value - bMin ) / saturate( bMax - bMin ) );\n' +
          '}\n' +
          'vec3 ba3dBlend( vec3 dstCol, vec3 srcCol, float srcA, uint blendMode ) {\n' +
          '\tvec3 ad = dstCol + srcCol;\n' +
          '\tvec3 mu = dstCol * srcCol;\n' +
          '\tvec3 outCol = srcCol;\n' +
          '\tif ( blendMode == 1u ) outCol = ad;\n' +
          '\tif ( blendMode == 2u ) outCol = max( ad - mu, dstCol );\n' +
          '\tif ( blendMode == 3u ) outCol = mu;\n' +
          '\treturn mix( dstCol, outCol, srcA );\n' +
          '}\n' +
          // vec3 alpha 版：MatCap 的 _MatCapBlendMask 取 RGB ✗ 逐通道混合（lil_common_frag.hlsl:1557 / :1625）
          'vec3 ba3dBlend3( vec3 dstCol, vec3 srcCol, vec3 srcA, uint blendMode ) {\n' +
          '\tvec3 ad = dstCol + srcCol;\n' +
          '\tvec3 mu = dstCol * srcCol;\n' +
          '\tvec3 outCol = srcCol;\n' +
          '\tif ( blendMode == 1u ) outCol = ad;\n' +
          '\tif ( blendMode == 2u ) outCol = max( ad - mu, dstCol );\n' +
          '\tif ( blendMode == 3u ) outCol = mu;\n' +
          '\treturn mix( dstCol, outCol, srcA );\n' +
          '}\n' +
          '')
        /**
         * 2nd 法线贴图（lil_common_frag.hlsl:579 ✓）
         *
         *   normalmap = lilBlendNormal( normalmap,
         *                 lilUnpackNormalScale( SAMPLE(_Bump2ndMap),
         *                   _Bump2ndScale * SAMPLE(_Bump2ndScaleMask).r ) );
         *
         * lilBlendNormal 就是 **Whiteout blend**（lil_common_functions.hlsl:135 ✓）：
         *   return float3( dst.xy + src.xy, dst.z * src.z );
         *
         * ⚠️ three 已经在 normal_fragment_maps 里把 1st 混进 view 空间了 ✗
         *    要在**切线空间**混合（和 lilToon 一致 ✓）就只能把 1st 重新解一遍 ✓
         *    ⇒ 多一次采样 ✗ 但公式正确 ✓
         *    混合完再 mul( tbn ) 回到 view 空间 ✓
         */
        .replace('#include <normal_fragment_maps>', (function () {
          /**
           * ⚠️ 加了两条诊断 ✗ 因为「日志说生效=是 ✗ 但看不出变化」✓
           *    日志那句只说明**配置里有 URL** ✗ 不代表下面这段 GLSL 真的注进去了 ✓
           *    这一段依赖两件事：
           *      ① '#include <normal_fragment_maps>' 在当前片元着色器里**真的存在**
           *         （不存在 ⇒ .replace 静默无效 ⇒ 什么都不发生 ✓）
           *      ② USE_NORMALMAP_TANGENTSPACE 被定义（否则 tbn 不存在 ⇒ 编译失败 ✓）
           */
          if (window.__ba3dDebugUI && shaderMode === 'lilToon') {
            const b2d = __cfgM.bump2nd || {};
            console.debug('[normal2nd] 命中 include=' + shader.fragmentShader.includes('#include <normal_fragment_maps>')
              + ' use=' + (b2d.use ? 1 : 0) + ' tex=' + (b2d.tex ? '有' : '无')
              + ' scale=' + num(b2d.scale, 1) + ' mask=' + (b2d.scaleMask ? '有' : '无'));
          }
          if (shaderMode !== 'lilToon') return '#include <normal_fragment_maps>';
          const b2 = __cfgM.bump2nd || {};
          if (!b2.use || !b2.tex) return '#include <normal_fragment_maps>';
          const sc = Math.max(-10, Math.min(10, num(b2.scale, 1)));
          const hasMask = !!b2.scaleMask;
          const code = [
            '#include <normal_fragment_maps>',
            '// ===== 2nd 法线贴图（lil_common_frag.hlsl:579 · Whiteout blend ✓）=====',
            '{',
            '  vec3 ba3dB1n = vec3( 0.0, 0.0, 1.0 );',
            '#ifdef USE_NORMALMAP_TANGENTSPACE',
            '  ba3dB1n = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;',
            '  ba3dB1n.xy *= normalScale;',
            '#endif',
            '  vec3 ba3dB2n = texture2D( ba3dBump2ndMap, vBa3dUv ).xyz * 2.0 - 1.0;',
            '  ba3dB2n.xy *= ' + sc.toFixed(4) + (hasMask ? ' * texture2D( ba3dBump2ndScaleMask, vBa3dUv ).r' : '') + ';',
            '  vec3 ba3dBw = vec3( ba3dB1n.xy + ba3dB2n.xy, ba3dB1n.z * ba3dB2n.z );',
            '  normal = normalize( tbn * normalize( ba3dBw ) );',
            '}',
          ].join('\n');
          return code;
        })())
        /**
         * ══ _UseDither（lil_common_frag.hlsl:524-546）══
         *
         * ⚠️ 注入点在 `#include <dithering_fragment>` **之前** ✓
         *    那时颜色已全算完 ⇒ 把 alpha 量化到 gl_FragColor.a 上 ✓
         *
         * ⚠️ lilSamplePointRepeat 在 GLSL ES 1.00 下的等价写法：
         *      HLSL: uint2 uv = (uint2)positionCS.xy % (uint2)size;  tex2D(tex, uv/size)
         *      GLSL: vec2 uv = mod( floor( gl_FragCoord.xy ), SIZE ) / SIZE
         *    （GLSL ES 1.00 没有 uint ✗ 用 float 的 mod + floor）
         *
         * ⚠️ 尺寸用 uniform 传 ✗ 不写死 —— 贴图加载完才知道宽高
         * ⚠️ use=false 时返回原文 ⇒ 零副作用
         * ⚠️⚠️ 锚点必须是**完整的一条 replace** ✗
         *    上一版只匹配了它的前两行 ⇒ 把链截断了 ⇒ SyntaxError（踩过）
         */
        .replace('#include <dithering_fragment>', (function () {
          const D = __cfgM.dither || {};
          if (!D.use) return '#include <dithering_fragment>';
          const mx = Math.max(1, Math.min(255, Number(D.maxValue) || 255));
          const code = [
            '// _UseDither：把 alpha 量化成屏幕空间点阵（lil_common_frag.hlsl:524-546）',
            '{',
            /**
             * ⚠️ 采样点用**纹素中心**（+ 0.5）· 而不是 lilToon 字面的 uv/size ✓
             *
             *   lilToon:  uint2 uv = (uint2)positionCS.xy % (uint2)size;
             *             return tex2D(tex, uv / size);        // ← 纹素**左下角**
             *
             *   Unity 那边 _DitherTex 一般是 Point 过滤 ⇒ 左下角 = 中心 ⇒ 等价 ✓
             *   但 three 加载贴图默认是 **LinearFilter** ⇒ 落在角上会**混合 4 个纹素**
             *   ⇒ 点阵被糊成灰阶 ⇒ 抖动就不成点阵了 ✓
             *   ⇒ 加 0.5 落到中心 ⇒ Point / Linear 两种过滤下都对 ✓
             */
            '  vec2 ba3dDitherCell = mod( floor( gl_FragCoord.xy ), ba3dDitherSize );',
            '  vec2 ba3dDitherUv = ( ba3dDitherCell + 0.5 ) / ba3dDitherSize;',
            '  float ba3dDitherV = texture2D( ba3dDitherTex, ba3dDitherUv ).r;',
            '  gl_FragColor.a = gl_FragColor.a >= ( ba3dDitherV * 255.0 + 1.0 ) / ' + (mx + 2).toFixed(1) + ' ? 1.0 : 0.0;',
            '}',
          ].join('\n');
          if (typeof console !== 'undefined') console.debug('[dither] 已注入 · maxValue=' + mx
            + ' tex=' + (D.url ? '有' : '无（占位 1×1 ⇒ 全 1 ⇒ 阈值恒定）'));
          return code + '\n#include <dithering_fragment>';
        })())
        .replace('#include <dithering_fragment>', (function () {
          const blk = lilShaderGLSL(__cfgM);
          return blk ? (blk + '\n#include <dithering_fragment>') : '#include <dithering_fragment>';
        })())
        /**
         * ══ 主色贴图的 UV / 色调（_MainTexHSVG / _MainTex_ScrollRotate）══
         *
         * ⚠️ 两处都要注入 · 而且必须用**同一份**判定结果（避免重复打印日志 ✓）：
         *    · include common        → uniform + 两个 helper（函数定义要在文件作用域 ✓）
         *    · include map_fragment  → 换成打过补丁的采样 + HSVG ✓
         *
         * ⚠️ 全默认时生成器返回 null ⇒ 两个 replace 都退化成原文 ⇒ 零副作用 ✓
         *
         * ⚠️⚠️ 注入链是 .replace().replace()… 组成的**一个语句** ·
         *    往末尾追加时**不能带分号** · 分号要留到最后 ✓
         *    （踩过一次：追加后报 Unexpected token '.' ✓）
         */
        .replace('#include <common>', (function () {
          const __mt = lilMainTexUVGLSL(__cfgM, true);
          if (!__mt) return '#include <common>';
          /**
           * ⚠️⚠️ **同一个对象引用** ✗ 不要新建 { value: 0 } ✓
           *    新建的话每帧改的是模块级那个 · 而 shader 读到的是另一个 ⇒ 永远是 0 ✓
           *    （这就是「维护 shader 列表」那种写法失效的原因 ✓）
           */
          shader.uniforms.uBa3dTime = ba3dTimeUniform;
          return '#include <common>' + '\n' + 'uniform float uBa3dTime;' + __mt.pre;
        })())
        /**
         * ══ uBa3dTime 的**无条件**声明 ══
         *
         * ⚠️⚠️ 上面那条只在 mainTexHSVG / mainTexScrollRotate 非默认时才注入 ·
         *    但 **Decal 的图集动画也用 uBa3dTime**（lilCalcAtlasAnimation）⇒
         *    只开 Decal、不动主色滚动时 ⇒ 'uBa3dTime' : undeclared identifier ⇒
         *    fragment shader 编译失败 ⇒ program 不 link ⇒ **整个模型不渲染**（实测踩到）
         *
         * ⇒ 这里再挂一条**无条件**的：只在还没声明过时补上
         *   并且顺手把共享对象挂上 ⇒ 无论哪条路径先跑都指向同一个 ba3dTimeUniform
         *
         * ⚠️ 未使用的 uniform 会被 GLSL 编译器优化掉 ⇒ 声明了不用**没有代价**
         */
        .replace('#include <common>', (function () {
          if (shader.fragmentShader.indexOf('uniform float uBa3dTime;') >= 0) return '#include <common>';
          shader.uniforms.uBa3dTime = ba3dTimeUniform;
          return '#include <common>' + '\n' + 'uniform float uBa3dTime;';
        })())
        .replace('#include <map_fragment>', (function () {
          const __mt = lilMainTexUVGLSL(__cfgM);
          if (!__mt) return '#include <map_fragment>';
          /**
           * three 的 map_fragment 原文（vendor/three · 除下面那一行外逐字保留 ✓）：
           *     #ifdef USE_MAP
           *       vec4 sampledDiffuseColor = texture2D( map, vMapUv );
           *       #ifdef DECODE_VIDEO_TEXTURE ... #endif
           *       diffuseColor *= sampledDiffuseColor;
           *     #endif
           *
           * ⚠️ vMapUv **已经含 _MainTex_ST**（uvTransform 在顶点着色器算好 ✓）
           *    ⇒ 这里**不再乘 ST** · 只叠旋转 + 滚动 ✓（lilCalcUV 的 4 参版本 ✓）
           */
          const code = [
            '#ifdef USE_MAP',
            __mt.useUV ? '\tvec2 ba3dUvMain2 = ba3dMainUvScroll( vMapUv );' : '\tvec2 ba3dUvMain2 = vMapUv;',
            '\tvec4 sampledDiffuseColor = texture2D( map, ba3dUvMain2 );',
            '#ifdef DECODE_VIDEO_TEXTURE',
            '\tsampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );',
            '#endif',
            '\tdiffuseColor *= sampledDiffuseColor;',
            '#endif',
          ];
          if (__mt.useHSV) {
            code.push('// _MainTexHSVG（lil_common_frag.hlsl:317 ✓）');
            code.push('diffuseColor.rgb = ba3dToneCorrectionMain( diffuseColor.rgb, vec4( '
              + __mt.H.toFixed(6) + ', ' + __mt.S.toFixed(6) + ', ' + __mt.V.toFixed(6) + ', ' + __mt.G.toFixed(6) + ' ) );');
          }
          const out = code.join('\n');
          const bad = ['lerp(', 'frac(', 'atan2(', 'tex2D(', 'mul('].filter((x) => out.includes(x));
          if (bad.length) console.error('[mainTex] 注入后出现 HLSL 写法 ' + JSON.stringify(bad) + ' · 会编译失败！');
          return out;
        })());
      // Dither 贴图（_DitherTex · 默认 white ⇒ 全 1）
      {
        const __dUrl = (__cfgM.dither && __cfgM.dither.url) || null;
        const __dTex = __dUrl ? resolveMatCapTexture(__dUrl) : null;
        shader.uniforms.ba3dDitherTex = { value: __dTex || layerPlaceholder() };
        const img = __dTex && __dTex.image;
        shader.uniforms.ba3dDitherSize = {
          value: new THREE.Vector2((img && img.width) || 1, (img && img.height) || 1),
        };
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>',
          '#include <common>' + '\n' + 'uniform sampler2D ba3dDitherTex;' + '\n' + 'uniform vec2 ba3dDitherSize;');
      }
      // MatCap 贴图：按材质取（URL 来自该材质合并后的 cfg ✗ 见 lilCfgFor）
      /**
       * ⚠️ MatCap 的贴图 uniform 必须**无条件声明** ✗ 不能只在贴图加载成功时声明 ✓
       *    因为 lilMatCapGLSL 生成的是**固定文本**（有 url 就发采样代码 ✓）
       *    贴图是异步加载的 ✗ 第一次编译时可能还没到 ✗
       *    那时 uniform 不存在 ✗ 着色器报 'ba3dMatCap' : undeclared identifier ✓
       *    ⇒ 和之前 Dissolve 遮罩那个坑完全一样 ✓
       *      用 1×1 占位贴图顶着 ✗ 加载完再重建材质 ✓
       */
      {
        const __capUrl = (__cfgM.matcap && __cfgM.matcap.url) || null;
        const __capTex = __capUrl ? resolveMatCapTexture(__capUrl) : null;
        shader.uniforms.ba3dMatCap = { value: __capTex || layerPlaceholder() };
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>', '#include <common>\nuniform sampler2D ba3dMatCap;');
      }

      // MatCap 2nd 贴图（复用同一个 URL 缓存 ✓）
      {
        const __cap2Url = (__cfgM.matcap2nd && __cfgM.matcap2nd.url) || null;
        const __cap2Tex = __cap2Url ? resolveMatCapTexture(__cap2Url) : null;
        shader.uniforms.ba3dMatCap2nd = { value: __cap2Tex || layerPlaceholder() };
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>', '#include <common>\nuniform sampler2D ba3dMatCap2nd;');
      }

      /**
       * 装饰层的「混合遮罩」贴图（数据贴图 ✗ 不走 sRGB ✓）。
       *
       * lilToon 只有这三处有 BlendMask（已逐条核对源码 ✓）：
       *   _MatCapBlendMask      :1431  取 .rgb ✗ 逐通道混合
       *   _MatCap2ndBlendMask   :1499  同上
       *   _EmissionBlendMask    :1715  整体 RGBA 乘到 emissionColor
       * （_RimBlendMask / _BacklightBlendMask **不存在** ✗
       *   Rim 用顶点色 G（fd.triMask.g ✗ 已实现 ✓）✗ Backlight 没有遮罩 ✓）
       */
      for (const [uni, url] of [
        ['ba3dMatCapBlendMask', (__cfgM.matcap && __cfgM.matcap.blendMask) || null],
        ['ba3dMatCap2ndBlendMask', (__cfgM.matcap2nd && __cfgM.matcap2nd.blendMask) || null],
        ['ba3dEmissionBlendMask', (__cfgM.emission && __cfgM.emission.blendMask) || null],
        ['ba3dEmission2ndBlendMask', (__cfgM.emission2nd && __cfgM.emission2nd.blendMask) || null],
      ]) {
        if (!url) continue;
        const t = resolveMaskTexture(url);
        shader.uniforms[uni] = { value: t || dissolvePlaceholder('mask') };
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>', '#include <common>\nuniform sampler2D ' + uni + ';');
      }

      /**
       * 2nd 法线贴图 + 它的强度遮罩（lil_common_frag.hlsl:579 ✓）
       *   _Bump2ndMap       ← 法线数据（NoColorSpace ✓）
       *   _Bump2ndScaleMask ← 强度遮罩（采样 .r ✓）
       */
      for (const [uni, url, kind] of [
        ['ba3dBump2ndMap', (shaderMode === 'lilToon' && __cfgM.bump2nd && __cfgM.bump2nd.use) ? __cfgM.bump2nd.tex : null, 'normal'],
        ['ba3dBump2ndScaleMask', (__cfgM.bump2nd && __cfgM.bump2nd.scaleMask) || null, 'mask'],
        // MatCap 的自定义法线（替代 _MatCapBumpMap ✗ 也是数据贴图 ✓）
        ['ba3dMatCapBumpMap', (shaderMode === 'lilToon' && __cfgM.matcap && __cfgM.matcap.customNormal) ? __cfgM.matcap.bumpMap : null, 'normal'],
        ['ba3dMatCap2ndBumpMap', (shaderMode === 'lilToon' && __cfgM.matcap2nd && __cfgM.matcap2nd.customNormal) ? __cfgM.matcap2nd.bumpMap : null, 'normal'],
      ]) {
        if (!url) continue;
        const t = kind === 'normal' ? resolveNormalTexture(url) : resolveMaskTexture(url);
        shader.uniforms[uni] = { value: t || (kind === 'normal' ? normalPlaceholder() : dissolvePlaceholder('mask')) };
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>', '#include <common>\nuniform sampler2D ' + uni + ';');
      }

      // _EmissionMap 贴图：按材质取（和 MatCap 一样按 URL 缓存）
      const __emiUrl = (__cfgM.emission && __cfgM.emission.tex) || null;
      const __emiTex = __emiUrl ? resolveEmissionTexture(__emiUrl) : null;
      /**
       * ⚠️ 声明条件必须和**生成器发采样代码的条件**一致 ✓
       *    lilEmissionGLSL 判的是 `E.tex`（URL 字符串 ✓）
       *    这里如果判 __emiTex（**已加载**的贴图 ✓）就会不一致：
       *      设了贴图但还没加载完 ⇒ 采样代码在 ✗ uniform 不在 ✗
       *      ⇒ 'ba3dEmissionMap' : undeclared identifier ✓
       *    （这个坑在 Dissolve 遮罩 / MatCap 上各踩过一次 ✗ 这是第三次 ✓）
       *    ⇒ 改成判 __emiUrl ✗ 没加载好就用 1×1 占位贴图 ✓
       */
      if (__emiUrl) {
        shader.uniforms.ba3dEmissionMap = { value: __emiTex || dissolvePlaceholder('mask') };
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>', '#include <common>\nuniform sampler2D ba3dEmissionMap;');
      }
      // _Emission2ndMap 贴图（lil_common_frag.hlsl:1917 ✓ 和 1st 同构 ✗ 独立缓存项 ✓）
      const __emi2Url = (__cfgM.emission2nd && __cfgM.emission2nd.tex) || null;
      const __emi2Tex = __emi2Url ? resolveEmissionTexture(__emi2Url) : null;
      // 同 _EmissionMap ✗ 判 URL 而不是判已加载的贴图 ✓
      if (__emi2Url) {
        shader.uniforms.ba3dEmission2ndMap = { value: __emi2Tex || dissolvePlaceholder('mask') };
        shader.fragmentShader = shader.fragmentShader.replace(
          '#include <common>', '#include <common>\nuniform sampler2D ba3dEmission2ndMap;');
      }
      /**
       * 主色层 2nd / 3rd（lil_common_frag.hlsl:725 / :821）
       *
       * ⚠️ 注入顺序的讲究：
       *   · before 必须在 **#include <lights_fragment_begin> 之前** ✗ 而且要在下面
       *     「实时阴影遮罩」块**之前**跑 —— 那个块会把 include 整段替换掉 ✓
       *   · after 挂在 dithering_fragment 上 ✗ 因为 replace 是「后加的先生效」✗
       *     所以要先加 3rd 再加 2nd ✗ 最终执行顺序才是 2nd → 3rd ✓
       *     （和 lilToon 的 lil_pass_forward_normal.hlsl:342 / 350 一致 ✓）
       */
      {
        /**
         * 对应 lilToon 的 `#if LIL_RENDER != 0`（lil_common_frag.hlsl:798）
         *   LIL_RENDER: 0 = Opaque · 1 = Cutout · 2 = Transparent
         *   three 里没有这个宏 ⇒ 由材质的 alphaTest / transparent 反推
         *   ⚠️ 要用 applyLilRenderState 之后的状态（patchToonMaterial 里已调过）
         *   ⚠️ 这个 const 必须放在**数组字面量之外** ——
         *      放到 `{ which: '3rd' ... }` 前面会落进数组里 ⇒ 语法错误（踩过）
         */
        const __alphaRender = (mat.alphaTest > 0) || (mat.transparent === true);
        const __layers = [
          { which: '3rd', res: (shaderMode === 'lilToon') ? lilMainLayerGLSL(__cfgM, '3rd', __alphaRender) : null },
          { which: '2nd', res: (shaderMode === 'lilToon') ? lilMainLayerGLSL(__cfgM, '2nd', __alphaRender) : null },
        ];
        for (const it of __layers) {
          if (!it.res) continue;
          if (it.res.uniforms.tex) {
            const t = resolveLayerTexture(it.res.uniforms.tex);
            const uni = it.which === '3rd' ? 'ba3dMain3rdTex' : 'ba3dMain2ndTex';
            shader.uniforms[uni] = { value: t || layerPlaceholder() };
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <common>', '#include <common>\nuniform sampler2D ' + uni + ';');
          }
          if (it.res.uniforms.mask) {
            const t = resolveLayerTexture(it.res.uniforms.mask);
            const uni = it.which === '3rd' ? 'ba3dMain3rdBlendMask' : 'ba3dMain2ndBlendMask';
            shader.uniforms[uni] = { value: t || layerPlaceholder() };
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <common>', '#include <common>\nuniform sampler2D ' + uni + ';');
          }
          // 层溶解的两张贴图（lil_common_frag.hlsl:769-775 · 都是数据贴图 ✓）
          for (const [kind, uni] of [
            ['disMask', it.which === '3rd' ? 'ba3dMain3rdDisMask' : 'ba3dMain2ndDisMask'],
            ['disNoise', it.which === '3rd' ? 'ba3dMain3rdDisNoise' : 'ba3dMain2ndDisNoise'],
          ]) {
            const url = it.res.uniforms[kind];
            if (!url) continue;
            const t = resolveMaskTexture(url);
            shader.uniforms[uni] = { value: t || dissolvePlaceholder('mask') };
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <common>', '#include <common>\nuniform sampler2D ' + uni + ';');
          }
          // before：光照之前
          /**
           * ⚠️⚠️ **注入时刻**的日志 —— 证明这段 GLSL 真的进了 fragmentShader
           *
           * 之前所有日志都打在**生成器**里（[layer] / [decal] ✓）⇒
           * 只能证明「文本被生成了」✗ 不能证明「文本被插进着色器了」 ✓
           * 这两件事之间还有好几步（replace 命中 / 材质是否是 toon / shaderMode ✓）✓
           */
          /**
           * ★★ 关键：three 的 toon 光照读的是 **material.diffuseColor**（struct ✓）
           *    而不是局部的 `diffuseColor`：
           *
           *      lights_toon_pars_fragment · RE_Direct_Toon：
           *          reflectedLight.directDiffuse   += irradiance * BRDF_Lambert( material.diffuseColor );
           *      RE_IndirectDiffuse_Toon：
           *          reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
           *
           * ⇒ 层在 `#include <lights_fragment_begin>` **之前**写 `diffuseColor.rgb` ✗
           *   对**光照**完全没影响 ⇒ `enableLighting = 1` 时看起来「什么都没发生」 ✓
           *   （实测：user 把「参与光照比例」调到 0 才看得见 ⇒ 正好绕过光照 ✓）
           *
           * ⇒ 而 `material` 这个局部 struct 是在 **lights_fragment_begin 里面**被赋值的 ⇒
           *   必须在它**之后**写才不会被覆盖 ✓
           *   ⚠️ 「后加的 replace 先生效」这条在这里不适用 —— 这是**两条不同的 replace** ✗
           *      分别是 before-include 和 after-include ✗ 顺序由 include 位置决定 ✓
           */
          const __hasInc = shader.fragmentShader.indexOf('#include <lights_fragment_begin>') >= 0;
          if (__hasInc && it.res.afterMaterial) {
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <lights_fragment_begin>',
              '#include <lights_fragment_begin>' + '\n' + it.res.afterMaterial);
          }
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <lights_fragment_begin>',
            it.res.before + '\n' + '#include <lights_fragment_begin>');
          if (typeof console !== 'undefined') {
            const __ok = shader.fragmentShader.indexOf('ba3dLc') >= 0;
            console.debug('[inject] ' + mat.name + ' 层' + it.which
              + ' | 命中 include=' + __hasInc
              + ' | before 长度=' + it.res.before.length
              + ' | 注入后含 ba3dLc=' + __ok
              + (__hasInc ? '' : '  ✗✗ include 没找到 ⇒ 什么都没注入！'));
          }
          // after：末尾（后加的先执行 ✗ 见上面的顺序说明 ✓）
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <dithering_fragment>',
            it.res.after + '\n' + '#include <dithering_fragment>');
        }
      }

      /**
       * 实时阴影遮罩（每层 _ShadowReceive / _RimShadowMask / _MatCapShadowMask 要用）。
       *
       * three 的 toon 着色器有 shadowmap_pars_fragment ✗ 但没有 shadowmask_pars_fragment
       * （也就是没有 getShadowMask()）✗ 所以自己补：
       *   · #define receiveShadow true —— toon 不声明这个 uniform ✗ 和描边那边一样的坑
       *   · 在 lights_fragment_begin 之前给 ba3dShadowMaskG 赋值
       *     （getGradientIrradiance 在 lights_fragment_begin 里被调用 ✓）
       */
      /**
       * _ShadowMainStrength（lil_common_frag.hlsl:1098）
       *   indirectCol = lerp( indirectCol, indirectCol * fd.albedo, _ShadowMainStrength )
       *
       * ⚠️ 必须在片元**末尾**做 ✗ 那时 diffuseColor 已经乘过贴图了 ✓
       *    之前放进 getGradientIrradiance ✗ 那里只能拿到材质的 diffuse 均匀色 ✗
       *    有贴图的材质那个值是白色 ✗ 乘了等于没乘 ✓
       */
      if (shaderMode === 'lilToon') {
        const __mss = Math.max(0, Math.min(1, (__cfgM.shadowMainStrength === undefined ? 0 : Number(__cfgM.shadowMainStrength))));
        if (__mss > 0) {
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <dithering_fragment>',
              '// _ShadowMainStrength：阴影侧再乘一次主色（albedo）' + '\n' +
              'gl_FragColor.rgb = mix( gl_FragColor.rgb, gl_FragColor.rgb * diffuseColor.rgb,' + '\n' +
              '  ( 1.0 - ba3dShadowMaskG ) * ' + __mss.toFixed(4) + ' );' + '\n' +
              '#include <dithering_fragment>');
        }
      }
      if (shaderMode === 'lilToon') {
        /**
         * lilToon 的投射阴影**折在分档值里**（见 lil_common_frag.hlsl:945-950）：
         *     calculatedShadow = saturate( fd.attenuation + … );
         *     lns.x *= lerp( 1.0, calculatedShadow, _ShadowReceive );
         * 而 Unity 的直射光**不再单独乘阴影** ✓
         *
         * three 的 toon 却是「在 lights_fragment_begin 里把直射光砍掉」✗
         * 两条路互不相干 ✗ 所以只把阴影乘进 t1/t2/t3 是**没用的** ✓
         *
         * 这里把 three 那条路中和掉（keep = 1 → mix( 1.0, 1.0, s ) = 1.0 ✓）✗
         * 让投影**只经由 ba3dShadowMaskG** 进入分档 ✗ 这样 _ShadowReceive 才真的生效 ✓
         */
        /**
         * ★ 光照夹取 —— lilToon 的 _LightMinLimit / _LightMaxLimit
         *
         * lilToon（lil_common_macro.hlsl:2079）：
         *     lightColor = clamp( lightColor, _LightMinLimit, _LightMaxLimit );
         * 这里夹的是**纯光照**（lightColor ✓）· 材质色是之后才乘上去的 ✓
         *
         * three 里对应的就是 RE_Direct_Toon 里的 directLight.color：
         *     vec3 irradiance = getGradientIrradiance( ... ) * directLight.color;
         *                                            ↑ 纯光照（含阴影衰减）· 不含 albedo
         *
         * ⚠️⚠️ **千万不要**改成「对 outgoingLight 按亮度缩放」——
         *    outgoingLight 里已经乘过 albedo（three 的 BRDF_Lambert( diffuseColor ) ✓）⇒
         *    深色材质的乘积亮度天然低 ⇒ 会被判成「太暗」⇒ 提亮 ⇒ 深色袜子变浅紫 ✓
         *    （踩过一次 · 用户截图里袜子整个发白 ✓）
         *    ⇒ 夹的对象必须是**光照本身** · 不是「光照 × 材质色」✓
         *
         * ⚠️ 与 lilToon 的已知差异（有意保留）：
         *    lilToon 的间接光也乘同一个 lightColor ⇒ 阴影里环境光被**压下去** ·
         *    而 three 的环境光是**独立相加**的 ⇒ 阴影区 = 被抬到下限的直接光 + 完整环境光 ✓
         *    ⇒ 下限拉得较高时会比 lilToon 略亮（近似「暗部地板」的观感 ✓）·
         *      这是 three 与 Unity 光照结构不同导致的 · 不强行模拟 ✓
         *
         * ⚠️ onBeforeCompile 拿到的是**未展开 #include 的原文** ⇒
         *    RE_Direct_Toon 的文本在 THREE.ShaderChunk 里 ⇒ 要替换 **#include 指令本身** ✓
         */
        if (shaderMode === 'lilToon' || shaderMode === 'cel') {
          if (cfg.lightClampOn) {
            const __lmin = Math.max(0, Math.min(1, Number(cfg.lightMinLimit) || 0));
            const __lmax = Math.max(0.01, Math.min(4, Number(cfg.lightMaxLimit) || 1));
            const __FROM = 'vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;';
            const __CHUNK = '#include <lights_toon_pars_fragment>';
            const __TO = 'vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction )'
              + ' * clamp( directLight.color, vec3( ' + __lmin.toFixed(4) + ' ), vec3( ' + __lmax.toFixed(4) + ' ) );';
            const __src = (THREE.ShaderChunk && THREE.ShaderChunk.lights_toon_pars_fragment) || '';
            if (shader.fragmentShader.indexOf(__CHUNK) >= 0 && __src.indexOf(__FROM) >= 0) {
              shader.fragmentShader = shader.fragmentShader.replace(__CHUNK, __src.replace(__FROM, __TO));
              if (window.__ba3dDebugUI) console.debug('[lightClamp] min=' + __lmin + ' max=' + __lmax + ' 已注入 ✓（夹纯光照 · 不含 albedo ✓）');
            } else if (window.__ba3dDebugUI) {
              console.debug('[lightClamp] ✗ 注入失败：include=' + (shader.fragmentShader.indexOf(__CHUNK) >= 0)
                + ' chunk=' + (__src.indexOf(__FROM) >= 0));
            }
          }
        }
        const INCLUDE = '#include <lights_fragment_begin>';
        const chunk = (THREE.ShaderChunk && THREE.ShaderChunk.lights_fragment_begin) || '';
        const dirRaw = 'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
        const spotRaw = 'getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] )';
        const neutral = (src) => src
          .split(dirRaw).join('( ' + dirRaw + ' * 0.0 + 1.0 )')
          .split(spotRaw).join('( ' + spotRaw + ' * 0.0 + 1.0 )');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <shadowmap_pars_fragment>',
            '#include <shadowmap_pars_fragment>' + '\n' +
            '#define receiveShadow true' + '\n' +
            '#include <shadowmask_pars_fragment>' + '\n');
        /**
         * 阴影环境光：把间接光（环境光 + light probe）在阴影区削减。
         *
         * lilToon 的 indirectCol 是整体替换（含环境光）✗ 而 three 是分开放的，
         * 所以要在 lights_fragment_begin **之后**、lights_fragment_end 之前
         * 对 reflectedLight.indirectDiffuse 做一次缩放 ✓
         */
        const __ambKeep = Math.max(0, Math.min(1, Number(__cfgM.shadowAmbient !== undefined ? __cfgM.shadowAmbient : 1)));
        const ambLine = (__ambKeep < 1)
          ? 'reflectedLight.indirectDiffuse *= mix( ' + __ambKeep.toFixed(4) + ', 1.0, ba3dShadowMaskG );   // 阴影环境光' + '\n'
          : '';
        if (chunk && shader.fragmentShader.includes(INCLUDE)) {
          shader.fragmentShader = shader.fragmentShader.replace(INCLUDE,
            'ba3dShadowMaskG = getShadowMask();   // 投影只走这条路（见上面说明）' + '\n' +
            /**
             * 三层阴影各自的法线（lil_common_frag.hlsl:928-931）
             *   N1 = lerp( fd.origN, fd.N, _ShadowNormalStrength );
             *   N2 = lerp( fd.origN, fd.N, _Shadow2ndNormalStrength );
             *   N3 = lerp( fd.origN, fd.N, _Shadow3rdNormalStrength );
             *
             * ⚠️ 这里能拿到 nonPerturbedNormal 和 normal · 因为 normal_fragment_begin 更早
             *    而 getGradientIrradiance 是在下面的 #include <lights_fragment_begin> 里被调的
             *    ⇒ 顺序正确
             * ⚠️ 三个强度都是 1（默认）时**一个字符都不发** · 零开销、零行为变化
             */
            (function () {
              if (shaderMode !== 'lilToon') return '';
              const g = (k, d) => Math.max(0, Math.min(1, (__cfgM[k] === undefined ? d : Number(__cfgM[k]))));
              const s1 = g('shadowNormalStrength', 1);
              const s2 = g('shadow2ndNormalStrength', 1);
              const s3 = g('shadow3rdNormalStrength', 1);
              if (s1 === 1 && s2 === 1 && s3 === 1) return '';
              if (window.__ba3dDebugUI) console.debug('[shadow] 法线强度 1st=' + s1 + ' 2nd=' + s2 + ' 3rd=' + s3);
              return 'ba3dShadowN1 = normalize( mix( normalize( nonPerturbedNormal ), normal, ' + s1.toFixed(4) + ' ) );\n'
                + 'ba3dShadowN2 = normalize( mix( normalize( nonPerturbedNormal ), normal, ' + s2.toFixed(4) + ' ) );\n'
                + 'ba3dShadowN3 = normalize( mix( normalize( nonPerturbedNormal ), normal, ' + s3.toFixed(4) + ' ) );\n';
            })() +
            neutral(chunk) + '\n' + ambLine);
        } else {
          shader.fragmentShader = shader.fragmentShader.replace(INCLUDE,
            'ba3dShadowMaskG = getShadowMask();' + '\n' + ambLine + INCLUDE);
        }
        /**
         * 一次性诊断（详细日志打开时）✗ 直接看注入有没有命中：
         *   · includeFound   —— #include <lights_fragment_begin> 在不在
         *   · chunkHasShadow —— chunk 原文里有没有 getShadow 调用
         *   · maskDeclared   —— ba3dShadowMaskG 有没有出现在最终片元里
         *   · maskChunkIn    —— shadowmask_pars_fragment 有没有注入成功
         */
        if (window.__ba3dDebugUI && patchToonMaterial.__shadowLogged !== shaderMode) {
          patchToonMaterial.__shadowLogged = shaderMode;
          const f2 = shader.fragmentShader;
          console.debug('[lilShadow] includeFound=' + f2.includes('#include <lights_fragment_begin>')
            + ' chunkLen=' + chunk.length
            + ' chunkHasDirShadow=' + chunk.includes('directionalShadowMap')
            + ' maskDeclared=' + f2.includes('ba3dShadowMaskG')
            + ' assignInjected=' + f2.includes('ba3dShadowMaskG = getShadowMask()')
            + ' maskChunkIn=' + f2.includes('shadowmask_pars_fragment')
            + ' neutralApplied=' + f2.includes('* 0.0 + 1.0')
            + ' receiveDefine=' + f2.includes('#define receiveShadow true'));
        }
      }
      /**
       * Dissolve（lil_common_functions.hlsl:626）
       *
       * 两处注入：
       *   ① #include <alphatest_fragment> 之前 —— 算遮罩 ✗ 乘 diffuseColor.a
       *   ② #include <dithering_fragment>  —— 边缘加色（lil_common_frag.hlsl:1962）
       *
       * ⚠️ 开了 Dissolve 必须让材质有 alphaTest（否则丢弃不会发生 ✗）✗
       *    用 userData 记住材质原本的 alphaTest ✗ 关掉时还原 ✓
       */
      {
        const __D = __cfgM.dissolve || {};
        const __dmode = Math.round(Math.max(0, Math.min(3, Number(__D.mode) || 0)));
        // ⚠️ alphaTest 的赋值**不在这里** ✗ 见 patchToonMaterial 开头 ✓
        //    放在回调里太晚 ✗ 程序已经开始编译 ✗ USE_ALPHATEST 早定了 ✗ 不会 discard ✓
        if (shaderMode === 'lilToon' && __dmode > 0) {
          const dis = lilDissolveGLSL(__cfgM);
          if (dis) {
            /**
             * ⚠️ 只要 GLSL 里引用了贴图 ✗ uniform 就**必须**声明 ✗
             *    不能等贴图加载成功再声明（异步 ✗ 第一帧就是编译失败 ✓）
             *    没加载好就用占位贴图顶上 ✗ 加载完 resolveDissolveTexture 会触发
             *    applyRender ✗ 材质重建 ✗ 那时再换成真贴图 ✓
             */
            if (dis.uniforms.mask) {
              const t = resolveDissolveTexture(dis.uniforms.mask);
              shader.uniforms.ba3dDissolveMask = { value: t || dissolvePlaceholder('mask') };
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>', '#include <common>\nuniform sampler2D ba3dDissolveMask;');
            }
            if (dis.uniforms.noise) {
              const t = resolveDissolveTexture(dis.uniforms.noise);
              shader.uniforms.ba3dDissolveNoiseMask = { value: t || dissolvePlaceholder('noise') };
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <common>', '#include <common>\nuniform sampler2D ba3dDissolveNoiseMask;');
            }
            const IN = '#include <alphatest_fragment>';
            if (shader.fragmentShader.includes(IN)) {
              shader.fragmentShader = shader.fragmentShader.replace(IN, dis.before + '\n' + IN);
            } else if (shader.fragmentShader.includes('#include <color_fragment>')) {
              // 兜底：没有 alphatest_fragment 时挂在 color_fragment 之后
              shader.fragmentShader = shader.fragmentShader.replace(
                '#include <color_fragment>', '#include <color_fragment>\n' + dis.before);
            }
            shader.fragmentShader = shader.fragmentShader.replace(
              '#include <dithering_fragment>',
              dis.after + '\n' + '#include <dithering_fragment>');
          }
        }
      }
      // 脸部光照也是 cel 专属 ✗ lilToon 有自己的分档系统 ✓
      if (shaderMode !== 'lilToon' && isFace && celCfg.faceLight) {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <normal_vertex>',
          '#include <normal_vertex>\n\tvNormal = vec3( 0.0, 0.0, 1.0 );');
      }
      /**
       * 投射阴影软化（celShadowMin）—— 和 celDark 是**两个独立的旋钮**。
       *
       * r160 里平行光的阴影是**内联**在 lights_fragment_begin 里的：
       *     directLight.color *= ( directLight.visible && receiveShadow )
       *         ? getShadow( directionalShadowMap[i], … ) : 1.0;
       * 而 getShadow 只返回 0 或 1 —— **要么全给要么全不给**。
       * 于是头发/身体投在衣服上的影会把主光整个砍掉，只剩环境光，看起来特别浓。
       *
       * 重映射成 mix( keep, 1.0, s )：
       *     s = 1（受光）→ 1.0
       *     s = 0（投影）→ keep    ← 投影里仍保留 keep 倍主光
       * keep = 1 等于没有投射阴影，keep = 0 就是原来的硬阴影。
       *
       *   celDark       管「背光面」的分档浓淡（看法线朝向）
       *   celShadowMin  管「被挡住」的投射阴影浓淡（看遮挡）
       */
      /**
       * ⚠️ 这一段是 **cel 的投射阴影软化** ✗ lilToon 有自己的阴影体系
       *    （三层分档 + _ShadowReceive + _ShadowMainStrength ✗ 见 CONFIG.md）✓
       *
       *    所以在 shaderMode === 'lilToon' 时必须**完全跳过** ✗
       *    否则 index.html 上的「阴影浓淡 / 脸部阴影」滑条会污染 lilToon 的观感 ✓
       */
      if (shaderMode !== 'lilToon') {
      // 面部可以单独一档：身体要柔和投影，脸要清晰一些
      const faceShadow = isFace && celCfg.faceShadowMin !== null && celCfg.faceShadowMin !== undefined;
      const keep = Math.max(0, Math.min(1, Number(faceShadow ? celCfg.faceShadowMin : celCfg.shadowMin)));
      if (keep > 0) {
        const dirRaw = 'getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] )';
        const spotRaw = 'getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] )';
        const k = keep.toFixed(4);
        const soften = (src) => src
          .split(dirRaw).join('mix( ' + k + ', 1.0, ' + dirRaw + ' )')
          .split(spotRaw).join('mix( ' + k + ', 1.0, ' + spotRaw + ' )');
        /**
         * ⚠️ 必须替换 **#include 本身**，不能去replace展开后的语句。
         * three 的调用顺序是：
         *   WebGLRenderer → material.onBeforeCompile( parameters, renderer )   ← 回调在这里
         *   WebGLProgram  → resolveIncludes( fragmentShader )                  ← include 才展开
         * 也就是说回调拿到的还是**含 #include 的原始源码**，
         * 直接找 getShadow(...) 那一行是找不到的（cel 渐变能生效，正因为它替换的是 include）。
         * 于是这里取 ShaderChunk 里的原文、软化后再整体顶替 include。
         */
        const INCLUDE = '#include <lights_fragment_begin>';
        const chunk = (THREE.ShaderChunk && THREE.ShaderChunk.lights_fragment_begin) || '';
        const softChunk = chunk ? soften(chunk) : '';
        const hitChunk = softChunk && softChunk !== chunk && shader.fragmentShader.includes(INCLUDE);
        if (hitChunk) {
          shader.fragmentShader = shader.fragmentShader.replace(INCLUDE, softChunk);
        } else if (shader.fragmentShader.includes(dirRaw)) {
          // 兜底：某些版本/路径下 include 已被展开
          shader.fragmentShader = soften(shader.fragmentShader);
        }
      }
      }   // ← 「cel 软化 / lilToon 浓度=0」的收尾
    };
  }

  /**
   * 无光照材质（unlit）—— 只出固有色 / 贴图，不参与光照与色调映射。
   * 这是 bluearchive.wiki 那个查看器的观感来源：它的 data-shading="unlit"，
   * 所谓"卡通感"其实来自这里（它没有 cel 着色）。适合作品展示、贴图本身已烘焙光照的模型。
   */
  function toUnlitMaterial(src) {
    const t = new THREE.MeshBasicMaterial({
      color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
      map: src.map || null,
      alphaMap: src.alphaMap || null,
      transparent: !!src.transparent,
      opacity: src.opacity !== undefined ? src.opacity : 1,
      alphaTest: src.alphaTest || 0,
      side: src.side,
      vertexColors: !!src.vertexColors,
      depthWrite: src.depthWrite !== false,
      toneMapped: false,   // unlit 的定义就是"不参与色调映射"
    });
    t.name = (src.name || 'mat') + '_Unlit';
    t.userData.__unlit = true;
    t.userData.__src = src;
    return t;
  }

  /** 由原材质生成对应的卡通材质（原材质挂在 userData.__src 上以便还原） */
  function toToonMaterial(src) {
    const t = new THREE.MeshToonMaterial({
      color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
      map: src.map || null,
      // 不再给 gradientMap —— 分档改由注入的 getGradientIrradiance 计算
      emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0x000000),
      // ★ 必须一并复制 emissiveIntensity ✗
      //   实测 Maca.fbx：原材质 emissive=[0.604,0.604,0.604] em intensity=0（无自发光 ✓）
      //   只复制 emissive 会让新材质用默认强度 1 ✗ → 模型被加一层 60% 灰白 ✗✗
      //   而且自发光**不受灯光影响** ✗ 表现就是"拖光照亮度滑块也没用" ✓
      emissiveIntensity: src.emissiveIntensity !== undefined ? src.emissiveIntensity : 1,
      emissiveMap: src.emissiveMap || null,
      alphaMap: src.alphaMap || null,
      normalMap: src.normalMap || null,
      normalScale: src.normalScale ? src.normalScale.clone() : undefined,
      aoMap: src.aoMap || null,
      aoMapIntensity: src.aoMapIntensity !== undefined ? src.aoMapIntensity : 1,
      transparent: !!src.transparent,
      opacity: src.opacity !== undefined ? src.opacity : 1,
      alphaTest: src.alphaTest || 0,
      side: src.side,
      vertexColors: !!src.vertexColors,
      depthWrite: src.depthWrite !== false,
      toneMapped: src.toneMapped !== undefined ? src.toneMapped : true,
    });
    t.name = (src.name || 'mat') + '_Toon';
    t.userData.__toon = true;
    t.userData.__src = src;
    // isFace 要独立判断：面部光照修正和面部阴影档各自读自己的开关
    patchToonMaterial(t, celFaceRe().test(src.name || ''));
    return t;
  }

  /** 切换渲染模式：'pbr'（原始）| 'cel'（卡通）；返回生效的模式 */
  /**
   * 着色器**是否真正生效**。
   *
   * ⚠️ 不能只看 shaderMode ✗ —— 切到 pbr/unlit 时 shaderMode 会**保留**（方便切回来 ✓），
   * 但它此时并不生效。踩过的坑：用 shaderMode !== 'none' 判断打光补偿 ✗
   * 结果「render=pbr + shader=cel」时 PBR 也套上了卡通的打光补偿 ✗。
   */
  function shaderActive() { return renderMode === 'toon' && shaderMode !== 'none'; }

  /** 兼容旧 API：把两轴合成原来的单值 */
  function shadingLabel() { return shaderActive() ? 'cel' : renderMode; }

  /** 兼容旧名：把单值的 shading 拆成两轴 */
  function setShadingLegacy(mode) {
    if (mode === 'unlit') { renderMode = 'unlit'; shaderMode = 'none'; }
    else if (mode === 'cel') { renderMode = 'toon'; shaderMode = 'cel'; }
    else if (mode === 'toon') { renderMode = 'toon'; }
    else { renderMode = 'pbr'; shaderMode = 'none'; }
    return { render: renderMode, shader: shaderMode };
  }

  /** 旧 API/旧内部调用统一走这里，行为不变 */
  function applyShading(mode) {
    setShadingLegacy(mode);
    return applyRender(renderMode);
  }

  /** 只切换「材质模型」。shader 轴不变（除非当前 shader 在 unlit/pbr 下无意义） */
  /** 描边顶点位移（注入在 #include <begin_vertex> 之后，objectNormal 已就绪） */
  function lilOutlineVertGLSL(o) {
    const vc = Math.round(o.vertexR2Width || 0);
    const L = [];
    L.push('// ===== lilToon 描边位移 =====');
    L.push('{');
    L.push('\tfloat ba3dOW = uOutlineWidth * 0.01;');            // lilGetOutlineWidth 第 1 行
    // ★ 按模型的世界缩放归一化。
    //   lilToon 在 Unity 里 1 单位 = 1 米（角色约 1.5），所以 width 0.08 ×0.01 = 0.0008 是亚毫米级。
    //   我们的模型缩放不一致（建模软件导出常见 0.01 或 100），直接按对象空间偏移会随缩放放大，
    //   观感就完全对不上。这里把「世界尺寸」换算回对象空间：对象偏移 = 世界偏移 / 世界缩放。
    //   代价是数值含义变了（缩放 100 的模型要 width ≈ 100 才能看到）——
    //   所以面板上 width 的上限放宽到 200。
    L.push('\tfloat ba3dScale = length( modelMatrix[ 0 ].xyz );');
    L.push('\tba3dOW /= max( ba3dScale, 1e-6 );');
    if (o.widthMask) {
      L.push('#ifdef USE_UV');
      L.push('\tba3dOW *= texture2D( uOutlineWidthMask, vUv ).r;');
      L.push('#endif');
    }
    if (vc === 1) { L.push('#ifdef USE_COLOR'); L.push('\tba3dOW *= color.r;'); L.push('#endif'); }
    if (vc === 2) { L.push('#ifdef USE_COLOR'); L.push('\tba3dOW *= color.a;'); L.push('#endif'); }
    // 距离因子：世界单位 ↔ 屏幕恒定粗细
    //   lilHeadDirection(positionWS) = 相机位置 - 顶点位置 ⇒ length = 到相机距离
    L.push('\tvec4 ba3dMVP = modelViewMatrix * vec4( transformed, 1.0 );');
    if (o.fixWidthMode === 'screen') {
      // 去掉 saturate：fixWidth=1 时 width 与距离成正比 → 屏幕粗细恒定
      L.push('\tba3dOW *= mix( 1.0, -ba3dMVP.z, uOutlineFixWidth );');
    } else {
      // lilToon 原版（saturate 截断在 1.0，参数在常规距离下无效果）
      L.push('\tba3dOW *= mix( 1.0, saturate( -ba3dMVP.z ), uOutlineFixWidth );');
    }
    // 外扩方向：默认几何法线；vc=2 时用顶点色当法线（lilCalcOutlinePosition 第 287 行）
    if (vc === 2) {
      L.push('#ifdef USE_COLOR');
      L.push('\tvec3 ba3dON = normalize( color.rgb * 2.0 - 1.0 );');
      L.push('#else');
      L.push('\tvec3 ba3dON = objectNormal;');
      L.push('#endif');
    } else {
      L.push('\tvec3 ba3dON = objectNormal;');
    }
    // _OutlineVectorTex：用贴图覆盖外扩方向（对应 lilGetOutlineVector）
    if (o.vectorTex) {
      const uvName = ['vUv', 'vUv1', 'vUv2', 'vUv3'][Math.round(o.vectorUVMode || 0)] || 'vUv';
      L.push('#ifdef USE_UV');
      L.push('\tvec3 ba3dVT = texture2D( uOutlineVectorTex, ' + uvName + ' ).rgb * 2.0 - 1.0;');
      L.push('\tba3dVT.xy *= uOutlineVectorScale;');
      L.push('#ifdef USE_TANGENT');
      L.push('\t{');
      L.push('\t\tvec3 ba3dT = normalize( objectTangent );');
      L.push('\t\tvec3 ba3dN0 = normalize( objectNormal );');
      L.push('\t\tvec3 ba3dB = normalize( cross( ba3dN0, ba3dT ) );');
      L.push('\t\tba3dON = normalize( ba3dT * ba3dVT.x + ba3dB * ba3dVT.y + ba3dN0 * ba3dVT.z );');
      L.push('\t}');
      L.push('#else');
      // 没有 tangent 属性时用「法线 + 任意正交轴」近似（与 Unity 有差异）
      L.push('\t{');
      L.push('\t\tvec3 ba3dN0 = normalize( objectNormal );');
      L.push('\t\tvec3 ba3dUp = abs( ba3dN0.y ) < 0.99 ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );');
      L.push('\t\tvec3 ba3dT = normalize( cross( ba3dUp, ba3dN0 ) );');
      L.push('\t\tvec3 ba3dB = cross( ba3dN0, ba3dT );');
      L.push('\t\tba3dON = normalize( ba3dT * ba3dVT.x + ba3dB * ba3dVT.y + ba3dN0 * ba3dVT.z );');
      L.push('\t}');
      L.push('#endif');
      L.push('#endif');
    }
    L.push('\ttransformed += ba3dON * ba3dOW;');
    // Z Bias：沿"指向相机"方向推（lilCalcOutlinePosition 第 289~290 行）
    L.push('\tif ( uOutlineZBias != 0.0 ) {');
    L.push('\t\tvec3 ba3dV = uCameraPosOS - transformed;');
    L.push('\t\ttransformed -= normalize( ba3dV ) * uOutlineZBias;');
    L.push('\t}');
    L.push('}');
    return L.join('\n');
  }

  /** 描边材质的 cacheKey（参数变了要重编译） */
  /**
   * 描边受光（_OutlineEnableLighting / _OutlineLitColor）。
   *
   * 严格照 lil_common_frag.hlsl:377-383：
   *   litF    = saturate( NdotL * _OutlineLitScale + _OutlineLitOffset ) * _OutlineLitColor.a
   *   col.rgb = lerp( col.rgb * _OutlineColor.rgb, litCol, litF )
   *
   * 默认 _OutlineLitColor.a = 0 ⇒ litF = 0 ⇒ 结果就是「贴图 × 描边色」✗ 与不开受光一致 ✓
   * 所以这个功能**默认不影响现有观感** ✗ 只有把受光色的 alpha 调大才生效 ✓
   */
  function lilOutlineLitVertexGLSL() {
    return [
      '// 受光：传世界空间法线（objectNormal 已被 skinnormal_vertex 蒙皮过）',
      'vOutlineNormal = normalize( mat3( modelMatrix ) * objectNormal );',
    ].join('\n');
  }

  function lilOutlineLitFragmentGLSL(o) {
    return [
      '{',
      '  vec3 ba3dN = normalize( vOutlineNormal );',
      '  vec3 ba3dL = normalize( uOutlineLitDir );',
      '  float ba3dNdotL = dot( ba3dN, ba3dL );',
      '  vec3 ba3dLitCol = uOutlineLitApplyTex ? diffuseColor.rgb * uOutlineLitColor.rgb : uOutlineLitColor.rgb;',
      '  float ba3dLitF = saturate( ba3dNdotL * uOutlineLitScale + uOutlineLitOffset ) * uOutlineLitColor.a;',
      (o && o.litShadowDebug ? '  ba3dLitCol = vec3( abs(ba3dNdotL), ba3dLitF, 0.0 ); ba3dLitF = 1.0;   // 诊断：R=|NdotL| G=litF（不含阴影）' : (o && o.litShadowReceive ? '  ba3dLitF *= ba3dOutlineShadow();   // _OutlineLitShadowReceive（自算 PCF）' : '')),
      '  // 描边色只在这里乘一次（对应 lilToon 的 col.rgb * _OutlineColor.rgb）',
      (o && o.shaderColorMult
        ? '  diffuseColor.rgb = mix( diffuseColor.rgb * uOutlineColor.rgb, ba3dLitCol, ba3dLitF );   // 再乘一次（可选 ✗ 受光色会被染）'
        : '  diffuseColor.rgb = mix( diffuseColor.rgb, ba3dLitCol, ba3dLitF );'),
      '}',
    ].join('\n');
  }

  /**
   * 描边贴图缓存（URL → Texture）。
   *
   * lilToon 的 _OutlineTex（描边贴图）与 _OutlineWidthMask（宽度遮罩）都是 2D 贴图。
   * 这里按 URL 缓存 ✗ 同一个 URL 只加载一次 ✓
   * 加载完成后重新跑一次 applyLilOutline ✗ 把贴图挂上去 ✓
   */
  const lilOutlineTexCache = new Map();
  const lilOutlineTexLoading = new Set();

  function resolveOutlineTexture(url) {
    if (!url || typeof url !== 'string') return null;
    if (lilOutlineTexCache.has(url)) return lilOutlineTexCache.get(url);
    if (lilOutlineTexLoading.has(url)) return null;        // 正在加载 ✗ 先按无贴图处理 ✓
    lilOutlineTexLoading.add(url);
    const tl = new THREE.TextureLoader(loadingManager);
    tl.load(url,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        lilOutlineTexCache.set(url, tex);
        lilOutlineTexLoading.delete(url);
        console.debug('[outline] 贴图已加载：' + url);
        applyLilOutline();                                 // 挂上去
      },
      undefined,
      () => {
        lilOutlineTexLoading.delete(url);
        console.warn('[outline] 贴图加载失败：' + url);
      });
    return null;
  }

  /**
   * MatCap 贴图缓存（URL → Texture）。
   *
   * 以前全模型只有一张（lilMatCapTex 单变量 ✗ 只从全局 lilCfg.matcap.url 加载）。
   * 改成按 URL 缓存后 ✗ 每个材质可以用不同的 MatCap 贴图 ✓
   * 和描边贴图同一套路：加载完重建材质 ✓
   */
  const lilMatCapCache = new Map();
  const lilMatCapLoading = new Set();

  function resolveMatCapTexture(url) {
    if (!url || typeof url !== 'string') return null;
    if (lilMatCapCache.has(url)) return lilMatCapCache.get(url);
    if (lilMatCapLoading.has(url)) return null;      // 正在加载 ✗ 先按无贴图处理
    lilMatCapLoading.add(url);
    const real = (typeof resolveMappedUrl === 'function') ? resolveMappedUrl(url) : url;
    new THREE.TextureLoader(loadingManager).load(real,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        lilMatCapCache.set(url, tex);
        lilMatCapLoading.delete(url);
        console.debug('[matcap] 贴图已加载：' + url);
        if (modelRoot) applyRender(renderMode);   // 重建材质把它挂上
      },
      undefined,
      () => { lilMatCapLoading.delete(url); console.warn('[matcap] 贴图加载失败：' + url); });
    return null;
  }

  /** _EmissionMap 贴图缓存（URL → Texture）✗ 和 MatCap 同一套路 ✓ */
  const lilEmissionCache = new Map();
  const lilEmissionLoading = new Set();

  function resolveEmissionTexture(url) {
    if (!url || typeof url !== 'string') return null;
    if (lilEmissionCache.has(url)) return lilEmissionCache.get(url);
    if (lilEmissionLoading.has(url)) return null;
    lilEmissionLoading.add(url);
    const real = (typeof resolveMappedUrl === 'function') ? resolveMappedUrl(url) : url;
    new THREE.TextureLoader(loadingManager).load(real,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        lilEmissionCache.set(url, tex);
        lilEmissionLoading.delete(url);
        console.debug('[emission] 贴图已加载：' + url);
        if (modelRoot) applyRender(renderMode);
      },
      undefined,
      () => { lilEmissionLoading.delete(url); console.warn('[emission] 贴图加载失败：' + url); });
    return null;
  }

  /**
   * Dissolve 的贴图缓存（_DissolveMask / _DissolveNoiseMask）。
   *
   * ⚠️ 和 emission 不一样：这两张是**数据贴图**（遮罩 / 噪声）✗
   *    不能设 SRGBColorSpace ✗ 否则 0~1 的遮罩值会被 gamma 曲线扭曲 ✗
   *    lilToon 采样的就是 .r 的线性值 ✓
   */
  /** 主色层 2nd / 3rd 的贴图缓存（颜色贴图 ✗ 走 sRGB ✓） */
  const lilLayerCache = new Map();
  const lilLayerLoading = new Set();

  function resolveLayerTexture(url) {
    if (!url || typeof url !== 'string') return null;
    if (lilLayerCache.has(url)) return lilLayerCache.get(url);
    if (lilLayerLoading.has(url)) return null;
    lilLayerLoading.add(url);
    const real = (typeof resolveMappedUrl === 'function') ? resolveMappedUrl(url) : url;
    new THREE.TextureLoader(loadingManager).load(real,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        lilLayerCache.set(url, tex);
        lilLayerLoading.delete(url);
        console.debug('[layer] 贴图已加载：' + url);
        if (modelRoot) applyRender(renderMode);
      },
      undefined,
      () => { lilLayerLoading.delete(url); console.warn('[layer] 贴图加载失败：' + url); });
    return null;
  }

  /** 占位贴图：颜色贴图用纯白（乘上去不改变颜色 ✓）*/
  let __ba3dLayerWhite = null;
  function layerPlaceholder() {
    if (!__ba3dLayerWhite) {
      __ba3dLayerWhite = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
      __ba3dLayerWhite.colorSpace = THREE.SRGBColorSpace;
      __ba3dLayerWhite.needsUpdate = true;
    }
    return __ba3dLayerWhite;
  }

  /**
   * Dissolve 的**占位贴图** —— 保证 GLSL 永远能编译。
   *
   * ⚠️ 踩过的坑：贴图是异步加载的 ✗ 第一帧 resolveDissolveTexture() 返回 null ✗
   *    于是 `uniform sampler2D ba3dDissolveMask;` 没被注入 ✗
   *    但 GLSL 里已经在引用它 ✗ → 编译失败：
   *      ERROR: 'ba3dDissolveMask' : undeclared identifier
   *    修法：uniform **无条件声明** ✗ 先用占位贴图顶上 ✗
   *    遮罩占位 = 纯白（.r = 1.0 ✗ 等于"遮罩不生效" ✗ 和 lilToon 禁用遮罩时一致 ✓）
   *    噪声占位 = 中灰（.r = 0.5 ✗ 减去 0.5 后是 0 ✗ 等于"没有噪声" ✓）
   */
  let __ba3dWhiteTex = null;
  let __ba3dGrayTex = null;
  function dissolvePlaceholder(kind) {
    if (kind === 'noise') {
      if (!__ba3dGrayTex) {
        __ba3dGrayTex = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
        __ba3dGrayTex.colorSpace = THREE.NoColorSpace;
        __ba3dGrayTex.needsUpdate = true;
      }
      return __ba3dGrayTex;
    }
    if (!__ba3dWhiteTex) {
      __ba3dWhiteTex = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
      __ba3dWhiteTex.colorSpace = THREE.NoColorSpace;
      __ba3dWhiteTex.needsUpdate = true;
    }
    return __ba3dWhiteTex;
  }

  const lilDissolveCache = new Map();
  const lilDissolveLoading = new Set();

  /**
   * 装饰层的「混合遮罩」贴图 —— 和 Dissolve 的贴图同为**数据贴图** ✗
   * 直接复用同一套缓存与色彩空间处理（NoColorSpace ✓）✓
   */
  /**
   * Unity 的模板枚举 → three 的常量（**两套编号完全不同** ✗ 必须映射 ✓）。
   *
   * Unity CompareFunction：Disabled=0 Never=1 Less=2 Equal=3 LessEqual=4
   *                        Greater=5 NotEqual=6 GreaterEqual=7 Always=8
   * three StencilFunc   ：Never=512 Less=513 Equal=514 LessEqual=515
   *                        Greater=516 NotEqual=517 GreaterEqual=518 Always=519
   *
   * Unity StencilOp     ：Keep=0 Zero=1 Replace=2 IncrSat=3 DecrSat=4
   *                        Invert=5 IncrWrap=6 DecrWrap=7
   * three StencilOp     ：Zero=0 Keep=7680 Replace=7681 Increment=7682
   *                        Decrement=7683 Invert=5386 IncrementWrap=34055 DecrementWrap=34056
   */
  const STENCIL_COMP_MAP = [
    THREE.AlwaysStencilFunc,        // 0 Disabled（兜底当 Always ✓）
    THREE.NeverStencilFunc,         // 1 Never
    THREE.LessStencilFunc,          // 2 Less
    THREE.EqualStencilFunc,         // 3 Equal
    THREE.LessEqualStencilFunc,     // 4 LessEqual
    THREE.GreaterStencilFunc,       // 5 Greater
    THREE.NotEqualStencilFunc,      // 6 NotEqual
    THREE.GreaterEqualStencilFunc,  // 7 GreaterEqual
    THREE.AlwaysStencilFunc,        // 8 Always（lilToon 默认 ✓）
  ];
  const STENCIL_OP_MAP = [
    THREE.KeepStencilOp,            // 0 Keep（lilToon 默认 ✓）
    THREE.ZeroStencilOp,            // 1 Zero
    THREE.ReplaceStencilOp,         // 2 Replace
    THREE.IncrementStencilOp,       // 3 IncrSat
    THREE.DecrementStencilOp,       // 4 DecrSat
    THREE.InvertStencilOp,          // 5 Invert
    THREE.IncrementWrapStencilOp,   // 6 IncrWrap
    THREE.DecrementWrapStencilOp,   // 7 DecrWrap
  ];

  /**
   * 把 lilToon 的模板参数写到 three 材质上。
   *
   * three 的字段对应：
   *   _StencilRef → stencilRef        _StencilReadMask  → stencilFuncMask
   *   _StencilWriteMask → stencilWriteMask
   *   _StencilComp → stencilFunc      _StencilPass → stencilZPass
   *   _StencilFail → stencilFail      _StencilZFail → stencilZFail
   * （Unity 的 Pass = 深度与模板都通过 ✓）
   *
   * ⚠️ three 只有 stencilWrite = true 时才用这些设置 ✓
   * 关闭时**完整还原**材质原本的 8 个字段（存 userData.__ba3dOrigStencil ✓）
   */
  /**
   * 渲染状态 —— lilToon 的 _TransparentMode / _Cutoff / _Cull
   *
   * ⚠️ 三个都是**每材质**的属性（lilToon 里就在材质上 ✓）✗
   *    我们的 lilCfg 支持按材质覆盖 ⇒ 这里直接读传进来的 cfg 即可 ✓
   *
   * ⚠️ 默认值全是 **-1 = 不改** ✗ 沿用模型自带的值 ✓
   *    这样默认行为和以前完全一致 ✗ 想强制才动 ✓
   *
   * ⚠️ 改 alphaTest / transparent 必须 `needsUpdate = true` ✗
   *    因为 alphaTest 会影响 three 的 **USE_ALPHATEST** 宏 ✗ 要重编程序 ✓
   *
   * ⚠️ 与**溶解**的关系：
   *    溶解开着（dissolve.mode > 0 ✓）时需要 alphaTest ≥ 0.5 才会真正丢弃 ✓
   *    ⇒ 那时的 alphaTest 取「原值」与「0.5」的较大者 ✗ 见 syncDissolveAlphaTest ✓
   *    ⇒ 这里只管**不开溶解**时的 cutoff ✓ 两者不打架 ✓
   */
  function applyLilRenderState(mat, cfg) {
    if (!mat || !cfg) return;
    const num = (v, d) => (v === undefined || v === null || !isFinite(Number(v)) ? d : Number(v));
    // 第一次 patch 时把模型的原始值记下来（关掉强制后要能还原 ✓）
    const ud = mat.userData;
    if (ud.__ba3dOrigAlphaTest === undefined) ud.__ba3dOrigAlphaTest = mat.alphaTest || 0;
    if (ud.__ba3dOrigTransparent === undefined) ud.__ba3dOrigTransparent = !!mat.transparent;
    if (ud.__ba3dOrigDepthWrite === undefined) ud.__ba3dOrigDepthWrite = mat.depthWrite !== false;
    if (ud.__ba3dOrigSide === undefined) ud.__ba3dOrigSide = mat.side;

    const tm = Math.round(num(cfg.transparentMode, -1));
    const co = Math.max(0, Math.min(1, num(cfg.cutoff, 0.5)));
    const cu = Math.round(num(cfg.cull, -1));

    /**
     * —— _TransparentMode ——
     * Unity 枚举：0 Opaque · 1 Cutout · 2 Transparent · 3 Refraction · 4 Fur · 5 FurCutout · 6 Gem
     * ⚠️ 3~6 需要专门的 shader ✗ Web 侧按 Transparent 处理并提示 ✓
     */
    if (tm >= 0) {
      if (tm >= 3 && !ud.__ba3dTMWarned) {
        ud.__ba3dTMWarned = true;
        console.debug('[renderState] ' + (mat.name || '?')
          + ' 的 _TransparentMode=' + tm + '（Refraction/Fur/FurCutout/Gem ✓）'
          + '在 Web 侧没有对应 shader ⇒ 按 Transparent 处理 ✓');
      }
      if (tm === 0) {
        // Opaque：不透明 ✗ 深度写入开 ✓
        mat.transparent = false;
        mat.depthWrite = true;
      } else if (tm === 1) {
        // Cutout：不透明管线（alphaTest 由 syncDissolveAlphaTest 设 ✓）
        mat.transparent = false;
        mat.depthWrite = true;
      } else {
        // Transparent（含 3~6 的降级 ✓）：半透明 ✗ 关深度写入 ✓
        mat.transparent = true;
        mat.depthWrite = false;
      }
    }
    // ⚠️ 不改模式（-1）时**什么都不做** ✗ alphaTest 由 syncDissolveAlphaTest 负责 ✓

    /**
     * —— _Cull ——
     *
     * ⚠️⚠️⚠️ **「Cull X」是「剔除 X」· 不是「只画 X」** ——
     *
     *   这是我第一版**理解反了**的地方 ✗ 注释里就写着「只画正面 / 只画背面」✓
     *   后果：lilToon 的默认 `_Cull = 2`（Cull Back = **剔除背面**）
     *        被我们映射成 `THREE.BackSide`（**只渲染背面**）
     *        ⇒ 模型「里外翻转」⇒ 看起来发白 / 半透明 ✓✓✓
     *
     *   （实测：给 Face 套「皮肤 · 动画」后整个模型发白 ✓
     *     `cull` 从 -1 变成 2 ⇒ 触发这条错误映射 ✓）
     *
     *   ⇒ 正确映射（Unity 枚举 Off/Front/Back = 0/1/2 ✓）：
     *        _Cull 0（Off   不剔除）  ⇒ THREE.DoubleSide
     *        _Cull 1（Front 剔除正面）⇒ THREE.BackSide   ← **1 ↔ Back**
     *        _Cull 2（Back  剔除背面）⇒ THREE.FrontSide  ← **2 ↔ Front**
     *
     *   ⚠️ 注意 three 自己的枚举顺序是 FrontSide=0 · BackSide=1 · DoubleSide=2
     *      ⇒ 和 Unity **不是**同一套 ✗ 必须显式映射 ✓
     */
    if (cu >= 0) {
      const want = cu === 0
        ? THREE.DoubleSide
        : (cu === 1 ? THREE.BackSide : THREE.FrontSide);
      if (mat.side !== want) mat.side = want;
    }

    mat.needsUpdate = true;
  }
  /**
   * 主色贴图的 UV 变换 + HSV 调整 —— 照抄 lilToon：
   *
   *   lil_common_frag.hlsl:263
   *       fd.uvMain = lilCalcUV( fd.uvMain, _MainTex_ST, _MainTex_ScrollRotate );
   *   lil_common_frag.hlsl:317
   *       fd.col.rgb = lilToneCorrection( fd.col.rgb, _MainTexHSVG );
   *
   * lilCalcUV 的 4 参版本（lil_common_functions.hlsl:455）：
   *       float2 outuv = uv * uv_st.xy + uv_st.zw;
   *       outuv = lilRotateUV( outuv, uv_sr.z + uv_sr.w * LIL_TIME ) + frac( uv_sr.xy * LIL_TIME );
   *
   * ⚠️ three 的 vMapUv **已经含 _MainTex_ST**（由 uvTransform 在顶点着色器算好 ✓）
   *    ⇒ 这里**不要再乘一遍 ST** ✗ 只叠旋转 + 滚动 ✓
   *
   * ⚠️ 返回 null 表示「两项都是默认值」⇒ 一个字节都不注入 ✓
   *
   * ⚠️ 方案 A：只改**主色贴图自己**的 UV ✓
   *    lilToon 改的是共享的 fd.uvMain ⇒ 阴影/描边贴图也会跟着滚 ✗
   *    这边不跟 ⇒ 已在 LILTOON2.x.md 记为已知差异 ✓
   */
  /**
   * ★ LIL_TIME —— lilToon 的 _Time.y（秒 ✓）· 所有需要它的 shader **共享同一个对象** ✓
   *
   * ⚠️⚠️ 为什么是「共享一个对象」而不是「维护 shader 列表」：
   *    第一版用了一个数组记下每个 shader · 每帧去改 shader.uniforms.uBa3dTime.value ✓
   *    实测**不生效**（滚动和旋转角速度都不动 ✓）
   *    原因：three 在构建程序时会处理 uniforms（克隆 / 展平 ✓）·
   *          事后持有 shader 引用再改它 · 不保证作用到真正上传的那份 ✓
   *    ⇒ 改成一个**模块级对象** · 所有材质的 onBeforeCompile 都把它**同一个引用**
   *      挂到 shader.uniforms 上 · 每帧只改这一个对象的 .value ✓
   *      这样无论 three 怎么处理 uniforms · 读到的都是这一个对象 ✓
   *
   * ⚠️ 另一个坑（同一轮踩的）：登记语句原本写在 replacer 的 return **之后** ⇒ 死代码 ✓
   */
  const ba3dTimeUniform = { value: 0 };
  function lilMainTexUVGLSL(M, quiet) {
    if (!M) return null;
    const num = (v, d) => (v === undefined || v === null || !isFinite(Number(v)) ? d : Number(v));
    const hv = Array.isArray(M.mainTexHSVG) ? M.mainTexHSVG : [0, 1, 1, 1];
    const sr = Array.isArray(M.mainTexScrollRotate) ? M.mainTexScrollRotate : [0, 0, 0, 0];
    const H = num(hv[0], 0), S = num(hv[1], 1), V = num(hv[2], 1), G = num(hv[3], 1);
    const sx = num(sr[0], 0), sy = num(sr[1], 0), ang = num(sr[2], 0), aspd = num(sr[3], 0);
    const hsvDefault = (H === 0 && S === 1 && V === 1 && G === 1);
    const srDefault = (sx === 0 && sy === 0 && ang === 0 && aspd === 0);
    if (hsvDefault && srDefault) return null;
    const L = [];
    L.push('');
    L.push('// ══ _MainTexHSVG / _MainTex_ScrollRotate（lil_common_frag.hlsl:263 / :317）══');
    if (!srDefault) {
      // ⚠️ 顺序要紧：GLSL 要求**先用后声明是不行的** ⇒ 旋转函数必须写在滚动函数之前 ✓
      //    内联 lilRotateUV（lil_common_functions.hlsl:424 的 2 参版本 ✓）
      L.push('vec2 ba3dRotateUVmain( vec2 uv, float angle ) {');
      L.push('\tfloat si = sin( angle ); float co = cos( angle );');
      L.push('\tvec2 o = uv - 0.5;');
      L.push('\treturn vec2( o.x * co - o.y * si, o.x * si + o.y * co ) + 0.5;');
      L.push('}');
      // 然后是滚动 + 旋转（lilCalcUV 的 4 参版本 ✓）
      L.push('vec2 ba3dMainUvScroll( vec2 uv ) {');
      L.push('\tvec2 o = ba3dRotateUVmain( uv, ' + ang.toFixed(6) + ' + ' + aspd.toFixed(6) + ' * uBa3dTime );');
      L.push('\to += fract( vec2( ' + sx.toFixed(6) + ', ' + sy.toFixed(6) + ' ) * uBa3dTime );');
      L.push('\treturn o;');
      L.push('}');
    }
    if (!hsvDefault) {
      // lilToneCorrection（lil_common_functions.hlsl:347 ✓）
      L.push('vec3 ba3dToneCorrectionMain( vec3 c, vec4 hsvg ) {');
      L.push('\tc = pow( abs( c ), vec3( hsvg.w ) );');
      L.push('\tvec4 p = ( c.b > c.g ) ? vec4( c.bg, -1.0, 2.0 / 3.0 ) : vec4( c.gb, 0.0, -1.0 / 3.0 );');
      L.push('\tvec4 q = ( p.x > c.r ) ? vec4( p.xyw, c.r ) : vec4( c.r, p.yzx );');
      L.push('\tfloat d = q.x - min( q.w, q.y );');
      L.push('\tfloat e = 1.0e-10;');
      L.push('\tvec3 hsv = vec3( abs( q.z + ( q.w - q.y ) / ( 6.0 * d + e ) ), d / ( q.x + e ), q.x );');
      L.push('\thsv = vec3( hsv.x + hsvg.x, saturate( hsv.y * hsvg.y ), saturate( hsv.z * hsvg.z ) );');
      L.push('\treturn hsv.z - hsv.z * hsv.y + hsv.z * hsv.y * saturate( abs( fract( hsv.x + vec3( 1.0, 2.0 / 3.0, 1.0 / 3.0 ) ) * 6.0 - 3.0 ) - 1.0 );');
      L.push('}');
    }
    const out = L.join('\n');
    if (!quiet && typeof console !== 'undefined') console.debug('[mainTex] HSVG=(' + H + ',' + S + ',' + V + ',' + G + ')'
      + ' ScrollRotate=(' + sx + ',' + sy + ',' + ang + ',' + aspd + ')'
      + ' ⇒ ' + (srDefault ? '不改 UV' : '改 UV') + ' / ' + (hsvDefault ? '不改色' : '改色'));
    return { pre: out, useUV: !srDefault, useHSV: !hsvDefault, H: H, S: S, V: V, G: G };
  }
  function applyStencil(mat, cfg, tag) {
    if (!mat || !mat.isMaterial) return;
    const KEYS = ['stencilWrite', 'stencilRef', 'stencilFunc', 'stencilFuncMask',
      'stencilWriteMask', 'stencilFail', 'stencilZFail', 'stencilZPass'];
    if (mat.userData.__ba3dOrigStencil === undefined) {
      const o = {};
      for (const k of KEYS) o[k] = mat[k];
      mat.userData.__ba3dOrigStencil = o;
    }
    const o = mat.userData.__ba3dOrigStencil;
    const on = !!(cfg && cfg.use);
    if (!on) {
      for (const k of KEYS) mat[k] = o[k];
      return;
    }
    const cl = (v, lo, hi, d) => {
      const n2 = Number(v);
      return isFinite(n2) ? Math.max(lo, Math.min(hi, Math.round(n2))) : d;
    };
    const nv = {
      stencilWrite: true,
      stencilRef: cl(cfg.ref, 0, 255, 0),
      stencilFuncMask: cl(cfg.readMask, 0, 255, 255),
      stencilWriteMask: cl(cfg.writeMask, 0, 255, 255),
      stencilFunc: STENCIL_COMP_MAP[cl(cfg.comp, 0, 8, 8)],
      stencilFail: STENCIL_OP_MAP[cl(cfg.fail, 0, 7, 0)],
      stencilZFail: STENCIL_OP_MAP[cl(cfg.zfail, 0, 7, 0)],
      stencilZPass: STENCIL_OP_MAP[cl(cfg.pass, 0, 7, 0)],
    };
    for (const k of KEYS) mat[k] = nv[k];
    if (tag) console.debug('[stencil] ' + tag + '：ref=' + nv.stencilRef + ' comp=' + nv.stencilFunc
      + ' pass=' + nv.stencilZPass + ' fail=' + nv.stencilFail + ' zfail=' + nv.stencilZFail
      + ' readMask=' + nv.stencilFuncMask + ' writeMask=' + nv.stencilWriteMask);
  }

  /**
   * 法线贴图（_BumpMap / _Bump2ndMap ✓）—— 和遮罩一样是**数据贴图** ✗ NoColorSpace ✓
   * ⚠️ 法线贴图存的是向量不是颜色 ✗ 走 sRGB 会把 x 分量扭曲 ✓
   */
  function resolveNormalTexture(url) { return resolveDissolveTexture(url); }

  /**
   * 1×1 的**平坦法线**（rgb = (0.5, 0.5, 1.0) ⇒ 切线空间的 (0, 0, 1) ✓）。
   *
   * ⚠️ 为什么需要：three 只在 mat.normalMap 有值时才会声明 tbn 和跑 normal_fragment_maps ✓
   *    如果用户**只设了 2nd 法线贴图** ✗ tbn 就不存在 ✗ 我们的 2nd 注入会编译失败 ✓
   *    ⇒ 挂这张平坦图 ✗ 让 tbn 存在 ✗ 而它本身不改变法线 ✓
   */
  function normalPlaceholder() {
    if (normalPlaceholder.__t) return normalPlaceholder.__t;
    const d = new Uint8Array([128, 128, 255, 255]);
    const t = new THREE.DataTexture(d, 1, 1, THREE.RGBAFormat);
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    normalPlaceholder.__t = t;
    return t;
  }

  function resolveMaskTexture(url) {
    return resolveDissolveTexture(url);
  }

  function resolveDissolveTexture(url) {
    if (!url || typeof url !== 'string') return null;
    if (lilDissolveCache.has(url)) return lilDissolveCache.get(url);
    if (lilDissolveLoading.has(url)) return null;
    lilDissolveLoading.add(url);
    const real = (typeof resolveMappedUrl === 'function') ? resolveMappedUrl(url) : url;
    new THREE.TextureLoader(loadingManager).load(real,
      (tex) => {
        tex.colorSpace = THREE.NoColorSpace;   // 数据贴图 ✗ 不能走 sRGB
        lilDissolveCache.set(url, tex);
        lilDissolveLoading.delete(url);
        console.debug('[dissolve] 贴图已加载：' + url);
        if (modelRoot) applyRender(renderMode);
      },
      undefined,
      () => { lilDissolveLoading.delete(url); console.warn('[dissolve] 贴图加载失败：' + url); });
    return null;
  }

  function lilOutlineKey(o) {
    return 'ba3d-lilOutline:' + celProgramVersion + ':' + (o.widthMask ? 'm' : '-') +
      ':' + Math.round(o.vertexR2Width || 0) + ':' + (o.cull || 'back') +
      ':' + (o.fixWidthMode === 'screen' ? 'sc' : 'lt') +
      ':' + (o.litEnable !== false ? 'lit' : '-') +
      ':' + (o.__tex ? 'T' : '-') + (o.__mask ? 'M' : '-') + (o.litApplyTex ? 'A' : '-') +
      (o.__vec ? 'V' + Math.round(o.vectorUVMode || 0) : '') +
      (o.litShadowReceive ? 'S' : '-') + (o.litShadowDebug ? 'D' : '') + (o.shaderColorMult ? 'C' : '');
  }

  /**
   * 描边材质。用 MeshBasicMaterial + onBeforeCompile：
   *   · 自带 skinning / morph / instancing 的顶点管线（比手写 ShaderMaterial 稳）
   *   · 我们只在 <begin_vertex> 之后插入位移
   */
/**
 * three 在 WebGLRenderer.setProgram 里只为「受光材质」赋值这些 uniform
 * （three.module.js:30066~30085，包在 if (materialProperties.needsLights) 里）。
 *
 * ⚠️ MeshBasicMaterial 不在 materialNeedsLights() 白名单里 ✗ 所以描边材质拿不到
 *    directionalShadowMap / directionalShadowMatrix ✗ getShadowMask() 恒返回 1 ✓
 *
 * 解法：让材质谎称自己是受光材质（只为骗过白名单）✗
 *      并预建全部 19 个 uniform ✗ 否则 three 赋值时读到 undefined 会崩 ✓
 */
const LIGHT_UNIFORM_STUBS = [
  'ambientLightColor', 'lightProbe', 'directionalLights', 'directionalLightShadows',
  'spotLights', 'spotLightShadows', 'rectAreaLights', 'ltc_1', 'ltc_2',
  'pointLights', 'pointLightShadows', 'hemisphereLights',
  'directionalShadowMap', 'directionalShadowMatrix', 'spotShadowMap', 'spotLightMatrix',
  'spotLightMap', 'pointShadowMap', 'pointLightMatrix',
];

/**
 * 描边受光要用的阴影 uniform ✗ 这些值从模型上「真正的受光材质」那里拷过来。
 *
 * 为什么不用 mat.isMeshToonMaterial = true 那条路：
 *   three 只在 materialProperties.needsLights 为真时才赋值这些 uniform ✗
 *   而 needsLights 是在程序编译期一次性算好的 ✗ 在 onBeforeCompile 里改标记时机太晚 ✓
 *   实测结果：directionalShadowMatrix 仍是零矩阵 ✗ 阴影坐标算出来全 0 ✓
 * 直接抄一份现成的值最可靠 ✓
 */
const SHADOW_UNIFORM_KEYS = [
  'directionalShadowMap', 'directionalShadowMatrix', 'directionalLightShadows',
  'directionalLights', 'spotShadowMap', 'spotLightMatrix', 'spotLightShadows',
  'pointShadowMap', 'pointLightMatrix', 'pointLightShadows',
  'ambientLightColor', 'hemisphereLights',
];

  function makeLilOutlineMaterial(o, srcMat) {
    /**
     * Dissolve 也要作用在**描边壳**上。
     *
     * ⚠️ 踩过的坑：只溶脚本体 ✗ 描边的反壳网格还在 ✗
     *    于是本体溶解后剩下一个深色轮廓 ✗ 看起来像「剪影」而不是「消失」✓
     *    lilToon 里描边用同一个 shader ✗ 所以会一起溶解 ✓
     *
     * 描边顶点是沿法线外扩的 ✗ 所以溶解位置会有极小的偏移 ✗ 视觉上看不出来 ✓
     */
    const __dSrc = Array.isArray(srcMat) ? srcMat[0] : srcMat;
    const __dCfg = (__dSrc && __dSrc.isMeshToonMaterial) ? lilCfgFor(__dSrc) : lilCfg;
    const __dRes = (shaderMode === 'lilToon') ? lilDissolveGLSL(__dCfg) : null;
    /**
     * ★★ 源材质是**半透明**时 ✗ 描边壳也必须半透明、且**不能写深度**
     *
     * ⚠️ 问题（用户实测）：
     *   反过来壳是**不透明 + depthWrite=true** ✗ 而且 renderOrder=-1（先画 ✓）⇒
     *   深度先铺下 ⇒ **后面的半透明薄板被深度剔除** ⇒
     *   看起来就变成「不透明」了 ✓（盾牌那次就是这个 ✓）
     *
     * ⚠️ 而 lilToon 本身**是给透明材质画描边的** ✗
     *   它的描边 pass 继承材质的 _TransparentMode ⇒ 也走透明混合 ✓
     *   ⇒ 所以正确做法不是「整个跳过」✗ 而是「跟着透明」 ✓
     *
     * ⇒ 这样**轮廓边缘的描边还在**（用户要的 ✓）✗ 只是不再遮挡本体 ✓
     */
    const __src0 = Array.isArray(srcMat) ? srcMat[0] : srcMat;
    const __srcTransparent = !!(__src0 && __src0.transparent === true);
    /**
     * ⚠️⚠️ 描边的 alpha **只来自 `_OutlineColor.a`** ✗ 不乘源材质的 opacity ✓
     *
     * 依据（lil_common_frag.hlsl:389 ✓）：
     *     fd.col.a *= _OutlineColor.a;      // ← 描边自己的色 ✗ 和主体 alpha 无关
     *
     * ⇒ 我上一版多乘了源的 opacity ✗ 那是**加戏**✗ 已去掉 ✓
     * ⇒ lilToon 里「跟着透明」体现在**描边 pass 继承材质的 _TransparentMode**
     *    （也就是混合 / 深度状态 ✓）✗ 而不是把 alpha 乘起来 ✓
     */
    const __oAlpha = o.color[3];
    const mat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(o.color[0], o.color[1], o.color[2]),   // 描边色（受光块会被 uOutlineColor 再乘一次 ✗ 待修）
      side: o.cull === 'front' ? THREE.FrontSide : THREE.BackSide,
      transparent: (o.color[3] < 1) || __srcTransparent,
      opacity: __oAlpha,
      depthWrite: !__srcTransparent,   // ★ 透明源 ⇒ 不写深度 ⇒ 不遮挡本体
      toneMapped: true,
    });
    // ⚠️ receiveShadow 不是 MeshBasicMaterial 的构造参数（传了会 warn）✗ 构造后赋值 ✓
    //    three 只对受光材质 setValue('receiveShadow', ...) ✗ MeshBasicMaterial 拿不到 ✓
    //    所以片元里用 #define receiveShadow true ✗ 不依赖 uniform ✓
      mat.receiveShadow = true;   // 让 three 把它当受光网格（配合 isMeshToonMaterial ✗ 骗过 needsLights 白名单 ✓）
    // o.__tex / o.__mask 是解析后的 Texture（见 resolveOutlineTexture）
    /**
     * _OutlineTex_ST / _OutlineTex_ScrollRotate / _OutlineTexHSVG 只要有一个非默认值 ✗
     * 就不能用 three 原生的 map 路径（它不做 UV 变换 ✗ 也不做 HSV ✓）✗
     * 这时把 mat.map 置空 ✗ 改成自己在片元里采样 ✓
     * 三个都在默认值时走原生路径 ✗ 零开销 ✗ 观感不变 ✓
     */
    const __st = Array.isArray(o.texST) ? o.texST : [1, 1, 0, 0];
    const __sr = Array.isArray(o.texScrollRotate) ? o.texScrollRotate : [0, 0, 0, 0];
    const __hv = Array.isArray(o.texHSVG) ? o.texHSVG : [0, 1, 1, 1];
    const __numO = (v, d) => (v === undefined || v === null || !isFinite(Number(v)) ? d : Number(v));
    const __texXf = (__numO(__st[0], 1) !== 1 || __numO(__st[1], 1) !== 1 || __numO(__st[2], 0) !== 0 || __numO(__st[3], 0) !== 0
      || __numO(__sr[0], 0) !== 0 || __numO(__sr[1], 0) !== 0 || __numO(__sr[2], 0) !== 0 || __numO(__sr[3], 0) !== 0
      || __numO(__hv[0], 0) !== 0 || __numO(__hv[1], 1) !== 1 || __numO(__hv[2], 1) !== 1 || __numO(__hv[3], 1) !== 1);
    // o.__tex / o.__mask 是解析后的 Texture（见 resolveOutlineTexture）
    if (o.__tex && !__texXf) mat.map = o.__tex;
    o.tex = o.tex || null;
    mat.name = 'ba3d-lilOutline';
    // 描边自己的模板参数（_OutlineStencil* ✗ lts.shader:566-572 ✓）
    applyStencil(mat, o.stencilEnable ? {
      use: true,
      ref: o.stencilRef, readMask: o.stencilReadMask, writeMask: o.stencilWriteMask,
      comp: o.stencilComp, pass: o.stencilPass, fail: o.stencilFail, zfail: o.stencilZFail,
    } : null, '描边');

    // Dissolve 的 alphaTest 必须在**编译前**设好（同 patchToonMaterial 的坑）
    if (__dRes) {
      mat.userData.__ba3dOrigAlphaTest = mat.alphaTest || 0;
      mat.alphaTest = Math.max(0.5, mat.alphaTest || 0);
    }
    const wm = o.__mask || null;
    mat.onBeforeCompile = (shader) => {
      /**
       * 描边贴图的 UV 变换 + HSV 调整（_OutlineTex_ST / _OutlineTex_ScrollRotate / _OutlineTexHSVG）
       *
       * 对应 lil_common_frag.hlsl:278-370：
       *     fd.uvMain  = lilCalcUV( fd.uv0, _OutlineTex_ST, _OutlineTex_ScrollRotate );
       *     fd.col     = LIL_SAMPLE_2D( _OutlineTex, sampler_OutlineTex, fd.uvMain );
       *     fd.col.rgb = lilToneCorrection( fd.col.rgb, _OutlineTexHSVG );
       *
       * ⚠️ 必须放在 onBeforeCompile 的**最前面** ✗
       *    后面的受光块会把 '#include <common>' 整段替换掉 ✗ 那时就找不到 include 了 ✓
       * ⚠️ 自己声明 uv varying ✗ 不能用 vUv —— 我们把 mat.map 置空了 ✗
       *    此时 three 不会定义 USE_UV ✗ vUv 根本不存在 ✓
       */
      if (__texXf && o.__tex) {
        shader.uniforms.uBa3dTime = { value: 0 };
        shader.uniforms.ba3dOutlineTex = { value: o.__tex };
        shader.vertexShader = shader.vertexShader
          .replace('#include <uv_pars_vertex>', '#include <uv_pars_vertex>' + '\n' + 'varying vec2 vBa3dOTexUv;')
          .replace('#include <begin_vertex>', '#include <begin_vertex>' + '\n' + '\tvBa3dOTexUv = uv;');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', '#include <common>' + '\n' +
            'varying vec2 vBa3dOTexUv;' + '\n' +
            'uniform float uBa3dTime;' + '\n' +
            'uniform sampler2D ba3dOutlineTex;' + '\n' +
            // lilRotateUV（lil_common_functions.hlsl:419）
            'vec2 ba3dRotateUV( vec2 uv, float angle ) {' + '\n' +
            '\tfloat si = sin( angle ); float co = cos( angle );' + '\n' +
            '\tvec2 o = uv - 0.5;' + '\n' +
            '\treturn vec2( o.x * co - o.y * si, o.x * si + o.y * co ) + 0.5;' + '\n' +
            '}' + '\n' +
            // lilToneCorrection（lil_common_functions.hlsl:347）
            'vec3 ba3dToneCorrection( vec3 c, vec4 hsvg ) {' + '\n' +
            '\tc = pow( abs( c ), vec3( hsvg.w ) );   // GLSL ES 1.00 没有 pow(genType,float)' + '\n' +
            '\tvec4 p = ( c.b > c.g ) ? vec4( c.bg, -1.0, 2.0 / 3.0 ) : vec4( c.gb, 0.0, -1.0 / 3.0 );' + '\n' +
            '\tvec4 q = ( p.x > c.r ) ? vec4( p.xyw, c.r ) : vec4( c.r, p.yzx );' + '\n' +
            '\tfloat d = q.x - min( q.w, q.y );' + '\n' +
            '\tfloat e = 1.0e-10;' + '\n' +
            '\tvec3 hsv = vec3( abs( q.z + ( q.w - q.y ) / ( 6.0 * d + e ) ), d / ( q.x + e ), q.x );' + '\n' +
            '\thsv = vec3( hsv.x + hsvg.x, saturate( hsv.y * hsvg.y ), saturate( hsv.z * hsvg.z ) );' + '\n' +
            '\treturn hsv.z - hsv.z * hsv.y + hsv.z * hsv.y * saturate( abs( fract( hsv.x + vec3( 1.0, 2.0 / 3.0, 1.0 / 3.0 ) ) * 6.0 - 3.0 ) - 1.0 );' + '\n' +
            '}' + '\n')
          .replace('#include <map_fragment>', '#include <map_fragment>' + '\n' + (function () {
            return [
              '// _OutlineTex 的自定义采样（ST / 滚动旋转 / HSV）',
              '{',
              '\tvec2 uvO = vBa3dOTexUv * vec2( ' + __numO(__st[0], 1).toFixed(6) + ', ' + __numO(__st[1], 1).toFixed(6) + ' )',
              '\t\t+ vec2( ' + __numO(__st[2], 0).toFixed(6) + ', ' + __numO(__st[3], 0).toFixed(6) + ' );',
              '\tuvO = ba3dRotateUV( uvO, ' + __numO(__sr[2], 0).toFixed(6) + ' + ' + __numO(__sr[3], 0).toFixed(6) + ' * uBa3dTime )',
              '\t\t+ fract( vec2( ' + __numO(__sr[0], 0).toFixed(6) + ', ' + __numO(__sr[1], 0).toFixed(6) + ' ) * uBa3dTime );',
              '\tvec4 tO = texture2D( ba3dOutlineTex, uvO );',
              '\ttO.rgb = ba3dToneCorrection( tO.rgb, vec4( ' + __numO(__hv[0], 0).toFixed(6) + ', ' + __numO(__hv[1], 1).toFixed(6) + ', ' + __numO(__hv[2], 1).toFixed(6) + ', ' + __numO(__hv[3], 1).toFixed(6) + ' ) );',
              '\tdiffuseColor *= tO;',
              '}',
            ].join('\n');
          })());
        // 注入后整体检查一遍 HLSL-ism（项目里原来的检查只覆盖 lilShaderGLSL ✗ 就是这里漏了 ✓）
        {
          const __bad = ['lerp(', 'frac(', 'atan2(', 'tex2D(', 'mul('].filter((x) => shader.fragmentShader.indexOf(x) >= 0);
          if (__bad.length) {
            console.error('[lilToon] 描边贴图变换：注入后出现 HLSL 写法 ' + JSON.stringify(__bad) + ' ✗ 着色器会编译失败！');
          }
        }
      }
      /**
       * ⚠️ Dissolve 必须**最先**注入 ✗
       *    后面的受光块会把 '#include <common>' 整段替换掉 ✗
       *    那时再找这个 include 就找不到了 ✓
       */
      if (__dRes) {
        if (__dRes.uniforms.mask) {
          const t = resolveDissolveTexture(__dRes.uniforms.mask);
          shader.uniforms.ba3dDissolveMask = { value: t || dissolvePlaceholder('mask') };
        }
        if (__dRes.uniforms.noise) {
          const t = resolveDissolveTexture(__dRes.uniforms.noise);
          shader.uniforms.ba3dDissolveNoiseMask = { value: t || dissolvePlaceholder('noise') };
        }
        shader.vertexShader = shader.vertexShader
          .replace('#include <uv_pars_vertex>',
            '#include <uv_pars_vertex>' + '\n' + 'varying vec2 vBa3dUv;' + '\n' + 'varying vec3 vBa3dPositionOS;' + '\n' + 'varying vec3 vBa3dPositionWS;')
          .replace('#include <begin_vertex>',
            '#include <begin_vertex>' + '\n' + '\tvBa3dUv = uv;' + '\n' + '\tvBa3dPositionOS = position;')
          .replace('#include <project_vertex>',
            '#include <project_vertex>' + '\n' + '\tvBa3dPositionWS = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;');
        let __decl = '#include <common>' + '\n' + 'varying vec2 vBa3dUv;' + '\n'
          + 'varying vec3 vBa3dPositionOS;' + '\n' + 'varying vec3 vBa3dPositionWS;' + '\n' + 'float ba3dDissolveEdge = 0.0;';
        if (__dRes.uniforms.mask) __decl += '\n' + 'uniform sampler2D ba3dDissolveMask;';
        if (__dRes.uniforms.noise) __decl += '\n' + 'uniform sampler2D ba3dDissolveNoiseMask;';
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', __decl)
          .replace('#include <alphatest_fragment>',
            __dRes.before + '\n' + '#include <alphatest_fragment>')
          .replace('#include <dithering_fragment>',
            __dRes.after + '\n' + '#include <dithering_fragment>');
      }
      shader.uniforms.uOutlineWidth = { value: o.width };
      shader.uniforms.uOutlineFixWidth = { value: o.fixWidth };
      shader.uniforms.uOutlineZBias = { value: o.zBias };
      shader.uniforms.uCameraPosOS = { value: new THREE.Vector3() };
      if (wm) shader.uniforms.uOutlineWidthMask = { value: wm };
      if (o.__vec) {
        shader.uniforms.uOutlineVectorTex = { value: o.__vec };
        // ⚠️ receiveShadow 由 three 在 setProgram 里 setValue ✗ 只在材质刷新那个分支跑 ✓
        //    对 MeshBasicMaterial 无效 ✗ 所以片元里用 #define receiveShadow true 代替 ✓
        if (false) {  // 【已弃用】旧的 three-chunk 方案 ✗ 保留代码备查 ✗ 改用下面自算的阴影 ✓
        // 预建 three 会赋值的 uniform（否则它读 uniforms.directionalShadowMap.value 会崩）
        for (const k of LIGHT_UNIFORM_STUBS) {
          if (!shader.uniforms[k]) shader.uniforms[k] = { value: null };
        }
        // 让 materialNeedsLights() 返回 true ✗ three 才会把阴影贴图接进来
        // ⚠️ 只是个标记 ✗ 着色器仍是 basic 的（material.type 未变）
        mat.isMeshToonMaterial = true;
          shader.uniforms.receiveShadow = { value: true };
        }
        shader.uniforms.uOutlineVectorScale = { value: (o.vectorScale !== undefined ? o.vectorScale : 1.0) };
      }
      // —— 受光（默认 alpha=0 ✗ 不影响现有观感 ✓）——
      if (o.litEnable !== false) {
        const lc = o.litColor || [1.0, 0.2, 0.0, 0.0];
        shader.uniforms.uOutlineLitColor = { value: new THREE.Vector4(lc[0], lc[1], lc[2], lc[3] !== undefined ? lc[3] : 0) };
        shader.uniforms.uOutlineLitScale = { value: (o.litScale !== undefined ? o.litScale : 10.0) };
        shader.uniforms.uOutlineLitOffset = { value: (o.litOffset !== undefined ? o.litOffset : -8.0) };
        shader.uniforms.uOutlineLitDir = { value: new THREE.Vector3(0, 1, 0) };
        // _OutlineLitApplyTex：受光色是否再乘描边贴图
        shader.uniforms.uOutlineLitApplyTex = { value: !!(o.litApplyTex && o.__tex) };
        shader.uniforms.uOutlineColor = { value: new THREE.Vector4(o.color[0], o.color[1], o.color[2], o.color[3] !== undefined ? o.color[3] : 1) };
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>' + '\n' +
            'varying vec3 vOutlineNormal;' + '\n')
          .replace('#include <skinning_vertex>', '#include <skinning_vertex>' + '\n' + lilOutlineLitVertexGLSL() + '\n');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>',
            '#include <common>' + '\n' +
            'varying vec3 vOutlineNormal;' + '\n' +
            'uniform vec4  uOutlineLitColor;' + '\n' +
            'uniform float uOutlineLitScale;' + '\n' +
            'uniform float uOutlineLitOffset;' + '\n' +
            'uniform vec3  uOutlineLitDir;' + '\n' +
            'uniform bool  uOutlineLitApplyTex;' + '\n' +
            'uniform vec4  uOutlineColor;' + '\n')
          .replace('#include <color_fragment>', '#include <color_fragment>' + '\n' + lilOutlineLitFragmentGLSL(o) + '\n');
      }

      /**
       * _OutlineLitShadowReceive：把 three 的阴影管线接进描边材质。
       *
       * MeshBasicMaterial 的着色器里完全没有阴影代码 ✗ 所以手动补：
       *   顶点：#include <packing> + shadowmap_pars_vertex，
       *         并在 worldpos_vertex **之后**接 shadowmap_vertex（它要 worldPosition）
       *   片元：#include <packing> + shadowmap_pars_fragment + shadowmask_pars_fragment
       *         （提供 getShadowMask ✓）✗ 并声明 receiveShadow uniform ✓
       */
      if (false) {  // 【已弃用】旧的 three-chunk 方案 ✗ 保留代码备查 ✗ 改用下面自算的阴影 ✓
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', '#include <common>\n#include <packing>\n#include <shadowmap_pars_vertex>')
          .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n#include <shadowmap_vertex>');
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>',
            '#include <common>\n#include <packing>\n#include <shadowmap_pars_fragment>\n#define receiveShadow true\n#include <shadowmask_pars_fragment>');
      }

      /**
       * _OutlineLitShadowReceive —— 自己算阴影（不依赖 three 的阴影管线）。
       *
       * 为什么自己算：
       *   three 只在 materialProperties.needsLights 为真时才给材质传
       *   directionalShadowMap / directionalShadowMatrix ✗ 而 MeshBasicMaterial
       *   不在那个白名单里 ✗ 实测拿不到（探针显示「有阴影uniform=0」✓）
       *   所以直接从 keyLight.shadow 取相机与贴图 ✗ 自己构造纹理空间投影矩阵 ✓
       */
      shader.uniforms.uOutlineShadowMap = { value: null };
      shader.uniforms.uOutlineShadowMatrix = { value: new THREE.Matrix4() };
      shader.uniforms.uOutlineShadowBias = { value: 0.0 };
        shader.uniforms.uOutlineShadowRadius = { value: 1.0 };
      shader.uniforms.uOutlineShadowMapSize = { value: new THREE.Vector2(512, 512) };
      // 顶点：算阴影坐标（transformed 此时已经被 skinning_vertex 蒙皮过）
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>' + '\n' +
          'uniform mat4 uOutlineShadowMatrix;\n' +
          'varying vec4 vOutlineShadowCoord;\n')
        .replace('#include <project_vertex>', '#include <project_vertex>' + '\n' +
          'vOutlineShadowCoord = uOutlineShadowMatrix * modelMatrix * vec4( transformed, 1.0 );\n');
      // 片元：自己的 PCF（三维坐标系 → 4 次采样取平均 ✓）
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>' + '\n' +
          '#include <packing>\n' +   // unpackRGBAToDepth
          'uniform sampler2D uOutlineShadowMap;\n' +
          'uniform float uOutlineShadowBias;\n' +
          'uniform float uOutlineShadowRadius;\n' +
          'uniform vec2  uOutlineShadowMapSize;\n' +
          'varying vec4  vOutlineShadowCoord;\n' +
          'float ba3dOutlineShadow() {\n' +
          '  vec3 c = vOutlineShadowCoord.xyz / vOutlineShadowCoord.w;\n' +
          '  c.z += uOutlineShadowBias;\n' +
          '  if ( c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0 ) return 1.0;\n' +
          '  vec2 t = uOutlineShadowRadius / uOutlineShadowMapSize;\n' +
          '  float sh = 0.0;\n' +
          '  for ( int i = -1; i <= 1; i ++ ) {\n' +
          '    for ( int j = -1; j <= 1; j ++ ) {\n' +
          '      vec2 uv = clamp( c.xy + vec2( float( i ), float( j ) ) * t, vec2( 0.0 ), vec2( 1.0 ) );\n' +
          '      sh += step( c.z, unpackRGBAToDepth( texture2D( uOutlineShadowMap, uv ) ) );\n' +
          '    }\n' +
          '  }\n' +
          '  return sh / 9.0;\n' +
          '}\n');

      // ⚠️ 不要在这里声明 vUv —— three 的 uv_pars_vertex 已经声明了，重复声明会编译失败
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>',
          '#include <common>\n' +
          'uniform float uOutlineWidth;\n' +
          'uniform float uOutlineFixWidth;\n' +
          'uniform float uOutlineZBias;\n' +
          'uniform vec3  uCameraPosOS;\n' +
          (wm ? 'uniform sampler2D uOutlineWidthMask;\n' : '') +
          (o.__vec ? 'uniform sampler2D uOutlineVectorTex;\nuniform float uOutlineVectorScale;\n' : ''))
        /**
         * ⚠️ 注入点在 <skinning_vertex> **之后**。
         *
         * three 的顶点管线顺序：
         *   begin_vertex → morphtarget_vertex → skinning_vertex → displacementmap_vertex → project_vertex
         * 在 begin_vertex 之后改 transformed 的话，位移是在**未蒙皮的对象空间**里加的，
         * 蒙皮会再把它拉一次 —— 对蒙皮模型（BA 那批、Maca 都是）表现就是描边**异常粗**。
         * 放到 skinning 之后，位移与最终位置在同一空间，粗细才正确。
         */
        .replace('#include <skinning_vertex>',
          '#include <skinning_vertex>\n' + lilOutlineVertGLSL(o));

        /**
         * ★ 必须让 objectNormal 一定存在。
         *
         * three 的 basic 顶点着色器里这几行是**有条件**的：
         *   #if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
         *     #include <beginnormal_vertex>      ← objectNormal 在这里声明
         *     ...
         *   #endif
         * 我们的描边材质是 MeshBasicMaterial：没有 envmap；非蒙皮网格也没有 USE_SKINNING
         * → objectNormal 未声明 → 整个顶点着色器编译失败
         *   （实测报错 ERROR: 0:536: 'objectNormal' : undeclared identifier）
         *
         * 这里把条件改成恒真，并补上 normal 属性声明（MeshBasicMaterial 默认不声明它）。
         */
        shader.vertexShader = shader.vertexShader.replace(
          '#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )',
          '#if 1   // ba3d: 强制编译法线三件套，描边需要 objectNormal');
      // 没有蒙皮的网格也要有位移：three 的 MeshBasicMaterial 片元里始终有 skinning_vertex 吗？
      // 有的 —— 该 chunk 在 USE_SKINNING 未定义时展开为空，锚点字符串依然存在。
      if (!shader.vertexShader.includes('#include <skinning_vertex>')) {
        shader.vertexShader = shader.vertexShader.replace(
          '#include <begin_vertex>', '#include <begin_vertex>\n' + lilOutlineVertGLSL(o));
      }
      mat.userData.__shaderRef = shader;   // 供每帧更新 uCameraPosOS
    };
    mat.customProgramCacheKey = () => lilOutlineKey(o);
    mat.userData.__lilOutlineKey = lilOutlineKey(o);
    return mat;
  }

  /**
   * 同步描边（lilToon 风格）。
   *
   * 给每个网格挂一个**共享几何的克隆网格**，材质是 BackSide 反壳：
   *   · Mesh        → THREE.Mesh( 同一 geometry, 描边材质 )
   *   · SkinnedMesh → THREE.SkinnedMesh + bind( 同一 skeleton )   ← 蒙皮模型必须这样
   * renderOrder = -1（先画描边，再让主体盖住它）
   *
   * 仅在 shader='lilToon' 且 outline.enable 时存在，其它情况一律移除。
   */
  /**
   * 从 modelRoot 到某节点的名字链（如 Body/mouth）。
   *
   * ⚠️ 必须是 createViewer 作用域里的独立函数：listMeshes / setMeshVisible /
   *    isolateMeshes 三个方法都要用。之前把它定义在 listMeshes 内部，
   *    setMeshVisible 引用它会抛 ReferenceError，
   *    表现就是「部件面板里勾选显示/隐藏完全失效」。
   */
  /**
   * 设置可见性，并在**显示**时把祖先链也设为可见。
   *
   * ⚠️ 为什么必须这样：
   *   hideOptional / hideByBoneScale 是把**父级 Group** 设为不可见的，
   *   此时只把子网格的 visible 设回 true 是看不见的 ——
   *   表现就是「取消勾选能隐藏 ✗ 但重新勾上显示不回来」。
   */
  function setVisibleDeep(o, on) {
    o.visible = !!on;
    if (!on) return;
    let p = o.parent;
    while (p && p !== modelRoot) {
      if (!p.visible) p.visible = true;
      p = p.parent;
    }
  }

  /**
   * 被"锁定"的部件：path → 期望可见性。
   *
   * 与之前撤掉的那张隐形覆盖表的区别：
   *   · 这是**显式**的 —— 面板每行有个锁按钮 ✗ 用户看得见自己锁了什么 ✓
   *   · **全显/全隐不写这里** ✗ 不会互相压制 ✓
   *   · 只在自动逻辑跑完后应用**锁定的那一批** ✗ 其余照常 ✓
   */
  const meshLocked = new Map();

  /** 重新应用被锁定部件的可见性（在自动逻辑之后调用） */
  function applyLockedVisibility() {
    if (!modelRoot || meshLocked.size === 0) return 0;
    let hit = 0;
    modelRoot.traverse((o) => {
      if (!o.isMesh || o.userData.__isLilOutline) return;
      const key = meshPathOf(o);
      if (meshLocked.has(key)) { setVisibleDeep(o, meshLocked.get(key)); hit++; }
    });
    return hit;
  }

  function meshPathOf(o) {
    const segs = [];
    let p = o;
    while (p && p !== modelRoot) { segs.unshift(p.name || '(未命名)'); p = p.parent; }
    return segs.join('/');
  }

  function applyLilOutline() {
    syncDissolveAlphaTest();   // Dissolve 的 alphaTest 必须随配置同步（见函数注释）
    // 顺序要紧：先让 syncDissolveAlphaTest 定好 alphaTest ⇒ 再让渲染状态设 transparent/深度 ✓
    // （前者是 alphaTest 的唯一权威 ✗ 后者不再碰它 ✓）
    syncRenderState();         // _TransparentMode / _Cutoff / _Cull（每材质 ✓）
    syncLayerDoubleSide();     // 主色层的「剔除」需要双面渲染（见函数注释）
    syncStencil();            // 模板参数（本体 + 描边 ✓）
    /**
     * ★ 描边参数也要跟着重算 —— 因为有一条**自动关描边**的规则：
     *
     *     if (off || m.transparent === true || (skipRe && skipRe.test(m.name)))
     *         m.userData.outlineParameters.visible = false;
     *
     * ⚠️⚠️ 而 `syncRenderState()` 会改 `m.transparent`（B1 的「透明模式」✓）⇒
     *    如果不在这里重算 ⇒ **面板里把材质设成透明之后 ✗ 描边不会自动关** ⇒
     *    只能手动去关（实测：用户就是这么遇到的 ✓）
     *
     * ⚠️ 反壳描边对半透明材质是「实心背面壳」⇒ 会把半透明整个盖掉 ⇒
     *    所以这条自动规则很重要 ✗ 不能只靠手动 ✓
     */
    applyOutlineParams();     // 重新评估「透明 ⇒ 自动关描边」等规则 ✓
    if (!modelRoot) return false;
    /**
     * 按材质解析描边配置（带缓存 ✗ 贴图解析本身也是按 URL 缓存的 ✓）。
     *
     * lilToon 的预设是按材质槽选的 ✗ 所以描边参数也要能按材质覆盖：
     *   最终 outline = { ...lilCfg.outline, ...lilCfgByMaterial[材质名].outline }
     */
    const cfgCache = new Map();
    const resolveFor = (matName) => {
      const ck = matName || '';
      if (cfgCache.has(ck)) return cfgCache.get(ck);
      const root = matName ? lilCfgFor({ name: matName }) : lilCfg;
      const oo = Object.assign({}, (root && root.outline) ? root.outline : {});
      // 解析描边贴图（URL → Texture ✗ 异步 ✗ 加载完会再跑一次本函数 ✓）
      oo.__tex = resolveOutlineTexture(oo.tex);
      oo.__mask = resolveOutlineTexture(oo.widthMask);
      oo.__vec = resolveOutlineTexture(oo.vectorTex);
      oo.widthMask = (typeof oo.widthMask === 'string' && oo.widthMask) ? oo.widthMask : (oo.widthMask || null);
      cfgCache.set(ck, oo);
      return oo;
    };
    const oGlobal = resolveFor(null);
    const onGlobal = shaderActive() && shaderMode === 'lilToon' && !!oGlobal.enable;
    const keyGlobal = onGlobal ? lilOutlineKey(oGlobal) : '';
    let anyOn = onGlobal;
    let made = 0, removed = 0;
    const meshList = [];
    modelRoot.traverse((m) => { if (m.isMesh && !m.userData.__isLilOutline) meshList.push(m); });
    for (const m of meshList) {
      // ★ 按材质取描边配置（lilToon 的预设是按材质槽选的）
      const _mn0 = (Array.isArray(m.material)
        ? (m.material[0] && m.material[0].name)
        : (m.material && m.material.name)) || '';
      const o = _mn0 ? resolveFor(_mn0) : oGlobal;
      /**
       * ★★ 尊重 `applyOutlineParams()` 写下的「这个材质不该有描边」决定
       *
       * ⚠️⚠️ 描边有**两套系统** ✗ 各自管「跳过」✗ 之前互不相通：
       *      ① applyOutlineParams()  ⇒ 按 m.transparent 写
       *                                userData.outlineParameters.visible = false
       *      ② applyLilOutline()     ⇒ **只认配置里的 o.skipPattern**
       *                                ✗ 完全没看 visible
       *
       *   ⇒ 结果：「透明材质自动关描边」这条规则**只对 three 的 OutlineEffect 有效** ✗
       *      对 lilToon 的反壳描边**完全无效** ✓
       *   ⇒ 现象（用户实测）：切到 lilToon 风格 · 默认带描边 ✗ 什么都不动 ⇒
       *      **透明材质被那层实心背面壳盖成了不透明** ✓
       *
       * ⇒ 这里补上：源材质的 `outlineParameters.visible === false` ⇒ 不建描边壳 ✓
       *   applyOutlineParams 里的三种情况（透明 / 地面 / 嘴部贴片 ✓）全部生效 ✓
       *
       * ⚠️ 也让「全局描边开关」一致：outlineOn=false 时 applyOutlineParams 会给**所有**
       *    材质写 visible=false ⇒ 这里全部跳过 ⇒ 不会出现「关了还有壳」 ✓
       */
      const __srcMat0 = Array.isArray(m.material) ? m.material[0] : m.material;
      /**
       * ⚠️⚠️ `visible === false` 有两种来源 ✗ 要区别对待：
       *   ① `off = true`（地面 / 嘴部贴片 ✓）      ⇒ **必须跳过**
       *   ② `m.transparent === true`（半透明 ✓）    ⇒ **不该跳过** ✗
       *        因为描边材质现在也会跟着透明（见 makeLilOutlineMaterial ✓）
       *        ⇒ 画出来才有「边缘描边」✗ 而且不再遮挡本体 ✓
       *        ⇒ 但保留一个开关 `o.skipTransparent` 让人能退回老行为 ✓
       */
      const __srcTransparent = !!(__srcMat0 && __srcMat0.transparent === true);
      const __flagOff = !!(__srcMat0 && __srcMat0.userData
        && __srcMat0.userData.outlineParameters
        && __srcMat0.userData.outlineParameters.visible === false);
      const __skip = __flagOff && (__srcTransparent ? !!o.skipTransparent : true);
      const on = !__skip && shaderActive() && shaderMode === 'lilToon' && !!o.enable;
      const key = on ? lilOutlineKey(o) : '';
      if (on) anyOn = true;
      // 跳过不需要描边的部件（lilToon 的 _OutlineDeleteMesh 等价物）
      const _matName = (Array.isArray(m.material) ? (m.material[0] && m.material[0].name) : (m.material && m.material.name)) || '';
      if (o.skipPattern) {
        let re = null;
        try { re = new RegExp(o.skipPattern, 'i'); } catch (e) { re = null; }
        // 匹配范围：网格名 / 材质名 / 完整层级路径（如 Body/mouth ✗ 便于精确定位子组件 ✓）
        const _path = (() => {
          const segs = []; let p = m;
          while (p && p !== modelRoot) { segs.unshift(p.name || ''); p = p.parent; }
          return segs.join('/');
        })();
        // ⚠️ 只匹配**网格名** ✗ 不匹配材质名也不匹配路径 ✓
        //    材质常常被多个网格共用 ✗ 按材质匹配会误伤一大片 ✓
        if (re && re.test(m.name || '')) {
          const ex0 = m.children.find((c) => c.userData && c.userData.__isLilOutline);
          if (ex0) { m.remove(ex0); if (ex0.material) ex0.material.dispose(); removed++; }
          continue;
        }
      }

      const existing = m.children.find((c) => c.userData && c.userData.__isLilOutline);
      if (!on) {
        if (existing) {
          if (existing.parent) existing.parent.remove(existing);
          if (existing.material) existing.material.dispose();
          m.userData.__lilOutlineChild = null; removed++;
        }
        continue;
      }
      if (existing && existing.material && existing.material.userData.__lilOutlineKey === key) {
        const mm = existing.material;
        mm.color.setRGB(o.color[0], o.color[1], o.color[2]);
        mm.opacity = o.color[3];
        mm.transparent = o.color[3] < 1;
        mm.side = o.cull === 'front' ? THREE.FrontSide : THREE.BackSide;
        // Dissolve 开关变了要同步 alphaTest（复用时 onBeforeCompile 不会再跑 ✗）
        {
          const __sm = Array.isArray(m.material) ? m.material[0] : m.material;
          const __dd = (__sm && __sm.isMeshToonMaterial) ? (lilCfgFor(__sm).dissolve || {}) : {};
          const __dOn = shaderMode === 'lilToon' && Math.round(Math.max(0, Math.min(3, Number(__dd.mode) || 0))) > 0;
          const __orig = (mm.userData.__ba3dOrigAlphaTest !== undefined) ? mm.userData.__ba3dOrigAlphaTest : (mm.alphaTest || 0);
          const __want = __dOn ? Math.max(0.5, __orig) : __orig;
          if (mm.alphaTest !== __want) { mm.alphaTest = __want; mm.needsUpdate = true; }
        }
        /**
         * ★ 必须同步更新 uniform。
         *
         * uniform 是在 onBeforeCompile 里创建的 ✗ 而程序已编译时它**不会重跑**，
         * 所以只改 o.width 是没用的 —— 表现就是「调宽度滑杆没反应」。
         * 这里通过 __shaderRef 直接改 live uniform。
         */
        const sh = mm.userData && mm.userData.__shaderRef;
        if (sh && sh.uniforms) {
          if (sh.uniforms.uOutlineWidth) sh.uniforms.uOutlineWidth.value = o.width;
          if (sh.uniforms.uOutlineFixWidth) sh.uniforms.uOutlineFixWidth.value = o.fixWidth;
          if (sh.uniforms.uOutlineZBias) sh.uniforms.uOutlineZBias.value = o.zBias;
          if (sh.uniforms.uOutlineVectorScale) sh.uniforms.uOutlineVectorScale.value = (o.vectorScale !== undefined ? o.vectorScale : 1.0);
        }
        continue;
      }
      if (existing) {
        if (existing.parent) existing.parent.remove(existing);
        if (existing.material) existing.material.dispose();
      }
      const om = m.isSkinnedMesh
        ? new THREE.SkinnedMesh(m.geometry, makeLilOutlineMaterial(o, m.material))
        : new THREE.Mesh(m.geometry, makeLilOutlineMaterial(o, m.material));
      om.userData.__isLilOutline = true;
      // ⚠️ three 的 WebGLPrograms.getParameters 读的是 **object.receiveShadow**（网格 ✗ 不是材质 ✓）
      //    所以除了材质的 mat.receiveShadow ✗ 还必须给描边网格本身设上 ✗
      //    否则 USE_SHADOWMAP 不会被定义 ✗ 片元里的 receiveShadow uniform 也不会有值 ✓
        om.receiveShadow = true;   // 网格级（three 的 getParameters 读的是 object.receiveShadow ✓）
      om.renderOrder = -1;
      om.castShadow = false;
      om.receiveShadow = false;
      om.frustumCulled = m.frustumCulled;
      /**
       * 作为 m 的子节点。
       *
       * 试过改成兄弟节点 + 复制 local matrix，实测反而变差（用户反馈"本来全身都有描边，
       * 改了之后不正常了"），所以保持子节点方案。
       * SkinnedMesh 需要 bind 同一套 skeleton，否则蒙皮不跟随。
       */
      if (m.isSkinnedMesh) { om.bind(m.skeleton, m.bindMatrix); om.bindMode = m.bindMode; }
      m.add(om);
      m.userData.__lilOutlineChild = om;
      made++;
    }
    return anyOn;
  }

  /** 每帧更新描边的 uCameraPosOS（对象空间的相机位置） */
  function updateLilOutlineCamera() {
    if (!modelRoot) return;
    modelRoot.traverse((m) => {
      if (!m.userData || !m.userData.__isLilOutline || !m.material) return;
      const sh = m.material.userData && m.material.userData.__shaderRef;
      if (!sh || !sh.uniforms.uCameraPosOS) return;
      m.updateWorldMatrix(true, false);
      const inv = new THREE.Matrix4().copy(m.matrixWorld).invert();
      sh.uniforms.uCameraPosOS.value.setFromMatrixPosition(camera.matrixWorld).applyMatrix4(inv);
      // 受光需要主光方向（世界空间 ✗ 从光源指向该网格 ✓）
      if (sh.uniforms.uOutlineLitDir && keyLight) {
        const lp = keyLight.getWorldPosition(new THREE.Vector3());
        const tp = m.getWorldPosition(new THREE.Vector3());
        // ⚠️ 必须是「从表面指向光源」（lilToon 的 fd.NdotL 约定）✗ 写反会导致受光面变背面
        sh.uniforms.uOutlineLitDir.value.copy(lp).sub(tp).normalize();

      // _OutlineLitShadowReceive：自己算阴影坐标（不依赖 three 的阴影 uniform）
      //   纹理空间投影 = 0.5 偏移缩放 × 投影矩阵 × 视图矩阵
      if (sh.uniforms.uOutlineShadowMatrix && keyLight && keyLight.castShadow &&
          keyLight.shadow && keyLight.shadow.map && keyLight.shadow.map.texture) {
        const sc = keyLight.shadow.camera;
        const biasM = new THREE.Matrix4().set(
          0.5, 0,   0,   0.5,
          0,   0.5, 0,   0.5,
          0,   0,   0.5, 0.5,
          0,   0,   0,   1
        );
        // ⭐ 直接用 three 内部算好的纹理空间矩阵（LightShadow.matrix = biasM×projection×view）
        const mtx = new THREE.Matrix4().copy(keyLight.shadow.matrix);
        sh.uniforms.uOutlineShadowMatrix.value.copy(mtx);
        sh.uniforms.uOutlineShadowMap.value = keyLight.shadow.map.texture;
        sh.uniforms.uOutlineShadowBias.value = keyLight.shadow.bias;
        sh.uniforms.uOutlineShadowMapSize.value.set(keyLight.shadow.mapSize.x, keyLight.shadow.mapSize.y);
  // shadowRadius 模糊：灯光自己的 radius × 配置倍率（0 = 硬边）
  const __cfgO = (lilCfgFor({ name: (m.material && m.material.name) || '' }).outline) || {};
  const __blur = (__cfgO.litShadowBlur !== undefined) ? Number(__cfgO.litShadowBlur) : 1.0;
  sh.uniforms.uOutlineShadowRadius.value = Math.max(0, (keyLight.shadow.radius || 1) * __blur);
        // _OutlineTex_ScrollRotate 需要时间（lilToon 的 LIL_TIME = _Time.y ✗ 秒 ✓）
        if (sh.uniforms.uBa3dTime) sh.uniforms.uBa3dTime.value = performance.now() / 1000;
      }

        // _OutlineLitShadowReceive：从模型上任意一个真正的受光材质那里抄阴影 uniform
        // （three 对 MeshBasicMaterial 不赋值这些 ✗ 只能自己抄；n 很小 ✗ 每帧开销可忽略）
        if (sh.uniforms.directionalShadowMatrix) {
          let src = null;
          modelRoot.traverse((x) => {
            if (src || !x.isMesh || !x.material) return;
            if (x.userData && x.userData.__isLilOutline) return;
            const p = renderer.properties.get(x.material);
            if (p && p.uniforms && p.uniforms.directionalShadowMatrix) src = p.uniforms;
          });
          if (src) {
            for (const k of SHADOW_UNIFORM_KEYS) {
              if (src[k] && sh.uniforms[k]) sh.uniforms[k].value = src[k].value;
            }
          }
        }
      }
    });
  }

  function applyRender(mode) {
    renderMode = (mode === 'unlit') ? 'unlit' : (mode === 'toon' ? 'toon' : 'pbr');
    if (renderMode !== 'toon' && shaderMode !== 'none') {
      // pbr / unlit 没有可注入的着色器 —— 尊重用户的 render 选择，把 shader 挂起但不报错
      if (renderMode === 'pbr' && shaderMode !== 'none') {
        console.debug('[render] render=' + renderMode + ' 时着色器不生效（当前 shader=' + shaderMode + '）');
      }
    }
    if (!modelRoot) return renderMode;
    modelRoot.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const isArr = Array.isArray(o.material);
      const mats = isArr ? o.material : [o.material];
      const next = mats.map((m) => {
        if (m.userData && m.userData.__mouth) return m;       // 嘴部材质单独重建
        // 先从"派生材质"还原回原始材质，再按目标模式重建 —— 否则 unlit↔cel 互切会叠加
        const src = (m.userData && m.userData.__src) ? m.userData.__src : m;
        if (renderMode === 'unlit') {
          if (m.userData && m.userData.__unlit && m.userData.__src === src) return m;
          return toUnlitMaterial(src);
        }
        if (renderMode === 'toon') {
          // 已是卡通材质**且版本一致**才复用；setCel() 递增版本号后这里会重建，
          // 让 onBeforeCompile 闭包重新读到最新的 celCfg（否则改参数无反应）
          if (m.userData && m.userData.__toon && m.userData.__src === src &&
              m.userData.__celVersion === celProgramVersion &&
              m.userData.__celShader === shaderMode) return m;   // shader 轴变了也要重建
          if (src.isMeshBasicMaterial) return src;
          return toToonMaterial(src);
        }
        // pbr：还原原始材质；但「阴影浓淡 / 脸部」是材质无关的 ✓ 也给它挂上
        if (src && (!src.userData.__shadowVersion || src.userData.__shadowVersion !== celProgramVersion)) {
          patchShadowSoften(src, celFaceRe().test(src.name || ''));
        }
        return src;
      });
      o.material = isArr ? next : next[0];
    });
    applyLilOutline();   // lilToon 描边（独立反壳网格）
    applyLockedVisibility();   // 被锁定部件的可见性优先于各种自动隐藏
    // 自动可见性逻辑（hideParts / hideByBoneScale / hideOptional）跑完后，
    // 嘴部材质跟随渲染模式重建（图集纹理复用，口型格不丢）
    if (mouthMesh) {
      if (mouthMat) mouthMat.dispose();
      mouthMat = makeMouthMaterial();
      mouthMesh.material = mouthMat;
    }
    // 保持线框开关状态
    if (wireframeOn) {
      modelRoot.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => { m.wireframe = true; });
      });
    }
    /**
     * ⚠️ **只有还在用预设时才重套** ——
     *
     *   这里原本是无条件 `applyLightingPreset(currentLighting)` ✓
     *   而 `setLilConfig()` → `applyRender()` ⇒ 改任何 lilToon 参数都会走到这里 ✓
     *   ⇒ 手动调过的光照被预设原值覆盖 ✓（用户报的那个 bug ✓）
     *
     *   `currentLighting` 为 null 表示**光照已是手动值** ✓
     *     那些值是 `writeLightState()` 直接写进去的**最终值**
     *     （见该函数注释：不走卡通补偿那条路 ✓）
     *   ⇒ 手动时跳过重套是正确语义：**手动的值优先，不被预设盖掉** ✓
     *
     *   ⚠️ 代价：手动光照下切换渲染模式（PBR ↔ 卡通）不会再自动重算补偿 ✓
     *     这是有意的 —— 手动值本身就是最终值，重算反而会把它改掉 ✓
     */
    if (currentLighting) applyLightingPreset(currentLighting); // 卡通模式下光照重新补偿
    applyOutlineParams();                // 新材质补上描边参数
    return renderMode;
  }

  /**
   * 只切换「着色器注入」。cel 与 lilToon 都注入到 toon 材质里 ✗，
   * 所以若当前 render 不是 toon，会自动提到 toon ✓（这是 shader 轴的语义决定）。
   */
  /* ---------- 描边（反壳法 / Inverted Hull，用 three 的 OutlineEffect） ---------- */
  /**
   * 官方那种卡通描边就是「反向壳」：
   *   把模型再画一遍 —— 顶点沿法线外扩、只渲染背面、填成描边色 → 形成一圈轮廓。
   * three 自带的 OutlineEffect 正是这个做法，且完整支持蒙皮（Skinning），
   * 外扩量乘 pos.w 做透视补偿 → 屏幕上宽度基本恒定。
   *
   * 可调参数：
   *   thickness 粗细（NDC 偏移量；0.004 ≈ 2px @900px 宽视口）
   *   color     颜色（官方一般不是纯黑，而是偏暖的深色）
   *   alpha     透明度
   * 单个材质可用 material.userData.outlineParameters = { visible: false } 关掉描边。
   */
  const OUTLINE_DEFAULT = { thickness: 0.004, color: [0.10, 0.07, 0.11], alpha: 1.0 };
  let outlineEffect = null;
  let outlineOn = true; // 默认开启（官方观感）
  const outlineParams = Object.assign({}, OUTLINE_DEFAULT);

  function applyShader(mode) {
    const next = (mode === 'lilToon') ? 'lilToon' : (mode === 'cel' ? 'cel' : 'none');
    const changed = next !== shaderMode;
    shaderMode = next;
    /**
     * ★ 切到 lilToon 时把描边也接过来。
     *
     * 为什么必须自动做：
     *   本查看器原来的描边是 three 的 OutlineEffect（后处理式反壳 ✓）✗
     *   lilToon 模式下一旦 outlineActive() 让位 ✗ 描边就整个消失了 ✗
     *   而「描边」是卡通观感的一半 ✗ 所以这里把 cel 的描边参数换算成
     *   lilToon 的 _Outline* ✗ 并默认打开 ✓
     *
     * 宽度换算：lilToon 的 ba3dOW = _OutlineWidth * 0.01（见 lilOutlineVertexGLSL ✓）
     *           所以 width = 世界厚度 / 0.01 = thickness * 100 ✓
     * 颜色/透明度直接照搬 ✓
     */
    // 尊重 cel 的描边开关：cel 关着就不强行给 lilToon 开（默认是开 ✓）
    if (next === 'lilToon' && outlineOn && !lilCfg.outline.enable) {
      const th = Number(outlineParams.thickness) || OUTLINE_DEFAULT.thickness;
      const cl = Array.isArray(outlineParams.color) ? outlineParams.color : OUTLINE_DEFAULT.color;
      const al = (outlineParams.alpha === undefined) ? 1 : Number(outlineParams.alpha);
      lilCfg.outline.enable = true;
      lilCfg.outline.width = Math.max(0.05, Math.min(10, th * 100));
      lilCfg.outline.color = [Number(cl[0]) || 0, Number(cl[1]) || 0, Number(cl[2]) || 0, isFinite(al) ? al : 1];
      lilMaterialVersion++;
      celProgramVersion++;
      console.debug('[shader] 已自动接管描边 → lilToon 反壳：width=' + lilCfg.outline.width.toFixed(3)
        + '（由 cel thickness ' + th + ' 换算 ✗ ×100 ✓）color=' + JSON.stringify(lilCfg.outline.color));
    }
    if (shaderMode !== 'none' && renderMode !== 'toon') {
      console.debug('[shader] ' + shaderMode + ' 需要 toon 材质 → render 自动设为 toon');
      renderMode = 'toon';
      applyRender('toon');       // 会连材质一起重建
      return shaderMode;
    }
    if (!modelRoot) return shaderMode;
    if (changed) applyRender(renderMode);   // 触发材质重建（cacheKey 随 shaderMode 变）

    // 兜底：无条件把所有材质的 needsUpdate 置位。
    // 依赖 applyRender 的复用判定理论上够 ✗ 但一旦哪里漏了，材质会被复用 → 着色器不重编译
    // → 切回 cel 却还是 lilToon 的样子。needsUpdate 让 three 无条件重算 program key 并重编译 ✓
    modelRoot.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach((m) => { if (m) m.needsUpdate = true; });
    });
    // lilToon 描边是独立的反壳网格 ✗ 由 applyLilOutline() 增删 ✗ 这里显式建一次 ✓
    if (shaderMode === 'lilToon') applyLilOutline();
    console.debug('[shader] 已切到 ' + shaderMode + '（材质已标记重编译）');
    return shaderMode;
  }

  /* ---------- 打光预设（灯光 + 曝光；卡通模式下自动补偿） ---------- */
  /** 每次 applyLightingPreset 的实际结果（排查曝光漂移用 ✗ 见 shaderReport） */
  let lastLighting = null;
  let lightingApplyCount = 0;

  function applyLightingPreset(name) {
    const p = LIGHTING_PRESETS[name];
    if (!p) return null;
    const cel = shaderActive();   // 只有 toon + 着色器时才补偿 ✓ PBR/Unlit 保持原样
    /**
     * 卡通模式的灯光补偿。
     *
     * MeshToonMaterial 不支持 envMap，RoomEnvironment 的环境照明整个丢掉，所以确实要补 ——
     * 但**补偿方向很关键**。渲染式：
     *
     *     lit    = hemi×0.62 + key×1.0     + rim + fill
     *     shadow = hemi×0.62 + key×celDark + rim + fill      ← 投影挡住的是**整个主光**
     *
     * 环境光同时出现在两项里 → **hemi 越高，阴影被冲得越淡**。
     * 旧代码把 hemi ×1.25（想补回环境光），配上已调亮的白昼 hemi=0.88 就是 1.10，
     * lit≈1.28 / shadow≈1.09，过色调映射后两者都接近纯白 → **阴影直接消失**。
     *
     * 正确做法：**大幅压低 hemi、抬高 key**，让主光主导。
     * 卡通不靠环境光铺亮 —— 背光面由分档的 celDark 那一档兜住（0.72 档），
     * 所以 hemi 可以很低而画面不会发黑。
     *
     * 倍率已按用户实测定标（滑块 2.1 时观感与无光照一致），故比解析估算大一档。
     * 目标值（按原始白昼 hemi 0.5 / key 2.0 / rim 1.2 / fill 0.4 推）：
     *     受光 ≈ hemi×0.16×0.62 + key×0.41 + rim×0.05 + fill×0.05 ≈ 0.95
     *     阴影 ≈ 同上但主光按 celDark=0.72 打折                      ≈ 0.72
     * 配合 'none' 直通 → 对比约 24%，清晰可见且不过曝。
     * 注意：PBR 通路完全不受这些倍率影响（只有 cel 分支乘）。
     * 每次仍从预设原值重算，否则会叠乘 lightingScale。
     */
    hemi.color.set(p.hemi.sky);
    hemi.groundColor.set(p.hemi.ground);
    // 倍率已按实测定标烘入：滑块 lightingScale 在 2.1 时观感与无光照一致，
    // 这里直接把 2.1 折进倍率，于是滑块保持 1.0 = 默认即正确（想再调仍可动滑块）
    hemi.intensity = p.hemi.intensity * (cel ? 0.48 : 1);
    keyLight.color.set(p.key.color);
    keyLight.intensity = p.key.intensity * (cel ? 1.22 : 1);
    keyLight.position.set(p.key.position[0], p.key.position[1], p.key.position[2]);
    rimLight.color.set(p.rim.color);
    rimLight.intensity = p.rim.intensity * (cel ? 0.15 : 1);
    fillLight.color.set(p.fill.color);
    fillLight.intensity = p.fill.intensity * (cel ? 0.15 : 1);
    // 卡通用 LinearToneMapping（数学上就是 ×exposure，等比缩放 → 阴影对比原样保留），
    // 亮度则交给 toneMappingExposure 精确控制。NoToneMapping 会**忽略** exposure，没法调。
    renderer.toneMappingExposure = p.exposure * (cel ? 1.15 : 1);
    if (typeof updateLightHelper === 'function') updateLightHelper();   // ★ 主光方向指示器跟着走 ✓
    // 整体亮度倍率（lightingScale）：不想改预设数值就能微调明暗
    const ls = Number(cfg.lightingScale);
    if (ls > 0 && ls !== 1) {
      hemi.intensity *= ls;
      keyLight.intensity *= ls;
      rimLight.intensity *= ls;
      fillLight.intensity *= ls;
    }
    /**
     * 色调映射：**卡通强制直通（NoToneMapping）**。
     *
     * 原因：ACES 会把两个分档一起推向纯白 —— 实测受光 1.03 / 阴影 0.83 经 ACES 后
     * 变成 0.85 / 0.82，对比从 19% 掉到 3.7%，**阴影等于消失**。
     * 直通则完整保留分档对比；前提是总量压在 1.0 以内，这正是上面压低 hemi 的原因。
     * PBR 通路不变，仍走 ACES。
     */
    const tm = cel ? THREE.LinearToneMapping
      : p.toneMapping === 'linear' ? THREE.LinearToneMapping
      : THREE.ACESFilmicToneMapping;
    if (renderer.toneMapping !== tm) {
      renderer.toneMapping = tm;
      // toneMapping 是烘进着色器的，改了必须让材质重编，否则仍按旧的色调映射渲染
      if (modelRoot) {
        modelRoot.traverse((o) => {
          if (!o.isMesh || !o.material) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => { if (m) m.needsUpdate = true; });
        });
      }
      celProgramVersion++;
    }
    /**
     * ⚠️⚠️⚠️ **两边都要写** ——
     *   `currentLighting`（模块变量 ✓）是运行时用的；
     *   `cfg.lightingPreset` 是**导出时判断「用的是预设还是手动值」**的依据 ✓
     *   ⇒ 原来只写模块变量 ⇒ `cfg.lightingPreset` **永远是 null** ⇒
     *     导出走「手动值」分支 ⇒ 吐出一坨 `lightState: { azimuth, elevation, … }`
     *     而不是干净的 `"lighting": "day"` ✓
     *     （用户报的：「sample 里也不是直接显示预设光照 ✗ 而是一堆光照参数」✓）
     *
     *   ⚠️ 这已经是本会话**第三次**同一个病：
     *     · `mouthAtlasUrl` vs `cfg.mouthAtlasUrl`
     *     · `groundOffsetY` vs `modelOffset.y`
     *     · `currentLighting` vs `cfg.lightingPreset`  ← 这次
     *   ⇒ 凡是「模块变量 + cfg 字段」双份的 ✗ 写入时必须**两边一起写** ✓
     */
    currentLighting = name;
    cfg.lightingPreset = name;
    // 记录本次实际算出的值 ✗ 与 shaderReport 对照就能看出曝光是哪一次变的 ✓
    lightingApplyCount++;
    lastLighting = {
      call: lightingApplyCount,
      preset: name,
      cel: cel,
      toneMapping: renderer.toneMapping,
      exposure: Number(renderer.toneMappingExposure.toFixed(6)),
      exposureRaw: p.exposure,
      hemi: Number(hemi.intensity.toFixed(6)),
      key: Number(keyLight.intensity.toFixed(6)),
      rim: Number(rimLight.intensity.toFixed(6)),
      fill: Number(fillLight.intensity.toFixed(6)),
      lightingScale: Number(cfg.lightingScale) || 1,
    };
    return name;
  }



  function getOutlineEffect() {
    if (outlineEffect) return outlineEffect;
    outlineEffect = new OutlineEffect(renderer, {
      defaultThickness: outlineParams.thickness,
      defaultColor: outlineParams.color,
      defaultAlpha: outlineParams.alpha,
      defaultKeepAlive: false,
    });
    return outlineEffect;
  }


  /**
   * 描边是否**真正生效**。
   *
   * ⚠️ FBX 模型一律不做描边 ✗
   *   我们的描边是反壳实现（法线外扩 ✗）✗ 对 FBX 的坐标系/法线/缩放敏感 ✗
   *   实测在 FBX 上表现不正确 ✓ lilToon 风格的描边另行处理 ✓
   *   （GLB 走的是同一套 ✗ 表现正常 ✓）
   */
  function outlineActive() {
    if (cfg.__isFbx) return false;
    // lilToon 模式下描边交给 applyLilOutline()（独立的反壳网格），这里必须让位，
    // 否则 OutlineEffect 与 lilToon 描边会同时画，出现两层描边。
    /**
     * ⚠️ lilToon 模式下**无条件**让位给 lilToon 自己的反壳描边。
     *
     * 踩过的坑：原来只在 lilCfg.outline.enable 为真时才让位 ✗
     * 于是「切到 lilToon 但还没开 lilToon 描边」这段时间里 ✗
     * cel 的 OutlineEffect 仍在画 ✗ 两层描边叠加 ✓
     * 更隐蔽的是：lilToon 的 Dissolve 只作用于**几何体本身** ✗
     * OutlineEffect 的描边是**后处理式反壳** ✗ 不参与溶解 ✗
     * 于是溶解完还剩一个完整的角色剪影 ✗ 排查了很久 ✓
     *
     * 结论：进了 lilToon 就完全用 lilToon 的描边 ✗ 不再有第二种描边 ✓
     */
    if (shaderActive() && shaderMode === 'lilToon') return false;
    return outlineOn;
  }

  /** 把当前描边参数写进场景里所有材质的 userData.outlineParameters */
  function applyOutlineParams() {
    const base = {
      thickness: outlineParams.thickness,
      color: outlineParams.color,
      alpha: outlineParams.alpha,
      visible: outlineOn,
    };
    // 光环是「薄板 + DoubleSide」：反壳沿法线外扩后，背面的壳会戳穿正面，
    // 镜头一动就闪 —— 实测 Yuuka 的光环只有 7% 厚度（0.3245×0.3245×0.0228）。
    // 用 outlineSkipPattern 按材质名排除（默认 "Halo"）。
    let skipRe = null;
    if (cfg.outlineSkipPattern) {
      try { skipRe = new RegExp(cfg.outlineSkipPattern, 'i'); } catch { skipRe = null; }
    }
    const visit = (m, off) => {
      if (!m || !m.userData) return;
      m.userData.outlineParameters = Object.assign({}, m.userData.outlineParameters, base);
      // 关掉描边的三种情况：
      //   off = true          调用方指定（地面大平面、嘴部贴片）
      //   transparent         透明材质（盾牌 alpha≈128、牛奶等）—— 反壳是"实心背面壳"，
      //                       对薄片等于糊上一层实色，会把半透明整个盖掉
      //   outlineSkipPattern  薄板类（光环），反壳会戳穿自身造成闪烁
      if (off || m.transparent === true || (skipRe && skipRe.test(m.name || ''))) {
        m.userData.outlineParameters.visible = false;
      }
    };
    if (modelRoot) {
      modelRoot.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((m) => visit(m, false));
      });
    }
    visit(ground.material, true);  // 地面是大平面，描边会糊一片
    if (mouthMat) visit(mouthMat, true); // 嘴是贴脸小片，不需要轮廓
  }

  /** 开关描边；返回是否开启 */
  function setOutline(on) {
    outlineOn = !!on;
    applyOutlineParams();
    return outlineOn;
  }

  /** 调整描边参数（thickness / color / alpha 的任意子集） */
  function setOutlineParams(o = {}) {
    if (o.thickness !== undefined) outlineParams.thickness = Number(o.thickness) || 0;
    if (o.color !== undefined) outlineParams.color = o.color;
    if (o.alpha !== undefined) outlineParams.alpha = Number(o.alpha);
    // OutlineEffect 的粗细/颜色/透明度是按材质从 userData.outlineParameters 读的，
    // 所以只需把它们写到各材质上（applyOutlineParams 会做）
    applyOutlineParams();
    return Object.assign({}, outlineParams);
  }

  /* ---------- GLB 假 BLEND 修正 ---------- */
  /**
   * GLB 里有几个材质被标成 alphaMode=BLEND，但它们其实**不该是半透明面**：
   *   · CH0155_Weapon 枪——99.3% 完全不透明（alpha 251~255）
   *   · CH0155_Milk   牛奶盒——88.1% 完全不透明，透明像素只是贴图留白（右上空白块+边框）
   * 这类材质若按透明渲染，会关掉深度写入 → 自身排序穿帮、整体看着发虚。
   *
   * 而真正的半透明面是 CH0155_Shield 盾牌：alpha 全在 128 附近（中间值）。
   *
   * 判据 ——「中间值 alpha 占比」partial = count(0 < a < 250) / 总像素：
   *   partial 很小 → 是「不透明 + 镂空/留白」型贴图 → 按不透明渲染
   *   partial 很大 → 是真的半透明面           → 保持透明
   * 实测：枪 0.7% ✓不透明 ／ 牛奶盒 3.5% ✓不透明 ／ 盾牌 100% ✓保持透明
   */
  const PARTIAL_ALPHA_LIMIT = 0.15;

  function analyzeAlpha(texture) {
    const img = texture && texture.image;
    if (!img || !img.width || !img.height) return null;
    try {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const total = c.width * c.height;
      let partial = 0;
      for (let i = 3; i < d.length; i += 4) {
        const a = d[i];
        if (a > 0 && a < 250) partial++;
      }
      return { partial: partial / total };
    } catch {
      return null;
    }
  }

  /* ---------- 交互：左键拖容器 / 右键转模型 / 页面事件 ---------- */
  /**
   * · 左键在**模型身上**按下 → 拖动所在容器（需开启 dragContainer / data-ba3d-drag）
   * · 右键在模型身上按下 → 旋转角色（OrbitControls 的右键映射为 ROTATE）
   * · 两种情况都会在容器上派发 CustomEvent（会冒泡，页面可直接监听）：
   *     ba3d:pointerdown   detail = { button, hit }
   *     ba3d:pointerup     detail = { button, hit, pressedOnModel }
   *   页面据此触发自己的逻辑（例如 play3dmodelaction）
   */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  /** 屏幕坐标是否落在模型上 */
  function hitModel(clientX, clientY) {
    if (!modelRoot) return false;
    const rect = renderer.domElement.getBoundingClientRect();
    if (!rect.width || !rect.height) return false;
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, camera);

    // 关键：蒙皮网格的 boundingBox / boundingSphere 是「懒计算 + 缓存」的，
    // 而它们常常是在骨骼矩阵还没就绪时被算出来的（例如 Box3.setFromObject 触发了
    // SkinnedMesh.computeBoundingBox）。缓存陈旧且不正确的话，
    // SkinnedMesh.raycast 第一步的包围体剔除就会把所有射线都拒掉 —— 表现就是
    // 「怎么点都点不到模型」。这里清掉，让 three 用当前骨骼状态重算
    // （一次点击的开销，可接受）。
    modelRoot.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.boundingBox = null;
        o.boundingSphere = null;
      }
    });

    return raycaster.intersectObject(modelRoot, true).length > 0;
  }

  // 开启「左键拖容器」时，左键让给拖容器、右键用来旋转角色；
  // 没开启时保持基线行为（左键旋转），避免全屏页的手感被改掉
  if (cfg.dragContainer) {
    controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };
  }

  let drag = null;
  let pressedOnModel = false;
  /**
   * 「按住才算按下」的待定状态。
   * 左键在模型上按下后先记在这里，超过 cfg.pressHoldMs 才真正算一次「按下」：
   *   · 到点 → 派发 ba3d:press，并开始拖动容器
   *   · 提前松开 → 派发 ba3d:click（算点击，不触发拖动）
   * 这样拖动和点击不会互相干扰（点一下想触发动作，结果把面板拖走了）。
   */
  let pending = null;
  let pressArmed = false;   // 本轮是否已经越过按住阈值（用于 pointerup 的 detail）

  function emit(type, detail) {
    container.dispatchEvent(new CustomEvent(type, { bubbles: true, detail }));
  }

  /** 取容器「计算后」的 transform 作为拖动基准
   *  （只读内联 style.transform 会漏掉 CSS 类里的 transform，
   *    首次拖动时把它覆盖掉就会造成面板瞬间跳位）*/
  function computedTransform(el) {
    try {
      const cs = getComputedStyle(el);
      const tf = cs && cs.transform;
      return tf && tf !== 'none' ? tf : '';
    } catch {
      return el.style.transform || '';
    }
  }

  /** 计时到点：正式「按下」——派发事件 +（可选）开始拖动容器 */
  function armPress() {
    if (!pending) return;
    const p = pending;
    p.armed = true;
    p.timer = 0;
    pressArmed = true;
    if (cfg.dragContainer) {
      // 用「当前指针位置」当拖动起点，避免按住期间移动过 → 一进入拖动就跳位
      drag = {
        id: p.id,
        x: p.lastX,
        y: p.lastY,
        base: computedTransform(container),
      };
      try { container.setPointerCapture(p.id); } catch { /* 某些浏览器不支持 */ }
    }
    emit('ba3d:press', { button: 0, heldMs: cfg.pressHoldMs, thresholdMs: cfg.pressHoldMs, hit: true });
  }

  function cancelPending(withClick) {
    if (!pending) return;
    const p = pending;
    if (p.timer) clearTimeout(p.timer);
    pending = null;
    if (withClick) {
      emit('ba3d:click', {
        button: 0,
        heldMs: Math.round(performance.now() - p.startAt),
        thresholdMs: cfg.pressHoldMs,
        hit: true,
      });
    }
  }

  function onPointerDown(e) {
    const hit = hitModel(e.clientX, e.clientY);
    if (e.button === 0) pressedOnModel = hit;
    emit('ba3d:pointerdown', { button: e.button, hit });
    if (e.button !== 0 || !hit) return;

    // 左键按在模型上 → 先进入待定，等按住够久才算「按下」
    cancelPending(false);
    pressArmed = false;
    pending = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      startAt: performance.now(),
      armed: false,
      timer: 0,
    };
    const hold = Math.max(0, Number(cfg.pressHoldMs) || 0);
    if (hold <= 0) armPress();
    else pending.timer = setTimeout(armPress, hold);
  }

  function onPointerMove(e) {
    if (pending && e.pointerId === pending.id) {
      pending.lastX = e.clientX;
      pending.lastY = e.clientY;
      if (pending.armed && cfg.dragContainer) e.preventDefault();
    }
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    container.style.transform =
      (drag.base ? drag.base + ' ' : '') + 'translate(' + dx + 'px,' + dy + 'px)';
  }

  function onPointerUp(e) {
    // 还没到阈值就松手 → 算点击
    if (pending && e.pointerId === pending.id) {
      const armed = pending.armed;
      cancelPending(!armed);
    }
    if (drag && e.pointerId === drag.id) {
      try { container.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      drag = null;
    }
    const detail = {
      button: e.button,
      hit: hitModel(e.clientX, e.clientY),
      pressedOnModel,
      pressed: pressArmed,   // 是否越过按住阈值（true=按下过，false=只是点击）
    };
    if (e.button === 0) { pressedOnModel = false; pressArmed = false; }
    emit('ba3d:pointerup', detail);
  }

  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);

  /* ---------- 动作钩子：play3dmodelaction([动作数组]) ---------- */
  /**
   * 供页面其它 js 调用：
   *   play3dmodelaction(['Formation_Pickup'])   播第一个能匹配到的动作
   *   play3dmodelaction(['A', 'B'])             按顺序找，播第一个存在的
   *   play3dmodelaction([3])                    也可以用索引
   *   play3dmodelaction('CH0155_Cafe_Idle')     单个字符串也行
   *   play3dmodelaction()                       不传 → 回到默认动作（随机 idle）
   * 匹配：先精确名字 → 再忽略大小写精确 → 再「名字包含」（忽略大小写）。
   * 返回实际播放的动作名；没找到返回 null。
   */
  function playAction(actions) {
    if (!clips.length) return null;
    if (actions === undefined || actions === null) {
      const c = pickDefaultClip();
      if (!c) return null;
      playClip(c);
      return c.name;
    }
    const list = Array.isArray(actions) ? actions : [actions];
    for (const a of list) {
      if (a === undefined || a === null || a === '') continue;
      let clip = null;
      if (typeof a === 'number') clip = clips[a] || null;
      if (!clip && typeof a === 'string') {
        const low = a.toLowerCase();
        clip = clips.find((c) => c.name === a)
          || clips.find((c) => c.name.toLowerCase() === low)
          || clips.find((c) => c.name.toLowerCase().includes(low));
      }
      if (clip) { playClip(clip); return clip.name; }
    }
    console.warn('[viewer] play3dmodelaction 没找到对应动作：', actions);
    return null;
  }

  /** 默认动作：在名字含 idle 的动作里随机；一个都没有就退回第一段 */
  function pickDefaultClip() {
    if (!clips.length) return null;
    const idles = clips.filter((c) => /idle/i.test(c.name));
    const pool = idles.length ? idles : clips;
    const c = pool[Math.floor(Math.random() * pool.length)];
    defaultClipName = c ? c.name : null;
    return c;
  }
  let defaultClipName = null;

  /* ---------- 背景（支持透明，默认透明） ---------- */
  function applyBackground(v) {
    if (v === 'transparent' || v === undefined || v === null) {
      bgTransparent = true;
      scene.background = null;
      renderer.setClearAlpha(0);
      return null;
    }
    if (typeof v === 'number') {
      if (v === 0) return applyBackground('transparent');
      bgIdx = (((v - 1) % cfg.backgrounds.length) + cfg.backgrounds.length) % cfg.backgrounds.length;
      bgColor = new THREE.Color(cfg.backgrounds[bgIdx]);
    } else {
      bgColor = new THREE.Color(v);
    }
    bgTransparent = false;
    scene.background = bgColor;
    renderer.setClearColor(bgColor, 1);
    return bgColor.getHex();
  }

  /* ---------- 配置（JSON）：模型 / 基准 / 渲染 / 打光 / 背景 / 动作 ---------- */
  /**
   * 配置结构（所有字段都可选）：
   * {
   *   "model":      { "url": "./assets/model.glb",
   *                   "mouthAtlas": "./assets/mouth/Character_Mouth_2.png" },
   *   "pivot":      { "x": 0.25, "z": 0.30 },
   *   "renderer":   { "shading": "pbr" | "cel",
   *                   "outline": true, "outlineThickness": 0.004,
   *                   "outlineColor": [0.10, 0.07, 0.11], "outlineAlpha": 1,
   *                   "targetHeight": 2.0, "fov": 30, "shadows": true },
   *   "lighting":   { "preset": "day" | "golden" | "night", "exposure": 1.0 },
   *   "background": { "transparent": true, "color": "#10131a" },
   *   "animation":  { "name": "CH0155_Normal_Idle" }
   * }
   */

  /** 加载前：模型 URL / 嘴部图集 URL */
  /**
   * 应用 lilToon 配置。**浅合并**：只覆盖显式给出的键，其余保留默认值。
   * 这样 JSON 里写几项就改几项，不用把整套抄全。
   */
  /**
   * 应用 lilToon 配置。
   *
   * @param o       要改的字段（和 lilCfg 同构 ✗ 可以只给一部分）
   * @param matName  只改这个材质（写进 lilCfgByMaterial）✗
   *                 不传 = 改全局 lilCfg（面板选「全部」时的行为）
   */
  function applyLilConfig(o, matName) {
    if (!o || typeof o !== 'object') return;
    const perMat = !!matName;
    if (perMat && !lilCfgByMaterial[matName]) lilCfgByMaterial[matName] = {};
    const T = perMat ? lilCfgByMaterial[matName] : lilCfg;
    // 按材质时是「稀疏覆盖」✗ 只写改动过的键 ✓ 所以要按需创建子对象
    const sub = (k) => { if (!T[k]) T[k] = {}; return T[k]; };
    const num = (v) => (typeof v === 'number' && isFinite(v) ? v : undefined);
    // ⚠️ 白名单必须包含所有顶层数字字段 ✗ 漏了的字段滑杆写不进去（踩过：receive 三个一直是 1）
    for (const k of ['useShadow', 'shadowStrength', 'shadowBorder', 'shadowBlur',
      'shadow2ndBorder', 'shadow2ndBlur', 'shadow3rdBorder', 'shadow3rdBlur',
      'shadowBorderRange', 'shadowMainStrength',
      'shadowReceive', 'shadow2ndReceive', 'shadow3rdReceive',
      'shadowAmbient',
      // 渲染状态（lilToon 的 _TransparentMode / _Cutoff / _Cull ✗ 默认 -1 = 不改 ✓）
      'transparentMode', 'cutoff', 'cull']) {
      const v = num(o[k]); if (v !== undefined) T[k] = v;
    }
    /**
     * ★ 顶层 **vec4 数组**（_MainTexHSVG / _MainTex_ScrollRotate ✓）
     *
     * ⚠️⚠️ 这两个不能走上面的数字白名单 —— 它们是数组 ⇒ num(数组) = undefined ⇒ 静默丢弃 ✓
     *     表现：面板上拖滑杆**完全没反应** ✗ 而且日志里连生成器那行都不打 ✓
     *     （因为生成器提前 return null ✗ 它看到的一直是默认值 ✓）
     *
     * ⚠️ 而且面板送进来的**不是数组** ✗ 是**稀疏补丁对象**：
     *     lilSet(patch, 'mainTexHSVG.0', 0.5) ⇒ patch = { mainTexHSVG: { '0': 0.5 } }
     *     （lilSet 用 reduce 逐层建对象 ⇒ 走到数组那层也建成了普通对象 ✓）
     *     ⇒ 必须按下标**合并**进已有数组 ✗ 不能整体替换 ✓
     *
     * ⚠️ 三种来源都要支持：
     *     · 面板稀疏补丁  { '0': 0.5 }        ⇒ 按下标合并
     *     · JSON 导入     [0.5, 1, 1, 1]     ⇒ 整体写
     *     · 只给一部分    [0.5]              ⇒ 其余分量保持
     */
    for (const k of ['mainTexHSVG', 'mainTexScrollRotate']) {
      const src4 = o[k];
      if (!src4) continue;
      if (!Array.isArray(T[k])) T[k] = (k === 'mainTexHSVG') ? [0, 1, 1, 1] : [0, 0, 0, 0];
      if (Array.isArray(src4)) {
        for (let i = 0; i < 4 && i < src4.length; i++) {
          const n = num(src4[i]); if (n !== undefined) T[k][i] = n;
        }
      } else if (typeof src4 === 'object') {
        for (const kk of Object.keys(src4)) {
          const i = Number(kk);
          if (!isFinite(i) || i < 0 || i > 3) continue;
          const n = num(src4[kk]); if (n !== undefined) T[k][i] = n;
        }
      }
    }
    /**
     * ⚠️ 必须保留第 4 个分量（alpha）✗
     *   lilToon 里 _ShadowColor.a / _Shadow2ndColor.a / _Shadow3rdColor.a 是「这一层多强」✗
     *   19 个官方预设里有 11 个的 shadow2ndColor alpha = 0（= 第二层关闭 ✓）
     *   之前 slice(0,3) 把 alpha 丢了 ✗ 那些预设全变成「第二层纯黑满强度」✗ 暗得离谱 ✓
     */
    const arr3 = (v) => (Array.isArray(v) && v.length >= 3 && v.every((x) => typeof x === 'number')
      ? (v.length >= 4 ? v.slice(0, 4) : v.slice(0, 3)) : null);
    for (const k of ['shadowColor', 'shadow2ndColor']) { const v = arr3(o[k]); if (v) T[k] = v; }
    if (o.shadow3rdColor === null) T.shadow3rdColor = null;
    else { const v = arr3(o.shadow3rdColor); if (v) T.shadow3rdColor = v; }
    /**
   * ⚠️ 这份白名单必须包含**面板上出现过的每一个组** ✗
   *    漏一个 ⇒ 那一组的**全部**滑杆和贴图都被静默丢弃（不报错 ✗ 就是不生效 ✓）
   *
   *    踩过一次：「法线 Normal」整组都死了 ✗
   *      面板有 1st 启用 / 1st 强度 / 1st 法线贴图 … 但 bump / bump2nd 不在白名单里 ✗
   *      用户选了贴图 ✗ 日志还是 tex=无 ✗ 怎么试都不行 ✓
   *
   *    ⇒ 现在 check-panel.mjs 会核对「LIL_CTRL 的组 ⊆ 白名单」✗ 不会再漏 ✓
   */
  for (const group of ['rim', 'matcap', 'emission', 'emission2nd', 'backlight', 'outline',
    'dissolve', 'main2nd', 'main3rd', 'matcap2nd', 'stencil', 'bump', 'bump2nd',
    'reflection', 'dither']) {
      const src = o[group];
      if (!src || typeof src !== 'object') continue;
      const G = sub(group);
      for (const k of Object.keys(src)) {
        if (!(k in lilCfg[group])) continue;   // 键必须存在于全局结构里（做校验）
        if (k === 'url') { G[k] = src[k] || null; continue; }
        if (k === 'tex') { G[k] = src[k] || null; continue; }   // _EmissionMap 这类贴图字段
        // ⚠️ 所有「贴图 URL」类字符串字段都要在这里放行 ✗
        //    否则会走到下面的 num() ✗ 字符串转数字得 undefined ✗ **静默丢弃** ✓
        //    （和之前 shadowReceive 白名单漏字段是同一类坑）
        // ⚠️ 层溶解的两张贴图也是 URL 字符串 · 漏了会静默丢弃（同上 ✓）
        if (k === 'maskTex' || k === 'noiseTex' || k === 'blendMask'
          || k === 'dissolveMask' || k === 'dissolveNoiseMask'
          || k === 'scaleMask' || k === 'bumpMap') { G[k] = src[k] || null; continue; }
        if (k === 'mul') { G[k] = !!src[k]; continue; }
        if (k === 'use') { G[k] = !!src[k]; continue; }   // _UseMain2ndTex 这类开关
        /**
         * ★★ 层的主贴图（tex）一旦被设置 ⇒ **自动把这一层的「启用」打开**
         *
         * 理由（反复踩到的）：
         *   用户的心智模型是「选了贴图 = 这层就在用了」·
         *   而 lilToon 的 _UseMain2ndTex 是**单独一个开关** ⇒
         *   不打开的话 lilMainLayerGLSL 第一行就 return null ⇒
         *   **面板上后面所有参数（也是 Decal / ST / 镜像 …）全部没反应** ·
         *   但贴图那行明明显示了文件名 ⇒ 看起来「设了却没效果」 ✓
         *
         * ⚠️ 只对**层的主贴图**生效（key 是 main2nd/main3rd 且字段名是 tex ✓）·
         *   遮罩类（blendMask / maskTex / noiseTex / dissolveMask …）不动「启用」 ✓
         * ⚠️ 面板那边（mkTex）也做了一次 ⇒ 这里是**兜底**：
         *   任何路径（JSON 导入 / 其它 UI / 插件）设了贴图都会自动开层 ✓
         */
        if (k === 'tex' && (group === 'main2nd' || group === 'main3rd')) {
          G.tex = src[k] || null;
          if (src[k]) G.use = true;
          continue;
        }
        if (k === 'customNormal') { G[k] = !!src[k]; continue; }   // _MatCapCustomNormal
        // Decal 的 6 个开关也是普通 bool
        // outline 的 skipTransparent 同样是 bool（lilToon 没这条 ✗ 是我们的开关 ✓）
        if (k === 'skipTransparent') { G[k] = !!src[k]; continue; }
        if (k === 'isDecal' || k === 'isLeftOnly' || k === 'isRightOnly'
          || k === 'shouldCopy' || k === 'shouldFlipMirror' || k === 'shouldFlipCopy') { G[k] = !!src[k]; continue; }
        const v = num(src[k]);
        if (v !== undefined) G[k] = v;
      }
      const c = arr3(src.color); if (c) G.color = c;
      // dissolve 的 pos 是 4 个分量（_DissolvePos = xyz 中心/方向 ✗ w = UV 旋转）
      // outline 的三个 UV/HSV 数组
      if (group === 'outline') {
        const a4 = (v) => (Array.isArray(v) && v.length >= 4 && v.every((x) => typeof x === 'number' && isFinite(x)) ? v.slice(0, 4) : null);
        for (const k of ['texST', 'texScrollRotate', 'texHSVG']) {
          const v4 = a4(src[k]); if (v4) G[k] = v4;
        }
      }
      if (group === 'dissolve') {
        // ⚠️⚠️ 面板送来的是**稀疏补丁对象**（{ '0': 2 }）· 不是数组
        //    （lilSet 用 reduce 逐层建对象 ⇒ 走到数组那层也建成了普通对象）
        //    ⇒ 只判 Array.isArray 会把面板的改动**静默丢弃**
        //    ⇒ 和 B2 的 mainTexHSVG 是同一个坑 · 这次在**组内**又犯了一遍
        //    所以下面应用时：数组 ⇒ 整体写 · 对象 ⇒ 按下标**合并**进已有数组
        const p4 = (v) => (Array.isArray(v) && v.length >= 4 && v.every((x) => typeof x === 'number' && isFinite(x)) ? v.slice(0, 4) : null);
        const pv = p4(src.pos); if (pv) G.pos = pv;
      }
      /**
       * 层溶解的 vec4 字段（_Main2ndDissolvePos / _ST / _ScrollRotate ✓）
       * 主色层的 dissolveColor 是 vec3（走 arr3 ✓）
       */
      if (group === 'main2nd' || group === 'main3rd') {
        const p4 = (v) => (Array.isArray(v) && v.length >= 4 && v.every((x) => typeof x === 'number' && isFinite(x)) ? v.slice(0, 4) : null);
        /**
           * ⚠️⚠️ 这些是**组内的 vec4** · 必须在这里显式放行
           *    通用循环只认 number / bool / 字符串 ⇒ 数组会被 num() 判成 undefined ⇒ **静默丢弃**
           *    （B2 的 mainTexHSVG 就栽在这上面 · 面板拖了完全没反应）
           */
          for (const k of ['dissolvePos', 'dissolveMaskST', 'dissolveNoiseMaskST', 'dissolveNoiseScrollRotate',
            'decalAnimation', 'decalSubParam', 'texST']) {
          const srcV = src[k];
          const v4 = p4(srcV);
          if (v4) {
            G[k] = v4;                                  // 数组（JSON 导入那条路）⇒ 整体写
          } else if (srcV && typeof srcV === 'object' && !Array.isArray(srcV)) {
            // ★ 稀疏补丁（面板那条路）⇒ 按下标合并 · 不能整体替换（否则其余分量丢）
            if (!Array.isArray(G[k])) {
              const isST = (k === 'texST' || k === 'dissolveMaskST' || k === 'dissolveNoiseMaskST');
              const base = (lilCfg['main2nd'] && Array.isArray(lilCfg['main2nd'][k])) ? lilCfg['main2nd'][k] : null;
              G[k] = (base ? base.slice() : (isST ? [1, 1, 0, 0] : [0, 0, 0, 0]));
            }
            for (const kk of Object.keys(srcV)) {
              const i4 = Number(kk);
              if (!isFinite(i4) || i4 < 0 || i4 > 3) continue;
              const n = Number(srcV[kk]);
              if (isFinite(n)) G[k][i4] = n;
            }
          }
        }
        const dc = arr3(src.dissolveColor); if (dc) G.dissolveColor = dc;
      }
      const ic = arr3(src.indirColor); if (ic) G.indirColor = ic;
      // outline 的 alpha 是第 4 个分量（_OutlineColor.a）
      if (group === 'outline') {
        const c4 = (v) => (Array.isArray(v) && v.length >= 4 && v.every((x) => typeof x === 'number' && isFinite(x)) ? v.slice(0, 4) : null);
        const v4 = c4(src.color); if (v4) G.color = v4;
        const l4 = c4(src.litColor); if (l4) G.litColor = l4;
        for (const k of ['tex', 'widthMask', 'cull', 'skipPattern', 'fixWidthMode', 'vectorTex', 'vectorUVMode']) {
          if (src[k] !== undefined) G[k] = (typeof src[k] === 'string' && src[k]) ? src[k] : (typeof src[k] === 'number' ? src[k] : null);
        }
        if (src.enable !== undefined) G.enable = !!src.enable;
        if (src.stencilEnable !== undefined) G.stencilEnable = !!src.stencilEnable;
        if (src.litEnable !== undefined) G.litEnable = !!src.litEnable;
        if (src.litShadowReceive !== undefined) G.litShadowReceive = !!src.litShadowReceive;
        if (src.litShadowDebug !== undefined) G.litShadowDebug = !!src.litShadowDebug;
        if (src.shaderColorMult !== undefined) G.shaderColorMult = !!src.shaderColorMult;
        if (src.litApplyTex !== undefined) G.litApplyTex = !!src.litApplyTex;
      }
    }
    // enabled 只对全局有意义（它是 shader 轴的开关 ✗ 不是材质级参数）
    if (!perMat && o.enabled !== undefined) {
      lilCfg.enabled = !!o.enabled;
      if (lilCfg.enabled) shaderMode = 'lilToon';
      else if (shaderMode === 'lilToon') shaderMode = 'cel';
    }
    // 参数是烘进 GLSL 的字面量 ✗ → 改完必须重建材质
    lilMaterialVersion++;
    celProgramVersion++;
    // 描边是**独立的网格**（不是烘进 GLSL 的字面量），改完要立刻同步
    applyLilOutline();
    console.debug('[lilToon] 已应用配置' + (perMat ? '（材质 ' + matName + '）' : '') +
      '：enabled=' + lilCfg.enabled + ' → shader=' + shaderMode);
  }

  function applyConfigPreLoad(c) {
    if (!c) return;
    const m = c.model || {};
    /**
     * ★ 记下「原样字符串」和「解析后的值」（导出时要比对 ✓）
     *   ⚠️ 只有**从配置文件读来的**才有 `__rawUrls` ✗ 手写 opts / data-* 没有 ✓
     */
    if (c.__rawUrls) {
      cfg.__urlRaw = Object.assign({}, c.__rawUrls);
    }
    if (m.url) cfg.modelUrl = m.url;
    /**
     * ⚠️⚠️ **只在「从配置文件载入」时记录基准值** ——
     *   我第一版把它放在外面 ⇒ **每次 applyConfig 都刷新** ⇒
     *   基准永远等于当前值 ⇒ 「没变动」**永远成立** ⇒
     *   换了模型也照样写原样路径 ✓（实测就是这样 ✗ 反了 ✓）
     *
     *   ⇒ 只有带 `__rawUrls`（= 来自配置文件 ✓）的那一次才记 ✓
     *     之后的 `applyConfig({model:{url}})` 不会覆盖基准 ⇒
     *     当前值和基准不同 ⇒ 判为「变动过」⇒ 写完整 URL ✓
     */
    if (c.__rawUrls) {
      /**
       * ⚠️ 嘴部图集要用 **`m.mouthAtlas`（配置里的值 ✓）** · 不能用模块变量 `mouthAtlasUrl` ——
       *   模块变量是**在这段代码后面**才被赋值的（`if (m.mouthAtlas) mouthAtlasUrl = ...` ✓）
       *   ⇒ 在这里读它拿到的是**上一轮的旧值** ⇒ 基准记错 ⇒
       *     比对永远不相等 ⇒ 导出的永远是完整 URL ✓
       *     （实测就是这样 ✗ 我第一版踩了 ✓）
       */
      cfg.__urlResolved = {
        modelUrl: cfg.modelUrl,
        mouthAtlas: m.mouthAtlas || mouthAtlasUrl,
      };
    }
    /**
     * ⚠️⚠️ **两个都要写** ——
     *   `mouthAtlasUrl`（模块变量 ✓）是**运行时真正用**的那个；
     *   `cfg.mouthAtlasUrl` 只在 `createViewer` 初始化时读一次（第 224 行 ✓）
     *   ⇒ 原来只写模块变量 ⇒ **`cfg` 一直是旧值** ⇒
     *     导出时读 `cfg.mouthAtlasUrl` ⇒ **嘴部图集丢失** ✓
     *     （用户报的：「有嘴部修复贴图的 sample 模型 ✗ 导出的主 json 丢失了」✓）
     */
    if (m.mouthAtlas) { mouthAtlasUrl = m.mouthAtlas; cfg.mouthAtlasUrl = m.mouthAtlas; }
  }

  /** 加载后：基准 / 渲染 / 打光 / 背景 / 动作 */
  function applyConfigPostLoad(c) {
    if (!c) return;
    const r = c.renderer || {};
    /**
     * ⚠️ 兼容**老配置**：以前导出把 lighting / background 塞在 `renderer` 里 ✓
     *   ⇒ 顶层没有就回头看 `renderer`（新导出的都在顶层 ✓）
     */
    const l = c.lighting || r.lighting || {};
    const b = c.background || r.background || {};
    const p = c.pivot || {};

    // —— 渲染器 ——
    if (r.targetHeight !== undefined) cfg.targetHeight = Number(r.targetHeight) || cfg.targetHeight;
    if (r.fov !== undefined) {
      cfg.fov = Number(r.fov) || cfg.fov;
      camera.fov = cfg.fov;
      camera.updateProjectionMatrix();
    }
    if (r.shadows !== undefined) {
      cfg.shadows = !!r.shadows;
      renderer.shadowMap.enabled = cfg.shadows;
      if (modelRoot) {
        modelRoot.traverse((o) => {
          if (!o.isMesh) return;
          o.castShadow = cfg.shadows;
          o.receiveShadow = cfg.shadows;
        });
      }
    }
    if (r.shadowBias !== undefined) { cfg.shadowBias = Number(r.shadowBias); keyLight.shadow.bias = cfg.shadowBias; }
    if (r.shadowNormalBias !== undefined) { cfg.shadowNormalBias = Number(r.shadowNormalBias); keyLight.shadow.normalBias = cfg.shadowNormalBias; }
    // tight 取景（按真实内容居中）—— 必须在 frameModel 之前生效
    /**
     * ⚠️⚠️⚠️ **这里不能再调 `applyLilConfig(r.lilToon)`** ——
     *   拆分成独立文件后 ✗ `renderer.lilToon` 变成了 `{ use: true }` ✓
     *   ⇒ 直接喂给 `applyLilConfig` 会把 `use: true` **写进 lilCfg** ⇒
     *     污染 lilToon 参数（多出一个无意义的键 ✓）
     *
     *   ⇒ 现在它只表示「**要不要用 lilToon**」✗ 不携带任何参数 ✓
     *     真正的参数走 `viewer.applyLilConfigJSON()` / `probeLilConfig()` ✓
     */
    /** ★ 修正模型位置（和导出对称 ✓）*/
    if (r.modelOffset && typeof r.modelOffset === 'object') {
      setModelOffset({
        x: Number(r.modelOffset.x) || 0,
        y: Number(r.modelOffset.y) || 0,
        z: Number(r.modelOffset.z) || 0,
      });
    }
    /** ★ 光照手动值（导出时会带；载入时套回去 ✓）*/
    if (r.lightState && typeof r.lightState === 'object') {
      try { setLightState(r.lightState); } catch (e) { console.warn('[config] lightState 套用失败：', e); }
    }
    if (r.lilToon !== undefined && typeof r.lilToon === 'object'
        && (r.lilToon.config || r.lilToon.byMaterial)) {
      // 兼容**老配置**（lilToon 参数还内嵌在主 JSON 里的那种 ✓）
      applyLilConfig(r.lilToon);
      if (r.lilToonByMaterial) this.setLilCfgByMaterial(r.lilToonByMaterial);
      console.debug('[config] 检测到**旧版内嵌**的 lilToon 参数 ⇒ 已兼容套用 ✓');
    }
    if (r.textureBase !== undefined) cfg.textureBase = r.textureBase || null;
    if (r.textureMap !== undefined) cfg.textureMap = (r.textureMap && typeof r.textureMap === 'object') ? r.textureMap : null;
    if (r.modelRotation !== undefined) {
      cfg.modelRotation = Array.isArray(r.modelRotation) && r.modelRotation.length === 3 ? r.modelRotation : null;
    }
    if (r.framing !== undefined) cfg.framing = r.framing === 'tight' ? 'tight' : 'auto';
    if (r.framingReferenceHeight !== undefined) cfg.framingReferenceHeight = Number(r.framingReferenceHeight) || 0;
    if (r.modelHeightPx !== undefined) cfg.modelHeightPx = Number(r.modelHeightPx) || 0;
    if (r.framingOffsetY !== undefined) cfg.framingOffsetY = Number(r.framingOffsetY) || 0;
    /**
     * ★★ **被 `data-ba3d-framing-offset` 强制指定的偏移 ✗ 要压回配置之上** ——
     *
     *   ⚠️ 配置里那个值是「主页面 / 大窗口」调出来的 ✓
     *     而嵌入看板的窗口往往更矮 ⇒ 需要的下移量更大 ✓
     *     ⇒ 宿主页用 data 属性显式指定时 ✗ 以它为准 ✓
     *
     *   （不压回去的话第 8056 行会把它覆盖成配置里的 22 ✓）
     */
    if (cfg.__framingOffsetForced && cfg.__framingOffsetYForced !== undefined) {
      cfg.framingOffsetY = cfg.__framingOffsetYForced;
      console.debug('[embed] 取景垂直偏移按容器指定：' + cfg.framingOffsetY + 'px ✓');
    }
    /**
     * ★ 修正模型位置（XYZ ✗ 世界单位 ✓）—— 会**真的移动模型本体** ✓
     *   ⇒ 旋转中心（相机对准点）跟着走 ⇒ 旋转天然以角色为中心 ✓
     *   （老配置里的 `renderer.pivot` 是「只动相机对准点」的旧做法 ✗ 已废弃 ✓）
     */
    if (r.modelOffset && typeof r.modelOffset === 'object') {
      setModelOffset({
        x: Number(r.modelOffset.x) || 0,
        y: Number(r.modelOffset.y) || 0,
        z: Number(r.modelOffset.z) || 0,
      });
    }
    if (r.stripRootMotion !== undefined) cfg.stripRootMotion = !!r.stripRootMotion;
    if (r.pressHoldMs !== undefined) cfg.pressHoldMs = Math.max(0, Number(r.pressHoldMs) || 0);
    if (Array.isArray(r.mouthUv) && r.mouthUv.length === 4) cfg.mouthUv = r.mouthUv.map(Number);
    if (Array.isArray(r.visibilityRules)) cfg.visibilityRules = r.visibilityRules;
    if (r.mouthCell !== undefined) cfg.mouthCell = (r.mouthCell === null ? null : Number(r.mouthCell));
    if (r.mouthIdle !== undefined) cfg.mouthIdle = !!r.mouthIdle;
    if (r.mouthIdleMs !== undefined) cfg.mouthIdleMs = Math.max(60, Number(r.mouthIdleMs) || 180);

    // —— 旋转基准（角色仍站地面，脚 y=0）——
    if (p.x !== undefined) pivotX = Number(p.x) || 0;
    if (p.z !== undefined) pivotZ = Number(p.z) || 0;
    frameModel();

    // —— 渲染模式 / 描边 ——
    // 卡通参数要先于 shading 生效，否则第一次构建材质时用的还是默认值
    if (r.celSteps !== undefined || r.celDark !== undefined || r.celShadowTint !== undefined ||
        r.celShadowMin !== undefined || r.celFaceShadowMin !== undefined ||
        r.celFaceLight !== undefined || r.facePattern !== undefined) {
      setCelParams({
        steps: r.celSteps, dark: r.celDark, shadowTint: r.celShadowTint, shadowMin: r.celShadowMin,
      faceShadowMin: r.celFaceShadowMin,
        faceLight: r.celFaceLight, facePattern: r.facePattern,
      });
    }
    // 渲染：两个正交的轴。shading 是旧的合并写法，继续支持 ✓
    if (r.shading !== undefined && r.render === undefined && r.shader === undefined) {
      setShadingLegacy(r.shading);
    }
    if (r.render !== undefined) {
      renderMode = (r.render === 'unlit') ? 'unlit' : (r.render === 'toon' ? 'toon' : 'pbr');
    }
    if (r.shader !== undefined) {
      shaderMode = (r.shader === 'lilToon') ? 'lilToon' : (r.shader === 'cel' ? 'cel' : 'none');
    }
    // faceNoShadow 不再由配置提供 —— 一律由 celFaceShadowMin / celShadowMin 派生
    cfg.faceNoShadow = deriveFaceNoShadow();
    if (r.outlineSkipPattern !== undefined) cfg.outlineSkipPattern = r.outlineSkipPattern || null;
    if (r.attachProps !== undefined) cfg.attachProps = Array.isArray(r.attachProps) ? r.attachProps : null;
    if (r.hideParts !== undefined) cfg.hideParts = r.hideParts || null;
    if (r.hideOptional !== undefined) cfg.hideOptional = !!r.hideOptional;
    if (r.hideByBoneScale !== undefined) cfg.hideByBoneScale = Math.max(0, Number(r.hideByBoneScale) || 0);
    if (r.lightingScale !== undefined) cfg.lightingScale = Number(r.lightingScale) > 0 ? Number(r.lightingScale) : 1;
    // 光照夹取（lilToon 的 _LightMinLimit / _LightMaxLimit · 可选 ✓）
    if (r.lightClampOn !== undefined) cfg.lightClampOn = !!r.lightClampOn;
    if (r.lightMinLimit !== undefined) cfg.lightMinLimit = Math.max(0, Math.min(1, Number(r.lightMinLimit) || 0));
    if (r.lightMaxLimit !== undefined) cfg.lightMaxLimit = Math.max(0, Math.min(4, Number(r.lightMaxLimit) || 1));
    // 渲染状态（顶层 · 每材质可覆盖 ✓）
    if (r.transparentMode !== undefined) cfg.transparentMode = Math.max(-1, Math.min(6, Math.round(Number(r.transparentMode)) || 0));
    if (r.cutoff !== undefined) cfg.cutoff = Math.max(0, Math.min(1, Number(r.cutoff) || 0));
    if (r.cull !== undefined) cfg.cull = Math.max(-1, Math.min(2, Math.round(Number(r.cull)) || 0));
    // 主色 UV / 色调（顶层数组 ✓）
    if (Array.isArray(r.mainTexHSVG)) cfg.mainTexHSVG = r.mainTexHSVG.slice(0, 4).map(Number);
    if (Array.isArray(r.mainTexScrollRotate)) cfg.mainTexScrollRotate = r.mainTexScrollRotate.slice(0, 4).map(Number);
    if (r.noCastPattern !== undefined) cfg.noCastPattern = r.noCastPattern || null;
    applyFaceNoShadow();  // 材质已就绪，标一次面部网格的 receiveShadow
    if (r.outline !== undefined) outlineOn = !!r.outline;
    if (r.outlineThickness !== undefined) outlineParams.thickness = Number(r.outlineThickness);
    if (r.outlineColor !== undefined) outlineParams.color = r.outlineColor;
    if (r.outlineAlpha !== undefined) outlineParams.alpha = Number(r.outlineAlpha);
    applyOutlineParams();

    // —— 打光 ——
    if (l.preset && LIGHTING_PRESETS[l.preset]) applyLightingPreset(l.preset);
    // ⚠️ 这里**不能**直接写 renderer.toneMappingExposure ✗
    //    上一行的 applyLightingPreset 已经按「预设 × 卡通补偿(×1.15)」算好了 ✗
    //    直接赋值会把它顶回预设原值 → 初始画面比切换后暗 11% ✗
    //    （这就是「切一次着色器画面才变」的真正原因 ✗ 与着色器无关 ✓）
    //    exposure 现在由 applyLightingPreset 独占管理 ✓ 想改亮度请用 lightingScale ✓

    // —— 背景（默认透明）——
    if (b.transparent === false && b.color !== undefined && b.color !== null) applyBackground(b.color);
    else applyBackground('transparent');

    // —— 默认动作 ——
    const a = c.animation || {};
    if (a.name && clips.length) {
      const hit = clips.findIndex((x) => x.name === a.name);
      if (hit >= 0) {
        playClip(clips[hit]);
        defaultClipName = clips[hit].name; // 配置指定的动作 = 新的「默认动作」
      } else {
        const played = playAction(a.name); // 允许写「包含匹配」的简写
        if (played) defaultClipName = played;
      }
    }
  }

  /**
   * 读取配置：configUrl 优先，其次 cfg.config。
   * 从 URL 读时，配置里的相对路径按「配置文件所在目录」解析 ——
   * 这样把 ch0155.json 放到站点根目录，它的 "./assets/model.glb" 就始终正确，
   * 被别的站点内嵌时也能定位到模型（跨站可用）。
   */
  /**
   * 嗅探容器格式：是不是 FBX。
   *
   * **扩展名不可靠** —— 「自定义模型」上传走的是 blob: URL（形如
   * blob:http://host/uuid），根本没有后缀 ✗，于是会被当成 glTF 送去 GLTFLoader，
   * 报 "Kaydara FBX Binary ... is not valid JSON"。
   *
   * 所以读文件头判断：
   *   FBX 二进制 → "Kaydara FBX Binary  \x00..."
   *   FBX ASCII  → "; FBX 7.x project file"
   *   glTF 二进制 → "glTF"
   * 优先用 Range 只取 32 字节；服务器忽略 Range 时退回 Blob.slice（blob 是本地对象，不产生网络开销）。
   */
  async function sniffIsFbx(url) {
    if (!url) return false;
    const looksLike = (buf) => {
      const head = new Uint8Array(buf, 0, Math.min(32, buf.byteLength));
      let str = '';
      for (let i = 0; i < head.length; i++) str += String.fromCharCode(head[i]);
      const fbx = /^Kaydara FBX Binary/.test(str) || /^; FBX/.test(str);
      console.info('[viewer] 容器格式嗅探：' + (fbx ? 'FBX' : 'glTF/其它') +
        '（文件头 "' + str.slice(0, 23).replace(/[^\x20-\x7e]/g, '.') + '"）');
      return fbx;
    };
    try {
      const res = await fetch(url, { headers: { Range: 'bytes=0-31' } });
      if (!res.ok) return false;
      const buf = await res.arrayBuffer();
      if (buf.byteLength <= 32) return looksLike(buf);
      // 服务器不认 Range，返回了整个文件 → 从 Blob 里切前 32 字节即可
      const blob = await res.blob();
      return looksLike(await blob.slice(0, 32).arrayBuffer());
    } catch (e) {
      console.warn('[viewer] 格式嗅探失败，按 glTF 处理：', e);
      return false;
    }
  }

  /** 把配置里的相对路径按「配置文件所在目录」解析 */
  function fixConfigUrls(json, absConfigUrl) {
    const base = new URL('.', absConfigUrl).href;
    const fixUrl = (p) => {
      if (typeof p !== 'string' || !p) return p;
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(p)) return p; // http(s):, data:, blob:, //
      return new URL(p, base).href;
    };
    if (json && json.model) {
      /**
       * ★★ **先把原样字符串存下来再解析**（用户的需求 ✓）——
       *
       *   「如果没有变动 ✗ 则导出的 json 这个 url 保持**读取的原样** ✗
       *     否则 ✗ 完整的」
       *
       *   ⚠️ 本函数是**原地改**（`json.model.url = fixUrl(...)` ✓）
       *     ⇒ 过了这一步就再也拿不到 `./sample.glb` 这种相对写法了 ✓
       *     ⇒ 必须在这里留一份 ✗ 导出时才能「没动过就原样写回」✓
       */
      json.__rawUrls = {
        modelUrl: json.model.url,
        mouthAtlas: json.model.mouthAtlas,
      };
      if (json.model.url) json.model.url = fixUrl(json.model.url);
      if (json.model.mouthAtlas) json.model.mouthAtlas = fixUrl(json.model.mouthAtlas);
    }
    // 贴图基准目录与映射表里的相对路径，同样按配置文件所在目录解析
    if (json && json.renderer) {
      if (json.renderer.textureBase) json.renderer.textureBase = fixUrl(json.renderer.textureBase);
      const tm = json.renderer.textureMap;
      if (tm && typeof tm === 'object') {
        for (const k of Object.keys(tm)) tm[k] = fixUrl(tm[k]);
      }
    }
    return json;
  }

  /**
   * 猜「与模型同名的配置 JSON」的地址：model.glb → model.json（同目录）。
   *
   * 本地上传的文件（blob:/data:）没有同目录概念，直接返回 null。
   */
  function autoConfigGuess() {
    const u = cfg.modelUrl;
    if (typeof u !== 'string' || !u) return null;
    if (/^(?:blob:|data:)/i.test(u)) return null;
    if (!/\.(?:glb|gltf)(?:[?#]|$)/i.test(u)) return null;
    const guess = u.replace(/\.(?:glb|gltf)(?=[?#]|$)/i, '.json');
    if (guess === u) return null;
    return new URL(guess, document.baseURI).href;
  }

  /**
   * 读取配置。优先级：
   *   ① cfg.configUrl（显式指定）
   *   ② cfg.config（直接给对象）
   *   ③ 自动发现：与模型同名的 .json（cfg.autoConfig !== false 时。如 sample.glb → sample.json）
   * 相对路径一律按「配置文件所在目录」解析。
   */
  async function resolveConfig() {
    if (cfg.configUrl) {
      const abs = new URL(cfg.configUrl, document.baseURI).href;
      const res = await fetch(abs, { cache: 'no-cache' });
      if (!res.ok) throw new Error('配置读取失败：' + abs + ' (' + res.status + ')');
      return fixConfigUrls(await res.json(), abs);
    }
    if (cfg.config) return cfg.config;

    // —— 自动发现同名 JSON ——
    if (cfg.autoConfig === false) return null;
    const guess = autoConfigGuess();
    if (!guess) return null;
    try {
      const res = await fetch(guess, { cache: 'no-cache' });
      if (!res.ok) return null;                       // 没有就没有，静默
      const json = await res.json();
      console.debug('[autoConfig] 已自动加载同名配置：' + guess);
      return fixConfigUrls(json, guess);
    } catch (e) {
      return null;                                    // 网络/解析失败也静默，不影响正常加载
    }
  }

  /* ---------- 加载模型 ---------- */

  /**
   * 贴图 URL 改写钩子。
   *
   * FBX 把贴图路径**存在文件里**（常见是艺术家机器上的绝对路径，且用 Windows 反斜杠），
   * 直接拿这个串去请求必然 404 ✗，而且反斜杠会被浏览器编码成 %5C ✗。
   * TextureLoader 最终会走 manager.resolveURL()，所以在这里统一拦下来：
   *
   *   ① 反斜杠 → 正斜杠（必须做，否则路径根本不对）
   *   ② 去掉盘符/开头多余的斜杠（C:/art/tex/body.png → art/tex/body.png）
   *   ③ textureMap 精确匹配（完整路径 / 去查询串 / 只看文件名，三级）
   *   ④ 配了 textureBase 就用「基准目录 + 文件名」兜底
   *   ⑤ 都没命中就原样返回，交给默认逻辑（URL 加载时相对路径本来就能解析 ✓）
   */
  const loadingManager = new THREE.LoadingManager();

  function resolveMappedUrl(v) {
    if (typeof v !== 'string' || !v) return v;
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(v)) return v;   // http(s): / data: / blob: / //
    try { return new URL(v, document.baseURI).href; } catch { return v; }
  }

  function rewriteTextureUrl(rawUrl) {
    let url = String(rawUrl == null ? '' : rawUrl);
    if (!url) return url;
    if (url.indexOf('data:') === 0) return url;                 // data: 一定是内嵌，别动

    // ⚠️ blob: 要分两种，不能一见就放过：
    //   真内嵌  blob:http://host/3f2a...-uuid         → 后面没有扩展名，别动 ✓
    //   假 blob blob:http://host/Clothes.png          → Loader 把「模型 blob URL 的目录」
    //        当成了基准，把文件名拼了上去 ✗（这正是贴图全 404 的原因）
    if (url.indexOf('blob:') === 0) {
      const tail = url.split('/').pop() || '';
      if (!/\.[a-z0-9]{2,5}$/i.test(tail)) return url;          // 没扩展名 → 真 blob
      url = url.replace(/^blob:(?:[a-z][a-z0-9+.-]*:\/\/[^/]*)?\//i, '');   // 剥掉假前缀
    }

    // ① 反斜杠归一 + ② 去盘符与前导斜杠
    url = url.replace(/\\/g, '/');
    url = url.replace(/^[a-zA-Z]:\//, '');
    const base = url.split('/').pop() || '';
    const noQuery = url.split('?')[0];
    const baseNoQuery = base.split('?')[0];

    const map = cfg.textureMap;
    if (map) {
      // ③ 三级匹配：原串 → 去查询串 → 文件名（FBX 里常是别人的绝对路径，只有文件名可用）
      let hit = map[url] || map[noQuery] || map[baseNoQuery]
        || map[String(rawUrl)] || map[String(rawUrl).split('?')[0]]
        || map[String(rawUrl).replace(/\\/g, '/').split('/').pop()];

      // ★ 按**主文件名**（去扩展名）再匹配一次
      //   关键场景：FBX 引用 Body.psd ✗ 但美术上传的是 Body.png ✗
      //   扩展名不同 → 上面那几级全部匹配不上 → 贴图丢失 ✓
      //   （实测 melano.fbx 手动选了 TEX/*.png 仍然全黑 ✗ 就是卡在这里 ✓）
      if (!hit && baseNoQuery) {
        const stem = baseNoQuery.replace(/\.[a-z0-9]+$/i, '').toLowerCase();
        for (const key of Object.keys(map)) {
          const kStem = String(key).replace(/\\/g, '/').split('/').pop().replace(/\.[a-z0-9]+$/i, '').toLowerCase();
          if (kStem && kStem === stem) { hit = map[key]; console.debug('[texture] 按主名匹配：' + baseNoQuery + ' → ' + key); break; }
        }
      }
      if (hit) return resolveMappedUrl(hit);
    }

    // —— .psd 自动改写 ——
    // FBX 里常引用 Photoshop 源文件（如 ..\sourceimages\Body.psd ✗）✗
    // 而美术通常已经把导出的 PNG 放在模型同级的 TEX/ 或 textures/ 里 ✓
    // 这里自动尝试几个候选路径 ✗ 命中就用 ✓ 省掉手写 textureMap ✓
    if (/\.psd$/i.test(baseNoQuery) && baseNoQuery) {
      const stem = baseNoQuery.replace(/\.psd$/i, '');
      const dir = (cfg.modelUrl || '').split('?')[0].replace(/[^/]*$/, '');
      if (dir) {
        // ⚠️ URLModifier 是**同步**的 ✗ 不能先探测哪个存在 ✓
        //    所以这里按"最常见 → 最不常见"给出候选 ✗ 用第一个 ✓
        //    第一个若 404 ✗ 请用 textureMap 精确指定 ✓（见 CONFIG.md）
        //    实测 melano：TEX/ 在模型目录的**上一级**（models/Melano/TEX/ ✗ 模型在 Model/ 里 ✓）
        const cands = [
          dir + '../TEX/' + stem + '.png',
          dir + 'TEX/' + stem + '.png',
          dir + '../Textures/' + stem + '.png',
          dir + 'Textures/' + stem + '.png',
          dir + '../tex/' + stem + '.png',
          dir + 'tex/' + stem + '.png',
          dir + stem + '.png',
          dir + '../' + stem + '.png',
        ];
        console.debug('[texture] .psd 自动改写候选：' + cands[0] + '（若 404 会依次尝试其它 ✗）');
        // ⚠️ URLModifier 是同步的 ✗ 不能探测哪个存在 ✓
        //    所以这里返回第一个候选 ✗ 失败时浏览器会给 404 ✗ 但不会再回退 ✓
        //    要精确指定请用 textureMap ✓
        return resolveMappedUrl(cands[0]);
      }
    }

    const tb = cfg.textureBase;
    if (tb && baseNoQuery) {
      // ④ 基准目录 + 文件名。只在「路径看着像外部绝对路径」或已经兜底时才用，
      //    避免把能正常解析的相对路径也改坏。
      const looksForeign = !/^\.{0,2}\//.test(url) || /^[a-zA-Z]:/.test(String(rawUrl));
      if (looksForeign) return resolveMappedUrl(tb.replace(/\/?$/, '/') + baseNoQuery);
    }
    return url;   // ⑤ 原样
  }

  loadingManager.setURLModifier(rewriteTextureUrl);

  /**
   * 所有资源加载完成后**自动重建一次材质**。
   *
   * 起因：实测 Maca.fbx「刚加载时全灰白 ✗ 随便切一次着色器就正常 ✗」。
   * 贴图是**异步**加载的 ✗ 而材质在贴图到达之前就已经编译好了 ✓
   * 手动切换着色器会触发 applyRender → 重建材质 → 这时才把贴图带上 ✓
   * 这里用 LoadingManager.onLoad 自动做同一件事 ✗ 用户就不用手动切了 ✓
   *
   * onLoad 在本 manager 的**全部**待加载项（模型 + 贴图）结束时触发 ✓
   * 重建是幂等的 ✗ 多来一次没有副作用 ✓
   */
  loadingManager.onLoad = () => {
    if (!modelRoot) return;
    console.debug('[viewer] 全部资源加载完成 → 重建材质以带上异步到货的贴图');
    celProgramVersion++;
    applyRender(renderMode);
  };

  const loader = new GLTFLoader(loadingManager);

  /**
   * 加载：先读配置（对象或 JSON URL）→ 应用加载前字段 → 加载模型 → 应用加载后字段。
   * 返回 { meshes, triangles, animations, config }
   */
  async function load() {
    let conf = null;
    try {
      conf = await resolveConfig();
    } catch (e) {
      console.warn('[viewer] 配置读取失败，使用默认值：', e);
    }
    applyConfigPreLoad(conf);

    // MatCap 贴图：现在走 resolveMatCapTexture（按 URL 缓存 ✗ 按材质取 ✓）
    // 这里只把「全局配的那张」预热一下 ✗ 让它尽早开始加载 ✓
    // （各材质自己的 matcap.url 会在 patchToonMaterial 里按需解析 ✓）
    if (shaderMode === 'lilToon' && lilCfg.matcap && lilCfg.matcap.url) {
      resolveMatCapTexture(lilCfg.matcap.url);
    }

    // 选 loader：扩展名明确就直接定；说不清（blob: 上传、无后缀）才嗅探文件头
    // 判断格式：优先用「原始文件名提示」（上传路径会传，blob URL 本身没有后缀），
    // 其次看 URL 后缀，最后读文件头嗅探。
    const byName = cfg.modelName || '';
    let isFbx = /\.fbx(?:[?#]|$)/i.test(byName) || /\.fbx(?:[?#]|$)/i.test(cfg.modelUrl || '');
    const extKnown = /\.fbx(?:[?#]|$)/i.test(byName) || /\.(?:glb|gltf)(?:[?#]|$)/i.test(byName)
      || isFbx || /\.(?:glb|gltf)(?:[?#]|$)/i.test(cfg.modelUrl || '');
    if (!extKnown) isFbx = await sniffIsFbx(cfg.modelUrl);
    cfg.__isFbx = isFbx;   // 描边对 FBX 有问题 ✗ 见 outlineActive()
    const mdl = isFbx ? new FBXLoader(loadingManager) : loader;
    // FBX 的贴图基准目录（等价于 setResourcePath），不配就用模型 URL 所在目录
    if (isFbx && cfg.textureBase) mdl.setResourcePath(resolveMappedUrl(cfg.textureBase));
    const info = await new Promise((resolve, reject) => {
      mdl.load(
        cfg.modelUrl,
        (result) => {
          // GLTFLoader 给 { scene, animations }；FBXLoader 直接给 Object3D，animations 挂在它身上
          const gltf = isFbx
            ? { scene: result.scene || result, animations: result.animations || [] }
            : result;
          modelRoot = gltf.scene;

          // 朝向修正（FBX 常见 Z-up）。必须在归一化之前设，否则取景会算错。
          if (Array.isArray(cfg.modelRotation) && cfg.modelRotation.length === 3) {
            const d2r = THREE.MathUtils.degToRad;
            modelRoot.rotation.set(
              d2r(Number(cfg.modelRotation[0]) || 0),
              d2r(Number(cfg.modelRotation[1]) || 0),
              d2r(Number(cfg.modelRotation[2]) || 0));
            console.info('[viewer] 已应用 modelRotation =', cfg.modelRotation);
          }

          let meshCount = 0;
          let triCount = 0;
          modelRoot.traverse((obj) => {
            if (!obj.isMesh) return;
            meshCount++;
            obj.castShadow = cfg.shadows;
            obj.receiveShadow = cfg.shadows;

            if (obj.geometry) {
              const idx = obj.geometry.index;
              triCount += idx ? idx.count / 3 : obj.geometry.attributes.position.count / 3;
            }

            if (obj.material) {
              const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
              mats.forEach((m) => {
                if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
                /**
                 * ══ ★ uv1 / tangent 体检（Decal 的前置 ✓ 只打一次）══
                 *
                 * Decal 用 uv1 采样（_Main2ndTex_UVMode=1 ✓）✗ 而
                 * 「GLB 里有 TEXCOORD_1」**不代表它对这个材质有意义** ——
                 * 它可能是空通道 / 全 0 / 只覆盖一小块 ✓
                 * ⇒ 如果 uv1 全 0 ⇒ texture2D 永远采同一个纹素 ⇒ 整层变一片平色
                 *   ⇒ 看起来就是「开了 Decal 但画面没变化」✓
                 *
                 * ⇒ 这里把「有没有 uv1」「uv1 是不是退化的」打出来 ✗ 一眼定位 ✓
                 */
                if (obj.geometry && !obj.geometry.userData.__ba3dUvCheck) {
                  obj.geometry.userData.__ba3dUvCheck = true;
                  const g = obj.geometry;
                  const a1 = g.attributes && g.attributes.uv1;
                  const at = g.attributes && g.attributes.tangent;
                  const nm = (m.name || obj.name || '?');
                  if (!a1) {
                    console.debug('[uv-check] ' + nm + '：**没有 uv1 属性** ⇒ Decal 用 uvMode=1 会采到固定点 ⇒ 请改用 uvMode=0 测 ✓');
                  } else {
                    // 抽样 200 个点看波动范围 ✓ 全一样就是退化的
                    const arr = a1.array;
                    const n = a1.count;
                    const step = Math.max(1, Math.floor(n / 200));
                    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
                    for (let vi = 0; vi < n; vi += step) {
                      const x = arr[vi * 2], y = arr[vi * 2 + 1];
                      if (x < minx) minx = x; if (x > maxx) maxx = x;
                      if (y < miny) miny = y; if (y > maxy) maxy = y;
                    }
                    const span = Math.max(maxx - minx, maxy - miny);
                    console.debug('[uv-check] ' + nm + '：uv1 存在 · 采样 ' + Math.ceil(n / step) + '/' + n
                      + ' 点 · x∈[' + minx.toFixed(4) + ',' + maxx.toFixed(4) + '] y∈[' + miny.toFixed(4) + ',' + maxy.toFixed(4) + ']'
                      + ' 跨度=' + span.toFixed(4)
                      + (span < 0.001 ? ' ⇒ **退化（几乎单点）** ⇒ Decal 会变成一片平色 ✓' : ' ⇒ 正常 ✓'));
                  }
                  console.debug('[uv-check] ' + nm + '：切线 ' + (at ? '有（w 可用于 isRightHand ✓）' : '**没有** ⇒ 单侧显示不生效（vBa3dRightHand 恒为 1 ✓）'));
                }
                if (m.emissiveMap) m.emissiveMap.colorSpace = THREE.SRGBColorSpace;
                m.side = THREE.FrontSide;
                if (m.transparent) {
                  const st = analyzeAlpha(m.map);
                  if (st && st.partial < PARTIAL_ALPHA_LIMIT) {
                    // 贴图是「不透明 + 镂空/留白」型（枪、牛奶盒）→ 按不透明渲染：
                    // 否则 depthWrite 被关掉，会自身排序穿帮、整体发虚
                    m.transparent = false;
                    m.depthWrite = true;
                    m.alphaTest = 0;
                    console.debug('[material] BLEND 但实为不透明贴图，已按不透明处理：', m.name,
                      '（中间 alpha 占比 ' + (st.partial * 100).toFixed(1) + '%）'
                    );
                  } else {
                    m.depthWrite = false;
                  }
                  m.needsUpdate = true;
                }
              });
            }
            meshCache.push(obj);
          });

          if (gltf.animations && gltf.animations.length > 0) {
            clips = gltf.animations;
            // 抹掉根骨骼的水平位移（行走/舞台类动作会把角色整体挪出画面）
            if (cfg.stripRootMotion) stripRootMotion();
            mixer = new THREE.AnimationMixer(modelRoot);
            // 默认动作：没配置指定的话，在名字含 idle 的动作里随机
            playClip(pickDefaultClip() || clips[0]);
          }

          fitModelToView(modelRoot);
          scene.add(modelRoot);
          bindHaloToHead();
          frameModel();
          if (mouthAtlasUrl) {
            fixMouth();
          } else {
            console.debug('[fixMouth] 未指定嘴部图集（model.mouthAtlas / data-ba3d-mouth）→ 跳过嘴部修复。' +
              '若该模型的嘴本来就是独立网格或由 morph target 驱动，这是正确行为。');
          }
          applyVisibilityRules();    // 按当前动作先应用一次显隐规则
          hintVisibilityRules();     // 需要规则但没配 → 打一条提示
          applyRender(renderMode); // 生效当前渲染模式（默认 pbr）
    // 兜底：加载完成后再显式应用一次打光 ✗
    // 现象是「初始 toneMappingExposure=1.0 ✗ 切一次后变 1.15 且不再回退」✗
    // 说明初始那次计算与后续不一致 ✗ 这里强制对齐 ✓（该函数是幂等的 ✗ 每次都从预设原值重算 ✓）
    applyLightingPreset(currentLighting);
          fixZeroNormals();          // 零法线网格（多数光环）重算法线，否则受光模式下全黑
          applyAttachProps();        // 把脱落的道具骨骼挂到角色骨骼上（按配置）
          applyHideParts();          // 藏掉错位的脱落道具（按配置）
          if (cfg.hideOptional) { collectOptionalParts(); applyOptionalParts(); }

          /**
           * 安全网：把「没有图像数据的贴图」置为 null。
           *
           * 空贴图（如 FBXLoader 对 .psd 造的占位贴图 ✗ 或加载失败的贴图 ✗）
           * 在 three 里**采样结果是纯黑 (0,0,0)** ✗ 不是"没有贴图" ✓
           * 于是一张空贴图会让整个模型变成全黑 ✗（实测 melano.fbx 就是这样 ✓）
           * 置 null 后至少退回纯色 ✗ 不会全黑 ✓
           */
          modelRoot.traverse((o) => {
            if (!o.isMesh || !o.material) return;
            const mats = Array.isArray(o.material) ? o.material : [o.material];
            mats.forEach((m) => {
              if (!m || !m.map) return;
              const img = m.map.image;
              if (!img || (img.width === 0 && img.height === 0)) {
                console.warn('[texture] 贴图无图像数据，已置空以避免全黑：', m.name, m.map.name || '');
                m.map = null;
                m.needsUpdate = true;
              }
            });
          });
          collectBoneScaleTargets();   // 预筛"骨头很少"的网格（避免每帧全场景遍历）
          prepareRootCompensation();   // 记录根骨骼基准（对象级根位移补偿）
          applySceneHelpers();          // ★ 坐标轴 / 网格 / 主光指示 ✓
          applyGroundOffset();          // ★ 落地微调（fitToView 之后 ✓）
          applyOutlineParams();      // 生效当前描边设置
          cfg.faceNoShadow = deriveFaceNoShadow();   // 由浓度派生
          applyFaceNoShadow();       // 面部是否接收阴影

          // 让蒙皮网格的包围体用「正确的骨骼状态」重建一次：
          // 否则视锥剔除和射线检测都会拿错误的老缓存做判断
          modelRoot.traverse((o) => {
            if (o.isSkinnedMesh) {
              o.boundingBox = null;
              o.boundingSphere = null;
            }
          });

          resolve({
            meshes: meshCount,
            triangles: Math.round(triCount),
            animations: gltf.animations ? gltf.animations.length : 0,
          });
        },
        (xhr) => {
          if (xhr.lengthComputable && opts.onProgress) {
            opts.onProgress(xhr.loaded / xhr.total);
          }
        },
        (err) => reject(err)
      );
    });

    // 加载完成后再应用配置里「与模型相关」的部分（基准/渲染/打光/背景/动作）
    applyConfigPostLoad(conf);

    /**
     * ★★ **默认视角 = 快捷「正视」** —— 由 `frameModel()` 直接给到位 ✓
     *
     *   ⚠️⚠️ 我第一版是「先让 frameModel 随便摆 ✗ 400ms 后再掰到正视」⇒
     *     **载入时相机会跳一下** ✓
     *     （用户报的：「为什么刚载入时相机位置不一样会跳变一下」✓）
     *
     *   跳变有两个来源：
     *     · 水平：frameModel 原来对准 `contentBox` 中心（≈ -0.1 ✓），
     *             而正视预设把 x/z 归零 ⇒ 横移 ✓
     *     · 竖直：frameModel 把相机抬高 `elev`（略微俯视 ✓），
     *             而正视预设让相机与目标同高 ⇒ 下沉 ✓
     *
     *   ⇒ ✅ 改法见上面 `frameModel` 里那段注释：
     *     **让初始取景本身就是「沿中轴线的正视」** ✗ 于是根本不需要再掰 ✓
     *     那个 `setTimeout(… applyViewPreset('front') …, 400)` 已删除 ✓
     *
     *   ⚠️ 用户**手动**点「正视」按钮时仍然走 `applyViewPreset` ✓
     *     那是显式动作 ✗ 相机变到与目标同高是预期行为 ✓ 不算跳变 ✓
     */

    // 诊断信息（单行输出，避免控制台折叠/截断）：内嵌出问题时这几行能直接定位
    const size = modelSize ? modelSize.clone() : new THREE.Vector3();
    const noImg = [];
    const seenTex = new Set();
    const scanTex = (m) => {
      if (!m) return;
      ['map', 'gradientMap', 'normalMap', 'alphaMap', 'emissiveMap'].forEach((k) => {
        const t = m[k];
        if (t && !t.image && t.version > 0 && !seenTex.has(t.uuid)) {
          seenTex.add(t.uuid);
          noImg.push((m.name || '?') + '.' + k);
        }
      });
    };
    modelRoot.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(scanTex);
    });
    const v3 = (v) => '[' + v.toArray().map((n) => +n.toFixed(2)).join(',') + ']';
    console.info(
      '[viewer] 加载完成 | 模型=' + cfg.modelUrl +
      ' | 图集=' + (mouthAtlasUrl || '(未配置，不做嘴部修复)') +
      ' | 图集已加载=' + !!(mouthTex && mouthTex.image) +
      ' | 嘴部材质=' + (mouthMat && mouthMat.type) +
      ' | 坏纹理=' + (noImg.length ? noImg.join(',') : '无') +
      ' | 包围盒=' + v3(size) +
      ' | 相机=' + v3(camera.position) +
      ' | 注视=' + v3(controls.target) +
      ' | 画布=' + renderer.domElement.width + 'x' + renderer.domElement.height +
      ' | 容器=' + container.clientWidth + 'x' + container.clientHeight +
      ' | 渲染=' + shadingLabel() +
      ' | 描边=' + outlineOn +
      ' | 背景透明=' + bgTransparent +
      ' | 网格=' + info.meshes
    );
    // 首帧后采样画面中心像素：判断"到底有没有画出东西"
    requestCanvasSample();

    return Object.assign({}, info, { config: conf });
  }

  /* ---------- 首帧像素采样（自检：判断画面里到底有没有东西） ---------- */
  let samplePending = false;
  function requestCanvasSample() { samplePending = true; }
  function maybeSampleCanvas() {
    if (!samplePending) return;
    samplePending = false;
    try {
      const gl = renderer.getContext();
      const w = renderer.domElement.width;
      const h = renderer.domElement.height;
      const n = 8;
      const px = new Uint8Array(4 * n * n);
      gl.readPixels(
        Math.max(0, (w >> 1) - (n >> 1)), Math.max(0, (h >> 1) - (n >> 1)),
        n, n, gl.RGBA, gl.UNSIGNED_BYTE, px
      );
      let maxA = 0, maxRGB = 0, sum = 0;
      for (let i = 0; i < px.length; i += 4) {
        maxA = Math.max(maxA, px[i + 3]);
        maxRGB = Math.max(maxRGB, px[i], px[i + 1], px[i + 2]);
        sum += px[i] + px[i + 1] + px[i + 2];
      }
      console.debug('[viewer] 首帧中心像素：maxA=' + maxA + ' maxRGB=' + maxRGB +
        ' 亮度合计=' + sum + ' 画布=' + w + 'x' + h
      );
    } catch (e) {
      console.warn('[viewer] 像素采样失败：', e);
    }
  }

  /* ---------- 渲染循环 ---------- */
  function animate() {
    if (disposed) return;
    requestAnimationFrame(animate);
    const dt = clock.getDelta();
    if (mixer) mixer.update(dt);

    // 对象级根位移补偿（动画照播，只把 modelRoot 反向偏移）
    applyRootCompensation();
    applyGroundOffset();   // ★ 落地微调（根位移补偿只碰 x/z ✗ 不冲突 ✓）
    maybeAutoSnapGround();  // ★ 只在加载后贴一次（见函数注释 ✓）

    // 按骨骼缩放隐藏道具（缩放随动作变化，必须每帧判定）
    applyBoneScaleHide();


    // 嘴部口型：按 bone_mouth 的 scale 选图集格（scale 越小嘴越开，idle≈0.697）
    if (mouthMat && mouthBone && mouthUV) {
      const driven = mouthDriverClips ? mouthDriverClips.has(currentClipName) : true;
      let cell;
      if (!driven) {
        // 当前动作没有嘴部数据 → 用配置的固定默认口型；开了 mouthIdle 才改成一格格循环
        if (cfg.mouthIdle) {
          const step = Math.max(60, Number(cfg.mouthIdleMs) || 180);
          cell = MOUTH_CELLS[Math.floor(performance.now() / step) % MOUTH_CELLS.length];
        } else {
          cell = defaultMouthCell();
        }
      } else {
        const scale = mouthBone.scale.x;
        const openness = Math.max(0, Math.min(0.999, (0.7 - scale) / 0.5));
        cell = MOUTH_CELLS[Math.floor(openness * MOUTH_CELLS.length)];
      }
      if (cell !== mouthCell) setMouthCell(cell);
    }

    if (modelRoot && autoRotate && !wireframeOn) {
      modelRoot.rotation.y += dt * cfg.autoRotateSpeed;
    }
    controls.update();
    updateLilOutlineCamera();   // 描边的 Z Bias 需要对象空间相机位置
    drawViewGizmo();            // ★ 右下角视角指示器（很便宜 ✓）
    // 描边开启时走 OutlineEffect（= 正常渲染 + 反壳描边两趟）
    if (outlineActive()) getOutlineEffect().render(scene, camera);
    else renderer.render(scene, camera);

    /**
     * _MainTex_ScrollRotate 需要时间（lilToon 的 LIL_TIME = _Time.y · 秒 ✓）。
     * ⚠️ 自定义 uniform three 不会自动更新 · 每帧手动喂 ✓
     * ⚠️ 必须插在 if/else **整句之后** · 插在 else 之前会破坏结构 ✓
     */
    ba3dTimeUniform.value = performance.now() / 1000;

    maybeSampleCanvas(); // 首帧后做一次像素自检
  }
  animate();

  /* ---------- 公开 API ---------- */
  const api = {
    state,
    load,

    /** 返回所有动画片段（按文件顺序），供菜单使用 */
    getAnimations() {
      return clips.map((c, i) => ({ index: i, name: c.name, duration: c.duration }));
    },

    /** 按名字或序号切换播放动作；返回实际选中的片段名，找不到返回 null */
    setAnimation(nameOrIndex) {
      if (!mixer || !clips.length) return null;
      let clip = null;
      if (typeof nameOrIndex === 'number') {
        clip = clips[nameOrIndex];
      } else {
        const key = String(nameOrIndex).toLowerCase();
        clip = clips.find((c) => c.name.toLowerCase() === key) ||
               clips.find((c) => c.name.toLowerCase().includes(key));
      }
      if (!clip) return null;
      playClip(clip);
      return clip.name;
    },

    setAutoRotate(v) {
      autoRotate = !!v;
      return autoRotate;
    },

    playPause() {
      if (!mixer) return false;
      animPlaying = !animPlaying;
      mixer.timeScale = animPlaying ? 1 : 0;
      return animPlaying;
    },

    setWireframe(v) {
      wireframeOn = !!v;
      meshCache.forEach((m) => {
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((mat) => { mat.wireframe = wireframeOn; });
      });
      return wireframeOn;
    },

    setSkeleton(v) {
      if (!modelRoot) return false;
      const on = !!v;
      if (on === !!skeletonHelper) return on;
      if (on) {
        let hasSkeleton = false;
        modelRoot.traverse((o) => { if (o.isSkinnedMesh) hasSkeleton = true; });
        if (!hasSkeleton) return false;
        skeletonHelper = new THREE.SkeletonHelper(modelRoot);
        skeletonHelper.material.depthTest = true;
        skeletonHelper.material.depthWrite = false;
        skeletonHelper.material.transparent = true;
        skeletonHelper.material.opacity = 0.85;
        scene.add(skeletonHelper);
      } else if (skeletonHelper) {
        scene.remove(skeletonHelper);
        skeletonHelper.geometry?.dispose?.();
        skeletonHelper.material?.dispose?.();
        skeletonHelper = null;
      }
      return !!skeletonHelper;
    },

    /** 返回打光预设列表（键名 + 标签），供菜单使用 */
    getLightingPresets() {
      return Object.entries(LIGHTING_PRESETS).map(([key, p]) => ({ key, label: p.label }));
    },

    /** 应用打光预设；返回预设名，找不到返回 null */
    applyLighting(name) {
      return applyLightingPreset(name);
    },

    /**
     * 卡通着色的可调参数：
     *   steps       明暗分档数（2 = 硬边两级，越大越接近平滑）
     *   dark        最暗档亮度（1.0 = 全亮）
     *   shadowTint  暗部色调 [r,g,b]（0~1），null = 只变暗不变色
     *   faceLight   面部光照修正开关（脸/眼/眉法线强制朝向摄像机）
     *   facePattern 哪些材质名算"脸"（正则片段）
     */
    getCel() {
      return celSnapshot();
    },

    /** 改卡通着色参数（传子集即可）；会重建卡通材质并重编译 shader */
    setCel(o) {
      setCelParams(o);
      return celSnapshot();
    },

    /**
     * 阴影自检 —— 把决定「脸上到底有没有影」的每一项都读出来。
     *
     * 在页面控制台执行 viewer.shadowReport()，或直接在载入后看控制台自动打印的那份。
     * 最关键的字段是 **shadowMapAllocated**：
     *   为 null  → 阴影贴图**从未被渲染过**，说明根本没有任何物体在投影（或灯没生效）
     *   非 null  → 贴图已生成，问题在接收/着色侧
     */
    shadowReport() {
      const faceRe = celFaceRe();
      const rep = {
        '阴影总开关 renderer.shadowMap.enabled': renderer.shadowMap.enabled,
        '阴影类型 shadowMap.type': renderer.shadowMap.type,
        '主光 castShadow': keyLight.castShadow,
        '主光在场景里': !!keyLight.parent,
        '主光位置': keyLight.position.toArray().map((v) => +v.toFixed(2)),
        '主光 target 在场景里': !!(keyLight.target && keyLight.target.parent),
        '★ 阴影贴图已分配（null=从未渲染）': !!keyLight.shadow.map,
        '阴影贴图尺寸': keyLight.shadow.mapSize.toArray(),
        'bias / normalBias': [keyLight.shadow.bias, keyLight.shadow.normalBias],
        '阴影相机 l/r/t/b/n/f': [
          keyLight.shadow.camera.left, keyLight.shadow.camera.right,
          keyLight.shadow.camera.top, keyLight.shadow.camera.bottom,
          keyLight.shadow.camera.near, keyLight.shadow.camera.far,
        ],
        'faceNoShadow': cfg.faceNoShadow,
        '渲染模式': shadingLabel(),
        'celSteps / celDark': [celCfg.steps, celCfg.dark],
        'celShadowMin / celFaceShadowMin': [celCfg.shadowMin, celCfg.faceShadowMin],
        '当前动作': currentClipName,
      };
      const meshes = [];
      if (modelRoot) {
        modelRoot.traverse((o) => {
          if (!o.isMesh) return;
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          const names = mats.map((m) => (m && m.name) || '');
          const isFace = names.some((n) => faceRe.test(n));
          const isHair = names.some((n) => /hair/i.test(n));
          if (!isFace && !isHair) return;
          meshes.push({
            '网格': o.name,
            '类别': isFace ? 'face' : 'hair',
            'receiveShadow': o.receiveShadow,
            'castShadow': o.castShadow,
            '材质': names[0] || '',
            '蒙皮': !!o.isSkinnedMesh,
            '可见': o.visible,
          });
        });
      }
      rep['面部/头发网格'] = meshes;
      return rep;
    },

    /**
     * 列出当前模型的全部网格及其"身体覆盖范围" —— 用来判断哪些部件**可以被单独隐藏**。
     *
     * 为什么需要它：这批 BA 模型的衣物**大多和皮肤在同一个网格/材质里**
     * （例如 CH0155_Body 一个网格覆盖 4%~77%，即脚到脖子，Skin 和 衣服共用一张图集），
     * 所以「脱衣」一般做不到 —— 没有素体 ✗。
     * 但确实有少数模型把衣物拆成了独立网格（如某泳装模型的 *_Alpha 叠加层，
     * 以及带 switch* 标记的变体部件），这些就能用 hideParts 单独藏掉。
     *
     * 用法：控制台执行
     *     console.table(viewer.listParts())
     * 看 spanPct（占角色高度的百分比）与 material：
     *     spanPct 很大（>70%）且材质名是 Body/Skin  → 多半是"皮肤+衣物"合体，藏不得
     *     spanPct 中等、材质名像 Alpha/Cloth/xx02  → 候选，可用 hideParts 试
     */
    listParts() {
      const out = [];
      if (!modelRoot) return out;
      modelRoot.updateMatrixWorld(true);

      /**
       * ⚠️ 这批 BA 模型**每个材质共享一整份顶点缓冲**，每个网格只用其中一段索引
       * （实测 CH0155_Body 只引用 2971/5873 个顶点，另一半是"未使用顶点"）。
       * 直接遍历全部顶点算包围盒会被这些无用顶点污染 —— 所有部件都会算出"跨度 100%" ✗。
       * 所以必须**只统计索引真正引用到的顶点**。
       */
      const usedBoxWorld = (mesh) => {
        const g = mesh.geometry;
        const pos = g.getAttribute('position');
        if (!pos) return null;
        const idx = new Set();
        if (g.index) { const ix = g.index; for (let i = 0; i < ix.count; i++) idx.add(ix.getX(i)); }
        else { for (let i = 0; i < pos.count; i++) idx.add(i); }
        const bb = new THREE.Box3();
        const v = new THREE.Vector3();
        for (const i of idx) {
          v.fromBufferAttribute(pos, i);
          if (mesh.isSkinnedMesh && mesh.getVertexPosition) mesh.getVertexPosition(i, v);
          v.applyMatrix4(mesh.matrixWorld);
          if (isFinite(v.x) && isFinite(v.y) && isFinite(v.z)) bb.expandByPoint(v);
        }
        return { bb, used: idx.size, total: pos.count };
      };

      const all = new THREE.Box3();
      modelRoot.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        const r = usedBoxWorld(o);
        if (r && !r.bb.isEmpty()) all.union(r.bb);
      });
      const H = Math.max(1e-6, all.max.y - all.min.y);

      modelRoot.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        const r = usedBoxWorld(o);
        if (!r || r.bb.isEmpty()) return;
        const bb = r.bb;
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const name = mats.map((m) => (m && m.name) || '').join('|');
        out.push({
          mesh: o.name,
          material: name,
          spanPct: +(((bb.max.y - bb.min.y) / H) * 100).toFixed(1),
          bottomPct: +(((bb.min.y - all.min.y) / H) * 100).toFixed(1),
          topPct: +(((bb.max.y - all.min.y) / H) * 100).toFixed(1),
          widthPct: +(((bb.max.x - bb.min.x) / H) * 100).toFixed(1),
          usedVerts: r.used,
          totalVerts: r.total,
          tris: Math.round(o.geometry.index ? o.geometry.index.count / 3 : r.total / 3),
          visible: o.visible,
        });
      });
      out.sort((a, b) => b.spanPct - a.spanPct);
      return out;
    },

    /** 打光预设的整体亮度倍率 */
    getLightingScale() { return Number(cfg.lightingScale) || 1; },
    /** 光照夹取（lilToon 的 _LightMinLimit / _LightMaxLimit ✗ 可选 ✓） */
    getLightClamp() {
      return { on: !!cfg.lightClampOn, min: Number(cfg.lightMinLimit), max: Number(cfg.lightMaxLimit) };
    },
    setLightClamp(o) {
      o = o || {};
      if (o.on !== undefined) cfg.lightClampOn = !!o.on;
      if (o.min !== undefined) cfg.lightMinLimit = Math.max(0, Math.min(1, Number(o.min) || 0));
      if (o.max !== undefined) cfg.lightMaxLimit = Math.max(0, Math.min(4, Number(o.max) || 1));
      celProgramVersion++;
      if (modelRoot) applyRender(renderMode);
      return this.getLightClamp();
    },
    /**
     * 整体亮度倍率。
     *
     * ⚠️ 预设模式下：`applyLightingPreset` 会从预设**原值**重算并乘上倍率
     *    （不会叠乘 ✓ 见该函数注释 ✓）
     * ⚠️ 手动光照模式下：没有预设可依据 ⇒ 按**新旧倍率之比**缩放当前强度 ✓
     *    否则这里会把手动值重套成预设值 ✓（和上面那个 bug 同源 ✓）
     */
    setLightingScale(v) {
      const n = Number(v);
      const prev = Number(cfg.lightingScale) > 0 ? Number(cfg.lightingScale) : 1;
      cfg.lightingScale = n > 0 ? n : 1;
      if (currentLighting) {
        applyLightingPreset(currentLighting);
      } else {
        const k = cfg.lightingScale / prev;
        hemi.intensity *= k;
        keyLight.intensity *= k;
        rimLight.intensity *= k;
        fillLight.intensity *= k;
        if (typeof updateLightHelper === 'function') updateLightHelper();
      }
      return cfg.lightingScale;
    },

    /** 当前模型识别出的「可选部件」（GLB extras.optional）及其使用情况 */
    getOptionalParts() {
      return (optionalParts || []).map((p) => ({
        name: p.name, prop: p.prop,
        usedBy: p.clips.size, visible: p.meshes.some((m) => m.visible),
      }));
    },

    /** 面部是否不接收阴影（白昼下头发投在脸上的影） */
    getFaceNoShadow() {
      let noRecv = 0, noCast = 0;
      if (modelRoot) modelRoot.traverse((o) => {
        if (!o.isMesh) return;
        if (!o.receiveShadow) noRecv++;
        if (o.castShadow === false) noCast++;
      });
      return {
        enabled: !!cfg.faceNoShadow,
        pattern: celCfg.facePattern,
        noCastPattern: cfg.noCastPattern,
        meshes: noRecv,     // 当前不接收阴影的网格数
        noCastMeshes: noCast,
      };
    },

    /** 渲染模式：'pbr' | 'cel' */
    getShading() {
      return shadingLabel();   // 兼容旧 API：返回合并后的单值
    },

    /** ⚠️ 旧 API。渲染现在是两个正交的轴（render + shader），这里返回合并后的列表以兼容 */
    getShadingModes() {
      return [
        { key: 'pbr', label: '原始（PBR）' },
        { key: 'cel', label: '卡通（Cel）' },
        { key: 'unlit', label: '无光照（Unlit）' },
      ];
    },

    setShading(mode) {
      return applyShading(mode);   // 兼容：一次设置两轴
    },

    // —— 渲染轴 ①：材质模型 ——
    getRenderModes() {
      return [
        { key: 'pbr', label: '原始（PBR）' },
        { key: 'toon', label: '卡通材质（Toon）' },
        { key: 'unlit', label: '无光照（Unlit）' },
      ];
    },
    getRender() { return renderMode; },
    setRender(mode) { return applyRender(mode); },

    // —— 渲染轴 ②：着色器 ——
    getShaderModes() {
      return [
        { key: 'none', label: '不注入（原生）' },
        { key: 'cel', label: 'Cel 分档' },
        { key: 'lilToon', label: 'lilToon 风格' },
      ];
    },
    getShader() { return shaderMode; },
    setShader(mode) { return applyShader(mode); },

    /** 两轴一起读，便于界面同步 */
    getRenderState() { return { render: renderMode, shader: shaderMode }; },

    // —— lilToon 参数：读取 / 修改 / 导出 ——

    /** lilToon 官方预设清单（供界面做下拉 ✗） */
    getLilPresets() {
      return LIL_PRESETS.map((p) => ({ key: p.n, label: p.l }));
    },

    /**
     * 套用 lilToon 官方预设（数据来自 lilToon/Presets/*.asset ✗ 见 LIL_PRESETS）。
     *
     * 流程：
     *   ① 自动切到 shader='lilToon'（预设只对 lilToon 有意义 ✗）
     *   ② **先把四个特性关掉** ✗ 再套预设 ✓
     *      否则上一个预设开着的 rim ✗ 在切换到没有 rim 的预设时会残留 ✓
     *   ③ 套用预设字段 ✗ 重建材质 ✓
     */
    applyLilPreset(name, matName) {   // matName 可选：套到指定材质上
      // ★ 特殊项：重置为出厂默认（把 lilCfg 恢复成 LIL_DEFAULTS ✗ 或清掉该材质的覆盖 ✓）
      if (name === '__default__') {
        if (shaderMode !== 'lilToon') applyShader('lilToon');
        if (matName) {
          // 按材质：删掉覆盖就等于回到全局默认
          delete lilCfgByMaterial[matName];
        } else {
          // 全局：整份替换成出厂默认
          const d = JSON.parse(JSON.stringify(LIL_DEFAULTS));
          for (const k of Object.keys(lilCfg)) delete lilCfg[k];
          Object.assign(lilCfg, d);
        }
        lilMaterialVersion++;
        celProgramVersion++;
        applyLilOutline();
        if (modelRoot) applyRender(renderMode);
        console.debug('[lilToon] 已重置为默认' + (matName ? '（材质 ' + matName + ' 的覆盖已清除）' : '（全局）'));
        return '__default__';
      }
      const p = LIL_PRESETS.find((x) => x.n === name);
      if (!p) { console.warn('[lilToon] 没有这个预设：' + name); return null; }
      if (shaderMode !== 'lilToon') applyShader('lilToon');
      // ① 清零（只关开关 ✗ 不改颜色 ✓）
      applyLilConfig({ rim: { blend: 0 }, matcap: { blend: 0 }, emission: { blend: 0 } }, matName);
      // ② 套预设
      const patch = {};
      for (const key of Object.keys(p)) {
        if (key === 'n' || key === 'l') continue;
        patch[key] = p[key];
      }
      applyLilConfig(patch, matName);
      if (modelRoot) applyRender(renderMode);
      console.debug('[lilToon] 已套用预设「' + p.l + '」(' + p.n + ')' + (matName ? ' → 材质 ' + matName : ' → 全局'));
      return p.n;
    },

    /**
     * 列出模型里的全部网格（部件面板用）。
     *   [{ name, visible, material, triangles, isSkinned, hasOutline, skipped }]
     *
     * 名字取网格的 name（three 里通常就是 FBX/GLB 的节点名）；重名时补上序号。
     */
    /**
     * 从 modelRoot 到该节点的名字链（如 Body/mouth）。
     *
     * ⚠️ 必须是**模块级**函数：listMeshes / setMeshVisible / isolateMeshes 都要用，
     *    之前把它定义在 listMeshes 内部，setMeshVisible 引用它就报 ReferenceError，
     *    表现是部件面板里的显示/隐藏勾选完全失效。
     */
    // （下面这几个方法通过闭包里的 meshPathOf 使用它，定义在 createViewer 作用域内）
    listMeshes() {
      const out = [];
      if (!modelRoot) return out;
      const seen = new Map();
      modelRoot.traverse((o) => {
        if (!o.isMesh || o.userData.__isLilOutline) return;
        let nm = o.name || '(未命名)';
        const c = (seen.get(nm) || 0) + 1;
        seen.set(nm, c);
        if (c > 1) nm = nm + ' #' + c;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        out.push({
          name: nm,
          path: meshPathOf(o),
          visible: o.visible,
          material: (m && m.name) || '',
          triangles: (o.geometry && o.geometry.index) ? Math.round(o.geometry.index.count / 3)
            : (o.geometry && o.geometry.attributes && o.geometry.attributes.position
              ? Math.round(o.geometry.attributes.position.count / 3) : 0),
          isSkinned: !!o.isSkinnedMesh,
          hasOutline: !!(o.children && o.children.some((x) => x.userData && x.userData.__isLilOutline)),
        });
      });
      return out;
    },

    /** 设置某个网格的可见性（按 listMeshes() 返回的名字 ✗ 支持同名 #n 后缀 ✓） */
    setMeshVisible(name, on) {
      if (!modelRoot) return false;
      let hit = false;
      const seen = new Map();
      modelRoot.traverse((o) => {
        if (!o.isMesh || o.userData.__isLilOutline) return;
        let nm = o.name || '(未命名)';
        const c = (seen.get(nm) || 0) + 1;
        seen.set(nm, c);
        if (c > 1) nm = nm + ' #' + c;
        const key = meshPathOf(o);
        if (nm === name || key === name) {
          setVisibleDeep(o, !!on); hit = true;
          /**
           * ⚠️ 已锁定的部件**仍然可以改**，改完更新锁定值。
           *
           * 锁定只是「不要再被自动逻辑（applyOptionalParts / hideByBoneScale / hideParts）改回去」✗
           * 不是「冻死不让动」✓ 所以已在锁定表里的话 ✗ 把新的可见性写进去 ✓
           */
          if (meshLocked.has(meshPathOf(o))) meshLocked.set(meshPathOf(o), !!on);
        }
      });
      return hit;
    },

    /** 读锁定表：{ path: boolean } */
    getMeshLocks() { const o = {}; meshLocked.forEach((v, k) => { o[k] = v; }); return o; },

    /**
     * 锁定/解锁某个部件的可见性。
     *   on = true/false → 锁定为该可见性（之后自动逻辑不再改动它）
     *   on = null       → 解锁
     */
    setMeshLocked(name, on) {
      if (on === null || on === undefined) meshLocked.delete(name);
      else meshLocked.set(name, !!on);
      return this.getMeshLocks();
    },

    /**
     * 全部显示 / 全部隐藏。
     *
     * ⚠️ 同时**锁定**每个部件（写入 meshLocked）。
     *
     * 原因：applyOptionalParts（可选部件，随动作变化）和 hideByBoneScale 之类的
     * 自动逻辑会在之后把某些网格重新设回可见 —— 实测「全隐」之后
     * CH0155_Milk_Outline / CH0155_Star 这类可选部件又会冒出来。
     * 全隐/全显是用户的**明确意图**，所以锁定它们，锁图标会亮起（可见、可解锁）。
     */
    setAllMeshesVisible(on) {
      if (!modelRoot) return 0;
      let n = 0;
      meshLocked.clear();   // 全显/全隐 = 用户明确意图 ✗ 重建锁定表 ✓
      const seen0 = new Map();
      modelRoot.traverse((o) => {
        if (!o.isMesh || o.userData.__isLilOutline) return;
        let nm = o.name || '(未命名)';
        const c = (seen0.get(nm) || 0) + 1;
        seen0.set(nm, c);
        if (c > 1) nm = nm + ' #' + c;
        setVisibleDeep(o, !!on); n++;
        meshLocked.set(meshPathOf(o), !!on);   // 一并锁定（锁图标会亮 ✗ 可解）
      });
      return n;
    },

    /** 只显示指定名字的网格（isolate ✗ 传空数组则全部显示 ✓） */
    isolateMeshes(names) {
      if (!modelRoot) return 0;
      const set = new Set(names || []);
      const all = set.size === 0;
      let n = 0;
      const seen = new Map();
      modelRoot.traverse((o) => {
        if (!o.isMesh || o.userData.__isLilOutline) return;
        let nm = o.name || '(未命名)';
        const c = (seen.get(nm) || 0) + 1;
        seen.set(nm, c);
        if (c > 1) nm = nm + ' #' + c;
        // 部件面板传进来的是 path（如 Body/mouth）✗ 两种都要比对 ✓
        // 否则 isolate 会静默失效（点了名字没反应 ✓）
        const vis = all || set.has(nm) || set.has(meshPathOf(o));
        setVisibleDeep(o, vis); n++;
      });
      return n;
    },

    /**
     * 导出模型的完整层级（诊断用）。
     *
     * 用途：搞清「部件面板没列全 / 全隐还有东西没藏 / 全显还有东西没出来」这类问题
     *   —— 到底是哪些对象没被 listMeshes 覆盖到。
     *
     *   console.table(viewer.debugTree())
     */
    /**
     * ★ 量「脚与地面的缝」（页面控制台：`viewer.probeGround()` ✓）
     *
     * 返回 `{ minY, groundY, gap, sampled, meshes }`：
     *   `gap > 0` ⇒ 悬空（脚在 y=0 之上 ✓）
     *   `gap < 0` ⇒ 陷进地面 ✓
     *   `gap ≈ 0` ⇒ 正好接地 ✓
     *
     * ⇒ 量到多少 ✗ 就把 `-gap` 填进面板的「落地微调」✓
     */
    probeGround(perMesh) { return measurePosedBottom(modelRoot, perMesh); },
    /** ★ 修正模型位置 XYZ（世界单位 ✗ 移动的是模型本体 ✓）*/
    getModelOffset() { return getModelOffset(); },
    setModelOffset(p) { return setModelOffset(p); },
    /** ★ 动作 / 编辑 模式（edit = 暂停 + T-POSE 或 _Cam 动作 ✓）*/
    getSceneMode() { return readSceneMode(); },
    setSceneMode(m) { return setSceneMode(m, this); },
    /** ★ 显示模式（'view' / 'edit'）—— 动作模式的别名 ✗ 但会顺带套辅助显示 ✓ */
    getDisplayMode() {
      return { mode: (cfg.sceneMode || 'action') === 'edit' ? 'edit' : 'view', helpers: this.getSceneHelpers() };
    },
    setDisplayMode(m) {
      if (m !== 'edit') {
        if ((cfg.sceneMode || 'action') === 'edit') setSceneMode('action', this);
        else applyHelperPreset('view');
      } else {
        setSceneMode('edit', this);
      }
      return this.getDisplayMode();
    },
    /** 重套当前模式的辅助预设（面板上的「恢复默认」✓）*/
    resetHelpers() { return applyHelperPreset((cfg.sceneMode || 'action') === 'edit' ? 'edit' : 'view'); },
    /** 当前有没有可用的「编辑姿势」动作 ✓ */
    findEditPose() { return findEditPoseClip(); },
    /** ★ 当前正在播放的动作名（工具栏下拉应该跟着它 ✓）*/
    getCurrentAnimation() { return currentClipName || null; },
    /**
     * ★ 姿势指纹 —— 把所有骨骼的世界坐标加起来做个和。
     *
     * ⚠️ 给自动化测试用的：**读状态会骗人**（`currentClipName` 换了 ✗ 画面没换 ✓）
     *   所以要比「骨骼实际在哪」✗ 这才是权威的「姿势变没变」判据 ✓
     */
    /**
     * ⚠️ 只用**平均坐标**太钝 —— 114 根骨骼里腿/躯干占多数 ✗
     *   `Cafe_Idle` 和 `Exs_Cutin_Cam` 的平均值只差 0.007 ✓
     * ⇒ 改成导出**全部骨骼坐标**✗ 让调用方算「最大单骨位移」✓
     */
    poseBones() {
      if (!modelRoot) return null;
      modelRoot.updateMatrixWorld(true);
      const out = [];
      const v = new THREE.Vector3();
      modelRoot.traverse((o) => {
        if (!o.isBone) return;
        o.getWorldPosition(v);
        out.push([+v.x.toFixed(4), +v.y.toFixed(4), +v.z.toFixed(4)]);
      });
      return out;
    },
    poseFingerprint() {
      if (!modelRoot) return null;
      modelRoot.updateMatrixWorld(true);
      let sx = 0, sy = 0, sz = 0, n = 0;
      const v = new THREE.Vector3();
      modelRoot.traverse((o) => {
        if (!o.isBone) return;
        o.getWorldPosition(v);
        sx += v.x; sy += v.y; sz += v.z; n++;
      });
      if (!n) return null;
      return { n, x: +(sx / n).toFixed(5), y: +(sy / n).toFixed(5), z: +(sz / n).toFixed(5) };
    },
    /** ★ 场景辅助显示（坐标轴 / 网格 / 主光指示 ✓）*/
    getSceneHelpers() {
      return {
        showAxes: !!cfg.showAxes, showGrid: !!cfg.showGrid, showLightHelper: !!cfg.showLightHelper,
        showViewGizmo: !!cfg.showViewGizmo,
        axesLength: cfg.axesLength, gridSize: cfg.gridSize, gridDivisions: cfg.gridDivisions,
      };
    },
    setSceneHelpers(o) {
      if (o) {
        if (o.showAxes !== undefined) cfg.showAxes = !!o.showAxes;
        if (o.showGrid !== undefined) cfg.showGrid = !!o.showGrid;
        if (o.showLightHelper !== undefined) cfg.showLightHelper = !!o.showLightHelper;
        if (o.showViewGizmo !== undefined) cfg.showViewGizmo = !!o.showViewGizmo;
        if (o.axesLength !== undefined) cfg.axesLength = Number(o.axesLength) || 1.6;
        if (o.gridSize !== undefined) cfg.gridSize = Number(o.gridSize) || 8;
        if (o.gridDivisions !== undefined) cfg.gridDivisions = Number(o.gridDivisions) || 16;
        // 尺寸变了要重建（几何体是按尺寸生成的 ✓）
        const needRebuild = (o.axesLength !== undefined && axesHelper)
          || (o.gridSize !== undefined && gridHelper) || (o.gridDivisions !== undefined && gridHelper);
        if (needRebuild) {
          if (axesHelper) { helpers.remove(axesHelper); disposeDeep(axesHelper); axesHelper = null; }
          if (gridHelper) { helpers.remove(gridHelper); disposeDeep(gridHelper); gridHelper = null; }
        }
        applySceneHelpers();
      }
      return this.getSceneHelpers();
    },
    /** ★ 相机编辑（位置 / 目标 / 距离 / fov ✓）*/
    getCameraState() { return readCameraState(); },
    setCameraState(o) { return writeCameraState(o); },
    /** 轴对齐视角：front / back / left / right / top / bottom ✓ */
    setViewPreset(name) { return applyViewPreset(name); },
    /** ★ 光照编辑（方位角 / 仰角 / 强度 / 颜色 / 环境光 ✓）*/
    getLightState() { return readLightState(); },
    setLightState(o) { return writeLightState(o); },
    /**
     * ★ 取景微调（运行时 ✓）—— 用户调「倒地动作压到画面下方」时用 ✓
     *
     * `framingOffsetY` 单位是 CSS 像素 ✗ **正值 = 取景下移 ⇒ 画面内容上移** ✓
     * `modelHeightPx` 是「角色在画面上占多少像素高」✗ 调小 = 整体拉远 ⇒ 上下余量都变大 ✓
     */
    getFraming() {
      return { framing: cfg.framing, framingOffsetY: cfg.framingOffsetY, modelHeightPx: cfg.modelHeightPx, targetHeight: cfg.targetHeight, framingReferenceHeight: cfg.framingReferenceHeight };
    },
    setFraming(o) {
      if (!o) return this.getFraming();
      if (o.framing !== undefined) cfg.framing = o.framing;
      if (o.framingOffsetY !== undefined) cfg.framingOffsetY = Number(o.framingOffsetY) || 0;
      if (o.modelHeightPx !== undefined) cfg.modelHeightPx = Number(o.modelHeightPx) || 0;
      if (o.targetHeight !== undefined) cfg.targetHeight = Number(o.targetHeight) || cfg.targetHeight;
      if (o.framingReferenceHeight !== undefined) cfg.framingReferenceHeight = Number(o.framingReferenceHeight) || 0;
      frameModel();
      return this.getFraming();
    },
    /**
     * ★★ 取景余量诊断 —— 「当前姿势有没有超出画面」（页面控制台 ✓）
     *
     * ⚠️ 为什么需要：`frameModel` 用的是 `fitToView` 时缓存的 `contentBox` ✓
     *   而**自动贴地会把模型整体下移**（`groundOffsetY` ✓）⇒
     *   缓存的框和实际位置差一个偏移 ⇒ 取景可能偏上/偏下 ✓
     *   而且不同动作的高度本来就不同（跳跃 / 蹲下 ✓）✓
     *
     * 做法：把当前姿势的**蒙皮包围盒**投到 NDC ✓
     *   `|ndc| <= 1` ⇒ 在画面里 ✗ 超出就是被裁了 ✓
     *
     * @returns {{minY:number,maxY:number,ndcTop:number,ndcBottom:number,marginTop:number,marginBottom:number,clipped:boolean}}
     */
    frameFitReport(perMesh) {
      /**
       * ★★ 量「当前姿势有没有出画」—— **两个方向都要量** ✓
       *
       * ⚠️⚠️ 原来只量了竖直（Y）⇒ **倒地 / 翻滚类动作是横向展开的** ⇒ 会漏判 ✓
       *    （用户指出：`CH0155_Vital_Death` 在内嵌看板娘那种小面板里会不全 ✓）
       *
       * ⇒ 现在把所有采样顶点投到 NDC ✗ 取 x/y 两个方向的范围 ✓
       *    `|ndc| <= 1` 在画面里 ✗ 任一方向超出就是被裁 ✓
       *
       * ⚠️ 采样数默认 2000/网格 ⇒ 报的是**保守估计**（可能漏掉最外那一点点 ✓）
       *
       * @returns {{ndcMinX,ndcMaxX,ndcMinY,ndcMaxY,marginX,marginY,clipped,clippedX,clippedY}}
       */
      const limit = perMesh || 2000;
      const p = measurePosedBottom(modelRoot, limit);
      if (!modelRoot || p.minY === null) return { clipped: false, reason: '量不到顶点' };
      const v = new THREE.Vector3();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, n = 0;
      camera.updateMatrixWorld(true);
      camera.updateProjectionMatrix();
      modelRoot.updateMatrixWorld(true);
      modelRoot.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        if (o.userData && o.userData.__isLilOutline) return;   // 描边壳被放大过 ✗ 不算 ✓
        const pos = o.geometry && o.geometry.attributes && o.geometry.attributes.position;
        if (!pos || !pos.count) return;
        const step = Math.max(1, Math.floor(pos.count / limit));
        for (let k = 0; k < pos.count; k += step) {
          v.fromBufferAttribute(pos, k);
          if (o.isSkinnedMesh && typeof o.applyBoneTransform === 'function') o.applyBoneTransform(k, v);
          else if (o.isSkinnedMesh && typeof o.boneTransform === 'function') o.boneTransform(k, v);
          v.applyMatrix4(o.matrixWorld);
          v.project(camera);
          // 相机背后的点（w<0）投影会翻号 ✗ 用 z 排掉 ✓
          if (v.z < -1 || v.z > 1) continue;
          if (v.x < minX) minX = v.x; if (v.x > maxX) maxX = v.x;
          if (v.y < minY) minY = v.y; if (v.y > maxY) maxY = v.y;
          n++;
        }
      });
      if (!n) return { clipped: false, reason: '没有有效顶点' };
      const r4 = (x) => +x.toFixed(4);
      const marginX = Math.min(1 - Math.abs(minX), 1 - Math.abs(maxX));
      const marginY = Math.min(1 - Math.abs(minY), 1 - Math.abs(maxY));
      const clippedX = minX < -1 || maxX > 1;
      const clippedY = minY < -1 || maxY > 1;
      return {
        sampled: n,
        ndcMinX: r4(minX), ndcMaxX: r4(maxX),
        ndcMinY: r4(minY), ndcMaxY: r4(maxY),
        marginX: r4(marginX), marginY: r4(marginY),
        clippedX, clippedY, clipped: clippedX || clippedY,
      };
    },
    /** 供面板在自动贴地后同步滑杆（避免两边显示不一致 ✓）*/
    onGroundOffsetChange(fn) { window.__ba3dSyncGroundUI = fn; },
    getGroundOffset() { return Number(cfg.groundOffsetY) || 0; },
    setGroundOffset(y) {
      // ⚠️ 手动调过 ⇒ 自动贴地让位（否则会在 12 帧后覆盖掉用户的值 ✓）
      if (modelRoot) modelRoot.userData.__autoSnapSkip = true;
      /**
       * ⚠️⚠️⚠️ **必须写进 `modelOffset`** ——
       *   `applyGroundOffset()` 用的是 `getModelOffset()` 的 `o.y` ✓
       *   只写 `cfg.groundOffsetY` ⇒ **算了但没用上** ✗
       *   （实测：日志说「补偿 -0.0660」而 gap 一直是 0.0661 ✓）
       *
       *   ⇒ 又是「同一个概念两处真相」✗ 和本会话踩过的几次同类 ✓
       *     现在 `modelOffset` 是**唯一真相** ✗ `groundOffsetY` 只是兼容别名 ✓
       */
      const __y = Number(y) || 0;
      cfg.groundOffsetY = __y;      // 兼容别名
      setModelOffset({ y: __y });    // ★ 真正的写入（内部会 applyGroundOffset + frameModel ✓）
      // ⚠️ 取景中心跟着走 ✗ 否则偏移大了会顶出画面（不是每帧 ✗ 只在变化时 ✓）
      frameModel();
      return this.probeGround();
    },
    /** 按当前姿势自动把脚踩到地上（量一次 ✗ 补偿回去 ✓）*/
    snapToGround() {
      const p = this.probeGround();
      if (p.gap === null) return p;
      return this.setGroundOffset((Number(cfg.groundOffsetY) || 0) - p.gap);
    },

    debugTree() {
      const out = [];
      if (!modelRoot) return out;
      const walk = (o, depth) => {
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        out.push({
          缩进: '  '.repeat(depth),
          名称: o.name || '(未命名)',
          类型: o.type,
          是网格: !!o.isMesh,
          是蒙皮: !!o.isSkinnedMesh,
          可见: o.visible,
          材质: m ? (m.name || m.type) : '',
          子节点数: o.children.length,
          是描边: !!(o.userData && o.userData.__isLilOutline),
        });
        for (const c of o.children) walk(c, depth + 1);
      };
      walk(modelRoot, 0);
      return out;
    },

    /** lilToon 描边配置（读 / 写），写后自动重建描边网格 */
    /** 取描边配置（合并后）✗ 传 matName 则取该材质最终生效的值 ✓ */
    getLilOutline(matName) {
      const src = matName ? lilCfgFor({ name: matName }) : lilCfg;
      return JSON.parse(JSON.stringify((src && src.outline) || {}));
    },
    setLilOutline(o, matName) {
      // 交给 applyLilConfig 写入目标（全局或某材质的覆盖）
      applyLilConfig({ outline: o }, matName);
      return this.getLilOutline(matName);
      // eslint-disable-next-line no-unreachable
      if (!lilCfg.outline) lilCfg.outline = {};
      // 只接受已知字段，避免拼错时静默无效
      const ALLOW = ['enable', 'color', 'tex', 'width', 'widthMask', 'fixWidth', 'vertexR2Width',
        'zBias', 'cull', 'litEnable', 'litColor', 'litScale', 'litOffset', 'skipPattern', 'fixWidthMode', 'litApplyTex', 'vectorTex', 'vectorScale', 'vectorUVMode', 'litShadowReceive', 'litShadowBlur', 'shaderColorMult', 'litShadowDebug'];
      for (const k of Object.keys(o || {})) {
        if (ALLOW.indexOf(k) < 0) { console.warn('[outline] 未知字段已忽略：' + k); continue; }
        lilCfg.outline[k] = o[k];
      }
      celProgramVersion++;
      applyLilOutline();
      return this.getLilOutline();
    },

    /** 当前 lilToon 配置的深拷贝（界面用它同步控件） */
    getLilConfig(matName) {
      const src = matName ? lilCfgFor({ name: matName }) : lilCfg;
      return JSON.parse(JSON.stringify(src));
    },

    /** 按材质覆盖表（原始 ✗ 未合并）。含自动按材质名去重后的名字列表 ✓ */
    getLilCfgByMaterial() { return JSON.parse(JSON.stringify(lilCfgByMaterial)); },

    /** 直接替换整张按材质覆盖表（导入配置用）*/
    setLilCfgByMaterial(obj) {
      lilCfgByMaterial = (obj && typeof obj === 'object') ? JSON.parse(JSON.stringify(obj)) : {};
      lilMaterialVersion++;
      celProgramVersion++;
      applyLilOutline();
    },

    /** 清掉某个材质的覆盖（回到全局）*/
    clearLilMaterialOverride(matName) {
      if (lilCfgByMaterial[matName]) {
        delete lilCfgByMaterial[matName];
        lilMaterialVersion++;
        celProgramVersion++;
        applyLilOutline();
      }
    },

    /** 模型里全部材质名（面板材质选择器用 ✗ 按名字排序去重）*/
    getLilMaterials() {
      const set = new Set();
      if (modelRoot) modelRoot.traverse((m) => { if (m.isMesh && m.material && m.material.name) set.add(m.material.name); });
      return [...set].sort();
    },

    /**
     * 改 lilToon 参数（增量合并 ✓ 只给要改的键即可）。
     * 改完立即重建材质 → 着色器重编译 → 界面/画面同步生效 ✓
     */
    setLilConfig(partial, matName) {
      if (!partial || typeof partial !== 'object') return this.getLilConfig();
      applyLilConfig(partial, matName);
      if (modelRoot) applyRender(renderMode);
      return this.getLilConfig();
    },

    /**
     * 导出配置 —— **与出厂默认值做 diff** ✗：等于默认的项不写 ✓，改过的才写 ✓。
     * 这样导出的就是一份「最小可用」的 model.json ✓ 直接丢回 assets/ 即可复现 ✓
     *
     * 这些项永远写出来（不属于 diff ✗ 因为它们是"这份配置指向哪个模型"）：
     *   model.url / model.mouthAtlas / model.rotation
     */
    exportConfig() {
      const diff = (cur, def) => {
        if (cur === null || cur === undefined) return cur === def ? undefined : cur;
        if (typeof cur !== 'object') return cur === def ? undefined : cur;
        if (Array.isArray(cur)) {
          const same = Array.isArray(def) && cur.length === def.length && cur.every((v, i) => v === def[i]);
          return same ? undefined : cur.slice();
        }
        const out = {};
        for (const k of Object.keys(cur)) {
          const v = diff(cur[k], def ? def[k] : undefined);
          if (v !== undefined) out[k] = v;
        }
        return Object.keys(out).length ? out : undefined;
      };

      const cur = {
        render: renderMode,
        shader: shaderMode,
        lightingScale: Number(cfg.lightingScale) || 1,
        outline: { on: !!outlineOn, width: outlineParams.thickness, color: outlineParams.color },
        shadow: !!cfg.shadows,
        /**
         * ★★ lilToon 参数**已拆到独立文件**（`模型名.lilToon.json` ✓）——
         *   主 JSON 里**只留一个开关**：用没用 lilToon ✓
         *
         *   ⚠️ 为什么拆：lilToon 的配置有 **200+ 个键**（含每材质覆盖 ✓）
         *     混在主 JSON 里 ⇒ 手改主配置时满屏都是它的键 ⇒ 看不懂 ✓
         *   ⚠️ 为什么留 `use`：不写的话「这个模型要不要找 lilToon 文件」
         *     就得靠猜 ✗ 显式写出来才符合「不要学习成本」✓
         */
        /**
         * ★★ 修正模型位置（用户问的：「场景的模型位置修正参数为什么没导出」✓）
         *
         *   ⚠️ 它属于**模型级的摆放**（不是视图状态 ✓）⇒ 必须跟着主 JSON 走 ✓
         *     默认 {0,0,0} ⇒ 和 `def` 一样 ⇒ diff 后**不写** ✓
         *     （自动贴地会把它写成非 0 ✗ 那时才会出现在 JSON 里 ✓）
         */
        modelOffset: getModelOffset(),
        /**
         * ★ 光照**手动值** —— 只在「预设被手动改过」时才有意义 ✓
         *   ⚠️ `lighting`（上面那个 ✓）存的是**预设名** ✗ 手动改过会置成 null ✓
         *     ⇒ 不带上手动值 ⇒ 导出的 JSON 会**丢掉光照调整** ✓
         */
        lightState: (cfg.lightingPreset ? undefined : readLightState()),
        /**
         * ⚠️⚠️⚠️ **判据必须是 `shaderMode === 'lilToon'`** ——
         *
         *   我第一版写的是 `!!shaderActive()` ✗
         *   而 `shaderActive()` 的定义是（第 5760 行 ✓）：
         *       return renderMode === 'toon' && shaderMode !== 'none';
         *   ⇒ 它是「**cel 着色器在生效**」✗ 不是「用了 lilToon」✓
         *     对默认的 `shaderMode === 'cel'` 也返回 **true** ✓
         *   ⇒ 用户刷新后明明用的是 Cel 分档 ✗ 导出却说 `lilToon: { use: true }` ✓
         *     （用户：「我刷新了以后都没选 lilToon 着色器还用的 cel 他都能？」✓）
         *
         *   `shaderMode` 的取值：`'none'` / `'cel'` / `'lilToon'` ✓
         */
        lilToon: { use: shaderMode === 'lilToon' },
        /**
         * ⚠️ 这里以前是**手写列表** ✗ 加了 bandRamp / bandSoft 后忘了同步 ⇒ 导出丢字段 ✓
         *    ⇒ 改成 celSnapshot() ✗ 以后 celCfg 加字段自动带上 ✓
         *    （同一个坑踩过好几次：applyLilConfig 的组白名单 / lilCfg 的键白名单 ✓）
         */
        cel: celSnapshot(),
      };
      const def = {
        render: 'toon',
        shader: 'cel',
        lightingScale: 1,
        outline: { on: true, width: OUTLINE_DEFAULT.thickness, color: OUTLINE_DEFAULT.color },
        shadow: true,
        // ⚠️ lilToon 的 diff 基准已移走（它不再属于主 JSON ✓）
        modelOffset: { x: 0, y: 0, z: 0 },
        lightState: undefined,   // 没有手动光照 ⇒ 不写 ✓
        cel: CEL_DEFAULTS,
      };

      const renderer = diff(cur, def) || {};

      /**
       * ★★ **`render` / `shader` / `lilToon` 三个显式写**（用户的要求 ✓）
       *
       *   ⚠️ 它们的值恰好等于默认时（`toon` / `cel` ✓）会被 diff 吃掉 ⇒
       *     JSON 里看不到 ⇒ 读的人**无法判断**「这个模型到底用什么着色」✓
       *     更糟的是：**lilToon 的开关也无从判断** ✗
       *     （用户：「还是说 cel 算预设默认就不写了？这种建议还是写上」✓）
       *
       *   ⇒ 这三个是**关键选择** ✗ 不该靠「默认值」隐含 ✓
       *     其余字段仍然只写 diff（保持配置精简 ✓）
       */
      renderer.render = renderMode;
      renderer.shader = shaderMode;
      renderer.lilToon = { use: shaderMode === 'lilToon' };
      /**
     * ★★ 模型 URL 的两种写法（用户的需求 ✓）
     *
     *   · **没变动** ⇒ 写**读进来的原样字符串**（比如 `./sample.glb` ✓）
     *   · **变动过** ⇒ 写**完整 URL**（当前实际用的那个 ✓）
     *
     *   ⚠️ 判据：当前值 === 载入时记录的那个「解析后的值」⇒ 没动过 ✓
     *     否则说明用户换了模型（或本地选文件 ⇒ blob: ✓）⇒ 写完整 ✓
     *   ⚠️ 没有 `__urlRaw`（手写 opts / data-* 进来的 ✓）⇒ 一律写完整 ✓
     */
    const urlUnchanged = !!(cfg.__urlRaw && cfg.__urlResolved
      && cfg.modelUrl === cfg.__urlResolved.modelUrl);
    const model = { url: (urlUnchanged && cfg.__urlRaw.modelUrl) || cfg.modelUrl || '' };
      /**
       * ⚠️⚠️ **读模块变量 `mouthAtlasUrl`（活的 ✓）· 不是 `cfg.mouthAtlasUrl`** ——
       *   后者只在初始化时被赋过一次 ⇒ 配置改了它不跟 ✓
       *
       *   ⚠️ 还要**跳过一次性 URL**：
       *     `blob:...` 是用户从本地选文件时 `URL.createObjectURL` 出来的 ✓
       *     它在别的会话 / 别的机器上**根本打不开** ⇒ 写进 JSON 只会误导 ✓
       *     （`data:` 同理 ✓）
       *   ⇒ 那种情况就不写 ✗ 并打一句 debug 解释为什么没写 ✓
       */
      const __atlas = mouthAtlasUrl || cfg.mouthAtlasUrl || null;
      /** ⚠️ 嘴部图集同样：没动过就写原样（`./mouth/x.png` ✓）*/
      const atlasUnchanged = !!(cfg.__urlRaw && cfg.__urlResolved
        && __atlas === cfg.__urlResolved.mouthAtlas);
      if (atlasUnchanged && cfg.__urlRaw.mouthAtlas) {
        model.mouthAtlas = cfg.__urlRaw.mouthAtlas;
      } else
      if (__atlas && !/^(blob:|data:)/i.test(String(__atlas))) {
        model.mouthAtlas = __atlas;
      } else if (__atlas) {
        console.debug('[export] 嘴部图集是本地选文件产生的一次性 URL ⇒ 不写进配置 ✓：'
          + String(__atlas).slice(0, 40) + '…');
      }
      if (Array.isArray(cfg.modelRotation)) model.rotation = cfg.modelRotation.slice();

      /**
       * ⚠️⚠️⚠️ **`lighting` / `background` / `animation` 必须放顶层** ——
       *   载入侧只读顶层（`applyConfigPostLoad`：`c.lighting` / `c.background` /
       *   `c.animation` ✓）✗ 而导出原来把前两个塞在 `renderer` 里、
       *   `animation` 干脆没导出 ✓
       *
       *   ⇒ 后果：**导出的 JSON 再导入 ⇒ 光照预设 / 背景 / 动作全会丢** ✓
       *     （用户问「是不是只有 lilToon 参数进副文件」时顺手查出来的 ✓）
       *
       *   ⇒ 形状必须和 `assets/sample.json` 一致：**顶层** ✓
       *     sample.json 的顶层键就是：_comment · model · renderer ·
       *                              lighting · background · animation ✓
       */
      const out = { model, renderer };

      // —— 打光：等于默认 'day' 就不写 ✓
      if (currentLighting && currentLighting !== 'day') out.lighting = currentLighting;

      // —— 背景：默认 { transparent: true } ⇒ 相等不写 ✓
      const bgCur = { transparent: !!cfg.transparent };
      if (cfg.background) bgCur.color = cfg.background;
      if (!(bgCur.transparent === true && bgCur.color === undefined)) out.background = bgCur;

      // —— 动作：没载入动作就不写 ✓
      if (currentClipName) out.animation = { name: currentClipName };

      return out;
    },

    /**
     * 截取当前画面为 PNG dataURL（供"保存 PNG"用）。
     *
     * ⚠️ 两个必须注意的点：
     *   ① WebGL 的绘制缓冲在浏览器合成之后就被清空了 ✗
     *      （本渲染器**没有**开 preserveDrawingBuffer ✗ 开它会明显掉性能 ✓）
     *      所以必须**立刻重绘一帧** ✗ 并且在**同一个同步任务里**读取 ✓ 中间不能 await ✓
     *   ② 渲染要跟主循环走同一条路径 —— 描边开启时是 OutlineEffect（两趟 ✗）
     *      直接调 renderer.render 会**丢掉描边** ✓
     *   ③ 透明背景下 canvas 本身是透明的 ✗ 合成到当前背景色上更便于前后对比 ✓
     */
    screenshot() {
      const canvas = renderer.domElement;
      if (outlineActive()) getOutlineEffect().render(scene, camera);
      else renderer.render(scene, camera);
      /**
       * _MainTex_ScrollRotate 需要时间（lilToon 的 LIL_TIME = _Time.y · 秒 ✓）
       *
       * ⚠️ 必须插在**整句之后** · 不能插在 `else` 之前 ⇒ 那会破坏 if/else 结构 ✓
       * ⚠️ 自定义 uniform three 不会自动更新 ⇒ 每帧手动喂 ✓
       */
      ba3dTimeUniform.value = performance.now() / 1000;

      const out = document.createElement('canvas');
      out.width = canvas.width;
      out.height = canvas.height;
      const ctx = out.getContext('2d');
      if (!bgTransparent) {
        ctx.fillStyle = '#' + bgColor.getHexString();
        ctx.fillRect(0, 0, out.width, out.height);
      }
      ctx.drawImage(canvas, 0, 0);
      return out.toDataURL('image/png');
    },

    /** 保存 PNG：直接触发下载。返回文件名 */
    saveScreenshot(name) {
      // 防抖：300ms 内重复调用直接忽略 ✗
      // 起因是「点一次保存出好几张 PNG」✗ 根因是监听器被注册多次 ✓
      // 界面那边已改成 onclick（幂等 ✗）✗ 这里再加一道保险 ✓
      const now = Date.now();
      if (this.__lastShotAt && now - this.__lastShotAt < 300) return null;
      this.__lastShotAt = now;

      const url = this.screenshot();
      const a = document.createElement('a');
      a.href = url;
      const st = this.getRenderState();
      const d = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      a.download = (name || ('ba3d-' + st.render + '-' + st.shader + '-'
        + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-'
        + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()))) + '.png';
      a.click();
      return a.download;
    },

    /** 导出为带缩进的 JSON 字符串（可直接另存为 .json） */
    exportConfigJSON() { return JSON.stringify(this.exportConfig(), null, 2); },

    /* ============================================================
     * ★★ lilToon 的独立配置文件（`模型名.lilToon.json` ✓）
     *
     *   ⚠️ 主 JSON 里只有 `lilToon: { use: true }` ✗ 参数全在这里 ✓
     * ============================================================ */
    /** lilToon 配置对象（导出用 ✓ 全局 + 每材质覆盖 ✓）*/
    exportLilConfig() {
      return {
        _comment: 'lilToon 参数 —— 只有主 JSON 的 renderer.lilToon.use 为 true 时才需要这个文件',
        version: 1,
        config: JSON.parse(JSON.stringify(lilCfg)),
        byMaterial: JSON.parse(JSON.stringify(lilCfgByMaterial)),
      };
    },
    exportLilConfigJSON() { return JSON.stringify(this.exportLilConfig(), null, 2); },

    /**
     * 套用 lilToon 独立配置（导入用 ✓）
     * ⚠️ 两个入口分开调：`config` 走 setLilConfig ✗ `byMaterial` 走 setLilCfgByMaterial ✓
     *   （它们各自会重建材质 / 重编译着色器 ✓）
     */
    /**
     * ★★ **导入 lilToon 预设**（Unity .asset 文本 ✓）
     *
     *   ⚠️ 只套用**我们能表达的字段** ✗ 其余忽略 ✓
     *     返回值里带 skipped（未识别的 lilToon 属性名 ✓）供 UI 提示 ✓
     *
     *   ⚠️ 必须走 this.setLilConfig(patch) ——
     *     它会 applyLilConfig + applyRender ⇒ **触发材质重建 / 着色器重编译** ✓
     *     只改 lilCfg 数据是**不会生效**的 ✓
     */
    importLilPreset(text) {
      if (typeof text !== 'string' || !text.trim()) return { ok: false, reason: '空内容' };
      let preset;
      try { preset = parseLilPresetYaml(text); }
      catch (e) { return { ok: false, reason: '解析失败：' + (e && e.message) }; }
      const n = Object.keys(preset.colors).length + Object.keys(preset.vectors).length + Object.keys(preset.floats).length;
      if (!n) return { ok: false, reason: '没解析出任何属性（不是 lilToon 预设 / 材质 ？）' };
      const r = lilPresetToPatch(preset);
      this.setLilConfig(r.patch);
      console.debug('[lilToon] 导入预设「' + (preset.name || '?') + '」：源 ' + n
        + ' 条 ⇒ 套用 ' + r.applied + ' 项 · 未识别 ' + r.skipped.length + ' 个属性名');
      return { ok: true, name: preset.name, total: n, applied: r.applied, skipped: r.skipped };
    },

    /**
     * ★★ **导出 lilToon 预设**（Unity .asset 文本 ✓）
     *
     *   ⚠️ 只写**映射表里有的**字段 ⇒ 产物是「我们实现的那部分」✓
     *     我们没实现的属性**不会出现** ✗ 拖进 Unity 后那些保持 lilToon 默认 ✓
     */
    /**
     * ⚠️ 现在多一个 `name` 是**必给的** ——
     *   它会写进 `bases[].name`（Unity 里那个按钮的**文字** ✓）
     *   空名字 ⇒ Unity 里是**没有文字的按钮** ⇒ 用户会以为没出现 ✓
     */
    /**
     * ★★ **导出 lilToon 预设**（Unity `.asset` 文本 ✓）
     *
     * @param {string|object} opt
     *   · 传字符串 ⇒ 兼容旧调用（当 name 用 ✓）
     *   · 传对象 ⇒ `{ name, category, shader, preferTwoPass, material }`
     *       `shader` 可以是名字或 GUID ✗ 传了就是**手动指定**（最高优先 ✓）
     *       `material` 指定材质（不传 = 全局 ✓）
     *
     * ⚠️⚠️ **子着色器是必须给的**（读源码得出 ✓）：
     *   主着色器 `lilToon`（lts）只有 FORWARD/FORWARD_ADD/SHADOW_CASTER/META
     *   ⇒ **没有 OUTLINE pass** ⇒ 材质用 lts 时 `_UseOutline=1` 也不渲染 ✓
     *   ⇒ 而 64 个变体里**只有 1 个可见名** ⇒ 其余只能靠预设绑定 ✓
     *   ⇒ 所以这里**自动推导 + 写进 `shader:` 字段** ✓
     */
    exportLilPreset(opt) {
      const o = typeof opt === 'string' ? { name: opt } : (opt || {});
      const cfg2 = this.getLilConfig(o.material) || {};
      const p = lilCfgToPreset(cfg2, o.name);
      p.name = o.name || p.name;
      if (o.category !== undefined && o.category !== null) p.category = Number(o.category) || 0;
      /* ★ 子着色器：手动优先 ✗ 否则按配置推导 ✓ */
      const sh = lilDeriveShader(cfg2, o.shader, !!o.preferTwoPass);
      if (sh) { p.shader = sh.guid; p.renderingMode = lilRenderModeOfShaderName(sh.name); }
      console.debug('[lilToon] 导出预设「' + p.name + '」子着色器 = '
        + (sh ? sh.name + '（' + sh.why + '）' : '不改') + ' ✓');
      return buildLilPresetYaml(p);
    },

    /** 当前配置会推导出什么子着色器（UI 显示用 ✓）*/
    lilShaderInfo(material, manual) {
      const cfg2 = this.getLilConfig(material) || {};
      return lilDeriveShader(cfg2, manual) || null;
    },

    /** 全部材质（批量导出用 ✓）*/
    lilExportTargets() {
      const list = [];
      try { list.push(...(this.getLilMaterials() || [])); } catch (e) {}
      return list;
    },

    /**
     * ★★ **批量导出**：每个材质一个 `.asset`（用户要求 ✓）。
     * @returns {Array<{ material, filename, text, category, shader, why }>}
     *
     * ⚠️ 分类**按材质名猜**（`guessLilCategory` ✓）——
     *   用户说了：「分类不算特别重点 ✗ 只是方便下拉选 ✓
     *              Unity 里其实可以任意套 ✓」
     */
    exportAllLilPresets(opt) {
      const o = opt || {};
      const base = o.baseName || "model";
      const out = [];
      for (const mat of this.lilExportTargets()) {
        const cfg2 = this.getLilConfig(mat) || {};
        const cat = (o.category !== undefined && o.category !== null)
          ? Number(o.category) : guessLilCategory(mat);
        const sh = lilDeriveShader(cfg2, o.shader, !!o.preferTwoPass);
        const p = lilCfgToPreset(cfg2, mat);
        p.name = mat;
        p.category = cat;
        if (sh) { p.shader = sh.guid; p.renderingMode = lilRenderModeOfShaderName(sh.name); }
        /* ⚠️ 文件名去掉不能进文件名的字符 ✓ */
        const safe = String(mat).replace(/[\\/:*?"<>|]/g, "_");
        out.push({ material: mat, filename: base + "_" + safe + ".asset",
          text: buildLilPresetYaml(p), category: cat,
          shader: sh ? sh.name : null, why: sh ? sh.why : "" });
      }
      return out;
    },

    /** UI 用：分类表 + 着色器分组表 + 材质表 ✓ */
    lilExportOptions() {
      const byMode = {};
      for (const s of (LIL_SHADERS || [])) {
        if (s.lite || s.multi || s.tess) continue;
        if (/^(Hidden\/ltspass|_lil\/)/.test(s.name)) continue;
        (byMode[s.renderingMode] = byMode[s.renderingMode] || []).push({ name: s.name, guid: s.guid });
      }
      return { categories: LIL_CATEGORIES.slice(), shadersByMode: byMode,
        materials: this.lilExportTargets() };
    },

    /** 当前配置能表达成预设里的多少条（给 UI 提示用 ✓） */
    lilPresetStats() {
      const p = lilCfgToPreset(this.getLilConfig() || {}, 'x');
      return { colors: Object.keys(p.colors).length, vectors: Object.keys(p.vectors).length, floats: Object.keys(p.floats).length };
    },

    applyLilConfigJSON(o) {
      if (!o || typeof o !== 'object') return false;
      if (o.config && typeof o.config === 'object') this.setLilConfig(o.config);
      if (o.byMaterial && typeof o.byMaterial === 'object') this.setLilCfgByMaterial(o.byMaterial);
      return true;
    },

    /**
     * ★ 自动探测并载入 lilToon 配置（用户定的规则 ✓）
     *
     *   ① 先试 **模型名.lilToon.json**（按 `cfg.modelUrl` 推 ✓）
     *   ② 找不到再试 **主 JSON 名.lilToon.json**（`opts.mainJsonUrl` ✓）
     *   ③ 都没有 ⇒ **保持出厂默认** + 控制台 `warn` 一句（用户确认的兜底 ✓）
     *
     *   ⚠️ 「模型名」= `./assets/sample.glb` → `sample` ✓
     *     ⇒ 探测 `./assets/sample.lilToon.json` ✓
     */
    async probeLilConfig(mainJsonUrl) {
      const base = String(cfg.modelUrl || '').replace(/[?#].*$/, '').replace(/\.[^./\\]+$/, '');
      const cands = [];
      if (base) cands.push(base + '.lilToon.json');
      if (mainJsonUrl) {
        const mj = String(mainJsonUrl).replace(/[?#].*$/, '').replace(/\.json$/i, '');
        if (mj && mj + '.lilToon.json' !== cands[0]) cands.push(mj + '.lilToon.json');
      }
      for (const url of cands) {
        try {
          const r = await fetch(url, { cache: 'no-cache' });
          if (!r.ok) continue;
          const o = await r.json();
          this.applyLilConfigJSON(o);
          console.debug('[lilToon] 已载入独立配置：' + url);
          return { ok: true, url };
        } catch (e) { /* 试下一个 ✓ */ }
      }
      console.warn('[lilToon] 主配置要求使用 lilToon ✗ 但**未找到配置**'
        + (cands.length ? '（试过 ' + cands.join(' · ') + ' ✓）' : '（没有可推导的文件名 ✓）')
        + ' ⇒ 使用**出厂默认** ✓');
      return { ok: false, tried: cands };
    },

    /**
     * 播放动作（等价于全局 play3dmodelaction）：
     *   playAction(['Formation_Pickup']) / playAction('Cafe_Idle') / playAction() 回默认
     */
    playAction(actions) {
      return playAction(actions);
    },

    /**
     * 着色器诊断：看当前每个网格用的到底是什么材质、cacheKey 里写的是什么着色器。
     * 排查「切了着色器但画面没变」时用：控制台跑 viewer.shaderReport()
     */
    shaderReport() {
      /**
       * 除了材质 ✗ 还要看**全局渲染状态**。
       *
       * 起因：三张同视角截图做像素 diff 后发现
       *   「切回 cel」的画面 ≈ lilToon（只差 0.53% ✗）
       *   「初始 cel」与两者都差 ~11.3%（最大通道差仅 16 ✗ 全局亮度差 ✗）
       * 说明差异不在材质（shaderReport 已证明材质是 cel ✗）而在**全局状态** ✗
       * 所以把 toneMapping / 四盏灯 / 描边 / 背景这些"材质之外"的东西一并报出来 ✓
       */
      const out = {
        render: renderMode,
        shader: shaderMode,
        shaderActive: shaderActive(),
        celProgramVersion,
        rendering: {
          toneMapping: renderer.toneMapping,             // 1=Linear 2=Reinhard 3=ACESFilmic 4=Cineon 5=AgX 6=Neutral
          toneMappingExposure: Number(renderer.toneMappingExposure.toFixed(6)),
          outputColorSpace: renderer.outputColorSpace,
          pixelRatio: renderer.getPixelRatio(),
          shadowMapEnabled: renderer.shadowMap.enabled,
          shadowMapType: renderer.shadowMap.type,
        },
        lastLightingCalc: lastLighting,   // ★ 最近一次打光计算的实参（排查曝光漂移 ✗）
        lighting: {
          preset: currentLighting,
          lightingScale: Number(cfg.lightingScale) || 1,
          hemi: Number(hemi.intensity.toFixed(6)),
          key: Number(keyLight.intensity.toFixed(6)),
          rim: Number(rimLight.intensity.toFixed(6)),
          fill: Number(fillLight.intensity.toFixed(6)),
        },
        outline: { on: outlineOn, thickness: outlineParams.thickness, color: outlineParams.color, alpha: outlineParams.alpha },
        background: { transparent: bgTransparent, color: bgTransparent ? null : bgColor.getHexString() },
        materials: [],
      };
      if (!modelRoot) return out;
      modelRoot.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => {
          if (!m) return;
          const ud = m.userData || {};
          let key = '';
          try { key = m.customProgramCacheKey ? String(m.customProgramCacheKey()) : ''; } catch (e) { key = 'ERR:' + e.message; }
          out.materials.push({
            mesh: o.name,
            material: m.name || m.type,
            type: m.type,
            是派生材质: !!(ud.__toon || ud.__unlit),
            记录的着色器: ud.__celShader || '(无)',
            // ★ 顶点色：lilToon 的遮罩（triMask ✗）用它 ✓
            //   没有顶点色时遮罩恒为 1 ✗ 效果全区域生效 ✓（BA 那批 GLB 就没有 ✗）
            有顶点色: !!(o.geometry && o.geometry.attributes && o.geometry.attributes.color),
            材质开了顶点色: !!m.vertexColors,
            顶点色均值: (() => {
              const c = o.geometry && o.geometry.attributes && o.geometry.attributes.color;
              if (!c) return null;
              const n = Math.min(c.count, 500);
              const sum = [0, 0, 0];
              for (let i = 0; i < n; i++) {
                sum[0] += c.getX(i); sum[1] += c.getY(i); sum[2] += c.getZ(i);
              }
              return sum.map((v) => Number((v / n).toFixed(3)));
            })(),
            // ★ 决定性字段：编译时实际注入进 GLSL 的是哪套分档
            实际编译的分档: ud.__fragKind || '(未编译)',
            编译时的shaderMode: ud.__fragShaderAtCompile || '(无)',
            记录的版本: ud.__celVersion,
            cacheKey: key,
            hasOBC: !!m.onBeforeCompile,
          });
        });
      });
      return out;
    },

    /**
     * **顶点色预览** —— 把顶点色直接当颜色渲染出来看。
     *
     * 原理：换成 MeshBasicMaterial + vertexColors:true + 白色基色 ✗
     *       输出就是 vColor 本身 ✓（无光照 ✗ 无贴图 ✓）
     *
     * 用途：lilToon 的遮罩就是读顶点色的 RGB 三通道 ✗
     *   R → MatCap 权重 · G → Rim 权重 · B → 自发光权重 ✓
     *   用这个模式可以直观看清"哪个部位是哪个通道" ✓
     *
     *   viewer.showVertexColors(true)   打开预览
     *   viewer.showVertexColors(false)  还原
     *
     * ⚠️ 没有顶点色的模型会整体显示为**纯白** ✓（那说明遮罩恒为 1 ✓ 效果全区域生效 ✓）
     */
    showVertexColors(on) {
      cfg.__vcView = !!on;
      if (!modelRoot) return cfg.__vcView;
      if (!on) {
        applyRender(renderMode);      // 还原 ✗ 走正常路径 ✓
        return cfg.__vcView;
      }
      modelRoot.traverse((o) => {
        if (!o.isMesh || !o.material) return;
        const hasColor = !!(o.geometry && o.geometry.attributes && o.geometry.attributes.color);
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        const next = mats.map((m) => {
          if (!m) return m;
          if (m.userData && m.userData.__vcView) return m;
          const t = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            map: null,                    // 不看贴图 ✗ 只看顶点色 ✓
            vertexColors: true,           // ★ 关键：输出 vColor ✓
            side: m.side,
            transparent: false,
            depthWrite: true,
            toneMapped: false,            // 直通 ✗ 否则被色调映射改变 ✓
          });
          t.name = (m.name || 'mat') + '_VCView';
          t.userData.__vcView = true;
          t.userData.__src = (m.userData && m.userData.__src) ? m.userData.__src : m;
          if (!hasColor) console.warn('[vcView] 该网格没有顶点色属性 ✗ 会显示为纯白：', o.name);
          return t;
        });
        o.material = Array.isArray(o.material) ? next : next[0];
      });
      console.debug('[vcView] 顶点色预览已开启（白 = 无顶点色 或 全为 1 ✗）');
      console.debug('[vcView] R 通道=MatCap 权重 ✗ G 通道=Rim 权重 ✗ B 通道=自发光权重');
      return cfg.__vcView;
    },

    /**
     * 检查当前模型有没有顶点色 ✗ 并给出统计（比看画面更准 ✓）。
     *   viewer.vertexColorInfo()
     */
    vertexColorInfo() {
      const out = [];
      if (!modelRoot) return out;
      modelRoot.traverse((o) => {
        if (!o.isMesh || !o.geometry) return;
        const c = o.geometry.attributes && o.geometry.attributes.color;
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        if (!c) { out.push({ mesh: o.name, 有顶点色: false }); return; }
        const n = c.count;
        const mn = [9, 9, 9], mx = [-9, -9, -9], sum = [0, 0, 0];
        for (let i = 0; i < n; i++) {
          const v = [c.getX(i), c.getY(i), c.getZ(i)];
          for (let k2 = 0; k2 < 3; k2++) { if (v[k2] < mn[k2]) mn[k2] = v[k2]; if (v[k2] > mx[k2]) mx[k2] = v[k2]; sum[k2] += v[k2]; }
        }
        const mean = sum.map((v) => Number((v / n).toFixed(3)));
        const allWhite = mn.every((v) => v > 0.999);
        out.push({
          mesh: o.name,
          材质: m && m.name,
          有顶点色: true,
          顶点数: n,
          min: mn.map((v) => Number(v.toFixed(3))),
          max: mx.map((v) => Number(v.toFixed(3))),
          均值: mean,
          是否全白: allWhite,
          遮罩效果: allWhite ? '恒为 1 ✗ 效果全区域生效' : '分区生效 ✓',
        });
      });
      return out;
    },

    /** 当前默认动作名（未指定初始动作时，是从含 idle 的动作里随机选的） */
    getDefaultAction() {
      return defaultClipName;
    },

    /**
     * 嘴型图集格（0~63）。默认由 bone_mouth 的缩放驱动，
     * 但有些模型（如 CH0273）的 GLB 里**根本没有嘴部动画数据**，
     * 这时嘴型不会自己变 —— 页面可以用这个方法手动驱动。
     */
    setMouthCell(cell) {
      return setMouthCell(cell);
    },

    /** 当前嘴型图集格；-1 表示嘴部修复未生效 */
    getMouthCell() {
      return mouthCell;
    },

    /** 嘴部修复的诊断信息（模型/图集/驱动源是否可用） */
    getMouthInfo() {
      let driver = null;
      if (mouthBone) {
        const has = (prop) => clips.some((c) => c.tracks.some((t) => t.name === mouthBone.name + '.' + prop));
        driver = {
          bone: mouthBone.name,
          scaleTrack: has('scale'),
          positionTrack: has('position'),
          quaternionTrack: has('quaternion'),
        };
      }
      return {
        mesh: mouthMesh ? mouthMesh.name : null,
        cell: mouthCell,
        cells: MOUTH_CELLS,
        atlas: mouthAtlasUrl,
        uv: mouthUV,
        driver,   // null = 没找到嘴部骨骼（嘴型必然固定）
        mouthCell: defaultMouthCell(),   // 当前生效的「默认口型」格
        mouthCellConfigured: cfg.mouthCell,
        mouthIdle: !!cfg.mouthIdle,
        driverClips: mouthDriverClips ? mouthDriverClips.size : 0,   // 有几个动作真的会动嘴
      };
    },

    /** 屏幕坐标是否落在模型上（供页面自己判断） */
    hitTest(clientX, clientY) {
      return hitModel(clientX, clientY);
    },

    /** 描边：getOutline() -> { on, thickness, color, alpha } */
    getOutline() {
      return Object.assign({ on: outlineOn, active: outlineActive(), fbxDisabled: !!cfg.__isFbx }, outlineParams);
    },

    setOutline(on) {
      return setOutline(on);
    },

    /** 调描边参数：{ thickness?, color?: [r,g,b], alpha? } */
    setOutlineParams(o) {
      return setOutlineParams(o);
    },

    /** 返回预置背景色列表（+ 第 0 项为「透明」） */
    getBackgrounds() {
      return cfg.backgrounds.slice();
    },

    /** 背景预设名（索引 0 = 透明） */
    getBackgroundNames() {
      return ['透明', '深蓝黑', '灰蓝', '纯黑', '浅灰'];
    },

    /** 当前背景：{ transparent, color } */
    getBackground() {
      return { transparent: bgTransparent, color: bgTransparent ? null : bgColor.getHex() };
    },

    /**
     * 设置背景：
     *   'transparent' / null / 数字 0  → 透明背景（透出网页内容）
     *   数字 1~n                      → 用 cfg.backgrounds[数字-1] 预设色
     *   任意 CSS 颜色 / 0xRRGGBB       → 自定义颜色
     * 只改背景，不动灯光（灯光由 applyLighting 管理）。
     */
    setBackground(v) {
      return applyBackground(v);
    },

    nextBackground() {
      return applyBackground(bgTransparent ? 1 : bgIdx + 2);
    },

    /** 应用配置对象（与 createViewer 的 config 同结构）；模型相关字段需在 load() 前给 */
    applyConfig(c) {
      applyConfigPreLoad(c);
      if (modelRoot) applyConfigPostLoad(c);
      return true;
    },

    /** 读取配置并应用（URL 或对象） */
    async loadConfig(urlOrObj) {
      const c = typeof urlOrObj === 'string'
        ? await (await fetch(urlOrObj, { cache: 'no-cache' })).json()
        : urlOrObj;
      this.applyConfig(c);
      return c;
    },

    /** 获取当前旋转基准位置（水平偏移） */
    getPivot() {
      return { x: pivotX, z: pivotZ };
    },

    /** 设置旋转基准位置（水平偏移，角色仍站地面）；返回新的 {x, z} */
    setPivot(x, z) {
      pivotX = Number(x) || 0;
      pivotZ = Number(z) || 0;
      frameModel();
      return { x: pivotX, z: pivotZ };
    },

    resetView() {
      frameModel();
    },

    resize() {
      const w = container.clientWidth || 0;
      const h = container.clientHeight || 0;
      // 容器还没布局出尺寸时（内嵌场景常见）先跳过，交给 ResizeObserver 稍后触发
      if (w < 2 || h < 2) return false;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      // 只有在「锁定像素」模式（没配 framingReferenceHeight）下才按高度比例调相机；
      // 配了参考高度时相机参数是固定世界量，画布变化本身就是等比缩放，不能去动相机。
      if (cfg.framing === 'tight' && !cfg.framingReferenceHeight && lastCssH > 0 && h !== lastCssH) {
        const k = h / lastCssH;
        const off = camera.position.clone().sub(controls.target).multiplyScalar(k);
        camera.position.copy(controls.target).add(off);
        controls.update();
      }
      lastCssH = h;
      return true;
    },

    dispose() {
      if (disposed) return;
      disposed = true;

      // —— 解绑事件（反复「上传文件 → 加载」时不然会累积监听器）——
      window.removeEventListener('resize', api.resize);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      if (resizeObserver) { resizeObserver.disconnect(); resizeObserver = null; }

      if (mixer) {
        mixer.stopAllAction();
        if (modelRoot) mixer.uncacheRoot(modelRoot);
        mixer = null;
      }
      if (skeletonHelper) {
        scene.remove(skeletonHelper);
        skeletonHelper.geometry?.dispose?.();
        skeletonHelper.material?.dispose?.();
        skeletonHelper = null;
      }

      // —— 释放模型占用的显存（贴图/几何/材质）——
      if (modelRoot) {
        const seenTex = new Set();
        scene.remove(modelRoot);
        modelRoot.traverse((o) => {
          if (!o.isMesh) return;
          o.geometry?.dispose?.();
          const mats = Array.isArray(o.material) ? o.material : [o.material];
          mats.forEach((m) => {
            if (!m) return;
            ['map', 'gradientMap', 'normalMap', 'alphaMap', 'emissiveMap', 'displacementMap'].forEach((k) => {
              const t = m[k];
              if (t && !seenTex.has(t)) { seenTex.add(t); t.dispose?.(); }
            });
            m.dispose?.();
          });
        });
        modelRoot = null;
      }
      if (ground) {
        scene.remove(ground);
        ground.geometry?.dispose?.();
        ground.material?.dispose?.();
        ground = null;
      }
      clips = [];
      currentAction = null;
      currentClipName = null;
      mouthMesh = mouthBone = null;
      mouthMat = null;
      mouthTex = null;
      mouthCell = -1;
      meshCache.length = 0;

      pmrem.dispose();
      outlineEffect = null;
      renderer.dispose();
      renderer.forceContextLoss?.();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }

      // —— 从全局动作钩子里摘掉自己 ——
      if (typeof window !== 'undefined' && Array.isArray(window.__ba3dViewers)) {
        const i = window.__ba3dViewers.indexOf(api);
        if (i >= 0) window.__ba3dViewers.splice(i, 1);
      }
    },
  };

  window.addEventListener('resize', api.resize);
  window.addEventListener('orientationchange', () => setTimeout(api.resize, 120));

  // 容器尺寸变化时自适应（内嵌到别的页面、可拖拽面板、响应式布局都要靠它）
  let resizeObserver = null;
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => api.resize());
    resizeObserver.observe(container);
  }

  // 全局动作钩子：页面其它 js 直接调 play3dmodelaction([动作数组])
  // 一个页面上有多个查看器时，会作用于所有实例
  if (typeof window !== 'undefined') {
    window.__ba3dViewers = window.__ba3dViewers || [];
    if (!window.__ba3dViewers.includes(api)) window.__ba3dViewers.push(api);
    window.play3dmodelaction = function (actions) {
      let last = null;
      for (const v of window.__ba3dViewers) {
        const r = v.playAction(actions);
        if (r) last = r;
      }
      return last;
    };
  }

  return api;
}

/**
 * 自动挂载：扫描页面里所有 [data-ba3d] 容器并创建查看器（供第三方网站内嵌用）。
 *
 * 容器属性（都可选，等价于 JS 里的 createViewer 选项）：
 *   data-ba3d-model="URL"       模型文件（.glb）
 *   data-ba3d-mouth="URL"       模型嘴部修复贴图（kivo 嘴部图集 .png）
 *   data-ba3d-config="URL"      模型基准调整 JSON（也可含渲染/打光/背景设置）
 *   data-ba3d-auto-rotate="true"
 *
 * 用法：
 *   <div data-ba3d data-ba3d-config="./config/ch0155.json"
 *        style="width:480px;height:640px"></div>
 *   <script type="module">
 *     import { autoMount } from './vendor/ba3d/viewer.js';
 *     autoMount();
 *   </script>
 *
 * 说明：createViewer 本身也会读同一个容器上的 data-ba3d-* 属性，
 *       所以也可以逐个手写 new createViewer(el) 而不调 autoMount。
 */
export function autoMount(root = document) {
  const list = [];
  root.querySelectorAll('[data-ba3d]').forEach((el) => {
    if (el.__ba3dViewer) return;
    /**
     * ★★ **嵌入的默认取景偏移比主页面更大**（用户的要求 ✓）——
     *
     *   ⚠️ 嵌入看板通常是个**矮容器** ✗ 而角色有倒地 / 死亡这类
     *     **向下展开**的动画 ⇒ 默认的 22px 会把下半截切掉 ✓
     *     （用户：「让就死亡动画可以完整显示」✓）
     *
     *   ⇒ 嵌入默认用 `EMBED_FRAMING_OFFSET_Y`（见常量定义 ✓）
     *     **容器上写了 `data-ba3d-framing-offset` 就以它为准** ✓
     *   ⇒ 主页面不受影响（它走 `index.html` 那条路 ✗ 不经过 autoMount ✓）
     */
    const __opts = {};
    if (!el.hasAttribute('data-ba3d-framing-offset')) {
      __opts.framingOffsetY = EMBED_FRAMING_OFFSET_Y;
      __opts.__framingOffsetYForced = EMBED_FRAMING_OFFSET_Y;
      __opts.__framingOffsetForced = true;
    }
    const v = createViewer(el, __opts);
    el.__ba3dViewer = v;
    // 自动开始加载（只加载一次）；失败时把原因挂到容器上，方便宿主页面排查
    const p = v.load();
    el.__ba3dLoad = p; // 宿主页面可以 await 这个 promise
    p.catch((e) => {
      el.dataset.ba3dError = String((e && e.message) || e);
      console.error('[ba3d] 模型加载失败：', e);
    });
    list.push(v);
  });
  return list;
}
