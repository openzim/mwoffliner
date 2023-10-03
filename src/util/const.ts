export const MAX_CPU_CORES = 8
export const IMAGE_THUMB_URL_REGEX = /^.*\/[0-9a-fA-F]{1}\/[0-9a-fA-F]{2}\/([^/]+\/)?(\d+px[-]+)?(.+?\.[A-Za-z0-9]{2,6}(\.[A-Za-z0-9]{2,6})?)$/
export const LATEX_IMAGE_URL_REGEX = /^.*\/math\/render\/svg\/([A-Za-z0-9]+)$/
export const WIKIHIERO_IMAGE_URL_REGEX = /^.*\/wikihiero\/img\/(.*\.png)(\?.*)?$/
export const FANDOM_IMAGE_URL_REGEX = /([^\/]+)\/revision\//i
export const IMAGE_URL_REGEX = /(https?:\/\/.*\.(?:jpg|gif|png|svg|jpeg)(\?.*)?)/i
export const MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE = 10
export const CONCURRENCY_LIMIT = 10
export const IMAGE_MIME_REGEX = /^image+[/-\w.]+$/
export const FIND_HTTP_REGEX = /^(?:https?:\/\/)?/i
export const DB_ERROR = 'internal_api_error_DBQueryError'
export const DELETED_ARTICLE_ERROR = 'Article has been deleted.'
export const WEAK_ETAG_REGEX = /^(W\/)/
export const BITMAP_IMAGE_MIME_REGEX = /^image+[/-\w.]+(jpeg|png|gif)$/
export const WEBP_CANDIDATE_IMAGE_MIME_TYPE = /image+[/]+(jpeg|png)/
export const ALL_READY_FUNCTION = /function allReady\( modules \) {/
export const DO_PROPAGATION = /mw\.requestIdleCallback\( doPropagation, \{ timeout: 1 \} \);/
export const LOAD_PHP = /script.src = ".*load\.php.*";/
export const RULE_TO_REDIRECT = /window\.top !== window\.self/
export const WEBP_HANDLER_URL = 'https://gist.githubusercontent.com/rgaudin/60bb9cc6f187add506584258028b8ee1/raw/9d575b8e25d67eed2a9c9a91d3e053a0062d2fc7/web-handler.js'
export const MAX_FILE_DOWNLOAD_RETRIES = 5
export const BLACKLISTED_NS = ['Story'] // 'Story' Wikipedia namespace is content, but not indgestable by Parsoid https://github.com/openzim/mwoffliner/issues/1853
