/**
 * Is a Supabase project wired up yet?
 *
 * The client in `./client` throws on first use when the env vars are missing —
 * correct once the project exists, but during Phase 0 the site has no backend
 * at all and the public pages must still render. Callers that run on page load
 * (the root's auth listener, for one) check this first rather than letting a
 * missing key take down the whole tree.
 */
export function isSupabaseConfigured(): boolean {
  const url = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  return Boolean(url && key);
}
