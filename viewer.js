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
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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
    return o;
  }

  const cfg = {
    // —— 模型 / 资源（可被 config JSON 覆盖）——
    modelUrl: './assets/model.glb',
    mouthAtlasUrl: './assets/mouth/Character_Mouth_2.png',
    // —— 配置来源：直接给对象(config) 或 给 JSON 的 URL(configUrl) ——
    config: null,
    configUrl: null,
    // —— 其它 ——
    autoRotate: false,
    autoRotateSpeed: 0.6,
    targetHeight: 2.0,
    fov: 30,
    shadows: true,
    envIntensity: 0.8,
    backgrounds: [0x10131a, 0x1e2230, 0x000000, 0xf2f4f8],
    backgroundTransparent: true, // 默认透明背景（便于内嵌时透出网页内容）
    dragContainer: false,        // 左键按在模型上时拖动整个容器（内嵌场景用 data-ba3d-drag 开启）
    framing: 'auto',             // 'auto' = 基线取景；'tight' = 按真实内容居中
    framingReferenceHeight: 0,   // >0 时：相机参数按这个面板高度算成固定世界量 → 面板按百分比缩放时画面整体等比缩放
    modelHeightPx: 360,          // 角色在参考画布上的屏幕高度（CSS 像素）——模型无关的「默认缩放」
    framingOffsetY: 0,           // 取景垂直偏移（CSS 像素，正值 = 取景下移 / 画面内容上移）
    stripRootMotion: 'xyz',      // 根节点位移原地化：'xyz' 全抹（角色永远在画面里）/ 'xz' 保留跳跃 / false 关闭
    pressHoldMs: 200,            // 左键在模型上按住多久才算「按下」（否则算点击）
    mouthCell: null,             // 默认口型（图集格 0~63）：动作没驱动嘴部骨骼时用哪一格；null = 第一个口型
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
    stencil: false,
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
    keyLight.shadow.bias = -0.0003;
    keyLight.shadow.normalBias = 0.02;
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
    const target = new THREE.Vector3(center.x + pivotX, center.y + shiftY, center.z + pivotZ);
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
    applyVisibilityRules();   // 盾牌/武器这类"只在特定动作里出现"的网格
    // 通知页面「动作已切换」——页面据此同步选单，不必去读查看器内部状态
    emit('ba3d:action', { name: clip.name });
  }

  /** 骨架里最顶层的那根骨骼（所有骨骼的共同祖先，通常是 Bip001_Pelvis） */
  function findTopBone() {
    if (!modelRoot) return null;
    let top = null;
    modelRoot.traverse((o) => {
      if (top || !o.isBone) return;
      let p = o.parent, hasBoneParent = false;
      while (p) { if (p.isBone) { hasBoneParent = true; break; } p = p.parent; }
      if (!hasBoneParent) top = o;
    });
    return top;
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
      : cfg.stripRootMotion === 'xz' ? 'xz'
      : cfg.stripRootMotion === 'none' ? 'none'
      : 'xyz'; // true / undefined / 'xyz' 都走这里
    if (mode === 'none') return 0;
    const allAxes = mode === 'xyz';

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
    const keys = new Set();
    for (let p = topBone; p; p = p.parent) {
      if (p.name && animated.has(p.name)) keys.add(p.name + '.position');
      if (p === modelRoot) break;
    }
    if (!keys.size) return 0;

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
      console.info('[rootMotion] 已原地化根节点位移（' + mode + '）：' + [...keys].join(', ') +
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
        console.info('[viewer] 嘴部图集已加载：', mouthAtlasUrl, t.image && t.image.width + 'x' + t.image.height);
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
    if (shadingMode === 'cel') {
      mat = new THREE.MeshToonMaterial(Object.assign({ gradientMap: getToonGradient() }, common));
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
      console.info('[fixMouth] 有 ' + cands.length + ' 个网格共用 EyeMouth 材质（' +
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
    console.info('[fixMouth] 已按 kivo 方式拆出嘴部：网格=' + (mesh.name || '?') +
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

  /* ---------- 卡通渲染（Cel / Toon 着色） ---------- */
  /**
   * 用 three.js 内建的 MeshToonMaterial 做卡通渲染（官方那种高调、浅阴影的观感）：
   *   · 保留原贴图 / 颜色 / 透明 / 顶点色 / 法线贴图
   *   · gradientMap 决定明暗分档，档数越少越"硬"
   *   · 嘴部材质也跟随模式（PBR→Standard / Cel→Toon），亮度与脸一致
   * 任何时候都能切回原始 PBR（原材质对象被完整保留）。
   */
  const TOON_STEPS = 4;
  const TOON_DARK = 0.55; // 最暗档（1.0 = 全亮），官方那种浅阴影
  let shadingMode = 'pbr';
  let toonGradient = null;

  /** 明暗分档梯度图（DataTexture，Nearest 采样 → 硬边分档） */
  function getToonGradient() {
    if (toonGradient) return toonGradient;
    const data = new Uint8Array(TOON_STEPS * 4);
    for (let i = 0; i < TOON_STEPS; i++) {
      const t = TOON_STEPS === 1 ? 1 : i / (TOON_STEPS - 1);
      const v = Math.round(255 * (TOON_DARK + (1 - TOON_DARK) * t));
      data[i * 4] = v; data[i * 4 + 1] = v; data[i * 4 + 2] = v; data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, TOON_STEPS, 1, THREE.RGBAFormat);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    tex.needsUpdate = true;
    toonGradient = tex;
    return tex;
  }

  /** 由原材质生成对应的卡通材质（原材质挂在 userData.__src 上以便还原） */
  function toToonMaterial(src) {
    const t = new THREE.MeshToonMaterial({
      color: src.color ? src.color.clone() : new THREE.Color(0xffffff),
      map: src.map || null,
      gradientMap: getToonGradient(),
      emissive: src.emissive ? src.emissive.clone() : new THREE.Color(0x000000),
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
    return t;
  }

  /** 切换渲染模式：'pbr'（原始）| 'cel'（卡通）；返回生效的模式 */
  function applyShading(mode) {
    shadingMode = mode === 'cel' ? 'cel' : 'pbr';
    if (!modelRoot) return shadingMode;
    modelRoot.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const isArr = Array.isArray(o.material);
      const mats = isArr ? o.material : [o.material];
      const next = mats.map((m) => {
        if (m.userData && m.userData.__mouth) return m;       // 嘴部材质单独重建
        if (shadingMode === 'cel') {
          if (m.userData && m.userData.__toon) return m;      // 已是卡通
          if (m.isMeshBasicMaterial) return m;                // 其它无光照材质不动
          return toToonMaterial(m);
        }
        return (m.userData && m.userData.__src) ? m.userData.__src : m; // 还原 PBR
      });
      o.material = isArr ? next : next[0];
    });
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
    applyLightingPreset(currentLighting); // 卡通模式下光照重新补偿
    applyOutlineParams();                // 新材质补上描边参数
    return shadingMode;
  }

  /* ---------- 打光预设（灯光 + 曝光；卡通模式下自动补偿） ---------- */
  function applyLightingPreset(name) {
    const p = LIGHTING_PRESETS[name];
    if (!p) return null;
    const cel = shadingMode === 'cel';
    // MeshToonMaterial 不支持 envMap（RoomEnvironment 的环境光会丢），
    // 卡通模式下用更强的半球光补回环境照明，同时整体压暗一档（避免过曝）
    hemi.color.set(p.hemi.sky);
    hemi.groundColor.set(p.hemi.ground);
    hemi.intensity = p.hemi.intensity * (cel ? 1.25 : 1);
    keyLight.color.set(p.key.color);
    keyLight.intensity = p.key.intensity * (cel ? 0.8 : 1);
    keyLight.position.set(p.key.position[0], p.key.position[1], p.key.position[2]);
    rimLight.color.set(p.rim.color);
    rimLight.intensity = p.rim.intensity * (cel ? 0.95 : 1);
    fillLight.color.set(p.fill.color);
    fillLight.intensity = p.fill.intensity * (cel ? 1.0 : 1);
    renderer.toneMappingExposure = p.exposure * (cel ? 0.9 : 1);
    currentLighting = name;
    return name;
  }

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

  /** 把当前描边参数写进场景里所有材质的 userData.outlineParameters */
  function applyOutlineParams() {
    const base = {
      thickness: outlineParams.thickness,
      color: outlineParams.color,
      alpha: outlineParams.alpha,
      visible: outlineOn,
    };
    const visit = (m, off) => {
      if (!m || !m.userData) return;
      m.userData.outlineParameters = Object.assign({}, m.userData.outlineParameters, base);
      // 关掉描边的两种情况：
      //   off = true   调用方指定（地面大平面、嘴部贴片）
      //   transparent  透明材质（盾牌 alpha≈128、牛奶等）—— 反壳是"实心背面壳"，
      //                对薄片等于糊上一层实色，会把半透明整个盖掉
      if (off || m.transparent === true) m.userData.outlineParameters.visible = false;
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
  function applyConfigPreLoad(c) {
    if (!c) return;
    const m = c.model || {};
    if (m.url) cfg.modelUrl = m.url;
    if (m.mouthAtlas) mouthAtlasUrl = m.mouthAtlas;
  }

  /** 加载后：基准 / 渲染 / 打光 / 背景 / 动作 */
  function applyConfigPostLoad(c) {
    if (!c) return;
    const r = c.renderer || {};
    const l = c.lighting || {};
    const b = c.background || {};
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
    // tight 取景（按真实内容居中）—— 必须在 frameModel 之前生效
    if (r.framing !== undefined) cfg.framing = r.framing === 'tight' ? 'tight' : 'auto';
    if (r.framingReferenceHeight !== undefined) cfg.framingReferenceHeight = Number(r.framingReferenceHeight) || 0;
    if (r.modelHeightPx !== undefined) cfg.modelHeightPx = Number(r.modelHeightPx) || 0;
    if (r.framingOffsetY !== undefined) cfg.framingOffsetY = Number(r.framingOffsetY) || 0;
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
    if (r.shading) applyShading(r.shading);
    if (r.outline !== undefined) outlineOn = !!r.outline;
    if (r.outlineThickness !== undefined) outlineParams.thickness = Number(r.outlineThickness);
    if (r.outlineColor !== undefined) outlineParams.color = r.outlineColor;
    if (r.outlineAlpha !== undefined) outlineParams.alpha = Number(r.outlineAlpha);
    applyOutlineParams();

    // —— 打光 ——
    if (l.preset && LIGHTING_PRESETS[l.preset]) applyLightingPreset(l.preset);
    if (l.exposure !== undefined) renderer.toneMappingExposure = Number(l.exposure);

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
  async function resolveConfig() {
    if (!cfg.configUrl) return cfg.config || null;
    const abs = new URL(cfg.configUrl, document.baseURI).href;
    const res = await fetch(abs, { cache: 'no-cache' });
    if (!res.ok) throw new Error('配置读取失败：' + abs + ' (' + res.status + ')');
    const json = await res.json();
    const base = new URL('.', abs).href;
    const fixUrl = (p) => {
      if (typeof p !== 'string' || !p) return p;
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(p)) return p; // http(s):, data:, blob:, //
      return new URL(p, base).href;
    };
    if (json.model) {
      if (json.model.url) json.model.url = fixUrl(json.model.url);
      if (json.model.mouthAtlas) json.model.mouthAtlas = fixUrl(json.model.mouthAtlas);
    }
    return json;
  }

  /* ---------- 加载模型 ---------- */
  const loader = new GLTFLoader();

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

    const info = await new Promise((resolve, reject) => {
      loader.load(
        cfg.modelUrl,
        (gltf) => {
          modelRoot = gltf.scene;

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
                    console.info(
                      '[material] BLEND 但实为不透明贴图，已按不透明处理：', m.name,
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
          fixMouth();
          applyVisibilityRules();    // 按当前动作先应用一次显隐规则
          hintVisibilityRules();     // 需要规则但没配 → 打一条提示
          applyShading(shadingMode); // 生效当前渲染模式（默认 pbr）
          applyOutlineParams();      // 生效当前描边设置

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
      ' | 图集=' + mouthAtlasUrl +
      ' | 图集已加载=' + !!(mouthTex && mouthTex.image) +
      ' | 嘴部材质=' + (mouthMat && mouthMat.type) +
      ' | 坏纹理=' + (noImg.length ? noImg.join(',') : '无') +
      ' | 包围盒=' + v3(size) +
      ' | 相机=' + v3(camera.position) +
      ' | 注视=' + v3(controls.target) +
      ' | 画布=' + renderer.domElement.width + 'x' + renderer.domElement.height +
      ' | 容器=' + container.clientWidth + 'x' + container.clientHeight +
      ' | 渲染=' + shadingMode +
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
      console.info(
        '[viewer] 首帧中心像素：maxA=' + maxA + ' maxRGB=' + maxRGB +
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
    // 描边开启时走 OutlineEffect（= 正常渲染 + 反壳描边两趟）
    if (outlineOn) getOutlineEffect().render(scene, camera);
    else renderer.render(scene, camera);

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

    /** 渲染模式：'pbr' | 'cel' */
    getShading() {
      return shadingMode;
    },

    getShadingModes() {
      return [
        { key: 'pbr', label: '原始（PBR）' },
        { key: 'cel', label: '卡通（Cel）' },
      ];
    },

    setShading(mode) {
      return applyShading(mode);
    },

    /**
     * 播放动作（等价于全局 play3dmodelaction）：
     *   playAction(['Formation_Pickup']) / playAction('Cafe_Idle') / playAction() 回默认
     */
    playAction(actions) {
      return playAction(actions);
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
      return Object.assign({ on: outlineOn }, outlineParams);
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
    const v = createViewer(el, {}); // 选项全部来自容器 data-* 属性
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
