"""Gateway HTTP server concurrency tests (stdlib unittest)."""

import http.server
import threading
import urllib.request
import unittest

import gateway


class TestGatewayConcurrency(unittest.TestCase):
    def test_health_request_is_not_blocked_by_an_active_stream(self):
        stream_started = threading.Event()
        release_stream = threading.Event()

        class SlowHandler(http.server.BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def do_GET(self):
                if self.path == "/stream":
                    stream_started.set()
                    release_stream.wait(timeout=2)
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"ok")

        server = gateway.GatewayHTTPServer(("127.0.0.1", 0), SlowHandler)
        server_thread = threading.Thread(target=server.serve_forever, daemon=True)
        server_thread.start()
        origin = f"http://127.0.0.1:{server.server_port}"
        stream_thread = threading.Thread(
            target=lambda: urllib.request.urlopen(f"{origin}/stream", timeout=3).read(),
            daemon=True,
        )

        try:
            stream_thread.start()
            self.assertTrue(stream_started.wait(timeout=1))
            with urllib.request.urlopen(f"{origin}/health", timeout=1) as response:
                self.assertEqual(response.status, 200)
                self.assertEqual(response.read(), b"ok")
        finally:
            release_stream.set()
            stream_thread.join(timeout=2)
            server.shutdown()
            server.server_close()
            server_thread.join(timeout=2)


if __name__ == "__main__":
    unittest.main()
