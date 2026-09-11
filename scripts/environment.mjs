export function validateEnvironment(env) {
  if (env.SITE_ROUTING_MODE && !["subdomain", "path"].includes(env.SITE_ROUTING_MODE)) throw new Error("SITE_ROUTING_MODE must be subdomain or path");
  if (!env.APP_SECRET || env.APP_SECRET.length < 32 || /change.?me|placeholder/i.test(env.APP_SECRET)) {
    throw new Error('APP_SECRET must contain at least 32 random characters. Run scripts/setup.sh.');
  }
  for (const name of ['DATABASE_URL', 'AUTH_BASE_URL', 'MCP_PUBLIC_URL']) {
    if (!env[name]) throw new Error(`${name} is required`);
    let url;
    try { url = new URL(env[name]); } catch { throw new Error(`${name} must be a valid URL`); }
    const protocols = name === 'DATABASE_URL' ? ['postgres:', 'postgresql:'] : ['http:', 'https:'];
    if (!protocols.includes(url.protocol)) throw new Error(`${name} has an invalid protocol`);
  }
  if (!env.PUBLIC_BASE_DOMAIN || /[:/\s]/.test(env.PUBLIC_BASE_DOMAIN)) {
    throw new Error('PUBLIC_BASE_DOMAIN must be a hostname without scheme or port');
  }
}
