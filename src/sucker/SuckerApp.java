/*
 * MIT License
 *
 * Copyright (c) 2020 ewrs
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

package sucker;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.StringWriter;
import java.net.URL;
import java.util.ArrayList;
import java.util.Base64;
import java.util.jar.Attributes;
import java.util.jar.Manifest;
import java.util.logging.FileHandler;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.logging.SimpleFormatter; // Don't optimize!

public class SuckerApp implements ItemChangeListener {

    final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    @Override
    public void onItemChange(ItemChangeEvent ev) {
        sendProgressInfo(ev.data);
    }

    SuckerApp() {
        try { // Configure the logger
            Logger logger = Logger.getLogger(SuckerApp.class.getName());
            while (logger.getParent() != null) {
                logger = logger.getParent();
            }
            FileHandler fh = new FileHandler();
            fh.setFormatter(new SimpleFormatter());
            logger.addHandler(fh);
            logger.setLevel(Level.INFO);
        } catch (IOException | SecurityException ex) {
            Logger.getLogger(SuckerApp.class.getName()).log(Level.SEVERE, null, ex);
        }

        Settings.load();
    }

    void writeOut(Object obj) throws IOException {
        StringWriter stringRes = new StringWriter();
        OBJECT_MAPPER.writeValue(stringRes, obj);
        String message = stringRes.toString();
        Logger.getLogger(SuckerApp.class.getName()).log(Level.INFO, "writeOut: {0}", message);
        int len = message.length();
        System.out.write(new byte[]{(byte) len, (byte) (len >> 8), (byte) (len >> 16), (byte) (len >> 24)});
        System.out.write(message.getBytes("UTF-8"));
        System.out.flush();
    }

    void sendProgressInfo(DownloadData data) {
        try {
            Messages.Response r = new Messages.Response();
            r.topic = "download";
            r.data.put("id", Integer.toString(data.id));
            r.data.put("progress", Integer.toString(data.progress));
            r.data.put("state", data.state.name());
            r.data.put("error", data.error);
            writeOut(r);
        } catch (IOException ex) {
            Logger.getLogger(SuckerApp.class.getName()).log(Level.SEVERE, null, ex);
        }
    }

    void exec(byte[] buffer) throws IOException {
        Messages.Request req = OBJECT_MAPPER.readValue(buffer, Messages.Request.class);
        switch (req.topic) {
            case "probe": {
                Messages.Response r = new Messages.Response();
                r.topic = req.topic;
                r.data.put("id", req.data.get("id"));
                r.data.put("programs", SystemCalls.info(req.data.get("url")));
                writeOut(r);
                break;
            }
            case "download": {
                DownloadData.enqueue(Integer.parseInt(req.data.get("id")), req.data.get("url"), req.data.get("maps"), req.data.get("filename"), this);
                break;
            }
            case "action": {
                DownloadData data = DownloadData.get(Integer.parseInt(req.data.get("id")));
                switch (data.state) {
                    case waiting:
                    case ready:
                        data.setState(DownloadData.stateType.killed);
                        break;
                    case running:
                        data.setState(DownloadData.stateType.stopped);
                        break;
                    case stopped:
                    case error:
                        data.setState(DownloadData.stateType.waiting);
                        break;
                }
                break;
            }
            case "purge": {
                DownloadData.clearIdle();
                break;
            }
            case "home": {
                Messages.Response r = new Messages.Response();
                r.topic = req.topic;
                r.data.put("home", SystemCalls.getHomeFolder());
                writeOut(r);
                break;
            }
            case "subfolders": {
                Messages.Response r = new Messages.Response();
                r.topic = req.topic;

                var enc = Base64.getEncoder();
                ArrayList<String> list = new ArrayList<>();
                try {
                    for (String s : SystemCalls.listSubFolders(req.data.get("root"))) {
                        list.add(enc.encodeToString(s.getBytes("UTF-8")));
                    }
                    r.data.put("list", list);
                } catch (IOException e) {
                    r.data.put("error", e.getMessage());
                }
                writeOut(r);
                break;
            }
            case "set-options": {
                Settings.set(Settings.KEY.MAX_THREADS, req.data.get(Settings.KEY.MAX_THREADS.v));
                break;
            }
            case "play": {
                SystemCalls.play(DownloadData.getFilename(Integer.parseInt(req.data.get("id"))));
                break;
            }
            case "version": {
                String v = "";
                Class clazz = SuckerApp.class;
                String classPath = clazz.getResource(clazz.getSimpleName() + ".class").toString();
                if (classPath.startsWith("jar")) {
                    String manifestPath = classPath.substring(0, classPath.lastIndexOf("!") + 1) + "/META-INF/MANIFEST.MF";
                    Attributes attrs = new Manifest(new URL(manifestPath).openStream()).getMainAttributes();
                    v = attrs.getValue(Attributes.Name.SPECIFICATION_VERSION);
                }
                Messages.Response r = new Messages.Response();
                r.topic = req.topic;
                r.data.put("version", v);
                writeOut(r);
            }
        }
    }

    // Receive input via stdin
    void run() {
        while (true) {
            try {
                int size = 4;
                {
                    int n = 0, offset = 0;
                    byte[] b = new byte[size];
                    while (offset < size && n >= 0) {
                        n = System.in.read(b, offset, size - offset); // Read the size of the message
                        if (n < 0) {
                            throw new IOException("System.in.read() returned " + n);
                        }
                        offset += n;
                    }
                    Logger.getLogger(SuckerApp.class.getName()).log(Level.INFO, String.format("Binary length 0..3: %02x:%02x:%02x:%02x", b[0], b[1], b[2], b[3]));
                    size = ((b[3] & 0xFF) << 24) | ((b[2] & 0xFF) << 16) | ((b[1] & 0xFF) << 8) | (b[0] & 0xFF);
                    Logger.getLogger(SuckerApp.class.getName()).log(Level.INFO, "Received message length={0}", size);
                }
                byte[] buffer = new byte[size];
                {
                    int n = 0, offset = 0;
                    while (offset < size && n >= 0) {
                        n = System.in.read(buffer, offset, size - offset); // Read the message
                        if (n < 0) {
                            throw new IOException("System.in.read() returned " + n);
                        }
                        offset += n;
                    }
                }
                Logger.getLogger(SuckerApp.class.getName()).log(Level.INFO, "Received message text: {0}", new String(buffer, "UTF-8"));
                exec(buffer);
            } catch (IOException ex) {
                Logger.getLogger(SuckerApp.class.getName()).log(Level.SEVERE, null, ex);
                break;
            }
        }
    }

    public static void main(String args[]) {
        new SuckerApp().run();
    }
}
