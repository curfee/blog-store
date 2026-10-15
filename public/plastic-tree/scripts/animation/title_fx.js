/* 标题入场：plastic_tree 路径按图层名称顺序生长，随后依次显现 biomagic 与中文标题。 */
(function () {
  const TIMING = window.ANIMATION_TIMING?.titleFx || {};
  const clamp = value => Math.min(1, Math.max(0, value));
  const PATH_DURATION = Math.max(1, Number(TIMING.pathDuration) || 600);
  const NEXT_PATH_AT = clamp(Number(TIMING.nextPathAt ?? 0.7));
  const EASING = TIMING.easing || [0.004, 0.632, 0.266, 0.995];
  const BIO_DELAY = Math.max(0, Number(TIMING.biomagicDelay) || 0);
  const BIO_DURATION = Math.max(0, Number(TIMING.biomagicDuration) || 200);
  const TITLE_DELAY = Math.max(0, Number(TIMING.titleDelay) || 0);
  const TITLE_DURATION = Math.max(0, Number(TIMING.titleDuration) || 200);
  const SOURCE = 'icon/title_plastic_tree.svg';
  const PREFIX = 'title--';

  const poly = (a, b) => t => (((1 - 3 * b + 3 * a) * t + (3 * (b - a) - 3 * a)) * t + 3 * a) * t;
  const bx = poly(EASING[0], EASING[2]);
  const by = poly(EASING[1], EASING[3]);
  const ease = x => {
    let low = 0, high = 1, t = x;
    for (let i = 0; i < 22; i++) {
      t = (low + high) / 2;
      if (bx(t) < x) low = t;
      else high = t;
    }
    return by(t);
  };
  const comparePathNames = (left, right) => {
    const a = String(left).split('.').map(Number);
    const b = String(right).split('.').map(Number);
    const count = Math.max(a.length, b.length);
    for (let i = 0; i < count; i++) {
      const av = a[i] ?? -1;
      const bv = b[i] ?? -1;
      if (av !== bv) return av - bv;
    }
    return 0;
  };

  async function init() {
    const host = document.getElementById('title');
    if (!host) return;

    try {
      const response = await fetch(SOURCE);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const source = await response.text();
      const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
      if (parsed.querySelector('parsererror')) throw new Error('SVG XML 解析失败');
      const sourceSvg = parsed.documentElement;
      const svg = document.importNode(sourceSvg, true);

      // 新导出文件带有铺满画板的渐变背景，去掉它避免遮住页面其它图层。
      svg.querySelector('#画板长宽')?.remove();
      svg.querySelectorAll('[id]').forEach(element => { element.id = `${PREFIX}${element.id}`; });
      svg.querySelectorAll('*').forEach(element => {
        for (const attr of ['fill', 'stroke', 'filter', 'clip-path', 'mask', 'style', 'href', 'xlink:href']) {
          const value = element.getAttribute(attr);
          if (value) element.setAttribute(attr, value.replace(/url\(#([^)]+)\)|href="#([^"]+)"/g,
            (match, urlId, hrefId) => urlId ? `url(#${PREFIX}${urlId})` : `href="#${PREFIX}${hrefId}"`));
        }
      });
      svg.style.cssText = 'display:block;width:100%;height:100%;';

      const pathGroup = svg.querySelector(`#${PREFIX}plastic_tree_animate`);
      const bioGroup = svg.querySelector(`#${PREFIX}biomagic`);
      const titleText = svg.querySelector('text')?.parentElement;
      if (!pathGroup || !bioGroup || !titleText) throw new Error('缺少标题动画图层');

      const namedPaths = [...pathGroup.children].flatMap((group, groupIndex) => {
        const name = group.getAttribute('affinity:id') || group.id.replace(/^title--_?/, '');
        return [...group.querySelectorAll('path')].map((path, pathIndex) => ({ path, name, groupIndex, pathIndex }));
      });
      namedPaths.sort((a, b) => comparePathNames(a.name, b.name) || a.groupIndex - b.groupIndex || a.pathIndex - b.pathIndex);
      const paths = namedPaths.map(({ path }) => {
        const length = path.getTotalLength();
        path.style.strokeDasharray = `${length}`;
        path.style.strokeDashoffset = `${length}`;
        path.style.strokeLinecap = 'round';
        // 圆形线帽在零进度时仍可能露成一个端点圆点，因此未轮到的路径先隐藏。
        path.style.visibility = 'hidden';
        return { path, length };
      });
      if (!paths.length) throw new Error('plastic_tree_animate 中没有路径');
      bioGroup.style.opacity = '0';
      titleText.style.opacity = '0';
      host.querySelector('img')?.remove();
      host.appendChild(svg);

      let frame = 0;
      let token = 0;
      let played = false;
      function reset() {
        token++;
        cancelAnimationFrame(frame);
        frame = 0;
        played = false;
        paths.forEach(({ path, length }) => {
          path.style.strokeDashoffset = `${length}`;
          path.style.visibility = 'hidden';
        });
        bioGroup.getAnimations().forEach(animation => animation.cancel());
        titleText.getAnimations().forEach(animation => animation.cancel());
        bioGroup.style.opacity = '0';
        titleText.style.opacity = '0';
      }

      function play() {
        if (played) return;
        played = true;
        const ownToken = ++token;
        const start = performance.now();
        const pathInterval = PATH_DURATION * NEXT_PATH_AT;
        const pathsDuration = (paths.length - 1) * pathInterval + PATH_DURATION;
        const bioStart = pathsDuration + BIO_DELAY;
        const titleStart = bioStart + BIO_DURATION + TITLE_DELAY;
        const finish = titleStart + TITLE_DURATION;
        let bioAnimationStarted = false;
        let titleAnimationStarted = false;

        const tick = now => {
          if (ownToken !== token) return;
          const elapsed = now - start;
          paths.forEach(({ path, length }, index) => {
            const rawProgress = (elapsed - index * pathInterval) / PATH_DURATION;
            const progress = clamp(rawProgress);
            path.style.visibility = rawProgress > 0 ? 'visible' : 'hidden';
            path.style.strokeDashoffset = `${length * (1 - ease(progress))}`;
          });
          if (!bioAnimationStarted && elapsed >= bioStart) {
            bioAnimationStarted = true;
            bioGroup.animate([{ opacity: 0 }, { opacity: 1 }], { duration: BIO_DURATION, easing: 'linear', fill: 'forwards' });
          }
          if (!titleAnimationStarted && elapsed >= titleStart) {
            titleAnimationStarted = true;
            titleText.animate([{ opacity: 0 }, { opacity: 1 }], { duration: TITLE_DURATION, easing: 'linear', fill: 'forwards' });
          }
          if (elapsed < finish) frame = requestAnimationFrame(tick);
          else frame = 0;
        };
        frame = requestAnimationFrame(tick);
      }

      window.addEventListener('animations:replay', reset);
      window.addEventListener('shan:reveal:effect:start', play);
    } catch (error) {
      console.warn('[title_fx] 标题动画加载失败，保留原标题图：', error.message);
    }
  }

  window.addEventListener('DOMContentLoaded', init, { once: true });
})();
