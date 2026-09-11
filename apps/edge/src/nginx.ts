import { acmePath } from "./acme.js";
import { isValidHostname } from "@mcphosting/core";
import type { EdgeConfig } from "./config.js";

export function nginxConfig(config: Pick<EdgeConfig, "main" | "cidrs" | "server">, wildcard: boolean, activeHosts: string[]): string {
  if (!isValidHostname(config.main) || activeHosts.some((host) => !isValidHostname(host))) throw new Error("Unsafe nginx hostname");
  const acl = config.cidrs.length ? config.cidrs.map((cidr) => `allow ${cidr};`).join("\n") + "\ndeny all;" : "";
  const proxy = (upstream: string) => `
    proxy_pass http://${upstream};
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Forwarded "";
    proxy_http_version 1.1;
    proxy_buffering off;
    proxy_read_timeout 300s;
  `;
  const cert = (host: string) => `ssl_certificate ${acmePath(config.server)}/certificates/${host}.crt;\nssl_certificate_key ${acmePath(config.server)}/certificates/${host}.key;`;
  const https = "listen 8443 ssl; listen [::]:8443 ssl;";
  const protectedRoutes = `location = /mcp { ${acl} ${proxy("mcp:3001")} }\nlocation / { ${acl} ${proxy("web:3000")} }`;
  const siteRoutes = `location ^~ /_internal/ { return 404; }\nlocation / { ${proxy("router:3002")} }`;
  const custom = activeHosts.map((host) => `server { ${https} server_name ${host}; ${cert(host)} ${siteRoutes} }`).join("\n");
  return `pid /tmp/nginx.pid;
error_log stderr warn;
worker_processes auto;
events { worker_connections 1024; }
http {
  access_log off;
  server_tokens off;
  client_max_body_size 20m;
  client_body_temp_path /tmp/nginx-client;
  proxy_temp_path /tmp/nginx-proxy;
  fastcgi_temp_path /tmp/nginx-fastcgi;
  uwsgi_temp_path /tmp/nginx-uwsgi;
  scgi_temp_path /tmp/nginx-scgi;
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_session_cache shared:TLS:10m;
  server { listen 8080 default_server; listen [::]:8080 default_server; server_name _;
    location ^~ /.well-known/acme-challenge/ { root /edge/challenges; default_type text/plain; try_files $uri =404; }
    location / { return 404; }
  }
  server { ${https.replaceAll("ssl;", "ssl default_server;")} server_name _; ssl_reject_handshake on; }
  server { listen 8080; listen [::]:8080; server_name ${config.main};
    location / { ${wildcard ? `return 308 https://${config.main}$request_uri;` : 'return 503 "HTTPS is being configured. Try again shortly.";'} }
  }
  ${wildcard ? `server { ${https} server_name ${config.main}; ${cert(config.main)} ${protectedRoutes} }
  server { ${https} server_name ~^[a-z0-9-]+\\.${config.main.replaceAll(".", "\\.")}$; ${cert(config.main)} ${siteRoutes} }` : ""}
  ${custom}
  ${wildcard || activeHosts.length ? `server { listen 8080; listen [::]:8080;
    server_name ${wildcard ? `*.${config.main}` : ""} ${activeHosts.join(" ")};
    location ^~ /.well-known/acme-challenge/ { root /edge/challenges; default_type text/plain; try_files $uri =404; }
    location / { return 308 https://$host$request_uri; }
  }` : ""}
}`;
}
