// Deterministic hash → HSL colour for an area name
export function areaColor(name: string): { bg: string; border: string; text: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return {
    bg: `hsl(${hue} 70% 20% / 0.7)`,
    border: `hsl(${hue} 80% 55%)`,
    text: `hsl(${hue} 90% 82%)`,
  };
}
