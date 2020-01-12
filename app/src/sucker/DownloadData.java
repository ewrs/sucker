/*
 * The MIT License
 *
 * Copyright 2020 Frank Ewers.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

package sucker;

import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;

public class DownloadData {

    public enum stateType {
        waiting, running, stopped, error, ready, killed, purged
    };

    private class Worker extends Thread {

        @Override
        public void run() {
            Process p = null;
            String lastLine = null;
            try {
                p = SystemCalls.download(url, getPartFileName());
                updateOutStream(p.getOutputStream());
                try (BufferedReader input = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
                    String line;
                    while (!isInterrupted() && ((line = input.readLine()) != null)) {
                        line = line.trim();
                        lastLine = line;
                        if (line.startsWith("Duration:")) {
                            updateDuration(StringHelper.timecode(StringHelper.getBetween("Duration: ", ", ", line)));
                        } else if (line.startsWith("frame=") && line.endsWith("x")) {
                            updateProgress(StringHelper.timecode(StringHelper.getBetween(" time=", " ", line)) * 10);
                        } else if (line.contains("Overwrite ? [y/N]")) {
                            writeOut("\n");
                        }
                    }
                } catch (IOException ex) {
                    Logger.getLogger(DownloadData.class.getName()).log(Level.SEVERE, null, ex);
                }
            } catch (IOException ex) {
                Logger.getLogger(DownloadData.class.getName()).log(Level.SEVERE, null, ex);
            }

            if (SystemCalls.waitFor(p)) {
                setState(stateType.ready);
            } else {
                setError(lastLine);
            }

            SystemCalls.destroy(p);
        }
    }

    private static final List<DownloadData> DATALIST = new ArrayList<>();
    private final Set<ItemChangeListener> itemChangeListeners;
    private final String url;
    private final String fileName;
    private Worker worker;
    private long duration;
    private OutputStream processOutputStream = null;
    final int id;
    stateType state;
    int progress;
    String message;

    private DownloadData(int pId, String pUrl, String pFileName, ItemChangeListener pListener) {
        itemChangeListeners = new HashSet<>();

        id = pId;
        url = pUrl;
        fileName = pFileName;
        state = stateType.waiting;
        worker = null;
        progress = 0;
        duration = 0;
        message = null;

        addItemChangeListener(pListener);
    }

    static void enqueue(int pId, String pUrl, String pFileName, ItemChangeListener pListener) {
        DATALIST.add(new DownloadData(pId, pUrl, pFileName, pListener));
        startWaiting();
    }

    static void destroy(DownloadData item) {
        DATALIST.remove(item);
        ItemChangeListener.emitItemChange(item.itemChangeListeners, item);
        item.itemChangeListeners.clear();
    }

    public synchronized void updateOutStream(OutputStream outStream) {
        processOutputStream = outStream;
    }

    public synchronized void updateDuration(long length) {
        duration = length;
    }

    public synchronized void updateProgress(long now) {
        progress = (int) (duration == 0 ? now : ((100. * (double) now) / (double) duration));
        ItemChangeListener.emitItemChange(itemChangeListeners, this);
    }

    public synchronized void writeOut(String data) throws IOException {
        processOutputStream.write(data.getBytes());
        processOutputStream.flush();
    }

    public synchronized void setError(String msg) {
        message = msg;
        setState(stateType.error);
    }

    public synchronized boolean setState(stateType newState) {
        if (state == newState) {
            return false;
        }
        switch (newState) {
            case waiting:
                if (state != stateType.stopped && state != stateType.error) {
                    return false;
                }
                state = stateType.waiting;
                startWaiting();
                break;

            case running:
                if (state != stateType.waiting || hasMaxThreads()) {
                    return false;
                }

                try {
                    File f = new File(fileName);
                    if (f.exists()) {
                        throw new IOException("File '" + fileName + "' already exists.");
                    }
                    f.createNewFile();
                } catch (IOException ex) {
                    state = stateType.error;
                    message = ex.getMessage();
                    progress = 0;
                    ItemChangeListener.emitItemChange(itemChangeListeners, this);
                    return false;
                }

                state = newState;
                ItemChangeListener.emitItemChange(itemChangeListeners, this);

                worker = new Worker();
                worker.start();
                break;

            case ready:
                if (state != stateType.running) {
                    return false;
                }
                state = newState;

                worker.interrupt();
                progress = 1000;
                renamePartFile();
                startWaiting();
                break;

            case stopped:
                if (state == stateType.running && duration == 0) {
                    try { // Stop live stream gracefully.
                        writeOut("q");
                        return true;
                    } catch (IOException ex) {
                        Logger.getLogger(DownloadData.class.getName()).log(Level.SEVERE, null, ex);
                    }
                }
            // fall through
            case error:
                if (state != stateType.running) {
                    return false;
                }
                state = newState;

                worker.interrupt();
                progress = 0;
                removePartFile();
                startWaiting();
                break;

            case killed:
                if (state != stateType.ready && state != stateType.waiting) {
                    return false;
                }

                synchronized (DATALIST) {
                    if (state == stateType.ready) {
                        new File(fileName).delete();
                    }
                    state = stateType.purged;
                    destroy(this);
                }
                return true;
        }

        ItemChangeListener.emitItemChange(itemChangeListeners, this);
        return true;
    }

    public static DownloadData get(String fn) {
        synchronized (DATALIST) {
            return DATALIST.stream().filter(data -> data.fileName.equals(fn)).findAny().orElse(null);
        }
    }

    public static DownloadData get(int id) {
        synchronized (DATALIST) {
            return DATALIST.stream().filter(data -> data.id == id).findAny().orElse(null);
        }
    }

    public static String getFilename(int id) {
        return get(id).fileName;
    }

    public static void stop() {
        clearIdle();
        DownloadData gotcha;
        synchronized (DATALIST) {
            do {
                gotcha = DATALIST.stream()
                        .filter(data -> data.state == stateType.waiting)
                        .sorted((o1, o2) -> o1.id - o2.id)
                        .findFirst()
                        .orElse(null);
                if (gotcha != null) {
                    destroy(gotcha);
                }
            } while (gotcha != null);
            do {
                gotcha = DATALIST.stream()
                        .filter(data -> data.state == stateType.running)
                        .sorted((o1, o2) -> o1.id - o2.id)
                        .findFirst()
                        .orElse(null);
                if (gotcha != null) {
                    gotcha.setState(stateType.stopped);
                }
            } while (gotcha != null);
        }
    }

    private static boolean hasMaxThreads() {
        synchronized (DATALIST) {
            return DATALIST.stream().filter(data -> data.state == stateType.running).count()
                    >= Settings.getInt(Settings.KEY.MAX_THREADS);
        }
    }

    private static void startWaiting() {
        if (!hasMaxThreads()) {
            DownloadData gotcha;
            synchronized (DATALIST) {
                gotcha = DATALIST.stream()
                        .filter(data -> data.state == stateType.waiting)
                        .sorted((o1, o2) -> o1.id - o2.id)
                        .findFirst()
                        .orElse(null);
            }
            if (gotcha != null) {
                gotcha.setState(stateType.running);
                startWaiting();
            }
        }
    }

    public static void clearIdle() {
        DownloadData gotcha;
        do {
            synchronized (DATALIST) {
                gotcha = DATALIST.stream()
                        .filter(data -> data.state != stateType.waiting && data.state != stateType.running)
                        .findAny()
                        .orElse(null);

                if (gotcha != null) {
                    gotcha.state = stateType.purged;
                    destroy(gotcha);
                }
            }
        } while (gotcha != null);
    }

    public final boolean addItemChangeListener(ItemChangeListener listener) {
        return itemChangeListeners.add(listener);
    }

    private String getPartFileName() {
        return fileName + ".part";
    }

    private void removePartFile() {
        new File(getPartFileName()).delete();
        new File(fileName).delete();
    }

    private void renamePartFile() {
        new File(fileName).delete();
        new File(getPartFileName()).renameTo(new File(fileName));
    }
}
