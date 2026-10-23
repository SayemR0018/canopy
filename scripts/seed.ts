import path from 'node:path';
import { seedRepository } from '../src/seed.js';

export { seedRepository };

// Allow direct CLI invocation: tsx scripts/seed.ts
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve('scripts/seed.ts')) {
  seedRepository()
    .then((stats) => {
      console.log('Seed completed successfully:', stats);
      process.exit(0);
    })
    .catch((err) => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
