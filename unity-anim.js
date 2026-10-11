/**
 * unity-anim.js —— Unity `.anim`（AnimationClip，YAML）→ `THREE.AnimationClip`
 *
 * 为什么需要它：
 *   Unity 里 FBX 通常**不带**动画，动作/表情都在独立的 `.anim` 里。
 *   three 的 FBXLoader 只读 FBX 自带的 take ⇒ 直接用会「模型有、动画无」。
 *   本模块把 `.anim` 解析成 three 的 AnimationClip，挂到已加载的模型上播放。
 *
 * 支持范围（**已知边界，别误以为全支持**）：
 *   ✅ `blendShape.<名字>`        → `morphTargetInfluences[i]`（面部表情）
 *   ✅ `m_IsActive` / `m_Enabled` → `visible`（换装/部件显隐，按阶跃插值）
 *   ✅ `m_LocalPosition/Rotation/Scale` · `localEulerAnglesRaw` → 骨骼变换（通用动画）
 *   ❌ **Humanoid 肌肉曲线**（`Chest Twist Left-Right`、`LeftHand.Thumb.1 Stretched` …）
 *      肌肉值是「相对 Avatar T-pose 的归一化旋转」，而 Avatar 的骨骼映射定义**不在 `.anim` 里**
 *      （在 Unity 工程的 Avatar/`.meta` 里）⇒ 没有解算依据，只能报告为不支持。
 *   ✅ `RootT.*` / `RootQ.*`（Humanoid 根运动 = 位移 + 转身）—— 由调用方给目标对象（opts.rootMotionTarget ✓），
 *   ❌ `m_PPtrCurves`（贴图/材质切换）—— three 的动画系统没有对应通路
 *
 * 坐标约定：
 *   Unity 左手 Y-up，three 右手 Y-up ⇒ 位置/旋转做 **Z 轴翻转**：
 *     position: (x, y, z) → (x, y, -z)
 *     quaternion: (x, y, z, w) → (-x, -y, z, w)
 *   这与 Unity 官方 glTF 导出器一致；若某个 FBX 的轴向不同，可用
 *   `animation.axisFix: "none"` 关掉转换再自行处理。
 *
 * 绑定方式：
 *   three 的 PropertyBinding 只按 **name 或 uuid** 找节点（不支持路径）⇒
 *   本模块把每条曲线解析到具体对象后，用对象的 **uuid** 作 track 前缀，
 *   因此不需要给模型重命名（重命名会影响 hideParts / outlineSkipPattern 等按名字的配置）。
 *
 * 用法：
 *   const parsed = parseUnityAnim(text);
 *   const clip   = toThreeClip(parsed, { root: modelRoot, axisFix: true });
 *   if (clip) mixer.clipAction(clip).play();
 */

const VEC_KEYS = ['x', 'y', 'z', 'w'];

/**
 * ★★ **肌肉名归一化**（Unity 改过命名 ⇒ 必须跨版本对齐）
 *
 *   Unity 2018 及更早：`LeftHand.Thumb.1 Stretched` · `LeftHand.Index.Spread`
 *   Unity 2019+：      `Left Thumb 1 Stretched`    · `Left Index Spread`
 *   （实测：用户的工程是 2019.4.31f1，导出的表用新名；而 .anim 是老工程里录的、用旧名
 *     ⇒ 40 条手指肌肉**全部对不上**，整个 `Melano_fist` 直接 0 轨道 ✗）
 *
 *   ⇒ 归一化：小写 → 去掉一切非字母数字 → `lefthand`/`righthand` 收成 `left`/`right`
 */
export function canonMuscleName(n) {
  return String(n || '')
    .toLowerCase()
    .replace(/(left|right)hand/g, '$1')
    .replace(/[^a-z0-9]/g, '');
}

/* ------------------------------------------------------------------ *
 * 极简 Unity YAML 子集解析（只针对 AnimationClip 的结构，不引入 YAML 依赖）
 * ------------------------------------------------------------------ */

/** 取某行的缩进（空格数） */
function indentOf(line) {
  const m = line.match(/^ */);
  return m ? m[0].length : 0;
}

/** 解析 `value: 1.5` / `value: {x: 1, y: 2}` / `value:` + 缩进块 三种写法 */
function readValue(lines, i) {
  const line = lines[i];
  const inline = line.slice(line.indexOf(':') + 1).trim();

  if (inline.startsWith('{')) {
    const obj = {};
    for (const kv of inline.replace(/[{}]/g, '').split(',')) {
      const [k, v] = kv.split(':').map((s) => (s || '').trim());
      if (k) obj[k] = parseFloat(v);
    }
    return { value: obj, next: i + 1 };
  }
  if (inline !== '') {
    const n = Number(inline);
    return { value: Number.isFinite(n) ? n : (inline === 'Infinity' ? Infinity : inline), next: i + 1 };
  }
  /* 块状：后续更深缩进的行是 {x: .., y: ..} */
  const baseIndent = indentOf(line);
  const obj = {};
  let j = i + 1;
  while (j < lines.length && indentOf(lines[j]) > baseIndent) {
    const m = lines[j].match(/^\s*([A-Za-z]+):\s*(-?[\d.eE+]+)\s*$/);
    if (m) obj[m[1]] = parseFloat(m[2]);
    j++;
  }
  return { value: Object.keys(obj).length ? obj : undefined, next: j };
}

