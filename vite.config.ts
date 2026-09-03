// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro, componentTagger (dev-only),
//     VITE_* env injection, @ path alias, React/TanStack dedupe, error logger plugins.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { Plugin } from "vite";

/**
 * Fail the build when the browser bundle would ship without Supabase keys.
 *
 * `VITE_*` values are inlined at build time and then no longer exist, so a build
 * that runs without them SUCCEEDS and produces a site whose login reports "No
 * backend connected yet" — a runtime symptom, hours later, pointing at the wrong
 * file. Production hit exactly this on 2026-09-03: the variables were present in
 * Vercel but stored as `Secret` type, which is handed to functions at runtime and
 * withheld from the build step. Three redeploys changed nothing because nothing
 * was wrong with the deploy. A red build log is far cheaper than a dead login page.
 *
 * `config.env` is what Vite will actually inline (loadEnv over `.env` files plus
 * prefixed `process.env` entries), so this checks the real thing rather than
 * re-deriving it and disagreeing.
 *
 * Build only: `vite dev` deliberately still runs without a backend, because the
 * public pages must render during a fresh checkout with no `.env` yet.
 */
function requireSupabaseEnv(): Plugin {
  const REQUIRED = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];

  return {
    name: "require-supabase-env",
    apply: "build",
    configResolved(config) {
      const missing = REQUIRED.filter((key) => !config.env[key]);
      if (missing.length === 0) return;

      throw new Error(
        [
          `Refusing to build: ${missing.join(", ")} ${missing.length === 1 ? "is" : "are"} empty.`,
          "",
          "These are inlined into the browser bundle at build time. Building without",
          "them produces a site that loads fine and then fails at login with",
          '"No backend connected yet".',
          "",
          "Locally:  copy .env.example to .env and fill in the Supabase values.",
          "On Vercel: check `vercel env ls` — the VITE_* vars must be type Config,",
          "           NOT Secret. Secret values reach functions at runtime but are",
          "           withheld from the build, which is indistinguishable from unset.",
          "           Fix with:",
          "             vercel env add VITE_SUPABASE_URL production,preview \\",
          "               --type config --value <url> --force",
        ].join("\n"),
      );
    },
  };
}

export default defineConfig({
  plugins: [requireSupabaseEnv()],
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
