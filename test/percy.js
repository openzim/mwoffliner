const { readdir, readFile } = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const { percySnapshot } = require('@percy/puppeteer');

console.info(`===============================\n===============================\n\n\tRunning Percy Test\n\n===============================\n===============================`);

console.info(`Running from [${process.cwd()}]`);

const TEST_PORT = process.env.TEST_PORT || 8080;

const tmpDir = path.join(process.cwd(), 'tmp');
console.info(`Finding outputs in [${tmpDir}]`);


describe(`MWOffliner Page`, function () {
    const TEST_URL = `http://localhost:${TEST_PORT}/index.htm`;
    before(async function () {
        const [testOutputDir] = await readDirPromise(tmpDir);
        console.info(`Testing dump [${testOutputDir}]`);
        await serveDir(path.join(tmpDir, testOutputDir), TEST_PORT);
    })

    let browser = null
    let page = null
    beforeEach(async function () {
        browser = await puppeteer.launch({
            headless: true,
            timeout: 10000
        })
        page = await browser.newPage()
    })

    afterEach(function () {
        browser.close()
    })

    it('Loads the Welcome Page', async () => {
        await page.goto(TEST_URL);
        await percySnapshot(page, 'LOADS_WELCOME_PAGE');
    })

    it('Loads the first link', async () => {
        await page.goto(TEST_URL);
        const as = await page.$$('a.item');
        await as[0].click();
        await page.waitForNavigation();
        await percySnapshot(page, 'LOADS_FIRST_PAGE');
    })

})




/* *******************************
************** UTIL **************
******************************* */

function readDirPromise(dirPath) {
    return new Promise((resolve, reject) => {
        readdir(dirPath, (err, files) => {
            if (err) reject(err);
            else resolve(files);
        });
    });
}

const http = require('http');
const url = require('url');

function serveDir(dir = './', port = 8080) {
    return new Promise((resolve, reject) => {
        http.createServer(function (req, res) {
            const q = url.parse(req.url, true);
            const filename = path.join(dir, q.pathname);
            console.info(`Serving [${q.pathname}] from [${filename}]`);
            readFile(filename, function (err, data) {
                if (err) {
                    res.writeHead(404, { 'Content-Type': 'text/html' });
                    return res.end("404 Not Found");
                }
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.write(data);
                return res.end();
            });
        }).listen(port, (err) => {
            if (err) reject(err);
            else {
                console.info(`Serving [${path.resolve(dir)}] on port [${port}]`);
                resolve();
            }
        });
    });
}