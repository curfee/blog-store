/* 按钮三状态交互 v2（2026-10-11）
   - 档案库（旋钮型）：default 旋钮+47°/渐变光右移60px/装饰组隐藏/确认框隐藏
     → hover 旋钮回正100ms + 渐变光归位170ms + 装饰组生长200ms(描边21.7) + 确认框6矩形200ms内逐个显现
     → clicked 渐变光再左移10px
   - 预探神迹（滑块型）：default 渐变光缩放0 + 移动块逆向45°移7px + 侧边半圆右移7px
     + 生长曲线/动画路径/装饰组/确认框隐藏
     → hover 生长曲线300ms(cubic-bezier(0,0.481,0.68,0.996)) + 方块回位100ms
     + 侧板边缘回位120ms + 装饰组200ms + 动画路径320ms + 渐变光恢复170ms + 确认框逐个显现
     → clicked 渐变光再向外缩放14%
   - 截获记录（链接线条型，2026-10-11 新版全矢量 SVG）：default 渐变块左移40px/数据源菱形#000000
     /链接线条已生长/装饰组·箭头·曲线/确认框_左隐藏
     → hover 链接线条反向退回未生长80ms + 数据源变#E1FF00 120ms + 装饰组200ms(主线描边21.7)
     + 箭头260ms + 曲线200ms + 渐变块恢复130ms + 确认框_左逐个显现
     → clicked 渐变块再右移10px
   - 人员补充（双箭头+渐变圆型，2026-10-11 末钮；无烘焙矩阵直用 CSS 变换）：default 箭头上移50px
     /箭头下移60px/渐变圆1·2缩放0/装饰组隐藏/确认框_左隐藏
     → hover 箭头还原100ms + 装饰组200ms(主线描边21.7) + 渐变圆还原400ms + 确认框_左逐个显现
     → clicked 渐变圆再向外缩放14%
   实现要点：
   - 独立版 SVG 内联替代画板版 img（画板版缺渐变光层且含位图），id 加前缀防冲突
   - 上级全是烘焙矩阵（非均匀缩放+Y翻转）→ 包装层 g.fx + 矩阵补偿
   - 位移 W = M⁻¹·T(dx,dy)·M；缩放 W = M⁻¹·T(C)·S(k)·T(-C)·M；旋转同理（rAF 逐帧）
   - 包装层显式 transform-origin: 0 0（SVG transform 会被当 CSS 变换套默认 origin）
   - rect 量测含 #stage fit 缩放、getCTM 不含 → 除 fitK 归一化
   - 悬停判定用画布坐标（.el 容器是全画布的，不能用 CSS :hover），与 fx.js 磁吸共存 */
