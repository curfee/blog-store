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
    pinkDuration: 1200,
    pinkFallback: 5000,
    pinkRise: 60,
  },
  curves: {
    defaultPathDuration: 1600,
    defaultStagger: 120,
    paixianPathDuration: 900,
    paixianStagger: 50,
    paixianStartDelay: 0,
  },
  shanReveal: {
    initialYOffset: 74, // 球形蒙版开始生长前，主支撑图像向下偏移量 px
    initialYOffsetEasing: [0, 0.198, 0.072, 0.995], // 回位缓动 cubic-bezier(x1, y1, x2, y2)
    // 路径像素 ASCII 蒙版
    duration: 2900, // 路径像素 ASCII 蒙版生长总时长
    easing: [0, 0.83, 0.47, 1], // 路径生长缓动 cubic-bezier(x1, y1, x2, y2)
    applyEasing: true, // false 时改为线性生长
    // 球形渐变蒙版
    sphereStart: 1200,  // 路径生长开始后多少毫秒触发球形蒙版
    sphereDuration: 2200, // 球形蒙版展开时长
    // 收尾交接
    cleanupDuration: 800, // 原图与路径蒙版交接时长
    cleanupEasing: [0.251, 0.005, 0.214, 1.003], // 交接缓动 cubic-bezier(x1, y1, x2, y2)
  },
  coreReveal: {
    duration: 350,
  },
  buttonsReveal: {
    duration: 240,
    stagger: 240,
    order: ['label-jiehuo', 'label-yutan', 'label-renyuan', 'label-dangan'],
  },
  tree: {
    startDelay: 0,
    startBeforeShanDone: 600,
    millisecondsPerPixel: 1.1,
    minPathDuration: 160,
    maxPathDuration: 900,
    pathStagger: 260,
    tailOverlap: 110,
  },
  titleFx: {
    pathDuration: 300,
    nextPathAt: 0.3,
    easing: [0.004, 0.632, 0.266, 0.995],
    biomagicDelay: 200,
    biomagicDuration: 200,
    titleDelay: 200,
    titleDuration: 200,
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
    startDelay: 0, // 收到 tree:grow:start 后的附加延迟；0 表示与树状主体同步
    growDuration: 700,
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
