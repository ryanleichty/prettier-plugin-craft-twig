const fs = require('fs');
const path = require('path');

const grammarPath = path.join(__dirname, '../grammar');

fs.writeFileSync(
  path.join(grammarPath, 'craft-twig.ohm.js'),
  'module.exports = ' +
    'String.raw`' +
    fs
      .readFileSync(path.join(grammarPath, 'craft-twig.ohm'), 'utf8')
      .replace(/`/g, '${"`"}') +
    '`;',
  'utf8',
);
