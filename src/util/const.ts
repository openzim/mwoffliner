
export const MEDIA_REGEX = /^(.*\/)([^/]+)(\/)(\d+px-|)(.+?)(\.[A-Za-z0-9]{2,6}|)(\.[A-Za-z0-9]{2,6}|)$/;
export const MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE = 10;
export const IMAGE_URL_REGEX = /(https?:\/\/.*\.(?:jpg|gif|png|svg|jpeg))/i;
export const CONCURRENCY_LIMIT = 10;
export const IMAGE_MIME_REGEX = /^image+[/-\w.]+$/;
export const FIND_HTTP_REGEX = /^(?:https?:\/\/)?/i;
export const DB_ERROR = 'internal_api_error_DBQueryError';
export const WEAK_ETAG_REGEX = /^(W\/)/;
export const WEBP_CANDIDATE_IMAGE_FILENAME_REGEX = /((jpeg|png|jpg)$|(jpeg%3F|png%3F|jpg%3F))/i;
export const BITMAP_IMAGE_MIME_REGEX = /^image+[/-\w.]+(jpeg|png|gif)$/;
export const WEBP_CANDIDATE_IMAGE_MIME_TYPE = /image+[/]+(jpeg|png)/;