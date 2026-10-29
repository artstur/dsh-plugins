/**
 * Checks that a built package is self-consistent.
 *
 * The patch inserts a row that names the module and the client registers
 * itself under its own package name. When those disagree with the package
 * name, the bundle asks for a module that is not installed and the plugin
 * never loads — on a fresh machine, where nothing else provides it.
 *
 * Usage: node scripts/verify-package.mjs <package.json> <cordis.patch.yml> <client.js>
 */
import { readFileSync } from 'node:fs';

const [packagePath, patchPath, clientPath] = process.argv.slice(2);
if (!packagePath || !patchPath || !clientPath) {
  console.error('usage: verify-package.mjs <package.json> <patch.yml> <client.js>');
  process.exit(1);
}

const name = JSON.parse(readFileSync(packagePath, 'utf8')).name;
const patch = readFileSync(patchPath, 'utf8');
const client = readFileSync(clientPath, 'utf8');

const problems = [];

const rowNames = [...patch.matchAll(/name:\s*'([^']+)'/g)].map((match) => match[1]);
if (!rowNames.length) problems.push('the patch inserts no row');
for (const rowName of rowNames) {
  if (rowName !== name) {
    problems.push(`the patch row names "${rowName}" but the package is "${name}"`);
  }
}

const moduleId = client.match(/id:\s*'([^']+)'/);
if (!moduleId) problems.push('the client registers no module id');
else if (moduleId[1] !== name) {
  problems.push(`the client registers "${moduleId[1]}" but the package is "${name}"`);
}

// Stale version constants are invisible until something compares them, so
// they are checked here instead.
const version = JSON.parse(readFileSync(packagePath, 'utf8')).version;
const build = client.match(/CLIENT_BUILD\s*=\s*'([^']+)'/);
if (!build) problems.push('the client declares no front-end build version');
else if (build[1] !== version) {
  problems.push(`the client front-end build is "${build[1]}" but the package is "${version}"`);
}

const zip = client.match(/PLUGIN_ZIP\s*=\s*'([^']+)'/);
if (!zip) problems.push('the client declares no package file name');
else if (zip[1] !== `chat-room-${version}.tgz`) {
  problems.push(`the client names "${zip[1]}" but the package is chat-room-${version}.tgz`);
}

const logVersion = client.match(/\n\s*version:\s*'([^']+)',\s*\n\s*entries:/);
if (!logVersion) problems.push('the client registers no version log');
else if (logVersion[1] !== version) {
  problems.push(`the version log says "${logVersion[1]}" but the package is "${version}"`);
}

if (problems.length) {
  console.error('package is not self-consistent:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`package "${name}" is self-consistent`);
