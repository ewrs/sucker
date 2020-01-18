
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

function isUndefined(obj) {
    return typeof (obj) === 'undefined';
}

