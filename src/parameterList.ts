export const requiredParams = ['mwUrl', 'adminEmail'];

export const parameterDescriptions = {
  mwUrl: 'Mediawiki base URL.',
  adminEmail: 'Email of the mwoffliner user which will be put in the HTTP user-agent string',
  articleList: 'File with one title (in UTF8) per line. This can be a local path or an HTTP(S) url',
  cacheDirectory: 'Directory where files are permanently cached',
  customZimFavicon: 'Use this option to give a path to a PNG favicon, it will be used in place of the Mediawiki logo. This can be a local path or an HTTP(S) url',
  customZimTitle: 'Allow to configure a custom ZIM file title.',
  customZimDescription: 'Allow to configure a custom ZIM file description.',
  customZimTags: 'Allow to configure custom ZIM file tags (semi-colon separated).',
  customMainPage: 'Allow to configure a custom page as welcome page.',
  filenamePrefix: 'For the part of the ZIM filename which is before the date part.',
  format: 'Specify a flavour for the scraping. If missing, scrape all article contents. Each --format argument will cause a new local file to be created but options can be combined. Supported options are:\n * novid: no video & audio content\n * nopic: no pictures (implies "novid")\n * nopdf: no PDF files\n * nodet: only the first/head paragraph (implies "novid")\n * nozim: create a local HTML directory (instead of ZIM file)\nExample: "... --format=nopic --format=novid,nopdf"',
  keepEmptyParagraphs: 'Keep all paragraphs, even empty ones.',
  keepHtml: 'If ZIM built, keep the temporary HTML directory',
  mwWikiPath: 'Mediawiki wiki base path (per default "/wiki/")',
  mwApiPath: 'Mediawiki API path (per default "/w/api.php")',
  mwModulePath: 'Mediawiki module load path (per default "/w/load.php")',
  mwDomain: 'Mediawiki user domain (thought for private wikis)',
  mwUsername: 'Mediawiki username (thought for private wikis)',
  mwPassword: 'Mediawiki user password (thought for private wikis)',
  minifyHtml: 'Try to reduce the size of the HTML',
  outputDirectory: 'Directory to write the downloaded content',
  publisher: `ZIM publisher meta data, per default 'Kiwix'`,
  redis: 'Redis configuration (https://github.com/NodeRedis/node_redis#rediscreateclient)',
  requestTimeout: 'Request timeout (in seconds)',
  resume: 'Do not overwrite if ZIM file already created',
  useCache: 'Cache all assets and HTML',
  speed: 'Multiplicator for the number of parallel HTTP requests on Parsoid backend (per default the number of CPU cores). The default value is 1.',
  verbose: 'Print debug information to the stdout',
  withoutZimFullTextIndex: 'Don\'t include a fulltext search index to the ZIM',
  addNamespaces: 'Force addional namespace (comma separated numbers)',
  getCategories: '[WIP] Download category pages',
  noLocalParserFallback: 'Don\'t fall back to a local MCS or Parsoid, only use remote APIs',
};
