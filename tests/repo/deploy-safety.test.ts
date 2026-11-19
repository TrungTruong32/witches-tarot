// @vitest-environment node
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deployBranchError } from '../../scripts/deploy-guard.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('deploy safety', () => {
  it('api/ holds no test files (Vercel turns every api/* file into a public function)', () => {
    expect(readdirSync(join(ROOT, 'api')).filter(f => /\.test\./.test(f))).toEqual([]);
  });

  it('deploy-prod refuses any branch other than main unless explicitly overridden', () => {
    expect(deployBranchError('main', [])).toBeNull();
    expect(deployBranchError('react-migration', [])).toMatch(/main/);
    expect(deployBranchError('', [])).toMatch(/main/);
    expect(deployBranchError('react-migration', ['--allow-branch'])).toBeNull();
  });

  it('dev server never serves secrets or private data from the repo root', async () => {
    // nạp động: vite.config.ts thuộc project tsconfig.node, không nằm trong project của test
    const viteConfig: unknown = (await import(/* @vite-ignore */ pathToFileURL(join(ROOT, 'vite.config.ts')).href)).default;
    const deny = (viteConfig as { server?: { fs?: { deny?: string[] } } }).server?.fs?.deny ?? [];
    for (const p of ['.env', '.env.*', '**/*.ipynb', '**/Data/**', '**/local/**', '**/.superpowers/**', '**/.vercel/**']) expect(deny).toContain(p);
  });
});
