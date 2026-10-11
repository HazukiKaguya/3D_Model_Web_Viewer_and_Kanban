/**
 * unity-scene.js ── 读 Unity 场景（.unity / YAML）里的**相机 + 打光 + 环境** ✓
 *
 * 为什么需要它：我们之前是靠"试角度"逼近 Unity 的观感 ✗（试出 ≈122°/50° ✓）
 *   而这个场景文件直接**算得出**同样的值 ✓ ⇒ 以后不用再猜 ✓
 *
 * 覆盖的 classId（Unity YAML 的 `--- !u!<classId> &<fileID>` 块 ✓）：
 *    1  GameObject      —— 名字 + 组件引用
 *    4  Transform       —— 父子链 + 局部位置/旋转
 *   20  Camera          —— fov / near / far / 背景色 / 清屏标志
 *  104  RenderSettings  —— 环境光模式与颜色 / Sun 引用
 *  108  Light           —— 类型 / 颜色 / 强度 / 阴影
 *
 * 坐标换算（与 importer 一致 ✓ 实测定标过的）：
 *   · 位置/方向：Unity (x, y, z) → three (x, y, −z)
 *   · 四元数    ：Unity (x, y, z, w) → three (x, −y, −z, w)
 *   · 朝向：Unity 的 forward 是 +Z ✓ three 的相机看向 −Z ✓（取 target 时注意）
 */

/** 把 Unity 场景 YAML 拆成 { classId: Map<fileID, obj> } ✓ */
function splitBlocks(text) {
  const out = new Map();
  const re = /^--- !u!(\d+) &(\d+)(?:\s+stripped)?\s*$/gm;
  const marks = [];
  let m;
  while ((m = re.exec(text))) marks.push({ classId: m[1], id: m[2], at: m.index, end: re.lastIndex });
  for (let i = 0; i < marks.length; i++) {
    const b = marks[i];
    const body = text.slice(b.end, i + 1 < marks.length ? marks[i + 1].at : text.length);
    if (!out.has(b.classId)) out.set(b.classId, new Map());
    out.get(b.classId).set(b.id, parseBody(body));
  }
  return out;
}

/** Unity YAML 的一个块 → 扁平对象（只取我们需要的标量/向量 ✓ 够用且稳 ✓） */
function parseBody(body) {
  const o = {};
  const lines = body.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = line.match(/^\s{2}([A-Za-z_][\w ]*?):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1];
    let val = kv[2].trim();
    if (val === '') {
      // 可能是嵌套结构（如 m_Shadows ✓）——把紧随其后的更深缩进行一起收进来 ✓
      const sub = {};
      for (let j = i + 1; j < lines.length; j++) {
        const s = lines[j].match(/^\s{4}([A-Za-z_][\w ]*?):\s*(.*)$/);
        if (!s) break;
        sub[s[1]] = num(s[2].trim());
      }
      if (Object.keys(sub).length) o[key] = sub;
      continue;
    }
    o[key] = num(val);   // ⚠️ 必须过 num() ✗ 否则 `{x:…, y:…}` 这类向量会原样留成字符串 ✓
  }
  return o;
}

/** Unity 的 PPtr（`{fileID: 123}` 或裸数字 ✓）→ fileID 字符串 ✓ */
function fileIdOf(v) {
  if (v === undefined || v === null) return null;
  if (typeof v === 'object') return v.fileID !== undefined ? String(v.fileID) : null;
  const m = String(v).match(/(\d+)/);
  return m ? m[1] : null;
}

function num(s) {
  if (s === undefined) return undefined;
  if (/^\{.*\}$/.test(s)) {
    const o = {};
    for (const part of s.slice(1, -1).split(',')) {
      const [k, v] = part.split(':').map((x) => x.trim());
      if (k) o[k] = Number(v);
    }
    return o;
  }
  if (/^-?[\d.]+(?:[eE][-+]?\d+)?$/.test(s)) return Number(s);
  return s;
}

/** 四元数旋转一个向量 ✓（Unity 左手系与 three 右手系下公式一致 ✓ 只对分量做换算 ✓） */
function rotateByQuat(q, v) {
  const { x, y, z, w } = q;
  const ix = w * v.x + y * v.z - z * v.y;
  const iy = w * v.y + z * v.x - x * v.z;
  const iz = w * v.z + x * v.y - y * v.x;
  const iw = -x * v.x - y * v.y - z * v.z;
  return {
    x: ix * w + iw * -x + iy * -z - iz * -y,
    y: iy * w + iw * -y + iz * -x - ix * -z,
    z: iz * w + iw * -z + ix * -y - iy * -x,
  };
}

