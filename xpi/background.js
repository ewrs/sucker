
/* global browser */
/* global APP_ERROR */
/* global JOB_STATE */
/* global TOPIC */

const listenerFilter = {};
{
    let filterTypes = ["m3u8", "mp4", "mp3"];
    listenerFilter.urls = new Array(2 * filterTypes.length);
    for (let i = 0; i < filterTypes.length; i++) {
        let url = "*://*/*." + filterTypes[i];
        listenerFilter.urls[i * 2] = url;
        listenerFilter.urls[i * 2 + 1] = url + "?*";
    }
}

let options = {
    minAppVersion: "0.6.0",
    appError: APP_ERROR.NONE,
    appVersion: "",
    bookmarks: "",
    outdir: "",
    preferredResolution: 1920,
    parallelDownloads: 3,
    downloadList: new Map()
};
// The download list contains items like:
// page:     <url of the web page>
// image:    <url of a thumbnail>
// title:    <human readable film title>
// duration: selectItem.programs.duration,
// codec:    selectItem.programs.codec,
// protocol: 'hls' or nothing. Nothing means file download.
// url:      <stream url> .m3u8
// filename: <full path of the output file>
// state:    JOB_STATE
// progress: <job progress an a scale from 0 to 1000>
// error:    <error message>

let selectList = new Map();
// The select list contains items like:
// tabId:    requestDetails.tabId
// page:     requestDetails.originUrl
// image:    <url of a thumbnail>
// title:    <human readable film title>
// filename: <auto generated file name>
// programs: {}

let jobId = 0;
let isBusy = 0;

let currentItems = 0;
let currentTab = -1;

browser.browserAction.setTitle({title: _("MyName")});
browser.browserAction.setBadgeBackgroundColor({color: "darkorange"});

var port2app = undefined;
function connectApp() {
    port2app = browser.runtime.connectNative("suckerApp");
    port2app.onMessage.addListener(appMessageListener);
    port2app.onDisconnect.addListener(() => {
        options.appError = APP_ERROR.CONNECT;
        setActive();
    });
    port2app.postMessage({topic: TOPIC.VERSION});
}
connectApp();

function post2app(msg) {
    if (options.appError === APP_ERROR.NONE) {
        port2app.postMessage(msg);
    }
}

browser.windows.onFocusChanged.addListener((winId) => {
    if (options.appError !== APP_ERROR.NONE && winId > 0) {
        connectApp();
    }
});

browser.runtime.onUpdateAvailable.addListener(() => {
    if (selectList.size === 0 && options.downloadList.size === 0) {
        browser.runtime.reload();
    }
});

// Hold connection from the popup.
let port2popup = undefined;
function post2popup(msg) {
    if (port2popup !== undefined) {
        port2popup.postMessage(msg);
    }
}

// Hold connection from the options.
let port2options = undefined;
function post2options(msg) {
    if (port2options !== undefined) {
        port2options.postMessage(msg);
    }
}

function initOptions() {
    browser.storage.local.get().then((result) => {
        isUndefined(result.outdir)
                ? post2app({topic: TOPIC.HOME}) : options.outdir = result.outdir;

        options.preferredResolution = !isUndefined(result.preferredResolution)
                ? result.preferredResolution : options.preferredResolution;

        options.parallelDownloads = !isUndefined(result.parallelDownloads)
                ? result.parallelDownloads : options.parallelDownloads;
        post2app({topic: TOPIC.SET_OPTIONS,
            data: {"max-threads": options.parallelDownloads.toString()}});

        options.bookmarks = !isUndefined(result.bookmarks)
                ? result.bookmarks : options.bookmarks;

        options.downloadList = !isUndefined(result.downloadList)
                ? result.downloadList : options.downloadList;
        options.downloadList.forEach((value, key) => {
            if (value.state !== JOB_STATE.READY && value.duration !== "N/A") {
                value.state = JOB_STATE.WAITING;
                value.progress = 0;
                value.error = null;
                value.startTime = Date.now();
                post2app({
                    topic: TOPIC.DOWNLOAD,
                    data: {id: key.toString(), url: value.master, useragent: navigator.userAgent, maps: value.maps, filename: value.filename}});
                if (key > jobId) {
                    jobId = parseInt(key);
                }
            } else {
                options.downloadList.delete(parseInt(key));
            }
        });
    });
}

//==============================================================================

