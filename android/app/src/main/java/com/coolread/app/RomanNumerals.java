package com.coolread.app;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Roman numerals said in Russian before the text goes to the voice: "Глава IV" is read
 * "глава четвёртая", "XIX век" "девятнадцатый век", "Пётр I" "Пётр первый", and a bare "IV"
 * (a chapter heading) "четыре". Without this the letters are read one by one.
 */
final class RomanNumerals {
    private RomanNumerals() {}

    // Words after which the number is an ordinal of that gender: "глава IV", "том II"
    private static final Set<String> FEMININE = new HashSet<>(Arrays.asList(
        "глава", "часть", "книга", "песнь", "картина", "сцена", "серия", "тетрадь", "редакция", "лекция", "статья", "таблица", "эпоха", "династия"));
    private static final Set<String> MASCULINE = new HashSet<>(Arrays.asList(
        "том", "акт", "раздел", "параграф", "выпуск", "эпизод", "день", "отдел", "период", "съезд", "класс", "полк", "легион"));

    private static final Pattern TOKEN = Pattern.compile("^([^\\p{L}\\p{N}]*)([IVXLCDM]+)(?:-(\\p{L}{1,3}))?([^\\p{L}\\p{N}]*)$");
    private static final Pattern VALID = Pattern.compile("^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$");

    /** Number of a Roman numeral, or 0 if the text is not one. */
    static int value(String s) {
        if (s.isEmpty() || !VALID.matcher(s).matches()) return 0;
        int total = 0, prev = 0;
        for (int i = s.length() - 1; i >= 0; i--) {
            int v = "IVXLCDM".indexOf(s.charAt(i));
            v = new int[]{1, 5, 10, 50, 100, 500, 1000}[v];
            if (v < prev) total -= v; else { total += v; prev = v; }
        }
        return total;
    }

    /** Token i of the sentence with a Roman numeral replaced by Russian words; the token itself otherwise. */
    static String say(String[] tokens, int i) {
        Matcher m = TOKEN.matcher(latinize(tokens[i]));
        if (!m.matches()) return tokens[i];
        String roman = m.group(2), suffix = m.group(3);
        int n = value(roman);
        if (n == 0 || n > 3999) return tokens[i];

        String prev = i > 0 ? word(tokens[i - 1]) : "";
        String prevRaw = i > 0 ? letters(tokens[i - 1]) : "";
        if (prevRaw.length() < 3) prevRaw = ""; // "В XIX" is not a ruler
        String next = i + 1 < tokens.length ? word(tokens[i + 1]) : "";
        boolean alone = tokens.length == 1;

        String form = null; // ordinal form, or null for a plain number
        if (suffix != null) {
            String s = suffix.toLowerCase(Locale.ROOT);
            form = s.equals("го") ? "gen" : s.equals("м") || s.equals("ом") ? "prep" : s.equals("му") ? "dat" : s.endsWith("я") ? "f" : "m";
        } else if (FEMININE.contains(prev)) form = "f";
        else if (MASCULINE.contains(prev)) form = "m";
        else if (next.startsWith("век") || next.startsWith("столет")) {
            form = next.equals("века") || next.equals("столетия") ? "gen" : next.equals("веке") || next.equals("столетии") ? "prep" : next.equals("веку") ? "dat" : "m";
        } else if (!prevRaw.isEmpty() && Character.isUpperCase(prevRaw.charAt(0)) && isCyrillic(prevRaw)) {
            // A ruler: "Пётр I", "Екатерина II", "Людовик XIV"
            form = prevRaw.endsWith("а") || prevRaw.endsWith("я") ? "f" : "m";
        }
        // One letter that may be a Latin word or a mark ("I", "C"): only in a clear context
        // "I. Детство": a numbered heading at the start of the line
        boolean numbered = i == 0 && m.group(1).isEmpty() && m.group(4).matches("[.)]");
        if (roman.length() == 1 && form == null && !alone && !numbered) return tokens[i];

        String words = form == null ? SileroTts.number(String.valueOf(n)) : ordinal(n, form);
        return m.group(1) + words + m.group(4);
    }

