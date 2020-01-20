
/* global browser */
/* global TOPIC */

// Receive messages from the background.
let port2background = browser.runtime.connect({name: "port2options"});
function post2background(msg) {
    port2background.postMessage(msg);
}
port2background.onMessage.addListener((m) => {
//    console.log("Options got message from background", m);
    switch (m.topic) {
        case TOPIC.GET_OPTIONS:
            document.getElementById("op-preferred-resolution").value = m.data.preferredResolution.toString();
            document.getElementById("op-parallel-downloads").value = m.data.parallelDownloads.toString();
            break;
    }
});

// Call background for data.
post2background({topic: TOPIC.GET_OPTIONS});

// Send updated data to background
document.getElementById("op-preferred-resolution").onchange = function (e) {
    post2background({topic: TOPIC.SET_OPTIONS, data: {preferredResolution: e.target.value}});
};
document.getElementById("op-parallel-downloads").onchange = function (e) {
    post2background({topic: TOPIC.SET_OPTIONS, data: {parallelDownloads: e.target.value}});
};