function setActive() {
    (options.appError === APP_ERROR.NONE)
            ? browser.webRequest.onSendHeaders.addListener(addURL, listenerFilter, ["requestHeaders"])
            : browser.webRequest.onSendHeaders.removeListener(addURL);
    updateIcon();
}

// Probing the master playlist usually takes some time...
function setBusy(busy) {
    isBusy += ((busy) ? 1 : -1);
    updateIcon();
}

function countPendingJobs() {
    return Array.from(options.downloadList.values()).filter((e) =>
        [JOB_STATE.WAITING, JOB_STATE.RUNNING].includes(e.state)).length;
}

function updateIcon() {
    const n = countPendingJobs();
    browser.browserAction.setBadgeText({text: n === 0 ? "" : n.toString()});

    if (options.appError !== APP_ERROR.NONE) {
        browser.browserAction.setIcon({path: "data/sucker-error.svg"});
    } else if (isBusy > 0) {
        browser.browserAction.setIcon({path: "data/sucker-busy.svg"});
    } else if (currentItems > 0) {
        browser.browserAction.setIcon({path: "data/sucker-new.svg"});
    } else {
        browser.browserAction.setIcon({path: "data/sucker-idle.svg"});
    }
}

// Consider two durations as equal, even if there's a difference of 1 in the last digit.
function sameLength(t1, t2) {
    return Math.abs(parseInt(t1.replace(/:/g, "")) - parseInt(t2.replace(/:/g, ""))) < 2;
}

function getPath(urlString) {
    return new URL(urlString).pathname;
}

// Prevent doubles in the selectList. Prefer master over details.
// This has to be called after the stream info has been delivered from the app.
function verifyInsert(id, newObj) {
    const newObjMasterPath = getPath(newObj.programs.master);
    const newObjMasterExt = newObjMasterPath.replace(/.*\./, "");

    for (let [k, v] of selectList) {
        if (isUndefined(v) || isUndefined(v.programs) || isUndefined(k) || (k === id)) {
            // uninitialized item or same id -> nothing to do
            continue;
        }
        const vMasterPath = getPath(v.programs.master);
        if (vMasterPath === newObjMasterPath) {
            // new item's master url already exists -> kill new item
            selectList.delete(id);
//            console.log("verifyInsert deleted item", newObj, "for", v, "by rule #1");
        } else if (newObjMasterExt === "m3u8") {
            newObj.programs.protocol = "hls";
            if (v.programs.manifest.includes(newObjMasterPath) || newObj.programs.list.length === 1) {
                // new item's master url is already in old item's program list -> kill new item
                selectList.delete(id);
//                console.log("verifyInsert deleted item", newObj, "for", v, "by rule #2");
                continue;
            } else if (newObj.programs.manifest.includes(vMasterPath)) {
                // old item's master url is part of new item's program list -> kill old item
                selectList.delete(k);
//                console.log("verifyInsert deleted item", v, "for", newObj, "by rule #3");
            } else {
                // a program is in more than one item's program list -> kill an item with a single program if that is the case
                const arrOld = v.programs.manifest;
                const arrNew = newObj.programs.manifest;
                if (arrOld.some(item => arrNew.includes(item)) && (v.programs.list.length === 1 || newObj.programs.list.length === 1)) {
                    const victim = v.programs.list.length >= newObj.programs.list.length ? newObj : v;
                    selectList.delete(victim === v ? k : id);
//                    console.log("verifyInsert deleted item", victim, "for", victim === v ? newObj : v, "by rule #4");
                }
            }
        } else if (newObj.programs.list.length === 1 && newObj.page === v.page
                && sameLength(v.programs.duration, newObj.programs.duration) && v.programs.codec === newObj.programs.codec) {
            // try to join nonHLS video programs
            delete newObj.programs.list[0].maps;
            newObj.programs.list[0].url = newObj.programs.master;
            if (isUndefined(v.programs.list.find(e => e.resolution === newObj.programs.list[0].resolution))) {
                if (isUndefined(v.programs.list[0].url)) {
                    delete v.programs.list[0].maps;
                    v.programs.list[0].url = v.programs.master;
                }
                v.programs.list.push(newObj.programs.list[0]);
                v.programs.list.sort(function (a, b) {
                    x1 = ("00000" + a.resolution.split("x")[0]).substr(-5);
                    x2 = ("00000" + b.resolution.split("x")[0]).substr(-5);
                    return x1 === x2 ? 0 : x1 < x2 ? 1 : -1;
                });
            }
            selectList.delete(id);
        }
    }
}

