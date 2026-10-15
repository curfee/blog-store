/* 开始求索 · 路径生长 + 渐显 + hover/clicked（2026-10-11 v2）
   流程（触发仍接 curves:grown +400ms，once + 兜底，全程仅一次）：
   1) 命名路径 _1.._22 按数字顺序生长：dashoffset len→0，每条 300ms，
      缓动 cubic-bezier(0.003, 0.93, 0.68, 0.996)，下一条在前一条结束前 100ms 开始（间隔 200ms）
   2) 生长全部结束后，依次渐显（opacity 0→1，各 200ms）：三角形 → 左下矩形 → 右下矩形
   3) 渐显完成后开放 hover/clicked（画布坐标判定）：
      hover：左下矩形左上 45° 移 7px、右下矩形右上 45° 移 7px（100ms）
      clicked：两矩形还原（50ms）
   素材：新_开始求索.svg（全画布 2557×1440），内联剥掉画板长宽，id 加 st-- 前缀 */
(function () {
  const SRC = 'icon/新_开始求索.svg';
  const PREFIX = 'st--';
  const TIMING = window.ANIMATION_TIMING?.startFx || {};
  const PATH_DUR = TIMING.pathDuration ?? 300;       // 每条路径播放时长
  const STAGGER = TIMING.pathStagger ?? 200;         // 路径起点间隔
  const FADE_DUR = TIMING.fadeDuration ?? 200;       // 三角形/矩形渐显时长
  const HOVER_OFF = 7;                  // hover 位移（45° 模长）
  const STATE_DUR = 250;                // hover/clicked 状态切换时长
  const STATE_EASE = 'cubic-bezier(0.004, 0.632, 0.266, 0.995)';
  const CLICK_SCALE = 0.9;               // clicked 时按钮整体缩至 90%
  const PATH_HOVER_Y = -5;               // hover 时路径整体上移 5px
  const PATH_HOVER_RETRACT = 0.15;        // hover 时路径描边回缩 15%
  const START_DELAY = TIMING.startDelay ?? 400;      // curves:grown 之后延迟开播
  const FALLBACK = TIMING.fallback ?? 4000;           // 兜底：曲线引擎未挂载也能播
  const COMPLETION_TAIL = TIMING.completionTail ?? 60;
  const SFX = {
    hover: 'sound_effect/hover_snd.wav',
    clicked: 'sound_effect/clicked_snd.wav',
    volume: 0.6,
  };
  const sfxCache = {};
  function playSfx(kind) {
    const url = SFX[kind];
    if (!url) return;
    let audio = sfxCache[url];
    if (!audio) { audio = sfxCache[url] = new Audio(url); audio.preload = 'auto'; }
    const instance = audio.paused ? audio : audio.cloneNode();
    instance.volume = SFX.volume;
    instance.play().catch(() => {});
  }

  /* cubic-bezier(0.003, 0.93, 0.68, 0.996) 求解（二分） */
  const poly = (a, b) => (t) => (((1 - 3 * b + 3 * a) * t + (3 * (b - a) - 3 * a)) * t + 3 * a) * t;
  const bx = poly(0.003, 0.68), by = poly(0.93, 0.996);
  const ease = (x) => {
    let lo = 0, hi = 1, t = x;
    for (let i = 0; i < 20; i++) { t = (lo + hi) / 2; (bx(t) < x) ? lo = t : hi = t; }
    return by(t);
  };

  async function init() {
    const host = document.getElementById('start');
    if (!host) return;
    let txt;
    try { txt = await (await fetch(SRC)).text(); }
    catch (e) { console.warn('[start_fx] 加载失败：', e.message); return; }
    txt = txt.replace(/id="([^"]+)"/g, (m, id) => `id="${PREFIX}${id}"`)
             .replace(/url\(#([^)]+)\)/g, (m, id) => `url(#${PREFIX}${id})`)
             .replace(/href="#([^"]+)"/g, (m, id) => `href="#${PREFIX}${id}"`);
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
    const svg = document.importNode(doc.querySelector('svg'), true);
    svg.querySelector(`#${PREFIX}画板长宽`)?.remove();   // 画布背景不带入
    svg.style.cssText = 'display:block;width:100%;height:100%;';
    host.querySelector('img')?.remove();
    host.appendChild(svg);

    /* ---- 命名路径：按数字顺序（_1.._N，与文档顺序无关），初始隐藏 ---- */
    const paths = [...svg.querySelectorAll('path[id]')]
      .filter((el) => /^_\d+$/.test(el.id.slice(PREFIX.length)))
      .sort((a, b) => +a.id.slice(PREFIX.length + 1) - +b.id.slice(PREFIX.length + 1))
      .map((el) => {
        const len = el.getTotalLength();
        el.style.strokeDasharray = len;
        el.style.strokeDashoffset = len;
        return { el, len };
      });
    /* ---- 渐显三要素：初始透明 ---- */
    const tri = svg.querySelector(`#${PREFIX}三角形`);
    const rectL = svg.querySelector(`#${PREFIX}左下矩形`);
    const rectR = svg.querySelector(`#${PREFIX}右下矩形`);
    const pathGroup = svg.querySelector(`#${PREFIX}bottom_开始求索`);
    [tri, rectL, rectR].forEach((el) => { el.style.opacity = 0; });
    /* ---- hover/clicked 包装层（无烘焙矩阵，CSS 平移即可） ---- */
    const NS = 'http://www.w3.org/2000/svg';
    const wrapFx = (el) => {
      const g = document.createElementNS(NS, 'g');
      g.setAttribute('class', 'fx');
      el.parentNode.replaceChild(g, el);
      g.appendChild(el);
      g.style.transformOrigin = '0 0';
      return g;
    };
    const gL = wrapFx(rectL), gR = wrapFx(rectR);
    const d = HOVER_OFF * Math.SQRT1_2;
    let playToken = 0, fallbackTimer = 0, buttonBound = false;
    const playTimers = [];

    function applyBtn(s, instant) {          // 仅渐显完成后开放
      pathGroup.style.transformBox = 'fill-box';
      pathGroup.style.transformOrigin = 'center';
      pathGroup.style.transition = instant ? 'none' : `transform ${STATE_DUR}ms ${STATE_EASE}`;
      const pathTransforms = [];
      if (s === 'hover') pathTransforms.push(`translateY(${PATH_HOVER_Y}px)`);
      if (s === 'clicked') pathTransforms.push(`scale(${CLICK_SCALE})`);
      pathGroup.style.transform = pathTransforms.join(' ');
      paths.forEach(({ el, len }) => {
        el.style.transition = instant ? 'none' : `stroke-dashoffset ${STATE_DUR}ms ${STATE_EASE}`;
        el.style.strokeDashoffset = s === 'hover' ? len * PATH_HOVER_RETRACT : 0;
      });
      gL.style.transition = instant ? 'none' : `transform ${STATE_DUR}ms ${STATE_EASE}`;
      gL.style.transform = s === 'hover' ? `translate(${-d}px,${-d}px)` : '';
      gR.style.transition = instant ? 'none' : `transform ${STATE_DUR}ms ${STATE_EASE}`;
      gR.style.transform = s === 'hover' ? `translate(${d}px,${-d}px)` : '';
    }
    function bindBtn() {                     // 画布坐标悬停判定（.el 全画布，同 button_fx 原因）
      if (buttonBound) return;
      buttonBound = true;
      let hovered = false, pressed = false;
      const stage = document.getElementById('stage');
      const group = svg.querySelector(`#${PREFIX}bottom_开始求索`);
      const bb = group.getBBox();
      const pad = 30;                        // 判定框外扩（画布单位）
      const inBtn = (cx, cy) => {
        const r = stage.getBoundingClientRect(), k = 2560 / r.width;
        const x = (cx - r.left) * k, y = (cy - r.top) * k;
        return x >= bb.x - pad && x <= bb.x + bb.width + pad &&
               y >= bb.y - pad && y <= bb.y + bb.height + pad;
      };
      window.addEventListener('pointermove', (e) => {
        const h = inBtn(e.clientX, e.clientY);
        if (h !== hovered) {
          hovered = h;
          applyBtn(h ? (pressed ? 'clicked' : 'hover') : 'default', false);
          if (h && !pressed) playSfx('hover');
        }
      }, { passive: true });
      window.addEventListener('pointerdown', (e) => {
        if (inBtn(e.clientX, e.clientY)) {
          hovered = true;
          pressed = true;
          applyBtn('clicked', false);
          playSfx('clicked');
        }
      });
      window.addEventListener('pointerup', () => {
        if (pressed) { pressed = false; applyBtn(hovered ? 'hover' : 'default', false); }
      });
    }

    function reset() {
      playToken++;
      play.done = false;
      clearTimeout(fallbackTimer);
      while (playTimers.length) clearTimeout(playTimers.pop());
      applyBtn('default', true);
      paths.forEach(({ el, len }) => {
        el.style.transition = 'none';
        el.style.strokeDashoffset = len;
      });
      [tri, rectL, rectR].forEach(el => {
        el.getAnimations().forEach(animation => animation.cancel());
        el.style.transition = 'none';
        el.style.opacity = '0';
      });
    }

    function play() {
      if (play.done) return;                 // 全程仅播一次（grown 与兜底二选一先到）
      play.done = true;
      clearTimeout(fallbackTimer);
      const token = ++playToken;
      const t0 = performance.now() + START_DELAY;
      const total = (paths.length - 1) * STAGGER + PATH_DUR;
      const fadeStart = t0 + total + 150;    // 生长收尾后留 150ms 呼吸
      const tick = (now) => {
        if (token !== playToken) return;
        let grown = true;
        for (let i = 0; i < paths.length; i++) {
          const u = (now - t0 - i * STAGGER) / PATH_DUR;
          if (u <= 0) { grown = false; continue; }
          if (u < 1) {
            paths[i].el.style.strokeDashoffset = paths[i].len * (1 - ease(u));
            grown = false;
          } else {
            paths[i].el.style.strokeDashoffset = 0;
          }
        }
        if (!grown) { requestAnimationFrame(tick); return; }
        /* 生长完成 → 渐显链：三角形 → 左下矩形 → 右下矩形，各 200ms */
        [tri, rectL, rectR].forEach((el, i) => {
          playTimers.push(setTimeout(() => {
            if (token !== playToken) return;
            el.style.transition = `opacity ${FADE_DUR}ms ease-out`;
            el.style.opacity = 1;
          }, i * FADE_DUR));
        });
        /* 渐显结束后开放 hover/clicked，并通知"开场动画全部结束"（music_fx 监听） */
        playTimers.push(setTimeout(() => {
          if (token !== playToken) return;
          applyBtn('default', true);
          bindBtn();
          window.dispatchEvent(new Event('start:done'));
        }, 3 * FADE_DUR + COMPLETION_TAIL));
      };
      requestAnimationFrame(tick);
    }
    window.addEventListener('curves:grown', play);
    window.addEventListener('animations:replay', reset);
    window.whenAppReady(() => { fallbackTimer = setTimeout(play, FALLBACK); });
  }

  window.addEventListener('DOMContentLoaded', init);
})();
