/* 向上线条路径生长 + 树内动画圆入场（2026-10-12）
   素材：icon/_画板版_向上线条.svg（12 条描边 path，无渐变；路径全部"起点在上、终点在下"）。
   流程（用户指定）：
   1. 树状主体开始生长（tree:grow:start，tree_fx.js 派发；兜底 FALLBACK）时同步开播
   2. 12 条 path 一起齐生长（无错峰），dashoffset 法，700ms，
      缓动 cubic-bezier(0, 0.824, 0.68, 0.996)
      ——生长方向默认"从根部(下)向梢(上)"：路径作者方向是"上→下"，故用
        offset len→2·len 的反向揭示（growFromBase=true）；改 false 即从上往下画
   3. 生长结束后树内动画圆（#ring 容器）从"向下 20px + 透明度 0"归位：
      translateY(20px)→0 + opacity 0→1，300ms，
      缓动 cubic-bezier(0.537, 0.003, 0.063, 1.004)（y2=1.004 带轻微过冲回弹）
   圆环不动 SVG 内部，只动画 #ring .el 容器（普通全画布层，transform/opacity 空闲）。
   初始状态在本文件求值时同步设置（脚本在 body 尾部，先于首帧渲染，无闪显）。 */
(function () {
  /* ==================== 用户自助调整区（改完刷新即生效） ==================== */
  const TIMING = window.ANIMATION_TIMING?.upFx || {};
  const CFG = {
    startDelay: TIMING.startDelay ?? 0,             // tree:grow:start 后的额外延迟
    growDur: TIMING.growDuration ?? 700,            // 线条一齐生长时长 ms
    growEase: [0, 0.824, 0.68, 0.996],    // 生长缓动
    growFromBase: true,                   // true=从根部向上长（反向揭示）；false=从上往下画
    ringDur: TIMING.ringDuration ?? 1200,           // 圆环归位时长 ms
    ringEase: [0.537, 0.003, 0.063, 1.004], // 归位缓动（轻微过冲）
    ringDown: 10,                         // 圆环起始下移量 px
    fallback: TIMING.fallback ?? 11000,             // 等待树生长事件的兜底时长
  };
  /* ======================================================================== */
  const SRC = 'icon/_画板版_向上线条.svg';
  const PREFIX = 'up--';

  /* cubic-bezier 求解（二分，同 start_fx/tree_fx） */
  const poly = (a, b) => (t) => (((1 - 3 * b + 3 * a) * t + (3 * (b - a) - 3 * a)) * t + 3 * a) * t;
  const mkEase = (p) => {
    const bx = poly(p[0], p[2]), by = poly(p[1], p[3]);
    return (x) => {
      let lo = 0, hi = 1, t = x;
      for (let i = 0; i < 20; i++) { t = (lo + hi) / 2; (bx(t) < x) ? lo = t : hi = t; }
      return by(t);
    };
  };

  /* ---- 圆环初始状态：同步设置（先于首帧，无闪显） ---- */
  const ring = document.getElementById('ring');
  if (ring) {
    ring.style.opacity = '0';
    ring.style.transform = `translateY(${CFG.ringDown}px)`;
  }

  function playRing() {
    if (!ring) {
      window.dispatchEvent(new Event('ring:done'));
      return;
    }
    const [x1, y1, x2, y2] = CFG.ringEase;
    const animation = ring.animate(
      [{ transform: `translateY(${CFG.ringDown}px)`, opacity: 0 },
       { transform: 'translateY(0px)', opacity: 1 }],
      { duration: CFG.ringDur, easing: `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`, fill: 'forwards' }
    );
    animation.addEventListener('finish', () => window.dispatchEvent(new Event('ring:done')), { once: true });
  }

  async function init() {
    const host = document.getElementById('xiangshang');
    if (!host) return;
    let svg = null, paths = [];
    try {
      let txt = await (await fetch(SRC)).text();
      txt = txt.replace(/id="([^"]+)"/g, (m, id) => `id="${PREFIX}${id}"`)
               .replace(/url\(#([^)]+)\)/g, (m, id) => `url(#${PREFIX}${id})`)
               .replace(/href="#([^"]+)"/g, (m, id) => `href="#${PREFIX}${id}"`);
      const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
      svg = document.importNode(doc.querySelector('svg'), true);
      svg.style.cssText = 'display:block;width:100%;height:100%;';
      host.querySelector('img')?.remove();
      host.appendChild(svg);
      /* 12 条 path 初始隐藏；方向见 CFG.growFromBase 头注释 */
      paths = [...svg.querySelectorAll('path')].map((el) => {
        const len = el.getTotalLength();
        el.style.strokeDasharray = len;
        el.style.strokeDashoffset = CFG.growFromBase ? len : len;   // 隐藏态两种方向都是 len
        return { el, len };
      });
    } catch (e) {
      console.warn('[up_fx] 向上线条加载失败：', e.message);
    }

    const ease = mkEase(CFG.growEase);
    let playToken = 0, fallbackTimer = 0;
    function reset() {
      playToken++;
      play.done = false;
      clearTimeout(fallbackTimer);
      for (const path of paths) path.el.style.strokeDashoffset = path.len;
      ring?.getAnimations().forEach(animation => animation.cancel());
      if (ring) {
        ring.style.opacity = '0';
        ring.style.transform = `translateY(${CFG.ringDown}px)`;
      }
    }
    function play() {
      if (play.done) return;             // tree:grown 与兜底二选一，全程仅一次
      play.done = true;
      clearTimeout(fallbackTimer);
      const token = ++playToken;
      const t0 = performance.now() + CFG.startDelay;
      if (!paths.length) { playRing(); return; }   // 素材失败也要让圆环出场
      const from = CFG.growFromBase ? 1 : 1;       // 隐藏态 offset 系数
      const to = CFG.growFromBase ? 2 : 0;         // 完成态：反向揭示 len→2len / 正向 len→0
      const tick = (now) => {
        if (token !== playToken) return;
        const u = (now - t0) / CFG.growDur;
        if (u < 1) {
          const k = from + (to - from) * ease(Math.max(0, u));
          for (const p of paths) p.el.style.strokeDashoffset = p.len * k;
          requestAnimationFrame(tick);
        } else {
          for (const p of paths) p.el.style.strokeDashoffset = p.len * to;
          playRing();                    // 生长结束 → 圆环归位，完成后触发 ring:done
        }
      };
      requestAnimationFrame(tick);
    }
    window.addEventListener('tree:grow:start', play);
    window.addEventListener('animations:replay', reset);
    window.whenAppReady(() => { fallbackTimer = setTimeout(play, CFG.fallback); });
  }

  window.addEventListener('DOMContentLoaded', init);
})();