function comparableVersion(v) {
    var res = "";
    var a = v.split(".");
    for (let i = 0; i < a.length; i++) {
        res += ("000" + a[i]).slice(-3);
    }
    return (res + "000000000").substr(0, 9);
}

function appVersionOutdated() {
    return comparableVersion(options.appVersion) < comparableVersion(options.minAppVersion);
}

// The core of the sniffer.
function addURL(requestDetails) {
    const url = new URL(requestDetails.url);

    for (let [k, v] of selectList) {
        if (isUndefined(v.programs)) {
            continue;
        }
        if (v.programs.master === url.href || v.programs.manifest.includes(url.pathname)) {
            return;
        }
    }

    setBusy(true);

    const id = ++jobId;
    var sel = {tabId: requestDetails.tabId, page: requestDetails.originUrl};
    selectList.set(id, sel);
    post2app({topic: TOPIC.PROBE, data: {id: id.toString(), url: url.href, useragent: navigator.userAgent}});

    browser.tabs.executeScript(requestDetails.tabId,
            {code: `document.querySelector("head > meta[property='og:title']").content`})
            .then((title) => sel.title = title);

    browser.tabs.executeScript(requestDetails.tabId,
            {code: `document.querySelector("head > meta[property='og:image']").content`})
            .then((image) => sel.image = image);
}

function updateDownload(data) {
    var item = options.downloadList.get(parseInt(data.id));
    item.progress = parseInt(data.progress);
    var state = -1;
    switch (data.state) {
        case "waiting":
            state = JOB_STATE.WAITING;
            break;
        case "running":
            state = JOB_STATE.RUNNING;
            break;
        case "ready":
            state = JOB_STATE.READY;
            break;
        case "stopped":
            state = JOB_STATE.STOPPED;
            break;
        case "error":
            state = JOB_STATE.ERROR;
            item.error = data.error;
            break;
        case "purged":
            options.downloadList.delete(parseInt(data.id));
            state = JOB_STATE.PURGED;
            break;
    }

    if (state > 0 && item.state !== state) {
        if (state !== JOB_STATE.ERROR || data.error === null) {
            item.error = null;
        }
        item.state = state;
        browser.storage.local.set(options);
        updateIcon();
    }
    return item;
}

// Listen to messages from the app.
function appMessageListener(m) {
//    console.log("Background got message from app:", m);
    var id;
    switch (m.topic) {
        case TOPIC.PROBE:
            id = parseInt(m.data.id);
            var notify = false;
            if (m.data.programs === null) {
                selectList.delete(id);
            } else {
                var selectItem = selectList.get(id);
                if (selectItem !== undefined) {
                    var a = m.data.programs.manifest.split(" ");
                    m.data.programs.manifest = (a.length === 1 && a[0] === "") ? [] : a;
                    selectItem.programs = m.data.programs;
                    verifyInsert(id, selectItem);
                    notify = selectItem.programs.list.length > 1;
                }
            }
            setBusy(false);
            if (isBusy === 0 || notify) {
                initSniffer();
            }
            break;
        case TOPIC.DOWNLOAD:
            id = parseInt(m.data.id);
            post2popup({id: id, topic: m.topic, data: updateDownload(m.data)});
            break;
        case TOPIC.SUBFOLDERS:
        case TOPIC.EXISTS:
            post2popup(m);
            break;
        case TOPIC.HOME:
            options.outdir = m.data.home;
            browser.storage.local.set(options);
            break;
        case TOPIC.VERSION:
            options.appVersion = m.data.version;
            if (appVersionOutdated()) {
                options.appError = APP_ERROR.VERSION;
                port2app.disconnect();
            } else {
                options.appError = APP_ERROR.NONE;
                initOptions();
            }
            setActive();
            post2options({topic: TOPIC.GET_OPTIONS, data: options});
            break;
    }
}

