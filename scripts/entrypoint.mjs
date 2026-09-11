import { spawn } from 'node:child_process';
import { validateEnvironment } from './environment.mjs';
try {
  validateEnvironment(process.env);
} catch (error) {
  console.error(JSON.stringify({ level: 'error', code: 'INVALID_CONFIGURATION', message: error.message }));
  process.exit(1);
}
const [command, ...args] = process.argv.slice(2);
const child = spawn(command, args, { stdio: 'inherit' });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('error', () => process.exit(1));
child.on('exit', (code) => process.exit(code ?? 1));
