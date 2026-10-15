/* 可复用的 SVG 路径 + 像素 + ASCII 蒙版揭示器。
   默认挂载到 #shan；配置位于 ../config/growth_ascii_config.js，时序位于 ../config/animation_timing.js。 */
(function () {
  /* 1. 配置入口：时序来自 ../config/animation_timing.js，外观与布局来自 ../config/growth_ascii_config.js。 */
  const BASE = window.GROWTH_ASCII_MASK_CONFIG || {};
  const SETTINGS = readSettings();
  const SHAN_TIMING = window.ANIMATION_TIMING?.shanReveal || {};
  const PATH_DURATION = Math.max(1, Number(SHAN_TIMING.duration ?? SETTINGS.duration) || 2900);
  const PATH_EASING = SHAN_TIMING.easing || SETTINGS.easing || [0, 0.83, 0.47, 1];
  const CLEANUP_EASING = SHAN_TIMING.cleanupEasing || [0.86, 0, 0.14, 1];
  const APPLY_PATH_EASING = SHAN_TIMING.applyEasing ?? (SETTINGS.applyEasing !== false);
  const SPHERE_START = Math.max(0, Number(SHAN_TIMING.sphereStart) || 0);
  const SPHERE_DURATION = Math.max(0, Number(SHAN_TIMING.sphereDuration ?? 400) || 0);
  const INITIAL_Y_OFFSET = Number(SHAN_TIMING.initialYOffset) || 0;
  const INITIAL_Y_EASING = SHAN_TIMING.initialYOffsetEasing || [0, 0.198, 0.072, 0.995];
  const CLEANUP_DURATION = Math.max(0, Number(SHAN_TIMING.cleanupDuration ?? SETTINGS.cleanupDuration) || 0);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const LAYOUT = SETTINGS.geometry || {};
  const SPHERE_MASK_SIZE = Number(LAYOUT.sphereMaskSize) || 100; // CSS px
  const PATH_MASK_POSITION = LAYOUT.pathMaskPosition || { x: 0, y: 0 }; // 相对 shan 左上角，CSS px
  const SPHERE_MASK_POSITION = LAYOUT.sphereMaskPosition || { x: 50, y: 50 }; // 容器百分比
  let W = 0, H = 0, records = [];
  let maskFit = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
  let manual = false, frame = 0, cleanupFrame = 0, treeStartTimer = 0, active = false, cleaning = false, completing = false, done = false;
  let host, image, outputCanvas, outputCtx, sourceCanvas, sourceCtx, pixelCanvas, pixelCtx, asciiCanvas, asciiCtx, asciiGlyphs, asciiColumns = 0, baseMaskCanvas, baseMaskCtx, maskCanvas, maskCtx;
  let overlayCanvases = [];
  let sphereProgress = 0, cleanupProgress = 0, pathProgress = 0;
  let baseMaskReady = false;
  let sphereStartAt = 0;
  window.__shanRevealAnimating = true;
  window.__shanRevealDone = false;
  window.__shanIntroOffsetY = INITIAL_Y_OFFSET;
  const treeLayer = document.getElementById('tree');
  if (treeLayer) treeLayer.style.visibility = 'hidden';

  function readSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(BASE.storageKey) || 'null');
      if (saved && typeof saved === 'object') return { ...BASE, ...saved, gradientOverrides: saved.gradientOverrides || BASE.gradientOverrides || {} };
    } catch (_) { /* localStorage 不可用时使用共享文件内的初始设置 */ }
    return BASE;
  }

  const poly = (a, b) => t => (((1 - 3 * b + 3 * a) * t + (3 * (b - a) - 3 * a)) * t + 3 * a) * t;
  const cleanupBx = poly(CLEANUP_EASING[0], CLEANUP_EASING[2]);
  const cleanupBy = poly(CLEANUP_EASING[1], CLEANUP_EASING[3]);
  const easeCleanup = x => {
    let low = 0, high = 1, t = x;
    for (let i = 0; i < 22; i++) {
      t = (low + high) / 2;
      if (cleanupBx(t) < x) low = t;
      else high = t;
    }
    return cleanupBy(t);
  };
  const offsetBx = poly(INITIAL_Y_EASING[0], INITIAL_Y_EASING[2]);
  const offsetBy = poly(INITIAL_Y_EASING[1], INITIAL_Y_EASING[3]);
  const easeInitialYOffset = x => {
    let low = 0, high = 1, t = x;
    for (let i = 0; i < 22; i++) {
      t = (low + high) / 2;
      if (offsetBx(t) < x) low = t;
      else high = t;
    }
    return offsetBy(t);
  };
  const ease = (() => {
    const curve = PATH_EASING;
    const bx = poly(curve[0], curve[2]), by = poly(curve[1], curve[3]);
    return x => {
      let low = 0, high = 1, t = x;
      for (let i = 0; i < 22; i++) { t = (low + high) / 2; if (bx(t) < x) low = t; else high = t; }
      return by(t);
    };
  })();

  function flattenPath(path, matrix, tolerance = 3) {
    const points = [], length = path.getTotalLength();
    for (let distance = 0; distance < length; distance += tolerance) {
      const point = path.getPointAtLength(distance);
      points.push({ x: matrix.a * point.x + matrix.c * point.y + matrix.e, y: matrix.b * point.x + matrix.d * point.y + matrix.f });
    }
    const end = path.getPointAtLength(length);
    points.push({ x: matrix.a * end.x + matrix.c * end.y + matrix.e, y: matrix.b * end.x + matrix.d * end.y + matrix.f });
    return points;
  }

  /* 2. SVG 路径解析与渐变笔触。 */
  function pathPaint(item) {
    if (!item.gradient) return '#fff';
    const override = SETTINGS.gradientOverrides?.[item.index];
    const matrix = item.matrix, transform = item.gradient.transform;
    let cx = matrix.a * transform.e + matrix.c * transform.f + matrix.e;
    let cy = matrix.b * transform.e + matrix.d * transform.f + matrix.f;
    if (override) { cx += Number(override.offsetX) || 0; cy += Number(override.offsetY) || 0; }
    const determinantScale = Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c));
    const radius = Math.max(Math.hypot(transform.a, transform.b), Math.hypot(transform.c, transform.d)) * determinantScale * (Number(override?.scale) || 1);
    const gradient = sourceCtx.createRadialGradient(cx, cy, 0, cx, cy, radius || 1);
    if (override) {
      gradient.addColorStop(0, override.inner || '#000000');
      gradient.addColorStop(0.65, override.middle || '#242424');
      gradient.addColorStop(1, override.outer || '#ffffff');
    } else item.gradient.stops.forEach(stop => gradient.addColorStop(stop.offset, stop.color));
    return gradient;
  }

  function drawGrowingPaths(progress) {
    sourceCtx.clearRect(0, 0, W, H);
    sourceCtx.save();
    sourceCtx.setTransform(maskFit.scaleX, 0, 0, maskFit.scaleY, maskFit.offsetX, maskFit.offsetY);
    for (const item of records) {
      const drawnLength = item.length * progress;
      if (drawnLength <= 0) continue;
      sourceCtx.beginPath();
      sourceCtx.moveTo(item.points[0].x, item.points[0].y);
      let passed = 0;
      for (let i = 1; i < item.points.length && passed < drawnLength; i++) {
        const from = item.points[i - 1], to = item.points[i];
        const segment = Math.hypot(to.x - from.x, to.y - from.y);
        if (!segment) continue;
        const portion = Math.min(1, (drawnLength - passed) / segment);
        sourceCtx.lineTo(from.x + (to.x - from.x) * portion, from.y + (to.y - from.y) * portion);
        passed += segment;
      }
      sourceCtx.strokeStyle = pathPaint(item);
      sourceCtx.lineWidth = item.strokeWidth;
      sourceCtx.lineCap = item.lineCap;
      sourceCtx.lineJoin = item.lineJoin;
      sourceCtx.stroke();
    }
    sourceCtx.restore();
  }

  /* 3. 像素化、ASCII 采样与最终图像蒙版合成。 */
  function createMask(progress, redrawBase = true) {
    pathProgress = progress;
    if (redrawBase) {
    baseMaskReady = true;
    drawGrowingPaths(APPLY_PATH_EASING ? ease(progress) : progress);
    const block = Math.max(1, Number(SETTINGS.pixelSize) || 8);
    const lowW = Math.max(1, Math.ceil(W / block)), lowH = Math.max(1, Math.ceil(H / block));
    if (pixelCanvas.width !== lowW || pixelCanvas.height !== lowH) {
      pixelCanvas.width = lowW; pixelCanvas.height = lowH;
      pixelCtx = pixelCanvas.getContext('2d', { willReadFrequently: true });
    }
    pixelCtx.clearRect(0, 0, lowW, lowH);
    pixelCtx.imageSmoothingEnabled = true;
    pixelCtx.drawImage(sourceCanvas, 0, 0, lowW, lowH);
    const imageData = pixelCtx.getImageData(0, 0, lowW, lowH), data = imageData.data;
    const cell = Math.max(1, Number(SETTINGS.asciiSize) || 12);
    const chars = Array.from(SETTINGS.charset || '！@￥%#&%*');
    const color = SETTINGS.asciiColor || '#ffffff';
    const colorLuminance = (
      parseInt(color.slice(1, 3), 16) * 0.299 +
      parseInt(color.slice(3, 5), 16) * 0.587 +
      parseInt(color.slice(5, 7), 16) * 0.114
    ) / 255;
    asciiCtx.save();
    asciiCtx.font = `${cell}px ${SETTINGS.asciiFont || 'Consolas, monospace'}`;
    asciiCtx.textBaseline = 'top';
    asciiCtx.textAlign = 'center';
    asciiCtx.fillStyle = '#fff';
    asciiCtx.globalAlpha = clamp(Number(SETTINGS.asciiOpacity ?? 0.92) * colorLuminance, 0, 1);
    asciiCtx.setTransform(maskFit.scaleX, 0, 0, maskFit.scaleY, maskFit.offsetX, maskFit.offsetY);
    if (SETTINGS.asciiEnabled !== false) {
      for (let y = cell / 2; y < H; y += cell) {
        const fitY = y * maskFit.scaleY + maskFit.offsetY;
        const sy = Math.min(lowH - 1, Math.floor(fitY / H * lowH));
        const row = Math.round((y - cell / 2) / cell);
        for (let x = cell / 2; x < W; x += cell) {
          const fitX = x * maskFit.scaleX + maskFit.offsetX;
          const sx = Math.min(lowW - 1, Math.floor(fitX / W * lowW));
          const p = (sy * lowW + sx) * 4;
          const alpha = data[p + 3];
          const luminance = data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114;
          const column = Math.round((x - cell / 2) / cell);
          const glyphIndex = row * asciiColumns + column;
          let nextGlyph = -1;
          if (alpha >= 24) {
            const darkness = 1 - luminance / 255;
            const density = SETTINGS.mapping === 'light-to-dark' ? 1 - darkness : darkness;
            nextGlyph = Math.round(density * (chars.length - 1));
          }
          if (asciiGlyphs[glyphIndex] === nextGlyph) continue;
          asciiGlyphs[glyphIndex] = nextGlyph;
          asciiCtx.clearRect(x - cell / 2, y - cell / 2, cell, cell);
          if (nextGlyph < 0) continue;
          asciiCtx.fillText(chars[nextGlyph], x, y - cell / 2);
        }
      }
    }
    asciiCtx.restore();

    for (let i = 0; i < data.length; i += 4) {
      const luminance = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = Math.round(data[i + 3] * luminance / 255);
    }
    pixelCtx.putImageData(imageData, 0, 0);

    baseMaskCtx.clearRect(0, 0, W, H);
    baseMaskCtx.imageSmoothingEnabled = false;
    baseMaskCtx.drawImage(pixelCanvas, 0, 0, W, H);
    if (SETTINGS.asciiEnabled !== false) baseMaskCtx.drawImage(asciiCanvas, 0, 0);
    }

    // 路径像素/ASCII 底图在球形扩散帧间复用，只重绘球形蒙版与最终合成。
    maskCtx.clearRect(0, 0, W, H);
    maskCtx.drawImage(baseMaskCanvas, 0, 0);
    if (sphereProgress > 0) {
      const hostWidth = host.clientWidth || W;
      const hostHeight = host.clientHeight || H;
      const cx = hostWidth * Number(SPHERE_MASK_POSITION.x) / 100;
      const cy = hostHeight * Number(SPHERE_MASK_POSITION.y) / 100;
      const radius = SPHERE_MASK_SIZE * sphereProgress / 2;
      if (radius > 0) {
        maskCtx.save();
        maskCtx.setTransform(W / hostWidth, 0, 0, H / hostHeight, 0, 0);
        const gradient = maskCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        gradient.addColorStop(0, 'rgba(255,255,255,1)');
        gradient.addColorStop(0.68, 'rgba(255,255,255,0.62)');
        gradient.addColorStop(1, 'rgba(255,255,255,0)');
        // destination-over 仅在原路径蒙版较透明的位置补入球形区域，形成 alpha 并集。
        maskCtx.globalCompositeOperation = 'destination-over';
        maskCtx.fillStyle = gradient;
        maskCtx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
        maskCtx.globalCompositeOperation = 'source-over';
        maskCtx.restore();
      }
    }
    if (cleanupProgress > 0) {
      maskCtx.save();
      maskCtx.globalCompositeOperation = 'destination-over';
      maskCtx.globalAlpha = cleanupProgress;
      maskCtx.fillStyle = '#fff';
      maskCtx.fillRect(0, 0, W, H);
      maskCtx.globalCompositeOperation = 'source-over';
      maskCtx.globalAlpha = 1;
      maskCtx.restore();
    }

    outputCtx.clearRect(0, 0, W, H);
    outputCtx.globalCompositeOperation = 'source-over';
    const hostHeight = host.clientHeight || H;
    const imageOffsetY = (Number(window.__shanIntroOffsetY) || 0) * H / hostHeight;
    outputCtx.drawImage(image, 0, imageOffsetY, W, H);
    outputCtx.globalCompositeOperation = 'destination-in';
    outputCtx.drawImage(maskCanvas, 0, 0);
    outputCtx.globalCompositeOperation = 'source-over';
  }

  function activateCanvas() {
    if (active) {
      if (cleaning) {
        cancelAnimationFrame(cleanupFrame);
        cleanupProgress = 0;
        cleaning = false;
        image.style.visibility = 'hidden';
        image.style.opacity = '';
        image.style.transition = '';
        outputCanvas.style.opacity = '1';
        outputCanvas.style.transition = '';
      }
      return;
    }
    active = true;
    host.style.overflow = 'hidden';
    image.style.visibility = 'hidden';
    image.style.opacity = '';
    overlayCanvases = [...host.querySelectorAll(':scope > canvas')].filter(canvas => canvas !== outputCanvas);
    overlayCanvases.forEach(canvas => { canvas.dataset.growthMaskPreviousVisibility = canvas.style.visibility; canvas.style.visibility = 'hidden'; });
    outputCtx.clearRect(0, 0, W, H);
    if (!outputCanvas.isConnected) host.appendChild(outputCanvas);
    window.__shanRevealAnimating = true;
  }

  /* 4. 球形蒙版触发、收尾交接与预览控制。 */
  function finishGrowth() {
    if (completing || cleaning) return;
    if (sphereProgress < 1) return;
    completing = true;
    cleanup();
  }

  function scheduleSphereMask(startTime, duration) {
    const triggerAt = Math.min(SPHERE_START, duration);
    sphereStartAt = startTime + triggerAt;
    sphereProgress = 0;
  }

  function useManualProgress() {
    manual = true;
    sphereStartAt = 0;
  }

  function restoreOverlayCanvases() {
    overlayCanvases.forEach(canvas => {
      canvas.style.visibility = canvas.dataset.growthMaskPreviousVisibility || '';
      canvas.style.zIndex = canvas.dataset.growthMaskPreviousZIndex || '';
      delete canvas.dataset.growthMaskPreviousVisibility;
      delete canvas.dataset.growthMaskPreviousZIndex;
    });
  }

  function cleanup() {
    if (!active || cleaning) return;
    cleaning = true;
    cleanupProgress = 0;
    overlayCanvases.forEach(canvas => {
      canvas.dataset.growthMaskPreviousZIndex = canvas.style.zIndex;
      canvas.style.visibility = canvas.dataset.growthMaskPreviousVisibility || '';
      canvas.style.zIndex = '2';
    });
    window.__shanRevealAnimating = false;
    window.dispatchEvent(new Event('shan:reveal:effect:start'));
    const start = performance.now();
    const fade = now => {
      const rawProgress = CLEANUP_DURATION === 0 ? 1 : clamp((now - start) / CLEANUP_DURATION, 0, 1);
      cleanupProgress = easeCleanup(rawProgress);
      createMask(1, false);
      if (cleanupProgress < 1) {
        cleanupFrame = requestAnimationFrame(fade);
        return;
      }
      outputCanvas.remove();
      cleanupFrame = 0;
      cleanupProgress = 0;
      image.style.visibility = '';
      restoreOverlayCanvases();
      host.style.overflow = '';
      active = false;
      cleaning = false;
      completing = false;
      done = true;
      window.__shanRevealDone = true;
      window.dispatchEvent(new Event('shan:reveal:done'));
    };
    cleanupFrame = requestAnimationFrame(fade);
  }

  function setProgress(value, shouldFinish = false) {
    if (completing || cleaning) return;
    const progress = clamp(Number(value) || 0, 0, 1);
    activateCanvas();
    if (treeLayer) treeLayer.style.visibility = progress >= 1 ? '' : 'hidden';
    baseMaskReady = false;
    createMask(progress);
    if (progress >= 1 && shouldFinish) finishGrowth();
  }

  function startReveal() {
    if (manual) return;
    if (!outputCtx || !records.length) { finishWithoutMask(); return; }
    cancelAnimationFrame(frame);
    cancelAnimationFrame(cleanupFrame);
    clearTimeout(treeStartTimer);
    restoreOverlayCanvases();
    overlayCanvases = [];
    outputCanvas.remove();
    host.style.overflow = '';
    image.style.visibility = '';
    image.style.opacity = '';
    image.style.transition = '';
    active = false;
    cleaning = false;
    completing = false;
    done = false;
    frame = cleanupFrame = 0;
    pathProgress = sphereProgress = cleanupProgress = 0;
    baseMaskReady = false;
    sphereStartAt = 0;
    window.__shanRevealAnimating = true;
    window.__shanRevealDone = false;
    window.__shanIntroOffsetY = INITIAL_Y_OFFSET;
    if (treeLayer) treeLayer.style.visibility = 'hidden';

    const start = performance.now();
    scheduleSphereMask(start, PATH_DURATION);
    const treeLead = Math.max(0, Number(window.ANIMATION_TIMING?.tree?.startBeforeShanDone) || 0);
    const shanTotalDuration = Math.max(PATH_DURATION, SPHERE_START + SPHERE_DURATION) + CLEANUP_DURATION;
    const treeStartDelay = Math.max(0, shanTotalDuration - treeLead);
    treeStartTimer = window.setTimeout(() => {
      treeStartTimer = 0;
      window.dispatchEvent(new Event('shan:reveal:tree-start'));
    }, treeStartDelay);
    const tick = now => {
      if (manual) return;
      const progress = Math.min(1, (now - start) / PATH_DURATION);
      activateCanvas();
      if (treeLayer) treeLayer.style.visibility = progress >= 1 ? '' : 'hidden';
      const sphereStarted = now >= sphereStartAt;
      if (sphereStarted) {
        sphereProgress = SPHERE_DURATION === 0 ? 1 : clamp((now - sphereStartAt) / SPHERE_DURATION, 0, 1);
        window.__shanIntroOffsetY = INITIAL_Y_OFFSET * (1 - easeInitialYOffset(sphereProgress));
      }
      const redrawBase = progress < 1 || !baseMaskReady;
      createMask(progress, redrawBase);
      if (progress < 1 || sphereProgress < 1) frame = requestAnimationFrame(tick);
      else finishGrowth();
    };
    frame = requestAnimationFrame(tick);
  }

  async function loadMaskSource() {
    const response = await fetch(SETTINGS.source || 'icon/生长测试.svg');
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = await response.text();
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = doc.documentElement;
    if (svg.querySelector('parsererror')) throw new Error('SVG XML 解析失败');
    const viewBox = (svg.getAttribute('viewBox') || '').trim().split(/[ ,]+/).map(Number);
    const [viewX, viewY, viewW, viewH] = viewBox.length === 4 ? viewBox : [0, 0, 2410, 1049];
    W = Math.ceil(viewW); H = Math.ceil(viewH);
    const hiddenSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    hiddenSvg.setAttribute('viewBox', `${viewX} ${viewY} ${viewW} ${viewH}`);
    hiddenSvg.style.cssText = `position:fixed;left:-10000px;top:0;width:${W}px;height:${H}px;visibility:hidden`;
    const imported = document.importNode(svg, true);
    imported.setAttribute('width', W); imported.setAttribute('height', H);
    hiddenSvg.append(...[...imported.childNodes].map(node => document.importNode(node, true)));
    document.body.append(hiddenSvg);
    records = [...hiddenSvg.querySelectorAll('path')].map((path, index) => {
      const matrix = path.getCTM();
      if (!matrix) return null;
      const points = flattenPath(path, matrix);
      let length = 0;
      for (let i = 1; i < points.length; i++) length += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
      const style = getComputedStyle(path);
      const match = style.stroke.match(/url\(["']?#([^"')]+)["']?\)/);
      const gradientElement = match && hiddenSvg.querySelector(`#${CSS.escape(match[1])}`);
      let gradient = null;
      if (gradientElement) {
        const values = (gradientElement.getAttribute('gradientTransform')?.match(/matrix\(([^)]+)\)/)?.[1] || '1 0 0 1 0 0').split(/[ ,]+/).map(Number);
        const [a, b, c, d, e, f] = values;
        gradient = {
          transform: { a, b, c, d, e, f },
          stops: [...gradientElement.querySelectorAll('stop')].map(stop => ({
            offset: parseFloat(stop.getAttribute('offset')) || 0,
            color: getComputedStyle(stop).stopColor,
          })),
        };
      }
      const scale = Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c));
      return { index, points, length, matrix, gradient, strokeWidth: (parseFloat(style.strokeWidth) || 1) * scale, lineCap: style.strokeLinecap, lineJoin: style.strokeLinejoin };
    }).filter(item => item && item.length > 0);
    hiddenSvg.remove();
    if (!records.length) throw new Error('SVG 中没有可绘制路径');
  }

  /* 5. 画布布局、启动与加载失败回退。 */
  function allocateCanvases() {
    sourceCanvas = document.createElement('canvas'); sourceCanvas.width = W; sourceCanvas.height = H;
    sourceCtx = sourceCanvas.getContext('2d');
    pixelCanvas = document.createElement('canvas');
    pixelCtx = pixelCanvas.getContext('2d', { willReadFrequently: true });
    const asciiCell = Math.max(1, Number(SETTINGS.asciiSize) || 12);
    asciiColumns = Math.ceil(W / asciiCell);
    const asciiRows = Math.ceil(H / asciiCell);
    asciiCanvas = document.createElement('canvas'); asciiCanvas.width = W; asciiCanvas.height = H;
    asciiCtx = asciiCanvas.getContext('2d');
    asciiGlyphs = new Int16Array(asciiColumns * asciiRows).fill(-1);
    baseMaskCanvas = document.createElement('canvas'); baseMaskCanvas.width = W; baseMaskCanvas.height = H;
    baseMaskCtx = baseMaskCanvas.getContext('2d');
    maskCanvas = document.createElement('canvas'); maskCanvas.width = W; maskCanvas.height = H;
    maskCtx = maskCanvas.getContext('2d');
    outputCanvas = document.createElement('canvas'); outputCanvas.width = W; outputCanvas.height = H;
    outputCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none;';
    outputCtx = outputCanvas.getContext('2d');
  }

  function calculateMaskFit() {
    const hostWidth = host.clientWidth || W;
    const hostHeight = host.clientHeight || H;
    const canvasAspect = W / H;
    const hostAspect = hostWidth / hostHeight;
    if (canvasAspect > hostAspect) {
      maskFit.scaleY = hostAspect / canvasAspect;
      maskFit.scaleX = 1;
    } else {
      maskFit.scaleX = canvasAspect / hostAspect;
      maskFit.scaleY = 1;
    }
    maskFit.offsetX = (W - W * maskFit.scaleX) / 2 + PATH_MASK_POSITION.x * W / hostWidth;
    maskFit.offsetY = (H - H * maskFit.scaleY) / 2 + PATH_MASK_POSITION.y * H / hostHeight;
  }

  async function boot() {
    host = document.getElementById('shan');
    image = host?.querySelector('img');
    if (!host || !image) { finishWithoutMask(); return; }
    try {
      await loadMaskSource();
      allocateCanvases();
      calculateMaskFit();
      if (image.decode) await image.decode().catch(() => {});
    } catch (error) {
      console.warn('[growth_mask_fx] 蒙版加载失败，显示原图：', error.message);
      finishWithoutMask();
      return;
    }
    window.whenAppReady(startReveal);
  }

  function finishWithoutMask() {
    clearTimeout(treeStartTimer);
    treeStartTimer = 0;
    window.__shanIntroOffsetY = 0;
    window.__shanRevealAnimating = false;
    window.__shanRevealDone = true;
    if (treeLayer) treeLayer.style.visibility = '';
    window.dispatchEvent(new Event('shan:reveal:tree-start'));
    window.dispatchEvent(new Event('shan:reveal:done'));
  }

  window.addEventListener('animations:replay', startReveal);
  window.addEventListener('DOMContentLoaded', boot, { once: true });
})();
