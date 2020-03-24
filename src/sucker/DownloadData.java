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

        private Process p = null;

        @Override
        public void run() {
            String lastLine = null;
            try {
                p = SystemCalls.download(url, maps, getPartFileName());
                updateOutStream(p.getOutputStream());
                try (BufferedReader input = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
                    String line;
                    while ((line = input.readLine()) != null) {
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

        public void destroyIfNecessary() {
            new Thread() {
                @Override
                public void run() {
                    SystemCalls.waitFor(p, 30);
                    SystemCalls.destroy(p);
                }
            }.start();
        }
    }

    private static final List<DownloadData> DATALIST = new ArrayList<>();
    private final Set<ItemChangeListener> itemChangeListeners;
    private final String url;
    private final String maps;
    private final String fileName;
    private Worker worker;
    private long duration;
    private OutputStream processOutputStream = null;
    final int id;
    stateType state;
    int progress;
    String error;

    private DownloadData(int pId, String pUrl, String pMaps, String pFileName, ItemChangeListener pListener) {
        itemChangeListeners = new HashSet<>();

        id = pId;
        url = pUrl;
        maps = pMaps;
        fileName = pFileName;
        state = stateType.waiting;
        worker = null;
        progress = 0;
        duration = 0;
        error = null;

        addItemChangeListener(pListener);
    }

    static void enqueue(int pId, String pUrl, String pMaps, String pFileName, ItemChangeListener pListener) {
        DownloadData item = new DownloadData(pId, pUrl, pMaps, pFileName, pListener);
        DATALIST.add(item);

        if (new File(item.fileName).exists()) {
            item.state = stateType.error;
            item.error = "File '" + item.fileName + "' already exists.";
            ItemChangeListener.emitItemChange(item.itemChangeListeners, item);
            return;
        }

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
        if (processOutputStream != null) {
            processOutputStream.write(data.getBytes());
            processOutputStream.flush();
        }
    }

    public synchronized void setError(String msg) {
        error = msg;
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
                    error = ex.getMessage();
                    progress = 0;
                    ItemChangeListener.emitItemChange(itemChangeListeners, this);
                    return false;
                }

                state = newState;
                error = null;
                progress = 0;
                ItemChangeListener.emitItemChange(itemChangeListeners, this);

                worker = new Worker();
                worker.start();
                break;

            case ready:
                if (state != stateType.running && state != stateType.stopped) {
                    return false;
                }
                if (state == stateType.running || duration == 0) {
                    renamePartFile();
                    progress = 1000;
                    state = stateType.ready;
                } else {
                    removePartFile();
                    progress = 0;
                    state = stateType.stopped;
                }
                startWaiting();
                break;

            case stopped:
                if (state != stateType.running) {
                    return false;
                }
                try {
                    writeOut("q");
                    worker.destroyIfNecessary();
                } catch (IOException ex) {
                    Logger.getLogger(DownloadData.class.getName()).log(Level.SEVERE, null, ex);
                }
                state = newState;
                break;

            case error:
                if (state != stateType.running && state != stateType.stopped) {
                    return false;
                }
                state = newState;
                removePartFile();
                progress = 0;
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
