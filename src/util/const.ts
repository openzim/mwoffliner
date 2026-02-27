export const MAX_CPU_CORES = 8
export const IMAGE_THUMB_URL_REGEX =
  /^(.*?\/)(transcoded\/|thumb\/)?([0-9a-fA-F]{1}\/[0-9a-fA-F]{2}\/)?([^/]+\.[A-Za-z0-9]{2,6}\/)?(\d+px[-]+)?([^/]+?\.[A-Za-z0-9]{2,6}(\.[A-Za-z0-9]{2,6})?)(\?[0-9a-fA-F]+)?$/
export const LATEX_IMAGE_URL_REGEX = /^(.*\/math\/render\/svg\/)([A-Za-z0-9]+)$/
export const FANDOM_IMAGE_URL_REGEX = /^(.*\/)[0-9a-fA-F]{1}\/[0-9a-fA-F]{2}\/([^/]+)\/revision\//i
export const MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE = 10
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
export const MAX_FILE_DOWNLOAD_RETRIES = 5
export const FILES_DOWNLOAD_FAILURE_MINIMUM_FOR_CHECK = 50 // minimum number of files failing download before starting to consider for failing the scrape
export const FILES_DOWNLOAD_FAILURE_TRESHOLD_PER_TEN_THOUSAND = 10 // 10 = 0.1%
export const BLACKLISTED_NS = ['Story'] // 'Story' Wikipedia namespace is content, but not indgestable by Parsoid https://github.com/openzim/mwoffliner/issues/1853
export const RENDERERS_LIST = ['ActionParse']
