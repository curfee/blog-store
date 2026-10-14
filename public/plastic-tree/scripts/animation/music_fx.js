/* 氛围音乐、耳语与音乐开关。使用 Howler 管理媒体播放、淡化和结束/错误事件。 */
(function () {
  const TIMING = window.ANIMATION_TIMING?.music || {};
  const CFG = {
    dir: 'ambience/', ext: ['.mp3'], volume: 0.5,
    fadeIn: 700, fadeOut: 120, xfade: 700,
    wspDir: 'whisper/', wspExt: ['.mp3', '.wav'], wspVolume: 0.26,
    wspFadeIn: 300, wspFadeOut: 200, wspGapMin: 7000, wspGapMax: 14000,
    probeMax: 64, startDelay: TIMING.startDelay ?? 300,
    fallback: TIMING.fallback ?? 12000, hitPad: 14,
  };
  const NS = 'http://www.w3.org/2000/svg';
  const HIT = { x0: 2439, y0: 27, x1: 2522, y1: 109 };
  const SRC = {
    pause: 'icon/bottom_播放音乐.svg',
    play: 'icon/bottom_停止播放音乐.svg',
  };
  const Howl = window.Howl;
  if (!Howl) throw new Error('[music_fx] Howler.js 未加载');

  let tracks = [], wspTracks = [];
  let lastTrack = 0, lastWsp = 0;
  let state = 'boot';
  let current = null, next = null, whisper = null;
  let currentTrack = null, nextTrack = null;
  let currentId = null, nextId = null, whisperId = null;
  let crossfadeStarted = false, attempt = 0;
  let wspTimer = 0, crossfadeTimer = 0, autoStartTimer = 0, fallbackTimer = 0;
  let autoStartCancelled = false, startDoneHandler = null;
  let elPause = null, elPlay = null;

  function reportProgress(loaded, total, failed) {
    window.dispatchEvent(new CustomEvent('audio:load-progress', {
      detail: { loaded, total, failed },
    }));
  }

  async function probe(dir, exts) {
    const found = [];
    for (let n = 1; n <= CFG.probeMax; n++) {
      let hit = null;
      for (const ext of exts) {
        try {
          let response = await fetch(`${dir}${n}${ext}`, { method: 'HEAD' });
          if (response.status === 405 || response.status === 501) response = await fetch(`${dir}${n}${ext}`);
          if (response.ok) { hit = { n, ext }; break; }
          if (response.status !== 404) return found;
        } catch { return found; }
      }
      if (!hit) break;
      found.push(hit);
    }
    return found;
  }

  async function checkAudioUrls() {
    const entries = [
      ...tracks.map(track => ({ url: `${CFG.dir}${track.n}${track.ext}`, track })),
      ...wspTracks.map(track => ({ url: `${CFG.wspDir}${track.n}${track.ext}`, track })),
      { url: 'sound_effect/hover_snd.wav' },
      { url: 'sound_effect/clicked_snd.wav' },
    ];
    let done = 0, failed = 0, cursor = 0;
    reportProgress(done, entries.length, failed);
    const worker = async () => {
      while (cursor < entries.length) {
        const { url, track } = entries[cursor++];
        try {
          let response = await fetch(url, { method: 'HEAD', cache: 'force-cache' });
          if (response.status === 405 || response.status === 501) {
            response = await fetch(url, { cache: 'force-cache' });
          }
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
        } catch (error) {
          failed++;
          if (track) track.preloadFailed = true;
          console.warn(`[music_fx] 音频资源检查失败：${url}`, error.message);
        } finally {
          done++;
          reportProgress(done, entries.length, failed);
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, entries.length) }, worker));
    tracks = tracks.filter(track => !track.preloadFailed);
    wspTracks = wspTracks.filter(track => !track.preloadFailed);
    window.dispatchEvent(new Event('audio:check-complete'));
  }

  function ui() {
    if (!elPause || !elPlay) return;
    const playing = state === 'playing';
    elPause.style.visibility = playing ? 'visible' : 'hidden';
    elPlay.style.visibility = playing ? 'hidden' : 'visible';
  }

  function pick(list, last) {
    if (!list.length) return null;
    const pool = list.filter(track => track.n !== last);
    return (pool.length ? pool : list)[Math.floor(Math.random() * (pool.length || list.length))];
  }

  function setActive(track, slot) {
    const token = ++attempt;
    const howl = new Howl({
      src: [`${CFG.dir}${track.n}${track.ext}`],
      html5: true,
      preload: true,
      volume: 0,
      onplay: id => {
        if (slot === 'current') {
          if (token !== attempt || current !== howl) return;
          currentId = id;
          currentTrack = track;
          state = 'playing';
          ui();
          howl.fade(0, CFG.volume, CFG.fadeIn, id);
        } else {
          if (next !== howl) return;
          const outgoing = current;
          const outgoingId = currentId;
          nextId = id;
          current = howl;
          currentId = id;
          currentTrack = track;
          next = null;
          nextId = null;
          curIndex = 1 - curIndex;
          crossfadeStarted = false;
          howl.fade(0, CFG.volume, CFG.xfade, id);
          if (outgoing && outgoingId != null) {
            outgoing.fade(outgoing.volume(outgoingId), 0, CFG.xfade, outgoingId);
            outgoing.once('fade', () => outgoing.pause(outgoingId), outgoingId);
          }
          ui();
        }
      },
      onend: id => {
        if (current === howl && currentId === id && state === 'playing' && !crossfadeStarted) {
          playNextTrack();
        }
      },
      onplayerror: (id, error) => {
        if (slot === 'next') {
          if (next === howl) { next = null; nextId = null; crossfadeStarted = false; }
          console.warn('[music_fx] 交叉淡化的下一曲播放失败，将由曲尾兜底：', error);
          return;
        }
        if (current !== howl || token !== attempt) return;
        state = 'idle'; ui();
        console.warn('[music_fx] 播放未获浏览器授权或播放失败：', error);
        armGestureStart();
      },
      onloaderror: (id, error) => {
        console.warn(`[music_fx] 音频加载失败：${track.n}${track.ext}`, error);
        const index = tracks.findIndex(item => item.n === track.n && item.ext === track.ext);
        if (index >= 0) tracks.splice(index, 1);
        if (slot === 'current' && (state === 'starting' || state === 'playing') && tracks.length) playNextTrack();
        if (slot === 'next') {
          next = null;
          nextId = null;
          crossfadeStarted = false;
        }
      },
    });
    if (slot === 'current') current = howl;
    else next = howl;
    // 在用户手势调用栈内请求播放；Howler 会在加载完成后续播。
    const id = howl.play();
    if (slot === 'current') currentId = id;
    else nextId = id;
    return howl;
  }

  let curIndex = 0;
  function playTrack(track) {
    if (!track) { state = 'idle'; ui(); return; }
    clearTimeout(wspTimer);
    crossfadeStarted = false;
    state = 'starting';
    ui();
    const old = current;
    const oldId = currentId;
    current = null;
    currentId = null;
    if (old && oldId != null) old.stop(oldId);
    lastTrack = track.n;
    setActive(track, 'current');
    scheduleWhisper();
  }

  function playNextTrack() {
    const track = pick(tracks, lastTrack);
    if (track) playTrack(track);
    else { state = 'idle'; ui(); }
  }

  function beginCrossfade() {
    if (state !== 'playing' || crossfadeStarted || !current || currentId == null || !tracks.length) return;
    crossfadeStarted = true;
    const track = pick(tracks, lastTrack);
    if (!track) { crossfadeStarted = false; return; }
    lastTrack = track.n;
    setActive(track, 'next');
  }

  function monitorCrossfade() {
    clearInterval(crossfadeTimer);
    crossfadeTimer = setInterval(() => {
      if (state !== 'playing' || crossfadeStarted || !current || currentId == null) return;
      const duration = current.duration(currentId);
      const position = current.seek(currentId);
      if (duration > 0 && duration - position <= CFG.xfade / 1000) beginCrossfade();
    }, 100);
  }

  function scheduleWhisper(delay) {
    clearTimeout(wspTimer);
    wspTimer = setTimeout(playWhisper, delay ?? (CFG.wspGapMin + Math.random() * (CFG.wspGapMax - CFG.wspGapMin)));
  }

  function playWhisper() {
    if (state !== 'playing' || !wspTracks.length) return;
    const track = pick(wspTracks, lastWsp);
    if (!track) return;
    lastWsp = track.n;
    const sound = new Howl({
      src: [`${CFG.wspDir}${track.n}${track.ext}`], html5: true, preload: true, volume: 0,
      onplay: id => { whisper = sound; whisperId = id; sound.fade(0, CFG.wspVolume, CFG.wspFadeIn, id); },
      onend: () => scheduleWhisper(),
      onloaderror: () => scheduleWhisper(),
      onplayerror: () => scheduleWhisper(),
    });
    whisper = sound;
    whisperId = sound.play();
  }

  function stopPlayback() {
    if (state !== 'playing' && state !== 'starting') return;
    autoStartCancelled = true;
    attempt++;
    clearTimeout(wspTimer);
    clearTimeout(autoStartTimer);
    clearTimeout(fallbackTimer);
    clearInterval(crossfadeTimer);
    if (startDoneHandler) window.removeEventListener('start:done', startDoneHandler);
    startDoneHandler = null;
    state = 'stopped';
    ui();
    [[current, currentId, CFG.fadeOut], [next, nextId, CFG.fadeOut], [whisper, whisperId, CFG.wspFadeOut]].forEach(([sound, id, duration]) => {
      if (!sound || id == null) return;
      sound.fade(sound.volume(id), 0, duration, id);
      sound.once('fade', () => sound.pause(id), id);
    });
    next = null; nextId = null; crossfadeStarted = false;
  }

  function startChain(manual = false) {
    if (state === 'playing' || state === 'starting' || (!manual && state === 'stopped')) return;
    if (tracks.length) { playNextTrack(); return; }
    if (manual) refreshTracks().then(() => { if (tracks.length && state !== 'stopped') playNextTrack(); });
  }

  function inHit(clientX, clientY) {
    const stage = document.getElementById('stage');
    if (!stage) return false;
    const rect = stage.getBoundingClientRect(), scale = 2560 / rect.width;
    const x = (clientX - rect.left) * scale, y = (clientY - rect.top) * scale;
    return x >= HIT.x0 && x <= HIT.x1 && y >= HIT.y0 && y <= HIT.y1;
  }

  let gestureArmed = false;
  function armGestureStart() {
    if (gestureArmed) return;
    gestureArmed = true;
    const resume = event => {
      if (event.type === 'pointerdown' && inHit(event.clientX, event.clientY)) return;
      window.removeEventListener('pointerdown', resume);
      window.removeEventListener('keydown', resume);
      gestureArmed = false;
      if (state === 'idle') startChain(true);
    };
    window.addEventListener('pointerdown', resume);
    window.addEventListener('keydown', resume);
  }

  function bindClick() {
    let hover = false;
    window.addEventListener('pointermove', event => {
      const hit = inHit(event.clientX, event.clientY);
      if (hit !== hover) { hover = hit; document.body.style.cursor = hit ? 'pointer' : ''; }
    }, { passive: true });
    window.addEventListener('pointerdown', event => {
      if (!inHit(event.clientX, event.clientY)) return;
      event.preventDefault();
      if (state === 'playing' || state === 'starting') stopPlayback();
      else startChain(true);
    });
  }

  async function inline(hostId, src) {
    const host = document.getElementById(hostId);
    if (!host) return null;
    try {
      let text = await (await fetch(src)).text();
      text = text.replace(/id="([^"]+)"/g, (_, id) => `id="mu--${id}"`)
        .replace(/url\(#([^)]+)\)/g, (_, id) => `url(#mu--${id})`)
        .replace(/href="#([^"]+)"/g, (_, id) => `href="#mu--${id}"`);
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const svg = document.importNode(doc.querySelector('svg'), true);
      svg.querySelector('#mu--画板长宽')?.remove();
      svg.style.cssText = 'display:block;width:100%;height:100%;';
      host.querySelector('img')?.remove();
      host.appendChild(svg);
      return host;
    } catch (error) {
      console.warn(`[music_fx] 音乐按钮加载失败：${src}`, error);
      return null;
    }
  }

  async function init() {
    const [pauseHost, playHost, ambience, whispers] = await Promise.all([
      inline('music-pause', SRC.pause),
      inline('music-play', SRC.play),
      probe(CFG.dir, CFG.ext),
      probe(CFG.wspDir, CFG.wspExt),
    ]);
    elPause = pauseHost;
    elPlay = playHost;
    tracks = ambience;
    wspTracks = whispers;
    await checkAudioUrls();
    bindClick();
    state = 'idle';
    ui();
    monitorCrossfade();
    startDoneHandler = () => {
      if (!autoStartCancelled) autoStartTimer = setTimeout(() => startChain(), CFG.startDelay);
      startDoneHandler = null;
    };
    window.addEventListener('start:done', startDoneHandler, { once: true });
    window.whenAppReady(() => { fallbackTimer = setTimeout(() => startChain(), CFG.fallback); });
    window.__music = {
      get state() { return state; }, get tracks() { return tracks.slice(); },
      get wspTracks() { return wspTracks.slice(); }, get lastTrack() { return lastTrack; },
      get current() { return current; }, get currentTrack() { return currentTrack; },
      get currentId() { return currentId; }, get cur() { return curIndex; }, cfg: CFG,
      playNext: playNextTrack, stopPlayback, playWhisper, refreshTracks: probe,
    };
    window.dispatchEvent(new Event('music:ready'));
  }

  function refreshTracks() {
    return Promise.all([probe(CFG.dir, CFG.ext), probe(CFG.wspDir, CFG.wspExt)]).then(([ambience, whispers]) => {
      tracks = ambience;
      wspTracks = whispers;
    });
  }

  window.addEventListener('DOMContentLoaded', init, { once: true });
})();
