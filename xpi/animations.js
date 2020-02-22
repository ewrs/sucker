

///////////////////////////////////////////////////////////////////////////////
// flashing popup tab
///////////////////////////////////////////////////////////////////////////////
function flash(e) {
    e.classList.remove("flash");
    void e.offsetWidth;
    e.classList.add("flash");
}

///////////////////////////////////////////////////////////////////////////////
// infinite progress bar
///////////////////////////////////////////////////////////////////////////////
function pump(e) {
    e.classList.remove("pump");
    void e.offsetWidth;
    e.classList.add("pump");
}

///////////////////////////////////////////////////////////////////////////////
// smooth live stream clock
///////////////////////////////////////////////////////////////////////////////
var ticker = {interval: undefined, list: new Map()};

function tick(ticker) {
    ticker.list.forEach((item, element) => {
        const t = Date.now() - item.startTime;
        element.innerText = _("StateRunningLive") + "   " + formatTimecode(t);
    });
}

function addTicker(element, item) {
    if (ticker.list.has(element)) {
        return;
    }
    if (ticker.list.size === 0) {
        ticker.interval = setInterval(tick, 500, ticker);
    }
    ticker.list.set(element, item);
}

function removeTicker(element) {
    if (!ticker.list.has(element)) {
        return;
    }
    ticker.list.delete(element);
    if (ticker.list.size === 0) {
        clearInterval(ticker.interval);
        ticker.interval = undefined;
    }
}
