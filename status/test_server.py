"""Tests for the Rock it status server's pairing. Run: python3 -m unittest -v"""

import base64
import hashlib
import json
import os
import ssl
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
