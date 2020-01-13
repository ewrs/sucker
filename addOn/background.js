
/* global browser */

const _ = browser.i18n.getMessage;
const listenerFilter = {
    urls: [
        "*://*/*.m3u8",
        "*://*/*.m3u8?*"
    ]
};

const BADGE_COLOR = {
    BUSY: "Coral",
    NEW: "Gold",
    IDLE: "LightSkyBlue",
    INACTIVE: "White"
};

const JOB_STATE = {
    WAITING: 0,
    RUNNING: 1,
    READY: 2,
    STOPPED: 3,
    ERROR: 4,
    PURGED: 5
};

const TOPIC = {
    APP: {
        IN: {
            INFO: "info",
            PROGRESS: "progress",
            LIST: "list",
            HOME: "home"},
        OUT: {
            INFO: "info",
            ACTION: "action",
            DOWNLOAD: "download",
            LIST: "list",
            HOME: "home",
            SET: "set"}},
    OPTIONS: {
        IN: {
            OPTIONS_INIT: "options-init",
            OPTIONS_UPDATE: "options-update"
        },
        OUT: {
            OPTIONS: "options"
        }},
    POPUP: {
        IN: {
            INIT: "init",
            OPTIONS_INIT: "options-init",
            OPTIONS_UPDATE: "options-update",
            SELECT: "select",
            ACTION: "action",
            PURGE: "purge",
            LIST: "list",
            PLAY: "play"},
        OUT: {
            SNIFFER: "sniffer.init",
            DOWNLOAD_INIT: "download-init",
            DOWNLOAD: "download",
            OPTIONS: "options",
            LIST: "list"}}};

// The select list contains items like:
// tabId:    requestDetails.tabId
// page:     requestDetails.originUrl
// image:    <url of a thumbnail>
// title:    <human readable film title>
// programs: {}
let selectList = new Map();

// The download list contains items like:
// image:    <url of a thumbnail>
// title:    <human readable film title>
// duration: selectItem.programs.duration,
// url:      <stream url> .m3u8
// filename: <full path of the output file>
// state:    JOB_STATE
// progress: <job progress an a scale from 0 to 1000>
// message:  <error message>
let downloadList = new Map();

let jobId = 0;
let isBusy = false;

browser.browserAction.setTitle({title: _("MyName")});

// Connect to the "suckerApp".
let port2app = browser.runtime.connectNative("suckerApp");

// Hold connection from the popup.
let port2popup = undefined;

// Hold connection from the options.
let port2options = undefined;

// Load options
var options = {};
browser.storage.local.get().then((result) => {
    var value = result.active;
    setActive(typeof (value) !== 'undefined' ? value : true);

    options.outdir = result.outdir;
    if (typeof (options.outdir) === 'undefined') {
        port2app.postMessage({topic: TOPIC.APP.OUT.HOME});
    }

    value = result.preferredResolution;
    options.preferredResolution = typeof (value) !== 'undefined' ? value : 1920;

    value = result.parallelDownloads;
    options.parallelDownloads = typeof (value) !== 'undefined' ? value : 3;
    port2app.postMessage({
        topic: TOPIC.APP.OUT.SET,
        data: {"max-threads": options.parallelDownloads}});
});

//==============================================================================

function setActive(value) {
    if (value) {
        browser.webRequest.onSendHeaders
                .addListener(addURL, listenerFilter, ["requestHeaders"]);
    } else {
        browser.webRequest.onSendHeaders.removeListener(addURL);
    }
    options.active = value;
    updateBadge();
}

// Probing the master playlist usually takes some time...
function setBusy(busy) {
    isBusy = busy;
    updateBadge();
}

function countPendingJobs() {
    return Array.from(downloadList.values()).filter((e) =>
        [JOB_STATE.WAITING, JOB_STATE.RUNNING].includes(e.state)).length;
}

