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

import java.util.Properties;

public class Settings {

    public enum KEY {
        MAX_THREADS("max-threads"),
        OUT_DIR("out-dir"),
        CMD_DOWNLOAD("cmd-download"),
        CMD_INFO("cmd-info"),
        STATE_WAITING("state.waiting"),
        STATE_RUNNING("state.running"),
        STATE_READY("state.ready"),
        STATE_STOPPED("state.stopped"),
        STATE_ERROR("state.error"),
        ACTION_DELETE("action.delete"),
        ACTION_STOP("action.stop"),
        ACTION_RETRY("action.retry");

        public final String v;

        KEY(String v) {
            this.v = v;
        }
    }

    private static final Properties PROPS = new Properties();

    static void load() {
        PROPS.put(KEY.MAX_THREADS.v, "3");
        PROPS.put(KEY.OUT_DIR.v, System.getProperty("user.home"));
        PROPS.put(KEY.CMD_DOWNLOAD.v, "ffmpeg -hide_banner -i <url> <maps>-c copy -f mp4 <file>");
        PROPS.put(KEY.CMD_INFO.v, "ffmpeg -hide_banner -analyzeduration 2147483647 -probesize 2147483647 -i <url>");
    }

    static String get(KEY key) {
        return PROPS.getProperty(key.v, key.v);
    }

    static int getInt(KEY key) {
        return PROPS.getProperty(key.v) == null ? 0 : Integer.valueOf(PROPS.getProperty(key.v));
    }

    static void set(KEY key, String value) {
        PROPS.put(key.v, value);
    }
}
