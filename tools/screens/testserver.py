# Serves the app on :5175, plus a /__set page (same origin) that seeds
# localStorage before the app boots, so headless shots can start anywhere.
# /api/* is passed to apiserver.mjs on :5176.
# usage: python3 tools/screens/testserver.py [app folder, default ../../sightline]
import http.server, sys, os, functools, urllib.parse, json, re
HERE = os.path.dirname(os.path.abspath(__file__))
APP = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', 'sightline')
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        if u.path.startswith('/api/'):
            return self.proxy()
        if u.path == '/__set':
            q = dict(urllib.parse.parse_qsl(u.query))
            q.pop('go', None)
            nostorage = q.pop('nostorage', '')
            cone = q.pop('cone', '')
            last = q.pop('last', '')     # {"focus": ..., "move": ...} (Run last)
            name = q.pop('name', '')     # the remembered leaderboard name
            legacy = q.pop('legacy', '')  # save under the old sightline.* keys (checks the move to sightrep.*)
            waiver = q.pop('waiver', '')  # the safety waiver: accepted (this version) unless waiver=0 (a fresh device) or waiver=old (the previous version)
            html = open(APP + '/index.html', encoding='utf-8').read()
            inject = f"<script>localStorage.setItem('sightrep.settings.v1', JSON.stringify({json.dumps(q)}));</script>"
            if cone: inject += "<script>localStorage.setItem('sightrep.cone.v1', " + json.dumps(cone) + ");</script>"
            if last: inject += "<script>localStorage.setItem('sightrep.last.v2', " + json.dumps(last) + ");</script>"
            if name: inject += "<script>localStorage.setItem('sightrep.name.v1', " + json.dumps(json.dumps(name)) + ");</script>"
            if nostorage: inject += "<script>Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage blocked'); } });</script>"
            if legacy: inject = inject.replace("'sightrep.", "'sightline.")
            if waiver != '0':
                current = int(re.search(r'version: (\d+)', open(APP + '/js/content/safety.js', encoding='utf-8').read()).group(1))
                rec = {'version': current - 1 if waiver == 'old' else current, 'acceptedAt': '2026-10-16T12:00:00.000Z', 'risks': True, 'age': True}
                inject = "<script>localStorage.setItem('sightrep.waiver.v1', " + json.dumps(json.dumps(rec)) + ");</script>" + inject
            html = html.replace('<head>', '<head>' + inject, 1)
            b = html.encode()
            self.send_response(200); self.send_header('Content-Type','text/html'); self.send_header('Content-Length',str(len(b))); self.end_headers(); self.wfile.write(b); return
        return super().do_GET()
import urllib.request
def _proxy(self):
    n = int(self.headers.get('Content-Length') or 0)
    body = self.rfile.read(n) if n else None
    req = urllib.request.Request('http://localhost:5176' + self.path, data=body, method=self.command,
        headers={'Content-Type': self.headers.get('Content-Type', 'application/json'), 'X-Forwarded-For': '127.0.0.1'})
    try:
        r = urllib.request.urlopen(req); status = r.status; data = r.read()
    except urllib.error.HTTPError as e:
        status = e.code; data = e.read()
    self.send_response(status); self.send_header('Content-Type', 'application/json'); self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)
H.proxy = _proxy
def _post(self):
    if urllib.parse.urlparse(self.path).path.startswith('/api/'): return self.proxy()
    self.send_response(405); self.end_headers()
H.do_POST = _post

class Server(http.server.ThreadingHTTPServer):
    request_queue_size = 256   # many parallel page loads in the screenshot harness
    daemon_threads = True
Server(('localhost', 5175), functools.partial(H, directory=APP)).serve_forever()
