#!/usr/bin/env node
// Set every spec entry's `updated:` to the file's last git commit datetime
// (strict ISO 8601). Falls back to the filesystem mtime for files that have
// never been committed. Pass `--dry-run` to preview without writing.
//
// One-shot tool: re-run after a large content import or when migrating from
// date-only `updated:` values to full datetimes.

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SPEC_DIR = join(ROOT, 'src/content/spec');
const DRY_RUN = process.argv.includes('--dry-run');

function gitMtime(absPath) {
  try {
    const iso = execFileSync(
      'git',
      ['log', '-1', '--follow', '--format=%cI', '--', absPath],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();
    return iso || null;
  } catch {
    return null;
  }
}

function fsMtime(absPath) {
  try {
    return statSync(absPath).mtime.toISOString();
  } catch {
    return null;
  }
}

function isDirty(absPath) {
  try {
    const status = execFileSync(
      'git',
      ['status', '--porcelain', '--', absPath],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return status.trim().length > 0;
  } catch {
    return false;
  }
}

/**
 * Pick the most accurate "last touched" timestamp for a file, normalised to UTC.
 * - Tracked + clean: the last commit's committer date (authoritative).
 * - Tracked + working-tree changes: fs mtime, since the file is newer than its last commit.
 * - Untracked: fs mtime.
 */
function lastTouched(absPath) {
  const raw = isDirty(absPath) ? fsMtime(absPath) : (gitMtime(absPath) ?? fsMtime(absPath));
  if (!raw) return null;
  return new Date(raw).toISOString();
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && /\.(md|mdx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

const files = walk(SPEC_DIR).sort();
let updated = 0;
let skipped = 0;

for (const file of files) {
  const iso = lastTouched(file);
  if (!iso) {
    console.warn(`SKIP (no date)        ${relative(ROOT, file)}`);
    skipped++;
    continue;
  }
  const src = readFileSync(file, 'utf8');
  const re = /^updated:.*$/m;
  if (!re.test(src)) {
    console.warn(`SKIP (no updated:)    ${relative(ROOT, file)}`);
    skipped++;
    continue;
  }
  const next = src.replace(re, `updated: "${iso}"`);
  if (next === src) {
    skipped++;
    continue;
  }
  if (!DRY_RUN) writeFileSync(file, next);
  updated++;
  console.log(`${DRY_RUN ? 'WOULD UPDATE' : 'UPDATED     '} ${relative(ROOT, file)} → ${iso}`);
}

console.log(`\n${DRY_RUN ? 'DRY RUN: ' : ''}${updated} updated, ${skipped} skipped`);
