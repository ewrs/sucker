
/* global browser */
/* global JOB_STATE */
/* global TOPIC */

var options = {};
var initReady = false;
var fileName = "";
var saveId = -1;

// Initialize & handle tabs.
function openTab(pageName, color) {
    Array.from(document.getElementsByClassName("tabcontent")).forEach(tc => {
        const active = tc.id === pageName;
        tc.style.display = active ? "block" : "none";
    });
    Array.from(document.getElementsByClassName("tablink")).forEach(tl => {
        var active = tl.className.split(' ').includes(pageName);
        tl.style.backgroundColor = active ? color : "";
        tl.style.fontWeight = active ? "normal" : "";
        tl.disabled = active; // No sense in point & click on the active tab.
    });
}
function activateTabButtons() {
    document.getElementsByClassName("sniffer")[0]
            .addEventListener("click", () => openTab("sniffer", "white"));
    document.getElementsByClassName("download")[0]
            .addEventListener("click", () => openTab("download", "white"));
    document.getElementById("defaultOpen").click();

    document.getElementById("options")
            .addEventListener("click", () => browser.runtime.openOptionsPage());

    document.getElementById("power").addEventListener("click", () => {
        post2background({topic: TOPIC.SET_OPTIONS, data: {active: !options.active}});
    });
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', activateTabButtons);
} else {
    activateTabButtons();
}

function flash(e) {
    e.classList.remove("flash");
    void e.offsetWidth;
    e.classList.add("flash");
}

function checkAppError() {
    if (!options.appError) {
        return;
    }

    document.body.style.height = "180px";
    document.getElementById("error").style.display = "block";
    document.getElementById("error-hint").innerText = _("ErrorAppConnect");

    var inst = document.getElementById("error-action-install");
    inst.innerText = _("ErrorAppInstall");
    inst.onclick = function () {
        const m = browser.runtime.getManifest();
        browser.downloads.download({
            url: m.homepage_url + "/releases/download/v" + m.version + "/suckerApp-v" + m.version + "-setup.zip"
        });
    };

    var rtfm = document.getElementById("error-action-rtfm");
    rtfm.innerText = _("ErrorAppRTFM");
    rtfm.onclick = function () {
        // TODO
    };

    var retry = document.getElementById("error-action-retry");
    retry.innerText = _("ErrorAppRetry");
    retry.onclick = function () {
        browser.runtime.reload();
    };

    var remove = document.getElementById("error-action-remove");
    remove.innerText = _("ErrorAppRemove");
    remove.onclick = function () {
        browser.management.uninstallSelf({});
    };
}

function resizeSaveAs() {
    let n = document.getElementById("sa-list").childElementCount;
    let h = Math.min(454, 18 + 21 * n);
    setCssProperty("--sa-dlg-list-height", h.toString() + "px");
    document.body.style.height = (n ? (h + 146).toString() : 146) + "px";
    document.getElementById("sa-list-box").style.display = n ? "block" : "none";
}

function checkIfFileExists() {
    port2background.postMessage(
            {topic: TOPIC.EXISTS, data: {id: saveId, filename: options.outdir + "/" + fileName}});
}

function setBookmarkControls(hasBookmark) {
    var checkbox = document.getElementById("sa-bookmark-checked");
    checkbox.checked = hasBookmark;

    var button = document.getElementById("sa-bookmark-next");
    var n = options.bookmarks.length;
    button.disabled = (n === 0) || (hasBookmark && n === 1);

    return checkbox;
}

