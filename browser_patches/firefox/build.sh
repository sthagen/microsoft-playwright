#!/bin/bash
set -e
set +x

RUST_VERSION="1.57.0"
CBINDGEN_VERSION="0.19.0"

trap "cd $(pwd -P)" EXIT

cd "$(dirname "$0")"
SCRIPT_FOLDER="$(pwd -P)"
source "${SCRIPT_FOLDER}/../utils.sh"

if [[ ! -z "${FF_CHECKOUT_PATH}" ]]; then
  cd "${FF_CHECKOUT_PATH}"
  echo "WARNING: checkout path from FF_CHECKOUT_PATH env: ${FF_CHECKOUT_PATH}"
else
  cd "$HOME/firefox"
fi

rm -rf .mozconfig

if is_mac; then
  selectXcodeVersionOrDie $(node "${SCRIPT_FOLDER}/../get_xcode_version.js" firefox)
  echo "-- building on Mac"
elif is_linux; then
  echo "-- building on Linux"
elif is_win; then
  echo "ac_add_options --disable-update-agent" >> .mozconfig
  echo "ac_add_options --disable-default-browser-agent" >> .mozconfig
  echo "ac_add_options --disable-maintenance-service" >> .mozconfig

  echo "-- building on Windows"
  echo "ac_add_options --target=x86_64-pc-mingw32" >> .mozconfig
  echo "ac_add_options --host=x86_64-pc-mingw32" >> .mozconfig
  DLL_FILE=$("C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe" -latest -find '**\Redist\MSVC\*\x64\**\vcruntime140.dll')
  WIN32_REDIST_DIR=$(dirname "$DLL_FILE")
  if ! [[ -d $WIN32_REDIST_DIR ]]; then
    echo "ERROR: cannot find MS VS C++ redistributable $WIN32_REDIST_DIR"
    exit 1;
  fi
else
  echo "ERROR: cannot upload on this platform!" 1>&2
  exit 1;
fi

if [[ $1 == "--linux-arm64" || $2 == "--linux-arm64" ]]; then
  echo "ac_add_options --target=aarch64-linux-gnu" >> .mozconfig
fi

OBJ_FOLDER="obj-build-playwright"
echo "mk_add_options MOZ_OBJDIR=@TOPSRCDIR@/${OBJ_FOLDER}" >> .mozconfig
echo "ac_add_options --disable-crashreporter" >> .mozconfig
echo "ac_add_options --disable-backgroundtasks" >> .mozconfig

if [[ -n $FF_DEBUG_BUILD ]]; then
  echo "ac_add_options --enable-debug" >> .mozconfig
  echo "ac_add_options --enable-debug-symbols" >> .mozconfig
else
  echo "ac_add_options --enable-release" >> .mozconfig
fi

if is_win || is_mac; then
  # This options is only available on win and mac.
  echo "ac_add_options --disable-update-agent" >> .mozconfig
fi

if [[ $1 != "--juggler" ]]; then
  # TODO: rustup is not in the PATH on Windows
  if command -v rustup >/dev/null; then
    # We manage Rust version ourselves.
    echo "-- Using rust v${RUST_VERSION}"
    rustup install "${RUST_VERSION}"
    rustup default "${RUST_VERSION}"
  fi

  # TODO: cargo is not in the PATH on Windows
  if command -v cargo >/dev/null; then
    echo "-- Using cbindgen v${CBINDGEN_VERSION}"
    cargo install cbindgen --version "${CBINDGEN_VERSION}"
  fi
fi

if [[ $1 == "--full" || $2 == "--full" ]]; then
  if is_linux; then
    echo "ac_add_options --enable-bootstrap" >> .mozconfig
    SHELL=/bin/sh ./mach --no-interactive bootstrap --application-choice=browser
  fi
  if [[ ! -z "${WIN32_REDIST_DIR}" ]]; then
    # Having this option in .mozconfig kills incremental compilation.
    echo "export WIN32_REDIST_DIR=\"$WIN32_REDIST_DIR\"" >> .mozconfig
  fi
fi

if is_mac; then
  if [[ ! -d "$HOME/.mozbuild/clang" ]]; then
    echo "ERROR: build toolchains are not found, specifically \$HOME/.mozbuild/clang is not there!"
    echo "Since December, 2021, build toolchains have to be predownloaded (see https://github.com/microsoft/playwright/pull/10929)"
    echo
    echo "To bootstrap toolchains:"
    echo "    ./browser_patches/prepare_checkout.sh firefox-beta"
    echo "    ./browser_patches/build.sh firefox-beta --bootstrap"
    echo
    exit 1
  fi
  export MOZ_AUTOMATION=1
  export MOZ_FETCHES_DIR=$HOME/.mozbuild
fi

if [[ $1 == "--juggler" ]]; then
  ./mach build faster
else
  ./mach build
  if is_mac; then
    node "${SCRIPT_FOLDER}"/install-preferences.js "$PWD"/${OBJ_FOLDER}/dist
  else
    node "${SCRIPT_FOLDER}"/install-preferences.js "$PWD"/${OBJ_FOLDER}/dist/bin
  fi
fi


