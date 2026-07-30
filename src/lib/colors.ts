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
      bg: `hsl(${hue} 40% 22% / 0.55)`,
      border: `hsl(${hue} 45% 42% / 0.7)`,
      text: `hsl(${hue} 55% 82%)`,
    };
  }

  // Light mode: soft tinted chips that stay readable on white panels
  return {
    bg: `hsl(${hue} 42% 95%)`,
    border: `hsl(${hue} 28% 78%)`,
    text: `hsl(${hue} 40% 28%)`,
  };
}
