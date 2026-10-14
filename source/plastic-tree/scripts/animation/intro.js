/* 入场编排 (v2)
   - quyu-l / quyu-r 区域构成：透明度缓出淡入（左侧先、右侧稍后）
   - pinkglow 圆形_颜色淡化滤镜：等 curves.js 路径生长簇全部完成后，
     透明度 0→1 浮现 + 向上缓动归位（缓动 cubic-bezier(0.632, 0.004, 0.608, 1)）
   （线段层的生长动画已迁移至 curves.js 的矢量路径引擎） */
(function () {
  /* ===== 可调参数 ===== */
  const TIMING = window.ANIMATION_TIMING?.intro || {};
  const QUYU_START   = TIMING.quyuLeftDelay ?? 1200;   // 左块开始 ms
  const QUYU_GAP     = TIMING.quyuRightGap ?? 350;     // 右块相对延迟 ms
  const QUYU_DUR     = TIMING.quyuFadeDuration ?? 1200; // 淡入时长 ms
  const QUYU_EASE    = 'cubic-bezier(0.16, 1, 0.3, 1)';  // 缓出
  // pinkglow 入场
  const PINK_DUR     = TIMING.pinkDuration ?? 4000;    // 浮现时长 ms
  const PINK_EASE    = 'cubic-bezier(0.632, 0.004, 0.608, 1)';
  const PINK_RISE    = TIMING.pinkRise ?? 60;          // 起始下移量 px（向上归位）
  const PINK_FALLBACK= TIMING.pinkFallback ?? 8000;    // 生长事件未送达时的兜底等待 ms

  window.addEventListener('DOMContentLoaded', () => {
    const regions = [['quyu-l', QUYU_START], ['quyu-r', QUYU_START + QUYU_GAP]];
    regions.forEach(([id]) => {
      const el = document.getElementById(id);
      if (el) el.style.opacity = '0';
    });
    const pink = document.getElementById('pinkglow');
    if (pink) pink.style.opacity = '0';

    window.whenAppReady(() => {
    regions.forEach(([id, delay]) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.animate(
        [{ opacity: 0 }, { opacity: 1 }],
        { duration: QUYU_DUR, delay, easing: QUYU_EASE, fill: 'both' }
      );
    });

    // pinkglow：先隐藏待命，生长簇完成后播放入场
    if (pink) {
      let played = false;
      const play = () => {
        if (played) return; played = true;
        pink.animate(
          [{ opacity: 0, transform: `translateY(${PINK_RISE}px)` },
           { opacity: 1, transform: 'translateY(0px)' }],
          { duration: PINK_DUR, easing: PINK_EASE, fill: 'forwards' }
        );
      };
      window.addEventListener('curves:grown', play, { once: true });
      setTimeout(play, PINK_FALLBACK); // 兜底：曲线引擎未挂载时也能出现
    }
    });
  });
})();
