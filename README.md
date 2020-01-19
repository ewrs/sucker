# sucker
HLS Downloader.<br>
A Firefox AddOn with additional native app.

## Build
Requires Ant and OpenJDK 11 for building. Build command:

> `ant clean compile deploy`

A new folder `dist` with a `suckerApp.jar` and a `sucker.xpi` will be created in the root directory.

## Install
The Java app requires [FFmpeg](https://ffmpeg.org/download.html) at runtime.<br>
FFmpeg must be installed so that it can be called from the folder where the `suckerApp.jar` lies. 

The Firefox AddOn uses native messaging to communicate with the Java app. Please follow the [Setup instructions on MDN web docs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging) to install the native Java app. Some useful file templates can be found in `xpi/install`.

Check [Mozilla support](https://support.mozilla.org/en-US/kb/add-on-signing-in-firefox#w_what-are-my-options-if-i-want-to-use-an-unsigned-add-on-advanced-users) to find out how to run an unsigned AddOn.

## License
Licensed under the MIT License.

## Warning
The state of this project is still experimental.
