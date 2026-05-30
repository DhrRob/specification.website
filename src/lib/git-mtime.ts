import { execFileSync } from 'node:child_process';
import { statSync } from 'node:fs';

const cache = new Map<string, string | undefined>();

/**
 * Return YYYY-MM-DD for the last time a file was committed to git.
 * Falls back to its filesystem mtime if git is unavailable (or the path is
 * outside the repo). Result is cached per path for the life of the process.
 *
 * Paths are resolved relative to `process.cwd()` — Astro endpoints run from
 * the project root, and Cloudflare Pages builds run from the cloned repo root.
 */
export function gitMtime(relPath: string): string | undefined {
  if (cache.has(relPath)) return cache.get(relPath);

  let date: string | undefined;
  try {
    const iso = execFileSync('git', ['log', '-1', '--format=%cI', '--', relPath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (iso) date = iso.slice(0, 10);
  } catch {
    // git unavailable or path not tracked — fall through
  }

  if (!date) {
    try {
      date = statSync(relPath).mtime.toISOString().slice(0, 10);
    } catch {
      // unreadable — leave undefined
    }
  }

  cache.set(relPath, date);
  return date;
}
