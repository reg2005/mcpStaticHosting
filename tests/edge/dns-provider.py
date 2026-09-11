"""Local DNS + lego HTTP provider fixture. No external DNS provider is contacted."""
import http.server
import json
import socketserver
import struct
import threading

EDGE = '10.77.42.20'
DNS = '10.77.42.10'
txt = {}
addresses = {'adas.test': '10.77.42.99'}
def name_bytes(name):
    return b''.join(bytes([len(label)]) + label.encode() for label in name.rstrip('.').split('.')) + b'\0'
def answer(data):
    offset, labels = 12, []
    while data[offset]:
        length = data[offset]; offset += 1
        labels.append(data[offset:offset+length].decode()); offset += length
    name = '.'.join(labels).lower() + '.'
    offset += 1
    qtype, qclass = struct.unpack('!HH', data[offset:offset+4]); offset += 4
    records = []
    if qtype == 1:
        ip = DNS if name.startswith('ns.') else addresses.get(name.rstrip('.'), EDGE)
        records = [bytes(map(int, ip.split('.')))] if ip else []
    elif qtype == 16:
        records = [bytes([len(value)]) + value.encode() for value in txt.get(name, [])]
    elif qtype == 6 and not name.startswith('_acme-challenge.'):
        records = [name_bytes('ns.' + name) + name_bytes('hostmaster.' + name) + struct.pack('!IIIII', 1, 60, 60, 600, 1)]
    elif qtype == 2:
        records = [name_bytes('ns.' + name)]
    header = data[:2] + struct.pack('!HHHHH', 0x8580, 1, len(records), 0, 0)
    return header + data[12:offset] + b''.join(b'\xc0\x0c' + struct.pack('!HHIH', qtype, qclass, 1, len(record)) + record for record in records)
class Udp(socketserver.BaseRequestHandler):
    def handle(self):
        data, sock = self.request
        sock.sendto(answer(data), self.client_address)
class Tcp(socketserver.BaseRequestHandler):
    def handle(self):
        length = self.request.recv(2)
        if len(length) != 2: return
        data = self.request.recv(struct.unpack('!H', length)[0])
        reply = answer(data); self.request.sendall(struct.pack('!H', len(reply)) + reply)
class Api(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args): pass
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        if self.path == '/present': txt.setdefault(body['fqdn'], []).append(body['value'])
        elif self.path == '/cleanup':
            values = txt.get(body['fqdn'], [])
            if body['value'] in values: values.remove(body['value'])
        elif self.path == '/record': addresses[body['hostname']] = body['ip']
        else: self.send_error(404); return
        self.send_response(200); self.end_headers(); self.wfile.write(b'{}')
for server in [socketserver.ThreadingUDPServer(('0.0.0.0', 53), Udp), socketserver.ThreadingTCPServer(('0.0.0.0', 53), Tcp)]:
    threading.Thread(target=server.serve_forever, daemon=True).start()
http.server.ThreadingHTTPServer(('0.0.0.0', 8055), Api).serve_forever()
