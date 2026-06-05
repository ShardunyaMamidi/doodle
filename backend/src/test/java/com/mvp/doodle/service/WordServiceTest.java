package com.mvp.doodle.service;

import com.mvp.doodle.service.WordService.GuessResult;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

import java.util.HashSet;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class WordServiceTest {

    private WordService wordService;

    @BeforeEach
    void setUp() {
        wordService = new WordService();
        // @PostConstruct does NOT run in a plain unit test, so we trigger the
        // word-list load ourselves. The test classpath includes the main
        // resources, so this reads the real words_en.txt (or the built-in
        // fallback list if it's missing). Only getChoices() needs this.
        wordService.loadWords();
    }

    // ─────────────────────────────────────────────────────────────────────
    //  checkGuess(guess, word) → CORRECT | CLOSE | WRONG
    //
    //  normalize() lowercases, trims, strips punctuation, collapses spaces.
    //  CLOSE = Levenshtein distance of exactly 1 AND length differs by ≤ 1.
    //
    //  JUnit converts the last CSV column (a String) into the GuessResult
    //  enum automatically.
    // ─────────────────────────────────────────────────────────────────────

    @ParameterizedTest(name = "checkGuess(\"{0}\", \"{1}\") → {2}")
    @CsvSource({
        // exact / normalized matches → CORRECT
        "apple,    apple,   CORRECT",   // identical
        "APPLE,    apple,   CORRECT",   // case-insensitive
        "' apple ',apple,   CORRECT",   // surrounding whitespace trimmed
        "apple!,   apple,   CORRECT",   // punctuation stripped

        // one edit away (and similar length) → CLOSE
        "aple,     apple,   CLOSE",     // 1 deletion
        "apples,   apple,   CLOSE",     // 1 insertion
        "applf,    apple,   CLOSE",     // 1 substitution

        // too different → WRONG
        "banana,   apple,   WRONG",     // unrelated
        "ap,       apple,   WRONG",     // 3 edits away
        "'',       apple,   WRONG",     // empty guess
    })
    void checkGuess(String guess, String word, GuessResult expected) {
        assertThat(wordService.checkGuess(guess, word)).isEqualTo(expected);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  generateBlanks(word) — one "_" per letter, double-space between words.
    //  The expected columns are quoted because they contain spaces.
    // ─────────────────────────────────────────────────────────────────────

    @ParameterizedTest(name = "generateBlanks(\"{0}\") → \"{1}\"")
    @CsvSource({
        "apple,     '_ _ _ _ _'",
        "a,         '_'",
        "ice cream, '_ _ _   _ _ _ _ _'",   // 3 spaces marking the word gap
    })
    void generateBlanks(String word, String expected) {
        assertThat(wordService.generateBlanks(word)).isEqualTo(expected);
    }

    @Test
    @DisplayName("generateBlanks of an empty word is an empty string")
    void generateBlanks_emptyWord() {
        assertThat(wordService.generateBlanks("")).isEmpty();
    }

    // ─────────────────────────────────────────────────────────────────────
    //  revealNextHint(word, currentBlanks)
    //
    //  Reveals one RANDOM hidden letter, so we can't assert which letter is
    //  picked — instead we assert invariants that hold regardless of the
    //  random choice.
    // ─────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Each call reveals exactly one more letter")
    void revealNextHint_revealsExactlyOneLetter() {
        String blanks = wordService.generateBlanks("apple"); // "_ _ _ _ _" → 5 hidden
        assertThat(countUnderscores(blanks)).isEqualTo(5);

        String afterOne = wordService.revealNextHint("apple", blanks);

        // One underscore became a real letter
        assertThat(countUnderscores(afterOne)).isEqualTo(4);
    }

    @Test
    @DisplayName("Revealing every letter reconstructs the word, spaces and all")
    void revealNextHint_fullyRevealed_matchesWord() {
        // Revealing repeatedly removes randomness from the final result: once
        // all letters are shown, the output is deterministic. This proves both
        // that the revealed letters are correct AND that spaces are preserved.
        assertThat(fullyReveal("apple")).isEqualTo("a p p l e");
        assertThat(fullyReveal("ice cream")).isEqualTo("i c e   c r e a m");
    }

    @Test
    @DisplayName("Revealing a space position never happens — the word gap stays blank")
    void revealNextHint_neverRevealsSpace() {
        String fully = fullyReveal("ice cream");
        // The 3-space gap between words is intact (no letter leaked into it)
        assertThat(fully).contains("e   c"); // 'e' end of "ice", gap, 'c' start of "cream"
    }

    @Test
    @DisplayName("Once everything is revealed, another call changes nothing")
    void revealNextHint_alreadyComplete_returnsUnchanged() {
        String fully = fullyReveal("apple"); // "a p p l e"
        assertThat(wordService.revealNextHint("apple", fully)).isEqualTo(fully);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  getChoices(language, n)
    // ─────────────────────────────────────────────────────────────────────

    @ParameterizedTest(name = "getChoices(\"en\", {0}) returns {0} distinct words")
    @ValueSource(ints = {1, 3, 5})
    void getChoices_returnsRequestedCount(int n) {
        List<String> choices = wordService.getChoices("en", n);

        assertThat(choices).hasSize(n);
        // No duplicates — distinct count equals total count
        assertThat(new HashSet<>(choices)).hasSize(n);
    }

    @Test
    @DisplayName("An unknown language falls back to English instead of crashing")
    void getChoices_unknownLanguage_fallsBackToEnglish() {
        List<String> choices = wordService.getChoices("nonexistent-lang", 3);
        assertThat(choices).hasSize(3);
    }

    @Test
    @DisplayName("Requesting more words than exist returns the whole pool, no crash")
    void getChoices_moreThanPool_returnsWholePool() {
        List<String> choices = wordService.getChoices("en", 100_000);
        // Capped at pool size by the min() guard — just confirm it's bounded and non-empty
        assertThat(choices).isNotEmpty();
        assertThat(choices.size()).isLessThan(100_000);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Test helpers
    // ─────────────────────────────────────────────────────────────────────

    private int countUnderscores(String blanks) {
        return (int) blanks.chars().filter(c -> c == '_').count();
    }

    /** Calls revealNextHint repeatedly until no underscores remain. */
    private String fullyReveal(String word) {
        String blanks = wordService.generateBlanks(word);
        while (blanks.indexOf('_') >= 0) {
            blanks = wordService.revealNextHint(word, blanks);
        }
        return blanks;
    }
}