function saveAs(job) {
    function close() {
        setCssProperty("--sa-dlg-list-height", "0");
        document.getElementById("save-as").style.display = "none";
        document.body.style.height = "auto";
    }

    checkIfFileExists();
    fillHeadline();
    document.getElementById("save-as").style.display = "block";
    document.getElementById("sa-title").innerText = _("SaveAsTitle");
    document.getElementById("sa-filename-label").innerText = _("SaveAsFilename");
    document.getElementById("sa-outdir-label").innerText = _("SaveAsOutDir");
    document.getElementById("sa-bookmark-label").innerText = _("SaveAsBookmarkLabel");

    var eFilename = document.getElementById("sa-filename");
    eFilename.innerText = fileName;
    eFilename.addEventListener('keydown', (evt) => {
        if (evt.keyCode === 13) {
            evt.preventDefault();
            document.getElementById("sa-bookmark-checked").focus();
        }
    });
    eFilename.onblur = function (ev) {
        fileName = ev.target.innerText;
        eFilename.innerText = fileName;
        checkIfFileExists();
    };

    var eButtonSave = document.getElementById("sa-button-save");
    eButtonSave.innerText = _("SaveAsButtonSave");
    eButtonSave.onclick = function () {
        post2background({
            topic: TOPIC.DOWNLOAD,
            id: saveId,
            master: job.programs.master,
            maps: job.programs.list[getDetailIndex(saveId)].maps,
            filename: options.outdir + "/" + fileName});
        close();
        flash(document.getElementsByClassName("download")[0]);
    };
    eButtonSave.focus();

    var eButtonCancel = document.getElementById("sa-button-cancel");
    eButtonCancel.innerText = _("SaveAsButtonCancel");
    eButtonCancel.onclick = function () {
        close();
    };

    var eBookmarkCheckbox = setBookmarkControls(options.bookmarks.includes(options.outdir));
    eBookmarkCheckbox.onclick = function (ev) {
        if (ev.target.checked) {
            options.bookmarks.push(options.outdir);
        } else {
            options.bookmarks.splice(options.bookmarks.indexOf(options.outdir), 1);
        }
        setBookmarkControls(ev.target.checked);
        port2background.postMessage({
            topic: TOPIC.SET_OPTIONS,
            data: {bookmarks: options.bookmarks.length > 0 ? options.bookmarks.join("\t") : ""}});
    };

    var eBookmarkNext = document.getElementById("sa-bookmark-next");
    eBookmarkNext.innerText = _("SaveAsBookmarkNext");
    eBookmarkNext.onclick = function () {
        var index = options.bookmarks.indexOf(options.outdir) + 1;
        if (index >= options.bookmarks.length) {
            index = 0;
        }
        options.outdir = options.bookmarks[index];
        outDirUpdate();
        fillHeadline();
    };
}

// Receive messages from the background.
let port2background = browser.runtime.connect({name: "port2popup"});
function post2background(msg) {
    port2background.postMessage(msg);
}
port2background.onMessage.addListener((m) => {
//    console.log("Popup got message from background: ", m);
    switch (m.topic) {
        case TOPIC.INIT_SNIFFER:
            var e = document.getElementById("sniffer");
            while (e.firstChild) {
                e.removeChild(e.firstChild);
            }
            m.data.forEach((v, k) => addSniffer(k, v));
            break;
        case TOPIC.INIT_DOWNLOADS:
            m.data.forEach((v, k) => addDownload(k, v));
            initReady = true;
            break;
        case TOPIC.DOWNLOAD:
            if (initReady) {
                var e = document.getElementById("dl-" + m.id);
                if (e === null) {
                    addDownload(m.id, m.data);
                } else if (m.data.state === JOB_STATE.PURGED) {
                    e.parentNode.removeChild(e);
                    markDownloadError();
                } else {
                    updateState(m.id, m.data);
                }
            }
            break;
        case TOPIC.GET_OPTIONS:
            options = m.data;
            options.bookmarks = options.bookmarks !== "" ? options.bookmarks.split("\t") : [];
            checkAppError();
            break;
        case TOPIC.SUBFOLDERS:
            fillList(m.data);
            break;
        case TOPIC.EXISTS:
            if (saveId.toString() !== m.data.id.toString()) {
                return;
            }
            markFieldError(m.data.exists.toString() === "true", "sa-filename");
            break;
    }
});

// Call background for data.
post2background({topic: TOPIC.GET_OPTIONS});
post2background({topic: TOPIC.INIT_SNIFFER});
post2background({topic: TOPIC.INIT_DOWNLOADS});

//==============================================================================
//   SNIFFER
//==============================================================================

// Generate output file name.
function autoFileName(job, detailIndex) {
    const arr = job.programs.master.replace(/\?.*/, "").split("/");
    var fn = arr[arr.length - 2];

    const fs = fn.split(","); // try that "list in the folder name" scheme...
    if (fs.length === job.programs.list.length + 2) {
        fn = fs[0] + fs[1 + job.programs.list[detailIndex].orgIndex];
        const s = fs[fs.length - 1];
        const pos = s.indexOf(".mp4");
        fn += (pos >= 0) ? s.substring(0, pos) : s;
    }

    fileName = fn + (fn.endsWith(".mp4") ? "" : ".mp4");
    return fileName;
}

