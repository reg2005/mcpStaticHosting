import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const files = execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\b(?:ghp|gho|github_pat)_[A-Za-z0-9_]{30,}\b/, /\bAKIA[A-Z0-9]{16}\b/, /\bdckr_pat_[A-Za-z0-9_-]{20,}\b/];
const failures=[];
for (const file of files) {
  if (/(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith('.example')) failures.push(file);
  if (/(^(data|backups)\/)|((^|\/)(node_modules|\.next|\.git)\/)/.test(file)) failures.push(file);
  const text = readFileSync(file,'utf8');
  if (patterns.some(pattern=>pattern.test(text))) failures.push(file);
}
if(failures.length) {console.error('Potential secret/generated files:', [...new Set(failures)].join(', '));process.exit(1);}
console.log(`Checked ${files.length} tracked files for forbidden paths and common credential patterns.`);
