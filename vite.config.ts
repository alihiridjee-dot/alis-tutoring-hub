// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro, componentTagger (dev-only),
//     VITE_* env injection, @ path alias, React/TanStack dedupe, error logger plugins.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    server: {
      // Honor the port assigned by the preview harness via PORT; fall back to 8080.
      // Without this the preview pane loads a blank page.
      port: process.env.PORT ? Number(process.env.PORT) : 8080,
      strictPort: false,
    },
  },
});