/**
 * 解析一个曲线段落里的**一个条目**（`<indent>- curve:` 开头）。
 * 返回 { keys: [{t, v}], attribute, path, classID }
 *
 * ⚠️ Unity 的实际缩进是（实测 shoes_ON.anim）：
 *      m_FloatCurves:        ← 2
 *      - curve:              ← 6
 *          serializedVersion: 2   ← 8
 *          m_Curve:               ← 10
 *          - serializedVersion: 3 ← 12
 *            time: 0              ← 14
 *            value: 1             ← 14
 *        attribute: m_IsActive    ← 8
 *        path: melano_shoes       ← 8
 *   ⇒ **不能写死层级**，只按「条目缩进」判断边界。
 */
function readCurveEntry(lines, start, entryIndent) {
  const out = { keys: [], attribute: '', path: '', classID: null };
  let i = start;
  while (i < lines.length) {
    const line = lines[i];
    const ind = indentOf(line);
    if (ind < entryIndent) break;                                   // 回到段落级
    if (ind === entryIndent && /^\s*-\s/.test(line)) break;          // 下一条目
    if (ind === entryIndent && /^\s*[A-Za-z_]/.test(line)) break;    // 段落里的下一个键

    const attr = line.match(/^\s+attribute:\s*(.*)$/);
    if (attr) { out.attribute = attr[1].trim(); i++; continue; }
    const p = line.match(/^\s+path:\s*(.*)$/);
    if (p) { out.path = p[1].trim(); i++; continue; }
    const cid = line.match(/^\s+classID:\s*(\d+)/);
    if (cid) { out.classID = parseInt(cid[1], 10); i++; continue; }
    /* 关键帧：`- serializedVersion: 3` 之后跟 time / value */
    if (/^\s*-\s*serializedVersion:/.test(line)) {
      let t = null, v;
      let j = i + 1;
      const kfIndent = indentOf(line);
      while (j < lines.length && indentOf(lines[j]) > kfIndent) {
        const tl = lines[j].match(/^\s*time:\s*(-?[\d.eE+]+)\s*$/);
        if (tl) { t = parseFloat(tl[1]); j++; continue; }
        if (/^\s*value:/.test(lines[j])) { const r = readValue(lines, j); v = r.value; j = r.next; continue; }
        j++;
      }
      if (t !== null && v !== undefined) out.keys.push({ t, v });
      i = j;
      continue;
    }
    i++;
  }
  return out;
}

/** 解析整份 `.anim` 文本 */
export function parseUnityAnim(text) {
  const lines = text.split(/\r?\n/);
  const clip = { name: '', sampleRate: 60, wrapMode: 0, legacy: 0, curves: [] };
  let section = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const nm = line.match(/^\s{2}m_Name:\s*(.*)$/);
    if (nm) { clip.name = nm[1].trim(); continue; }
    const sr = line.match(/^\s{2}m_SampleRate:\s*([\d.]+)/);
    if (sr) { clip.sampleRate = parseFloat(sr[1]); continue; }
    const wm = line.match(/^\s{2}m_WrapMode:\s*(\d+)/);
    if (wm) { clip.wrapMode = parseInt(wm[1], 10); continue; }
    const lg = line.match(/^\s{2}m_Legacy:\s*(\d+)/);
    if (lg) { clip.legacy = parseInt(lg[1], 10); continue; }

    /* 段落头（含 `[]` 空段落） */
    const sec = line.match(/^\s{2}(m_FloatCurves|m_PositionCurves|m_RotationCurves|m_EulerCurves|m_ScaleCurves|m_PPtrCurves|m_CompressedRotationCurves):\s*(\[\])?\s*$/);
    if (sec) { section = sec[2] ? null : sec[1]; continue; }

    /* 段落里的条目（缩进不写死） */
    if (section) {
      const ent = line.match(/^(\s*)-\s*curve:\s*$/);
      if (ent) {
        const e = readCurveEntry(lines, i + 1, ent[1].length);
        e.kind = section;
        if (e.keys.length) clip.curves.push(e);
        i = i;                                   // 内层已推进到条目末尾，用下面的 continue 继续扫描
      }
    }
  }
  return clip;
}

/* ------------------------------------------------------------------ *
 * 目标解析：Unity 的 path（`A/B/C` 或空）→ 模型里的对象
 * ------------------------------------------------------------------ */

/** 按名字或「以 / 分隔的名字路径」在 root 子树里找对象 */
export function findUnityTarget(root, unityPath, name) {
  const parts = (unityPath || '').split('/').filter(Boolean);
  const lastName = parts.length ? parts[parts.length - 1] : (name || '');
  let node = null;
  /* 1) 精确路径匹配（逐段比对名字） */
  if (parts.length) {
    const walk = (obj, idx) => {
      if (idx === parts.length) return obj;
      for (const c of obj.children || []) {
        if (c.name === parts[idx]) { const r = walk(c, idx + 1); if (r) return r; }
      }
      return null;
    };
    node = walk(root, 0);
  }
  /* 2) 退化为按末段名字找（含骨骼） */
  if (!node && lastName) {
    if (root.skeleton && root.skeleton.getBoneByName) {
      const b = root.skeleton.getBoneByName(lastName);
      if (b) return b;
    }
    let hit = null;
    root.traverse((o) => { if (!hit && o.name === lastName) hit = o; });
    node = hit;
  }
  return node;
}

