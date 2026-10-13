#!/bin/sh
# Shows how far the node and Zaino are, and the Pi's health.
# Run with: sudo sh rockit-status.sh

strip() { sed 's/\x1b\[[0-9;]*m//g'; }

echo "== Zakura (node) =="
docker logs zakura --since 30m 2>&1 | strip \
  | grep -o "sync_percent=[0-9.]*% current_height=Height([0-9]*)" | tail -1

echo "== Zaino (wallet server) =="
docker logs zaino --since 5m 2>&1 | strip | grep "status check" | tail -1 \
  | sed 's/.*Zaino status check, //'
LINE=$(docker logs zaino --since 60m 2>&1 | strip \
  | grep -o "current: [0-9]*, target: [0-9]*" | tail -1)
if [ -n "$LINE" ]; then
  echo "$LINE" | tr -d ',' \
    | awk '{printf "Index: %d of %d blocks (%.1f%%)\n", $2, $4, 100*$2/$4}'
fi

echo "== Pi =="
awk '{printf "Temperature: %.0f C\n", $1/1000}' /sys/class/thermal/thermal_zone0/temp
df -h "${ROCKIT_DATA:-/mnt/data}" | awk 'NR==2{print "Disk free: " $4}'