// Get the stream index of the selected resolution.
function getDetailIndex(jobId) {
    return parseInt(Array.from(document.getElementsByName("sn-" + jobId))
            .find(obj => obj.type === "radio" && obj.checked).value);
}

// Create an element with class name and optional id.
function createElement(tagName, className, jobId) {
    var e = document.createElement(tagName);
    e.className = className;
    if (jobId !== undefined) {
        e.id = className.split(" ")[0] + "-" + jobId;
    }
    return e;
}

//<div class="tabcontent" id="sniffer">
//    <form class="sn-item" id="sn-17">
//        <div class="sn-image-box">
//            <image class="sn-image" src="https://domain.com/where/ever/thumbnail.jpg"/>
//            <div class="sn-duration">17:42</div>
//        </div>
//        <div class="column-right">
//            <div class="sn-title">Cool Movie Title</div>
//            <div class="sn-detail-list">
//                <input type="radio" id="sn-17-res-0" name="sn-17" value="0"/><label for="sn-17-res-0">1920x1080</label>
//                <input type="radio" id="sn-17-res-1" name="sn-17" value="1"/><label for="sn-17-res-1">1280x720</label>
//                <input type="radio" id="sn-17-res-2" name="sn-17" value="2"/><label for="sn-17-res-2">852x480</label>
//                <input type="radio" id="sn-17-res-3" name="sn-17" value="3"/><label for="sn-17-res-3">426x240</label>
//            </div>
//            <div class="sn-action-box">
//                <button class="sn-action flatButton" type="button">Download</button>
//            </div>
//        </div>
//        <div class="row-separator"></div>
//    </form>
//</div>
function addSniffer(jobId, job) {
    if (isUndefined(job.programs)) {
        return;
    }
    var item = createElement("form", "sn-item");
    item.id = "sn-" + jobId;

    var ib = createElement("div", "sn-image-box");
    var e = createElement("img", "sn-image");
    e.src = job.image;
    ib.appendChild(e);

    e = createElement("div", "sn-duration");
    e.appendChild(document.createTextNode(job.programs.duration));
    ib.appendChild(e);
    item.appendChild(ib);

    var cr = createElement("div", "column-right");
    e = createElement("div", "sn-title");
    e.appendChild(document.createTextNode(job.title));
    cr.appendChild(e);

    var diff = -1;
    var reso = null;
    var sdl = createElement("div", "sn-detail-list");
    for (var i = 0; i < job.programs.list.length && i < 6; i++) {
        var inp = document.createElement("input");
        inp.type = "radio";
        inp.name = item.id;
        inp.value = i.toString();
        inp.id = inp.name + "-res-" + inp.value;
        inp.onclick = function (ev) {
            fileName = autoFileName(job, parseInt(ev.target.value));
        };
        sdl.appendChild(inp);

        var x = job.programs.list[i].resolution;
        x = x.substr(0, x.indexOf('x'));
        var d = Math.abs(options.preferredResolution - parseInt(x));
        if (diff < 0 || d < diff) {
            reso = inp;
            diff = d;
        }

        var lab = document.createElement("label");
        lab.htmlFor = inp.id;
        lab.appendChild(document.createTextNode(job.programs.list[i].resolution));
        sdl.appendChild(lab);
    }
    cr.appendChild(sdl);

    var ab = createElement("div", "sn-action-box");
    e = createElement("button", "sn-action flatButton");
    e.type = "button";
    e.onclick = function () {
        saveId = jobId;
        saveAs(job);
    };
    e.appendChild(document.createTextNode(_("SnifferAction")));
    ab.appendChild(e);
    cr.appendChild(ab);
    item.appendChild(cr);
    item.appendChild(createElement("div", "row-separator"));

    document.getElementById("sniffer").appendChild(item);
    e.focus();

    if (reso !== null) {
        reso.click();
    }
}

//==============================================================================
//   DOWNLOAD
//==============================================================================

document.getElementById("dl-purge").onclick = function () {
    post2background({topic: TOPIC.PURGE});
};

