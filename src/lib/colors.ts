// Deterministic hash → HSL colour for an area name
export function areaColor(name: string): { bg: string; border: string; text: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return {
    bg: `hsl(${hue} 45% 18% / 0.75)`,
    border: `hsl(${hue} 55% 48%)`,
    text: `hsl(${hue} 65% 78%)`,
  };
}
