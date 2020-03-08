
/* global browser */
/* global APP_ERROR */
/* global options */

function checkAppError() {
    if (options.appError === APP_ERROR.NONE) {
        return;
    }

    document.body.style.width = "640px";
    document.body.style.overflow = "hidden";

    document.getElementById("tabline").style.display = "none";
    document.getElementById("sniffer").style.display = "none";
    document.getElementById("blind-bottom").style.display = "none";
    document.getElementById("error").style.display = "block";

    document.getElementById("error-hint").innerText = (options.appError === APP_ERROR.CONNECT)
            ? _("ErrorAppConnect")
            : _("ErrorAppVersion", [options.appVersion, options.minAppVersion]);

    var inst = document.getElementById("error-action-install");
    inst.innerText = _("ErrorAppInstall");
    inst.onclick = function () {
        const m = browser.runtime.getManifest();
        browser.downloads.download({
            url: m.homepage_url + "/releases/download/v" + m.version + "/suckerApp-v" + m.version + "-setup.exe"
        });
    };

    var rtfm = document.getElementById("error-action-rtfm");
    rtfm.innerText = _("ErrorAppRTFM");
    rtfm.onclick = () => browser.tabs.create({url: _("LinkWikiTechnology")});
}
