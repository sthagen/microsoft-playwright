#!/bin/bash
# This script is designed to build Firefox & WebKit on various Linux
# distributions inside docker containers.
set -e
set -x
set -o pipefail

if [[ ($1 == '--help') || ($1 == '-h') ]]; then
  echo "usage: $(basename "$0") [webkit-ubuntu-20.04|firefox-debian-11|...] [prepare|compile|enter|kill]"
  echo
  echo "Builds Webkit or Firefox browser inside given Linux distribution"
  echo "NOTE: Run without second argument to enter bash inside the prepared docker container."
  exit 0
fi

export BUILD_FLAVOR="${1}"

DOCKER_PLATFORM="linux/amd64"
DOCKER_IMAGE_NAME=""

############################################################
###                       FIREFOX                        ###
############################################################

if [[ "${BUILD_FLAVOR}" == "firefox-ubuntu-18.04" ]]; then
  DOCKER_PLATFORM="linux/amd64"
  DOCKER_IMAGE_NAME="ubuntu:18.04"
elif [[ "${BUILD_FLAVOR}" == "firefox-ubuntu-20.04" ]]; then
  DOCKER_PLATFORM="linux/amd64"
  DOCKER_IMAGE_NAME="ubuntu:20.04"
elif [[ "${BUILD_FLAVOR}" == "firefox-ubuntu-20.04-arm64" ]]; then
  DOCKER_PLATFORM="linux/arm64"
  DOCKER_IMAGE_NAME="ubuntu:20.04"
elif [[ "${BUILD_FLAVOR}" == "firefox-ubuntu-22.04" ]]; then
  DOCKER_PLATFORM="linux/amd64"
  DOCKER_IMAGE_NAME="ubuntu:22.04"
elif [[ "${BUILD_FLAVOR}" == "firefox-ubuntu-22.04-arm64" ]]; then
  DOCKER_PLATFORM="linux/arm64"
  DOCKER_IMAGE_NAME="ubuntu:22.04"
elif [[ "${BUILD_FLAVOR}" == "firefox-debian-11" ]]; then
  DOCKER_PLATFORM="linux/amd64"
  DOCKER_IMAGE_NAME="debian:11"

############################################################
###                   FIREFOX-BETA                       ###
############################################################

elif [[ "${BUILD_FLAVOR}" == "firefox-beta-ubuntu-18.04" ]]; then
  DOCKER_PLATFORM="linux/amd64"
  DOCKER_IMAGE_NAME="ubuntu:18.04"
elif [[ "${BUILD_FLAVOR}" == "firefox-beta-ubuntu-20.04" ]]; then
  DOCKER_PLATFORM="linux/amd64"
  DOCKER_IMAGE_NAME="ubuntu:20.04"
elif [[ "${BUILD_FLAVOR}" == "firefox-beta-ubuntu-20.04-arm64" ]]; then
  DOCKER_PLATFORM="linux/arm64"
  DOCKER_IMAGE_NAME="ubuntu:20.04"
elif [[ "${BUILD_FLAVOR}" == "firefox-beta-ubuntu-22.04" ]]; then
  DOCKER_PLATFORM="linux/amd64"
  DOCKER_IMAGE_NAME="ubuntu:22.04"
elif [[ "${BUILD_FLAVOR}" == "firefox-beta-ubuntu-22.04-arm64" ]]; then
  DOCKER_PLATFORM="linux/arm64"
  DOCKER_IMAGE_NAME="ubuntu:22.04"
elif [[ "${BUILD_FLAVOR}" == "firefox-beta-debian-11" ]]; then
  DOCKER_PLATFORM="linux/amd64"
  DOCKER_IMAGE_NAME="debian:11"

############################################################
###                        WEBKIT                        ###
############################################################

elif [[ "${BUILD_FLAVOR}" == "webkit-ubuntu-18.04" ]]; then
  DOCKER_PLATFORM="linux/amd64"
  DOCKER_IMAGE_NAME="ubuntu:18.04"
elif [[ "${BUILD_FLAVOR}" == "webkit-ubuntu-20.04" ]]; then
  DOCKER_PLATFORM="linux/amd64"
  DOCKER_IMAGE_NAME="ubuntu:20.04"
