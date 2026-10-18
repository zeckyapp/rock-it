# Fixed addresses on Rock it's own network (10.137.42.0/24, see
# docker-compose.yml), which no other Umbrel app can join. Zaino only serves
# wallets on an IP address (not a name), so its address has to be known in
# advance.
export APP_ZECKY_ROCK_IT_ZAKURA_IP="10.137.42.10"
export APP_ZECKY_ROCK_IT_ZAINO_IP="10.137.42.11"

# Ports on the Umbrel itself: the wallet port (Lock it, Pocket) and the Rock it
# iPhone app's HTTPS port. 8137 and 8139 when they are free. If another app
# already listens there on a fresh install, Rock it picks the next free pair
# (18137/18139, 28137/28139, ...) once and keeps it in data/ports.env, so the
# ports never move after that. The status page, its QR codes and the pairing
# link all carry the ports actually in use, so wallets and the iPhone app
# follow along without typing anything.
#
# Umbrel sources this file whenever any app starts, so it only reads and writes
# its own small file and never fails.

_rockit_dir="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd)"
_rockit_file="${_rockit_dir}/data/ports.env"
_rockit_wallet=""
_rockit_phone=""

# Ports something on the host listens on, from the kernel's own tables (no
# tools needed). Published Docker ports show up here through docker-proxy.
_rockit_busy() {
  cat /proc/net/tcp /proc/net/tcp6 2>/dev/null | while read -r _ _local _ _st _; do
    [ "$_st" = "0A" ] && printf '%d\n' "0x${_local##*:}" 2>/dev/null
  done
  return 0
}

_rockit_valid() {
  case "$1" in ''|*[!0-9]*) return 1 ;; esac
  [ "$1" -ge 1024 ] && [ "$1" -le 65535 ]
}

# 1. A pair chosen earlier: keep it.
if [ -r "$_rockit_file" ]; then
  _rockit_wallet="$(sed -n 's/^WALLET_PORT=//p' "$_rockit_file" 2>/dev/null | head -n 1)"
  _rockit_phone="$(sed -n 's/^PHONE_PORT=//p' "$_rockit_file" 2>/dev/null | head -n 1)"
fi

if ! _rockit_valid "$_rockit_wallet" || ! _rockit_valid "$_rockit_phone" \
   || [ "$_rockit_wallet" = "$_rockit_phone" ]; then
  _rockit_wallet="8137"
  _rockit_phone="8139"

  # 2. Rock it ran before (the chain folder exists): it already owns 8137 and
  #    8139, and wallets are set up for them. Keep them.
  # 3. A fresh install: take the first pair where both ports are free.
  if [ -n "$_rockit_dir" ] && [ ! -d "${_rockit_dir}/data/zakura" ]; then
    _rockit_taken=" $(_rockit_busy | sort -un | tr '\n' ' ') "
    for _rockit_base in 0 10000 20000 30000 40000; do
      _rockit_w=$((8137 + _rockit_base)); _rockit_p=$((8139 + _rockit_base))
      case "$_rockit_taken" in *" $_rockit_w "*|*" $_rockit_p "*) continue ;; esac
      _rockit_wallet="$_rockit_w"; _rockit_phone="$_rockit_p"
      break
    done
    unset _rockit_taken _rockit_base _rockit_w _rockit_p
  fi

  # Remember the pair, so it never changes once Rock it has started.
  if [ -n "$_rockit_dir" ] && mkdir -p "${_rockit_dir}/data" 2>/dev/null; then
    printf 'WALLET_PORT=%s\nPHONE_PORT=%s\n' "$_rockit_wallet" "$_rockit_phone" \
      > "$_rockit_file" 2>/dev/null || true
  fi
fi

export APP_ZECKY_ROCK_IT_WALLET_PORT="$_rockit_wallet"
# The Rock it iPhone app's HTTPS port.
export APP_ZECKY_ROCK_IT_PHONE_PORT="$_rockit_phone"

unset -f _rockit_busy _rockit_valid
unset _rockit_dir _rockit_file _rockit_wallet _rockit_phone