//<div class="tabcontent" id="download">
//    <form class="dl-item" id="dl-88">
//        <div class="dl-image-box">
//            <image class="dl-image" src="https://domain.com/where/ever/thumbnail.jpg"/>
//            <div class="dl-duration">17:42</div>
//        </div>
//        <div class="column-right">
//            <div class="dl-title">Cool Movie Title</div>
//            <div class="dl-filename"><span>&lrm;</span>/home/user/download/the-film.mp4</div>
//            <div class="dl-action-box">
//                <progress class="dl-progress" id="dl-progress-88" max="1000" value="333"></progress>
//                <button class="dl-action flatButton" type="button">Stop</button>
//                <button class="dl-state flatButton" type="button" disabled="disabled" id="dl-state-88">Pending</button>
//            </div>
//        </div>
//        <div class="row-separator"></div>
//    </form>
//    <div id="dl-footer">
//        <button class="flatButton" type="button">Clean list</button>
//    </div>
//</div>
function addDownload(jobId, job) {
    var item = createElement("form", "dl-item");
    item.id = "dl-" + jobId;

    var ib = createElement("div", "dl-image-box");
    var e = createElement("img", "dl-image");
    e.src = job.image;
    e.onclick = function (ev) {
        post2background({topic: TOPIC.PLAY, data: {id: ev.target.parentNode.parentNode.id.split("-")[1]}});
    };
    e.disabled = job.state !== JOB_STATE.READY;
    ib.appendChild(e);

    e = createElement("div", "dl-duration");
    e.appendChild(document.createTextNode(job.duration));
    ib.appendChild(e);
    item.appendChild(ib);

    var cr = createElement("div", "column-right");
    e = createElement("div", "dl-title");
    e.appendChild(document.createTextNode(job.title));
    cr.appendChild(e);

    e = createElement("div", "dl-filename");
    e.appendChild(document.createElement("span").appendChild(document.createTextNode("\u202A"))); // &lrm;
    e.appendChild(document.createTextNode(job.filename));
    cr.appendChild(e);

    var ab = createElement("div", "dl-action-box");
    e = createElement("progress", "dl-progress", jobId);
    e.max = "1000";
    if (job.duration !== "N/A" || job.state !== JOB_STATE.RUNNING) {
        e.value = job.progress;
    }
    ab.appendChild(e);

    e = createElement("button", "dl-action flatButton", jobId);
    e.type = "button";
    e.onclick = function () {
        post2background({topic: TOPIC.ACTION, data: {id: jobId.toString()}});
    };
    ab.appendChild(e);

    e = createElement("div", "dl-state padded", jobId);
    ab.appendChild(e);
    cr.appendChild(ab);
    item.appendChild(cr);
    item.appendChild(createElement("div", "row-separator"));

    e = document.getElementById("download");
    e.insertBefore(item, e.firstChild);

    updateState(jobId, job);
}

function formatTimecode(tc) {
    var date = new Date(null);
    date.setMilliseconds(tc);
    return date.toISOString().substr(11, 8);
}

function markDownloadError() {
    const allNodes = document.querySelectorAll(".dl-state");
    var found = allNodes !== undefined && allNodes !== null && allNodes.length > 0;
    if (found) {
        found = found && !isUndefined(Array.from(allNodes).find(state => state.invalid));
    }
    const mark = found ? getCssProperty('--msg-tab-mark-warning') : "";
    setCssProperty("--msg-tab-download-mark", mark);
}

function updateState(id, job) {
    var stateElement = document.getElementById("dl-state-" + id);
    var actionElement = document.getElementById("dl-action-" + id);
    var progressElement = document.getElementById("dl-progress-" + id);

    stateElement.style.color = getCssProperty('--color-selected');
    stateElement.style.background = getCssProperty('--color-selected.background');
    stateElement.invalid = false;

    switch (job.state) {
        case JOB_STATE.WAITING:
            stateElement.innerText = _("StateWaiting");
            actionElement.innerText = _("ActionDelete");
            break;
        case JOB_STATE.RUNNING:
            stateElement.innerText = (job.duration === "N/A")
                    ? _("StateRunningLive") + "   " + formatTimecode(job.progress)
                    : _("StateRunning");
            actionElement.innerText = _("ActionStop");
            break;
        case JOB_STATE.READY:
            stateElement.innerText = _("StateReady");
            stateElement.style.color = getCssProperty('--color-done');
            stateElement.style.background = getCssProperty('--color-done-background');
            actionElement.innerText = _("ActionDelete");
            break;
        case JOB_STATE.STOPPED:
            stateElement.innerText = _("StateStopped");
            actionElement.innerText = _("ActionRetry");
            break;
        case JOB_STATE.ERROR:
            stateElement.innerText = _("StateError");
            stateElement.invalid = true;
            stateElement.style.color = getCssProperty('--color-error');
            stateElement.style.background = getCssProperty('--color-error-background');
            actionElement.innerText = _("ActionRetry");
            break;
    }

    // Handle error messsage.
    if (!isUndefined(job.error) && job.error !== null && job.error !== "") {
        stateElement.title = job.error;
    } else {
        stateElement.removeAttribute("title");
    }

    // Set inifinite progress bar during live stream download.
    if (job.duration !== "N/A" || job.state !== JOB_STATE.RUNNING) {
        progressElement.value = job.progress.toString();
    } else {
        progressElement.removeAttribute("value");
    }

    // Activate the video player.
    if (job.state === JOB_STATE.READY) {
        var img = document.getElementById("dl-" + id).firstChild.firstChild;
        img.style.cursor = "pointer";
        img.disable = false;
    } // No else. You can't go back from the 'ready' state.

    markDownloadError();
}

