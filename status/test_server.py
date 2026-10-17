"""Tests for the Rock it status server's pairing. Run: python3 -m unittest -v"""

import base64
import hashlib
import json
import os
import socket
import ssl
import time
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from http.server import ThreadingHTTPServer

import server


class Clock:
    def __init__(self):
        self.now = 1_000_000.0

    def __call__(self):
        return self.now


class PairingTest(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()
        self.clock = Clock()
        self.p = server.Pairing(self.dir, clock=self.clock)

    def test_pair_once_with_the_code(self):
        code = self.p.current_code()["code"]
        status, body = self.p.pair(code[:4].lower() + "-" + code[4:], "Phone")
        self.assertEqual(status, 200)
        self.assertIsNotNone(self.p.check("Bearer " + body["key"]))
        # Used up.
        status, _ = self.p.pair(code, "Again")
        self.assertEqual(status, 403)

    def test_no_code_until_the_page_shows_one(self):
        self.assertEqual(self.p.pair("ABCDEFGH", "x")[0], 403)

    def test_code_expires(self):
        code = self.p.current_code()["code"]
        self.clock.now += server.CODE_SECONDS + 1
        self.assertEqual(self.p.pair(code, "x")[0], 403)

    def test_wrong_tries_kill_the_code(self):
        code = self.p.current_code()["code"]
        for _ in range(server.CODE_TRIES - 1):
            self.assertEqual(self.p.pair("WRONGWRO", "x")[0], 403)
        self.assertEqual(self.p.pair("WRONGWRO", "x")[0], 429)
        self.assertEqual(self.p.pair(code, "x")[0], 403)

    def test_keys_are_stored_hashed_and_survive_restart(self):
        code = self.p.current_code()["code"]
        _, body = self.p.pair(code, "Phone")
        with open(os.path.join(self.dir, "devices.json")) as f:
            stored = f.read()
        self.assertNotIn(body["key"], stored)
        again = server.Pairing(self.dir, clock=self.clock)
        self.assertIsNotNone(again.check("Bearer " + body["key"]))

    def test_remove_device(self):
        code = self.p.current_code()["code"]
        _, body = self.p.pair(code, "Phone")
        self.assertTrue(self.p.remove(body["id"]))
        self.assertIsNone(self.p.check("Bearer " + body["key"]))
        self.assertFalse(self.p.remove(body["id"]))

    def test_bad_headers(self):
        for h in (None, "", "Basic abc", "Bearer ", "Bearer nope"):
            self.assertIsNone(self.p.check(h))

    def test_name_is_cleaned(self):
        code = self.p.current_code()["code"]
        _, body = self.p.pair(code, "  \x00" + "a" * 100)
        self.assertEqual(self.p.listing()[0]["name"], "a" * server.MAX_NAME)


POOLS = [
    {"id": "transparent", "chainValueZat": 1195785402182148},
    {"id": "sprout", "chainValueZat": 2230944195128},
    {"id": "sapling", "chainValueZat": 47446097337494},
    {"id": "orchard", "chainValueZat": 35032947967991},
    {"id": "lockbox", "chainValueZat": 7024462500000},
    {"id": "ironwood", "chainValueZat": 411605474871719},
]


class WidgetTest(unittest.TestCase):
    def setUp(self):
        self.saved = server.status

    def tearDown(self):
        server.status = self.saved

    def fake(self, phase, **node):
        n = {"reachable": phase != "starting", "height": 3521037,
             "estimatedHeight": 3521037, "progress": 1.0, "peers": 52,
             "pools": server.pools(POOLS)}
        n.update(node)
        server.status = lambda: {
            "phase": phase, "node": n,
            "walletServer": {"open": phase == "ready", "port": 8137},
            "privacy": {"mode": "private", "inbound": False},
        }

    def test_shielded_counts_only_shielded_pools(self):
        p = server.pools(POOLS)
        # sprout + sapling + orchard + ironwood; not transparent or lockbox.
        self.assertEqual(p["shieldedZat"], 496315464372332)
        self.assertEqual(p["totalZat"], sum(x["chainValueZat"] for x in POOLS))
        self.assertIsNone(server.pools(None))
        self.assertIsNone(server.pools([{"id": "sapling"}]))

    def test_sync_widget_texts(self):
        self.fake("ready")
        w = server.widget()
        self.assertEqual((w["title"], w["text"]), ("Zcash node", "Synced"))
        self.assertEqual(w["progressLabel"], "Block 3,521,037 · checked by you")
        self.fake("syncing", height=1480000, estimatedHeight=3520000, progress=0.42045)
        w = server.widget()
        self.assertEqual(w["text"], "42.0%")
        self.assertEqual(w["progressLabel"], "Syncing · block 1,480,000 of 3,520,000")

    def test_stats_widget(self):
        self.fake("ready")
        w = server.widget_stats()
        self.assertEqual(w["type"], "four-stats")
        tiles = {i["title"]: (i["text"], i["subtext"]) for i in w["items"]}
        self.assertEqual(tiles["Shielded"], ("4.96M", "ZEC · 29%"))
        self.assertEqual(tiles["Network"], ("52", "peers"))
        self.assertEqual(tiles["Wallets"], ("Open", "for Zecky"))
        self.assertEqual(tiles["Mode"], ("Private", "node"))
        self.fake("starting")
        tiles = {i["title"]: i["text"] for i in server.widget_stats()["items"]}
        self.assertEqual((tiles["Shielded"], tiles["Network"], tiles["Wallets"]), ("–", "–", "Closed"))


class LimitTest(unittest.TestCase):
    def test_per_address_and_total(self):
        httpd = server.LimitedServer(("127.0.0.1", 0), server.Handler, total=3, per_address=2)
        try:
            self.assertTrue(httpd.admit("192.168.1.20"))
            self.assertTrue(httpd.admit("192.168.1.20"))
            # A third from the same address is refused; another address gets in.
            self.assertFalse(httpd.admit("192.168.1.20"))
            self.assertTrue(httpd.admit("192.168.1.21"))
            # Now the total is full for everyone.
            self.assertFalse(httpd.admit("192.168.1.22"))
            httpd.release("192.168.1.20")
            self.assertTrue(httpd.admit("192.168.1.22"))
            self.assertEqual(httpd.by_address, {"192.168.1.20": 1, "192.168.1.21": 1, "192.168.1.22": 1})
        finally:
            httpd.server_close()

    def test_full_server_closes_new_connections_and_recovers(self):
        saved = server.status
        self.addCleanup(setattr, server, "status", saved)
        server.status = lambda: {"phase": "starting", "node": {"reachable": False}}
        httpd = server.LimitedServer(("127.0.0.1", 0), server.Handler, total=3)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        port = httpd.server_address[1]
        try:
            # Three idle connections fill the server.
            idle = [socket.create_connection(("127.0.0.1", port)) for _ in range(3)]
            for _ in range(50):
                if httpd.active == 3:
                    break
                time.sleep(0.02)
            self.assertEqual(httpd.active, 3)
            # The next one is closed straight away.
            extra = socket.create_connection(("127.0.0.1", port))
            extra.settimeout(2)
            self.assertEqual(extra.recv(1), b"")
            extra.close()
            # Once they go, the server answers again.
            for s in idle:
                s.close()
            for _ in range(100):
                if httpd.active == 0:
                    break
                time.sleep(0.02)
            url = f"http://127.0.0.1:{port}/api/widget"
            with urllib.request.urlopen(url, timeout=2) as r:
                self.assertEqual(r.status, 200)
        finally:
            httpd.shutdown()
            httpd.server_close()

    def test_real_servers_are_limited(self):
        self.assertEqual(server.MAX_CONNECTIONS, 32)
        self.assertEqual(server.MAX_PHONE_PER_ADDRESS, 8)
        folder = tempfile.mkdtemp()
        tls = server.ensure_cert(folder)
        phone = server.tls_server(tls[0], tls[1], 0)
        try:
            self.assertIsInstance(phone, server.LimitedServer)
            self.assertEqual((phone.total, phone.per_address), (32, 8))
        finally:
            phone.server_close()


class FakeTailscale:
    """A stand-in for tailscaled's local API on a Unix socket."""

    def __init__(self):
        import socketserver
        from http.server import BaseHTTPRequestHandler

        self.backend = "NeedsLogin"
        self.auth_url = ""
        self.name = "rockit.tail1234.ts.net."
        self.certs = ["rockit.tail1234.ts.net"]
        self.serve = {}
        self.prefs = {}
        self.calls = []
        fake = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def reply(self, code, value=None):
                body = b"" if value is None else json.dumps(value).encode()
                self.send_response(code)
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def body(self):
                n = int(self.headers.get("Content-Length") or 0)
                return json.loads(self.rfile.read(n)) if n else None

            def handle_one(self):
                path = self.path.split("?")[0]
                fake.calls.append((self.command, path))
                if self.headers.get("Sec-Tailscale") != "localapi":
                    return self.reply(403)
                if (self.command, path) == ("GET", "/localapi/v0/status"):
                    return self.reply(200, {
                        "BackendState": fake.backend, "AuthURL": fake.auth_url,
                        "Self": {"DNSName": fake.name}, "CertDomains": fake.certs})
                if (self.command, path) == ("GET", "/localapi/v0/serve-config"):
                    return self.reply(200, fake.serve)
                if (self.command, path) == ("POST", "/localapi/v0/serve-config"):
                    fake.serve = self.body() or {}
                    return self.reply(200)
                if (self.command, path) == ("PATCH", "/localapi/v0/prefs"):
                    fake.prefs.update(self.body() or {})
                    return self.reply(200, fake.prefs)
                if (self.command, path) == ("POST", "/localapi/v0/login-interactive"):
                    fake.auth_url = "https://login.tailscale.com/a/abc123"
                    return self.reply(204)
                if (self.command, path) == ("POST", "/localapi/v0/logout"):
                    fake.backend, fake.auth_url = "NeedsLogin", ""
                    return self.reply(204)
                return self.reply(404)

            do_GET = do_POST = do_PATCH = handle_one

            def address_string(self):
                return "local"

        self.path = os.path.join(tempfile.mkdtemp(), "tailscaled.sock")
        self.server = socketserver.ThreadingUnixStreamServer(self.path, H)
        self.server.daemon_threads = True
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    def close(self):
        self.server.shutdown()
        self.server.server_close()


class OtherWalletsTest(unittest.TestCase):
    def setUp(self):
        self.ts = FakeTailscale()
        self.addCleanup(self.ts.close)
        saved = (server.TS_SOCKET, server.ZAINO_ADDR)
        self.addCleanup(lambda: setattr(server, "TS_SOCKET", saved[0]))
        self.addCleanup(lambda: setattr(server, "ZAINO_ADDR", saved[1]))
        server.TS_SOCKET = self.ts.path
        server.ZAINO_ADDR = "10.137.42.11:8137"

    def test_unavailable_without_tailscale(self):
        server.TS_SOCKET = ""
        self.assertEqual(server.other_wallets(), {"state": "unavailable"})
        server.TS_SOCKET = "/nonexistent/tailscaled.sock"
        self.assertEqual(server.other_wallets(), {"state": "unavailable"})
        self.assertEqual(server.other_wallets_on(), {"state": "unavailable"})

    def test_off_by_default(self):
        self.assertEqual(server.other_wallets(), {"state": "off"})
        self.assertEqual(self.ts.serve, {})

    def test_turn_on_names_the_node_and_shows_the_login(self):
        state = server.other_wallets_on()
        self.assertEqual(state, {"state": "login", "link": "https://login.tailscale.com/a/abc123"})
        self.assertEqual(self.ts.prefs["Hostname"], "rockit")
        self.assertTrue(self.ts.prefs["WantRunning"])
        self.assertIn(("POST", "/localapi/v0/login-interactive"), self.ts.calls)

    def test_only_https_login_links(self):
        self.ts.auth_url = "javascript:alert(1)"
        self.assertEqual(server.other_wallets(), {"state": "off"})

    def test_on_serves_only_the_wallet_port_to_zaino(self):
        self.ts.backend = "Running"
        state = server.other_wallets()
        self.assertEqual(state["state"], "on")
        self.assertEqual(state["address"], "https://rockit.tail1234.ts.net:9067")
        self.assertEqual(self.ts.serve, {
            "TCP": {"9067": {"HTTPS": True}},
            "Web": {"rockit.tail1234.ts.net:9067": {
                "Handlers": {"/": {"Proxy": "http://10.137.42.11:8137"}}}},
        })
        # Already right: not written again.
        posts = self.ts.calls.count(("POST", "/localapi/v0/serve-config"))
        server.other_wallets()
        self.assertEqual(self.ts.calls.count(("POST", "/localapi/v0/serve-config")), posts)

    def test_on_without_https_certificates(self):
        self.ts.backend, self.ts.certs = "Running", None
        self.assertEqual(server.other_wallets()["state"], "nohttps")
        self.assertEqual(self.ts.serve, {})

    def test_waiting_for_approval(self):
        self.ts.backend = "NeedsMachineAuth"
        self.assertEqual(server.other_wallets(), {"state": "approve"})

    def test_turn_off_stops_serving_and_logs_out(self):
        self.ts.backend = "Running"
        server.other_wallets()
        self.assertEqual(server.other_wallets_off(), {"state": "off"})
        self.assertEqual(self.ts.serve, {})
        self.assertIn(("POST", "/localapi/v0/logout"), self.ts.calls)

    def test_page_routes(self):
        httpd = server.LimitedServer(("127.0.0.1", 0), server.Handler)
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        self.addCleanup(httpd.server_close)
        self.addCleanup(httpd.shutdown)
        url = f"http://127.0.0.1:{httpd.server_address[1]}"

        def call(path, body=None, headers=None):
            data = None if body is None else json.dumps(body).encode()
            req = urllib.request.Request(url + path, data=data, headers=headers or {})
            if data is not None:
                req.add_header("Content-Type", "application/json")
            try:
                with urllib.request.urlopen(req, timeout=5) as r:
                    return r.status, json.load(r)
            except urllib.error.HTTPError as e:
                return e.code, json.load(e)

        self.assertEqual(call("/api/wallets"), (200, {"state": "off"}))
        # Turning on needs the page's own header.
        self.assertEqual(call("/api/wallets/on", {})[0], 403)
        self.assertEqual(self.ts.prefs, {})
        status, state = call("/api/wallets/on", {}, {"X-Rock-It": "1"})
        self.assertEqual((status, state["state"]), (200, "login"))
        # Other apps (not PAGE_CLIENTS) get nothing.
        saved = server.PAGE_CLIENTS
        server.PAGE_CLIENTS = frozenset({"10.137.42.1"})
        try:
            self.assertEqual(call("/api/wallets")[0], 403)
            self.assertEqual(call("/api/wallets/off", {}, {"X-Rock-It": "1"})[0], 403)
        finally:
            server.PAGE_CLIENTS = saved
        self.assertEqual(call("/api/wallets/off", {}, {"X-Rock-It": "1"}), (200, {"state": "off"}))


class HttpTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        folder = tempfile.mkdtemp()
        server.pairing = server.Pairing(folder)
        server.TLS = server.ensure_cert(folder)
        assert server.TLS, "openssl could not make the certificate"
        server.status = lambda: {"phase": "starting", "node": {"reachable": False}}
        cls.page = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.phone = server.tls_server(server.TLS[0], server.TLS[1], 0)
        cls.page_url = f"http://127.0.0.1:{cls.page.server_address[1]}"
        cls.phone_url = f"https://127.0.0.1:{cls.phone.server_address[1]}"
        for httpd in (cls.page, cls.phone):
            threading.Thread(target=httpd.serve_forever, daemon=True).start()
        # Like the iPhone app: trust this one certificate, by its fingerprint.
        cls.ctx = ssl.create_default_context()
        cls.ctx.check_hostname = False
        cls.ctx.verify_mode = ssl.CERT_NONE

    @classmethod
    def tearDownClass(cls):
        cls.page.shutdown()
        cls.phone.shutdown()

    def call(self, url, body=None, headers=None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(url, data=data, headers=headers or {})
        if data is not None:
            req.add_header("Content-Type", "application/json")
        ctx = self.ctx if url.startswith("https") else None
        try:
            with urllib.request.urlopen(req, context=ctx) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            return e.code, json.load(e)

    def test_fingerprint_matches_what_is_served(self):
        host, port = self.phone.server_address[:2]
        pem = ssl.get_server_certificate((host, port))
        der = ssl.PEM_cert_to_DER_cert(pem)
        pin = base64.urlsafe_b64encode(hashlib.sha256(der).digest()).rstrip(b"=")
        self.assertEqual(pin.decode(), server.TLS[2])
        info = self.call(self.page_url + "/api/pairing")[1]["tls"]
        self.assertEqual(info["pin"], server.TLS[2])

    def test_phone_only_over_https(self):
        status, body = self.call(self.page_url + "/phone/pair", {"code": "x"})
        self.assertEqual(status, 426)
        self.assertEqual(body["tls"]["pin"], server.TLS[2])
        self.assertEqual(self.call(self.page_url + "/phone/status")[0], 426)
        # And the HTTPS port serves nothing but /phone/*.
        req = urllib.request.Request(self.phone_url + "/api/pairing")
        with self.assertRaises(urllib.error.HTTPError) as e:
            urllib.request.urlopen(req, context=self.ctx)
        self.assertEqual(e.exception.code, 404)

    def test_phone_flow(self):
        self.assertEqual(self.call(self.phone_url + "/phone/hello")[1]["rockit"], True)
        self.assertEqual(self.call(self.phone_url + "/phone/status")[0], 401)
        code = self.call(self.page_url + "/api/pairing")[1]["code"]
        status, body = self.call(
            self.phone_url + "/phone/pair", {"code": code, "name": "Test"}
        )
        self.assertEqual(status, 200)
        auth = {"Authorization": "Bearer " + body["key"]}
        self.assertEqual(self.call(self.phone_url + "/phone/status", headers=auth)[0], 200)
        # The page action needs its header.
        self.assertEqual(
            self.call(self.page_url + "/api/devices/remove", {"id": body["id"]})[0], 403
        )
        status, res = self.call(
            self.page_url + "/api/devices/remove", {"id": body["id"]}, {"X-Rock-It": "1"}
        )
        self.assertTrue(res["removed"])
        self.assertEqual(self.call(self.phone_url + "/phone/status", headers=auth)[0], 401)

    def test_other_apps_get_nothing_from_the_page(self):
        # As on the Umbrel: only the host may use the page, and this test
        # client (127.0.0.1) plays another app.
        saved = server.PAGE_CLIENTS
        server.PAGE_CLIENTS = frozenset({"10.21.0.1"})
        try:
            for path in ("/", "/api/status", "/api/widget", "/api/pairing"):
                self.assertEqual(self.call(self.page_url + path)[0], 403, path)
            rock = {"X-Rock-It": "1"}
            for path in ("/api/pairing/new", "/api/devices/remove"):
                self.assertEqual(
                    self.call(self.page_url + path, {"id": "x"}, rock)[0], 403, path
                )
        finally:
            server.PAGE_CLIENTS = saved

    def test_phone_port_is_not_limited_to_the_host(self):
        saved = server.PAGE_CLIENTS
        server.PAGE_CLIENTS = frozenset({"10.21.0.1"})
        try:
            self.assertEqual(self.call(self.phone_url + "/phone/hello")[0], 200)
        finally:
            server.PAGE_CLIENTS = saved

    def test_certificate_is_kept(self):
        folder = tempfile.mkdtemp()
        first = server.ensure_cert(folder)
        self.assertEqual(server.ensure_cert(folder)[2], first[2])
        mode = os.stat(first[1]).st_mode & 0o777
        self.assertEqual(mode & 0o077, 0)


if __name__ == "__main__":
    unittest.main()
