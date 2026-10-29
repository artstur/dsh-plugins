/**
 * Renames a staged package to the name it is published under.
 *
 * The patch inserts a row that names the module, and the client registers
 * itself under its own package name. All of them have to carry the published
 * name, or the bundle asks for a module that is not installed and the plugin
 * never loads.
 *
 * Usage: node scripts/rename-package.mjs <cordis.patch.yml> <client.js> <name>
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [patchPath, clientPath, name] = process.argv.slice(2);
if (!patchPath || !clientPath || !name) {
  console.error('usage: rename-package.mjs <patch.yml> <client.js> <name>');
  process.exit(1);
}

const patch = readFileSync(patchPath, 'utf8');
writeFileSync(patchPath, patch.replace(/name:\s*'[^']*'/g, `name: '${name}'`));

const client = readFileSync(clientPath, 'utf8');
writeFileSync(clientPath, client.split("'@local/chat-room'").join(`'${name}'`));
