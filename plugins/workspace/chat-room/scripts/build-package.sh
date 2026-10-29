#!/bin/sh
# Build the two distributable artifacts from this checkout.
#
#   dist/chat-room-<version>.tgz  npm-style tarball; `plugin_manager install_bundle`
#                                 takes it directly, so the person on the other side
#                                 needs no unzip, no shell and one approval.
#   dist/chat-room-<version>.zip  the same files in a folder, for people who prefer
#                                 to unpack it by hand before installing.
#
# Usage: sh scripts/build-package.sh
set -e
cd "$(dirname "$0")/.."

VERSION=$(node -p "require('./package.json').version")

# The name the package is published under. It has to match the name the
# person installs, because the plugin refuses an update that would replace it
# with a different package.
PUBLISHED_NAME="${PUBLISHED_NAME:-dsh-chat-room}"
ROOT=$(cd .. && pwd)
OUT="$ROOT/dist"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$OUT"


# --- documentation --------------------------------------------------------
# The documents name the package and its version. They are written with
# placeholders so a release never ships a stale file name.
fill() {
  node -e "
const fs = require('fs');
const file = process.argv[1];
const version = process.argv[2];
const name = process.argv[3];
let text = fs.readFileSync(file, 'utf8');
text = text.split('{{VERSION}}').join(version).split('{{PKG}}').join(name);
fs.writeFileSync(file, text);
" "$1" "$VERSION" "$PUBLISHED_NAME"
}

fill_tree() {
  for doc in "$1"/README.md "$1"/docs/*.md; do
    [ -f "$doc" ] && fill "$doc"
  done
}

# --- the package identity ------------------------------------------------
# The patch inserts a row that names the module, and the client registers
# itself under its own package name. All of them have to become the
# published name, or the bundle loads a module that is not installed.
rename_package() {
  node scripts/rename-package.mjs "$1" "$2" "$PUBLISHED_NAME"
}

# --- tarball -------------------------------------------------------------
mkdir -p "$STAGE/package/locale"
cp package.json index.js protocol.js client.js cordis.patch.yml icon.svg README.md LICENSE "$STAGE/package/"
cp locale/*.json "$STAGE/package/locale/"
if [ -d docs ]; then
  mkdir -p "$STAGE/package/docs"
  cp docs/*.md "$STAGE/package/docs/" 2>/dev/null || true
fi

# A tarball must not stay marked private: npm/pnpm then treat it as unpublishable.
node -e "
const fs = require('fs');
const file = process.argv[1];
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
delete data.private;
data.name = process.argv[2];
data.files = [
  'index.js',
  'protocol.js',
  'client.js',
  'cordis.patch.yml',
  'locale/*.json',
  'icon.svg',
  'README.md',
  'LICENSE',
  'docs/*',
];
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
" "$STAGE/package/package.json" "$PUBLISHED_NAME"

rename_package "$STAGE/package/cordis.patch.yml" "$STAGE/package/client.js"
node scripts/verify-package.mjs "$STAGE/package/package.json" "$STAGE/package/cordis.patch.yml" "$STAGE/package/client.js"
fill_tree "$STAGE/package"

# macOS writes ._name resource forks next to every file; they must not ship.
find "$STAGE" -name '._*' -delete
COPYFILE_DISABLE=1 tar -czf "$OUT/chat-room-$VERSION.tgz" -C "$STAGE" package

# --- zip ----------------------------------------------------------------
rm -rf "$STAGE/chat-room-$VERSION"
mkdir -p "$STAGE/chat-room-$VERSION"
cp package.json index.js protocol.js client.js cordis.patch.yml icon.svg README.md LICENSE "$STAGE/chat-room-$VERSION/"
cp -R locale "$STAGE/chat-room-$VERSION/locale"
if [ -d docs ]; then cp -R docs "$STAGE/chat-room-$VERSION/docs"; fi
# Same reason as the tarball: a private marker makes the package look
# unpublishable to the package manager when it installs from a directory.
node -e "
const fs = require('fs');
const file = process.argv[1];
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
delete data.private;
data.name = process.argv[2];
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
" "$STAGE/chat-room-$VERSION/package.json" "$PUBLISHED_NAME"
rename_package "$STAGE/chat-room-$VERSION/cordis.patch.yml" "$STAGE/chat-room-$VERSION/client.js"
node scripts/verify-package.mjs "$STAGE/chat-room-$VERSION/package.json" "$STAGE/chat-room-$VERSION/cordis.patch.yml" "$STAGE/chat-room-$VERSION/client.js"
fill_tree "$STAGE/chat-room-$VERSION"
find "$STAGE" -name '._*' -delete
(cd "$STAGE" && zip -r -q -X "$OUT/chat-room-$VERSION.zip" "chat-room-$VERSION")

# --- the note that is handed over on its own -----------------------------
if [ -f docs/对方安装说明.md ]; then
  cp docs/对方安装说明.md "$OUT/对方安装说明.md"
  fill "$OUT/对方安装说明.md"
fi

echo "built $OUT/chat-room-$VERSION.tgz"
echo "built $OUT/chat-room-$VERSION.zip"
