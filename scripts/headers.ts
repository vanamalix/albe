// Renders public/_headers from headers.config.ts on the @vanamalix/edge baseline. The file is committed;
// scripts/headers.test.ts catches drift. Usage: npm run headers. Needs Node 22.18 or newer (runs .ts directly).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderHeadersFile } from '@vanamalix/edge';
import { headers } from '../headers.config.ts';

export const renderHeaders = (): string => renderHeadersFile(headers);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(new URL('../public/_headers', import.meta.url), renderHeaders());
}
