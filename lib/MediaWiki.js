"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
var country_language_1 = __importDefault(require("country-language"));
var domino_1 = __importDefault(require("domino"));
var url_1 = __importDefault(require("url"));
var U = __importStar(require("./Utils"));
// Stub for now
var MediaWiki = /** @class */ (function () {
    function MediaWiki(logger, config) {
        this.logger = logger;
        // Normalize args
        this.base = config.base.replace(/\/$/, '') + "/";
        this.wikiPath = config.wikiPath !== undefined && config.wikiPath !== true ? config.wikiPath : 'wiki';
        this.apiPath = config.apiPath || 'w/api.php';
        this.domain = config.domain || '';
        this.username = config.username;
        this.password = config.password;
        this.spaceDelimiter = config.spaceDelimiter;
        // Computed properties
        this.webUrl = this.base + this.wikiPath + "/";
        this.apiUrl = this.base + this.apiPath + "?";
        this.webUrlPath = url_1.default.parse(this.webUrl).pathname;
        // State
        this.namespaces = {};
        this.namespacesToMirror = [];
    }
    MediaWiki.prototype.login = function (downloader) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            if (_this.username && _this.password) {
                var url_2 = _this.apiUrl + "action=login&format=json&lgname=" + _this.username + "&lgpassword=" + _this.password;
                if (_this.domain) {
                    url_2 = url_2 + "&lgdomain=" + _this.domain;
                }
                downloader.downloadContent(url_2, function (content) {
                    var body = content.toString();
                    var jsonResponse = JSON.parse(body).login;
                    downloader.loginCookie = jsonResponse.cookieprefix + "_session=" + jsonResponse.sessionid;
                    if (jsonResponse.result === 'SUCCESS') {
                        resolve();
                    }
                    else {
                        url_2 = url_2 + "&lgtoken=" + jsonResponse.token;
                        downloader.downloadContent(url_2, function (subContent) {
                            body = subContent.toString();
                            jsonResponse = JSON.parse(body).login;
                            if (jsonResponse.result !== 'Success') {
                                return reject('Login Failed');
                            }
                            downloader.loginCookie = jsonResponse.cookieprefix + "_session=" + jsonResponse.sessionid;
                            resolve();
                        });
                    }
                });
            }
            else {
                resolve();
            }
        });
    };
    // In all the url methods below:
    // * encodeURIComponent is mandatory for languages with illegal letters for uri (fa.wikipedia.org)
    // * encodeURI is mandatory to encode the pipes '|' but the '&' and '=' must not be encoded
    MediaWiki.prototype.siteInfoUrl = function () {
        return this.apiUrl + "action=query&meta=siteinfo&format=json";
    };
    MediaWiki.prototype.imageQueryUrl = function (title) {
        return this.apiUrl + "action=query&prop=pageimages&pithumbsize=300&format=json&titles=" + encodeURIComponent(title);
    };
    MediaWiki.prototype.articleQueryUrl = function (title) {
        return this.apiUrl + "action=query&redirects&format=json&prop=revisions|coordinates&titles=" + encodeURIComponent(title);
    };
    MediaWiki.prototype.backlinkRedirectsQueryUrl = function (articleId) {
        return this.apiUrl + "action=query&prop=redirects&format=json&rdprop=title&rdlimit=max&titles=" + encodeURIComponent(articleId) + "&rawcontinue=";
    };
    MediaWiki.prototype.pageGeneratorQueryUrl = function (namespace, init) {
        return this.apiUrl + "action=query&generator=allpages&gapfilterredir=nonredirects&gaplimit=max&colimit=max&prop=revisions|coordinates&gapnamespace=" + this.namespaces[namespace].num + "&format=json&rawcontinue=" + init;
    };
    MediaWiki.prototype.articleApiUrl = function (articleId) {
        return this.apiUrl + "action=parse&format=json&page=" + encodeURIComponent(articleId) + "&prop=" + encodeURI('modules|jsconfigvars|headhtml');
    };
    MediaWiki.prototype.getTextDirection = function (env, downloader) {
        var _this = this;
        var self = this;
        return new Promise(function (resolve, reject) {
            var logger = self.logger;
            logger.log('Getting text direction...');
            downloader.downloadContent(_this.webUrl, function (content) {
                var body = content.toString();
                var doc = domino_1.default.createDocument(body);
                var contentNode = doc.getElementById('mw-content-text');
                var languageDirectionRegex = /"pageLanguageDir":"(.*?)"/;
                var parts = languageDirectionRegex.exec(body);
                if (parts && parts[1]) {
                    env.ltr = (parts[1] === 'ltr');
                }
                else if (contentNode) {
                    env.ltr = (contentNode.getAttribute('dir') === 'ltr');
                }
                else {
                    logger.log('Unable to get the language direction, fallback to ltr');
                    env.ltr = true;
                }
                logger.log("Text direction is " + (env.ltr ? 'ltr' : 'rtl'));
                resolve();
            });
        });
    };
    MediaWiki.prototype.getSiteInfo = function (env, downloader) {
        var _this = this;
        var self = this;
        return new Promise(function (resolve, reject) {
            _this.logger.log('Getting web site name...');
            var url = _this.apiUrl + "action=query&meta=siteinfo&format=json&siprop=general|namespaces|statistics|variables|category|wikidesc";
            downloader.downloadContent(url, function (content) {
                var body = content.toString();
                var entries = JSON.parse(body).query.general;
                /* Welcome page */
                if (!env.zim.mainPageId && !env.zim.articleList) {
                    env.zim.mainPageId = entries.mainpage.replace(/ /g, self.spaceDelimiter);
                }
                /* Site name */
                if (!env.zim.name) {
                    env.zim.name = entries.sitename;
                }
                /* Language */
                env.zim.langIso2 = entries.lang;
                country_language_1.default.getLanguage(env.zim.langIso2, function (error, language) {
                    if (error || !language.iso639_3) {
                        env.zim.langIso3 = env.zim.langIso2;
                    }
                    else {
                        env.zim.langIso3 = language.iso639_3;
                    }
                    resolve();
                });
            });
        });
    };
    MediaWiki.prototype.getNamespaces = function (addNamespaces, downloader) {
        return __awaiter(this, void 0, void 0, function () {
            var self, url;
            return __generator(this, function (_a) {
                self = this;
                url = this.apiUrl + "action=query&meta=siteinfo&siprop=namespaces|namespacealiases&format=json";
                downloader.downloadContent(url, function (content) {
                    var body = content.toString();
                    var json = JSON.parse(body);
                    ['namespaces', 'namespacealiases'].forEach(function (type) {
                        var entries = json.query[type];
                        Object.keys(entries).forEach(function (key) {
                            var entry = entries[key];
                            var name = entry['*'].replace(/ /g, self.spaceDelimiter);
                            var num = entry.id;
                            var allowedSubpages = ('subpages' in entry);
                            var isContent = !!(entry.content !== undefined || U.contains(addNamespaces, num));
                            var canonical = entry.canonical ? entry.canonical.replace(/ /g, self.spaceDelimiter) : '';
                            var details = { num: num, allowedSubpages: allowedSubpages, isContent: isContent };
                            /* Namespaces in local language */
                            self.namespaces[U.lcFirst(name)] = details;
                            self.namespaces[U.ucFirst(name)] = details;
                            /* Namespaces in English (if available) */
                            if (canonical) {
                                self.namespaces[U.lcFirst(canonical)] = details;
                                self.namespaces[U.ucFirst(canonical)] = details;
                            }
                            /* Is content to mirror */
                            if (isContent) {
                                self.namespacesToMirror.push(name);
                            }
                        });
                    });
                });
                return [2 /*return*/];
            });
        });
    };
    MediaWiki.prototype.extractPageTitleFromHref = function (href) {
        try {
            var pathname = url_1.default.parse(href, false, true).pathname || '';
            if (pathname.indexOf('./') === 0) {
                return U.decodeURIComponent(pathname.substr(2));
            }
            if (pathname.indexOf(this.webUrlPath) === 0) {
                return U.decodeURIComponent(pathname.substr(this.webUrlPath.length));
            }
            return null; /* Interwiki link? -- return null */
        }
        catch (error) {
            console.error("Unable to parse href " + href);
            return null;
        }
    };
    return MediaWiki;
}());
exports.default = MediaWiki;
