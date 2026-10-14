/* 主站加载门：资源/必要动画模块就绪后显示进度，按任意键或鼠标左键启动。 */
(function () {
  const screen = document.getElementById('loading-screen');
  const bar = document.getElementById('loading-progress');
  const label = screen.querySelector('.loading-label');
  const percent = document.getElementById('loading-percent');
  const images = [...document.images];
  const background = new Image();
  background.src = 'icon/背景图.webp';
  const assets = [...images, background];
  let fetchStarted = 0, fetchDone = 0, lastNetworkActivity = Date.now();
  let shown = 0, musicReady = false, shanReady = false;
  let audioLoaded = 0, audioTotal = 0, audioFailed = 0;
  let waitingForKey = false, starting = false;
  let releaseReady;

  window.__appReady = false;
  window.whenAppReady = callback => window.appReady.then(callback);
  window.appReady = new Promise(resolve => { releaseReady = resolve; });

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
    setTimeout(() => {
      screen.remove();
      window.__appReady = true;
      document.body.classList.add('is-app-ready');
      window.dispatchEvent(new Event('app:ready'));
      releaseReady();
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

  window.addEventListener('audio:load-progress', event => {
    audioLoaded = event.detail?.loaded ?? audioLoaded;
    audioTotal = event.detail?.total ?? audioTotal;
    audioFailed = event.detail?.failed ?? audioFailed;
    update();
  });

  function update() {
    const loaded = assets.filter(image => image.complete).length;
    const imageRatio = assets.length ? loaded / assets.length : 1;
    const fetchRatio = fetchStarted ? fetchDone / fetchStarted : 0;
    const visualRatio = imageRatio * .72 + fetchRatio * .28;
    // 未开始音频下载前最多显示 30%；之后进度随音频完成情况增长。
    const loadRatio = audioTotal
      ? visualRatio * .3 + (audioLoaded / audioTotal) * .7
      : Math.min(.3, visualRatio * .3);
    shown = Math.max(shown, Math.min(94, Math.round(94 * loadRatio)));
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
    label.textContent = audioFailed
      ? `音频加载完毕（${audioFailed} 项失败）· 按任意键继续`
      : '资源加载完成 · 按任意键继续';
    shown = 100;
    bar.style.width = '100%';
    percent.textContent = '100%';
    screen.classList.add('is-waiting');
    screen.setAttribute('aria-label', '资源加载完成，按任意键继续播放');
    waitingForKey = true;
  }

  finishWhenReady();
})();
