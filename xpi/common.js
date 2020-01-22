
/* global browser */

const _ = browser.i18n.getMessage;

const JOB_STATE = {
    WAITING: 0,
    RUNNING: 1,
    READY: 2,
    STOPPED: 3,
    ERROR: 4,
    PURGED: 5
};

const TOPIC = {
    PROBE: "probe",
    DOWNLOAD: "download",
    SUBFOLDERS: "subfolders",
    HOME: "home",
    ACTION: "action",
    GET_OPTIONS: "get-options",
    SET_OPTIONS: "set-options",
    PURGE: "purge",
    PLAY: "play",
    INIT_SNIFFER: "init-sniffer",
    INIT_DOWNLOADS: "init-downloads"
};

function isUndefined(obj) {
    return typeof (obj) === 'undefined';
}

function getCssProperty(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name);
}

function setCssProperty(name, value) {
    document.documentElement.style.setProperty(name, value);
}