/** Unity 三维 → three 三维（与 importer 的 (x, y, −z) 一致 ✓） */
const toThree = (v) => ({ x: v.x, y: v.y, z: -v.z });

/**
 * 解析场景 ⇒ { cameras, lights, render }
 *   cameras[i] = { name, position, target, fov, near, far, background, clearFlags }
 *   lights[i]  = { name, type, color, intensity, shadows, direction }
 *   render     = { ambientMode, ambientSky, ambientEquator, ambientGround, ambientIntensity, indirectSpecular, sun }
 */
export function parseUnityScene(text) {
  const blocks = splitBlocks(text);
  const games = blocks.get('1') || new Map();
  const trs = blocks.get('4') || new Map();
  const cams = blocks.get('20') || new Map();
  const lights = blocks.get('108') || new Map();
  const rs = (blocks.get('104') || new Map()).values().next().value || null;

  /** fileID → GameObject 名（用组件上的 m_GameObject 反查 ✓） */
  const nameOf = (comp) => {
    const gid = fileIdOf(comp['m_GameObject']);
    const g = gid && games.get(gid);
    return (g && g['m_Name']) || '(未命名)';
  };
  /** 找某个 GameObject 的 Transform（遍历 Transform 块比对 m_GameObject ✓ 不依赖组件顺序 ✓） */
  const trOf = (comp) => {
    const gid = fileIdOf(comp['m_GameObject']);
    for (const [, t] of trs) {
      const tg = fileIdOf(t['m_GameObject']);
      if (gid && tg && gid === tg) return t;
    }
    return null;
  };
  /** 世界位置/旋转（沿 m_Father 链累乘 —— 本场景相机/灯都是根对象 ⇒ 局部即世界 ✓ 这里仍做全 ✓） */
  const worldOf = (tr) => {
    let pos = tr && tr['m_LocalPosition'] ? tr['m_LocalPosition'] : { x: 0, y: 0, z: 0 };
    let rot = tr && tr['m_LocalRotation'] ? tr['m_LocalRotation'] : { x: 0, y: 0, z: 0, w: 1 };
    let cur = tr;
    for (let depth = 0; depth < 16 && cur; depth++) {
      const fid = fileIdOf(cur['m_Father']);
      const parent = fid && fid !== '0' ? trs.get(fid) : null;
      if (!parent) break;
      const pp = parent['m_LocalPosition'] || { x: 0, y: 0, z: 0 };
      const pr = parent['m_LocalRotation'] || { x: 0, y: 0, z: 0, w: 1 };
      const rp = rotateByQuat(pr, pos);
      pos = { x: pp.x + rp.x, y: pp.y + rp.y, z: pp.z + rp.z };
      rot = mulQuat(pr, rot);
      cur = parent;
    }
    return { pos, rot };
  };

  const outCams = [];
  for (const [, c] of cams) {
    if (String(c['m_Enabled']) === '0') continue;
    const tr = trOf(c);
    const w = worldOf(tr);
    const fwdU = rotateByQuat(w.rot, { x: 0, y: 0, z: 1 });     // Unity 的 forward = +Z ✓
    const posU = w.pos;
    const tgtU = { x: posU.x + fwdU.x * 10, y: posU.y + fwdU.y * 10, z: posU.z + fwdU.z * 10 };
    outCams.push({
      name: nameOf(c),
      position: toThree(posU),
      target: toThree(tgtU),
      fov: Number(c['field of view']) || 60,
      near: Number(c['near clip plane']) || 0.3,
      far: Number(c['far clip plane']) || 1000,
      orthographic: String(c['orthographic']) === '1',
      orthographicSize: Number(c['orthographic size']) || 5,
      clearFlags: Number(c['m_ClearFlags']),
      background: c['m_BackGroundColor'] || null,
    });
  }

  const outLights = [];
  for (const [, l] of lights) {
    if (String(l['m_Enabled']) === '0') continue;
    const tr = trOf(l);
    const w = worldOf(tr);
    const fwdU = rotateByQuat(w.rot, { x: 0, y: 0, z: 1 });
    const towardU = { x: -fwdU.x, y: -fwdU.y, z: -fwdU.z };       // 朝向光源 ✓
    const towardT = toThree(towardU);
    const len = Math.hypot(towardT.x, towardT.y, towardT.z) || 1;
    const az = (Math.atan2(towardT.x / len, towardT.z / len) * 180 / Math.PI + 360) % 360;
    const el = Math.asin(Math.max(-1, Math.min(1, towardT.y / len))) * 180 / Math.PI;
    outLights.push({
      name: nameOf(l),
      type: Number(l['m_Type']),                                  // 1 = Directional ✓
      color: l['m_Color'] || { r: 1, g: 1, b: 1, a: 1 },
      intensity: Number(l['m_Intensity']) || 0,
      shadows: l['m_Shadows'] ? { type: Number(l['m_Shadows']['m_Type']), strength: Number(l['m_Shadows']['m_Strength']), bias: Number(l['m_Shadows']['m_Bias']), normalBias: Number(l['m_Shadows']['m_NormalBias']) } : null,
      // ★ 我们的 viewer 用的就是这两个角 ✓（0° = 模型正面 · 顺时针 ✓ 见 viewer.js L2035）
      azimuth: +az.toFixed(2),
      elevation: +el.toFixed(2),
      direction: towardT,
    });
  }

  const outRender = rs ? {
    ambientMode: Number(rs['m_AmbientMode']),                     // 0 = Skybox ✓ 1 = Gradient · 3 = Color
    ambientSky: rs['m_AmbientSkyColor'] || null,
    ambientEquator: rs['m_AmbientEquatorColor'] || null,
    ambientGround: rs['m_AmbientGroundColor'] || null,
    ambientIntensity: Number(rs['m_AmbientIntensity']),
    indirectSpecular: rs['m_IndirectSpecularColor'] || null,
    skybox: rs['m_SkyboxMaterial'] || null,
    sun: fileIdOf(rs['m_Sun']),
  } : null;

  return { cameras: outCams, lights: outLights, render: outRender };
}