// Update the activity indicator.
function updateBadge() {
    browser.browserAction.setBadgeText({text: countPendingJobs().toString()});
    if (!options.active) {
        browser.browserAction.setBadgeBackgroundColor({color: BADGE_COLOR.INACTIVE});
    } else if (isBusy) {
        browser.browserAction.setBadgeBackgroundColor({color: BADGE_COLOR.BUSY});
    } else if (selectList.size > 0) {
        browser.browserAction.setBadgeBackgroundColor({color: BADGE_COLOR.NEW});
    } else {
        browser.browserAction.setBadgeBackgroundColor({color: BADGE_COLOR.IDLE});
    }
}

// Prevent doubles in the selectList. Prefer master over substreams.
// This has to be called after the stream info has been delivered from the app.
function verifyInsert(id, newObj) {
    for (let [k, v] of selectList) {
        if (v.programs === undefined) {
            continue;
        }
        if (k !== id && v.programs.master === newObj.programs.master) {
            selectList.delete(id);
            return;
        }
        if (v.programs.list.find(prg => prg.url === newObj.programs.master) !== undefined) {
            selectList.delete(id);
            return;
        }
        if (newObj.programs.list.find(prg => prg.url === v.programs.master) !== undefined) {
            selectList.delete(k);
            verifyInsert(id, newObj);
            return;
        }
    }
}

// The core of the sniffer.
function addURL(requestDetails) {
    const url = new URL(requestDetails.url);
    const file = url.pathname.replace(/.*\//, "");

    for (let [k, v] of selectList) {
        if (v.programs === undefined) {
            continue;
        }
        const o1 = v.programs.list.find(prg => prg.url === url.href);
        if (v.programs.master === url.href || o1 !== undefined) {
            return;
        }
    }

    setBusy(true);

    const id = ++jobId;
    var sel = {
        tabId: requestDetails.tabId,
        page: requestDetails.originUrl};

    selectList.set(id, sel);
    port2app.postMessage({
        id: id,
        topic: TOPIC.APP.OUT.INFO,
        data: {"url": url.href}});

    browser.tabs.executeScript({code: `document.querySelector("head > meta[property='og:title']").content`})
            .then((title) => sel.title = title);

    browser.tabs.executeScript({code: `document.querySelector("head > meta[property='og:image']").content`})
            .then((image) => sel.image = image);
}

function updateDownload(id, data) {
    var item = downloadList.get(parseInt(id));
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
            item.message = data.message;
            break;
        case "purged":
            downloadList.delete(parseInt(id));
            state = JOB_STATE.PURGED;
            break;
    }

    if (state > 0 && item.state !== state) {
        if (state !== JOB_STATE.ERROR || data.message === null) {
            item.message = null;
        }
        item.state = state;
        updateBadge();
    }
    return item;
}

// Listen to messages from the app.
port2app.onDisconnect.addListener((p) => {
    if (p.error) {
        console.log(`Disconnected due to an error: ${p.error.message}`);
    }
});
port2app.onMessage.addListener((m) => {
//    console.log("Background got message from app", m);
    switch (m.topic) {
        case TOPIC.APP.IN.INFO:
            if (m.programs === null) {
                selectList.delete(m.id);
            } else {
                var selectItem = selectList.get(m.id);
                selectItem.programs = m.programs;
                verifyInsert(m.id, selectItem);
            }
            if (port2popup !== undefined) {
                port2popup.postMessage({
                    topic: TOPIC.POPUP.OUT.SNIFFER,
                    data: selectList});
            }
            setBusy(false);
            break;
        case TOPIC.APP.IN.PROGRESS:
            var downloadItem = updateDownload(m.id, m.data);
            if (port2popup !== undefined) {
                port2popup.postMessage({
                    id: m.id,
                    topic: TOPIC.POPUP.OUT.DOWNLOAD,
                    data: downloadItem});
            }
            break;
        case TOPIC.APP.IN.LIST:
            if (port2popup !== undefined) {
                port2popup.postMessage({
                    topic: TOPIC.POPUP.OUT.LIST,
                    list: m.list});
            }
            break;
        case TOPIC.APP.IN.HOME:
            if (typeof (options.outdir) === 'undefined' || options.outdir === null || options.outdir === "") {
                options.outdir = decodeURIComponent(escape(m.list[0]));
                browser.storage.local.set(options);
            }
            break;
    }
});

