/** Deterministic hash → HSL colour for an area / town name (theme-aware). */
export function areaColor(name: string): { bg: string; border: string; text: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  const dark =
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark");

  if (dark) {
    return {
      bg: `hsl(${hue} 22% 20% / 0.6)`,
      border: `hsl(${hue} 24% 40% / 0.6)`,
      text: `hsl(${hue} 30% 76%)`,
    };
  }

  // Light mode: tonal chips that stay readable on warm panels
  return {
    bg: `hsl(${hue} 24% 94%)`,
    border: `hsl(${hue} 18% 80%)`,
    text: `hsl(${hue} 28% 30%)`,
  };
}
