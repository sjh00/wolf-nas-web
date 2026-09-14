#!/bin/sh
set -e

BACKEND_HOST="${BACKEND_HOST:-wolfnas}"
BACKEND_PORT="${BACKEND_PORT:-8080}"
LISTEN_PORT="${LISTEN_PORT:-8080}"

export BACKEND_HOST BACKEND_PORT LISTEN_PORT

envsubst '${BACKEND_HOST} ${BACKEND_PORT} ${LISTEN_PORT}' \
    < /etc/nginx/nginx.conf.template \
    > /etc/nginx/nginx.conf

exec nginx -g "daemon off;"
