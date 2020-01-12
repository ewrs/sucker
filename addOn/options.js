/* global browser */

const TOPIC = {
    BACKGROUND: {
        IN: {
            OPTIONS: "options"},
        OUT: {
            OPTIONS_INIT: "options-init",
            OPTIONS_UPDATE: "options-update"}}};

// Receive messages from the background.
let port2background = browser.runtime.connect({name: "port2options"});
port2background.onMessage.addListener((m) => {
    console.log("Options got message from background: ");
    console.log(m);
    switch (m.topic) {
        case TOPIC.BACKGROUND.IN.OPTIONS:
            document.getElementById("op-active").checked = m.data.active;
            document.getElementById("op-preferred-resolution").value = m.data.preferredResolution.toString();
            document.getElementById("op-parallel-downloads").value = m.data.parallelDownloads.toString();
            break;
    }
});

// Call background for data.
port2background.postMessage({topic: TOPIC.BACKGROUND.OUT.OPTIONS_INIT});

// Send updaten data to background
document.getElementById("op-active").onclick = function (e) {
    console.log("op-active got clicked", e);
    port2background.postMessage({
        topic: TOPIC.BACKGROUND.OUT.OPTIONS_UPDATE,
        data: {active: e.target.checked}});
};
document.getElementById("op-preferred-resolution").onchange = function (e) {
    console.log("op-preferred-resolution got clicked", e);
    port2background.postMessage({
        topic: TOPIC.BACKGROUND.OUT.OPTIONS_UPDATE,
        data: {preferredResolution: e.target.value}});
};
document.getElementById("op-parallel-downloads").onchange = function (e) {
    console.log("op-parallel-downloads got clicked", e);
    port2background.postMessage({
        topic: TOPIC.BACKGROUND.OUT.OPTIONS_UPDATE,
        data: {parallelDownloads: e.target.value}});
};
