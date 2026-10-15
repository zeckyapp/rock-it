"""Tests for the Rock it status server's pairing. Run: python3 -m unittest -v"""

import json
import os
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


class HttpTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.pairing = server.Pairing(tempfile.mkdtemp())
        server.status = lambda: {"phase": "starting", "node": {"reachable": False}}
        cls.httpd = ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        cls.base = f"http://127.0.0.1:{cls.httpd.server_address[1]}"
        threading.Thread(target=cls.httpd.serve_forever, daemon=True).start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()

    def call(self, path, body=None, headers=None):
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data=data, headers=headers or {})
        if data is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.load(r)
        except urllib.error.HTTPError as e:
            return e.code, json.load(e)

    def test_phone_flow(self):
        self.assertEqual(self.call("/phone/status")[0], 401)
        code = self.call("/api/pairing")[1]["code"]
        status, body = self.call("/phone/pair", {"code": code, "name": "Test"})
        self.assertEqual(status, 200)
        auth = {"Authorization": "Bearer " + body["key"]}
        self.assertEqual(self.call("/phone/status", headers=auth)[0], 200)
        # The page action needs its header.
        self.assertEqual(self.call("/api/devices/remove", {"id": body["id"]})[0], 403)
        status, res = self.call(
            "/api/devices/remove", {"id": body["id"]}, {"X-Rock-It": "1"}
        )
        self.assertTrue(res["removed"])
        self.assertEqual(self.call("/phone/status", headers=auth)[0], 401)


if __name__ == "__main__":
    unittest.main()