browser.runtime.onConnect.addListener((p) => {
    if (p.name === "port2options") {
        // Listen to messages from the options.
        port2options = p;
        p.onMessage.addListener((m) => {
//        console.log("Background got message from options:", m);
            switch (m.topic) {
                case TOPIC.SET_OPTIONS:
                    if (!isUndefined(m.data.preferredResolution)) {
                        options.preferredResolution = m.data.preferredResolution;
                    }
                    if (!isUndefined(m.data.parallelDownloads)) {
                        options.parallelDownloads = m.data.parallelDownloads;
                        post2app({topic: m.topic, data: {"max-threads": options.parallelDownloads}});
                    }
                    browser.storage.local.set(options);
                    // fall through
                case TOPIC.GET_OPTIONS:
                    post2options({topic: TOPIC.GET_OPTIONS, data: options});
                    break;
            }
        });

        p.onDisconnect.addListener(() => {
            port2options = undefined;
        });
    } else if (p.name === "port2popup") {
        // Listen to messages from the popup.
        port2popup = p;

        p.onMessage.addListener((m) => {
//            console.log("Background got message from popup:", m);
            switch (m.topic) {
                case TOPIC.INIT_SNIFFER:
                    var hasMaster = false;
                    for (let v of selectList.values()) {
                        hasMaster |= !isUndefined(v) && !isUndefined(v.programs) && !isUndefined(v.programs.list) && v.programs.list.length > 1;
                    }
                    if (isBusy === 0 || hasMaster) {
                        initSniffer();
                    }
                    break;
                case TOPIC.INIT_DOWNLOADS:
                    post2popup({topic: m.topic, data: options.downloadList});
                    break;
                case TOPIC.ACTION:
                case TOPIC.PURGE:
                case TOPIC.PLAY:
                case TOPIC.SUBFOLDERS:
                case TOPIC.MKDIRS:
                    post2app(m);
                    break;
                case TOPIC.SET_OPTIONS:
                    if (!isUndefined(m.data.outdir)) {
                        options.outdir = m.data.outdir;
                    }
                    if (!isUndefined(m.data.bookmarks)) {
                        options.bookmarks = m.data.bookmarks;
                    }
                    browser.storage.local.set(options);
                    // fall through
                case TOPIC.GET_OPTIONS:
                    post2popup({topic: TOPIC.GET_OPTIONS, data: options});
                    break;
                case TOPIC.DOWNLOAD:
                    var selectItem = selectList.get(m.id);
                    var downloadId = ++jobId;
                    var downloadItem = {
                        state: JOB_STATE.WAITING,
                        progress: 0,
                        master: m.master,
                        maps: m.maps,
                        filename: m.filename,
                        duration: selectItem.programs.duration,
                        codec: selectItem.programs.codec,
                        protocol: selectItem.programs.protocol,
                        title: selectItem.title,
                        image: selectItem.image,
                        page: selectItem.page,
                        startTime: Date.now()};

                    options.downloadList.set(downloadId, downloadItem);
                    browser.storage.local.set(options);
                    updateIcon();

                    post2popup({id: downloadId, topic: m.topic, data: downloadItem});
                    post2app({topic: m.topic, data: {id: downloadId.toString(), url: m.master, useragent: navigator.userAgent, maps: m.maps, filename: downloadItem.filename}});
                    break;
                case TOPIC.EXISTS:
                    if (Array.from(options.downloadList.values()).filter(
                            e => e.filename === m.data.filename && e.state === JOB_STATE.WAITING).length > 0) {
                        port2popup.postMessage(
                                {topic: TOPIC.EXISTS, data: {id: m.data.id, exists: true}});
                        return;
                    }
                    post2app(m);
                    break;
            }
        });

        p.onDisconnect.addListener(() => {
            port2popup = undefined;
        });
    }
});

// Listen to tab URL changes. Kill zombies.
browser.tabs.onUpdated.addListener((tabId, changeInfo, tabInfo) => {
    if (changeInfo.url) {
        killZombies(tabId);
    }
});
browser.tabs.onRemoved.addListener((tabId, removeInfo) => {
    killZombies(tabId);
});
function killZombies(tabId) {
    for (let [k, v] of selectList) {
        if (v.tabId === tabId) {
            selectList.delete(k);
        }
    }
    if (tabId === currentTab) {
        initSniffer();
    }
}

// Update current tab id
browser.tabs.onActivated.addListener((activeInfo) => {
    currentTab = activeInfo.tabId;
    initSniffer();
});

// Only show sniffer list for current tab
function initSniffer() {
    let list = new Map();
    for (let [k, v] of selectList) {
        if (v.tabId === currentTab) {
            list.set(k, v);
        }
    }
    currentItems = list.size;
    post2popup({topic: TOPIC.INIT_SNIFFER, data: list});
    updateIcon();
}
