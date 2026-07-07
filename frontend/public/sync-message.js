"use strict";
// From https://github.com/alexmojaki/sync-message/blob/master/lib/index.ts
// Under MIT license, vendored for mopsa-emcc.
var exports = {};
self.syncMessage = exports;
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
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
var exports = {};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uuidv4 = exports.syncSleep = exports.readMessage = exports.makeServiceWorkerChannel = exports.makeAtomicsChannel = exports.makeChannel = exports.writeMessage = exports.writeMessageServiceWorker = exports.writeMessageAtomics = exports.ServiceWorkerError = exports.asyncSleep = exports.serviceWorkerFetchListener = exports.isServiceWorkerRequest = void 0;
var BASE_URL_SUFFIX = "__SyncMessageServiceWorkerInput__";
var VERSION = "__sync-message-v2__";
/**
 * Checks whether the given request is meant to be intercepted by the sync-message serviceWorkerFetchListener.
 */
function isServiceWorkerRequest(request) {
    if (typeof request !== "string") {
        request = request.request.url;
    }
    return request.includes(BASE_URL_SUFFIX);
}
exports.isServiceWorkerRequest = isServiceWorkerRequest;
/**
 * Returns a function that can respond to fetch events in a service worker event listener.
 * The function returns true if the request came from this library and it responded.
 * Call `serviceWorkerFetchListener` and reuse the returned function as it manages internal state.
 */
function serviceWorkerFetchListener() {
    var earlyMessages = {};
    var resolvers = {};
    return function (e) {
        var url = e.request.url;
        if (!isServiceWorkerRequest(url)) {
            return false;
        }
        function respond() {
            return __awaiter(this, void 0, void 0, function () {
                function success(message) {
                    var response = { message: message, version: VERSION };
                    return new Response(JSON.stringify(response), { status: 200 });
                }
                var _a, messageId_1, timeout_1, message, _b, message, messageId, resolver;
                return __generator(this, function (_c) {
                    switch (_c.label) {
                        case 0:
                            if (!url.endsWith("/read")) return [3 /*break*/, 5];
                            return [4 /*yield*/, e.request.json()];
                        case 1:
                            _a = _c.sent(), messageId_1 = _a.messageId, timeout_1 = _a.timeout;
                            if (!(messageId_1 in earlyMessages)) return [3 /*break*/, 2];
                            message = earlyMessages[messageId_1];
                            delete earlyMessages[messageId_1];
                            return [2 /*return*/, success(message)];
                        case 2: return [4 /*yield*/, new Promise(function (resolver) {
                                resolvers[messageId_1] = resolver;
                                function callback() {
                                    delete resolvers[messageId_1];
                                    resolver(new Response("", { status: 408 })); // timeout
                                }
                                setTimeout(callback, timeout_1);
                            })];
                        case 3: return [2 /*return*/, _c.sent()];
                        case 4: return [3 /*break*/, 8];
                        case 5:
                            if (!url.endsWith("/write")) return [3 /*break*/, 7];
                            return [4 /*yield*/, e.request.json()];
                        case 6:
                            _b = _c.sent(), message = _b.message, messageId = _b.messageId;
                            resolver = resolvers[messageId];
                            if (resolver) {
                                resolver(success(message));
                                delete resolvers[messageId];
                            }
                            else {
                                earlyMessages[messageId] = message;
                            }
                            return [2 /*return*/, success({ early: !resolver })];
                        case 7:
                            if (url.endsWith("/version")) {
                                return [2 /*return*/, new Response(VERSION, { status: 200 })];
                            }
                            _c.label = 8;
                        case 8: return [2 /*return*/];
                    }
                });
            });
        }
        e.respondWith(respond());
        return true;
    };
}
exports.serviceWorkerFetchListener = serviceWorkerFetchListener;
/**
 * Convenience function that allows writing `await asyncSleep(1000)`
 * to wait one second before continuing in an async function.
 */
