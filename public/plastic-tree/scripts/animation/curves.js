/* 曲线不规则摆动 · 左/右 (v2 物理版)
   静止：流线随机摆动（正弦叠加，视觉层，不参与物理）
   鼠标划过：指针速度驱动的推力场 + 弹簧回弹（欠阻尼，带弹性过冲）
   点击：冲击波涟漪，环形波前向外传播
   波动沿曲线传播：采样点间 1D 张力耦合（参考 reactbits DotGrid 的网格耦合，改为沿路径）
   实现：fetch 画板版 SVG → 内联 → 等距采样 → 每帧积分并重建 d
   注意：需 http 预览；fetch 失败时保留静态图，不破图。 */
(function () {
  /* ===== 可调参数（画布 2560×1440 坐标系） ===== */
  const SAMPLES      = 72;     // 每条路径采样点数
  const IDLE_AMP     = new URLSearchParams(location.search).get('idle') === '0'
    ? 0 : 9; // 静止摆动幅度 px（?idle=0 可关闭，便于测试）
  // 鼠标推力
  const PROXIMITY    = 220;    // 影响半径 px
  const STRENGTH     = 1.0;    // 推力强度倍率
  // 弹簧回弹（欠阻尼）
  const BOUNCE       = 0.55;   // 0~1，越大回弹越"Q"
  const RETURN_DUR   = 0.9;    // 回弹基准时长 s
  // 沿曲线的张力耦合（波纹沿线传播）
  const TENSION      = 0.35;   // 0=不传播，越大传得越远
  // 点击冲击波
  const SHOCK_RADIUS = 500;    // 波前最大半径 px
  const SHOCK_AMP    = 46;     // 冲击幅度 px
  const SHOCK_SPEED  = 650;    // 波前传播速度 px/s
  const SHOCK_WIDTH  = 70;     // 波前厚度 px
  // 路径生长动画（页面加载即触发）
  const GROW         = new URLSearchParams(location.search).get('grow') !== '0'; // ?grow=0 可关闭
  const TIMING       = window.ANIMATION_TIMING?.curves || {};
  const GROW_DUR     = (TIMING.defaultPathDuration ?? 1600) / 1000; // 单条路径生长时长 s
  const GROW_STAGGER = (TIMING.defaultStagger ?? 120) / 1000;       // 路径间依次延迟 s
  const GROW_EASE    = [0, 0.946, 0.68, 1]; // 生长缓动 cubic-bezier
  const GROW_SEED    = 20261011; // 生长顺序随机种子（改数字换一套顺序）
  // 接入生长/波动引擎的图层（容器 id + 单层配置）
  // wave=false 不参与鼠标流场；idle=false 无静止摆动；ribbon=false 不做丝带化
  // fitTo=[x0,y0,x1,y1] 把图层内容包围盒对齐到画板1的权威画布区域（纠正导出画板留白导致的错位）
  const LAYERS = [
    { id: 'quxian-l' }, // 曲线：波动 + 摆动 + 生长 + 随机粗细丝带化
    { id: 'paixian', wave: false, idle: false, ribbon: false,
      growDur: (TIMING.paixianPathDuration ?? 900) / 1000,
      stagger: (TIMING.paixianStagger ?? 50) / 1000,
      startDelay: TIMING.paixianStartDelay ?? 0,
      startEvent: 'ring:done',
      fitTo: [-223, 858, 2711, 1229] }, // 拓展线段：仅生长，时序更快，对齐画板区域
    { id: 'huandong', ribbon: false }, // 缓动线条（地平线）：生长 + 波动
  ];
  // 随机粗细（描边线 → 沿长度变宽的丝带填充）
  const WIDTH_MIN    = 0.5;    // 单线粗细随机下限（相对原始描边宽）
  const WIDTH_MAX    = 2.23;   // 上限（峰值宽度 ≈ 原始线宽×缩放×此值，当前 ≈ 6.4px）
  const WIDTH_TAPER  = 0.3;    // 两端收细到的比例（0=尖端）
  const WIDTH_TAPER_LEN = 0.14;// 端部收细区间（占路径长比例）

  const pointer = { x: 0, y: 0, vx: 0, vy: 0, time: 0, inside: false };
  const shocks = [];
  const paths = [];

  const smootherstep = (t) => {
    const x = Math.min(1, Math.max(0, t));
    return x * x * x * (x * (x * 6 - 15) + 10);
  };

  // cubic-bezier(x1,y1,x2,y2) 求解器（二分法，对 y 单调曲线稳健）
  function cubicBezier(x1, y1, x2, y2) {
    const poly = (a, b) => (t) => (((1 - 3 * b + 3 * a) * t + (3 * (b - a) - 3 * a)) * t + 3 * a) * t;
    const X = poly(x1, x2), Y = poly(y1, y2);
    return (u) => {
      let lo = 0, hi = 1, t = u;
      for (let i = 0; i < 32; i++) {
        if (Math.abs(X(t) - u) < 1e-5) break;
        if (X(t) < u) lo = t; else hi = t;
        t = (lo + hi) / 2;
      }
      return Y(t);
    };
  }
  const growEase = cubicBezier(...GROW_EASE);

  // 种子随机数（mulberry32）：同一种子每次加载得到同一套随机序列
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  async function inlineSvg(containerId) {
    const box = document.getElementById(containerId);
    const img = box && box.querySelector('img');
    if (!img) return null;
    try {
      let txt = await (await fetch(img.getAttribute('src'))).text();
      // id 命名空间隔离：多个 SVG 内联到同一文档后，渐变/滤镜 id（如 _Linear1）
      // 会互相冲突，url(#...) 永远命中第一个定义，导致描边颜色串层（本 bug 的根因）。
      // 统一给本层所有 id 与内部引用加图层前缀。
      const P = containerId + '--';
      txt = txt
        .replace(/id="([^"]+)"/g, (m, id) => `id="${P}${id}"`)
        .replace(/url\(#([^)]+)\)/g, (m, id) => `url(#${P}${id})`)
        .replace(/href="#([^"]+)"/g, (m, id) => `href="#${P}${id}"`);
      const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
      const svg = doc.querySelector('svg');
      if (!svg) return null;
      svg.setAttribute('width', '100%');
      svg.setAttribute('height', '100%');
      // 剥掉画板底色矩形（Affinity 导出的「画板长宽」标记或铺满 viewBox 的 rect），避免遮住下层
      const vb = svg.viewBox && svg.viewBox.baseVal;
      svg.querySelectorAll('rect').forEach((r) => {
        const w = parseFloat(r.getAttribute('width')), h = parseFloat(r.getAttribute('height'));
        const isArtboard = /画板/.test(r.getAttribute('id') || '');
        const isFull = vb && w >= vb.width * 0.85 && h >= vb.height * 0.9;
        if (isArtboard || isFull) r.remove();
      });
      box.innerHTML = '';
      box.appendChild(document.importNode(svg, true));
      return box.querySelector('svg');
    } catch (e) {
      console.warn('[curves] fetch 失败，保留静态图像：', img.getAttribute('src'), e.message);
      return null;
    }
  }

  // 完整仿射：路径局部坐标 → 画布 2560×1440 坐标
  // getCTM 只覆盖 SVG 内部（含 viewBox 缩放），此处再叠加 svg 元素的 CSS 布局与 stage 缩放，
  // 保证任意容器定位/缩放下，鼠标流场与像素渲染位置严格一致
  function fullMatrix(path, stage) {
    const ctm = path.getCTM();
    if (!ctm) return null;
    const svgEl = path.ownerSVGElement;
    const srect = stage.getBoundingClientRect();
    const vrect = svgEl.getBoundingClientRect();
    const cw = svgEl.clientWidth || vrect.width || 1;
    const ch = svgEl.clientHeight || vrect.height || 1;
    const sx = vrect.width / cw, sy = vrect.height / ch;       // CSS 变换缩放
    const k = 2560 / srect.width;                            // 屏幕 → 画布
    const ox = (vrect.left - srect.left) * k;                // svg 元素在画布中的偏移
    const oy = (vrect.top - srect.top) * k;
    const m = new DOMMatrix()
      .translate(ox, oy)
      .scale(k * sx, k * sy)
      .multiply(ctm);
    return m;
  }

  // 把图层内容包围盒对齐到指定画布区域（fitTo）
  // 注意 viewBox→容器的 meet 缩放会再叠一次，包装变换须先除掉它
  function applyFit(svg, fitTo) {
    if (!fitTo) return;
    const content = svg.querySelector('g') || svg;
    const bb = content.getBBox();
    if (!bb.width || !bb.height) return;
    const vb = svg.viewBox.baseVal;
    const cw = svg.clientWidth || 2560, ch = svg.clientHeight || 1440;
    const s0 = Math.min(cw / vb.width, ch / vb.height);       // meet 缩放
    const vx = (cw - vb.width * s0) / 2 - vb.x * s0;          // meet 偏移
    const vy = (ch - vb.height * s0) / 2 - vb.y * s0;
    const fsx = (fitTo[2] - fitTo[0]) / bb.width;             // 内容→画布目标
    const fsy = (fitTo[3] - fitTo[1]) / bb.height;
    const ftx = fitTo[0] - fsx * bb.x, fty = fitTo[1] - fsy * bb.y;
    // wrapper = M_vb⁻¹ ∘ F
    const wsx = fsx / s0, wsy = fsy / s0;
    const wtx = (ftx - vx) / s0, wty = (fty - vy) / s0;
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', `matrix(${wsx},0,0,${wsy},${wtx},${wty})`);
    [...svg.childNodes].forEach((n) => {
      if (n.nodeName.toLowerCase() !== 'defs') g.appendChild(n); // defs 留原位
    });
    svg.appendChild(g);
  }

  function prepPaths(svg, stage, cfg) {
    svg.querySelectorAll('path').forEach((path) => {
      // 跳过蒙版/裁切路径与 defs 内的路径：它们不直接渲染，
      // 改写会导致裁切区域变形（左右联动、生长填充异味的根因）
      if (path.closest('clipPath') || path.closest('defs')) return;
      const d = path.getAttribute('d');
      if (!d) return;
      const closed = /[Zz]\s*$/.test(d.trim());
      const len = path.getTotalLength();
      const ctm = fullMatrix(path, stage);
      if (!ctm) return;
      const inv = ctm.inverse();
      const n = SAMPLES;
      // 基准点（画布空间）与局部坐标（写回用）
      const base = new Float32Array(n * 2);
      const local = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const s = len * (closed ? i / n : i / (n - 1));
        const p = path.getPointAtLength(s);
        local[i * 2] = p.x; local[i * 2 + 1] = p.y;
        base[i * 2]     = ctm.a * p.x + ctm.c * p.y + ctm.e;
        base[i * 2 + 1] = ctm.b * p.x + ctm.d * p.y + ctm.f;
      }
      // 生长方向：以屏幕更靠下（y 大）的一端为"根"，从根向上生长
      let rootAtEnd = base[(n - 1) * 2 + 1] > base[1];

      // 随机粗细丝带化：开放描边路径 → 变宽填充多边形
      // 宽度剖面 = 原始描边宽 × 单线随机倍率 × 沿线波动 × 端部收细
      const cs = getComputedStyle(path);
      const sw = parseFloat(cs.strokeWidth) || 0;
      let ribbon = cfg.ribbon !== false && !closed && cs.stroke !== 'none' && sw > 0;
      let prof = null;
      const baseArr = base, isClosed = closed;
      if (ribbon && !prof) {
        const scale = Math.sqrt(Math.abs(ctm.a * ctm.d - ctm.b * ctm.c)) || 1; // 局部→画布缩放
        const w0 = sw * scale;
        const rng = mulberry32(GROW_SEED + paths.length * 7919);
        const mul = WIDTH_MIN + rng() * (WIDTH_MAX - WIDTH_MIN);
        const f1 = 1.5 + rng() * 3, f2 = 5 + rng() * 7;
        const p1 = rng() * Math.PI * 2, p2 = rng() * Math.PI * 2;
        prof = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          const s01 = i / (n - 1);
          const wob = 0.45 + 0.55 * Math.abs(
            Math.sin(s01 * Math.PI * f1 + p1) * 0.6 + Math.sin(s01 * Math.PI * f2 + p2) * 0.4);
          const et = Math.min(s01, 1 - s01) / WIDTH_TAPER_LEN;
          const env = WIDTH_TAPER + (1 - WIDTH_TAPER) * Math.min(1, et);
          prof[i] = w0 * mul * wob * env;
        }
        // 描边样式转移到填充（渐变引用同样适用于 fill）
        path.style.fill = cs.stroke;
        if (cs.strokeOpacity !== '1') path.style.fillOpacity = cs.strokeOpacity;
        path.style.stroke = 'none';
      }

      const pathRecord = {
        path, base: baseArr, local, inv, closed: isClosed, len, rootAtEnd, ribbon, prof,
        startEvent: cfg.startEvent || null,
        wave: cfg.wave !== false,              // 是否响应鼠标流场/冲击波
        idleAmp: cfg.idle === false ? 0 : IDLE_AMP, // 静止摆动幅度
        growDur: cfg.growDur || GROW_DUR,      // 单层可覆盖生长时长
        layer: cfg.id,
        phase: Math.random() * Math.PI * 2,
        grow: GROW ? 0 : 1,               // 生长因子 0→1
        growDelay: 0,                     // 稍后种子洗牌分配
        off: new Float32Array(baseArr.length),   // 物理位移
        vel: new Float32Array(baseArr.length),   // 物理速度
      };
      if (GROW) path.setAttribute('d', '');
      paths.push(pathRecord);
    });
  }

  // 生长顺序：每层内部以种子洗牌（Fisher–Yates），层间可有各自的节奏
  function assignGrowOrder() {
    const rng = mulberry32(GROW_SEED);
    for (const cfg of LAYERS) {
      const mine = paths.map((P, i) => P.layer === cfg.id ? i : -1).filter(i => i >= 0);
      for (let i = mine.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        [mine[i], mine[j]] = [mine[j], mine[i]];
      }
      mine.forEach((pi, rank) => {
        paths[pi].growDelay = (cfg.startDelay || 0) / 1000 + rank * (cfg.stagger || GROW_STAGGER);
      });
    }
  }

  let last = 0;
  let growT0 = null; // 生长动画起点（首帧时间）
  const eventStartTimes = new Map();
  function frame(now) {
    const t = now / 1000;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;

    // 弹簧参数（参考 DotGrid：bounce → 阻尼比）
    const zeta = 1 - 0.85 * Math.min(1, Math.max(0, BOUNCE));
    const omega = 4 / (zeta * Math.max(0.2, RETURN_DUR));
    const stiffness = omega * omega;
    const damping = 2 * zeta * omega;

    // 指针推力
    const speed = Math.hypot(pointer.vx, pointer.vy);
    const drive = pointer.inside ? 6500 * Math.tanh(speed / 900) * STRENGTH : 0;
    const dirX = speed > 1 ? pointer.vx / speed : 0;
    const dirY = speed > 1 ? pointer.vy / speed : 0;

    // 活跃冲击波
    const activeShocks = [];
    for (let i = shocks.length - 1; i >= 0; i--) {
      const front = (t - shocks[i].t0) * SHOCK_SPEED;
      if (front > SHOCK_RADIUS + SHOCK_WIDTH * 3) { shocks.splice(i, 1); continue; }
      const power = smootherstep(1 - front / SHOCK_RADIUS);
      activeShocks.push({ x: shocks[i].x, y: shocks[i].y, front, amp: power * SHOCK_AMP });
    }

    for (const P of paths) {
      const n = P.base.length / 2;
      const { base, off, vel } = P;
      const force = frame._force || (frame._force = new Float32Array(n * 2));
      if (force.length < n * 2) frame._force = new Float32Array(n * 2);
      const F = frame._force;

      // 1) 外力：指针推力 + 冲击波
      // 1) 外力：指针推力 + 冲击波（wave:false 的层跳过外力）
      for (let i = 0; i < n; i++) {
        const ix = i * 2;
        const px = base[ix] + off[ix], py = base[ix + 1] + off[ix + 1];
        let ax = 0, ay = 0;
        if (P.wave && drive > 0) {
          const ex = px - pointer.x, ey = py - pointer.y;
          const dist = Math.hypot(ex, ey);
          if (dist < PROXIMITY) {
            const w = smootherstep(1 - dist / PROXIMITY) * drive;
            const nx = dist > 0.001 ? ex / dist : 0;
            const ny = dist > 0.001 ? ey / dist : 0;
            ax += w * (dirX + nx * 0.6);   // 跟随指针方向 + 径向散开
            ay += w * (dirY + ny * 0.6);
          }
        }
        if (P.wave) for (const s of activeShocks) {
          if (s.amp <= 0.01) continue;
          const ex = base[ix] - s.x, ey = base[ix + 1] - s.y;
          const dist = Math.hypot(ex, ey);
          const u = (dist - s.front) / SHOCK_WIDTH;
          if (Math.abs(u) < 3 && dist > 0.001) {
            const push = s.amp * Math.exp(-u * u);
            ax += (ex / dist) * push * stiffness * 0.02;
            ay += (ey / dist) * push * stiffness * 0.02;
            // 波前直接位移（视觉即时性）
            off[ix]     += (ex / dist) * push * dt * 8;
            off[ix + 1] += (ey / dist) * push * dt * 8;
          }
        }
        F[ix] = ax; F[ix + 1] = ay;
      }

      // 2) 积分：弹簧回弹 + 阻尼 + 沿路径张力耦合
      const coupling = TENSION * 900;
      for (let i = 0; i < n; i++) {
        const ix = i * 2;
        let ax = F[ix] - stiffness * off[ix] - damping * vel[ix];
        let ay = F[ix + 1] - stiffness * off[ix + 1] - damping * vel[ix + 1];
        if (coupling > 0) {
          let lx = 0, ly = 0, cnt = 0;
          if (i > 0)     { lx += off[ix - 2]; ly += off[ix - 1]; cnt++; }
          if (i < n - 1) { lx += off[ix + 2]; ly += off[ix + 3]; cnt++; }
          if (cnt) {
            ax += coupling * (lx / cnt - off[ix]);
            ay += coupling * (ly / cnt - off[ix + 1]);
          }
        }
        vel[ix]     += ax * dt;
        vel[ix + 1] += ay * dt;
        off[ix]     += vel[ix] * dt;
        off[ix + 1] += vel[ix + 1] * dt;
      }

      // 3) 写回 d：物理位移（画布空间）→ 加静止摆动 → 逆变换回局部空间
      //    生长因子 g<1 时只写前 g×n 个站点（从根端起）
      //    丝带路径：中心线 ± 法线×宽度剖面 → 变宽填充多边形
      if (growT0 === null) growT0 = t;
      if (GROW && P.grow < 1) {
        const layerT0 = P.startEvent ? eventStartTimes.get(P.startEvent) : growT0;
        if (layerT0 !== undefined) {
          const u = (t - layerT0 - P.growDelay) / P.growDur;
          P.grow = u <= 0 ? 0 : u >= 1 ? 1 : growEase(u);
        }
      }
      const drawN = P.grow >= 1 ? n : Math.max(0, Math.ceil(P.grow * (n - 1)));
      const inv = P.inv;
      if (drawN === 0) { P.path.setAttribute('d', ''); continue; }

      // 先算站点中心与法线（按生长书写顺序 k）
      const C = P._c || (P._c = new Float32Array(n * 2));
      const NV = P._nv || (P._nv = new Float32Array(n * 2));
      for (let k = 0; k < drawN; k++) {
        const i = P.rootAtEnd ? (n - 1 - k) : k;   // 从根端向梢端写
        const ix = i * 2;
        const ib = Math.max(0, i - 1) * 2, if2 = Math.min(n - 1, i + 1) * 2;
        let tx = (base[if2] + off[if2]) - (base[ib] + off[ib]);
        let ty = (base[if2 + 1] + off[if2 + 1]) - (base[ib + 1] + off[ib + 1]);
        const tl = Math.hypot(tx, ty) || 1;
        const nx = -ty / tl, ny = tx / tl;
        const s01 = i / (n - 1);
        const env = P.closed ? 0.6 : Math.sin(Math.PI * s01);
        const idle = (Math.sin(t * 0.9 + P.phase + s01 * 5.0) * 0.6 +
                      Math.sin(t * 0.53 + P.phase * 1.7 + s01 * 11.0) * 0.4) * P.idleAmp * env;
        C[k * 2]     = base[ix] + off[ix] + nx * idle;
        C[k * 2 + 1] = base[ix + 1] + off[ix + 1] + ny * idle;
        NV[k * 2] = nx; NV[k * 2 + 1] = ny;
      }

      let d = '';
      if (P.ribbon) {
        // 左缘（根→梢）
        for (let k = 0; k < drawN; k++) {
          const i = P.rootAtEnd ? (n - 1 - k) : k;
          const hw = P.prof[i] * 0.5;
          const fx = C[k * 2] + NV[k * 2] * hw, fy = C[k * 2 + 1] + NV[k * 2 + 1] * hw;
          d += (k === 0 ? 'M' : 'L')
             + (inv.a * fx + inv.c * fy + inv.e).toFixed(2) + ','
             + (inv.b * fx + inv.d * fy + inv.f).toFixed(2);
        }
        // 右缘（梢→根），闭合为丝带
        for (let k = drawN - 1; k >= 0; k--) {
          const i = P.rootAtEnd ? (n - 1 - k) : k;
          const hw = P.prof[i] * 0.5;
          const fx = C[k * 2] - NV[k * 2] * hw, fy = C[k * 2 + 1] - NV[k * 2 + 1] * hw;
          d += 'L'
             + (inv.a * fx + inv.c * fy + inv.e).toFixed(2) + ','
             + (inv.b * fx + inv.d * fy + inv.f).toFixed(2);
        }
        d += 'Z';
      } else {
        for (let k = 0; k < drawN; k++) {
          const fx = C[k * 2], fy = C[k * 2 + 1];
          d += (k === 0 ? 'M' : 'L')
             + (inv.a * fx + inv.c * fy + inv.e).toFixed(2) + ','
             + (inv.b * fx + inv.d * fy + inv.f).toFixed(2);
        }
        if (P.closed && P.grow >= 1) d += 'Z';   // 生长完成后再封口
      }
      P.path.setAttribute('d', d);
    }

    // 生长全部完成：派发一次性事件（供颜色淡化滤镜等后续动画簇等待）
    if (!frame._grownFired && paths.length && paths.every((P) => P.grow >= 1)) {
      frame._grownFired = true;
      window.dispatchEvent(new Event('curves:grown'));
    }

    // 指针速度自然衰减（DotGrid 同款）
    const decay = 1 - Math.exp(-dt / 0.08);
    pointer.vx -= pointer.vx * decay;
    pointer.vy -= pointer.vy * decay;

    requestAnimationFrame(frame);
  }

  window.addEventListener('DOMContentLoaded', async () => {
    const stage = document.getElementById('stage');
    const toCanvas = (e) => {
      const r = stage.getBoundingClientRect();
      const k = 2560 / r.width;
      return [(e.clientX - r.left) * k, (e.clientY - r.top) * k];
    };
    window.addEventListener('pointermove', (e) => {
      const [x, y] = toCanvas(e);
      const inside = x >= 0 && y >= 0 && x <= 2560 && y <= 1440;
      const time = e.timeStamp || performance.now();
      if (inside && pointer.inside && pointer.time) {
        const elapsed = Math.max(4, time - pointer.time) / 1000;
        pointer.vx += ((x - pointer.x) / elapsed - pointer.vx) * 0.6;
        pointer.vy += ((y - pointer.y) / elapsed - pointer.vy) * 0.6;
      } else { pointer.vx = 0; pointer.vy = 0; }
      pointer.x = x; pointer.y = y; pointer.time = time;
      pointer.inside = inside;
    }, { passive: true });
    window.addEventListener('pointerdown', (e) => {
      const [x, y] = toCanvas(e);
      if (x < 0 || y < 0 || x > 2560 || y > 1440) return;
      shocks.push({ x, y, t0: performance.now() / 1000 });
      if (shocks.length > 6) shocks.shift();
    }, { passive: true });
    window.addEventListener('mouseleave', () => { pointer.inside = false; pointer.time = 0; });

    // 按 LAYERS 配置逐层内联并挂载
    const svgs = await Promise.all(LAYERS.map((c) => inlineSvg(c.id)));
    svgs.forEach((svg, i) => {
      if (!svg) return;
      applyFit(svg, LAYERS[i].fitTo);   // 先对齐画布区域，再采样
      prepPaths(svg, stage, LAYERS[i]);
    });
    assignGrowOrder();
    // 与四个按钮淡入共用 ring:done，保证按钮动画与覆盖线段在同一事件帧启动。
    for (const eventName of new Set(paths.map(path => path.startEvent).filter(Boolean))) {
      window.addEventListener(eventName, () => {
        if (!eventStartTimes.has(eventName)) eventStartTimes.set(eventName, performance.now() / 1000);
      });
    }
    window.addEventListener('animations:replay', () => {
      growT0 = null;
      eventStartTimes.clear();
      last = 0;
      frame._grownFired = false;
      shocks.length = 0;
      for (const path of paths) {
        path.grow = GROW ? 0 : 1;
        path.off.fill(0);
        path.vel.fill(0);
        path.path.setAttribute('d', '');
      }
      // 曲线动画循环持续运行；下一帧会从新的 growT0 重新绘制。
    });
    window.whenAppReady(() => { if (paths.length) requestAnimationFrame(frame); });
  });
})();
