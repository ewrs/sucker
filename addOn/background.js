
/* global browser */
/* global JOB_STATE */

const listenerFilter = {
    urls: [
        "*://*/*.m3u8",
        "*://*/*.m3u8?*"
    ]
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
browser.browserAction.setBadgeBackgroundColor({color: "LightSkyBlue"});

// Connect to the "suckerApp".
let port2app = browser.runtime.connectNative("suckerApp");
function post2app(msg) {
    port2app.postMessage(msg);
}

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

// Load options
var options = {};
browser.storage.local.get().then((result) => {
    var value = result.active;
    setActive(!isUndefined(value) ? value : true);

    options.outdir = result.outdir;
    post2app({topic: TOPIC.APP.OUT.HOME});

    value = result.preferredResolution;
    options.preferredResolution = !isUndefined(value) ? value : 1920;

    value = result.parallelDownloads;
    options.parallelDownloads = !isUndefined(value) ? value : 3;
    post2app({topic: TOPIC.APP.OUT.SET, data: {"max-threads": options.parallelDownloads}});
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
    updateIcon();
}

// Probing the master playlist usually takes some time...
function setBusy(busy) {
    isBusy = busy;
    updateIcon();
}

function countPendingJobs() {
    return Array.from(downloadList.values()).filter((e) =>
        [JOB_STATE.WAITING, JOB_STATE.RUNNING].includes(e.state)).length;
}

function updateIcon() {
    const n = countPendingJobs();
    browser.browserAction.setBadgeText({text: n === 0 ? "" : n.toString()});

    if (!options.active) {
        browser.browserAction.setIcon({path: "data/sucker-inactive.svg"});
    } else if (isBusy) {
        browser.browserAction.setIcon({path: "data/sucker-busy.svg"});
    } else if (selectList.size > 0) {
        browser.browserAction.setIcon({path: "data/sucker-new.svg"});
    } else {
        browser.browserAction.setIcon({path: "data/sucker-idle.svg"});
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
    var sel = {tabId: requestDetails.tabId, page: requestDetails.originUrl};
    selectList.set(id, sel);
    post2app({id: id, topic: TOPIC.APP.OUT.INFO, data: {"url": url.href}});

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
        updateIcon();
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
                if (selectItem !== undefined) {
                    selectItem.programs = m.programs;
                    verifyInsert(m.id, selectItem);
                }
            }
            post2popup({topic: TOPIC.POPUP.OUT.SNIFFER, data: selectList});
            setBusy(false);
            break;
        case TOPIC.APP.IN.PROGRESS:
            var item = updateDownload(m.id, m.data);
            post2popup({id: m.id, topic: TOPIC.POPUP.OUT.DOWNLOAD, data: item});
            break;
        case TOPIC.APP.IN.LIST:
            post2popup({topic: TOPIC.POPUP.OUT.LIST, list: m.list});
            break;
        case TOPIC.APP.IN.HOME:
            if (isUndefined(options.outdir) || options.outdir === null || options.outdir === "") {
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
                    if (!isUndefined(m.data.preferredResolution)) {
                        options.preferredResolution = m.data.preferredResolution;
                    }
                    if (!isUndefined(m.data.parallelDownloads)) {
                        options.parallelDownloads = m.data.parallelDownloads;
                        post2app({topic: "set", data: {"max-threads": options.parallelDownloads}});
                    }
                    browser.storage.local.set(options);
                    // fall through
                case TOPIC.OPTIONS.IN.OPTIONS_INIT:
                    post2options({topic: TOPIC.POPUP.OUT.OPTIONS, data: options});
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
//        console.log("Background got message from popup", m);
            switch (m.topic) {
                case TOPIC.POPUP.IN.INIT:
                    post2popup({topic: TOPIC.POPUP.OUT.SNIFFER, data: selectList});
                    post2popup({topic: TOPIC.POPUP.OUT.DOWNLOAD_INIT, data: downloadList});
                    break;
                case TOPIC.POPUP.IN.ACTION:
                case TOPIC.POPUP.IN.PURGE:
                case TOPIC.POPUP.IN.PLAY:
                    post2app(m);
                    break;
                case TOPIC.POPUP.IN.OPTIONS_UPDATE:
                    if (!isUndefined(m.data.active)) {
                        setActive(m.data.active);
                    }
                    if (!isUndefined(m.data.outdir)) {
                        options.outdir = m.data.outdir;
                    }
                    browser.storage.local.set(options);
                    // fall through
                case TOPIC.POPUP.IN.OPTIONS_INIT:
                    post2popup({topic: TOPIC.POPUP.OUT.OPTIONS, data: options});
                    break;
                case TOPIC.POPUP.IN.LIST:
                    post2app({topic: TOPIC.APP.OUT.LIST, data: {root: m.root}});
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
                    updateIcon();

                    post2popup({id: downloadId, topic: TOPIC.POPUP.OUT.DOWNLOAD, data: downloadItem});
                    post2app({id: downloadId, topic: TOPIC.APP.OUT.DOWNLOAD, data: {url: downloadItem.url, filename: downloadItem.filename}});
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

    updateIcon(); // For color change on list empty.
}
