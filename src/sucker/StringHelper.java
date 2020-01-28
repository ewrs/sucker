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

import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class StringHelper {

    public static String replaceTag(String s, String token, String value) {
        return s.replace("<" + token + ">" + (value.isEmpty() ? " " : ""), value);
    }

    public static String getBetween(String prefix, String delimiter, String line) {
        if (prefix == null || prefix.isEmpty() || line.contains(prefix)) {
            int pos = (prefix == null || prefix.isEmpty()) ? 0 : line.indexOf(prefix) + prefix.length();
            return line.substring(pos).replaceAll(delimiter + ".*$", "");
        }
        return "";
    }

    // time in 1/100 seconds
    public static long timecode(String str) {
        try {
            DateTimeFormatter formatter = DateTimeFormatter.ofPattern("HH:mm:ss.SS");
            LocalTime time = LocalTime.parse(str, formatter);
            return time.toNanoOfDay() / 1000 / 1000 / 10;
        } catch (DateTimeParseException e) {
            return 0;
        }
    }

    public static String[] tokenize(String s) {
        String separator = ", ";
        ArrayList<String> list = new ArrayList<>();
        boolean incomplete = false;
        int n = 0;
        for (String chunk : s.split(separator)) {
            for (int i = 0; i < chunk.length(); i++) {
                switch (chunk.charAt(i)) {
                    case '(':
                        n++;
                        break;
                    case ')':
                        n--;
                        break;
                }
            }
            if (incomplete) {
                int last = list.size() - 1;
                list.set(last, list.get(last) + separator + chunk);
            } else {
                list.add(chunk);
            }
            incomplete = n > 0;
        }
        String result[] = new String[list.size()];
        result = list.toArray(result);
        return result;
    }

    public static List<String> splitCmdLine(String call, String url, String maps, String file) {
        List<String> list = new ArrayList<>();
        call = StringHelper.replaceTag(call, "url", url);
        call = StringHelper.replaceTag(call, "maps", maps);
        list.addAll(Arrays.asList(call.split(" ")));
        list.replaceAll(s -> s.replace("<file>", file));
        return list;
    }
}
