import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { GitStore } from '../packages/core/src/git-store.ts';
import { encryptSecret, decryptSecret, hashPassword, verifyPassword } from '../packages/core/src/crypto.ts';
import { productionHost, previewHost, parsemcphostingHost } from '../packages/core/src/hostnames.ts';
import { validateEnvironment } from '../scripts/environment.mjs';

test('config rejects empty and placeholder secrets without exposing values', () => {
  const env = { APP_SECRET: 'a'.repeat(64), DATABASE_URL: 'postgres://user:pass@postgres/db', AUTH_BASE_URL: 'https://panel.example.com', MCP_PUBLIC_URL: 'https://mcp.example.com/mcp', PUBLIC_BASE_DOMAIN: 'sites.example.com' };
  assert.doesNotThrow(() => validateEnvironment(env));
  for (const secret of ['', 'short', 'change-me'.repeat(8)]) assert.throws(() => validateEnvironment({ ...env, APP_SECRET: secret }));
  assert.throws(() => validateEnvironment({ ...env, MCP_PUBLIC_URL: 'javascript:alert(1)' }));
});

test('custom runtime domain maps preview and production separately', () => {
  const parts = { slug: 'hello-world', userShortId: 'abc12345' };
  assert.equal(productionHost(parts, 'sites.example.org'), 'hello-world-abc12345.sites.example.org');
  assert.equal(previewHost(parts, 'sites.example.org'), 'preview--hello-world-abc12345.sites.example.org');
  assert.deepEqual(parsemcphostingHost('preview--hello-world-abc12345.sites.example.org:3002', 'sites.example.org'), {...parts, isPreview: true});
  assert.equal(parsemcphostingHost('evil.example.org', 'sites.example.org'), null);
});

test('secrets encrypt, authenticate ciphertext, and passwords verify', () => {
  const encrypted = encryptSecret('test-only-value', 'a'.repeat(64));
  assert.equal(decryptSecret(encrypted, 'a'.repeat(64)), 'test-only-value');
  assert.throws(() => decryptSecret(encrypted, 'b'.repeat(64)));
  const hash = hashPassword('test-only-password');
  assert.equal(verifyPassword('test-only-password', hash), true);
  assert.equal(verifyPassword('wrong', hash), false);
});

test('git draft, immutable publish and path boundaries', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'mcphosting-test-'));
  try {
    const store = new GitStore({repoRoot: path.join(dir, 'repos'), snapshotRoot: path.join(dir, 'snapshots')});
    await store.ensureProject('project1');
    await store.writeFiles('project1', [{path: 'index.html', content: '<h1>v1</h1>'}]);
    const release = await store.publish('project1', 1, 'Publish');
    await store.writeFiles('project1', [{path: 'index.html', content: '<h1>v2</h1>'}]);
    assert.equal(await readFile(path.join(release.snapshotDir, 'index.html'), 'utf8'), '<h1>v1</h1>');
    assert.equal(await store.readFile('project1', 'index.html'), '<h1>v2</h1>');
    await assert.rejects(store.writeFiles('project1', [{path: '../../escape', content: 'blocked'}]));
    await assert.rejects(store.readFile('project1', '.git/config'));
  } finally { await rm(dir, {recursive:true, force:true}); }
});
