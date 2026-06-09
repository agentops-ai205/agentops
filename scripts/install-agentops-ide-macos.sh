#!/bin/zsh
set -euo pipefail

REPO="${AGENTOPS_REPO:-agentops-ai205/agentops}"
APP_NAME="AgentOps IDE"
APP_BUNDLE="$APP_NAME.app"
INSTALL_DIR="${AGENTOPS_INSTALL_DIR:-$HOME/Applications}"
TARGET="$INSTALL_DIR/$APP_BUNDLE"
LOCAL_DMG="${AGENTOPS_DMG_PATH:-}"
OPEN_AFTER_INSTALL="${AGENTOPS_OPEN_AFTER_INSTALL:-1}"

usage() {
  cat <<'EOF'
Usage:
  install-agentops-ide-macos.sh [version]

Examples:
  install-agentops-ide-macos.sh
  install-agentops-ide-macos.sh v1.0.8
  AGENTOPS_REPO=owner/repo install-agentops-ide-macos.sh v1.0.8
  AGENTOPS_DMG_PATH=~/Downloads/AgentOps.IDE_1.0.8_aarch64.dmg install-agentops-ide-macos.sh

This installs the public unsigned macOS build into ~/Applications and removes
the browser quarantine flag from the local copy.
EOF
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

command -v curl >/dev/null || { echo "curl is required."; exit 1; }
command -v hdiutil >/dev/null || { echo "hdiutil is required on macOS."; exit 1; }

OS="$(uname -s)"
if [ "$OS" != "Darwin" ]; then
  echo "This installer only supports macOS."
  exit 1
fi

CPU="$(uname -m)"
case "$CPU" in
  arm64) TAURI_ARCH="aarch64" ;;
  x86_64) TAURI_ARCH="x64" ;;
  *)
    echo "Unsupported Mac CPU architecture: $CPU"
    exit 1
    ;;
esac

VERSION_INPUT="${1:-latest}"
if [ -n "$LOCAL_DMG" ]; then
  TAG="${VERSION_INPUT:-local}"
  APP_VERSION="${TAG#v}"
  ASSET_NAME="$(basename "${LOCAL_DMG/#\~/$HOME}")"
  DOWNLOAD_URL=""
else
  if [ "$VERSION_INPUT" = "latest" ]; then
    LATEST_URL="$(curl -fsSIL -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest")"
    TAG="${LATEST_URL##*/}"
  else
    TAG="$VERSION_INPUT"
  fi

  APP_VERSION="${TAG#v}"
  ASSET_NAME="AgentOps.IDE_${APP_VERSION}_${TAURI_ARCH}.dmg"
  DOWNLOAD_URL="https://github.com/$REPO/releases/download/$TAG/$ASSET_NAME"
fi
TMP_DIR="$(mktemp -d)"
DMG_PATH="$TMP_DIR/$ASSET_NAME"
MOUNT_POINT=""
DEFAULT_MOUNT_POINT="/Volumes/$APP_NAME"
DID_ATTACH=0

cleanup() {
  if [ "$DID_ATTACH" = "1" ] && [ -n "$MOUNT_POINT" ] && [ -d "$MOUNT_POINT" ]; then
    hdiutil detach "$MOUNT_POINT" -quiet >/dev/null 2>&1 || true
  fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

echo "AgentOps IDE macOS installer"
echo "Repository: $REPO"
if [ -n "$LOCAL_DMG" ]; then
  echo "Local DMG: $LOCAL_DMG"
else
  echo "Release: $TAG"
  echo "Asset: $ASSET_NAME"
fi
echo ""
if [ -n "$LOCAL_DMG" ]; then
  LOCAL_DMG="${LOCAL_DMG/#\~/$HOME}"
  if [ ! -f "$LOCAL_DMG" ]; then
    echo "Local DMG not found: $LOCAL_DMG"
    exit 1
  fi
  cp "$LOCAL_DMG" "$DMG_PATH"
else
  echo "Downloading..."
  if ! curl -fL "$DOWNLOAD_URL" -o "$DMG_PATH"; then
    echo ""
    echo "Could not download $ASSET_NAME."
    if [ "$TAURI_ARCH" = "x64" ]; then
      echo "This release may not include an Intel Mac build yet."
    fi
    exit 1
  fi
fi

xattr -dr com.apple.quarantine "$DMG_PATH" >/dev/null 2>&1 || true

echo "Mounting..."
if [ -d "$DEFAULT_MOUNT_POINT/$APP_BUNDLE" ]; then
  MOUNT_POINT="$DEFAULT_MOUNT_POINT"
else
  ATTACH_OUTPUT="$(hdiutil attach "$DMG_PATH" -nobrowse)"
  DID_ATTACH=1
  MOUNT_POINT="$(printf '%s\n' "$ATTACH_OUTPUT" | awk -F '\t' '/\/Volumes\// {print $NF; exit}')"
fi
if [ -z "$MOUNT_POINT" ] || [ ! -d "$MOUNT_POINT" ]; then
  echo "Could not locate the mounted AgentOps volume."
  exit 1
fi

SOURCE_APP="$(find "$MOUNT_POINT" -maxdepth 1 -name "*.app" -type d | head -n 1)"
if [ -z "$SOURCE_APP" ]; then
  echo "No .app bundle found inside the DMG."
  exit 1
fi

echo "Installing to $TARGET..."
mkdir -p "$INSTALL_DIR"
rm -rf "$TARGET"
ditto "$SOURCE_APP" "$TARGET"

echo "Removing local quarantine marker..."
xattr -cr "$TARGET" >/dev/null 2>&1 || true

if [ "$OPEN_AFTER_INSTALL" != "0" ]; then
  echo "Opening AgentOps IDE..."
  open "$TARGET"
fi

echo ""
echo "Installed: $TARGET"
echo "Done."
