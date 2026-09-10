#!/usr/bin/env bash
set -euo pipefail
# Opt-in during the build, never fetch executables while serving requests.
if [ "${SAMOU_ROUTING_ENABLED:-false}" != "true" ]; then exit 0; fi
mkdir -p .routing
curl --fail --location --retry 3 --proto '=https' https://github.com/Itsizz22/Samou-Go/releases/download/routing-samou-20260910-v1/samou-routing-linux-x64.tar.gz -o .routing/bundle.tar.gz
echo '1c2cef9a0af3466d592c7133094cece500e5dec8906256b823374859308d15e9  .routing/bundle.tar.gz' | sha256sum --check --strict -
tar xzf .routing/bundle.tar.gz -C .routing
chmod 755 .routing/routing-bundle/bin/osrm-routed
