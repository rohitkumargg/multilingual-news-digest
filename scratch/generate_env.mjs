import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const envPath = path.resolve(process.cwd(), '.env.local');

let existingContent = '';
if (fs.existsSync(envPath)) {
  existingContent = fs.readFileSync(envPath, 'utf8');
}

// Check if secret already defined
const hasAuthSecret = /^AUTH_SECRET=/m.test(existingContent);
const hasNextAuthSecret = /^NEXTAUTH_SECRET=/m.test(existingContent);

let newLines = [];

if (!hasAuthSecret && !hasNextAuthSecret) {
  // Generate cryptographically secure 32-byte secret encoded in base64
  const secret = crypto.randomBytes(32).toString('base64');
  newLines.push(`# NextAuth / Auth.js Configuration`);
  newLines.push(`AUTH_SECRET=${secret}`);
  newLines.push(`NEXTAUTH_SECRET=${secret}`);
  newLines.push(`NEXTAUTH_URL=http://localhost:3000`);
} else if (!hasAuthSecret && hasNextAuthSecret) {
  // Extract existing NEXTAUTH_SECRET to mirror to AUTH_SECRET
  const match = existingContent.match(/^NEXTAUTH_SECRET=(.+)$/m);
  if (match) {
    newLines.push(`AUTH_SECRET=${match[1].trim()}`);
  }
} else if (hasAuthSecret && !hasNextAuthSecret) {
  // Extract existing AUTH_SECRET to mirror to NEXTAUTH_SECRET
  const match = existingContent.match(/^AUTH_SECRET=(.+)$/m);
  if (match) {
    newLines.push(`NEXTAUTH_SECRET=${match[1].trim()}`);
  }
}

if (!/^NEXTAUTH_URL=/m.test(existingContent) && !newLines.some(l => l.startsWith('NEXTAUTH_URL='))) {
  newLines.push(`NEXTAUTH_URL=http://localhost:3000`);
}

if (newLines.length > 0) {
  const contentToWrite = existingContent
    ? `${existingContent.trimEnd()}\n\n${newLines.join('\n')}\n`
    : `${newLines.join('\n')}\n`;
  fs.writeFileSync(envPath, contentToWrite, { mode: 0o600 });
  console.log('SUCCESS: .env.local created/updated securely with NextAuth secret configuration.');
} else {
  console.log('INFO: .env.local already contains necessary NextAuth secret variables.');
}