    /** Old texts often type Roman numerals with Cyrillic Х, І, С, М: "ХIХ". Only when a Latin numeral letter is there too. */
    private static String latinize(String token) {
        if (!token.matches(".*[IVXLCDM].*") || !token.matches("[^\\p{L}]*[IVXLCDMХІСМ]+(-\\p{L}{1,3})?[^\\p{L}]*")) return token;
        int dash = token.indexOf('-');
        String head = dash < 0 ? token : token.substring(0, dash), tail = dash < 0 ? "" : token.substring(dash);
        return head.replace('Х', 'X').replace('І', 'I').replace('С', 'C').replace('М', 'M') + tail;
    }

    private static boolean isCyrillic(String s) {
        for (int k = 0; k < s.length(); k++) if (Character.UnicodeBlock.of(s.charAt(k)) != Character.UnicodeBlock.CYRILLIC) return false;
        return true;
    }

    private static String letters(String token) {
        return token.replaceAll("[^\\p{L}]", "");
    }

    private static String word(String token) {
        return letters(token).toLowerCase(Locale.ROOT).replace('ё', 'е');
    }

    private static final String[] UNITS = {"", "первый", "второй", "третий", "четвёртый", "пятый", "шестой", "седьмой", "восьмой", "девятый"};
    private static final String[] TEENS = {"десятый", "одиннадцатый", "двенадцатый", "тринадцатый", "четырнадцатый", "пятнадцатый", "шестнадцатый", "семнадцатый", "восемнадцатый", "девятнадцатый"};
    private static final String[] TENS = {"", "", "двадцатый", "тридцатый", "сороковой", "пятидесятый", "шестидесятый", "семидесятый", "восьмидесятый", "девяностый"};
    private static final String[] HUNDREDS = {"", "сотый", "двухсотый", "трёхсотый", "четырёхсотый", "пятисотый", "шестисотый", "семисотый", "восьмисотый", "девятисотый"};

    /** "двадцать четвёртая": the number with only its last word as an ordinal. */
    static String ordinal(int n, String form) {
        List<String> head = new ArrayList<>();
        String last;
        int rest = n % 1000;
        if (rest == 0) {
            last = genitiveStem(n / 1000) + "тысячный";
        } else {
            if (n >= 1000) head.add(SileroTts.number(String.valueOf((n / 1000) * 1000)));
            int h = rest / 100, t = rest % 100;
            if (t == 0) last = HUNDREDS[h];
            else {
                if (h > 0) head.add(SileroTts.number(String.valueOf(h * 100)));
                if (t < 10) last = UNITS[t];
                else if (t < 20) last = TEENS[t - 10];
                else if (t % 10 == 0) last = TENS[t / 10];
                else {
                    head.add(SileroTts.number(String.valueOf((t / 10) * 10)));
                    last = UNITS[t % 10];
                }
            }
        }
        head.add(inflect(last, form));
        return String.join(" ", head);
    }

    private static String genitiveStem(int thousands) {
        switch (thousands) {
            case 2: return "двух";
            case 3: return "трёх";
            default: return "";
        }
    }

    /** Masculine nominative ordinal to the asked form: f, gen, prep, dat or m. */
    static String inflect(String w, String form) {
        if (form.equals("m")) return w;
        boolean soft = w.endsWith("ий"); // третий
        String stem = w.substring(0, w.length() - 2);
        switch (form) {
            case "f": return soft ? stem + "ья" : stem + "ая";
            case "gen": return soft ? stem + "ьего" : stem + "ого";
            case "prep": return soft ? stem + "ьем" : stem + "ом";
            case "dat": return soft ? stem + "ьему" : stem + "ому";
            default: return w;
        }
    }
}
