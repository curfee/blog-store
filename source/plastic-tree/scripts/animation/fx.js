/* 交互效果 (v2)
   1) 区域构成左/右 + 主支撑图像 + 核心：随鼠标轻微移动的景深视差（反向漂移 + 平滑趋近）
      主支撑图像幅度减半（前景漂移更轻微）；核心同区域构成左（+12 同向，用户 2026-10-12 指定）
   2) 四个功能按钮：React Bits <Magnet /> 的纯 JS 移植
      - 鼠标进入元素外扩 padding 范围 → 向指针方向牵引（偏移 = 距离 / strength）
      - 离开范围 → 回弹归位（惯性缓动）
   坐标换算：指针屏幕坐标 → 画布 2560×1440 坐标（stage 缩放自适应） */
(function () {
  /* ===== 可调参数 ===== */
  // 景深视差（区域构成 / 主支撑图像 / 核心）
  const PARALLAX_AMP_L    = 12;   // 左块漂移幅度 px（画布坐标，正值=同向）
  const PARALLAX_AMP_R    = -16;  // 右块（负值=反向，幅度不同形成景深）
  const PARALLAX_AMP_SHAN = 6;    // 主支撑图像（同向，幅度约为区域构成的一半）
  const PARALLAX_AMP_HEXIN = 4;  // 核心（同向，与区域构成左一致；2026-10-12 用户指定"和构成一样"）
  const PARALLAX_LERP  = 4;    // 平滑趋近速度（越大越跟手）
  // 区域构成随机晃动（与指针景深独立叠加；随机偏移半径不超过 14px）
  const SHAKE_MAX = 5;
  const SHAKE_INTERVAL_MIN = 2700;  // 随机目标更新间隔下限 ms
  const SHAKE_INTERVAL_MAX = 5600; // 随机目标更新间隔上限 ms
  const SHAKE_LERP = 1.4;          // 随机偏移平滑速度
  // 磁吸按钮（Magnet 参数：padding / magnetStrength / 过渡时长）
  const MAGNET_PADDING    = 100;  // 激活范围：元素边界外扩 px
  const MAGNET_STRENGTH   = 4;    // 牵引强度分母（越大越轻微；React Bits 默认 2）
  const MAGNET_ACTIVE_T   = 0.3;  // 激活过渡 s（ease-out）
  const MAGNET_INACTIVE_T = 0.5;  // 归位过渡 s（ease-in-out）
  const MAGNET_IDS = ['label-dangan', 'label-yutan', 'label-jiehuo', 'label-renyuan'];
  // 按钮视觉包围盒（画布 2560×1440 坐标，取自画板1.svg 各组 bbox ×2）：
  // .el 容器是全画布的，必须用内容包围盒判定磁吸范围
  const MAGNET_RECTS = {
    'label-dangan':  [2032, 915, 2396.4, 1126.4],  // bottom_档案库
    'label-yutan':   [1777, 571, 2169.8, 783.6],   // bottom_预探神迹
    'label-jiehuo':  [334, 624.2, 742, 762.4],     // bottom_截获记录
    'label-renyuan': [155.6, 907, 616, 1172],      // bottom_人员补充
  };

  window.addEventListener('DOMContentLoaded', () => {
    const stage = document.getElementById('stage');
    // 指针 → 画布坐标
    const mouse = { x: 1280, y: 720 };
    window.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      const k = 2560 / r.width;
      mouse.x = (e.clientX - r.left) * k;
      mouse.y = (e.clientY - r.top) * k;
    }, { passive: true });

    /* ---- 1) 区域构成景深 ---- */
    const ql = document.getElementById('quyu-l');
    const qr = document.getElementById('quyu-r');
    const shan = document.getElementById('shan');   // 主支撑图像：更小幅度同向漂移
    const hexin = document.getElementById('hexin'); // 核心：同构成左漂移
    const cur = { l: { x: 0, y: 0 }, r: { x: 0, y: 0 }, s: { x: 0, y: 0 }, h: { x: 0, y: 0 } };
    const shake = {
      l: { x: 0, y: 0, tx: 0, ty: 0 },
      r: { x: 0, y: 0, tx: 0, ty: 0 },
      nextAt: 0,
    };
    const randomShakeTarget = () => {
      const angle = Math.random() * Math.PI * 2;
      const radius = Math.sqrt(Math.random()) * SHAKE_MAX;
      return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
    };
    const boundMove = (x, y) => {
      const length = Math.hypot(x, y);
      const scale = length > SHAKE_MAX ? SHAKE_MAX / length : 1;
      return { x: x * scale, y: y * scale };
    };

    /* ---- 2) 磁吸按钮（Magnet 移植） ---- */
    const magnets = MAGNET_IDS.map((id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      el.style.willChange = 'transform';
      el.style.transition = `transform ${MAGNET_INACTIVE_T}s ease-in-out`;
      return { el, active: false };
    }).filter(Boolean);

    let last = 0;
    function frame(now) {
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
      last = now;

      // 景深：以画布中心为基准的归一化偏移，左右不同幅度/方向
      const nx = (mouse.x - 1280) / 1280;   // -1 ~ 1
      const ny = (mouse.y - 720) / 720;
      const ease = Math.min(1, dt * PARALLAX_LERP);
      if (now >= shake.nextAt) {
        for (const side of [shake.l, shake.r]) {
          const target = randomShakeTarget();
          side.tx = target.x;
          side.ty = target.y;
        }
        shake.nextAt = now + SHAKE_INTERVAL_MIN + Math.random() * (SHAKE_INTERVAL_MAX - SHAKE_INTERVAL_MIN);
      }
      const shakeEase = 1 - Math.exp(-dt * SHAKE_LERP);
      for (const side of [shake.l, shake.r]) {
        side.x += (side.tx - side.x) * shakeEase;
        side.y += (side.ty - side.y) * shakeEase;
      }
      if (ql) {
        cur.l.x += (nx * PARALLAX_AMP_L - cur.l.x) * ease;
        cur.l.y += (ny * PARALLAX_AMP_L * 0.6 - cur.l.y) * ease;
        const move = boundMove(cur.l.x + shake.l.x, cur.l.y + shake.l.y);
        ql.style.transform = `translate3d(${move.x.toFixed(2)}px, ${move.y.toFixed(2)}px, 0)`;
      }
      if (qr) {
        cur.r.x += (nx * PARALLAX_AMP_R - cur.r.x) * ease;
        cur.r.y += (ny * PARALLAX_AMP_R * 0.6 - cur.r.y) * ease;
        const move = boundMove(cur.r.x + shake.r.x, cur.r.y + shake.r.y);
        qr.style.transform = `translate3d(${move.x.toFixed(2)}px, ${move.y.toFixed(2)}px, 0)`;
      }
      if (shan) {
        cur.s.x += (nx * PARALLAX_AMP_SHAN - cur.s.x) * ease;
        cur.s.y += (ny * PARALLAX_AMP_SHAN * 0.6 - cur.s.y) * ease;
        shan.style.transform = `translate3d(${cur.s.x.toFixed(2)}px, ${cur.s.y.toFixed(2)}px, 0)`;
      }
      if (hexin) {
        cur.h.x += (nx * PARALLAX_AMP_HEXIN - cur.h.x) * ease;
        cur.h.y += (ny * PARALLAX_AMP_HEXIN * 0.6 - cur.h.y) * ease;
        hexin.style.transform = `translate3d(${cur.h.x.toFixed(2)}px, ${cur.h.y.toFixed(2)}px, 0)`;
      }

      // 磁吸：与 Magnet 组件同逻辑（内容包围盒距离判定 + 偏移牵引 + 双档过渡）
      for (const m of magnets) {
        const rc = MAGNET_RECTS[m.el.id];
        if (!rc) continue;
        const cx = (rc[0] + rc[2]) / 2, cy = (rc[1] + rc[3]) / 2;
        const hw = (rc[2] - rc[0]) / 2, hh = (rc[3] - rc[1]) / 2;
        const dx = mouse.x - cx, dy = mouse.y - cy;
        const inRange = Math.abs(dx) < hw + MAGNET_PADDING && Math.abs(dy) < hh + MAGNET_PADDING;
        if (inRange) {
          if (!m.active) { m.el.style.transition = `transform ${MAGNET_ACTIVE_T}s ease-out`; m.active = true; }
          m.el.style.transform = `translate3d(${(dx / MAGNET_STRENGTH).toFixed(1)}px, ${(dy / MAGNET_STRENGTH).toFixed(1)}px, 0)`;
        } else if (m.active) {
          m.el.style.transition = `transform ${MAGNET_INACTIVE_T}s ease-in-out`;
          m.el.style.transform = 'translate3d(0px, 0px, 0px)';
          m.active = false;
        }
      }

      requestAnimationFrame(frame);
    }
    window.whenAppReady(() => requestAnimationFrame(frame));
  });
})();