function mulQuat(a, b) {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

/** 取"主相机 + 主方向光" ⇒ 直接能喂给 viewer 的一坨 ✓ */
export function unitySceneToViewer(parsed, opt = {}) {
  const cam = parsed.cameras.find((c) => /main camera/i.test(c.name)) || parsed.cameras[0] || null;
  const sun = parsed.lights.find((l) => l.type === 1 && /directional|sun|主光/i.test(l.name)) || parsed.lights.find((l) => l.type === 1) || null;
  const r = parsed.render || {};
  const hex = (c) => (c ? '#' + [c.r, c.g, c.b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0')).join('') : null);
  const amb = r.ambientMode === 0
    ? { from: 'skybox', sky: hex(r.indirectSpecular), ground: hex(r.ambientGround), intensity: r.ambientIntensity }
    : { from: r.ambientMode === 1 ? 'gradient' : 'color', sky: hex(r.ambientSky), ground: hex(r.ambientGround), intensity: r.ambientIntensity };
  /**
   * ★★ **水平参考方向校正（实测定标 ✓）**
   *
   *   用户实测配对（Unity 场景 ↔ 我们面板）：
   *     Directional Light Rotation = (500,500,500) ≡ (140,140,140)
   *     ⇒ 文件四元数 (−0.41193, 0.19209, 0.19209, −0.86978)
   *     ⇒ forward_unity = (−0.4924, −0.6428, +0.5868)（仰角 40° ✓ 这个没争议 ✓）
   *     ⇒ 我们面板里对应的是 **方位 ≈ 225° · 仰角 ≈ 45°**（用户长期使用的值 ✓）
   *   而按 (x, y, −z) 直接换算得到的是 **40°** ⇒ 正好差 **180°** ✗
   *     （仰角 40 ↔ 45 只差 5° ⇒ 那个是用户的四舍五入 ✓ 不作校正 ✓）
   *
   *   ⇒ 说明水平参考轴取了反的 180°（我们面板的 0° 定义在 **模型正面** ✓，
   *      而这个模型在 Unity 里正面朝 −Z ⇒ 光算出来的水平方向要整体 +180° ✓）
   *   ⇒ 默认 `azimuthOffset = 180` ✓ 可用 opt 覆盖或关掉（传 0）✓
   */
  const azOffset = (opt.azimuthOffset !== undefined) ? Number(opt.azimuthOffset) : 180;
  const fixAz = (a) => ((Number(a) + azOffset) % 360 + 360) % 360;
  return {
    camera: cam ? { name: cam.name, position: [cam.position.x, cam.position.y, cam.position.z], target: [cam.target.x, cam.target.y, cam.target.z], fov: cam.fov, near: cam.near, far: cam.far } : null,
    light: sun ? {
      name: sun.name,
      azimuth: +fixAz(sun.azimuth).toFixed(2),
      elevation: sun.elevation,
      azimuthRaw: sun.azimuth,
      azimuthOffset: azOffset,
      color: hex(sun.color),
      intensity: sun.intensity,
      shadows: sun.shadows,
    } : null,
    ambient: amb,
    /** ⚠️ Unity 光强 1.0 与我们面板的标度不同 ⇒ 需要时用 opt.keyIntensity 覆盖 ✓ */
    keyIntensity: opt.keyIntensity !== undefined ? opt.keyIntensity : null,
  };
}


/* ══════════════════════════════════════════════════════════════════════
 *  Scene 视图相机（Unity 编辑器状态 ✓ 不在 .unity 里 ✗）
 *
 *  来源：`<Project>/Library/LastSceneManagerSetup.txt`
 *  为什么需要它：用户看到的"基准视角"往往是 **Scene 视图** ✗
 *    而 .unity 里只有 Main Camera（可能根本没摆过 ⇒ 在原点 ✗）
 * ══════════════════════════════════════════════════════════════════════ */

/** 解析 LastSceneManagerSetup.txt ⇒ [{ path, name, view, pivot, size, orthographic }] ✓ */
export function parseSceneViewSetup(text) {
  const out = [];
  const lines = String(text).split('\n');
  let cur = null;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    const mStart = line.match(/^\s*-\s+path:\s*(.+)$/);
    if (mStart) { if (cur) out.push(cur); cur = { path: mStart[1].trim(), name: '', view: null, pivot: null, size: null, orthographic: null }; continue; }
    if (!cur) continue;
    const kv = line.match(/^\s+([A-Za-z_][\w]*):\s*(.*)$/);
    if (!kv) continue;
    const k = kv[1], v = kv[2].trim();
    const vec = (s) => {
      const o = {};
      for (const part of s.replace(/^\{|\}$/g, '').split(',')) {
        const [kk, vv] = part.split(':').map((x) => (x || '').trim());
        if (kk) o[kk] = Number(vv);
      }
      return o;
    };
    if (k === 'name') cur.name = v;
    else if (k === 'viewPosition' || k === 'position') cur.view = vec(v);
    else if (k === 'viewRotation' || k === 'rotation') cur.viewRot = vec(v);
    else if (k === 'pivot' || k === 'rootViewPosition') cur.pivot = cur.pivot || vec(v);
    else if (k === 'size' || k === 'sceneViewSize') cur.size = Number(v);
    else if (k === 'orthographic' || k === 'sceneViewOrthographic') cur.orthographic = Number(v);
  }
  if (cur) out.push(cur);
  return out.filter((s) => s.view);
}

/**
 * Scene 视图相机 ⇒ 能喂给 viewer 的一坨 ✓
 *   · 位置/注视：与模型同一套 (x, y, −z) 换算 ✓
 *   · Scene 视图默认**正交** ✗ 我们是透视相机 ⇒ 用 size 与距离反推一个等效 FOV ✓
 *     fov = 2·atan( size / distance ) ✓
 */
export function sceneViewToViewer(entries, opt = {}) {
  if (!Array.isArray(entries) || !entries.length) return null;
  const want = opt.sceneName ? entries.find((e) => (e.name || '').toLowerCase() === String(opt.sceneName).toLowerCase()) : null;
  const e = want || entries.find((x) => /melano/i.test(x.name || x.path || '')) || entries[entries.length - 1];
  if (!e || !e.view) return null;
  const pos = toThree(e.view);
  const piv = e.pivot ? toThree(e.pivot) : { x: 0, y: pos.y, z: 0 };
  const dist = Math.max(0.01, Math.hypot(pos.x - piv.x, pos.y - piv.y, pos.z - piv.z));
  const half = Number(e.size) > 0 ? Number(e.size) : dist * Math.tan(30 * Math.PI / 180);
  const fov = 2 * Math.atan(half / dist) * 180 / Math.PI;
  return {
    name: e.name || e.path,
    position: [pos.x, pos.y, pos.z],
    target: [piv.x, piv.y, piv.z],
    fov: +Math.min(120, Math.max(5, fov)).toFixed(4),
    from: 'sceneView',
    orthographic: e.orthographic === 1,
    size: half,
  };
}
