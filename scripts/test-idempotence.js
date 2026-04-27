#!/usr/bin/env node

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const vitestBin = path.join(__dirname, '..', 'node_modules', 'vitest', 'vitest.mjs');

const result = spawnSync(process.execPath, [vitestBin, 'run'], {
  env: {
    ...process.env,
    TEST_IDEMPOTENCE: 'true',
  },
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
