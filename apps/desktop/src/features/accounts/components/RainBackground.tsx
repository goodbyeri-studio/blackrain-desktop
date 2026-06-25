import { useEffect, useRef } from "react";

// 002-accounts-credits：登录开屏雨幕（银翼杀手 2049 霓虹雨夜）。
// 真实感：3 层视差景深（远/中/近，速度·粗细·亮度各异）+ 斜风飘移 + 偶发霓虹着色。
// 性能：按层「批量成一条 path，整层 stroke 一次」——上百根雨丝每帧仅 ~4 次绘制调用；
//       用时间戳 delta 归一化速度，掉帧不变速；prefers-reduced-motion 静止；jsdom 跳过。

interface Drop {
  x: number;
  y: number;
  len: number;
  vy: number; // 基础下落速度（像素/帧@60）
  layer: number;
}

interface Layer {
  width: number;
  alpha: number;
  speed: number; // 速度倍率（景深视差）
  color: string; // "r,g,b" 不含 alpha
}

// 远→近：越近越粗、越快、越亮（冷白偏蓝）
const LAYERS: Layer[] = [
  { width: 0.6, alpha: 0.16, speed: 0.55, color: "150, 172, 214" },
  { width: 1.0, alpha: 0.26, speed: 1.0, color: "190, 206, 236" },
  { width: 1.5, alpha: 0.4, speed: 1.55, color: "226, 234, 250" },
];

const WIND = 0.18; // 斜风：x 方向相对下落的比例

export function RainBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return; // jsdom / 不支持时跳过

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let raf = 0;
    let drops: Drop[] = [];
    let w = 0;
    let h = 0;
    let last = 0;

    const spawn = (anywhere: boolean): Drop => {
      // 偏向近层多、远层少，景深更自然
      const r = Math.random();
      const layer = r > 0.62 ? 2 : r > 0.28 ? 1 : 0;
      const base = 5.5 + Math.random() * 5;
      return {
        x: Math.random() * (w + 160) - 80,
        y: anywhere ? Math.random() * h : -30,
        len: (10 + Math.random() * 16) * (0.7 + layer * 0.3),
        vy: base,
        layer,
      };
    };

    const seed = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(360, Math.floor((w * h) / 4200));
      drops = Array.from({ length: count }, () => spawn(true));
    };

    // 按层批量绘制：每层只 beginPath / stroke 一次
    const render = (advance: number) => {
      ctx.clearRect(0, 0, w, h);
      for (let li = 0; li < LAYERS.length; li++) {
        const layer = LAYERS[li];
        ctx.strokeStyle = `rgba(${layer.color}, ${layer.alpha})`;
        ctx.lineWidth = layer.width;
        ctx.lineCap = "round";
        ctx.beginPath();
        for (const d of drops) {
          if (d.layer !== li) continue;
          const tail = d.len;
          const dx = WIND * tail;
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - dx, d.y + tail);
          if (advance > 0) {
            const step = d.vy * layer.speed * advance;
            d.y += step;
            d.x -= WIND * step;
            if (d.y - tail > h) {
              const ns = spawn(false);
              d.x = ns.x;
              d.y = ns.y;
              d.len = ns.len;
              d.vy = ns.vy;
            }
          }
        }
        ctx.stroke();
      }
    };

    const frame = (now: number) => {
      const advance = last ? Math.min((now - last) / 16.67, 3) : 1;
      last = now;
      render(advance);
      raf = window.requestAnimationFrame(frame);
    };

    seed();
    if (reduce) {
      render(0);
    } else {
      raf = window.requestAnimationFrame(frame);
    }

    const onResize = () => {
      seed();
      if (reduce) render(0);
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="account-rain" aria-hidden="true" />;
}
