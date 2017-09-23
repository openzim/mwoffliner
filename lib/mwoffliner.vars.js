const {
  fs,
  domino,
  // jsdom,
  async,
  http,
  https,
  zlib,
  swig,
  urlParser,
  pathParser,
  // mkdirp,
  redis,
  // childProcess,
  exec,
  os,
  crypto,
  unicodeCutter,
  htmlMinifier,
  parsoid,
  fetch,
  config,
  Downloader,
  DU,
  Logger,
  MediaWiki,
  U,
  Zim,
  OfflinerEnv
} = require("./mwoffliner.modules");
const mwofflinerLib = require("mwoffliner.lib");
// const { parameterList } = require("./parameterList");

function execute(argv) {
  /************************************/
  /* CUSTOM VARIABLE SECTION **********/
  /************************************/

  /* HTTP user-agent string */
  const adminEmail = argv.adminEmail;
  if (!U.validateEmail(adminEmail)) {
    console.error("Admin email " + adminEmail + " is not valid");
    process.exit(1);
  }

  /* Parsoid URL */
  let parsoidUrl = argv.parsoidUrl;
  const localParsoid = argv.localParsoid;

  /* ZIM custom Favicon */
  const customZimFavicon = argv.customZimFavicon;
  if (customZimFavicon && !fs.existsSync(customZimFavicon)) {
    console.error('Path "' + customZimFavicon + '" is not a valid PNG file.');
    process.exit(1);
  }

  /* Number of parallel requests */
  const cpuCount = os.cpus().length;
  if (argv.speed && isNaN(argv.speed)) {
    console.error("speed is not a number, please give a number value to --speed");
    process.exit(1);
  }
  const speed = cpuCount * (argv.speed || 1);

  /* Necessary to avoid problems with https */
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

  /* Verbose */
  const verbose = argv.verbose;

  /* Optimize HTML */
  const minifyHtml = argv.minifyHtml;

  /* Cache strategy */
  const skipHtmlCache = argv.skipHtmlCache;
  const skipCacheCleaning = argv.skipCacheCleaning;

  /* Redis configuration */
  const redisConf = argv.redis ? argv.redis : config.defaults.redisConfig;

  /* Keep empty paragraphs */
  const keepEmptyParagraphs = argv.keepEmptyParagraphs;

  /* logger */
  const logger = new Logger(verbose);

  /* Wikipedia/... URL; Normalize by adding trailing / as necessary */
  const mw = new MediaWiki(logger, {
    base: argv.mwUrl,
    wikiPath: argv.mwWikiPath,
    apiPath: argv.mwApiPath,
    domain: argv.mwDomain,
    username: argv.mwUsername,
    password: argv.mwPassword,
    spaceDelimiter: argv.spaceDelimiter || "_"
  });

  /* Download helpers; TODO: Merge with something else / expand this. */
  const downloader = new Downloader(
    logger,
    mw,
    config.userAgent + " (" + adminEmail + ")",
    argv.requestTimeout || config.defaults.requestTimeout
  );

  /*
         * Find a suitable name to use for ZIM (content) creator
         * Heuristic: Use basename of the domain unless
         * - it happens to be a wikimedia project OR
         * - some domain where the second part of the hostname is longer than the first part
         */
  const hostParts = urlParser.parse(mw.base).hostname.split(".");
  let creator = hostParts[0];
  if (hostParts.length > 1) {
    const wmProjects = [
      "wikipedia",
      "wikisource",
      "wikibooks",
      "wikiquote",
      "wikivoyage",
      "wikiversity",
      "wikinews",
      "wiktionary"
    ];
    if (wmProjects.contains(hostParts[1]) || hostParts[0].length < hostParts[1].length) {
      creator = hostParts[1]; // Name of the wikimedia project
    }
  }
  creator = creator.charAt(0).toUpperCase() + creator.substr(1);

  /************************************/
  /* SYSTEM VARIABLE SECTION **********/
  /************************************/

  const zimOpts = {
    // Name to use for ZIM (content) creator
    creator: creator,

    // ZIM publisher
    publisher: argv.publisher || config.defaults.publisher,

    langIso2: "en",
    langIso3: "eng",

    // List of articles is maybe in a file
    articleList: argv.articleList,

    mainPageId: argv.customMainPage || "",
    name: argv.customZimTitle || "",
    description: argv.customZimDescription || "",
    cacheDirectory: (argv.cacheDirectory ? argv.cacheDirectory : pathParser.resolve(process.cwd(), "cac")) + "/",

    // Layout
    mobileLayout: argv.mobileLayout || false,

    // File where redirects might be save if --writeHtmlRedirects is not set
    redirectsCacheFile: null,

    // Directory wehre everything is saved at the end of the process
    outputDirectory: argv.outputDirectory,

    // Directory where temporary data are saved
    tmpDirectory: argv.tmpDirectory,

    // Include fulltext index in ZIM file
    withZimFullTextIndex: argv.withZimFullTextIndex,

    // What is this?
    subTitle: ""
  };
  const zim = new Zim(zimOpts);

  const date = new Date();

  // Temporary stub env for now to encapsulate state and pass around
  // where it is required. This might eventually take a different form
  // after refactoring is complete.
  const env = new OfflinerEnv(argv.format, {
    zim: zim,
    mw: mw,
    logger: logger,
    downloader: downloader,
    // Prefix part of the filename (radical)
    filenamePrefix: argv.filenamePrefix || "",

    // output config (FIXME: Does this belong in Zim?)
    nopic: false,
    novid: false,
    nozim: false,
    nodet: false,

    // Script direction (defaults to ltr)
    ltr: true,

    // Content date (FIXME: Does this belong in Zim?)
    contentDate: date.getFullYear() + "-" + ("0" + (date.getMonth() + 1)).slice(-2),

    htmlRootPath: "",

    // If ZIM is built, should temporary HTML directory be kept
    keepHtml: argv.keepHtml,

    // Should we keep ZIM file generation if ZIM file already exists
    resume: argv.resume,

    verbose: verbose,
    deflateTmpHtml: argv.deflateTmpHtml,
    // How to write redirects
    writeHtmlRedirects: argv.writeHtmlRedirects
  });

  const INFINITY_WIDTH = 9999999;
  const articleIds = {};
  const webUrlHost = urlParser.parse(mw.webUrl).host;
  const webUrlPath = urlParser.parse(mw.webUrl).pathname;
  const apiUrl = mw.apiUrl;
  const addNamespaces = argv.addNamespaces ? String(argv.addNamespaces).split(",") : [];
  let parsoidContentType = "html";

  if (!parsoidUrl) {
    if (localParsoid) {
      console.info("Starting Parsoid");
      //Icky but necessary
      fs.writeFileSync(
        "./localsettings.js",
        `
                exports.setup = function(parsoidConfig) {
                    parsoidConfig.setMwApi({
                        uri: '${mw.base + mw.apiPath}',
                    });
                };
                `,
        "utf8"
      );
      parsoid
        .apiServiceWorker({
          appBasePath: "./node_modules/parsoid",
          logger: console,
          config: { localsettings: "../../localsettings.js" }
        })
        .then(() => {
          fs.unlinkSync("./localsettings.js");
          console.info("Parsoid Started Successfully");
        })
        .catch(err => {
          console.error(`Error starting Parsoid: ${err}`);
          process.exit(1);
        });
      parsoidUrl = `http://localhost:8000/${webUrlHost}/v3/page/pagebundle/`;
      parsoidContentType = "json";
    } else {
      parsoidUrl = apiUrl + "action=visualeditor&format=json&paction=parse&page=";
      parsoidContentType = "json";
    }
  }
  // const filenameRadical = '';
  const config = {
    env,
    redisConf,
    zim,
    mw,
    downloader,
    addNamespaces,
    webUrlHost,
    logger,
    skipCacheCleaning,
    cpuCount,
    speed,
    webUrlPath,
    customZimFavicon,
    apiUrl,
    keepEmptyParagraphs,
    articleIds,
    minifyHtml,
    parsoidUrl,
    skipHtmlCache,
    parsoidContentType,
    INFINITY_WIDTH
  };
  mwofflinerLib.main(config);
}

module.exports = {
  execute
};
