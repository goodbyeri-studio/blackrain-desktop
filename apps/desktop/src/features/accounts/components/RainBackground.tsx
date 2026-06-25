import { useEffect, useRef } from "react";

// 002-accounts-credits：登录开屏雨幕。
// 银翼杀手 2049 霓虹雨夜氛围——斜落雨丝 + 偶发品红/冰蓝着色（穿过霓虹）。
// canvas 独立绘制，prefers-reduced-motion 时静止；jsdom 下 getContext 返回 null 直接跳过。

interface Drop {
  x: number;
  y: number;
  len: number;
  speed: number;
  alpha: number;
  hue: "ice" | "magenta" | "plain";
}

const HUES: Record<Drop["hue"], string> = {
  ice: "rgba(180, 200, 255, ",
  magenta: "rgba(255, 130, 200, ",
  plain: "rgba(210, 220, 235, ",
};

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

    let raf = 0;
    let drops: Drop[] = [];
    let w = 0;
    let h = 0;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const wind = 1.6; // 斜风：x 方向偏移系数

    const seed = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 雨量随面积，封顶避免大屏卡顿
      const count = Math.min(220, Math.floor((w * h) / 7000));
      drops = Array.from({ length: count }, () => spawn(true));
    };

    const spawn = (anywhere: boolean): Drop => {
      const r = Math.random();
      const hue: Drop["hue"] = r > 0.92 ? "magenta" : r > 0.78 ? "ice" : "plain";
      return {
        x: Math.random() * (w + 120) - 60,
        y: anywhere ? Math.random() * h : -20,
        len: 10 + Math.random() * 18,
        speed: 4.5 + Math.random() * 6.5,
        alpha: 0.08 + Math.random() * 0.22,
        hue,
      };
    };

    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (const d of drops) {
        ctx.strokeStyle = `${HUES[d.hue]}${d.alpha})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - wind * (d.len / 4), d.y + d.len);
        ctx.stroke();
        d.y += d.speed;
        d.x -= (wind * d.speed) / 4;
        if (d.y > h + 20) Object.assign(d, spawn(false));
      }
      raf = window.requestAnimationFrame(draw);
    };

    const drawStatic = () => {
      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (const d of drops) {
        ctx.strokeStyle = `${HUES[d.hue]}${d.alpha * 0.7})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - wind * (d.len / 4), d.y + d.len);
        ctx.stroke();
      }
    };

    seed();
    if (reduce) {
      drawStatic();
    } else {
      raf = window.requestAnimationFrame(draw);
    }

    const onResize = () => {
      seed();
      if (reduce) drawStatic();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  return <canvas ref={canvasRef} className="account-rain" aria-hidden="true" />;
}
