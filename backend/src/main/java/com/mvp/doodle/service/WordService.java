package com.mvp.doodle.service;

import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.concurrent.ThreadLocalRandom;

@Service
public class WordService {

    private static final Logger log = LoggerFactory.getLogger(WordService.class);
    public enum GuessResult { CORRECT, CLOSE, WRONG }
    private final Map<String, List<String>> wordsByLanguage = new HashMap<>();

    @PostConstruct
    public void loadWords() {
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        try {
            // loading the files from resources/words
            Resource[] resources = resolver.getResources("classpath:words/words_*.txt");
            for (Resource resource : resources) {
                String filename = resource.getFilename();
                if (filename == null || !filename.startsWith("words_") || !filename.endsWith(".txt")) {
                    log.warn("Skipping unexpected resource: {}", resource.getDescription());
                    // Ignoring the file
                    continue;
                }
                String lang = filename.substring(6, filename.length() - 4); // "words_en.txt" → "en"
                List<String> words = new ArrayList<>();
                try (BufferedReader reader = new BufferedReader(
                        new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) {
                        String word = line.trim().toLowerCase();
                        if (!word.isEmpty()) words.add(word);
                    }
                }
                wordsByLanguage.put(lang, words);
                log.info("Loaded {} words for language '{}'", words.size(), lang);
            }
        } catch (Exception e) {
            log.error("Failed to load word lists", e);
        }

        if (wordsByLanguage.isEmpty()) {
            log.warn("No word lists found — using built-in fallback");
            wordsByLanguage.put("en", List.of("apple", "bicycle", "castle", "dragon", "elephant"));
        }
    }

    /** Return n random words for the drawer to choose from. */
    public List<String> getChoices(String language, int n) {
        List<String> pool = new ArrayList<>(
                wordsByLanguage.getOrDefault(language, wordsByLanguage.get("en")));
        Collections.shuffle(pool, new Random(ThreadLocalRandom.current().nextLong()));
        return pool.subList(0, Math.min(n, pool.size()));
    }

    /** Check if a guess matches the current word. */
    public GuessResult checkGuess(String guess, String word) {
        String ng = normalize(guess);
        String nw = normalize(word);
        if (ng.equals(nw)) return GuessResult.CORRECT;
        if (isClose(ng, nw)) return GuessResult.CLOSE;  // not entirely correct but close
        return GuessResult.WRONG;
    }

    /** Generate initial blanks string: "apple" → "_ _ _ _ _", "ice cream" → "_ _ _   _ _ _ _ _" */
    public String generateBlanks(String word) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < word.length(); i++) {
            char c = word.charAt(i);
            if (c == ' ') {
                sb.append("  ");
            } else {
                sb.append("_ ");
            }
        }
        return sb.toString().stripTrailing();
    }

    /**
     * Reveal one random unrevealed letter. Returns the updated blanks string.
     * Example: word="apple", blanks="_ _ _ _ _" → "_ p _ _ _"
     */
    public String revealNextHint(String word, String currentBlanks) {
        // Parse which positions are already revealed
        boolean[] revealed = new boolean[word.length()];
        // currentBlanks is "X " per char, where X is either '_' or the letter
        String[] tokens = currentBlanks.split(" ");
        for (int i = 0; i < word.length() && i < tokens.length; i++) {
            if (!tokens[i].equals("_") && !tokens[i].isEmpty()) {
                revealed[i] = true;
            }
        }

        // Collect hidden non-space positions
        List<Integer> hiddenIndices = new ArrayList<>();
        for (int i = 0; i < word.length(); i++) {
            if (!revealed[i] && word.charAt(i) != ' ') {
                hiddenIndices.add(i);
            }
        }

        if (hiddenIndices.isEmpty()) return currentBlanks; // nothing left to reveal

        // A random letter is picked from hiddenIndices
        int pick = hiddenIndices.get(ThreadLocalRandom.current().nextInt(hiddenIndices.size()));
        revealed[pick] = true;

        // Rebuild blanks string
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < word.length(); i++) {
            char c = word.charAt(i);
            if (c == ' ') {
                sb.append("  ");
            } else if (revealed[i]) {
                sb.append(c).append(' ');
            } else {
                sb.append("_ ");
            }
        }
        return sb.toString().stripTrailing();
    }

    // --- private helpers ---

    // Converting to lowercase, trimming whitespace
    private String normalize(String text) {
        return text.trim().toLowerCase()
                .replaceAll("[^a-z0-9 ]", "")
                .replaceAll("\\s+", " ");
    }

    private boolean isClose(String guess, String word) {
        return levenshtein(guess, word) == 1
                && Math.abs(guess.length() - word.length()) <= 1;
    }

    private int levenshtein(String a, String b) {
        int m = a.length(), n = b.length();
        int[][] dp = new int[m + 1][n + 1];
        for (int i = 0; i <= m; i++) dp[i][0] = i;
        for (int j = 0; j <= n; j++) dp[0][j] = j;
        for (int i = 1; i <= m; i++) {
            for (int j = 1; j <= n; j++) {
                if (a.charAt(i - 1) == b.charAt(j - 1)) {
                    dp[i][j] = dp[i - 1][j - 1];
                } else {
                    dp[i][j] = 1 + Math.min(dp[i - 1][j - 1],
                                   Math.min(dp[i - 1][j], dp[i][j - 1]));
                }
            }
        }
        return dp[m][n];
    }
}
