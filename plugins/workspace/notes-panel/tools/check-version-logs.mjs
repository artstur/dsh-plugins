#!/usr/bin/env node
/**
 * Reports workspace DSH plugin bundles that do not register a version log with
 * the Notes plugin. Run it after adding or editing a plugin:
 *
 *   node tools/check-version-logs.mjs [workspace-root]
 *
 * Exits with code 1 when at least one plugin is missing a registration, so an
 * agent can treat it as a check.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(process.argv[2] || join(here, '..', '..'));

const SIGNATURE = /__dshPluginVersionLog(Sink|Queue)|pluginVersionLog|registerPluginVersionLog/;

const missing = [];
const entries = [];
for (const name of readdirSync(workspaceRoot)) {
  if (name.startsWith('.')) continue;
  const dir = join(workspaceRoot, name);
  let pkg;
  try {
    if (!statSync(dir).isDirectory()) continue;
    pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  } catch (err) {
    continue;
  }
  if (!pkg || typeof pkg !== 'object' || !pkg.dsh || !pkg.dsh.bundle) continue;
  entries.push({ name, id: typeof pkg.name === 'string' ? pkg.name : name, dir });
}

for (const entry of entries) {
  let found = false;
  for (const file of ['client.js', 'index.js']) {
    try {
      if (SIGNATURE.test(readFileSync(join(entry.dir, file), 'utf8'))) {
        found = true;
        break;
      }
    } catch (err) {
      /* missing file is fine; the plugin may ship only a Host half */
    }
  }
  if (found) {
    console.log('ok    ' + entry.id);
  } else {
    console.log('MISS  ' + entry.id + '   (' + entry.name + ')');
    missing.push(entry.id);
  }
}

console.log('');
if (missing.length === 0) {
  console.log('All ' + entries.length + ' workspace plugin bundle(s) register a version log.');
  process.exit(0);
}
console.log(missing.length + ' of ' + entries.length + ' plugin bundle(s) do not register a version log:');
for (const id of missing) console.log('  - ' + id);
console.log('');
console.log('Add the registration effect from notes-panel/templates/plugin-version-log.js to the');
console.log('plugin Client half, then rerun this check.');
process.exit(1);
