
export const MEDIA_REGEX = /^(.*\/)([^/]+)(\/)(\d+px-|)(.+?)(\.[A-Za-z0-9]{2,6}|)(\.[A-Za-z0-9]{2,6}|)$/;
export const MIN_IMAGE_THRESHOLD_ARTICLELIST_PAGE = 10;
export const URL_IMAGE_REGEX = /(https?:\/\/.*\.(?:jpg|gif|png|svg|gif|jpeg))/i;
export const CONCURRENCY_LIMIT = 10;
export const MIME_IMAGE_REGEX = /^image+[/-\w.]+$/;
export const FIND_HTTP_REGEX = /^(?:https?:\/\/)?/i;
export const DB_ERROR = 'internal_api_error_DBQueryError';
export const WEAK_ETAG_REGEX = /^W\//;
