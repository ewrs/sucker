
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
    INIT_DOWNLOADS: "init-downloads",
    VERSION: "version",
    EXISTS: "exists",
    QUIT: "quit"
};

const APP_ERROR = {
    NONE: 0,
    CONNECT: 1,
    VERSION: 2
};

function isUndefined(obj) {
    return typeof (obj) === 'undefined';
}

function clearChildren(element) {
    while (element.firstChild) {
        element.removeChild(element.firstChild);
    }
    return element;
}

function getCssProperty(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name);
}

function setCssProperty(name, value) {
    document.documentElement.style.setProperty(name, value);
}

