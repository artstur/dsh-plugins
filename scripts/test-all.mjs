#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'plugins.json'), 'utf8'));
const catalogOnly = process.argv.includes('--catalog-only');
let failed = 0;

for (const item of manifest.plugins) {
  const dir = join(root, item.path);
  const packagePath = join(dir, 'package.json');
  if (!existsSync(packagePath)) {
    console.error('MISS ' + item.path);
    failed += 1;
    continue;
  }
  if (catalogOnly) {
    console.log('OK   ' + item.path);
    continue;
  }
  const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
  for (const file of ['client.js', 'index.js']) {
    const target = join(dir, file);
    if (!existsSync(target)) continue;
    const check = spawnSync(process.execPath, ['--check', target], { stdio: 'inherit' });
    if (check.status !== 0) failed += 1;
  }
  if (pkg.scripts && pkg.scripts.test) {
    const test = spawnSync('npm', ['test'], {
      cwd: dir,
      stdio: 'inherit',
      env: {
        ...process.env,
        DSH_PLUGIN_TEST_ROOT: root,
        DSH_PLUGIN_TEST_LAYOUT: 'monorepo',
      },
    });
    if (test.status !== 0) failed += 1;
  }
}

if (failed) {
  console.error(String(failed) + ' check(s) failed');
  process.exitCode = 1;
} else {
  console.log('All ' + manifest.plugins.length + ' plugin bundles passed.');
}
