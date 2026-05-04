#!/bin/sh
set -eu

template="/usr/share/nginx/html/env.template.js"
target="/usr/share/nginx/html/env.js"

if [ -f "$template" ]; then
  envsubst '${FILLER_WS_URL} ${FILLER_API_URL}' < "$template" > "$target"
fi
