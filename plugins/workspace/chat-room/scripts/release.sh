#!/bin/sh
# Create the public releases repository and publish a release into it.
#
# The repository is created with the GitHub API (push-to-create is disabled
# for this organization), so a token is needed once. Everything after that is
# a plain git push over SSH.
#
#   TOKEN_FILE=~/.dsh/github-token sh scripts/release.sh
#
# The token needs the "repo" scope (and "admin:org" when the organization
# asks for it). The file must contain the token and nothing else.
set -e
cd "$(dirname "$0")/.."

ORG="${ORG:-CeliaSy07}"
NAME="${NAME:-dsh-chat-room-releases}"
TOKEN_FILE="${TOKEN_FILE:-$HOME/.dsh/github-token}"
REMOTE="git@github.com:$ORG/$NAME.git"
ROOT=$(cd .. && pwd)
RELEASES_REPO="${RELEASES_REPO:-$ROOT/$NAME}"
# jsDelivr serves the immutable release files straight from the repository
# and is quick from China; the manifest itself is a changing path, so it can
# take a couple of minutes to refresh there.
PUBLIC_URL="${PUBLIC_URL:-https://cdn.jsdelivr.net/gh/$ORG/$NAME@main}"
API="https://api.github.com"

# --- the repository -------------------------------------------------------
# A token is only needed to create the repository; when it already exists,
# pushing over SSH is enough. So without a token we simply try to clone.
if [ -f "$TOKEN_FILE" ]; then
  TOKEN=$(tr -d '\n\r' < "$TOKEN_FILE")
else
  TOKEN=""
fi

if [ ! -d "$RELEASES_REPO/.git" ]; then
  if ! git clone "$REMOTE" "$RELEASES_REPO" 2>/dev/null; then
    rm -rf "$RELEASES_REPO"
    if [ -z "$TOKEN" ]; then
      echo "repository $ORG/$NAME does not exist and no token was given" >&2
      echo "create it in the browser, or write a token to $TOKEN_FILE" >&2
      exit 1
    fi
    echo "creating public repository $ORG/$NAME"
    RESPONSE=$(curl -sS -X POST -H "Authorization: Bearer $TOKEN" \
      -H "User-Agent: dsh-chat-room-release" \
      -d "{\"name\":\"$NAME\",\"private\":false,\"description\":\"Published releases of the DSH message plugin.\",\"auto_init\":false}" \
      "$API/orgs/$ORG/repos")
    case "$RESPONSE" in
      *'"html_url"'*) echo "created: $(printf '%s' "$RESPONSE" | sed -E 's/.*"html_url": *"([^"]+)".*/\1/')" ;;
      *) echo "could not create the repository:" >&2; printf '%s\n' "$RESPONSE" >&2; exit 1 ;;
    esac
    sleep 2
    git clone "$REMOTE" "$RELEASES_REPO"
  fi
else
  echo "repository $ORG/$NAME already cloned"
fi

# --- the release ----------------------------------------------------------
VERSION=$(node -p "require('./package.json').version")
TARBALL="$ROOT/dist/chat-room-$VERSION.tgz"

sh scripts/build-package.sh
if [ ! -f "$TARBALL" ]; then
  echo "release: $TARBALL is missing" >&2
  exit 1
fi

SHA=$(shasum -a 256 "$TARBALL" | cut -d' ' -f1)
PACKAGE_URL="$PUBLIC_URL/releases/chat-room-$VERSION.tgz"

mkdir -p "$RELEASES_REPO/releases"
cp "$TARBALL" "$RELEASES_REPO/releases/chat-room-$VERSION.tgz"

cat > "$RELEASES_REPO/release.json" <<JSON
{
  "version": "$VERSION",
  "url": "$PACKAGE_URL",
  "sha256": "$SHA"
}
JSON

cd "$RELEASES_REPO"
git add release.json "releases/chat-room-$VERSION.tgz"
git commit -m "release: chat-room $VERSION"
git push origin HEAD:main

# --- the notice ----------------------------------------------------------
# The plugin listens on this topic, so the red dot appears right away. The
# notice only says that something was published; the manifest decides what.
RELAY="${RELAY:-https://ntfy.sh}"
TOPIC="${TOPIC:-dsh-chat-room-releases}"
# The notice is signed, so the plugin only believes a notice that really
# comes from here. The key is kept in the plugin data directory, with a copy
# in this repository as a backup.
KEY_FILE="${KEY_FILE:-$ROOT/../chat-room/.release-key.pem}"
if [ ! -f "$KEY_FILE" ]; then
  KEY_FILE="${DSH_HOME:-$HOME/.dsh}/plugin-data/chat-room/release-key.pem"
fi
if [ -f "$KEY_FILE" ]; then
  NOTICE=$(node -e "
const crypto = require('crypto');
const fs = require('fs');
const key = crypto.createPrivateKey(fs.readFileSync(process.argv[1], 'utf8'));
const payload = [process.argv[2], process.argv[3], process.argv[4]].join('\n');
const sig = crypto.sign(null, Buffer.from(payload, 'utf8'), key).toString('base64');
process.stdout.write(JSON.stringify({
  kind: 'release',
  version: process.argv[2],
  url: process.argv[3],
  sha256: process.argv[4],
  sig,
}));
" "$KEY_FILE" "$VERSION" "$PACKAGE_URL" "$SHA")
  if curl -sS -m 20 -o /dev/null -w '%{http_code}' \
    -H 'Content-Type: application/json' -d "$NOTICE" "$RELAY/$TOPIC" | grep -q '200'; then
    echo "announced $VERSION (signed) on $RELAY/$TOPIC"
  else
    echo "could not announce the release (the plugin will still find it by itself)" >&2
  fi
else
  echo "no signing key at $KEY_FILE, the notice stays unsigned" >&2
fi

echo
echo "published chat-room $VERSION"
echo "  manifest: $PUBLIC_URL/release.json"
echo "  package : $PACKAGE_URL"
echo "  sha256  : $SHA"