function asyncSleep(ms) {
    return new Promise(function (resolve) { return setTimeout(resolve, ms); });
}
exports.asyncSleep = asyncSleep;
var ServiceWorkerError = /** @class */ (function (_super) {
    __extends(ServiceWorkerError, _super);
    function ServiceWorkerError(url, status) {
        var _this = _super.call(this, "Received status ".concat(status, " from ").concat(url, ". Ensure the service worker is registered and active.")) || this;
        _this.url = url;
        _this.status = status;
        // To avoid having to use instanceof
        _this.type = "ServiceWorkerError";
        // See https://github.com/Microsoft/TypeScript/wiki/Breaking-Changes#extending-built-ins-like-error-array-and-map-may-no-longer-work for info about this workaround.
        Object.setPrototypeOf(_this, ServiceWorkerError.prototype);
        return _this;
    }
    return ServiceWorkerError;
}(Error));
exports.ServiceWorkerError = ServiceWorkerError;
function writeMessageAtomics(channel, message) {
    var encoder = new TextEncoder();
    var bytes = encoder.encode(JSON.stringify(message));
    var data = channel.data, meta = channel.meta;
    if (bytes.length > data.length) {
        throw new Error("Message is too big, increase bufferSize when making channel.");
    }
    data.set(bytes, 0);
    Atomics.store(meta, 0, bytes.length);
    Atomics.store(meta, 1, 1);
    Atomics.notify(meta, 1);
}
exports.writeMessageAtomics = writeMessageAtomics;
function writeMessageServiceWorker(channel, message, messageId) {
    return __awaiter(this, void 0, void 0, function () {
        var url, startTime, request, response, _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, navigator.serviceWorker.ready];
                case 1:
                    _b.sent();
                    url = channel.baseUrl + "/write";
                    startTime = Date.now();
                    _b.label = 2;
                case 2:
                    if (!true) return [3 /*break*/, 8];
                    request = { message: message, messageId: messageId };
                    return [4 /*yield*/, fetch(url, {
                            method: "POST",
                            body: JSON.stringify(request),
                        })];
                case 3:
                    response = _b.sent();
                    _a = response.status === 200;
                    if (!_a) return [3 /*break*/, 5];
                    return [4 /*yield*/, response.json()];
                case 4:
                    _a = (_b.sent()).version === VERSION;
                    _b.label = 5;
                case 5:
                    if (_a) {
                        return [2 /*return*/];
                    }
                    if (!(Date.now() - startTime < channel.timeout)) return [3 /*break*/, 7];
                    return [4 /*yield*/, asyncSleep(100)];
                case 6:
                    _b.sent();
                    return [3 /*break*/, 2];
                case 7: throw new ServiceWorkerError(url, response.status);
                case 8: return [2 /*return*/];
            }
        });
    });
}
exports.writeMessageServiceWorker = writeMessageServiceWorker;
/**
 * Call this in the browser's main UI thread
 * to send a message to the worker reading from the channel with `readMessage`.
 *
 * @param channel a non-null object returned by `makeChannel`, `makeAtomicsChannel`, or `makeServiceWorkerChannel`.
 * @param message any object that can be safely passed to `JSON.stringify` and then decoded with `JSON.parse`.
 * @param messageId a unique string identifying the message that the worker is waiting for.
 *                  Currently only used by service worker channels.
 */
function writeMessage(channel, message, messageId) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!(channel.type === "atomics")) return [3 /*break*/, 1];
                    writeMessageAtomics(channel, message);
                    return [3 /*break*/, 3];
                case 1: return [4 /*yield*/, writeMessageServiceWorker(channel, message, messageId)];
                case 2:
                    _a.sent();
                    _a.label = 3;
                case 3: return [2 /*return*/];
            }
        });
    });
}
exports.writeMessage = writeMessage;
/**
 * Accepts one optional argument `options` with optional keys for configuring the different types of channel.
 * See the types `AtomicsChannelOptions` and `ServiceWorkerChannelOptions` for more info.
 *
 * If `SharedArrayBuffer` is available, `makeChannel` will use it to create an `atomics` type channel.
 * Otherwise, if `navigator.serviceWorker` is available, it will create a `serviceWorker` type channel,
 * but registering the service worker is up to you.
 * If that's not available either, it'll return `null`.
 *
 * Channel objects have a `type` property which is either `"atomics"` or `"serviceWorker"`.
 * The other properties are for internal use.
 *
 * If you want to control the type of channel,
 * you can call `makeAtomicsChannel` or `makeServiceWorkerChannel` directly.
 *
 * A single channel object shouldn't be used by multiple workers simultaneously,
 * i.e. you should only read/write one message at a time.
 */
