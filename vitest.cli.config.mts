// SPDX-License-Identifier: MIT
// © 2026 Hannes Stauss (scalarion@nimblescape.com)
// Licensed under the MIT License. See LICENSE in the repository root for details.

import { defineConfig } from 'vitest/config';

// The tests of the built command markdown-notes (npm run test:cli). They need the bundle cli/dist/markdown-notes.js
// and run it with the Node.js of the tests.
export default defineConfig({
  test: {
    include: ['test/cli/**/*.test.ts'],
    environment: 'node',
  },
});
