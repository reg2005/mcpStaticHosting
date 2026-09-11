import { cp, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const root = dirname(require.resolve('monaco-editor/package.json'));
const destination = new URL('../apps/web/public/monaco', import.meta.url);
await mkdir(destination, { recursive: true });
await cp(join(root, 'min/vs'), new URL('vs/', destination.href + '/'), { recursive: true });
