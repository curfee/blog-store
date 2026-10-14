/* 主支撑图像 · LetterGlitch 字符雨（遮罩限定）（2026-10-12 v2）
   结构：#shan 层内 = 底图 img + 本模块追加的 <canvas>（同盒叠加，随景深视差一起动）
   实现：React Bits <LetterGlitch /> 原生 JS 移植，canvas 网格字符 + 随机 5% 重绘 + 平滑变色
   遮罩（v2 改写）：不再依赖 CSS mask-mode:luminance（Chromium 不支持 → 之前完全不生效），
   改为读取遮罩图按网格逐格判定可见性——披风区域画字符，其余留空。顺带解决性能问题：
   只重绘变化的格子（不再每帧全画布 clearRect + 7700 次 fillText）。 */
(function () {
  /* ===================== 可调参数（用户自助调整区） ===================== */
  const CFG = {
    mask: 'icon/主支撑图像_mask_inv.webp',   // 遮罩图（白=显示 黑=隐藏；_inv=反转版）
    blend: 'screen',                          // 叠加效果（mix-blend-mode）
    opacity: 0.31,                            // 透明度 0~1
    colors: ['#2b4539', '#61dca3', '#61b3dc','#e1ff00'],
	weights: [1, 1, 1, 0.05],// 字符配色（随机取色 + 平滑过渡）
    glitchSpeed: 200,                          // 重绘间隔 ms（每轮随机换 5% 字符）
    smooth: true,                             // 颜色平滑过渡
    characters: '*--;\'`-=\\][,.@%#*$#GODISTURE', // 字符集
  };
  /* ===================================================================== */

  const FONT_SIZE = 16, CHAR_W = 10, CHAR_H = 20;
  const FALLBACK_RGB = { r: 255, g: 255, b: 255 };

  function boot() {
    const host = document.getElementById('shan');
    if (!host) return;
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;' +
                           'pointer-events:none;mix-blend-mode:' + CFG.blend + ';opacity:' + CFG.opacity + ';';
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const lettersArr = Array.from(CFG.characters);
    const getRandomChar = () => lettersArr[Math.floor(Math.random() * lettersArr.length)];
    const hexToRgb = (hex) => {
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.replace(/^#?([a-f\d])([a-f\d])([a-f\d])$/i, (s, r, g, b) => r + r + g + g + b + b));
      return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
    };
	const palette = CFG.colors.map((hex, i) => ({
	  rgb: hexToRgb(hex) || FALLBACK_RGB,
	  w: CFG.weights?.[i] > 0 ? CFG.weights[i] : 1,   // 缺省/非法权重按 1
	}));
	const wTotal = palette.reduce((s, p) => s + p.w, 0);
	const getRandomRgb = () => {
	  let r = Math.random() * wTotal;
	  for (const p of palette) { r -= p.w; if (r <= 0) return p.rgb; }
	  return palette[palette.length - 1].rgb;
	};
    const mixRgb = (s, e, f) => ({ r: Math.round(s.r + (e.r - s.r) * f), g: Math.round(s.g + (e.g - s.g) * f), b: Math.round(s.b + (e.b - s.b) * f) });
    const rgbCss = ({ r, g, b }) => `rgb(${r},${g},${b})`;

    let letters = [], visible = [], grid = { columns: 0, rows: 0 }, lastGlitch = Date.now();
    let boxW = 0, boxH = 0; // CSS 像素尺寸（resize 时缓存，避免每帧 getBoundingClientRect）

    /* ---- 遮罩读取：缩到网格大小逐格采样亮度，>= 阈值视为可见 ---- */
    function buildVisibility(maskImg) {
      visible = new Uint8Array(grid.columns * grid.rows);
      if (!maskImg) return; // 加载失败：全部可见（等价不遮罩，保底不黑屏）
      const oc = document.createElement('canvas');
      oc.width = grid.columns; oc.height = grid.rows;
      const octx = oc.getContext('2d', { willReadFrequently: true });
      octx.drawImage(maskImg, 0, 0, grid.columns, grid.rows);
      const data = octx.getImageData(0, 0, grid.columns, grid.rows).data;
      for (let i = 0; i < visible.length; i++) {
        const lum = data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114;
        visible[i] = lum >= 110 ? 1 : 0;
      }
    }

    function cellX(i) { return (i % grid.columns) * CHAR_W; }
    function cellY(i) { return Math.floor(i / grid.columns) * CHAR_H; }

    function drawAll() {
      ctx.clearRect(0, 0, boxW, boxH);
      ctx.font = `${FONT_SIZE}px monospace`;
      ctx.textBaseline = 'top';
      for (let i = 0; i < letters.length; i++) {
        if (!visible[i]) continue;
        ctx.fillStyle = rgbCss(letters[i].rgb);
        ctx.fillText(letters[i].char, cellX(i), cellY(i));
      }
    }
    function drawCell(i) { // 只重绘一格（性能关键：不再整帧重画）
      ctx.clearRect(cellX(i), cellY(i), CHAR_W, CHAR_H);
      if (!visible[i]) return;
      ctx.fillStyle = rgbCss(letters[i].rgb);
      ctx.fillText(letters[i].char, cellX(i), cellY(i));
    }

    function resize() {
      const rect = host.getBoundingClientRect();
      boxW = rect.width; boxH = rect.height;
      canvas.width = Math.max(1, Math.round(rect.width));   // 背板锁 1x（16px 字符无需 dpr2，省 4 倍像素）
      canvas.height = Math.max(1, Math.round(rect.height));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      grid = { columns: Math.ceil(rect.width / CHAR_W), rows: Math.ceil(rect.height / CHAR_H) };
      letters = Array.from({ length: grid.columns * grid.rows }, () => {
        const rgb = getRandomRgb();
        return { char: getRandomChar(), rgb, fromRgb: rgb, targetRgb: getRandomRgb(), colorProgress: 1 };
      });
      if (maskReady) { buildVisibility(maskImg); drawAll(); }
    }

    function animate() {
      if (window.__shanRevealAnimating) {
        requestAnimationFrame(animate);
        return;
      }
      const now = Date.now();
      const dirty = [];
      if (now - lastGlitch >= CFG.glitchSpeed) {
        const updateCount = Math.max(1, Math.floor(letters.length * 0.05));
        for (let i = 0; i < updateCount; i++) {
          const idx = Math.floor(Math.random() * letters.length);
          if (!letters[idx]) continue;
          letters[idx].char = getRandomChar();
          letters[idx].fromRgb = letters[idx].rgb;
          letters[idx].targetRgb = getRandomRgb();
          if (CFG.smooth) letters[idx].colorProgress = 0;
          else { letters[idx].rgb = letters[idx].targetRgb; letters[idx].colorProgress = 1; }
          dirty.push(idx);
        }
        lastGlitch = now;
      }
      if (CFG.smooth) {
        for (let i = 0; i < letters.length; i++) {
          const l = letters[i];
          if (l.colorProgress < 1) {
            l.colorProgress = Math.min(1, l.colorProgress + 0.05);
            l.rgb = mixRgb(l.fromRgb, l.targetRgb, l.colorProgress);
            dirty.push(i);
          }
        }
      }
      for (let i = 0; i < dirty.length; i++) drawCell(dirty[i]); // 本帧只补画脏格
      requestAnimationFrame(animate);
    }

    /* 遮罩图加载（异步；加载完或 resize 后重建可见性并重画） */
    let maskImg = null, maskReady = false;
    const im = new Image();
    im.onload = () => {
      maskReady = true; maskImg = im; buildVisibility(im); drawAll();
      window.dispatchEvent(new Event('shan:ready'));
    };
    im.onerror = () => {
      maskReady = true; buildVisibility(null); drawAll(); // 失败保底
      window.dispatchEvent(new Event('shan:ready'));
    };
    im.src = CFG.mask;

    let resizeTimeout;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(resize, 150);
    });
    resize();
    let animationStarted = false;
    const startAnimation = () => {
      if (animationStarted) return;
      animationStarted = true;
      animate();
    };
    window.whenAppReady(() => {
      if (window.__shanRevealAnimating) {
        window.addEventListener('shan:reveal:effect:start', startAnimation, { once: true });
        window.addEventListener('shan:reveal:done', startAnimation, { once: true });
      } else {
        startAnimation();
      }
    });
  }

  window.addEventListener('DOMContentLoaded', boot);
})();
