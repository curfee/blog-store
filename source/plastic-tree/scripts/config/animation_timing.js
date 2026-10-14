/*
 * 启动动画时序表（统一使用毫秒）。
 * 修改下方数值并刷新页面即可观察；shanReveal 是主支撑图像的路径像素 ASCII 蒙版揭示。
 */
window.ANIMATION_TIMING = {
  loading: {
    fadeDuration: 650,
  },
  intro: {
    quyuLeftDelay: 1200,
    quyuRightGap: 350,
    quyuFadeDuration: 1200,
    pinkDuration: 4000,
    pinkFallback: 8000,
    pinkRise: 60,
  },
  curves: {
    defaultPathDuration: 1600,
    defaultStagger: 120,
    paixianPathDuration: 900,
    paixianStagger: 50,
    paixianStartDelay: 400,
  },
  shanReveal: {
    // 路径像素 ASCII 蒙版
    duration: 2900, // 路径像素 ASCII 蒙版生长总时长
    easing: [0, 0.83, 0.47, 1], // 路径生长缓动 cubic-bezier(x1, y1, x2, y2)
    applyEasing: true, // false 时改为线性生长
    // 球形渐变蒙版
    sphereStart: 1200,  // 路径生长开始后多少毫秒触发球形蒙版
    sphereDuration: 2200, // 球形蒙版展开时长
    // 收尾交接
    cleanupDuration: 420, // 原图与路径蒙版交接时长
  },
  tree: {
    startDelay: 500,
    millisecondsPerPixel: 1.1,
    minPathDuration: 160,
    maxPathDuration: 900,
    pathStagger: 260,
    tailOverlap: 110,
  },
  startFx: {
    pathDuration: 300,
    pathStagger: 200,
    fadeDuration: 200,
    startDelay: 400,
    fallback: 4000,
    completionTail: 60,
  },
  upFx: {
    startDelay: 0,
    growDuration: 400,
    ringDuration: 1200,
    fallback: 11000,
  },
  music: {
    startDelay: 300,
    fallback: 12000,
  },
};

document.documentElement.style.setProperty(
  '--loading-fade-duration',
  `${window.ANIMATION_TIMING.loading.fadeDuration}ms`
);
