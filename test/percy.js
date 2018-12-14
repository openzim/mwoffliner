const { readdir, readFile } = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { percySnapshot } = require('@percy/puppeteer');


console.info(`Running from [${process.cwd()}]`);

const tmpDir = path.join(process.cwd(), 'tmp');
console.info(`Finding outputs in [${tmpDir}]`);

Promise.all([
    readDirPromise(tmpDir),
    puppeteer.launch({ headless: true })
])
    .then(async ([[testOutputDir], browser]) => {
        const testOutputIndex = path.join(tmpDir, testOutputDir, 'index.htm');
        console.info(`Testing file [${testOutputIndex}]`);

        const page = await browser.newPage();
        await page.goto(`file://${testOutputIndex}`);
        await percySnapshot(page, 'MWOffliner Welcome Page', { widths: [768, 992, 1200] });
        console.info(`Completed Test`);
        process.exit(0);
    })
    .catch(err => {
        console.error(`Failed to run test`, err);
        process.exit(1);
    });


function readDirPromise(dirPath) {
    return new Promise((resolve, reject) => {
        readdir(dirPath, (err, files) => {
            if (err) reject(err);
            else resolve(files);
        });
    });
}