/* 音乐开关 + 氛围曲无限叠化 + 耳语随机层（2026-10-12 v2）
   素材命名与显示状态相反（用户定稿的状态指示语义，勿"修正"文件名）：
   - icon/bottom_播放音乐.svg    = ⏸ 暂停符 → 音乐【播放中】显示，**点击停止**
   - icon/bottom_停止播放音乐.svg = ▶ 播放符 →【停止时】显示，**点击继续**
   两图标同位置（画布右上 ~(2453,41)-(2508,96)），同一命中框，互斥显隐。

   播放规则（用户 12:23 + 13:10 指定）：
   1. 开场动画全部结束（start:done，兜底 FALLBACK）自动开播 ambience；
      浏览器拦截自动播放时退化为等首次 pointerdown/keydown
   2. ambience（ambience/1.mp3…N.mp3）：**无间断**——当前曲剩余 ≤ xfade(700ms) 时
      另一层叠加下一首（next 0→volume 淡入、current →0 淡出，交叉叠化），
      随机选曲不重复上一首；用户点击停止时两层一起淡出暂停
   3. whisper（whisper/1.mp3…N.mp3，可多扩展名混合）：音乐播放的同时，
      每声耳语结束后随机静默 wspGap(7-14s) 再随机播下一声（不重复）；
      音乐停止时耳语同步淡出停止、定时器清空；继续播放时重新排程
   4. 淡入淡出一律 setInterval 50ms 线性插值（rAF 在后台标签页会停摆，
      音频在后台仍播放，叠化必须能跑完）；fadeToken 作废被覆盖的旧渐变 */
