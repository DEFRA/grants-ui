#!/usr/bin/env bash
set -euo pipefail

PRIMARY="${PRIMARY:-127.0.0.1:27017}"
REPLSET="${REPLSET:-mongoRepl}"
AFTER_REPLICA_SET_READY_COMMAND="${AFTER_REPLICA_SET_READY_COMMAND:-}"

echo "Mongodb is healthy, initiating replicaset on $PRIMARY..."

mongosh "mongodb://$PRIMARY/?directConnection=true" --quiet <<EOF
try { rs.status() } catch(e) {
  rs.initiate({
    _id: "$REPLSET",
    members: [
      { _id: 0, host: "mongodb:27017", priority: 2 }
    ]
  })
}
EOF

echo "Waiting for PRIMARY election..."
for i in {1..180}; do
  if mongosh "mongodb://$PRIMARY/?directConnection=true" --quiet --eval "db.hello().isWritablePrimary" | grep -q true; then
    echo "Replica set ready."
    if [ -n "$AFTER_REPLICA_SET_READY_COMMAND" ]; then
      bash -c "$AFTER_REPLICA_SET_READY_COMMAND"
    fi
    exit 0
  fi
  sleep 0.5
done

echo "Timed out waiting for PRIMARY"
exit 1
