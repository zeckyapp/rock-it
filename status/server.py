"""Rock it status page.

A small web server for the Umbrel app: it shows how far the Zcash node
(Zakura) is, whether the wallet server (Zaino) accepts wallets, and how to
connect Zecky Lock it and Zecky Pocket. Python standard library only.

It only reads: one fixed set of RPC calls to the node, a TCP check on the
wallet port and the free space on the data drive. No request data is passed
on to the node.
"""

import json
import os
import socket
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ZAKURA_RPC = os.environ.get("ZAKURA_RPC", "http://zakura:8232")
ZAINO_ADDR = os.environ.get("ZAINO_ADDR", "zaino:8137")
WALLET_PORT = int(os.environ.get("WALLET_PORT", "8137"))
DATA_DIR = os.environ.get("DATA_DIR", "/chain")
LISTEN_PORT = int(os.environ.get("PORT", "8080"))
APP_VERSION = os.environ.get("APP_VERSION", "")

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_SECONDS = 5

_lock = threading.Lock()
_cache = {"at": 0.0, "value": None}


def rpc(method, params=None, timeout=4):
    body = json.dumps(
        {"jsonrpc": "2.0", "id": "rockit", "method": method, "params": params or []}
    ).encode()
    req = urllib.request.Request(
        ZAKURA_RPC, data=body, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        data = json.load(resp)
    if data.get("error"):
        raise RuntimeError(str(data["error"]))
    return data.get("result")


def port_open(addr, timeout=2):
    host, _, port = addr.rpartition(":")
    try:
        with socket.create_connection((host, int(port)), timeout=timeout):
            return True
    except OSError:
        return False


def disk():
    try:
        st = os.statvfs(DATA_DIR)
    except OSError:
        return None
    return {"free": st.f_bavail * st.f_frsize, "total": st.f_blocks * st.f_frsize}


def node():
    try:
        info = rpc("getblockchaininfo")
    except Exception:  # noqa: BLE001 - any failure means "not reachable yet"
        return {"reachable": False}
    height = int(info.get("blocks") or 0)
    estimated = 0
    for key in ("estimatedheight", "estimatedHeight", "headers"):
        try:
            estimated = max(estimated, int(info.get(key) or 0))
        except (TypeError, ValueError):
            pass
    estimated = max(estimated, height)
    progress = height / estimated if estimated else 0.0
    vp = info.get("verificationprogress")
    if isinstance(vp, (int, float)) and 0 < vp <= 1 and not info.get("estimatedheight"):
        progress = float(vp)
    peers = None
    try:
        peers = len(rpc("getpeerinfo") or [])
    except Exception:  # noqa: BLE001
        pass
    return {
        "reachable": True,
        "chain": info.get("chain"),
        "height": height,
        "estimatedHeight": estimated,
        "progress": min(progress, 1.0),
        "peers": peers,
    }


def status():
    with _lock:
        now = time.time()
        if _cache["value"] is not None and now - _cache["at"] < CACHE_SECONDS:
            return _cache["value"]
        n = node()
        wallets = port_open(ZAINO_ADDR)
        if not n["reachable"]:
            phase = "starting"
        elif n["progress"] < 0.999:
            phase = "syncing"
        elif not wallets:
            phase = "opening"
        else:
            phase = "ready"
        value = {
            "phase": phase,
            "node": n,
            "walletServer": {"open": wallets, "port": WALLET_PORT},
            "disk": disk(),
            "version": APP_VERSION,
        }
        _cache.update(at=now, value=value)
        return value


def gb(n):
    return f"{n / 1e9:,.0f} GB"


def widget():
    s = status()
    n = s["node"]
    if s["phase"] == "starting":
        text, label, progress = "Starting", "The node is starting", 0
    elif s["phase"] == "syncing":
        pct = n["progress"] * 100
        text = f"Syncing {pct:.1f}%"
        label = f"Block {n['height']:,} of about {n['estimatedHeight']:,}"
        progress = n["progress"]
    elif s["phase"] == "opening":
        text, label, progress = "Almost ready", "Opening the wallet port", 1
    else:
        text, label, progress = "Ready", f"Block {n['height']:,}", 1
    return {
        "type": "text-with-progress",
        "refresh": "30s",
        "link": "",
        "title": "Rock it",
        "text": text,
        "progressLabel": label,
        "progress": round(progress, 4),
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "RockIt"
    sys_version = ""

    def send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_json(self, value):
        self.send(200, json.dumps(value).encode(), "application/json")

    def do_GET(self):  # noqa: N802 - http.server naming
        path = self.path.split("?", 1)[0]
        if path in ("/", "/index.html"):
            with open(os.path.join(HERE, "index.html"), "rb") as f:
                self.send(200, f.read(), "text/html; charset=utf-8")
        elif path == "/api/status":
            self.send_json(status())
        elif path == "/api/widget":
            self.send_json(widget())
        elif path == "/icon.svg":
            with open(os.path.join(HERE, "icon.svg"), "rb") as f:
                self.send(200, f.read(), "image/svg+xml")
        else:
            self.send(404, b"Not found", "text/plain")

    do_HEAD = do_GET

    def log_message(self, fmt, *args):
        pass  # keep the logs quiet; nothing here is worth keeping


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", LISTEN_PORT), Handler).serve_forever()
