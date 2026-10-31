#!/bin/sh
set -e

# only run redis if the flags "--help" and "--redis" aren't supplied.
args="$*"
if [ "${args#*"--help"}" = "$args" ] && [ "${args#*"--redis"}" = "$args" ]; then
  echo "starting redis-server in the background…"
  nohup redis-server --save "" --appendonly no --unixsocket /dev/shm/redis.sock --unixsocketperm 744 --port 0 --bind 127.0.0.1 > /dev/shm/redis.log 2>&1&
  # allow redis to start before we continue and bind
  sleep 2
fi

exec "$@"
