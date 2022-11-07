import { writeFileSync } from 'fs';

import pkg from './../package.json';
pkg.version = pkg.version + '-' + Date.now();
writeFileSync('./package.json', JSON.stringify(pkg), 'utf8');