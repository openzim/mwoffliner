const { execSync } = require('child_process');
const fs = require('fs');
const packageJSON = require('./package.json');

console.info(`Updating git revision`);
try {
    const gitRevision = execSync('git rev-parse --short HEAD').toString().trim();
    console.info(`Got current git revision: [${gitRevision}]`);
    packageJSON.gitRevision = gitRevision;

    fs.writeFileSync('./package.json', JSON.stringify(packageJSON, null, '\t'), 'utf8');

    console.info(`DONE`);
} catch (err) { /* NOOP */ }
