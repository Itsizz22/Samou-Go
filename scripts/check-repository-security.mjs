import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const problems = [];
for (const path of paths) {
  if (/(^|\/)(\.browser-audit-profile|browser-profile|playwright\/\.auth)(\/|$)/.test(path)) problems.push(`${path}: browser session data must not be tracked`);
  if (/(^|\/)(firebase-service-account.*\.json|service-account.*\.json|\.env(?:\..*)?)$/.test(path) && !path.endsWith('.env.example')) problems.push(`${path}: private configuration must not be tracked`);
  if (!/\.(?:json|[cm]?js|tsx?|ya?ml|pem|key)$/.test(path)) continue;
  const text = readFileSync(path, 'utf8');
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(text)) problems.push(`${path}: private key material detected`);
}
if (problems.length) { console.error(problems.join('\n')); process.exitCode = 1; }
else console.log('Repository security guard: PASS');
