/* 树状呼吸亮光 + 随机闪烁亮光 (v2)
   两层均为圆形影像位图（RGBA 透明底），叠在树心位置：
   - huxi 呼吸：透明度随正弦周期起伏（默认 5s 一周），可选轻微缩放
   - shanshuo 闪烁：随机目标透明度 + 快速趋近，模拟随机闪烁/信号感
   - BLEND 还原 Affinity「叠加」混合模式；不需要可设为 null */
(function () {
  /* ===== 可调参数 ===== */
  const BLEND         = 'overlay'; // 混合模式（叠加滤镜）；'screen' 更亮，null 不设置
  // 呼吸
  const HUXI_PERIOD   = 5;     // 呼吸周期 s
  const HUXI_MIN      = 0.45;  // 最低透明度
  const HUXI_SCALE    = 0.03;  // 呼吸缩放幅度（0=不缩放）
  // 闪烁
  const FLICK_MIN     = 0.1;   // 闪烁最低透明度
  const FLICK_LO      = 0.077; // 目标切换间隔下限 s（原 0.08 ÷1.4，提速 40%）
  const FLICK_HI      = 0.2;   // 上限 s（原 0.7 ÷1.4）
  const FLICK_LERP    = 14;    // 趋近速度（越大越"硬"）
  const FLICK_FLASH_P = 0.12;  // 每次切换时出现满亮闪的概率
  const FLICK_INTENSITY = 0.56;// 整体强度（降低 24%）

  function rand(a, b) { return a + Math.random() * (b - a); }

  window.addEventListener('DOMContentLoaded', () => {
    const huxi = document.getElementById('huxi');
    const shan = document.getElementById('shanshuo');
    if (BLEND) {
      if (huxi) huxi.style.mixBlendMode = BLEND;
      if (shan) shan.style.mixBlendMode = BLEND;
    }

    // 闪烁状态机
    let flickTarget = 1, flickValue = 1, flickNext = 0;
    let last = 0;

    function frame(now) {
      const t = now / 1000;
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now;

      // 调试冻结：window.__glowFreeze = { huxi: 0~1, shanshuo: 0~1 }
      if (window.__glowFreeze) {
        if (huxi && window.__glowFreeze.huxi != null) huxi.style.opacity = window.__glowFreeze.huxi;
        if (shan && window.__glowFreeze.shanshuo != null) shan.style.opacity = window.__glowFreeze.shanshuo;
        requestAnimationFrame(frame);
        return;
      }
      // 呼吸：smooth sine，透明度 + 轻微缩放（以图中心为原点）
      if (huxi) {
        const u = 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / HUXI_PERIOD); // 0→1→0
        huxi.style.opacity = (HUXI_MIN + (1 - HUXI_MIN) * u).toFixed(3);
        if (HUXI_SCALE > 0) {
          const s = 1 + HUXI_SCALE * u;
          huxi.style.transform = `scale(${s})`;
          huxi.style.transformOrigin = '50% 50%'; // webp 光晕即容器中心（容器已对齐圆心 1300,782）
        }
      }

      // 闪烁：到点换随机目标，快速趋近
      if (shan) {
        if (t >= flickNext) {
          flickTarget = Math.random() < FLICK_FLASH_P ? 1 : rand(FLICK_MIN, 0.95);
          flickNext = t + rand(FLICK_LO, FLICK_HI);
        }
        flickValue += (flickTarget - flickValue) * Math.min(1, dt * FLICK_LERP);
        shan.style.opacity = (flickValue * FLICK_INTENSITY).toFixed(3);
      }

      requestAnimationFrame(frame);
    }
    window.whenAppReady(() => { if (huxi || shan) requestAnimationFrame(frame); });
  });
})();
