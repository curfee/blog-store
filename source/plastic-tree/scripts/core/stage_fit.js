/* 2560×1440 画板适配：宽高约束、最多 7% 底部裁切、放大封顶 5%。 */
(function () {
  const DESIGN_WIDTH = 2560;
  const DESIGN_HEIGHT = 1440;
  const MAX_SCALE = 1.05;
  const BOTTOM_CROP_RATIO = 0.07;
  const stage = document.getElementById('stage');

  function fitStage() {
    const scale = Math.min(
      window.innerWidth / DESIGN_WIDTH,
      window.innerHeight / (DESIGN_HEIGHT * (1 - BOTTOM_CROP_RATIO)),
      MAX_SCALE
    );
    stage.style.transform = `scale(${scale})`;
    stage.style.left = `${(window.innerWidth - DESIGN_WIDTH * scale) / 2}px`;
    stage.style.top = `${Math.max(0, (window.innerHeight - DESIGN_HEIGHT * scale) / 2)}px`;
  }

  window.addEventListener('resize', fitStage);
  fitStage();
})();
