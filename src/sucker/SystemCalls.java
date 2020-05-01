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

import java.awt.Desktop;
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
        public String manifest = "";

        public static class Program {

            public Program(int index) {
                resolution = "";
                bitrate = 0;
                orgIndex = index;
                maps = "";
            }

            public boolean hasValidResolution() {
                return resolution.matches("[1-9][0-9]*x[1-9][0-9]*");
            }

            public String resolution;
            public long bitrate;
            public int orgIndex;
            public String maps;
        }

        public void add(Program program) {
            for (var entry : list) {
                if (entry.resolution.equals(program.resolution) && (entry.bitrate == program.bitrate)) {
                    return;
                }
            }
            list.add(program);
            Collections.sort(list, (Program a, Program b) -> {
                String sa = String.format("%06d%010d", Integer.parseInt(a.resolution.split("x")[0]), a.bitrate / 1000);
                String sb = String.format("%06d%010d", Integer.parseInt(b.resolution.split("x")[0]), b.bitrate / 1000);
                return sb.compareTo(sa);
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
        return waitFor(p, 5);
    }

    public static boolean waitFor(Process p, int timeout) {
        if (p == null) {
            return false;
        }
        try {
            p.waitFor(timeout, TimeUnit.SECONDS);
        } catch (InterruptedException ignore) {
        }
        return !p.isAlive() && p.exitValue() == 0;
    }

    public static void destroy(Process p) {
        if (p == null) {
            return;
        }
        if (p.isAlive()) {
            p.destroyForcibly();
        }
    }

    /**
     * Download a HLS stream.
     *
     * @param url
     * @param maps
     * @param file
     * @return
     * @throws IOException If the start of the process fails.
     */
    public static Process download(String url, String maps, String file) throws IOException {
        List<String> cmd = (maps == null)
                ? StringHelper.splitCmdLine(Settings.get(Settings.KEY.CMD_FFMPEG), url, file)
                : StringHelper.splitCmdLine(Settings.get(Settings.KEY.CMD_DOWNLOAD), url, maps, file);

        ProcessBuilder builder = new ProcessBuilder(cmd);
        builder.redirectErrorStream(true);
        return builder.start();
    }

    /**
     * Play a video file.
     *
     * @param url
     * @throws java.io.IOException
     */
    public static void play(String url) throws IOException {
        Desktop.getDesktop().open(new File(url));
    }

    /**
     * Open file manager at given url.
     *
     * @param url
     * @throws IOException
     */
    public static void explore(String url) throws IOException {
        int pos = url.lastIndexOf("/") + 1;
        if (pos > 0) {
            Desktop.getDesktop().open(new File(url.substring(0, pos)));
        }
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

        List<String> cmd = StringHelper
                .splitCmdLine(Settings.get(Settings.KEY.CMD_INFO), url, "", "");

        ProcessBuilder builder = new ProcessBuilder(cmd);
        builder.redirectErrorStream(true);
        Process p = null;
        try {
            p = builder.start();

            Programs.Program program = new Programs.Program(0);
            try (BufferedReader input = new BufferedReader(new InputStreamReader(p.getInputStream()))) {
                String line;
                long bitrate = 0;
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
                    } else if (line.startsWith("variant_bitrate")) {
                        bitrate = Long.parseLong(line.split(" : ")[1]);
                    } else if (line.startsWith("Program")) {
                        program = new Programs.Program(program.orgIndex + (program.hasValidResolution() ? 1 : 0));
                    } else if (line.startsWith("Stream") && line.contains(" Video: ")) {
                        String[] t = StringHelper.tokenize(line);
                        program.maps = "-map " + StringHelper.getBetween("Stream #", ": ", t[0]) + " ";
                        program.resolution = StringHelper.getBetween(null, " ", t[2]);
                        program.bitrate = bitrate;
                        if (program.hasValidResolution()) {
                            result.add(program);
                        }
                    } else if (line.startsWith("Stream") && line.contains(" Audio: ")) {
                        program.maps += "-map " + StringHelper.getBetween("Stream #", ": ", line) + " ";
                    } else if (line.contains("] Opening 'http") && line.endsWith("' for reading")) {
                        String s = StringHelper.getBetween("://", "' for reading", line).replaceAll("\\?.*", "");
                        if (s.endsWith(".m3u8")) {
                            s = s.substring(s.indexOf("/"));
                            if (!Arrays.asList(result.manifest.split(" ")).contains(s)) {
                                result.manifest += (result.manifest.isEmpty() ? "" : " ") + s;
                            }
                        }
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
        return new File(System.getProperty("user.home")).getAbsolutePath();
    }

    public static String[] listSubFolders(String root) throws IOException {
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
        boolean hidden = !(win && f.getFileName() == null) && Files.isHidden(f);
        if (!Files.exists(f) || !Files.isDirectory(f) || hidden) {
            throw new IOException("Invalid folder name '" + root + "'.");
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
    }
}
