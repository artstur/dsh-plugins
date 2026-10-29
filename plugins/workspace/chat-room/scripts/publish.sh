#!/bin/sh
# Build the package and publish it to npm.
#
#   sh scripts/publish.sh --dry-run   build and show what would be published
#   sh scripts/publish.sh              build and publish
#
# The published name is the one the plugin uses as its update source, so it
# has to match the name the package is installed under.
set -e
cd "$(dirname "$0")/.."

sh scripts/build-package.sh

VERSION=$(node -p "require('./package.json').version")
NAME="${PUBLISHED_NAME:-dsh-chat-room}"
ROOT=$(cd .. && pwd)
TARBALL="$ROOT/dist/chat-room-$VERSION.tgz"

if [ ! -f "$TARBALL" ]; then
  echo "publish: $TARBALL is missing" >&2
  exit 1
fi

echo "publishing $NAME@$VERSION from $TARBALL"
if [ "$1" = "--dry-run" ]; then
  npm publish "$TARBALL" --access public --dry-run
  echo "dry run only; nothing was published"
  exit 0
fi

npm publish "$TARBALL" --access public
echo "published $NAME@$VERSION"
echo "the other side's plugin picks it up on its own from now on"