elif [[ "${BUILD_FLAVOR}" == "webkit-ubuntu-20.04-arm64" ]]; then
  DOCKER_PLATFORM="linux/arm64"
  DOCKER_IMAGE_NAME="ubuntu:20.04"
elif [[ "${BUILD_FLAVOR}" == "webkit-ubuntu-22.04" ]]; then
  DOCKER_PLATFORM="linux/amd64"
  DOCKER_IMAGE_NAME="ubuntu:22.04"
elif [[ "${BUILD_FLAVOR}" == "webkit-ubuntu-22.04-arm64" ]]; then
  DOCKER_PLATFORM="linux/arm64"
  DOCKER_IMAGE_NAME="ubuntu:22.04"
elif [[ "${BUILD_FLAVOR}" == "webkit-debian-11" ]]; then
  DOCKER_PLATFORM="linux/amd64"
  DOCKER_IMAGE_NAME="debian:11"
elif [[ "${BUILD_FLAVOR}" == "webkit-universal" ]]; then
  DOCKER_PLATFORM="linux/amd64"
  DOCKER_IMAGE_NAME="ubuntu:20.04"
else
  echo "ERROR: unknown build flavor - '${BUILD_FLAVOR}'"
  exit 1
fi

DOCKER_CONTAINER_NAME="build-${BUILD_FLAVOR}"
DOCKER_ARGS=$(echo \
  --env CI \
  --env BUILD_FLAVOR \
  --env TELEGRAM_BOT_KEY \
  --env AZ_ACCOUNT_NAME \
  --env AZ_ACCOUNT_KEY \
  --env GITHUB_SERVER_URL \
  --env GITHUB_REPOSITORY \
  --env GITHUB_RUN_ID \
  --env GH_TOKEN \
  --env DEBIAN_FRONTEND=noninteractive \
  --env TZ="America/Los_Angeles"
)

function ensure_docker_container {
  if docker ps | grep "${DOCKER_CONTAINER_NAME}" 2>&1 1>/dev/null; then
    return;
  fi
  if [[ "${BUILD_FLAVOR}" == "webkit-universal" ]]; then
    # NOTE: WebKit Linux Universal build is run in PRIVILEGED container due to Flatpak!
    DOCKER_ARGS="${DOCKER_ARGS} --privileged"
  fi
  docker pull --platform "${DOCKER_PLATFORM}" "${DOCKER_IMAGE_NAME}"
  docker run --rm ${DOCKER_ARGS} --name "${DOCKER_CONTAINER_NAME}" --platform "${DOCKER_PLATFORM}" -d -t "${DOCKER_IMAGE_NAME}" /bin/bash
  docker exec ${DOCKER_ARGS} "${DOCKER_CONTAINER_NAME}" /bin/bash -c '
    set -e
    arch
    if [[ "${BUILD_FLAVOR}" == webkit-debian-11 ]]; then
      # Add contrib & non-free to package list
      echo "deb http://ftp.us.debian.org/debian bullseye main contrib non-free" >> /etc/apt/sources.list.d/pwbuild.list
    fi

    apt-get update && apt-get install -y wget \
                                         git-core \
                                         curl \
                                         autoconf2.13 \
                                         tzdata \
                                         sudo \
                                         zip \
                                         gcc \
                                         unzip

    if [[ "${BUILD_FLAVOR}" == "firefox-ubuntu-22.04-arm64" || "${BUILD_FLAVOR}" == "firefox-beta-ubuntu-22.04-arm64" ]]; then
      apt-get install -y clang-14
    elif [[ "${BUILD_FLAVOR}" == *"-arm64" ]]; then
      apt-get install -y clang-12
    fi

    # Install Python3.
    # Firefox build on Ubuntu 18.04 requires Python3.8 to run its build scripts.
    # WebKit build on Ubuntu 18.04 fails with the Python 3.8 installation but works
    # with Python 3.6 that is shipped as default python3 on Ubuntu 18.
    if [[ "${BUILD_FLAVOR}" == "firefox-ubuntu-18.04" || "${BUILD_FLAVOR}" == "firefox-beta-ubuntu-18.04" ]]; then
      apt-get install -y python3.8 python3.8-dev python3.8-distutils
      # Point python3 to python3.8
      update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.8 2
      curl -sSL https://bootstrap.pypa.io/get-pip.py -o get-pip.py && \
          python3 get-pip.py && \
          rm get-pip.py
    else
      apt-get install -y python3 python3-dev python3-pip python3-distutils
    fi

    # Install AZ CLI with Python since they do not ship
    # aarch64 to APT: https://github.com/Azure/azure-cli/issues/7368
    # Pin so future releases dont break us.
    pip3 install azure-cli==2.38.0

    # Create the pwuser and make it passwordless sudoer.
    adduser --disabled-password --gecos "" pwuser
    echo "ALL            ALL = (ALL) NOPASSWD: ALL" >> /etc/sudoers

    # Install node16
    curl -sL https://deb.nodesource.com/setup_16.x | bash - && apt-get install -y nodejs

    if [[ "${BUILD_FLAVOR}" == "firefox-"* ]]; then
      # install rust as a pwuser
      su -l pwuser -c "curl --proto \"=https\" --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y"
      echo "PATH=\"${PATH}:/home/pwuser/.cargo/bin\"" > /etc/environment
    elif [[ "${BUILD_FLAVOR}" == "webkit-ubuntu-18.04" ]]; then
      # Ubuntu 18.04 specific: update CMake. Default CMake on Ubuntu 18.04 is 3.10, whereas WebKit requires 3.12+.
      apt purge --auto-remove cmake
      apt-get install -y wget software-properties-common
      wget -O - https://apt.kitware.com/keys/kitware-archive-latest.asc 2>/dev/null | gpg --dearmor - | sudo tee /etc/apt/trusted.gpg.d/kitware.gpg >/dev/null
      apt-add-repository "deb https://apt.kitware.com/ubuntu/ bionic main"
      apt-get update && apt-get install -y cmake

      # Ubuntu 18.04 specific: install GCC-8. WebKit requires gcc 8.3+ to compile.
      apt-get install -y gcc-8 g++-8
    fi

    git config --system user.email "you@example.com"
    git config --system user.name "Your Name"

    # mitigate git clone issues on CI.
    # See https://stdworkflow.com/877/error-rpc-failed-curl-56-gnutls-recv-error-54-error-in-the-pull-function
    git config --system http.postBuffer 524288000
    git config --system http.lowSpeedLimit 0
    git config --system http.lowSpeedTime 999999

    cd /home/pwuser
    su -l pwuser -c "git clone --depth=1 https://github.com/microsoft/playwright"
  '
}

