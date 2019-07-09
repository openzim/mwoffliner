const { writeFileSync } = require('fs');

const pkg = require('../package.json');
pkg.version = pkg.version + '-' + Date.now();
writeFileSync('./package.json', JSON.stringify(pkg), 'utf8');