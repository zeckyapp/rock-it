#!/bin/sh
# Shows how far the node and Zaino are, and the Pi's health.
# Run on the Umbrel with: sudo sh rockit-status.sh

strip() { sed 's/\x1b\[[0-9;]*m//g'; }

# The containers of the Rock it app, whatever Docker named them
# (zecky-rock-it_zakura_1, zecky-rock-it-zakura-1, ...).
find_container() {
  docker ps --format '{{.Names}}' | grep -E "zecky-rock-it[_-]$1([_-][0-9]+)?$" | head -1
}

ZAKURA=$(find_container zakura)
ZAINO=$(find_container zaino)

echo "== Zakura (node) =="
if [ -z "$ZAKURA" ]; then
  echo "Not running. Is Zecky Rock it installed and started?"
else
  docker logs "$ZAKURA" --since 30m 2>&1 | strip \
    | grep -oE "(sync_percent=[0-9.]*% )?current_height=Height\([0-9]*\)|state_tip=Some\(Height\([0-9]*\)\)" | tail -1
fi

echo "== Zaino (wallet server) =="
if [ -z "$ZAINO" ]; then
  echo "Not running."
else
  docker logs "$ZAINO" --since 5m 2>&1 | strip | grep "status check" | tail -1 \
    | sed 's/.*Zaino status check, //'
fi

echo "== Memory =="
docker stats --no-stream --format '{{.Name}}: {{.MemUsage}}' $ZAKURA $ZAINO 2>&1

echo "== Pi =="
awk '{printf "Temperature: %.0f C\n", $1/1000}' /sys/class/thermal/thermal_zone0/temp
df -h "${ROCKIT_DATA:-/home/umbrel/umbrel}" | awk 'NR==2{print "Disk free: " $4}'
