
/* global browser */
/* global JOB_STATE */

const TOPIC = {
    BACKGROUND: {
        IN: {
            SNIFFER: "sniffer.init",
            OPTIONS: "options",
            DOWNLOAD_INIT: "download-init",
            DOWNLOAD: "download",
            LIST: "list"},
        OUT: {
            INIT: "init",
            SELECT: "select",
            ACTION: "action",
            PURGE: "purge",
            OPTIONS_INIT: "options-init",
            OPTIONS_UPDATE: "options-update",
            LIST: "list",
            PLAY: "play"}}};

var options = {};
var initReady = false;

// Initialize & handle tabs.
function openTab(pageName, color) {
    Array.from(document.getElementsByClassName("tabcontent")).forEach(tc => {
        const active = tc.id === pageName;
        tc.style.display = active ? "block" : "none";
        if (active) {
            refreshTab(pageName);
        }
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
    document.getElementsByClassName("changeFolder")[0]
            .addEventListener("click", () => openTab("changeFolder", "white"));
    document.getElementById("defaultOpen").click();

    document.getElementById("power")
            .addEventListener("click", () => {
                post2background({topic: TOPIC.BACKGROUND.OUT.OPTIONS_UPDATE, data: {active: !options.active}});
            });
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', activateTabButtons);
} else {
    activateTabButtons();
}

function refreshTab(tabName) {
    switch (tabName) {
        case "changeFolder":
            fillHeadline();
            break;
    }
}

function flash(e) {
    e.classList.remove("flash");
    void e.offsetWidth;
    e.classList.add("flash");
}

// Receive messages from the background.
let port2background = browser.runtime.connect({name: "port2popup"});
function post2background(msg) {
    port2background.postMessage(msg);
}
port2background.onMessage.addListener((m) => {
//    console.log("Popup got message from background: ", m);
    switch (m.topic) {
        case TOPIC.BACKGROUND.IN.SNIFFER:
            var e = document.getElementById("sniffer");
            while (e.firstChild) {
                e.removeChild(e.firstChild);
            }
            m.data.forEach((v, k) => addSniffer(k, v));
            break;
        case TOPIC.BACKGROUND.IN.DOWNLOAD_INIT:
            m.data.forEach((v, k) => addDownload(k, v));
            initReady = true;
            break;
        case TOPIC.BACKGROUND.IN.DOWNLOAD:
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
        case TOPIC.BACKGROUND.IN.OPTIONS:
            options = m.data;
            fillHeadline();
            break;
        case TOPIC.BACKGROUND.IN.LIST:
            fillList(m.list);
            break;
    }
});

// Call background for data.
post2background({topic: TOPIC.BACKGROUND.OUT.OPTIONS_INIT});
post2background({topic: TOPIC.BACKGROUND.OUT.INIT});

//==============================================================================
//   SNIFFER
//==============================================================================

// Generate output file name.
function autoFileName(job, detailIndex) {
    if (job.protectFileName !== undefined) {
        return document.getElementById("sn-filename-" + job.id).innerText;
    } else {
        const arr = job.programs.list[detailIndex].url.replace(/\?.*/, "").split("/");
        var fn = arr[arr.length - 2];

        const fs = fn.split(","); // try that "list in the folder name" scheme...
        if (fs.length === job.programs.list.length + 2) {
            fn = fs[0] + fs[1 + job.programs.list[detailIndex].orgIndex];
        }

        return fn + (fn.endsWith(".mp4") ? "" : ".mp4");
    }
}

// Get the stream index of the selected resolution.
function getDetailIndex(jobId) {
    return parseInt(Array.from(document.getElementsByName("sn-" + jobId))
            .find(obj => obj.type === "radio" && obj.checked).value);
}

// Create an element with class name.
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
//            <image class="sn-image" src="https://domain.com/where/ever/thumbnail.jpg" alt="[?]"/>
//            <div class="sn-duration">17:42</div>
//        </div>
//        <div class="sn-title">Cool Film Title</div>
//        <div class="sn-detail-list">
//            <input type="radio" id="sn-17-res-0" name="sn-17" value="0"/><label for="sn-17-res-0">1920x1080</label>
//            <input type="radio" id="sn-17-res-1" name="sn-17" value="1"/><label for="sn-17-res-1">1280x720</label>
//            <input type="radio" id="sn-17-res-2" name="sn-17" value="2"/><label for="sn-17-res-2">852x480</label>
//            <input type="radio" id="sn-17-res-3" name="sn-17" value="3"/><label for="sn-17-res-3">426x240</label>
//        </div>
//        <div class="sn-action-box">
//            <button class="sn-outdir flatButton" type="button">/home/user/download/</button>
//            <button class="sn-filename flatButton" id="sn-filename-17" type="button">the-film.mp4</button>
//            <button class="sn-action flatButton" type="button">Haben will</button>
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
    e.alt = "[?]";
    ib.appendChild(e);

    e = createElement("div", "sn-duration");
    e.appendChild(document.createTextNode(job.programs.duration));
    ib.appendChild(e);
    item.appendChild(ib);

    e = createElement("div", "sn-title");
    e.appendChild(document.createTextNode(job.title));
    item.appendChild(e);

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
            item.getElementsByClassName("sn-filename")[0]
                    .innerText = autoFileName(job, parseInt(ev.target.value));
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
    item.appendChild(sdl);

    var ab = createElement("div", "sn-action-box");
    e = createElement("button", "sn-outdir flatButton");
    e.type = "button";
    e.disabled = true;
    e.appendChild(document.createTextNode(options.outdir + "/"));
    ab.appendChild(e);

    var fn = createElement("button", "sn-filename flatButton", jobId);
    fn.type = "button";
    fn.onclick = function (ev) {
        const name = prompt(_("SnifferChangeFileName"), fn.innerText);
        if (name !== null) {
            fn.innerText = name;
            job.protectFileName = true;
        }
    };
    ab.appendChild(fn);

    e = createElement("button", "sn-action flatButton");
    e.type = "button";
    e.onclick = function () {
        const index = getDetailIndex(jobId);
        const fn = document.getElementById("sn-filename-" + jobId).innerText;
        post2background({"topic": TOPIC.BACKGROUND.OUT.SELECT, "id": jobId, "url": job.programs.list[index].url, "filename": options.outdir + "/" + fn});
        flash(document.getElementsByClassName("download")[0]);
    };
    e.appendChild(document.createTextNode(_("SnifferAction")));
    ab.appendChild(e);
    item.appendChild(ab);
    item.appendChild(createElement("div", "row-separator"));

    document.getElementById("sniffer").appendChild(item);

    if (reso !== null) {
        reso.click();
    }
}

//==============================================================================
//   DOWNLOAD
//==============================================================================

document.getElementById("dl-purge").onclick = function () {
    post2background({topic: TOPIC.BACKGROUND.OUT.PURGE});
};

//<div class="tabcontent" id="download">
//    <form class="dl-item" id="dl-17">
//        <div class="dl-image-box">
//            <image class="dl-image" src="https://domain.com/where/ever/thumbnail.jpg" alt="[?]"/>
//            <div class="dl-duration">17:18</div>
//        </div>
//        <div class="dl-title">Cool Movie Title</div>
//        <div class="dl-filename">/home/user/download/the-film.mp4</div>
//        <div class="dl-action-box">
//            <progress class="dl-progress" id="dl-progress-17" max="1000" value="333"></progress>
//            <div class="flexLine">
//                <button class="dl-action flatButton" type="button">Abbrechen</button>
//                <button class="dl-state flatButton" type="button" disabled="disabled" id="dl-state-17">Warten</button>
//            </div>
//        </div>
//        <div class="row-separator"></div>
//    </form>
//    <div id="dl-footer">
//        <button class="flatButton" type="button">Fenster putzen</button>
//    </div>
//</div>
function addDownload(jobId, job) {
    var item = createElement("form", "dl-item");
    item.id = "dl-" + jobId;

    var ib = createElement("div", "dl-image-box");
    var e = createElement("img", "dl-image");
    e.src = job.image;
    e.alt = "[?]";
    e.onclick = function (ev) {
        post2background({"id": ev.target.parentNode.parentNode.id.split("-")[1], "topic": TOPIC.BACKGROUND.OUT.PLAY});
    };
    e.disabled = job.state !== JOB_STATE.READY;
    ib.appendChild(e);

    e = createElement("div", "dl-duration");
    e.appendChild(document.createTextNode(job.duration));
    ib.appendChild(e);
    item.appendChild(ib);

    e = createElement("div", "dl-title");
    e.appendChild(document.createTextNode(job.title));
    item.appendChild(e);

    e = createElement("div", "dl-filename");
    e.appendChild(document.createTextNode(job.filename));
    item.appendChild(e);

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
        post2background({"id": jobId, "topic": TOPIC.BACKGROUND.OUT.ACTION});
    };
    ab.appendChild(e);

    e = createElement("button", "dl-state flatButton", jobId);
    e.type = "button";
    e.disabled = true;
    ab.appendChild(e);
    item.appendChild(ab);
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
        const errColor = getComputedStyle(document.documentElement).getPropertyValue('--color-error').toString().trim();
        found = found && !isUndefined(Array.from(allNodes).find(state => state.style.color === errColor));
    }
    const mark = found ? getComputedStyle(document.documentElement).getPropertyValue('--msg-tab-mark-warning') : "";
    document.documentElement.style.setProperty("--msg-tab-download-mark", mark);
}

