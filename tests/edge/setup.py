from pathlib import Path
import json, secrets, urllib.request, sys
p=Path(sys.argv[1]).resolve();p.mkdir(parents=True, exist_ok=True)
if (p/'test.env').exists(): raise SystemExit('Existing test environment: choose a fresh directory')
for name,url in [('pebble.minica.pem','https://raw.githubusercontent.com/letsencrypt/pebble/v2.8.0/test/certs/pebble.minica.pem'),('pebble.json','https://raw.githubusercontent.com/letsencrypt/pebble/v2.8.0/test/config/pebble-config.json')]:
 (p/name).write_bytes(urllib.request.urlopen(url).read())
c=json.loads((p/'pebble.json').read_text());c['pebble']['httpPort']=8080;c['pebble']['profiles']['default']['validityPeriod']=7776000;(p/'pebble.json').write_text(json.dumps(c))
(p/'dns.env').write_text('HTTPREQ_ENDPOINT=http://dns-provider:8055\n');(p/'dns.env').chmod(0o644)
(p/'test.env').write_text(f'''COMPOSE_PROJECT_NAME=mcph-edge-030-test
IMAGE_TAG=0.3.0
MAIN_DOMAIN=example.test
ACME_EMAIL=test@example.test
ACME_SERVER=https://pebble:14000/dir
DNS_PROVIDER=httpreq
DNS_CREDENTIALS_PATH={p}/dns.env
EDGE_TEST_DIR={p}
PUBLIC_IPV4=10.77.42.20
DNS_RESOLVERS=10.77.42.10
SIGNUPS_ENABLED=true
APP_SECRET={secrets.token_hex(32)}
POSTGRES_PASSWORD={secrets.token_hex(32)}
''');(p/'test.env').chmod(0o600)
