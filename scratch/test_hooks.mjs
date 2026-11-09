import { pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const projectRoot = process.cwd();

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'next/server') {
    return {
      url: pathToFileURL(path.join(projectRoot, 'node_modules/next/server.js')).href,
      shortCircuit: true,
    };
  }

  if (specifier === '@/lib/db') {
    return {
      url: pathToFileURL(path.join(projectRoot, 'scratch/mock_db.mjs')).href,
      shortCircuit: true,
    };
  }

  if (specifier === '@/lib/auth') {
    return {
      url: pathToFileURL(path.join(projectRoot, 'scratch/mock_auth.mjs')).href,
      shortCircuit: true,
    };
  }

  if (specifier.startsWith('@/')) {
    const relativePath = specifier.slice(2);
    let fullPath = path.join(projectRoot, relativePath);
    if (!fs.existsSync(fullPath) && fs.existsSync(`${fullPath}.js`)) {
      fullPath = `${fullPath}.js`;
    }
    return {
      url: pathToFileURL(fullPath).href,
      shortCircuit: true,
    };
  }

  return nextResolve(specifier, context);
}
