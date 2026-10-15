/* 核心图层与 shan 蒙版收尾交接同步淡入。 */
(function () {
  const core = document.getElementById('hexin');
  if (!core) return;
  const duration = Math.max(0, Number(window.ANIMATION_TIMING?.coreReveal?.duration) || 350);
  let animation = null;

  function hide() {
    animation?.cancel();
    animation = null;
    core.style.opacity = '0';
  }

  function reveal() {
    animation?.cancel();
    animation = core.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration, easing: 'linear', fill: 'forwards' }
    );
  }

  window.addEventListener('animations:replay', hide);
  window.addEventListener('shan:reveal:effect:start', reveal);
  if (window.__shanRevealDone) reveal();
})();
