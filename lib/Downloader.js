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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var async = __importStar(require("async"));
var axios_1 = __importDefault(require("axios"));
var fs_1 = __importDefault(require("fs"));
var url_1 = __importDefault(require("url"));
function getPort(urlObj) {
    return urlObj.port || (urlObj.protocol && urlObj.protocol.substring(0, 5) === 'https' ? 443 : 80);
}
var Downloader = /** @class */ (function () {
    function Downloader(logger, mw, uaString, reqTimeout) {
        this.loginCookie = '';
        this.logger = logger;
        this.uaString = uaString;
        this.loginCookie = '';
        this.requestTimeout = reqTimeout;
        this.webUrlPort = getPort(url_1.default.parse("" + mw.base + mw.wikiPath + "/"));
    }
    Downloader.prototype.getRequestOptionsFromUrl = function (url, compression) {
        var headers = {
            'accept': 'text/html; charset=utf-8; profile="https://www.mediawiki.org/wiki/Specs/HTML/1.8.0"',
            'cache-control': 'public, max-stale=2678400',
            'accept-encoding': (compression ? 'gzip, deflate' : ''),
            'user-agent': this.uaString,
            'cookie': this.loginCookie,
        };
        return {
            url: url,
            headers: headers,
            responseType: 'arraybuffer',
            method: url.indexOf('action=login') > -1 ? 'POST' : 'GET',
        };
    };
    Downloader.prototype.downloadContent = function (url) {
        var _this = this;
        return new Promise(function (resolve, reject) {
            var responseHeaders = {};
            _this.logger.info("Downloading [" + decodeURI(url) + "]");
            async.retry(3, function (finished) { return __awaiter(_this, void 0, void 0, function () {
                var resp, err_1;
                return __generator(this, function (_a) {
                    switch (_a.label) {
                        case 0:
                            _a.trys.push([0, 2, , 3]);
                            return [4 /*yield*/, axios_1.default(this.getRequestOptionsFromUrl(url, true))];
                        case 1:
                            resp = _a.sent();
                            responseHeaders = resp.headers;
                            finished(null, resp.data);
                            return [3 /*break*/, 3];
                        case 2:
                            err_1 = _a.sent();
                            finished(url, err_1.stack);
                            return [3 /*break*/, 3];
                        case 3: return [2 /*return*/];
                    }
                });
            }); }, function (error, data) {
                if (error) {
                    _this.logger.error("Absolutely unable to retrieve async. URL: " + error);
                    reject(error);
                    /* Unfortunately, we can not do that because there are
                     * articles which simply will not be parsed correctly by
                     * Parsoid. For example this one
                     * http://parsoid-lb.eqiad.wikimedia.org/dewikivoyage/Via_Jutlandica/Gpx
                     * and this stops the whole dumping process */
                    // process.exit( 1 );
                }
                else {
                    resolve({ content: data, responseHeaders: responseHeaders });
                }
            });
        });
    };
    Downloader.prototype.downloadMediaFile = function (url, path, force, optQueue) {
        return __awaiter(this, void 0, void 0, function () {
            var _this = this;
            return __generator(this, function (_a) {
                return [2 /*return*/, new Promise(function (resolve, reject) {
                        if (!url || !path) {
                            resolve();
                            return;
                        }
                        var self = _this;
                        fs_1.default.stat(path, function (statError) { return __awaiter(_this, void 0, void 0, function () {
                            var _a, content, responseHeaders_1, err_2;
                            return __generator(this, function (_b) {
                                switch (_b.label) {
                                    case 0:
                                        if (!(statError && !force)) return [3 /*break*/, 1];
                                        reject(statError.code !== 'ENOENT' && statError ? "Impossible to stat() " + path + ":\n" + path + " already downloaded, download will be skipped." : undefined);
                                        return [3 /*break*/, 5];
                                    case 1:
                                        self.logger.info("Downloading " + decodeURI(url) + " at " + path + "...");
                                        _b.label = 2;
                                    case 2:
                                        _b.trys.push([2, 4, , 5]);
                                        return [4 /*yield*/, self.downloadContent(url)];
                                    case 3:
                                        _a = _b.sent(), content = _a.content, responseHeaders_1 = _a.responseHeaders;
                                        fs_1.default.writeFile(path, content, function (writeError) {
                                            if (writeError) {
                                                reject({ message: "Unable to write " + path + " (" + url + ")", error: writeError });
                                            }
                                            else {
                                                optQueue.push({ path: path, size: Number(responseHeaders_1['content-length']) });
                                                resolve();
                                            }
                                        });
                                        return [3 /*break*/, 5];
                                    case 4:
                                        err_2 = _b.sent();
                                        reject({ message: "Failed to get file: [" + url + "]", error: err_2 });
                                        return [3 /*break*/, 5];
                                    case 5: return [2 /*return*/];
                                }
                            });
                        }); });
                    })];
            });
        });
    };
    return Downloader;
}());
exports.default = Downloader;
