/* 四个功能按钮在树内圆环完成入场后按指定顺序逐个淡入。 */
(function () {
  const TIMING = window.ANIMATION_TIMING?.buttonsReveal || {};
  const DURATION = Math.max(0, Number(TIMING.duration) || 140);
  const STAGGER = Math.max(0, Number(TIMING.stagger) || DURATION);
  const ORDER = TIMING.order || ['label-jiehuo', 'label-yutan', 'label-renyuan', 'label-dangan'];
  const buttons = ORDER.map(id => document.getElementById(id)).filter(Boolean);
  let animations = [];

  function reset() {
    animations.forEach(animation => animation.cancel());
    animations = [];
    buttons.forEach(button => { button.style.opacity = '0'; });
  }

  function reveal() {
    animations.forEach(animation => animation.cancel());
    animations = buttons.map((button, index) => button.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: DURATION, delay: index * STAGGER, easing: 'linear', fill: 'forwards' }
    ));
  }

  reset();
  window.addEventListener('animations:replay', reset);
  window.addEventListener('ring:done', reveal);
})();