//==============================================================================
//   SAVE AS
//==============================================================================

function outDirArray() {
    var i = options.outdir.startsWith("/") ? 1 : 0;
    return options.outdir.substr(i).split("/");
}

function outDirAppend(value) {
    const len = options.outdir.length;
    if (len > 0 && options.outdir[len - 1] !== '/') {
        options.outdir += "/";
    }
    options.outdir += value;
}

function outDirUpdate() {
    post2background({topic: TOPIC.SET_OPTIONS, data: {outdir: options.outdir}});
    checkIfFileExists();
}

function fillHeadline() {
    var headline = document.getElementById("sa-headline");
    while (headline.firstChild) {
        headline.removeChild(headline.firstChild);
    }

    if (isUndefined(options.outdir)) {
        return;
    }

    function clickBack(ev) {
        var me = parseInt(ev.target.value);
        var arr = outDirArray();
        options.outdir = options.outdir.startsWith("/") ? "/" : "";
        for (var i = 0; i <= me; i++) {
            outDirAppend(arr[i]);
        }
        outDirUpdate();
        fillHeadline();
    }

    function addSeparator(active) {
        var e;
        if (active) {
            e = createElement("button", "flatButton slim");
            e.type = "button";
            e.onclick = clickBack;
        } else {
            e = createElement("div", "padded slim");
        }
        e.innerText = "/";
        headline.appendChild(e);
    }

    var e;
    var arr = outDirArray();
    var len = arr.length;
    addSeparator(len > 0);
    for (var index = 0; index < len; index++) {
        if (index < len - 1) {
            e = createElement("button", "flatButton slim");
            e.type = "button";
            e.value = index.toString();
            e.onclick = clickBack;
        } else {
            e = createElement("div", "padded slim");
        }
        e.innerText = arr[index];
        headline.appendChild(e);

        if (index < len - 1) {
            addSeparator(false);
        }
    }

    setBookmarkControls(options.bookmarks.includes(options.outdir));

    var list = document.getElementById("sa-list");
    while (list.firstChild) {
        list.removeChild(list.firstChild);
    }

    post2background({topic: TOPIC.SUBFOLDERS, data: {root: options.outdir}});
}

function markFieldError(hasError, elementId) {
    var e = document.getElementById(elementId);
    e.style.background = getCssProperty(hasError ? "--color-error-background" : "transparent");
    e.invalid = hasError;

    const err = hasError || Array.from(e.parentNode.childNodes).filter(e => e.invalid).length > 0;
    document.getElementById("sa-button-save").disabled = err;

    return hasError;
}

function fillList(data) {
    // clean up old data
    var list = document.getElementById("sa-list");
    while (list.firstChild) {
        list.removeChild(list.firstChild);
    }

    // check for invalid path
    if (markFieldError(!isUndefined(data.error), "sa-headline")) {
        resizeSaveAs();
        return;
    }

    // base64 decode new data
    let decoded = [];
    data.list.forEach((folder) => decoded.push(atob(folder)));

    // fill list of subfolders
    decoded.sort().forEach((folder) => {
        var e = createElement("button", "flatButton");
        e.type = "button";
        e.innerText = decodeURIComponent(escape(folder));
        e.onclick = function (ev) {
            outDirAppend(ev.target.innerText);
            outDirUpdate();
            fillHeadline();
        };
        list.appendChild(e);
    });

    resizeSaveAs();
}
