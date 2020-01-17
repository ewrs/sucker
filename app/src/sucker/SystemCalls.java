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
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.logging.Level;
import java.util.logging.Logger;

public class SystemCalls {

    public static class Programs {

        public String master = null;
        public String duration = null;
        public List<Program> list = new ArrayList<>();

        public static class Program {

            public Program(int index) {
                url = "";
                resolution = "";
                orgIndex = index;
            }

            public String url;
            public String resolution;
            public int orgIndex;
        }

        public void add(Program program) {
            for (var entry : list) {
                if (entry.resolution.equals(program.resolution)) {
                    return;
                }
            }
            list.add(program);
            Collections.sort(list, (Program a, Program b) -> {
                return Integer.parseInt(b.resolution.split("x")[0]) - Integer.parseInt(a.resolution.split("x")[0]);
            });
        }
    }

    public static void clearInputBuffer(Process p) {
        if (p == null) {
            return;
        }
        try (BufferedReader input = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
            while (input.readLine() != null) {
            }
        } catch (IOException ex) {
            Logger.getLogger(SystemCalls.class.getName()).log(Level.SEVERE, null, ex);
        }
    }

    public static boolean waitFor(Process p) {
        if (p == null) {
            return false;
        }
        try {
            p.waitFor(5, TimeUnit.SECONDS);
        } catch (InterruptedException ignore) {
        }
        return !p.isAlive() && p.exitValue() == 0;
    }

    public static void destroy(Process p) {
        if (p == null) {
            return;
        }
        if (p.isAlive()) {
            p.destroy();
        }
    }

    /**
     * Download a HLS stream.
     *
     * @param url
     * @param file
     * @return
     * @throws IOException If the start of the process fails.
     */
    public static Process download(String url, String file) throws IOException {
        List<String> cmd = new ArrayList<>();
        String call = Settings.get(Settings.KEY.CMD_DOWNLOAD);
        call = StringHelper.replaceTag(call, "url", url);
        call = StringHelper.replaceTag(call, "file", file);
        cmd.addAll(Arrays.asList(call.split(" ")));

        ProcessBuilder builder = new ProcessBuilder(cmd);
        builder.redirectErrorStream(true);
        return builder.start();
    }

    /**
     * Play a video file.
     *
     * @param url
     */
    public static void play(String url) {
        List<String> cmd = new ArrayList<>();
        String call = Settings.get(Settings.KEY.CMD_PLAY);
        call = StringHelper.replaceTag(call, "url", url);
        cmd.addAll(Arrays.asList(call.split(" ")));

        ProcessBuilder builder = new ProcessBuilder(cmd);
        builder.redirectErrorStream(true);
        new Thread(() -> {
            try {
                Process p = builder.start();
                SystemCalls.clearInputBuffer(p);
                SystemCalls.waitFor(p);
                SystemCalls.destroy(p);
            } catch (IOException ex) {
                Logger.getLogger(SystemCalls.class.getName()).log(Level.SEVERE, null, ex);
            }
        }).start();
    }

    /**
     * Get stream info from master.
     *
     * @param url Url of the master.
     * @return A list of program info objects or 'null' on error.
     */
    public static Programs info(String url) {
        Programs result = new Programs();
        result.master = url;

        List<String> cmd = new ArrayList<>();
        String call = Settings.get(Settings.KEY.CMD_INFO);
        call = StringHelper.replaceTag(call, "url", url);
        cmd.addAll(Arrays.asList(call.split(" ")));

        ProcessBuilder builder = new ProcessBuilder(cmd);
        builder.redirectErrorStream(true);
        Process p = null;
        try {
            p = builder.start();

            Programs.Program program = new Programs.Program(0);
            try (BufferedReader input = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
                List<String> subStreamUrls = new ArrayList<>();
                String line;
                while ((line = input.readLine()) != null) {
                    line = line.trim();
                    if (line.startsWith("Duration")) {
                        result.duration = StringHelper.getBetween("Duration: ", ",", line);
                        while (result.duration.length() > 1 && (result.duration.startsWith("0") || result.duration.startsWith(":"))) {
                            result.duration = result.duration.substring(1);
                        }
                        if (result.duration.contains(".")) {
                            result.duration = result.duration.substring(0, result.duration.indexOf("."));
                        }
                    } else if (line.startsWith("Stream") && line.contains(" Video: ")) {
                        String[] t = StringHelper.tokenize(line);
                        program.resolution = StringHelper.getBetween(null, " ", t[2]);
                        program.url = subStreamUrls.get(0);
                        subStreamUrls.remove(0);
                        if (program.resolution.matches("[1-9][0-9]*x[1-9][0-9]*")) {
                            result.add(program);
                            program = new Programs.Program(program.orgIndex + 1);
                        }
                    } else if (line.contains("] Opening 'http") && line.endsWith("' for reading")) {
                        subStreamUrls.add(line.replaceAll(".*Opening '", "").replace("' for reading", ""));
                    }
                }
            }
        } catch (IOException ex) {
            Logger.getLogger(SystemCalls.class.getName()).log(Level.SEVERE, null, ex);
            result = null;
        }
        waitFor(p);
        destroy(p);

        return result != null && result.duration != null ? result : null;
    }

    public static String getHomeFolder() {
        var path = new File(System.getProperty("user.home")).getAbsolutePath();
        return path.replace("\\", "/");
    }

    public static String[] listSubFolders(String root) {
        boolean win = System.getProperty("os.name").contains("Windows");
        if (win) {
            if (root.startsWith("/")) {
                root = root.substring(1);
            }
            if (root.isEmpty()) {
                ArrayList<String> list = new ArrayList<>();
                for (File f : File.listRoots()) {
                    String name = f.getPath();
                    list.add(name.substring(0, name.length() - 1));
                }
                String result[] = new String[list.size()];
                result = list.toArray(result);
                return result;
            }
            root += "/";
        }

        Path f = Path.of(root);
        try {
            boolean hidden = Files.isHidden(f) && !(win && f.endsWith(":\\"));
            if (!Files.exists(f) || !Files.isDirectory(f) || hidden) {
                return new String[]{"...invalid root"};
            }
            ArrayList<String> list = new ArrayList<>();
            Files.list(f).forEach((Path p) -> {
                try {
                    if (Files.isDirectory(p) && Files.isReadable(p) && !Files.isHidden(p)) {
                        list.add(p.toFile().getName());
                    }
                } catch (IOException ex) {
                    Logger.getLogger(SystemCalls.class.getName()).log(Level.SEVERE, null, ex);
                }
            });
            String result[] = new String[list.size()];
            return list.toArray(result);
        } catch (IOException ex) {
            return new String[]{"..." + ex.getMessage()};
        }
    }
}
