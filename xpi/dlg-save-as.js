
/* global TOPIC */
/* global options */
/* global port2background */
/* global saveId */

function resizeSaveAs() {
    let n = document.getElementById("sa-list").childElementCount;
    let h = Math.min(454, 18 + 21 * n);
    setCssProperty("--sa-dlg-list-height", h.toString() + "px");
    document.body.style.height = (n ? (h + 146).toString() : 146) + "px";
    document.getElementById("sa-list-box").style.display = n ? "block" : "none";
}

function checkIfFileExists(fileName) {
    let fn = isUndefined(fileName) ? document.getElementById("sa-filename").innerText : fileName;
    port2background.postMessage(
            {topic: TOPIC.EXISTS, data: {id: saveId, filename: options.outdir + "/" + fn}});
}

function setBookmarkControls(hasBookmark) {
    var checkbox = document.getElementById("sa-bookmark-checked");
    checkbox.checked = hasBookmark;

    var button = document.getElementById("sa-bookmark-next");
    var n = options.bookmarks.length;
    button.disabled = (n === 0) || (hasBookmark && n === 1);

    return checkbox;
}

function onKeyDown(evt) {
    switch (evt.key) {
        case '\r':
        case '\n':
        case '\t':
            evt.preventDefault();
            document.getElementById("sa-button-save").focus();
            break;
    }
}

function saveAs(job) {
    function close() {
        document.getElementById("save-as").style.display = "none";
        document.getElementById("sniffer").style.display = "inline";
        setCssProperty("--sa-dlg-list-height", "0");
        document.body.style.height = "auto";
    }

    checkIfFileExists(job.filename);
    fillHeadline();
    document.getElementById("sniffer").style.display = "none";
    document.getElementById("save-as").style.display = "block";
    document.getElementById("sa-title").innerText = _("SaveAsTitle");
    document.getElementById("sa-filename-label").innerText = _("SaveAsFilename");
    document.getElementById("sa-outdir-label").innerText = _("SaveAsOutDir");
    document.getElementById("sa-bookmark-label").innerText = _("SaveAsBookmarkLabel");

    var eFilename = document.getElementById("sa-filename");
    eFilename.innerText = job.filename;
    eFilename.onkeydown = onKeyDown;
    eFilename.onblur = (ev) => {
        job.filename = ev.target.innerText;
        eFilename.innerText = ev.target.innerText;
        checkIfFileExists();
    };

    var eButtonSave = document.getElementById("sa-button-save");
    eButtonSave.innerText = _("SaveAsButtonSave");
    eButtonSave.onclick = () => {
        post2background({
            topic: TOPIC.DOWNLOAD,
            id: saveId,
            master: job.programs.master,
            maps: job.programs.list.length > 0 ? job.programs.list[getDetailIndex(saveId)].maps : undefined,
            filename: options.outdir + "/" + job.filename});
        close();
        flash(document.getElementsByClassName("download")[0]);
    };
    eButtonSave.focus();

    var eButtonCancel = document.getElementById("sa-button-cancel");
    eButtonCancel.innerText = _("SaveAsButtonCancel");
    eButtonCancel.onclick = () => close();

    var eBookmarkCheckbox = setBookmarkControls(options.bookmarks.includes(options.outdir));
    eBookmarkCheckbox.onclick = (ev) => {
        (ev.target.checked)
                ? options.bookmarks.push(options.outdir)
                : options.bookmarks.splice(options.bookmarks.indexOf(options.outdir), 1);

        setBookmarkControls(ev.target.checked);
        port2background.postMessage({
            topic: TOPIC.SET_OPTIONS,
            data: {bookmarks: options.bookmarks.length > 0 ? options.bookmarks.join("\t") : ""}});
    };

    var eBookmarkNext = document.getElementById("sa-bookmark-next");
    eBookmarkNext.innerText = _("SaveAsBookmarkNext");
    eBookmarkNext.onclick = () => {
        var index = options.bookmarks.indexOf(options.outdir) + 1;
        if (index >= options.bookmarks.length) {
            index = 0;
        }
        options.outdir = options.bookmarks[index];
        outDirUpdate();
        fillHeadline();
    };
}

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

function fillHeadline(noSubFolders) {
    var headline = clearChildren(document.getElementById("sa-headline"));

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
        checkIfFileExists();
    }

    function appendButtonOrDiv(active, text, value) {
        var e;
        if (active) {
            e = createElement("button", "flatButton slim");
            e.type = "button";
            e.onclick = clickBack;
            e.value = value.toString();
        } else {
            e = createElement("div", "padded slim");
        }
        e.innerText = text;
        headline.appendChild(e);
    }

    var arr = outDirArray();
    var len = arr.length;
    appendButtonOrDiv(len > 0, "/", -1);
    for (var index = 0; index < len; index++) {
        const active = index < len - 1;
        appendButtonOrDiv(active, arr[index], index);
        appendButtonOrDiv(false, "/");
    }

    var eNewFolder = createElement("div", "padded slim");
    eNewFolder.id = "sa-new-folder";
    eNewFolder.contentEditable = "true";
    eNewFolder.onkeydown = onKeyDown;
    eNewFolder.onblur = (ev) => {
        const s = ev.target.innerText.replace(/\\/g, "/");
        post2background({topic: TOPIC.MKDIRS, data: {name: options.outdir + "/" + s}});
        checkIfFileExists();
    };
    headline.appendChild(eNewFolder);

    setBookmarkControls(options.bookmarks.includes(options.outdir));

    if (isUndefined(noSubFolders) || !noSubFolders) {
        clearChildren(document.getElementById("sa-list"));
        post2background({topic: TOPIC.SUBFOLDERS, data: {root: options.outdir}});
    }
}

function markFieldError(hasError, elementId) {
    var e = document.getElementById(elementId);
    e.style.background = getCssProperty(hasError ? "--color-error-background" : "undef");
    e.invalid = hasError;

    const err = hasError || Array.from(e.parentNode.childNodes).filter(e => e.invalid).length > 0;
    document.getElementById("sa-button-save").disabled = err;

    if (window.navigator.userAgent.indexOf("Windows") >= 0 && options.outdir === "") {
        document.getElementById("sa-button-save").disabled = true;
    }
    return hasError;
}

function fillList(data) {

    if (!isUndefined(data.path) && data.path !== options.outdir) {
        options.outdir = data.path;
        outDirUpdate();
        fillHeadline(true);
    }

    // clean up old data
    var list = clearChildren(document.getElementById("sa-list"));

    // check for invalid path
    markFieldError(!isUndefined(data.error), "sa-new-folder");
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
        e.onclick = (ev) => {
            outDirAppend(ev.target.innerText);
            outDirUpdate();
            fillHeadline();
        };
        list.appendChild(e);
    });

    resizeSaveAs();
}
