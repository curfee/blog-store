/* 主站加载门：资源/必要动画模块就绪后显示进度，按任意键或鼠标左键启动。 */
(function () {
  const screen = document.getElementById('loading-screen');
  const bar = document.getElementById('loading-progress');
  const label = screen.querySelector('.loading-label');
  const percent = document.getElementById('loading-percent');
  const images = [...document.images];
  const background = new Image();
  background.src = 'icon/背景图.webp';
  const backgroundMask = new Image();
  backgroundMask.src = 'icon/背景底图_mask.svg';
  const assets = [...images, background, backgroundMask];
  let fetchStarted = 0, fetchDone = 0, lastNetworkActivity = Date.now();
  let shown = 0, musicReady = false, shanReady = false;
  let waitingForKey = false, starting = false;
  let releaseReady;
  let shanStyleBeforeReady = null;

  window.__appReady = false;
  window.whenAppReady = callback => window.appReady.then(callback);
  window.appReady = new Promise(resolve => { releaseReady = resolve; });

  // 全动画重播采用 reset → T0 背景揭示 → start 顺序，后续动画可监听 replay:start 接入。
  let replayToken = 0;
  let replayTimer = 0;
  let backgroundCoverAnimations = [];
  let shanStyleBeforeReplay = null;

  function readShanVisibilityState(layer) {
    if (!layer) return null;
    return { visibility: layer.style.visibility, opacity: layer.style.opacity };
  }

  function hideShan(layer) {
    if (!layer) return;
    layer.style.visibility = 'hidden';
    layer.style.opacity = '0';
  }

  function restoreShan(layer, state) {
    if (!layer || !state) return;
    layer.style.visibility = state.visibility;
    layer.style.opacity = state.opacity;
  }

  function resetBackgroundCoverLayer(layer, halftone) {
    if (!layer) return null;
    layer.style.transition = 'none';
    layer.getAnimations().forEach(animation => animation.cancel());
    layer.classList.remove('is-revealing');
    layer.style.setProperty('--background-mask-reveal-size', '0px');
    layer.style.visibility = 'hidden';
    layer.style.opacity = '0';
    void layer.offsetWidth;
  }

  function showBackgroundCoverWhenReady(layer, animation = null) {
    requestAnimationFrame(() => {
      if (!layer?.isConnected || animation?.playState === 'idle') return;
      layer.style.visibility = 'visible';
      layer.style.opacity = '1';
    });
  }

  function playBackgroundCover(layer, duration, halftone) {
    if (!layer) return Promise.resolve();
    resetBackgroundCoverLayer(layer, halftone);
    layer.classList.add('is-revealing');
    const size = getComputedStyle(document.documentElement)
      .getPropertyValue('--background-mask-size').trim() || '5760px';
    const finalSize = size.split(/\s+/)[0] || '5760px';
    try {
      // 只动画扩散尺寸自定义属性；点阵大小继续由 CSS 变量实时控制。
      const animation = layer.animate(
        [
          { '--background-mask-reveal-size': '0px' },
          { '--background-mask-reveal-size': finalSize },
        ],
        { duration, easing: 'ease-in-out', fill: 'both' }
      );
      backgroundCoverAnimations.push(animation);
      // 等动画的 0% 关键帧先提交，再露出图层，避免复位前一轮的遮罩状态闪一帧。
      showBackgroundCoverWhenReady(layer, animation);
      return animation.finished.catch(() => {});
    } catch (error) {
      console.warn('[app_bootstrap] 背景遮罩动画启动失败，直接完成遮罩：', error);
      layer.style.setProperty('--background-mask-reveal-size', finalSize);
      showBackgroundCoverWhenReady(layer);
      return new Promise(resolve => setTimeout(resolve, duration));
    }
  }

  async function playBackgroundCoverPair(duration, shouldContinue = () => true) {
    const halftoneLayer = document.getElementById('ditu');
    const smoothLayer = document.getElementById('ditu-smooth');
    // 两层先同时归零，平滑层延迟期间不会盖住半调层。
    resetBackgroundCoverLayer(smoothLayer, false);
    const halftoneAnimation = playBackgroundCover(halftoneLayer, duration, true);
    const configuredDelay = window.ANIMATION_TIMING?.backgroundCover?.smoothLayerDelay;
    const smoothDelay = Number.isFinite(Number(configuredDelay))
      ? Math.max(0, Number(configuredDelay))
      : 200;
    if (smoothDelay) await new Promise(resolve => setTimeout(resolve, smoothDelay));
    if (!shouldContinue()) return;
    const smoothAnimation = playBackgroundCover(smoothLayer, duration, false);
    await Promise.all([halftoneAnimation, smoothAnimation]);
  }

  function waitForBackgroundCoverDelay() {
    const delay = Math.max(0, Number(window.ANIMATION_TIMING.backgroundCover?.startDelay) || 0);
    return delay ? new Promise(resolve => setTimeout(resolve, delay)) : Promise.resolve();
  }

  window.addEventListener('animations:replay', () => {
    const token = ++replayToken;
    clearTimeout(replayTimer);
    // 延迟期冻结当前已显示的遮罩帧；若此时直接 cancel/reset，0px 遮罩会让底下
    // 的红黑覆盖图整幅露出 300ms，看起来像遮罩闪现。真正开播前再统一归零。
    backgroundCoverAnimations.forEach(animation => {
      if (animation.playState === 'running') animation.pause();
    });
    const shanLayer = document.getElementById('shan');
    // 连点时沿用首轮隐藏前的状态；不能把上一轮写入的 `hidden` 当作恢复值。
    if (shanStyleBeforeReplay === null) {
      shanStyleBeforeReplay = readShanVisibilityState(shanLayer);
    }
    hideShan(shanLayer);

    const revealDuration = Math.max(0, Number(window.ANIMATION_TIMING.backgroundCover?.duration) || 600);
    if (document.getElementById('ditu') || document.getElementById('ditu-smooth')) {
      requestAnimationFrame(async () => {
        await waitForBackgroundCoverDelay();
        if (token !== replayToken) return;
        backgroundCoverAnimations.forEach(animation => animation.cancel());
        backgroundCoverAnimations = [];
        await playBackgroundCoverPair(revealDuration, () => token === replayToken);
        finishReplayT0();
      });
    } else {
      replayTimer = setTimeout(finishReplayT0, Math.max(0, Number(window.ANIMATION_TIMING.backgroundCover?.startDelay) || 0));
    }

    function finishReplayT0() {
      if (token !== replayToken) return;
      const previousState = shanStyleBeforeReplay;
      window.dispatchEvent(new CustomEvent('animations:replay:start', {
        detail: { source: 'replay-all-button', t0: 'background-cover' },
      }));
      // 让监听器先同步创建 0% 蒙版并隐藏原图，下一帧才恢复整个 shan 容器。
      requestAnimationFrame(() => {
        if (token !== replayToken) return;
        restoreShan(shanLayer, previousState);
        shanStyleBeforeReplay = null;
      });
    }
  });

  // 加载与等待按键期间阻止全局动画和画布交互监听器收到输入。
  ['pointermove', 'pointerdown', 'pointerup', 'click', 'keydown'].forEach(type => {
    window.addEventListener(type, event => {
      if (!window.__appReady && !(['keydown', 'pointerdown'].includes(type) && waitingForKey)) {
        event.stopImmediatePropagation();
      }
    }, true);
  });

  window.addEventListener('keydown', event => {
    if (!waitingForKey || starting) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    startAfterReadyInput();
  }, true);
  window.addEventListener('pointerdown', event => {
    if (!waitingForKey || starting || event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    startAfterReadyInput();
  }, true);

  function startAfterReadyInput() {
    if (starting) return;
    starting = true;
    screen.classList.remove('is-waiting');
    screen.classList.add('is-ready');
    setTimeout(async () => {
      screen.remove();
      // 隐藏整个 shan 容器（包括 shan_fx 追加的字符画布），避免只藏主图时字符层仍残留。
      const shanLayer = document.getElementById('shan');
      const previousShanState = shanStyleBeforeReady;
      hideShan(shanLayer);
      const revealDuration = Math.max(0, Number(window.ANIMATION_TIMING.backgroundCover?.duration) || 600);
      await waitForBackgroundCoverDelay();
      await playBackgroundCoverPair(revealDuration);
      window.__appReady = true;
      document.body.classList.add('is-app-ready');
      window.dispatchEvent(new Event('app:ready'));
      releaseReady();
      // appReady 的回调会同步激活 growth_mask_fx、隐藏原图及 shan_fx 画布后，才在下一帧露出容器。
      requestAnimationFrame(() => {
        restoreShan(shanLayer, previousShanState);
        shanStyleBeforeReady = null;
      });
    }, window.ANIMATION_TIMING.loading.fadeDuration);
  }

  const originalFetch = window.fetch.bind(window);
  window.fetch = (...args) => {
    fetchStarted++;
    lastNetworkActivity = Date.now();
    update();
    return originalFetch(...args).finally(() => {
      fetchDone++;
      lastNetworkActivity = Date.now();
      update();
    });
  };

  function update() {
    const loaded = assets.filter(image => image.complete).length;
    const imageRatio = assets.length ? loaded / assets.length : 1;
    const fetchRatio = fetchStarted ? fetchDone / fetchStarted : 0;
    shown = Math.max(shown, Math.min(94, Math.round(94 * (imageRatio * .72 + fetchRatio * .28))));
    bar.style.width = `${shown}%`;
    percent.textContent = `${shown}%`;
  }

  assets.forEach(image => {
    image.addEventListener('load', update, { once: true });
    image.addEventListener('error', update, { once: true });
  });
  window.addEventListener('music:ready', () => { musicReady = true; }, { once: true });
  window.addEventListener('shan:ready', () => { shanReady = true; }, { once: true });
  update();

  async function finishWhenReady() {
    if (document.readyState !== 'complete') {
      await new Promise(resolve => window.addEventListener('load', resolve, { once: true }));
    }
    await Promise.all(assets.map(image => image.decode ? image.decode().catch(() => {}) : Promise.resolve()));
    await document.fonts.ready;
    while (!musicReady || !shanReady || fetchDone < fetchStarted || Date.now() - lastNetworkActivity < 700) {
      update();
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // 资源已就绪、进入“按任意键继续”待机状态时先隐藏 shan 的整层（含字符画布）。
    const shanLayer = document.getElementById('shan');
    if (shanLayer) {
      shanStyleBeforeReady = readShanVisibilityState(shanLayer);
      hideShan(shanLayer);
    }
    label.textContent = '资源加载完成 · 按任意键继续';
    shown = 100;
    bar.style.width = '100%';
    percent.textContent = '100%';
    screen.classList.add('is-waiting');
    screen.setAttribute('aria-label', '资源加载完成，按任意键继续播放');
    waitingForKey = true;
  }

  finishWhenReady();
})();
