#!/bin/bash
set -e
set +x

trap "cd $(pwd -P)" EXIT
cd "$(dirname $0)"

rm -rf output
mkdir -p output
cd output

BUILD_NUMBER=$(head -1 ../BUILD_NUMBER)
# Support BUILD_NUMBER in the form of <CRREV>.<GENERATION>
# This will allow us to bump generation to produce new builds.
CRREV="${BUILD_NUMBER%.*}"

CHROMIUM_URL=""
CHROMIUM_FOLDER_NAME=""
CHROMIUM_FILES_TO_REMOVE=()

FFMPEG_VERSION="4.3.1"
FFMPEG_URL=""
FFMPEG_BIN_PATH=""

PLATFORM="$1"
if [[ -z "${PLATFORM}" ]]; then
  CURRENT_HOST_OS="$(uname)"
  if [[ "${CURRENT_HOST_OS}" == "Darwin" ]]; then
    PLATFORM="--mac"
  elif [[ "${CURRENT_HOST_OS}" == "Linux" ]]; then
    PLATFORM="--linux"
  elif [[ "${CURRENT_HOST_OS}" == MINGW* ]]; then
    PLATFORM="--win64"
  else
    echo "ERROR: unsupported host platform - ${CURRENT_HOST_OS}"
    exit 1
  fi
fi

if [[ "${PLATFORM}" == "--win32" ]]; then
  CHROMIUM_URL="https://storage.googleapis.com/chromium-browser-snapshots/Win/${CRREV}/chrome-win.zip"
  CHROMIUM_FOLDER_NAME="chrome-win"
  CHROMIUM_FILES_TO_REMOVE+=("chrome-win/interactive_ui_tests.exe")
  FFMPEG_URL="https://playwright2.blob.core.windows.net/builds/ffmpeg/${FFMPEG_VERSION}/ffmpeg-win32.zip"
  FFMPEG_BIN_PATH="ffmpeg.exe"
elif [[ "${PLATFORM}" == "--win64" ]]; then
  CHROMIUM_URL="https://storage.googleapis.com/chromium-browser-snapshots/Win_x64/${CRREV}/chrome-win.zip"
  CHROMIUM_FOLDER_NAME="chrome-win"
  CHROMIUM_FILES_TO_REMOVE+=("chrome-win/interactive_ui_tests.exe")
  FFMPEG_URL="https://playwright2.blob.core.windows.net/builds/ffmpeg/${FFMPEG_VERSION}/ffmpeg-win64.zip"
  FFMPEG_BIN_PATH="ffmpeg.exe"
elif [[ "${PLATFORM}" == "--mac" ]]; then
  CHROMIUM_URL="https://storage.googleapis.com/chromium-browser-snapshots/Mac/${CRREV}/chrome-mac.zip"
  CHROMIUM_FOLDER_NAME="chrome-mac"
  FFMPEG_URL="https://playwright2.blob.core.windows.net/builds/ffmpeg/${FFMPEG_VERSION}/ffmpeg-mac.zip"
  FFMPEG_BIN_PATH="ffmpeg"
elif [[ "${PLATFORM}" == "--linux" ]]; then
  CHROMIUM_URL="https://storage.googleapis.com/chromium-browser-snapshots/Linux_x64/${CRREV}/chrome-linux.zip"
  CHROMIUM_FOLDER_NAME="chrome-linux"
  # Even though we could bundle ffmpeg on Linux (2.5MB zipped), we
  # prefer rely on system-installed ffmpeg instead.
else
  echo "ERROR: unknown platform to build: $1"
  exit 1
fi

echo "--> Pulling Chromium ${CRREV} for ${PLATFORM#--}"

curl --output chromium-upstream.zip "${CHROMIUM_URL}"
unzip chromium-upstream.zip
for file in ${CHROMIUM_FILES_TO_REMOVE[@]}; do
  rm -f "${file}"
done

if [[ -n "${FFMPEG_URL}" ]]; then
  curl --output ffmpeg-upstream.zip "${FFMPEG_URL}"
  unzip ffmpeg-upstream.zip
  cp "$FFMPEG_BIN_PATH" "${CHROMIUM_FOLDER_NAME}"
fi

zip --symlinks -r build.zip "${CHROMIUM_FOLDER_NAME}"
