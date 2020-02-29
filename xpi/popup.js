
/* global browser */
/* global JOB_STATE */
/* global TOPIC */

var options = {};
var initReady = false;
var saveId = -1;

// Initialize & handle tabs.
function openTab(pageName, color) {
    Array.from(document.getElementsByClassName("tabcontent")).forEach(tc => {
        if (tc.id === pageName) {
            setCssProperty("--color-selected-tab", color);
            tc.style.display = "block";
        } else {
            tc.style.display = "none";
        }
    });
    Array.from(document.getElementsByClassName("tablink")).forEach(tl => {
        const active = tl.className.split(' ').includes(pageName);
        tl.style.fontWeight = active ? "normal" : "";
        tl.disabled = active; // No sense in point & click on the active tab.
    });
}
function activateTabButtons() {
    var sniffer = document.getElementsByClassName("sniffer")[0];
    var snifferColor = getCssProperty("--color-sniffer-background");
    sniffer.style.background = snifferColor;
    sniffer.addEventListener("click", () => openTab("sniffer", snifferColor));

    var download = document.getElementsByClassName("download")[0];
    var downloadColor = getCssProperty("--color-download-background");
    download.style.background = downloadColor;
    download.addEventListener("click", () => openTab("download", downloadColor));

    document.getElementById("defaultOpen").click();

    document.getElementById("options")
            .addEventListener("click", () => browser.runtime.openOptionsPage());
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', activateTabButtons);
} else {
    activateTabButtons();
}

// Receive messages from the background.
let port2background = browser.runtime.connect({name: "port2popup"});
function post2background(msg) {
    port2background.postMessage(msg);
}
port2background.onMessage.addListener((m) => {
//    console.log("Popup got message from background:", m);
    switch (m.topic) {
        case TOPIC.INIT_SNIFFER:
            clearChildren(document.getElementById("sniffer"));
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

    job.filename = fn + (fn.endsWith(".mp4") ? "" : ".mp4");
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
        inp.onclick = (ev) => autoFileName(job, parseInt(ev.target.value));
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
    e.onclick = () => {
        saveId = jobId;
        saveAs(job);
    };
    e.oncontextmenu = (ev) => {
        ev.preventDefault();
        post2background({
            topic: TOPIC.DOWNLOAD,
            id: jobId,
            master: job.programs.master,
            maps: job.programs.list[getDetailIndex(jobId)].maps,
            filename: options.outdir + "/" + job.filename});
        window.close();
    };
    e.appendChild(document.createTextNode(_("SnifferAction")));
    ab.appendChild(e);
    cr.appendChild(ab);
    item.appendChild(cr);

    document.getElementById("sniffer").appendChild(item);
    e.focus();

    if (reso !== null) {
        reso.click();
    }
}

//==============================================================================
//   DOWNLOAD
//==============================================================================

document.getElementById("dl-purge").onclick = () => post2background({topic: TOPIC.PURGE});

//<div class="tabcontent" id="download">
//    <form class="dl-item" id="dl-88">
//        <div class="dl-image-box">
//            <div class="dl-play/></div>
//            <img class="dl-image" src="https://domain.com/where/ever/thumbnail.jpg"/>
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
//    </form>
//    <div id="dl-footer">
//        <button class="flatButton" type="button">Clean list</button>
//    </div>
//</div>
function addDownload(jobId, job) {
    var item = createElement("form", "dl-item");
    item.id = "dl-" + jobId;

    var ib = createElement("div", "dl-image-box");
    var e = createElement("div", "dl-play");
    e.style.display = job.state === JOB_STATE.READY ? "block" : "none";
    e.onclick = (ev) =>
        post2background({topic: TOPIC.PLAY, data: {id: ev.target.parentNode.parentNode.id.split("-")[1]}});
    ib.appendChild(e);

    e = createElement("img", "dl-image");
    e.src = job.image;
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
    e = createElement("div", "dl-progress-frame");
    e.appendChild(createElement("div", "dl-progress", jobId));
    e.appendChild(createElement("div", "dl-progress-done", jobId));
    ab.appendChild(e);

    e = createElement("button", "dl-action flatButton", jobId);
    e.type = "button";
    e.onclick = () => post2background({topic: TOPIC.ACTION, data: {id: jobId.toString()}});
    ab.appendChild(e);

    e = createElement("div", "dl-state padded", jobId);
    ab.appendChild(e);
    cr.appendChild(ab);
    item.appendChild(cr);

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

    actionElement.style.display = "block";

    switch (job.state) {
        case JOB_STATE.WAITING:
            stateElement.innerText = _("StateWaiting");
            actionElement.innerText = _("ActionDelete");
            break;
        case JOB_STATE.RUNNING:
            (job.duration === "N/A")
                    ? addTicker(stateElement, job)
                    : stateElement.innerText = _("StateRunning");
            actionElement.innerText = _("ActionStop");
            break;
        case JOB_STATE.READY:
            stateElement.innerText = _("StateReady");
            actionElement.innerText = _("ActionExplore");
            break;
        case JOB_STATE.STOPPED:
            stateElement.innerText = _("StateStopped");
            actionElement.innerText = _("ActionRetry");
            const intermediate = job.progress !== 0 && job.progress !== 1000;
            actionElement.style.display = intermediate ? "none" : "block";
            break;
        case JOB_STATE.ERROR:
            stateElement.innerText = _("StateError");
            stateElement.invalid = true;
            stateElement.style.color = getCssProperty('--color-error');
            stateElement.style.background = getCssProperty('--color-error-background');
            actionElement.innerText = _("ActionRetry");
            break;
    }

    // Stop ticker if any
    if (job.duration === "N/A" && job.state !== JOB_STATE.RUNNING) {
        removeTicker(stateElement);
    }

    // Handle error messsage.
    (!isUndefined(job.error) && job.error !== null && job.error !== "")
            ? stateElement.title = job.error
            : stateElement.removeAttribute("title");

    // Update progress bar
    if (job.progress === 1000) {
        progressElement.style.display = "none";
        document.getElementById("dl-progress-done-" + id).style.display = "block";
    } else if (job.duration === "N/A" && job.state === JOB_STATE.RUNNING) {
        progressElement.style.left = "46%";
        progressElement.style.width = "8%";
        pump(progressElement);
    } else {
        progressElement.style.width = (parseFloat(job.progress) / 10).toString() + "%";
    }

    // Activate the video player.
    if (job.state === JOB_STATE.READY) {
        var img = document.getElementById("dl-" + id).firstChild.firstChild;
        img.style.display = "block";
    } // No else. You can't go back from the 'ready' state.

    markDownloadError();
}
