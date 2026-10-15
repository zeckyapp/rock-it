"""Rock it status page and pairing.

A small web server for the Umbrel app: it shows how far the Zcash node
(Zakura) is, whether the wallet server (Zaino) accepts wallets, and how to
connect Zecky Lock it and Zecky Pocket. Python standard library only.

It only reads from the node: one fixed set of RPC calls, a TCP check on the
wallet port and the free space on the data drive. No request data is passed
on to the node.

Two kinds of callers:

- The page, behind the Umbrel login (`/`, `/api/...`). It shows the status,
  the pairing code and the paired iPhones, and can remove an iPhone.
- The Rock it iPhone app (`/phone/...`), only over HTTPS on its own port
  (8139). It pairs once with the short code shown on the page (or in its QR)
  and gets its own key. After that it reads the status with that key. Without
  a key it gets nothing.

The HTTPS certificate is the Rock's own, made on first start. The QR carries
its SHA-256 fingerprint, and the iPhone app trusts that certificate and no
other, so nobody on the network can read along or pose as the Rock.

Keys are stored only as SHA-256 hashes. A pairing code lives in memory, is
valid for ten minutes, works once and dies after five wrong tries.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import socket
import ssl
import subprocess
import threading
import time
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ZAKURA_RPC = os.environ.get("ZAKURA_RPC", "http://zakura:8232")
ZAINO_ADDR = os.environ.get("ZAINO_ADDR", "zaino:8137")
WALLET_PORT = int(os.environ.get("WALLET_PORT", "8137"))
DATA_DIR = os.environ.get("DATA_DIR", "/chain")
PAIR_DIR = os.environ.get("PAIR_DIR", "/data")
LISTEN_PORT = int(os.environ.get("PORT", "8080"))
TLS_PORT = int(os.environ.get("TLS_PORT", "8139"))
APP_VERSION = os.environ.get("APP_VERSION", "")
# Whether other Zcash nodes can connect in on 8233. The Umbrel app does not
# publish that port, so the node only connects out.
NODE_INBOUND = os.environ.get("NODE_INBOUND", "false").lower() == "true"

HERE = os.path.dirname(os.path.abspath(__file__))
CACHE_SECONDS = 5

CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L
CODE_LENGTH = 8
CODE_SECONDS = 10 * 60
CODE_TRIES = 5
MAX_DEVICES = 10
MAX_NAME = 40
MAX_BODY = 2048
SEEN_EVERY = 60

_lock = threading.Lock()
_cache = {"at": 0.0, "value": None}


# --- The node -------------------------------------------------------------


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


def privacy():
    if NODE_INBOUND:
        return {"mode": "supporter", "inbound": True}
    return {"mode": "private", "inbound": False}


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
            "privacy": privacy(),
            "version": APP_VERSION,
        }
        _cache.update(at=now, value=value)
        return value


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


# --- Pairing --------------------------------------------------------------


def clean_code(text):
    """'abcd-efgh' -> 'ABCDEFGH'. Ignores spaces and dashes."""
    return "".join(c for c in str(text).upper() if c.isalnum())


def clean_name(text):
    name = "".join(c for c in str(text) if c.isprintable()).strip()[:MAX_NAME]
    return name or "iPhone"


def key_hash(key):
    return hashlib.sha256(key.encode()).hexdigest()


class Pairing:
    """Paired iPhones (on disk) and the current pairing code (in memory)."""

    def __init__(self, folder, clock=time.time):
        self.path = os.path.join(folder, "devices.json")
        self.clock = clock
        self.lock = threading.Lock()
        self.code = None  # {"value", "expires", "tries"}
        self.devices = self._load()

    # Storage

    def _load(self):
        try:
            with open(self.path, encoding="utf-8") as f:
                data = json.load(f)
        except (OSError, ValueError):
            return []
        devices = data.get("devices") if isinstance(data, dict) else None
        if not isinstance(devices, list):
            return []
        return [
            d
            for d in devices
            if isinstance(d, dict)
            and isinstance(d.get("id"), str)
            and isinstance(d.get("hash"), str)
        ]

    def _save(self):
        tmp = self.path + ".tmp"
        try:
            fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump({"devices": self.devices}, f)
            os.replace(tmp, self.path)
        except OSError:
            # Kept in memory until the app restarts.
            pass

    # The code on the page

    def current_code(self, fresh=False):
        """The code the page shows; a new one when it expired or was used."""
        with self.lock:
            now = self.clock()
            if fresh or self.code is None or self.code["expires"] <= now:
                value = "".join(
                    secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH)
                )
                self.code = {"value": value, "expires": now + CODE_SECONDS, "tries": 0}
            return {"code": self.code["value"], "expires": int(self.code["expires"])}

    # The phone

    def pair(self, code, name):
        """Returns (http status, body)."""
        with self.lock:
            now = self.clock()
            current = self.code
            if current is None or current["expires"] <= now:
                return 403, {"error": "expired"}
            if len(self.devices) >= MAX_DEVICES:
                return 409, {"error": "full"}
            if not hmac.compare_digest(clean_code(code), current["value"]):
                current["tries"] += 1
                if current["tries"] >= CODE_TRIES:
                    self.code = None
                    return 429, {"error": "tries"}
                return 403, {"error": "code"}
            self.code = None  # one use
            key = secrets.token_urlsafe(32)
            device = {
                "id": secrets.token_hex(8),
                "name": clean_name(name),
                "hash": key_hash(key),
                "added": int(now),
                "seen": int(now),
            }
            self.devices.append(device)
            self._save()
            return 200, {"id": device["id"], "key": key}

    def check(self, header):
        """The device for an 'Authorization: Bearer <key>' header, or None."""
        if not header or not header.startswith("Bearer "):
            return None
        wanted = key_hash(header[len("Bearer "):].strip())
        with self.lock:
            for d in self.devices:
                if hmac.compare_digest(d["hash"], wanted):
                    now = int(self.clock())
                    if now - int(d.get("seen") or 0) >= SEEN_EVERY:
                        d["seen"] = now
                        self._save()
                    return d
        return None

    # The page

    def listing(self):
        with self.lock:
            return [
                {
                    "id": d["id"],
                    "name": d.get("name") or "iPhone",
                    "added": d.get("added"),
                    "seen": d.get("seen"),
                }
                for d in self.devices
            ]

    def remove(self, device_id):
        with self.lock:
            before = len(self.devices)
            self.devices = [d for d in self.devices if d["id"] != device_id]
            if len(self.devices) == before:
                return False
            self._save()
            return True


# --- HTTPS ----------------------------------------------------------------


def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def fingerprint(cert_pem):
    """SHA-256 of the certificate (DER), base64url: what the QR carries."""
    return b64url(hashlib.sha256(ssl.PEM_cert_to_DER_cert(cert_pem)).digest())


def ensure_cert(folder):
    """The Rock's own certificate (EC P-256, ten years), made on first start.

    Returns (cert path, key path, fingerprint), or None when it cannot be
    made; the iPhone app then cannot connect, but the page still works.
    """
    tls = os.path.join(folder, "tls")
    cert = os.path.join(tls, "cert.pem")
    key = os.path.join(tls, "key.pem")
    if not (os.path.exists(cert) and os.path.exists(key)):
        old = os.umask(0o077)
        try:
            os.makedirs(tls, mode=0o700, exist_ok=True)
            subprocess.run(
                [
                    "openssl", "req", "-x509", "-newkey", "ec",
                    "-pkeyopt", "ec_paramgen_curve:prime256v1",
                    "-nodes", "-days", "3650", "-subj", "/CN=Zecky Rock it",
                    "-keyout", key, "-out", cert,
                ],
                check=True,
                capture_output=True,
                timeout=60,
            )
        except (OSError, subprocess.SubprocessError):
            return None
        finally:
            os.umask(old)
    try:
        with open(cert, encoding="ascii") as f:
            return cert, key, fingerprint(f.read())
    except (OSError, ValueError):
        return None


def tls_info():
    return {"port": TLS_PORT, "pin": TLS[2]} if TLS else None


pairing = None  # set in main()
TLS = None  # (cert, key, fingerprint), set in main()


# --- HTTP -----------------------------------------------------------------


class Handler(BaseHTTPRequestHandler):
    """The page and its API, behind the Umbrel login (plain HTTP on 8080)."""

    server_version = "RockIt"
    sys_version = ""
    secure = False
    timeout = 30  # seconds a connection may sit idle

    def send(self, code, body, ctype):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def send_json(self, value, code=200):
        self.send(code, json.dumps(value).encode(), "application/json")

    def read_json(self):
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            return None
        if length <= 0 or length > MAX_BODY:
            return None
        try:
            value = json.loads(self.rfile.read(length))
        except ValueError:
            return None
        return value if isinstance(value, dict) else None

    def path_only(self):
        return self.path.split("?", 1)[0]

    def do_GET(self):  # noqa: N802 - http.server naming
        path = self.path_only()
        if path.startswith("/phone/"):
            self.phone_get(path)
        elif self.secure:
            self.send(404, b"Not found", "text/plain")
        elif path in ("/", "/index.html"):
            self.file("index.html", "text/html; charset=utf-8")
        elif path == "/icon.svg":
            self.file("icon.svg", "image/svg+xml")
        elif path == "/qr.js":
            self.file("qr.js", "text/javascript; charset=utf-8")
        elif path == "/api/status":
            self.send_json(status())
        elif path == "/api/widget":
            self.send_json(widget())
        elif path == "/api/pairing":
            self.send_json(
                {
                    **pairing.current_code(),
                    "devices": pairing.listing(),
                    "tls": tls_info(),
                }
            )
        else:
            self.send(404, b"Not found", "text/plain")

    do_HEAD = do_GET

    def do_POST(self):  # noqa: N802
        path = self.path_only()
        body = self.read_json()
        if body is None:
            self.send_json({"error": "body"}, 400)
            return
        if path.startswith("/phone/"):
            self.phone_post(path, body)
            return
        if self.secure:
            self.send_json({"error": "not found"}, 404)
            return
        # The page's own actions. The custom header cannot be sent by another
        # site without a CORS preflight, which this server never allows.
        if self.headers.get("X-Rock-It") != "1":
            self.send_json({"error": "forbidden"}, 403)
        elif path == "/api/pairing/new":
            self.send_json(
                {
                    **pairing.current_code(fresh=True),
                    "devices": pairing.listing(),
                    "tls": tls_info(),
                }
            )
        elif path == "/api/devices/remove":
            removed = pairing.remove(str(body.get("id", "")))
            self.send_json({"removed": removed, "devices": pairing.listing()})
        else:
            self.send_json({"error": "not found"}, 404)

    # The iPhone app: HTTPS only, so the code and the key never travel in the
    # clear. Over plain HTTP it is told where to go instead.

    def plain_refused(self):
        if self.secure:
            return False
        self.send_json({"error": "tls", "tls": tls_info()}, 426)
        return True

    def phone_get(self, path):
        if self.plain_refused():
            return
        if path == "/phone/hello":
            self.send_json({"rockit": True, "version": APP_VERSION})
        elif path == "/phone/status":
            if pairing.check(self.headers.get("Authorization")) is None:
                self.send_json({"error": "unpaired"}, 401)
            else:
                self.send_json(status())
        else:
            self.send_json({"error": "not found"}, 404)

    def phone_post(self, path, body):
        if self.plain_refused():
            return
        if path == "/phone/pair":
            code, value = pairing.pair(body.get("code", ""), body.get("name", ""))
            self.send_json(value, code)
        else:
            self.send_json({"error": "not found"}, 404)

    def file(self, name, ctype):
        with open(os.path.join(HERE, name), "rb") as f:
            self.send(200, f.read(), ctype)

    def log_message(self, fmt, *args):
        pass  # keep the logs quiet; nothing here is worth keeping


class PhoneHandler(Handler):
    """Only /phone/*, over HTTPS on its own port (published to the network)."""

    secure = True


def tls_server(cert, key, port):
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    # Every iPhone that runs the Rock it app speaks TLS 1.3.
    context.minimum_version = ssl.TLSVersion.TLSv1_3
    context.load_cert_chain(cert, key)
    httpd = ThreadingHTTPServer(("0.0.0.0", port), PhoneHandler)
    # A refused handshake (an old TLS version, a port scan) is not worth a
    # stack trace in the logs.
    httpd.handle_error = lambda request, client_address: None
    # The handshake happens on the first read, in the request's own thread,
    # so a slow client cannot hold up the others.
    httpd.socket = context.wrap_socket(
        httpd.socket, server_side=True, do_handshake_on_connect=False
    )
    return httpd


# The user the server runs as. It starts as root only to give the data folder
# to this user (Docker makes a missing folder owned by root), then drops to it.
RUN_AS = int(os.environ.get("RUN_AS", "1000"))


def own_and_drop(folder, uid=RUN_AS):
    if os.geteuid() != 0:
        return
    try:
        os.makedirs(folder, exist_ok=True)
        for root, dirs, files in os.walk(folder):
            for name in [root] + [os.path.join(root, n) for n in dirs + files]:
                os.lchown(name, uid, uid)
    except OSError:
        pass  # the server still starts; pairing then lives in memory
    os.setgroups([])
    os.setgid(uid)
    os.setuid(uid)
    if os.geteuid() == 0:
        raise SystemExit("could not drop root")


def main():
    global pairing, TLS
    own_and_drop(PAIR_DIR)
    pairing = Pairing(PAIR_DIR)
    TLS = ensure_cert(PAIR_DIR)
    if TLS:
        phone = tls_server(TLS[0], TLS[1], TLS_PORT)
        threading.Thread(target=phone.serve_forever, daemon=True).start()
    ThreadingHTTPServer(("0.0.0.0", LISTEN_PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