function makeChannel(options) {
    if (options === void 0) { options = {}; }
    if (typeof SharedArrayBuffer !== "undefined") {
        return makeAtomicsChannel(options.atomics);
    }
    else if ("serviceWorker" in navigator) {
        return makeServiceWorkerChannel(options.serviceWorker);
    }
    else {
        return null;
    }
}
exports.makeChannel = makeChannel;
function makeAtomicsChannel(_a) {
    var _b = _a === void 0 ? {} : _a, bufferSize = _b.bufferSize;
    var data = new Uint8Array(new SharedArrayBuffer(bufferSize || 128 * 1024));
    var meta = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2));
    return { type: "atomics", data: data, meta: meta };
}
exports.makeAtomicsChannel = makeAtomicsChannel;
function makeServiceWorkerChannel(options) {
    if (options === void 0) { options = {}; }
    var baseUrl = (options.scope || "/") + BASE_URL_SUFFIX;
    return { type: "serviceWorker", baseUrl: baseUrl, timeout: options.timeout || 5000 };
}
exports.makeServiceWorkerChannel = makeServiceWorkerChannel;
function ensurePositiveNumber(n, defaultValue) {
    return n > 0 ? +n : defaultValue;
}
/**
 * Call this in a web worker to synchronously receive a message sent by the main thread with `writeMessage`.
 *
 * @param channel a non-null object returned by `makeChannel`, `makeAtomicsChannel`, or `makeServiceWorkerChannel`.
 *                Should be created once in the main thread and then sent to the worker.
 * @param messageId a unique string identifying the message that the worker is waiting for.
 *                  Currently only used by service worker channels.
 *                  Typically created in the worker using the `uuidv4` function and then sent to the main thread
 *                  *before* calling `readMessage`.
 * @param checkInterrupt a function which may be called regularly while `readMessage`
 *                       is checking for messages on the channel.
 *                       If it returns `true`, then `readMessage` will return `null`.
 * @param timeout a number of milliseconds.
 *                If this much time elapses without receiving a message, `readMessage` will return `null`.
 */
function readMessage(channel, messageId, _a) {
    var _b = _a === void 0 ? {} : _a, checkInterrupt = _b.checkInterrupt, checkTimeout = _b.checkTimeout, timeout = _b.timeout;
    var startTime = performance.now();
    checkTimeout = ensurePositiveNumber(checkTimeout, checkInterrupt ? 100 : 5000);
    var totalTimeout = ensurePositiveNumber(timeout, Number.POSITIVE_INFINITY);
    var check;
    if (channel.type === "atomics") {
        var data_1 = channel.data, meta_1 = channel.meta;
        check = function () {
            if (Atomics.wait(meta_1, 1, 0, checkTimeout) === "timed-out") {
                return null;
            }
            else {
                var size = Atomics.exchange(meta_1, 0, 0);
                var bytes = data_1.slice(0, size);
                Atomics.store(meta_1, 1, 0);
                var decoder = new TextDecoder();
                var text = decoder.decode(bytes);
                return JSON.parse(text);
            }
        };
    }
    else {
        check = function () {
            var request = new XMLHttpRequest();
            // `false` makes the request synchronous
            var url = channel.baseUrl + "/read";
            request.open("POST", url, false);
            var requestBody = {
                messageId: messageId,
                timeout: checkTimeout,
            };
            request.send(JSON.stringify(requestBody));
            var status = request.status;
            if (status === 408) {
                return null;
            }
            else if (status === 200) {
                var response = JSON.parse(request.responseText);
                if (response.version !== VERSION) {
                    return null;
                }
                return response.message;
            }
            else if (performance.now() - startTime < channel.timeout) {
                return null;
            }
            else {
                throw new ServiceWorkerError(url, status);
            }
        };
    }
    while (true) {
        var elapsed = performance.now() - startTime;
        var remaining = totalTimeout - elapsed;
        if (remaining <= 0) {
            return null;
        }
        checkTimeout = Math.min(checkTimeout, remaining);
        var result = check();
        if (result !== null) {
            return result;
        }
        else if (checkInterrupt === null || checkInterrupt === void 0 ? void 0 : checkInterrupt()) {
            return null;
        }
    }
}
exports.readMessage = readMessage;
/**
 * Synchronously waits until the given time has elapsed without wasting CPU in a busy loop,
 * but not very accurate.
 */
function syncSleep(ms, channel) {
    ms = ensurePositiveNumber(ms, 0);
    if (!ms) {
        return;
    }
    if (typeof SharedArrayBuffer !== "undefined") {
        var arr = new Int32Array(new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT));
        arr[0] = 0;
        Atomics.wait(arr, 0, 0, ms);
    }
    else {
        var messageId = "sleep ".concat(ms, " ").concat((0, exports.uuidv4)());
        readMessage(channel, messageId, { timeout: ms });
    }
}
exports.syncSleep = syncSleep;
if ("randomUUID" in crypto) {
    exports.uuidv4 = function uuidv4() {
        return crypto.randomUUID();
    };
}
else {
    // https://stackoverflow.com/a/2117523/2482744
    exports.uuidv4 = function uuidv4() {
        return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, function (char) {
            var c = Number(char);
            return (c ^
                (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16);
        });
    };
}
// Re-export the fully-populated module object as the `syncMessage` global,
// for both the worker (importScripts) and the main thread (<script>).
self.syncMessage = exports;
