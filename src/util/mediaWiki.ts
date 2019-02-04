// import * as urlParser from 'url';


// export async function getMwMetaData(): Promise<MWMetaData> {

//     const base = `${opts.base.replace(/\/$/, '')}/`;
//     const wikiPath = opts.wikiPath !== undefined && opts.wikiPath !== true ? opts.wikiPath : 'wiki/';
//     const apiPath = opts.apiPath === undefined ? 'w/api.php' : opts.apiPath;
//     const modulePath = opts.modulePath === undefined ? 'w/load.php' : opts.modulePath;
//     const webUrl = base + wikiPath;
//     const domain = urlParser.parse(webUrl).hostname;

//     return {
//         webUrl,
//         apiUrl: `${base}${apiPath}?`,
//         modulePath: `${base}${modulePath}?`,
//         webUrlPath: urlParser.parse(webUrl).pathname,
//         wikiPath,
//         base,
//         apiPath,
//         domain,


//         textDir: 'ltr', // TODO
//         langIso2: 'en',// TODO
//         langIso3: 'eng',// TODO
//         title: 'test', // TODO
//         subTitle: 'testsub',// TODO
//         creator: 'Test',// TODO
//         mainPage: 'Main_Page', // TODO

//     };
// }