if [[ "$2" == "prepare" || "$2" == "start" ]]; then
  ensure_docker_container
elif [[ "$2" == "compile" ]]; then
  ensure_docker_container
  echo "BUILD FLAVOR: ${BUILD_FLAVOR}"
  docker exec --user pwuser --workdir "/home/pwuser/playwright" ${DOCKER_ARGS} "${DOCKER_CONTAINER_NAME}" /bin/bash -c '
    if [[ "${BUILD_FLAVOR}" == "webkit-ubuntu-18.04" ]]; then
      export CC=/usr/bin/gcc-8
      export CXX=/usr/bin/g++-8
    elif [[ "${BUILD_FLAVOR}" == "firefox-ubuntu-22.04-arm64" || "${BUILD_FLAVOR}" == "firefox-beta-ubuntu-22.04-arm64" ]]; then
      export CC=/usr/bin/clang-14
      export CXX=/usr/bin/clang++-14
    elif [[ "${BUILD_FLAVOR}" == *"-arm64" ]]; then
      export CC=/usr/bin/clang-12
      export CXX=/usr/bin/clang++-12
    fi
    # For non-login non-interactive shells, we have to source
    # cargo env explicitly since /env/environment is not read.
    if [[ -f "$HOME/.cargo/env" ]]; then
      source "$HOME/.cargo/env"
    fi
    ./browser_patches/checkout_build_archive_upload.sh "${BUILD_FLAVOR}"
  '
elif [[ "$2" == "enter" || -z "$2" ]]; then
  ensure_docker_container
  docker exec --user pwuser --workdir "/home/pwuser/playwright" ${DOCKER_ARGS} -it "${DOCKER_CONTAINER_NAME}" /bin/bash
elif [[ "$2" == "kill" || "$2" == "stop" ]]; then
  docker kill "${DOCKER_CONTAINER_NAME}"
  # Wait for container to stop
  docker wait "${DOCKER_CONTAINER_NAME}" || true
else
  echo "ERROR: unknown command - $2"
  exit 1
fi