browser.runtime.onConnect.addListener((p) => {
    if (p.name === "port2options") {
        // Listen to messages from the options.
        port2options = p;
        p.onMessage.addListener((m) => {
//        console.log("Background got message from options", m);
            switch (m.topic) {
                case TOPIC.OPTIONS.IN.OPTIONS_UPDATE:
                    if (typeof (m.data.active) !== 'undefined') {
                        setActive(m.data.active);
                    }
                    if (typeof (m.data.preferredResolution) !== 'undefined') {
                        options.preferredResolution = m.data.preferredResolution;
                    }
                    if (typeof (m.data.parallelDownloads) !== 'undefined') {
                        options.parallelDownloads = m.data.parallelDownloads;
                        port2app.postMessage({
                            topic: "set",
                            data: {"max-threads": options.parallelDownloads}});
                    }
                    browser.storage.local.set(options);
                    // fall through
                case TOPIC.OPTIONS.IN.OPTIONS_INIT:
                    if (typeof (port2options) !== 'undefined') {
                        port2options.postMessage({
                            topic: TOPIC.POPUP.OUT.OPTIONS,
                            data: options});
                    }
                    break;
            }
        });
    } else if (p.name === "port2popup") {
        // Listen to messages from the popup.
        port2popup = p;

        p.onMessage.addListener((m) => {
//        console.log("Background got message from popup", m);
            switch (m.topic) {
                case TOPIC.POPUP.IN.INIT:
                    if (typeof (port2popup) !== 'undefined') {
                        port2popup.postMessage({
                            topic: TOPIC.POPUP.OUT.SNIFFER,
                            data: selectList});
                        port2popup.postMessage({
                            topic: TOPIC.POPUP.OUT.DOWNLOAD_INIT,
                            data: downloadList});
                    }
                    break;
                case TOPIC.POPUP.IN.ACTION:
                case TOPIC.POPUP.IN.PURGE:
                case TOPIC.POPUP.IN.PLAY:
                    port2app.postMessage(m);
                    break;
                case TOPIC.POPUP.IN.OPTIONS_UPDATE:
                    if (typeof (m.data.active) !== 'undefined') {
                        setActive(m.data.active);
                    }
                    if (typeof (m.data.outdir) !== 'undefined') {
                        options.outdir = m.data.outdir;
                    }
                    browser.storage.local.set(options);
                    // fall through
                case TOPIC.POPUP.IN.OPTIONS_INIT:
                    if (typeof (port2popup) !== 'undefined') {
                        port2popup.postMessage({
                            topic: TOPIC.POPUP.OUT.OPTIONS,
                            data: options});
                    }
                    break;
                case TOPIC.POPUP.IN.LIST:
                    port2app.postMessage({
                        topic: TOPIC.APP.OUT.LIST,
                        data: {root: m.root}});
                    break;
                case TOPIC.POPUP.IN.SELECT:
                    var selectItem = selectList.get(m.id);
                    var downloadId = ++jobId;
                    var downloadItem = {
                        state: JOB_STATE.WAITING,
                        progress: 0,
                        url: m.url,
                        filename: unescape(decodeURIComponent(m.filename)),
                        duration: selectItem.programs.duration,
                        title: selectItem.title,
                        image: selectItem.image};

                    downloadList.set(downloadId, downloadItem);
                    updateBadge();

                    if (typeof (port2popup) !== 'undefined') {
                        port2popup.postMessage({
                            id: downloadId,
                            topic: TOPIC.POPUP.OUT.DOWNLOAD,
                            data: downloadItem});
                    }

                    port2app.postMessage({
                        id: downloadId,
                        topic: TOPIC.APP.OUT.DOWNLOAD,
                        data: {
                            url: downloadItem.url,
                            filename: downloadItem.filename}});
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
    let clean;
    do {
        clean = true;
        for (let [k, v] of selectList) {
            if (v.tabId === tabId) {
                selectList.delete(k);
                clean = false; // Iterator is compromised.
                break;
            }
        }
    } while (!clean);

    updateBadge(); // For color change on list empty.
}
