/* 树状主体 · 8 路径生长动画（2026-10-12）
   素材：icon/_画板版_路径动画树状主体.svg（8 条纯矢量描边路径，全部黑渐变实色，
   画板坐标均"起点在下、终点在上"，dashoffset len→0 即自然"从根部向上生长"）。
   流程：内联替换 #tree 的画板版 img → 8 条路径初始隐藏 → 开播后按 PLAY_ORDER
   顺序逐条生长（rAF + 二分 bezier），全程仅播一次，完成后派发 tree:grown。
   播放顺序（文档序索引）：7 中央主干 → 5 左长枝 → 6 右长枝 → 0 左圆角 → 1 右圆角
   → 4 中短竖 → 3 左短竖 → 2 右短竖（先骨架后细节、先高后低）。
   注意：路径无 id，一律按文档序索引定位；渐变 id 加 tr-- 前缀防冲突（坑 5）。 */
(function () {
  /* ==================== 用户自助调整区（改完刷新即生效） ==================== */
  const TIMING = window.ANIMATION_TIMING?.tree || {};
  const CFG = {
    START_DELAY: TIMING.startDelay ?? 500,                     // 开播前等待 ms
    MS_PER_PX: TIMING.millisecondsPerPixel ?? 1.1,              // 生长速度：每 px 路径耗时 ms
    MIN_DUR: TIMING.minPathDuration ?? 160,                     // 单条最短时长 ms
    MAX_DUR: TIMING.maxPathDuration ?? 900,                     // 单条最长时长 ms
    STAGGER: TIMING.pathStagger ?? 260,                         // 相邻两条起点间隔 ms
    TAIL_OVERLAP: TIMING.tailOverlap ?? 110,                    // 后一条提前开始量 ms
    EASE: [0, 0.806, 0.233, 1],  // 生长缓动（与开始求索同族）
    PLAY_ORDER: [7, 5, 6, 0, 1, 4, 3, 2],  // 文档序 → 播放序
  };
  /* ======================================================================== */

  const SRC = 'icon/_画板版_路径动画树状主体.svg';
  const PREFIX = 'tr--';

  /* cubic-bezier 求解（二分，同 start_fx.js） */
  const poly = (a, b) => (t) => (((1 - 3 * b + 3 * a) * t + (3 * (b - a) - 3 * a)) * t + 3 * a) * t;
  const bx = poly(CFG.EASE[0], CFG.EASE[2]), by = poly(CFG.EASE[1], CFG.EASE[3]);
  const ease = (x) => {
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 20; i++) { t = (lo + hi) / 2; (bx(t) < x) ? lo = t : hi = t; }
    return by(t);
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  async function init() {
    const host = document.getElementById('tree');
    if (!host) return;
    let txt;
    try { txt = await (await fetch(SRC)).text(); }
    catch (e) { console.warn('[tree_fx] 加载失败，保留静态树：', e.message); return; }
    txt = txt.replace(/id="([^"]+)"/g, (m, id) => `id="${PREFIX}${id}"`)
             .replace(/url\(#([^)]+)\)/g, (m, id) => `url(#${PREFIX}${id})`)
             .replace(/href="#([^"]+)"/g, (m, id) => `href="#${PREFIX}${id}"`);
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
    const svg = document.importNode(doc.querySelector('svg'), true);
    svg.style.cssText = 'display:block;width:100%;height:100%;';
    host.querySelector('img')?.remove();
    host.appendChild(svg);

    /* ---- 8 条路径按文档序收集，初始隐藏，长度决定各自时长 ---- */
    const all = [...svg.querySelectorAll('path')];
    if (all.length !== 8) console.warn(`[tree_fx] 路径数 ${all.length} ≠ 8，请核对素材`);
    const paths = CFG.PLAY_ORDER.map((idx, i) => {
      const el = all[idx];
      const len = el.getTotalLength();
      el.style.strokeDasharray = len;
      el.style.strokeDashoffset = len;
      const dur = clamp(len * CFG.MS_PER_PX, CFG.MIN_DUR, CFG.MAX_DUR);
      return { el, len, dur, t0: i * (CFG.STAGGER - CFG.TAIL_OVERLAP) };
    });
    function play() {
      if (play.done) return;               // 全程仅播一次
      play.done = true;
      const t0 = performance.now() + CFG.START_DELAY;
      const tick = (now) => {
        let grown = true;
        for (const p of paths) {
          const u = (now - t0 - p.t0) / p.dur;
          if (u <= 0) { grown = false; continue; }
          if (u < 1) {
            p.el.style.strokeDashoffset = p.len * (1 - ease(u));
            grown = false;
          } else {
            p.el.style.strokeDashoffset = 0;
          }
        }
        if (!grown) { requestAnimationFrame(tick); return; }
        window.dispatchEvent(new Event('tree:grown'));
      };
      requestAnimationFrame(tick);
    }
    /* 新的 SVG 生长 ASCII 蒙版完成后，再开始树状主体生长。 */
    if (window.__shanRevealDone) play();
    else window.addEventListener('shan:reveal:done', play, { once: true });
  }

  window.addEventListener('DOMContentLoaded', init);
})();
