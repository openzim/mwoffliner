// For testing parsoid

const parsoid = require('parsoid');

async function run() {
    await parsoid
        .apiServiceWorker({
            appBasePath: './node_modules/parsoid',
            logger: console,
            config: {
                localsettings: '../../bin/localsettings.js',
                parent: undefined,
            },
        })
        .then((_) => {
            console.info('Parsoid Started Successfully');
        });
}

run();

setInterval(() => {
    console.info('tick');
}, 20000);