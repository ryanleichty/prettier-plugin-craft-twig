const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', '.vite-standalone');
const source = path.join(buildDir, 'standalone.js');
const destination = path.join(__dirname, '..', 'standalone.js');

fs.renameSync(source, destination);
fs.rmSync(buildDir, { recursive: true, force: true });
