/* 生长 ASCII 蒙版外观配置：测试台可保存到 localStorage，主站读取同一组参数。
   播放时长与缓动统一在 animation_timing.js 的 shanReveal 中调整。 */
window.GROWTH_ASCII_MASK_CONFIG = {
  storageKey: 'biomagic.growthAsciiMask.settings.v1',
  source: 'icon/生长测试.svg',
  /* 测试台默认时序；主站以 animation_timing.js 为准。 */
  duration: 2900,
  easing: [0, 0.83, 0.47, 1],
  applyEasing: true,
  /* 像素化 */
  pixelSize: 6,
  /* ASCII 字符层 */
  asciiSize: 12,
  charset: '！@￥%#&%*',
  asciiColor: '#ffffff',
  asciiOpacity: 0.52,
  asciiFont: 'Consolas, "Microsoft YaHei", monospace',
  mapping: 'dark-to-light',
  asciiEnabled: true,
  /* 路径渐变 */
  selectedGradientPath: 0,
  /* 测试时调整过的第 1 条路径；未列出的路径保留 SVG 原始渐变。 */
  gradientOverrides: {
    0: { scale: 1.28, offsetX: 35, offsetY: 0, inner: '#000000', middle: '#242424', outer: '#ffffff' },
  },
  /* 蒙版布局：位置单位分别为 CSS px 和容器百分比。 */
  geometry: {
    pathMaskPosition: { x: 60, y: 0 },
    sphereMaskSize: 3000,
    sphereMaskPosition: { x: 51.7, y: 73.2 },
  },
};