(function () {
  const NS = 'http://www.w3.org/2000/svg';

  /* ===== 配置 ===== */
  const FRAME = {   // 确认框（hover 框，两按钮共用素材，各自克隆）
    src: 'icon/确认框.svg', showDur: 200,   // 6 矩形在此窗口内逐个显现
    scale: 1.14, dx: 0, dy: 0,              // 相对按钮框的缩放/偏移微调（2026-10-11 用户定 1.14）
  };
  const CFG_KNOB = {   // 档案库
    hostId: 'label-dangan', prefix: 'da--', src: 'icon/bottom_档案库.svg',
    left: 2032, top: 966.8, width: 364.4,        // 画板版包围盒 [2032,915]-[2396.4,1126.5] 宽对齐纵向居中
    rotDeg: 47, rotDur: 100, rotEase: 'cubic-bezier(0.942, 0.001, 0.21, 1)',
    growDur: 200, growEase: 'ease-out', strokeW: 21.7,
    glowDur: 170, glowBase: 60, glowClick: 10,
    frame: true,
  };
  const CFG_SLIDE = {  // 预探神迹
    hostId: 'label-yutan', prefix: 'yt--', src: 'icon/bottom_预探神迹.svg',
    // 两个独立版 SVG 底板同尺寸（占 viewBox 宽 98.23%），故与档案库同宽 364.4 对齐；
    // 画板包围盒 392.8 含向右伸出的生长曲线，不能直接拿来对齐（会放大 7.8%）
    left: 1777, top: 623.4, width: 364.4,          // 画板版内容包围盒 [1777,571]-[2169.8,783.6] 内纵向居中（H=107.9）
    strokeW: 21.7,
    blockOff: 7, semiOff: 7,                       // default 位移（45° 模长 / 纯右移）
    curveDur: 300, curveEase: 'cubic-bezier(0, 0.481, 0.68, 0.996)',
    blockDur: 100, semiDur: 120, decoDur: 200, pathDur: 320,
    glowDur: 170, glowClick: 1.14,
    dirs: { '移动块左上': [-1, -1], '移动块左下': [-1, 1], '移动块右上': [1, -1], '移动块右下': [1, 1] },
    frame: true,
  };
  const CFG_CAPTURE = {  // 截获记录（2026-10-11 新版 SVG：全矢量独立图层）
    hostId: 'label-jiehuo', prefix: 'jh--', src: 'icon/bottom_截获记录.svg',
    // 画板版内容包围盒 [334,624.2]-[742,762.4] 宽 408 系外伸件撑大，同前两钮按 364.4 对齐、纵向居中
    left: 334, top: 639.4, width: 364.4,
    strokeW: 21.7,
    colorDef: '#000000', colorHov: '#E1FF00', colorDur: 120,   // 数据源菱形 default 黑 → hover 荧光黄
    linkDur: 80,                                               // 链接线条 hover 反向退回未生长
    decoDur: 200, arrowDur: 260, curveDur: 200,
    gradDur: 130, gradOff: 40, gradClick: 10,                  // 渐变块 default 左移40 / clicked 再右移10（2026-10-11 用户两度下调 40→20→10）
    frame: true, frameSrc: 'icon/确认框_左.svg',               // 截获记录用左版确认框
  };
  const CFG_PEOPLE = {  // 人员补充（无烘焙矩阵、无位图，方向即屏幕方向）
    hostId: 'label-renyuan', prefix: 'ry--', src: 'icon/bottom_人员补充.svg',
    // 画板版内容包围盒 [155.6,907]-[616,1172] 宽高均含外伸件，按 364.4 对齐、纵向居中
    left: 155.6, top: 985.6, width: 364.4,
    strokeW: 21.7,
    arrowUp: 50, arrowDown: 60, arrowDur: 100,                 // default 双箭头分离 / hover 还原
    decoDur: 200,
    circDur: 400, circClick: 1.14,                             // 渐变圆1·2 default 缩放0 → hover 还原400ms → clicked 外扩14%
    frame: true, frameSrc: 'icon/确认框_左.svg',
  };

  /* ===== 音效（hover/clicked，2026-10-12） =====
     素材：sound_effect/hover_snd.wav、clicked_snd.wav（四按钮共用一对）。
     hover 音在非手势的 pointermove 里触发，浏览器自动播放策略下需页面有过
     首次交互（sticky activation）后才出得了声；首次交互前的 hover 音静默丢弃
     （clicked 音在 pointerdown 手势内，永远可播）。play() 用克隆节点支持重叠。 */
  const SFX = {
    hover: 'sound_effect/hover_snd.wav',
    clicked: 'sound_effect/clicked_snd.wav',
    volume: 0.6,
  };
  const sfxCache = {};
  function playSfx(kind) {
    const url = SFX[kind];
    if (!url) return;
    let a = sfxCache[url];
    if (!a) { a = sfxCache[url] = new Audio(url); a.preload = 'auto'; }
    const inst = a.paused ? a : a.cloneNode();
    inst.volume = SFX.volume;
    inst.play().catch(() => {});   // 自动播放策略拒绝时静默（见上注释）
  }

  /* ===== 工具 ===== */
  const domM = (m) => new DOMMatrix([m.a, m.b, m.c, m.d, m.e, m.f]);
  async function inlineSVG(cfg) {
    const host = document.getElementById(cfg.hostId);
    if (!host) return null;
    let txt = await (await fetch(cfg.src)).text();
    const pf = cfg.prefix;
    txt = txt.replace(/id="([^"]+)"/g, (m, id) => `id="${pf}${id}"`)
             .replace(/url\(#([^)]+)\)/g, (m, id) => `url(#${pf}${id})`)
             .replace(/href="#([^"]+)"/g, (m, id) => `href="#${pf}${id}"`);
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
    const svg = document.importNode(doc.querySelector('svg'), true);
    const H = cfg.width * 106 / 358;
    svg.style.cssText = `position:absolute;left:${cfg.left}px;top:${cfg.top}px;` +
                        `width:${cfg.width}px;height:${H}px;overflow:visible;display:block;`;
    host.querySelector('img')?.remove();
    host.appendChild(svg);
    host.style.pointerEvents = 'auto';
    return { host, svg, H };
  }
  /* 确认框（hover 框）：盖在按钮上的角框，default 全隐藏，hover 矩形逐个显现 */
  function attachFrame(cfg, ctx, frameTxt) {
    if (!cfg.frame || !frameTxt) return null;
    const pf = `${cfg.prefix}cf--`;
    const txt = frameTxt.replace(/id="([^"]+)"/g, (m, id) => `id="${pf}${id}"`)
             .replace(/url\(#([^)]+)\)/g, (m, id) => `url(#${pf}${id})`)
             .replace(/href="#([^"]+)"/g, (m, id) => `href="#${pf}${id}"`);
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
    const fsvg = document.importNode(doc.querySelector('svg'), true);
    const FW = cfg.width * FRAME.scale, FH = FW * 143 / 389;   // 默认与按钮同宽、居中
    const L = cfg.left + (cfg.width - FW) / 2 + FRAME.dx;
    const T = cfg.top + (ctx.H - FH) / 2 + FRAME.dy;
    fsvg.style.cssText = `position:absolute;left:${L}px;top:${T}px;` +
                         `width:${FW}px;height:${FH}px;overflow:visible;display:block;pointer-events:none;`;
    const rects = [...fsvg.querySelectorAll('rect')];
    rects.forEach((el) => { el.style.opacity = 0; });
    ctx.host.appendChild(fsvg);
    return rects;
  }
  function setFrame(rects, show, instant) {   // 逐个显现：矩形 i 延迟 i*showDur/n
    if (!rects) return;
    const n = rects.length;
    rects.forEach((el, i) => {
      el.style.transition = instant ? 'none' :
        (show ? `opacity 50ms linear ${Math.round(i * FRAME.showDur / n)}ms` : 'opacity 80ms linear 0ms');
      el.style.opacity = show ? 1 : 0;
    });
  }
  function wrapFX(svg, prefix, id) {          // 烘焙矩阵下的动画包装层
    const el = svg.querySelector(`#${prefix}${id}`);
    if (!el) return null;
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'fx');
    el.parentNode.replaceChild(g, el);
    g.appendChild(el);
    g.style.transformOrigin = '0 0';
    return { g, el, M: domM(g.getCTM()) };
  }
  function translateMat(p, dx, dy) {          // 屏幕空间位移 → 局部补偿矩阵
    const W = p.Minv.multiply(new DOMMatrix().translate(dx, dy)).multiply(p.M);
    return `matrix(${W.a},${W.b},${W.c},${W.d},${W.e},${W.f})`;
  }
  function fitK() {                           // #stage fit 缩放（rect 量测归一化用）
    return document.getElementById('stage').getBoundingClientRect().width / 2560;
  }
  function centerInCTM(el, svg) {             // 渲染中心 → svg 视口坐标（除 fitK）
    const er = el.getBoundingClientRect(), sr = svg.getBoundingClientRect();
    const k = fitK();
    return { x: (er.left + er.width / 2 - sr.left) / k, y: (er.top + er.height / 2 - sr.top) / k };
  }
  function bez(x1, y1, x2, y2) {              // cubic-bezier 求解（二分）
    const poly = (a, b) => (t) => (((1 - 3 * b + 3 * a) * t + (3 * (b - a) - 3 * a)) * t + 3 * a) * t;
    const bx = poly(x1, x2), by = poly(y1, y2);
    return (x) => {
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 20; i++) { t = (lo + hi) / 2; (bx(t) < x) ? lo = t : hi = t; }
      return by(t);
    };
  }
  const parseBezier = (str) => {
    const m = str.match(/cubic-bezier\(([^)]+)\)/);
    return m ? bez(...m[1].split(',').map(Number)) : null;
  };
  function bindHover(host, inBtn, applyState) { // 画布坐标悬停判定（同 fx.js 磁吸原因）
    let hovered = false, pressed = false;
    window.addEventListener('pointermove', (e) => {
      const h = inBtn(e.clientX, e.clientY);
      if (h !== hovered) {
        hovered = h;
        applyState(h ? (pressed ? 'clicked' : 'hover') : 'default');
        if (h && !pressed) playSfx('hover');      // 进入 hover 播 hover 音（clicked→hover 不重复播）
        document.body.style.cursor = h ? 'pointer' : '';   // 悬停手型（画布坐标判定，无 CSS :hover）
      }
    }, { passive: true });
    window.addEventListener('pointerdown', (e) => {
      if (hovered && inBtn(e.clientX, e.clientY)) { pressed = true; applyState('clicked'); playSfx('clicked'); }
    });
    window.addEventListener('pointerup', () => {
      if (pressed) { pressed = false; applyState(hovered ? 'hover' : 'default'); }
    });
  }

  /* ===== 档案库：旋钮型 ===== */
  async function initKnob(cfg, frameTxt) {
    const ctx = await inlineSVG(cfg);
    if (!ctx) return;
    const frameRects = attachFrame(cfg, ctx, frameTxt);
    const { svg, H } = ctx;
    const knobP = wrapFX(svg, cfg.prefix, '动画旋钮');
    const glowP = wrapFX(svg, cfg.prefix, '渐变光');
    const deco = svg.querySelector(`#${cfg.prefix}下方装饰组`);
    const decoPaths = [...deco.querySelectorAll('path')].map((el, i) => {
      el.style.strokeWidth = cfg.strokeW + 'px';
      const len = el.getTotalLength();
      el.style.strokeDasharray = len;
      el.style.strokeDashoffset = len;
      return { el, len, i };
    });
    const rot = { deg: 0, Minv: knobP.M.inverse(), C: centerInCTM(knobP.el, svg), raf: 0 };
    function applyRot(deg) {
      rot.deg = deg;
      const S = new DOMMatrix().translate(rot.C.x, rot.C.y).rotate(deg).translate(-rot.C.x, -rot.C.y);
      const W = rot.Minv.multiply(S).multiply(knobP.M);
      knobP.g.setAttribute('transform', `matrix(${W.a},${W.b},${W.c},${W.d},${W.e},${W.f})`);
    }
    function tweenRot(toDeg, dur, instant) {
      cancelAnimationFrame(rot.raf);
      if (instant || dur <= 0) { applyRot(toDeg); return; }
      const from = rot.deg, ease = parseBezier(cfg.rotEase) || ((u) => u);
      const t0 = performance.now();
      const step = (now) => {
        const u = Math.min(1, (now - t0) / dur);
        applyRot(from + (toDeg - from) * ease(u));
        if (u < 1) rot.raf = requestAnimationFrame(step);
      };
      rot.raf = requestAnimationFrame(step);
    }
    function applyState(s, instant) {
      tweenRot(s === 'default' ? cfg.rotDeg : 0, instant ? 0 : cfg.rotDur, instant);
      const gx = s === 'default' ? cfg.glowBase : s === 'hover' ? 0 : -cfg.glowClick;
      glowP.g.style.transition = instant ? 'none' : `transform ${cfg.glowDur}ms ease-out`;
      glowP.g.style.transform = `translateX(${gx}px)`;
      const show = s !== 'default';
      decoPaths.forEach(({ el, len, i }) => {
        el.style.transition = instant ? 'none' :
          `stroke-dashoffset ${cfg.growDur}ms ${cfg.growEase} ${i * 30}ms`;
        el.style.strokeDashoffset = show ? 0 : len;
      });
      setFrame(frameRects, show, instant);
    }
    applyState('default', true);
    const stage = document.getElementById('stage');
    bindHover(ctx.host, (cx, cy) => {
      const r = stage.getBoundingClientRect(), k = 2560 / r.width;
      const x = (cx - r.left) * k, y = (cy - r.top) * k;
      return x >= cfg.left && x <= cfg.left + cfg.width && y >= cfg.top && y <= cfg.top + H;
    }, applyState);
  }

  /* ===== 预探神迹：滑块型 ===== */
  async function initSlide(cfg, frameTxt) {
    const ctx = await inlineSVG(cfg);
    if (!ctx) return;
    const frameRects = attachFrame(cfg, ctx, frameTxt);
    const { svg, H } = ctx;
    const wrap = (id) => {
      const p = wrapFX(svg, cfg.prefix, id);
      if (p) p.Minv = p.M.inverse();
      return p;
    };
    const glowP = wrap('渐变光');
    const semiP = wrap('侧边半圆');
    const blockPs = {};
    for (const id in cfg.dirs) blockPs[id] = wrap(id);
    const dashEls = [];
    const prepDash = (id, kind) => {
      const g = svg.querySelector(`#${cfg.prefix}${id}`);
      if (!g) return;
      [...g.querySelectorAll('path')].forEach((el) => {
        if (kind === 'deco') el.style.strokeWidth = cfg.strokeW + 'px';
        const len = el.getTotalLength();
        el.style.strokeDasharray = len;
        el.style.strokeDashoffset = len;      // len→0 生长
        dashEls.push({ el, len, kind });
      });
    };
    prepDash('下方装饰组', 'deco');
    prepDash('生长曲线左', 'curve');
    prepDash('生长曲线右', 'curve');
    prepDash('动画路径', 'path');
    const C = centerInCTM(glowP.el, svg);     // 渐变光缩放中心
    const glow = { k: 1, raf: 0 };
    function applyGlow(k) {
      glow.k = k;
      const S = new DOMMatrix().translate(C.x, C.y).scale(k).translate(-C.x, -C.y);
      const W = glowP.Minv.multiply(S).multiply(glowP.M);
      glowP.g.setAttribute('transform', `matrix(${W.a},${W.b},${W.c},${W.d},${W.e},${W.f})`);
    }
    function tweenGlow(to, dur) {
      cancelAnimationFrame(glow.raf);
      if (dur <= 0) { applyGlow(to); return; }
      const from = glow.k, t0 = performance.now();
      const step = (now) => {
        const u = Math.min(1, (now - t0) / dur);
        applyGlow(from + (to - from) * (1 - Math.pow(1 - u, 2)));
        if (u < 1) glow.raf = requestAnimationFrame(step);
      };
      glow.raf = requestAnimationFrame(step);
    }
    function applyState(s, instant) {
      // 渐变光：default 0 / hover 1 / clicked 1.14
      tweenGlow(s === 'default' ? 0 : s === 'hover' ? 1 : cfg.glowClick, instant ? 0 : cfg.glowDur);
      // 移动块：default 逆向 45° blockOff；hover 回位
      const d = cfg.blockOff * Math.SQRT1_2;
      for (const id in blockPs) {
        const p = blockPs[id];
        p.g.style.transition = instant ? 'none' : `transform ${cfg.blockDur}ms ease-out`;
        p.g.style.transform = s === 'default' ? translateMat(p, -cfg.dirs[id][0] * d, -cfg.dirs[id][1] * d) : '';
      }
      // 侧边半圆：default 右移 semiOff；hover 回位
      semiP.g.style.transition = instant ? 'none' : `transform ${cfg.semiDur}ms ease-out`;
      semiP.g.style.transform = s === 'default' ? translateMat(semiP, cfg.semiOff, 0) : '';
      // 描边生长
      const show = s !== 'default';
      for (const { el, len, kind } of dashEls) {
        let dur, ease;
        if (kind === 'deco') { dur = cfg.decoDur; ease = 'ease-out'; }
        else if (kind === 'curve') { dur = cfg.curveDur; ease = cfg.curveEase; }
        else { dur = cfg.pathDur; ease = 'ease-out'; }
        el.style.transition = instant ? 'none' : `stroke-dashoffset ${dur}ms ${ease}`;
        el.style.strokeDashoffset = show ? 0 : len;
      }
      setFrame(frameRects, show, instant);
    }
    applyState('default', true);
    const stage = document.getElementById('stage');
    bindHover(ctx.host, (cx, cy) => {
      const r = stage.getBoundingClientRect(), k = 2560 / r.width;
      const x = (cx - r.left) * k, y = (cy - r.top) * k;
      return x >= cfg.left && x <= cfg.left + cfg.width && y >= cfg.top && y <= cfg.top + H;
    }, applyState);
  }

  /* ===== 截获记录：链接线条型 ===== */
  async function initCapture(cfg, frameTxt) {
    const ctx = await inlineSVG(cfg);
    if (!ctx) return;
    const frameRects = attachFrame(cfg, ctx, frameTxt);
    const { svg, H } = ctx;
    const wrap = (id) => {
      const p = wrapFX(svg, cfg.prefix, id);
      if (p) p.Minv = p.M.inverse();
      return p;
    };
    const gradP = wrap('渐变块');
    const dataEl = svg.querySelector(`#${cfg.prefix}截获数据源B2B2B2--E1FF00`);
    const dashEls = [];
    const prepDash = (id, kind) => {
      const g = svg.querySelector(`#${cfg.prefix}${id}`);
      if (!g) return;
      // 新版 SVG 中箭头/曲线/链接线条本身即是 path（无外层组）
      const paths = g.tagName.toLowerCase() === 'path' ? [g] : [...g.querySelectorAll('path')];
      paths.forEach((el) => {
        if (kind === 'deco') {   // 装饰组仅主线统一描边（≥20 的 22.5/21.74），装饰细线保留
          const m = el.getAttribute('style').match(/stroke-width:([\d.]+)px/);
          if (m && +m[1] >= 20) el.style.strokeWidth = cfg.strokeW + 'px';
        }
        const len = el.getTotalLength();
        el.style.strokeDasharray = len;
        el.style.strokeDashoffset = kind === 'link' ? 0 : len;
        dashEls.push({ el, len, kind });
      });
    };
    prepDash('下方装饰组', 'deco');
    prepDash('截获箭头', 'arrow');
    prepDash('截获曲线', 'curve');
    prepDash('链接线条', 'link');
    function applyState(s, instant) {
      // 渐变块：default 左移 gradOff；hover 恢复；clicked 再右移 gradClick
      const gx = s === 'default' ? -cfg.gradOff : s === 'hover' ? 0 : cfg.gradClick;
      gradP.g.style.transition = instant ? 'none' : `transform ${cfg.gradDur}ms ease-out`;
      gradP.g.style.transform = gx ? translateMat(gradP, gx, 0) : '';
      // 数据源菱形：default 黑；hover/clicked 荧光黄
      dataEl.style.transition = instant ? 'none' : `fill ${cfg.colorDur}ms ease-out`;
      dataEl.style.fill = s === 'default' ? cfg.colorDef : cfg.colorHov;
      // 描边生长：链接线条 default 已生长、hover 反向退回 -len；其余 default 隐藏、hover 生长
      const show = s !== 'default';
      for (const { el, len, kind } of dashEls) {
        const dur = kind === 'link' ? cfg.linkDur : kind === 'deco' ? cfg.decoDur :
                    kind === 'arrow' ? cfg.arrowDur : cfg.curveDur;
        el.style.transition = instant ? 'none' : `stroke-dashoffset ${dur}ms ease-out`;
        el.style.strokeDashoffset = kind === 'link' ? (show ? -len : 0) : (show ? 0 : len);
      }
      setFrame(frameRects, show, instant);
    }
    applyState('default', true);
    const stage = document.getElementById('stage');
    bindHover(ctx.host, (cx, cy) => {
      const r = stage.getBoundingClientRect(), k = 2560 / r.width;
      const x = (cx - r.left) * k, y = (cy - r.top) * k;
      return x >= cfg.left && x <= cfg.left + cfg.width && y >= cfg.top && y <= cfg.top + H;
    }, applyState);
  }

  /* ===== 人员补充：双箭头 + 渐变圆型（无烘焙矩阵，直接 CSS 变换） ===== */
  async function initPeople(cfg, frameTxt) {
    const ctx = await inlineSVG(cfg);
    if (!ctx) return;
    const frameRects = attachFrame(cfg, ctx, frameTxt);
    const { svg, H } = ctx;
    const wrap = (id) => wrapFX(svg, cfg.prefix, id);   // 无矩阵，Minv 用不上
    const arrowUpP = wrap('箭头上');
    const arrowDownP = wrap('箭头下');
    const circlePs = [wrap('渐变圆1'), wrap('渐变圆2')].map((p) => {
      p.c = { x: +p.el.getAttribute('cx'), y: +p.el.getAttribute('cy') };  // 圆心（视口坐标）
      return p;
    });
    const dashEls = [];
    const deco = svg.querySelector(`#${cfg.prefix}下方装饰组`);
    [...deco.querySelectorAll('path')].forEach((el) => {
      const m = el.getAttribute('style').match(/stroke-width:([\d.]+)px/);
      if (m && +m[1] >= 20) el.style.strokeWidth = cfg.strokeW + 'px';
      const len = el.getTotalLength();
      el.style.strokeDasharray = len;
      el.style.strokeDashoffset = len;
      dashEls.push({ el, len });
    });
    const scaleMat = (c, k) => `matrix(${k},0,0,${k},${c.x * (1 - k)},${c.y * (1 - k)})`;
    function applyState(s, instant) {
      // 箭头：default 上/下分离；hover/clicked 还原 100ms
      arrowUpP.g.style.transition = instant ? 'none' : `transform ${cfg.arrowDur}ms ease-out`;
      arrowUpP.g.style.transform = s === 'default' ? `translate(0,${-cfg.arrowUp}px)` : '';
      arrowDownP.g.style.transition = instant ? 'none' : `transform ${cfg.arrowDur}ms ease-out`;
      arrowDownP.g.style.transform = s === 'default' ? `translate(0,${cfg.arrowDown}px)` : '';
      // 渐变圆：default 缩放0；hover 还原；clicked 再外扩 14%
      const k = s === 'default' ? 0 : s === 'hover' ? 1 : cfg.circClick;
      for (const p of circlePs) {
        p.g.style.transition = instant ? 'none' : `transform ${cfg.circDur}ms ease-out`;
        p.g.style.transform = k === 1 ? '' : scaleMat(p.c, k);
      }
      // 装饰组生长 200ms
      const show = s !== 'default';
      for (const { el, len } of dashEls) {
        el.style.transition = instant ? 'none' : `stroke-dashoffset ${cfg.decoDur}ms ease-out`;
        el.style.strokeDashoffset = show ? 0 : len;
      }
      setFrame(frameRects, show, instant);
    }
    applyState('default', true);
    const stage = document.getElementById('stage');
    bindHover(ctx.host, (cx, cy) => {
      const r = stage.getBoundingClientRect(), k = 2560 / r.width;
      const x = (cx - r.left) * k, y = (cy - r.top) * k;
      return x >= cfg.left && x <= cfg.left + cfg.width && y >= cfg.top && y <= cfg.top + H;
    }, applyState);
  }

  window.addEventListener('DOMContentLoaded', async () => {
    let frameTxt = null, frameLeftTxt = null;
    try { frameTxt = await (await fetch(FRAME.src)).text(); }
    catch (e) { console.warn('[button_fx] 确认框加载失败，跳过 hover 框：', e.message); }
    try { frameLeftTxt = await (await fetch(CFG_CAPTURE.frameSrc)).text(); }
    catch (e) { console.warn('[button_fx] 确认框_左加载失败，跳过截获记录 hover 框：', e.message); }
    initKnob(CFG_KNOB, frameTxt);
    initSlide(CFG_SLIDE, frameTxt);
    initCapture(CFG_CAPTURE, frameLeftTxt);
    initPeople(CFG_PEOPLE, frameLeftTxt);
  });
})();