/** 找带某个 blendShape 的网格 */
function findMorphMesh(root, unityPath, name) {
  const target = findUnityTarget(root, unityPath, name);
  const candidates = [];
  if (target && target.isMesh) candidates.push(target);
  if (target) target.traverse((o) => { if (o.isMesh) candidates.push(o); });
  if (!candidates.length) root.traverse((o) => { if (o.isMesh) candidates.push(o); });
  for (const m of candidates) {
    if (m.morphTargetDictionary && m.morphTargetDictionary[name] !== undefined) return { mesh: m, index: m.morphTargetDictionary[name] };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * 坐标转换（Unity 左手 → three 右手）
 * ------------------------------------------------------------------ */
const swapVec = (v) => ({ x: v.x, y: v.y, z: -v.z });
/**
 * ★★ Unity → three 的四元数转换（**实测标定**）：
 *
 *      (x, y, z, w) → (x, -y, -z, w)
 *
 *   ⚠️⚠️ 原来写的是 `(-x, -y, z, w)` —— **错的** ✗
 *     它等价于「每根骨骼的局部旋转都做一次绕 Z 的 180° 共轭」，
 *     沿骨骼链串起来 = 把角色**绕 Z 翻 180°**，而不是坐标变换 ✗
 *     症状：**小角度动作看着还行**（握拳、下蹲 ✓）、**大角度动作全歪**
 *           （跳舞的手臂差 40~90°）—— 而且连**烘焙出来的真值片段**也是歪的 ✓
 *
 *   怎么定的：拿 Unity 导出的 `zeroQuat`（肌肉全 0 姿势）与模型自身绑定姿势比，
 *   枚举候选转换取整体差异最小者（254 根骨骼：中位 0.0° / 均 5.5°）✓
 *   复现：`node _m3/axis-calibration.mjs`
 */
const swapQuat = (q) => ({ x: q.x, y: -q.y, z: -q.z, w: q.w });

/* ------------------------------------------------------------------ *
 * 曲线 → three track
 * ------------------------------------------------------------------ */

/**
 * @param {object} clip    parseUnityAnim 的结果
 * @param {object} opts    { root, axisFix=true, humanoid, bindQuat }
 *   `humanoid` = 肌肉换算表（Unity 侧量出来的，见 tools/unity/ExportHumanoidMuscleAxes.cs）
 *      { muscles: [ { i, name, bone, path, axis:[x,y,z], degPerUnit } ] }
 *   `bindQuat` = uuid → 中性姿态的局部四元数（**必须在播任何动作之前**抓一份 ✓）
 * @returns {{ clip: THREE.AnimationClip|null, report: object }}
 */
export function toThreeClip(clip, opts = {}, THREE) {
  const root = opts.root;
  const axisFix = opts.axisFix !== false;
  const tracks = [];
  const report = { name: clip.name, blendShape: 0, active: 0, transform: 0, muscle: [], rootMotion: 0, pptr: 0, unresolved: 0 };
  /** ★ 根运动曲线（RootT / RootQ）—— 之前直接丢弃 ✗ 见文件末尾的根运动段 ✓ */
  const rootMotionRaw = [];

  /* ------------------------------------------------------------------ *
   * ★★ **分量曲线预分组**
   *
   *   Unity 把通用的变换动画**常常写成一条一个分量**：
   *       attribute: m_LocalRotation.x / .y / .z / .w
   *       attribute: m_LocalPosition.x / .y / .z
   *       attribute: localEulerAnglesRaw.x / .y / .z
   *   （`AnimationUtility.SetEditorCurve` 烘出来的片段就是这样 ✓）
   *
   *   ⚠️⚠️ 不分组的话，每条分量会被当成「值是向量的曲线」处理 ——
   *      实际 `value` 是**标量** ⇒ 取 .x/.y/.z 全是 undefined ⇒ **轨道值 NaN** ⇒
   *      模型姿态直接崩（而且不会报错，极难查）✗
   *   ⇒ 先按 (path, 族) 聚起来，读时把分量合成向量/四元数 ✓
   * ------------------------------------------------------------------ */
  const FAMILY = {
    m_LocalPosition: { family: 'position', comps: 'xyz' },
    m_LocalScale: { family: 'scale', comps: 'xyz' },
    m_LocalRotation: { family: 'quaternion', comps: 'xyzw' },
    localEulerAnglesRaw: { family: 'euler', comps: 'xyz' },
  };
  const groups = new Map();     // `${path}|${family}` → { path, family, comps: {x:[{t,v}],…} }
  const grouped = new Set();    // 已被分组接管的曲线（主循环跳过）
  for (const c of clip.curves) {
    const m = /^(m_LocalPosition|m_LocalScale|m_LocalRotation|localEulerAnglesRaw)\.([xyzw])$/.exec(c.attribute);
    if (!m) continue;
    const info = FAMILY[m[1]];
    const key = c.path + '|' + info.family;
    let g = groups.get(key);
    if (!g) { g = { path: c.path, family: info.family, comps: {} }; groups.set(key, g); }
    g.comps[m[2]] = c.keys;
    grouped.add(c);
  }
  /** 同一根骨头若同时有**四元数**与**欧拉**曲线 ⇒ 以四元数为准（否则两条轨道抢同一个属性 ✗）*/
  for (const key of [...groups.keys()]) {
    if (!key.endsWith('|euler')) continue;
    const qKey = key.slice(0, -'euler'.length) + 'quaternion';
    if (groups.has(qKey)) { groups.delete(key); }
  }

  /** 取某分量在时刻 t 的值（线性插值；缺该分量就用默认值）*/
  const sampleComp = (keys, t, dflt) => {
    if (!keys || !keys.length) return dflt;
    if (keys.length === 1) return Number(keys[0].v);
    if (t <= keys[0].t) return Number(keys[0].v);
    const last = keys[keys.length - 1];
    if (t >= last.t) return Number(last.v);
    for (let i = 1; i < keys.length; i++) {
      if (keys[i].t >= t) {
        const a = keys[i - 1], b = keys[i];
        const span = b.t - a.t;
        const w = span > 1e-9 ? (t - a.t) / span : 0;
        return Number(a.v) + (Number(b.v) - Number(a.v)) * w;
      }
    }
    return Number(last.v);
  };

  for (const c of clip.curves) {
    if (grouped.has(c)) continue;
    const attr = c.attribute;
    /**
     * ★★ **先按属性分类，再解析目标**（顺序很重要 ✗ 踩过）——
     *
     *   最初的写法是「先当通用变换解析 target，解析不到就 continue」，
     *   结果 **Humanoid 肌肉曲线**（path 为空 ⇒ 永远解析不到目标）
     *   在 `continue` 那一步就被丢掉了 ⇒ `report.muscle` 恒为空
     *   ⇒ 调用方看到的是「没有受支持的曲线」，而不是「Humanoid 无法解算」✗
     *   （实测：Melano 的 Motion 片段 80~129 条肌肉曲线全部被静默吞掉）
     */
    const isTransform = c.kind === 'm_PositionCurves' || c.kind === 'm_RotationCurves'
      || c.kind === 'm_EulerCurves' || c.kind === 'm_ScaleCurves'
      || /^(m_LocalPosition|m_LocalRotation|m_LocalScale|localEulerAnglesRaw)/.test(attr);
    const isBlendShape = attr.startsWith('blendShape.');
    const isActive = attr === 'm_IsActive' || attr === 'm_Enabled';
    const isPPtr = c.kind === 'm_PPtrCurves';

    /* ---- 根运动：收集起来，后面统一转成「模型位移 + 转身」✓（别再丢弃 ✗）---- */
    if (/^Root[TRQ]/.test(attr)) { report.rootMotion++; rootMotionRaw.push(c); continue; }
    /**
     * Unity 给 Humanoid 片段额外写的 foot/hand IK 目标曲线（`LeftFootT.x` · `LeftHandQ.w` …）
     * ⇒ 我们不做 IK，**只忽略、不影响片段可用** ✓（否则这些片段会被判为「有未支持曲线」而整段丢掉 ✗）
     */
    if (/^(Left|Right)(Foot|Hand)[TQ]\./.test(attr)) { report.humanoidExtras = (report.humanoidExtras || 0) + 1; continue; }
    if (isPPtr) { report.pptr++; continue; }
    if (!isTransform && !isBlendShape && !isActive) { report.muscle.push(attr); continue; }

    /* ---- blendShape ---- */
    if (isBlendShape) {
      const shapeName = attr.slice('blendShape.'.length);
      const found = root ? findMorphMesh(root, c.path, shapeName) : null;
      if (!found) { report.unresolved++; continue; }
      const times = c.keys.map((k) => k.t);
      const values = c.keys.map((k) => Number(k.v));
      tracks.push(new THREE.NumberKeyframeTrack(`${found.mesh.uuid}.morphTargetInfluences[${found.index}]`, times, values));
      report.blendShape++;
      continue;
    }
    /* ---- 显隐 ---- */
    if (isActive) {
      const node = root ? findUnityTarget(root, c.path, '') : null;
      if (!node) { report.unresolved++; continue; }
      const times = c.keys.map((k) => k.t);
      const values = c.keys.map((k) => (Number(k.v) > 0.5 ? 1 : 0));
      /**
       * ⚠️⚠️ **不要写 three 的 `.visible`** —— 它是**布尔属性**，而 three 会把 action 的
       *   **淡入权重**乘进缓冲再写回（实测：淡入未完成时读到 `0.5`）
       *   ⇒ 布尔语义被毁（0.5 在 JS 里是真值 ⇒ 该藏的部件照样显示）✗
       *   ⇒ 写到一个**自定义属性**上，由 viewer 每帧按轨道关键帧决定 `visible` ✓
       *      （阶跃语义，与 Unity 的 `m_IsActive` 一致）
       */
      const tr = new THREE.NumberKeyframeTrack(`${node.uuid}.__ba3dVisible`, times, values);
      tr.setInterpolation(THREE.InterpolateDiscrete);   // Unity 的显隐是阶跃，别插值
      tracks.push(tr);
      report.active++;
      continue;
    }
    /* ---- 通用变换 ---- */
    const node = root ? findUnityTarget(root, c.path, '') : null;
    if (!node) { report.unresolved++; continue; }
    const times = c.keys.map((k) => k.t);
    if (c.kind === 'm_PositionCurves' || attr.startsWith('m_LocalPosition')) {
      /**
       * ★★ 位置通道只取**相对首帧的位移** ——
       *   ⚠️ Unity 的 `m_LocalPosition` 是它自己层级里的**绝对局部位置**
       *      （例如 Hips = (0.045, 0.679, 0.023)，0.679 = 胯高）
       *      而我们 FBX 层级里 Hips 的局部位置是 **0**（高度由上层节点承担）
       *      ⇒ 直接写进去会把角色整体挪 0.679 个单位 ✗
       *   减掉首帧后剩下的就是"这段动作里胯挪了多少"，与层级约定无关 ✓
       */
      const raw = c.keys.map((k) => (axisFix ? swapVec(k.v) : k.v));
      const base = raw[0] || { x: 0, y: 0, z: 0 };
      const vals = raw.flatMap((v) => [v.x - base.x, v.y - base.y, v.z - base.z]);
      tracks.push(new THREE.VectorKeyframeTrack(`${node.uuid}.position`, times, vals));
      report.transform++;
    } else if (c.kind === 'm_ScaleCurves' || attr.startsWith('m_LocalScale')) {
      const vals = c.keys.flatMap((k) => [k.v.x, k.v.y, k.v.z]);
      tracks.push(new THREE.VectorKeyframeTrack(`${node.uuid}.scale`, times, vals));
      report.transform++;
    } else if (c.kind === 'm_EulerCurves' || attr.startsWith('localEulerAnglesRaw')) {
      const vals = c.keys.flatMap((k) => {
        const e = new THREE.Euler(
          /* ★ 欧拉 XYZ 下与 swapQuat 对应的共轭：取反 **y、z**（保留 x）✓
             原来取反 x、y 是与错误四元数配套的写法 ✗ */
          THREE.MathUtils.degToRad(k.v.x),
          THREE.MathUtils.degToRad(axisFix ? -k.v.y : k.v.y),
          THREE.MathUtils.degToRad(axisFix ? -k.v.z : k.v.z),
          'XYZ',
        );
        const q = new THREE.Quaternion().setFromEuler(e);
        return [q.x, q.y, q.z, q.w];
      });
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node.uuid}.quaternion`, times, vals));
      report.transform++;
    } else {
      const vals = c.keys.flatMap((k) => { const q = axisFix ? swapQuat(k.v) : k.v; return [q.x, q.y, q.z, q.w]; });
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node.uuid}.quaternion`, times, vals));
      report.transform++;
    }
  }

  /* Humanoid 肌肉曲线：明确报出来（别静默丢） */
  /* ---- 肌肉曲线：有换算表就**解算**，没有才判为不支持 ------------------------------
   *
   *   Unity 的肌肉值是「相对 Avatar T-pose 的归一化旋转」，轴向由 Unity 按 T-pose 推出、不落盘
   *   ⇒ 没有换算表只能跳过 ✗
   *   有换算表（tools/unity/ExportHumanoidMuscleAxes.cs 量出来的 axis + degPerUnit）时：
   *       局部旋转 = 中性姿态 × ∏ AngleAxis(值 × degPerUnit, axis)      ← 按肌肉序号（= dof 顺序）
   *   ⚠️ 这个公式与 Unity 侧脚本的自检公式**逐字相同** ⇒ 那边误差≈0 就说明这里也精确 ✓
   * --------------------------------------------------------------------------- */
  if (report.muscle.length && opts.humanoid && opts.humanoid.muscles) {
    const byMuscleName = new Map();
    for (const e of opts.humanoid.muscles) {
      byMuscleName.set(e.name, e);
      byMuscleName.set(canonMuscleName(e.name), e);      // 跨版本命名 ✓
    }
    /** 骨 → { obj, entries:[{e, curve}], times:Set } */
    const plan = new Map();
    const leftOver = [];
    for (const c of clip.curves) {
      const a0 = c.attribute;
      /**
       * ⚠️ 只把**真正的肌肉名**算进「未覆盖」——
       *   最初这里把 blendShape / 显隐 / 变换曲线也算进去了 ⇒
       *   一段只有 2 条 blendShape 的片段会被报成「残肌肉 8 条」并整段跳过 ✗
       *   空属性名（.anim 里偶有 `attribute:` 为空的行）直接忽略 ✓
       */
      if (!a0 || !a0.trim()) continue;
      if (a0.startsWith('blendShape.') || a0 === 'm_IsActive' || a0 === 'm_Enabled') continue;
      if (/^(m_Local|localEuler|Root[TRQ])/.test(a0)) continue;
      if (/^(Left|Right)(Foot|Hand)[TQ]\./.test(a0)) continue;
      const e = byMuscleName.get(a0) || byMuscleName.get(canonMuscleName(a0));
      if (!e) { leftOver.push(a0); continue; }
      const obj = root ? findUnityTarget(root, e.path || e.bone, e.bone) : null;
      if (!obj) { report.unresolved++; continue; }
      let p = plan.get(e.bone);
      if (!p) { p = { obj, boneName: e.bone, entries: [], times: new Set() }; plan.set(e.bone, p); }
      p.entries.push({ e, keys: c.keys });
      for (const k of c.keys) p.times.add(k.t);
    }
    for (const [, p] of plan) {
      const times = [...p.times].sort((a, b) => a - b);
      if (!times.length) continue;
      /**
       * ★★ 组合顺序**按 Unity 实测的表**（boneFit）——
       *   ⚠️ 每根骨骼的 dof 应用次序是 Avatar 相关的，写死"按序号升序"在**多自由度**
       *      （手臂/腿，3 个 dof）组合姿势下会明显错位，而单自由度（手指）看着正常 ✓
       *      表里没有该骨（旧版导出）才退回按序号升序 ✓
       */
      const fit = opts.humanoid.boneFit && (opts.humanoid.boneFit[p.boneName] || opts.humanoid.boneFit[p.obj.name]);
      if (fit && Array.isArray(fit.order) && fit.order.length === p.entries.length) {
        const byIndex = new Map(p.entries.map((x) => [x.e.i, x]));
        const ordered = fit.order.map((mi) => byIndex.get(mi)).filter(Boolean);
        if (ordered.length === p.entries.length) p.entries = ordered;
      } else {
        p.entries.sort((a, b) => a.e.i - b.e.i);        // dof 顺序（旧版行为）
      }
      const usePre = !!(fit && fit.pre);
      /**
       * ★ 基准取「Unity 的肌肉全 0 姿势」（表里带 zeroQuat ✓）——
       *   模型的绑定姿势与它不一定相同（手指尤甚），用错了角度会被放大 ✗
       *   表里没带（旧版导出）才退回模型绑定姿势 ✓
       */
      const zq = opts.humanoid.zeroQuat && (opts.humanoid.zeroQuat[p.boneName] || opts.humanoid.zeroQuat[p.obj.name]);
      const bindQ = (opts.bindQuat && opts.bindQuat.get(p.obj.uuid)) || p.obj.quaternion.clone();
      /**
       * ★ 基准可以是「Unity 的肌肉全 0 姿势」(zeroQuat) 或「模型绑定姿势」(bind) ——
       *   由拟合结果决定（boneFit.neutral）✓
       *   ⚠️ 两者都在 **Unity 空间**里参与组合：绑定姿势要先 swapQuat 转过去 ✗→✓
       *      （swapQuat 是自逆的，转一次即得 Unity 空间的绑定姿势 ✓）
       */
      const wantBind = !!(fit && fit.neutral === 'bind');
      const neutral = wantBind
        ? (() => { const s = swapQuat(bindQ); return new THREE.Quaternion(s.x, s.y, s.z, s.w); })()
        : (zq ? new THREE.Quaternion(zq[0], zq[1], zq[2], zq[3]) : bindQ.clone());
      const vals = [];
      for (const t of times) {
        /**
         * ★ 先按实测次序累乘出**肌肉位移** delta = ∏ r，再决定它贴在 neutral 的哪一侧：
         *     post：posed = neutral × delta（位移在**骨骼自身**坐标系里）
         *     pre ：posed = delta × neutral（位移在**父级**坐标系里）
         *   ⚠️ 两种写法必须与 Unity 侧测量公式**完全对应**，否则组合结果差几十度 ✗
         */
        let delta = new THREE.Quaternion();
        for (const { e, keys } of p.entries) {
          let v = sampleComp(keys, t, 0);
          if (!v) continue;
          /**
           * ★★ **按实测有效范围夹取** ——
           *   ⚠️ Unity 对越界的肌肉值会饱和；不夹就会线性外插 ⇒ 大幅过冲
           *      （实测：脊柱类肌肉的范围是归一化 ±1，而 `lo/hi` 字段是**度** ±40，
           *        曾经拿后者当取值用 ⇒ 假误差上百度的元凶 ✓）
           *   vLo/vHi 由 Unity 侧脚本实测饱和点得到；旧表没有这两个字段 ⇒ 不夹 ✓
           */
          if (typeof e.vLo === 'number' && typeof e.vHi === 'number') {
            if (v < e.vLo) v = e.vLo; else if (v > e.vHi) v = e.vHi;
          }
          delta.multiply(new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(e.axis[0], e.axis[1], e.axis[2]).normalize(), THREE.MathUtils.degToRad(v * e.degPerUnit)));
        }
        const q = usePre ? delta.multiply(neutral) : neutral.clone().multiply(delta);
        /**
         * ★★ **必须做坐标转换** ——
         *   `neutral`（Unity 的 zeroQuat）与 `delta`（Unity 局部系里的轴角）都在 **Unity 空间**
         *   ⇒ 乘出来的 q 也是 Unity 空间；直接塞进 three 的骨骼就是"空间不匹配" ✗
         *   （通用旋转曲线那条路一直有 swapQuat，这里漏了 —— 同一个 bug 的第二个出口 ✗）
         */
        const out = axisFix ? swapQuat(q) : q;
        vals.push(out.x, out.y, out.z, out.w);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${p.obj.uuid}.quaternion`, times, vals));
      report.humanoid = (report.humanoid || 0) + 1;
    }
    /**
     * ⚠️ 诊断行：换算表在不在、解出几根骨骼、还剩几条没覆盖 ——
     *    「明明有表却还是被跳过」时先看这一行 ✓
     */
    if (opts.humanoid) {
      console.debug('[humanoid-solve] 变量 ' + clip.name + '：曲线 ' + clip.curves.length +
        ' · 目标骨骼 ' + plan.size + ' · 残 ' + leftOver.length +
        ' · 未解析 ' + report.unresolved + (leftOver.length ? '（例：' + leftOver.slice(0, 3).join(' / ') + '）' : ''));
    }
    report.muscle = leftOver;      // 表里没覆盖的肌肉名才继续算「不支持」
  }

  /* ---- 把预分组的分量曲线合成轨道（放在主循环之后：目标解析逻辑只有一份 ✓）---- */
  for (const g of groups.values()) {
    const node = root ? findUnityTarget(root, g.path, '') : null;
    if (!node) { report.unresolved += Object.keys(g.comps).length; continue; }
    /* 时间轴 = 各分量时间的并集（烘焙片段通常一致；不一致就线性重采样 ✓）*/
    const times = [...new Set(Object.values(g.comps).flatMap((ks) => ks.map((k) => k.t)))].sort((a, b) => a - b);
    if (!times.length) continue;
    if (g.family === 'position' || g.family === 'scale') {
      const dflt = g.family === 'scale' ? 1 : 0;
      const vals = [];
      for (const t of times) {
        const x = sampleComp(g.comps.x, t, dflt);
        const y = sampleComp(g.comps.y, t, dflt);
        const z = sampleComp(g.comps.z, t, dflt);
        if (g.family === 'position' && axisFix) vals.push(x, y, -z);   // Unity→three 的 Z 翻转
        else vals.push(x, y, z);
      }
      tracks.push(new THREE.VectorKeyframeTrack(`${node.uuid}.${g.family === 'scale' ? 'scale' : 'position'}`, times, vals));
      report.transform++;
    } else if (g.family === 'quaternion') {
      const vals = [];
      for (const t of times) {
        let q = {
          x: sampleComp(g.comps.x, t, 0), y: sampleComp(g.comps.y, t, 0),
          z: sampleComp(g.comps.z, t, 0), w: sampleComp(g.comps.w, t, 1),
        };
        if (axisFix) q = swapQuat(q);
        const n = Math.hypot(q.x, q.y, q.z, q.w) || 1;   // 分量插值后必须归一化 ✓
        vals.push(q.x / n, q.y / n, q.z / n, q.w / n);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node.uuid}.quaternion`, times, vals));
      report.transform++;
    } else {
      /* euler（度）—— 分量→欧拉→四元数 ✓ */
      const vals = [];
      for (const t of times) {
        const e = new THREE.Euler(
          THREE.MathUtils.degToRad(sampleComp(g.comps.x, t, 0)),
          THREE.MathUtils.degToRad(axisFix ? -sampleComp(g.comps.y, t, 0) : sampleComp(g.comps.y, t, 0)),
          THREE.MathUtils.degToRad(axisFix ? -sampleComp(g.comps.z, t, 0) : sampleComp(g.comps.z, t, 0)),
          'XYZ',
        );
        const q = new THREE.Quaternion().setFromEuler(e);
        vals.push(q.x, q.y, q.z, q.w);
      }
      tracks.push(new THREE.QuaternionKeyframeTrack(`${node.uuid}.quaternion`, times, vals));
      report.transform++;
    }
  }

  const muscleOnly = report.muscle.length > 0;
  if (!tracks.length) {
    /**
     * 失败原因要**分得清**（否则调用方只能看到「没曲线」，无法判断该怎么修）：
     *   humanoid-muscle    —— 肌肉/根运动曲线，需要 Avatar 才能解算（我们做不到）
     *   unresolved-targets —— 有受支持的曲线，但模型里找不到对应对象/形态
     *                         （例如 FBX 没有 blendShape ⇒ 表情片段无处可挂）
     *   empty              —— 文件本身没有曲线
     *   no-supported-curves—— 其它
     */
    const reason = muscleOnly ? 'humanoid-muscle'
      : (report.rootMotion ? 'root-motion-only'
        : (report.unresolved > 0 ? 'unresolved-targets'
          : (report.pptr > 0 ? 'pptr-only' : 'no-supported-curves')));
    return { clip: null, report: { ...report, reason } };
  }
  /* ------------------------------------------------------------------ *
   * ★★ 根运动（Humanoid 的 RootT / RootQ）= 角色的**位移 + 转身**
   *
   *   ⚠️ 之前整段忽略 ✗ ⇒ 大舞变成"原地不动、不转身"地在跳
   *      （实测【我晒干了沉默】：RootT.y 起伏 19cm · RootQ.y 转身最多 ≈70°）
   *
   *   定标：我们骨架的世界尺度与 Unity 的米制差 ~×100
   *     ⇒ scale = opts.rootMotionTargetHeight ÷ median(RootT.y)（自动，不用手填 ✓）
   *   位移与转身都取**相对首帧**⇒ 角色仍留在场景摆放处，只叠加动作本身带来的移动/转身 ✓
   * ------------------------------------------------------------------ */
  if (opts.rootMotionTarget && rootMotionRaw.length) {
    const tgt = opts.rootMotionTarget;
    const byAttr = new Map();
    for (const c of rootMotionRaw) byAttr.set(String(c.attribute || '').trim(), c.keys);
    const get = (name) => byAttr.get(name) || null;
    const times = [...new Set(rootMotionRaw.flatMap((c) => c.keys.map((k) => k.t)))].sort((a, b) => a - b);
    if (times.length > 1) {
      const tTx = get('RootT.x'), tTy = get('RootT.y'), tTz = get('RootT.z');
      if (tTx || tTy || tTz) {
        let scale = (typeof opts.rootMotionScale === 'number' && opts.rootMotionScale > 0) ? opts.rootMotionScale : null;
        const ys = (tTy ? tTy.map((k) => k.v) : []).filter((v) => typeof v === 'number' && isFinite(v)).sort((a, b) => a - b);
        const medY = ys.length ? ys[ys.length >> 1] : null;
        if (scale === null) {
          scale = (typeof opts.rootMotionTargetHeight === 'number' && opts.rootMotionTargetHeight > 0 && medY && Math.abs(medY) > 1e-4)
            ? opts.rootMotionTargetHeight / Math.abs(medY) : 1;
        }
        report.rootMotionScale = +scale.toFixed(4);
        report.rootTYMedian = medY;
        const bx = tgt.position.x, by = tgt.position.y, bz = tgt.position.z;
        const p0x = sampleComp(tTx, times[0], 0), p0y = sampleComp(tTy, times[0], 0), p0z = sampleComp(tTz, times[0], 0);
        const vals = [];
        for (const t of times) {
          const x = sampleComp(tTx, t, 0), y = sampleComp(tTy, t, 0), z = sampleComp(tTz, t, 0);
          vals.push(bx + (x - p0x) * scale, by + (y - p0y) * scale, bz - (z - p0z) * scale);
        }
        tracks.push(new THREE.VectorKeyframeTrack(tgt.uuid + '.position', times, vals));
        report.rootMotionTracks = (report.rootMotionTracks || 0) + 1;
      }
      const qx = get('RootQ.x'), qy = get('RootQ.y'), qz = get('RootQ.z'), qw = get('RootQ.w');
      if (qx || qy || qz || qw) {
        const base = tgt.quaternion.clone();
        const readU = (t) => new THREE.Quaternion(
          sampleComp(qx, t, 0), sampleComp(qy, t, 0), sampleComp(qz, t, 0), sampleComp(qw, t, 1)).normalize();
        /* ⚠️ swapQuat 返回的是**普通对象** {x,y,z,w}（不是 THREE.Quaternion）⇒ 必须包一层 ✗→✓ */
        const cvt = (q3) => { const s = swapQuat(q3); return new THREE.Quaternion(s.x, s.y, s.z, s.w); };
        const q0 = axisFix ? cvt(readU(times[0])) : readU(times[0]);
        const q0i = q0.clone().invert();
        const vals = [];
        for (const t of times) {
          const uq = readU(t);
          const cq = axisFix ? cvt(uq) : uq;
          const q = base.clone().multiply(q0i.clone().multiply(cq));   // 相对首帧 + 叠在模型原有朝向 ✓
          vals.push(q.x, q.y, q.z, q.w);
        }
        tracks.push(new THREE.QuaternionKeyframeTrack(tgt.uuid + '.quaternion', times, vals));
        report.rootMotionTracks = (report.rootMotionTracks || 0) + 1;
      }
    }
  }

  const threeClip = new THREE.AnimationClip(clip.name || 'unity-anim', -1, tracks);
  return { clip: threeClip, report };
}

/** 便捷函数：文本 → THREE.AnimationClip */
export function unityAnimToClip(text, opts = {}, THREE) {
  const parsed = parseUnityAnim(text);
  /**
   * ⚠️⚠️ **必须把 opts 原样传下去** ——
   *   写成 `{ root, axisFix }` 会把 `humanoid`（肌肉换算表）与 `bindQuat`（中性姿态）**丢掉** ✗
   *   症状：Node 里直接调 `toThreeClip` 一切正常，浏览器走本函数却总是「有表也不用」
   *   （实测踩过：换算表明明载入了，Humanoid 片段照样被跳过 ✓）
   */
  const out = toThreeClip(parsed, opts, THREE);
  out.report.curvesTotal = parsed.curves.length;
  return out;
}
