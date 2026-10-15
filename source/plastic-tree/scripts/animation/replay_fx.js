/* 重播按钮：默认路径完整；hover 播放一次生长；点击派发全动画重播事件。 */
(function () {
  const SRC = 'icon/bottom_重新播放所有动画.svg';
  const PREFIX = 'rp--';
  const HOVER_DURATION = 200;
  const HIT_PADDING = 18;

  async function init() {
    const host = document.getElementById('replay-all');
    const stage = document.getElementById('stage');
    if (!host || !stage) return;

    let text;
    try { text = await (await fetch(SRC)).text(); }
    catch (error) {
      console.warn('[replay_fx] 按钮素材加载失败：', error.message);
      return;
    }
    text = text.replace(/id="([^"]+)"/g, (match, id) => `id="${PREFIX}${id}"`)
      .replace(/url\(#([^)]+)\)/g, (match, id) => `url(#${PREFIX}${id})`)
      .replace(/href="#([^"]+)"/g, (match, id) => `href="#${PREFIX}${id}"`);
    const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
    const svg = document.importNode(doc.querySelector('svg'), true);
    svg.querySelector(`#${PREFIX}画板长宽`)?.remove();
    svg.style.cssText = 'display:block;width:100%;height:100%;pointer-events:none;';
    host.querySelector('img')?.remove();
    host.appendChild(svg);
    host.style.pointerEvents = 'none'; // 不遮挡其下方画布控件；通过画板坐标判定命中

    const paths = [...svg.querySelectorAll('path')];
    const animatedPaths = paths.map(path => {
      const length = path.getTotalLength();
      path.style.strokeDasharray = String(length);
      path.style.strokeDashoffset = '0';
      return { path, length, animation: null };
    });
    if (!animatedPaths.length) return;

    const svgBounds = paths.map(path => {
      const box = path.getBBox(), matrix = path.getCTM();
      const corners = [
        new DOMPoint(box.x, box.y), new DOMPoint(box.x + box.width, box.y),
        new DOMPoint(box.x, box.y + box.height), new DOMPoint(box.x + box.width, box.y + box.height),
      ].map(point => point.matrixTransform(matrix));
      return {
        left: Math.min(...corners.map(point => point.x)) - HIT_PADDING,
        right: Math.max(...corners.map(point => point.x)) + HIT_PADDING,
        top: Math.min(...corners.map(point => point.y)) - HIT_PADDING,
        bottom: Math.max(...corners.map(point => point.y)) + HIT_PADDING,
      };
    });
    const inButton = (clientX, clientY) => {
      const matrix = svg.getScreenCTM();
      if (!matrix) return false;
      const point = new DOMPoint(clientX, clientY).matrixTransform(matrix.inverse());
      return svgBounds.some(box => point.x >= box.left && point.x <= box.right &&
        point.y >= box.top && point.y <= box.bottom);
    };

    let hovered = false;
    function showCompleteIcon() {
      for (const item of animatedPaths) {
        item.animation?.cancel();
        item.animation = null;
        item.path.style.strokeDashoffset = '0';
      }
    }
    window.addEventListener('pointermove', event => {
      const next = inButton(event.clientX, event.clientY);
      if (next === hovered) return;
      hovered = next;
      document.body.style.cursor = hovered ? 'pointer' : '';
      for (const item of animatedPaths) {
        item.animation?.cancel();
        item.animation = null;
        if (hovered) {
          item.animation = item.path.animate(
            [{ strokeDashoffset: item.length }, { strokeDashoffset: 0 }],
            { duration: HOVER_DURATION, easing: 'ease-out', fill: 'forwards' }
          );
        } else {
          item.path.style.strokeDashoffset = '0';
        }
      }
    }, { passive: true });

    const requestReplay = () => window.dispatchEvent(new CustomEvent('animations:replay', {
      detail: { source: 'replay-all-button' },
    }));
    window.addEventListener('click', event => {
      if (!inButton(event.clientX, event.clientY)) return;
      showCompleteIcon();
      requestReplay();
    });
    host.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      requestReplay();
    });
  }

  window.addEventListener('DOMContentLoaded', init, { once: true });
})();