(function () {
  /* ==================== 用户自助调整区（改完刷新即生效） ==================== */
  const TIMING = window.ANIMATION_TIMING?.music || {};
  const CFG = {
    /* ambience 主层 */
    dir: 'ambience/',     // 曲目目录
    ext: ['.mp3'],        // 探测扩展名（按顺序，命中即止）
    volume: 0.5,          // 正常音量 0~1
    fadeIn: 700,          // 开播淡入 ms（音量 0 → volume）
    fadeOut: 120,         // 点击停止的淡出 ms
    xfade: 700,           // 曲间叠化 ms：当前曲结束提前这么久叠加下一首
    /* whisper 耳语层 */
    wspDir: 'whisper/',
    wspExt: ['.mp3', '.wav'],
    wspVolume: 0.26,
    wspFadeIn: 300,       // 每声耳语淡入 ms
    wspFadeOut: 200,      // 停止时的耳语淡出 ms
    wspGapMin: 7000,      // 耳语间随机静默下限 ms（也是开场后第一声的等待区间）
    wspGapMax: 14000,
    /* 通用 */
    probeMax: 64,         // 曲目探测上限（1..probeMax）
    startDelay: TIMING.startDelay ?? 300,      // 开场结束(start:done)后多久开播
    fallback: TIMING.fallback ?? 12000,        // 兜底：开场事件未送达也开播的等待 ms
    hitPad: 14,           // 点击判定外扩 px（画布单位）
  };
  /* ======================================================================== */
  const HIT = { x0: 2439, y0: 27, x1: 2522, y1: 109 };  // 图标包围盒+hitPad（画布坐标）
  const SRC = {
    pause: 'icon/bottom_播放音乐.svg',   // ⏸ 播放中显示
    play: 'icon/bottom_停止播放音乐.svg', // ▶ 停止时显示
  };
  const PREFIX = 'mu--';

  /* ---- 双层 ambience（叠化需要两个元素交替）+ whisper 独立元素 ---- */
  const layers = [new Audio(), new Audio()];
  layers.forEach((a) => { a.preload = 'auto'; });
  const wsp = new Audio();
  wsp.preload = 'auto';
  let cur = 0;                       // 当前 ambience 层索引

  let tracks = [];                   // ambience 曲目 [{n, ext}...]
  let wspTracks = [];                // whisper 曲目 [{n, ext}...]
  let lastTrack = 0, lastWsp = 0;    // 不重复上一首
  let state = 'boot';                // boot→idle(开场中)→playing⇄stopped
  let wspTimer = 0;
  let autoStartTimer = 0, fallbackTimer = 0;
  let autoStartCancelled = false, startToken = 0, startDoneHandler = null;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp01 = (v) => Math.min(1, Math.max(0, v));

  /* ---- 淡入淡出（setInterval 50ms；rAF 在后台标签页停摆，音频淡出不能依赖它） ---- */
  function fadeTo(el, target, dur, then) {
    const tok = (el._ft = (el._ft || 0) + 1);
    const from = el.volume, t0 = performance.now();
    clearInterval(el._fi);
    el._fi = setInterval(() => {
      if (el._ft !== tok) { clearInterval(el._fi); return; }
      const u = Math.min(1, (performance.now() - t0) / dur);
      el.volume = clamp01(from + (target - from) * u);
      if (u >= 1) { clearInterval(el._fi); if (then) then(); }
    }, 50);
  }

  /* ---- UI：互斥显隐（pointer-events 始终 none，点击走画布坐标） ---- */
  let elPause = null, elPlay = null;
  function ui() {
    if (!elPause || !elPlay) return;
    elPause.style.visibility = state === 'playing' ? 'visible' : 'hidden';
    elPlay.style.visibility  = state === 'playing' ? 'hidden'  : 'visible';
  }

  function pick(list, lastKey, last) {
    const pool = list.filter((t) => t.n !== last);
    const src = pool.length ? pool : list;
    const t = src[Math.floor(Math.random() * src.length)];
    lastKey === 'amb' ? (lastTrack = t.n) : (lastWsp = t.n);
    return t;
  }

  /* ---- ambience：开播/继续（在当前层） ---- */
  function playTrack(t) {
    clearTimeout(wspTimer);
    state = 'playing';
    ui();
    const a = layers[cur];
    layers[1 - cur].pause();
    fadeTo(layers[1 - cur], 0, 60);
    fadeTo(a, 0, 1);                   // 作废旧渐变
    a.src = CFG.dir + t.n + t.ext;
    a.volume = 0;
    a.play().catch((e) => {
      console.warn('[music_fx] 自动播放被拦截，等待首次点击/按键：', e.message);
      state = 'idle';
      ui();
      armGestureStart();
    });
    fadeTo(a, CFG.volume, CFG.fadeIn);
    scheduleWhisper();                 // whisper 同节奏排程（7-14s 后第一声）
  }
  function playNext() { playTrack(pick(tracks, 'amb', lastTrack)); }

  /* ---- 曲目刷新：每次开播前重新探测（用户在页面打开期间往文件夹加曲也能捡起） ---- */
  async function refreshTracks() {
    [tracks, wspTracks] = await Promise.all([
      probe(CFG.dir, CFG.ext),
      probe(CFG.wspDir, CFG.wspExt),
    ]);
  }

  /* ---- ambience：叠化——当前曲剩余 ≤ xfade 时另一层叠加下一首 ---- */
  layers.forEach((a, idx) => a.addEventListener('timeupdate', () => {
    if (state !== 'playing' || layers[cur] !== a) return;
    if (!isFinite(a.duration) || a.duration - a.currentTime > CFG.xfade / 1000) return;
    const na = layers[1 - idx];
    const t = pick(tracks, 'amb', lastTrack);
    na.src = CFG.dir + t.n + t.ext;
    na.volume = 0;
    na.play().catch(() => {});
    fadeTo(na, CFG.volume, CFG.xfade);
    fadeTo(a, 0, CFG.xfade, () => a.pause());
    cur = 1 - idx;
  }));

  /* ---- whisper：耳语层（仅音乐 playing 时；受 ⏸/▶ 控制） ---- */
  function scheduleWhisper(delay) {
    clearTimeout(wspTimer);
    wspTimer = setTimeout(playWhisper, delay ?? rand(CFG.wspGapMin, CFG.wspGapMax));
  }
  function playWhisper() {
    if (state !== 'playing' || !wspTracks.length) return;
    const t = pick(wspTracks, 'wsp', lastWsp);
    wsp.src = CFG.wspDir + t.n + t.ext;
    wsp.volume = 0;
    wsp.play().catch(() => scheduleWhisper());   // 策略拒绝/失败：静默后按原节奏重试
    fadeTo(wsp, CFG.wspVolume, CFG.wspFadeIn);
  }
  wsp.addEventListener('ended', () => scheduleWhisper());

  /* ---- 停止 / 继续 ---- */
  function stopPlayback() {
    if (state !== 'playing') return;
    autoStartCancelled = true;
    startToken++;                      // 使正在等待曲目探测的旧启动请求失效
    clearTimeout(autoStartTimer);
    clearTimeout(fallbackTimer);
    if (startDoneHandler) {
      window.removeEventListener('start:done', startDoneHandler);
      startDoneHandler = null;
    }
    clearTimeout(wspTimer);
    state = 'stopped';
    ui();
    layers.forEach((a) => fadeTo(a, 0, CFG.fadeOut, () => a.pause()));
    fadeTo(wsp, 0, CFG.wspFadeOut, () => wsp.pause());
  }
  async function startChain(manual = false) { // 自动开播 / ▶ 点击
    if (state === 'playing') return;
    if (state === 'stopped' && !manual) return;
    const token = startToken;
    // 用户手势触发时，必须在手势调用栈内调用 play()；不要先等待串行 HEAD 探测，
    // 否则浏览器会丢失短暂的用户激活授权并拦截播放。已探测曲目先立即播放，之后后台刷新。
    if (manual && tracks.length) {
      playNext();
      refreshTracks();
      return;
    }
    await refreshTracks();             // 自动开播或初次无缓存时重新探测曲目
    if (token !== startToken || state === 'playing' ||
        (state === 'stopped' && !manual) || !tracks.length) return;
    playNext();
  }

  /* ---- 自动播放被拦截时：首次 pointerdown/keydown 即开播（once） ---- */
  function armGestureStart() {
    const go = () => { startChain(true); };
    window.addEventListener('pointerdown', go, { once: true });
    window.addEventListener('keydown', go, { once: true });
  }

  /* ---- 点击判定：画布坐标命中框（两图标同位置） ---- */
  function bindClick() {
    const stage = document.getElementById('stage');
    const inHit = (cx, cy) => {
      const r = stage.getBoundingClientRect(), k = 2560 / r.width;
      const x = (cx - r.left) * k, y = (cy - r.top) * k;
      return x >= HIT.x0 && x <= HIT.x1 && y >= HIT.y0 && y <= HIT.y1;
    };
    let hover = false;
    window.addEventListener('pointermove', (e) => {
      const h = inHit(e.clientX, e.clientY);
      if (h !== hover) { hover = h; document.body.style.cursor = h ? 'pointer' : ''; }
    }, { passive: true });
    window.addEventListener('pointerdown', (e) => {
      if (!inHit(e.clientX, e.clientY)) return;
      if (state === 'playing') stopPlayback();          // ⏸ 点击 → 停止
      else startChain(true);                            // ▶ 点击 → 手动继续/开播
    });
  }

  /* ---- 曲目探测：1 起连续探测，某编号所有扩展名都不存在即止 ---- */
  async function probe(dir, exts) {
    const found = [];
    for (let i = 1; i <= CFG.probeMax; i++) {
      let hit = null;
      for (const ext of exts) {
        const url = dir + i + ext;
        try {
          let r = await fetch(url, { method: 'HEAD' });
          if (r.status === 405 || r.status === 501) r = await fetch(url);
          if (r.ok) { hit = { n: i, ext }; break; }
          if (r.status !== 404) return found;           // 服务器异常，停止探测
        } catch (e) { return found; }
      }
      if (!hit) break;
      found.push(hit);
    }
    return found;
  }

  /* ---- 内联 SVG：剥画板长宽底、渐变/clip id 加前缀 ---- */
  async function inline(hostId, src) {
    const host = document.getElementById(hostId);
    if (!host) return null;
    let txt;
    try { txt = await (await fetch(src)).text(); }
    catch (e) { console.warn('[music_fx] 按钮加载失败：', src, e.message); return null; }
    txt = txt.replace(/id="([^"]+)"/g, (m, id) => `id="${PREFIX}${id}"`)
             .replace(/url\(#([^)]+)\)/g, (m, id) => `url(#${PREFIX}${id})`)
             .replace(/href="#([^"]+)"/g, (m, id) => `href="#${PREFIX}${id}"`);
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
    const svg = document.importNode(doc.querySelector('svg'), true);
    svg.querySelector(`#${PREFIX}画板长宽`)?.remove();
    svg.style.cssText = 'display:block;width:100%;height:100%;';
    host.querySelector('img')?.remove();
    host.appendChild(svg);
    return svg;
  }

  async function init() {
    const [svgP, svgR] = await Promise.all([
      inline('music-pause', SRC.pause),
      inline('music-play', SRC.play),
    ]);
    elPause = svgP ? document.getElementById('music-pause') : null;
    elPlay = svgR ? document.getElementById('music-play') : null;
    [tracks, wspTracks] = await Promise.all([
      probe(CFG.dir, CFG.ext),
      probe(CFG.wspDir, CFG.wspExt),
    ]);
    if (!tracks.length) console.warn('[music_fx] ambience/ 下未探测到曲目');
    if (!wspTracks.length) console.warn('[music_fx] whisper/ 下未探测到耳语');
    bindClick();
    state = 'idle';
    ui();                              // 开场中：显示 ▶（点击可提前手动开播）

    /* 开场动画全部结束后自动开播（start_fx 完成后派发 start:done；兜底 FALLBACK） */
    startDoneHandler = () => {
      if (!autoStartCancelled) autoStartTimer = setTimeout(() => startChain(), CFG.startDelay);
      startDoneHandler = null;
    };
    window.addEventListener('start:done', startDoneHandler, { once: true });
    window.whenAppReady(() => {
      fallbackTimer = setTimeout(() => startChain(), CFG.fallback);
    });

    /* 测试/调试句柄（控制台可观察状态） */
    window.__music = {
      get state() { return state; }, get tracks() { return tracks.slice(); },
      get wspTracks() { return wspTracks.slice(); }, get lastTrack() { return lastTrack; },
      layers, wsp, audio: layers[cur], get cur() { return cur; }, cfg: CFG,
      playNext, stopPlayback, scheduleWhisper, playWhisper, refreshTracks,
    };
    window.dispatchEvent(new Event('music:ready'));
  }

  window.addEventListener('DOMContentLoaded', init);
})();