function updateState(id, job) {
    var stateElement = document.getElementById("dl-state-" + id);
    var actionElement = document.getElementById("dl-action-" + id);
    var progressElement = document.getElementById("dl-progress-" + id);

    stateElement.style.color = getComputedStyle(document.documentElement).getPropertyValue('--color-selected');

    switch (job.state) {
        case JOB_STATE.WAITING:
            stateElement.innerText = _("StateWaiting");
            actionElement.innerText = _("ActionDelete");
            break;
        case JOB_STATE.RUNNING:
            var s = job.duration === "N/A" ? "   " + formatTimecode(job.progress) : "";
            stateElement.innerText = _("StateRunning") + s;
            actionElement.innerText = _("ActionStop");
            break;
        case JOB_STATE.READY:
            stateElement.innerText = _("StateReady");
            actionElement.innerText = _("ActionDelete");
            break;
        case JOB_STATE.STOPPED:
            stateElement.innerText = _("StateStopped");
            actionElement.innerText = _("ActionRetry");
            break;
        case JOB_STATE.ERROR:
            stateElement.innerText = _("StateError");
            stateElement.style.color = getComputedStyle(document.documentElement).getPropertyValue('--color-error');
            actionElement.innerText = _("ActionRetry");
            break;
    }

    // Handle error messsage.
    if (!isUndefined(job.message) && job.message !== null && job.message !== "") {
        stateElement.title = job.message;
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
//   CHANGE FOLDER
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
    Array.from(document.querySelectorAll(".sn-outdir")).forEach((sel) => {
        sel.innerText = options.outdir + "/";
    });
    post2background({topic: TOPIC.BACKGROUND.OUT.OPTIONS_UPDATE, data: {outdir: options.outdir}});
}

function fillHeadline() {
    var headline = document.getElementById("cf-headline");
    while (headline.firstChild) {
        headline.removeChild(headline.firstChild);
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
        e = createElement("button", "flatButton");
        e.type = "button";
        e.innerText = "/";
        e.disabled = !active;
        e.value = "-1";
        e.onclick = clickBack;
        headline.appendChild(e);
    }

    var e;
    var arr = outDirArray();
    var len = arr.length;
    addSeparator(len > 0);
    for (var index = 0; index < len; index++) {
        e = createElement("button", "flatButton");
        e.type = "button";
        e.innerText = arr[index];
        e.disabled = index === len - 1;
        e.value = index.toString();
        e.onclick = clickBack;
        headline.appendChild(e);

        if (index < len - 1) {
            addSeparator(false);
        }
    }

    var list = document.getElementById("cf-list");
    while (list.firstChild) {
        list.removeChild(list.firstChild);
    }

    post2background({topic: TOPIC.BACKGROUND.OUT.LIST, root: options.outdir});
}

function fillList(data) {
    // base64 decode new data
    let decoded = [];
    data.forEach((folder) => decoded.push(atob(folder)));

    // clean up old data
    var list = document.getElementById("cf-list");
    while (list.firstChild) {
        list.removeChild(list.firstChild);
    }

    // check for invalid path
    if (decoded.length === 1 && decoded[0].startsWith("...")) {
        const mark = getComputedStyle(document.documentElement).getPropertyValue('--msg-tab-mark-warning');
        document.documentElement.style.setProperty("--msg-tab-change-folder-mark", mark);
        return;
    }
    document.documentElement.style.setProperty("--msg-tab-change-folder-mark", "");

    // fill list of subfolders
    decoded.sort().forEach((folder) => {
        var e = createElement("button", "flatButton");
        e.type = "button";
        e.innerText = decodeURIComponent(escape(folder));
        e.onclick = function () {
            outDirAppend(e.innerText);
            outDirUpdate();
            fillHeadline();
        };
        list.appendChild(e);
    });
}
