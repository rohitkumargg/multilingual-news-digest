import { register } from 'node:module';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

register(pathToFileURL(path.join(process.cwd(), 'scratch/test_hooks.mjs')));
