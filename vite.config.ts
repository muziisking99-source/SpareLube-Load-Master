// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
//
// On Vercel, Nitro auto-detects the platform. We also pin preset: "vercel" when VERCEL=1
// so CI builds always produce the Vercel Functions output (not Cloudflare).
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const onVercel = process.env.VERCEL === "1" || process.env.VERCEL === "true";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  nitro: onVercel ? { preset: "vercel" } : true,
});
