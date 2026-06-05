package com.mvp.doodle.service;

import com.mvp.doodle.model.GameRoom;
import com.mvp.doodle.model.Player;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.MethodSource;

import java.util.ArrayList;
import java.util.List;
import java.util.stream.Stream;

import static org.assertj.core.api.Assertions.assertThat;

class ScoringServiceTest {

    private final ScoringService scoringService = new ScoringService();

    // ─────────────────────────────────────────────────────────────────────
    //  scoreGuesser(timeLeftSec, totalTimeSec, guessOrder, totalGuessers)
    //
    //  Formula:
    //    timeRatio  = timeLeftSec / totalTimeSec
    //    orderBonus = max(0, (totalGuessers - guessOrder) * 15)
    //    score      = max(10, (int)(100 * timeRatio + orderBonus))
    // ─────────────────────────────────────────────────────────────────────

    @ParameterizedTest(name = "{4}")
    @CsvSource({
        "60, 80, 1, 6, 'first guesser lots of time → 150',          150",
        "40, 80, 1, 5, 'first guesser half time → 110',             110",
        "40, 80, 3, 5, 'third guesser half time → 80',               80",
        " 2, 80, 6, 6, 'last guesser almost no time → floor at 10',  10",
        " 0, 80, 4, 4, 'zero time remaining → floor at 10',          10",
    })
    @DisplayName("scoreGuesser")
    void scoreGuesser(int timeLeft, int total, int order, int guessers, String label, int expected) {
        assertThat(scoringService.scoreGuesser(timeLeft, total, order, guessers))
                .as(label)
                .isEqualTo(expected);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  scoreDrawer(room)
    //
    //  Formula: (int)(100 * correctGuessers / totalGuessers), or 0 if none.
    // ─────────────────────────────────────────────────────────────────────

    @ParameterizedTest(name = "{2}")
    @MethodSource("drawerScoringCases")
    @DisplayName("scoreDrawer")
    void scoreDrawer(int guesserCount, int correctCount, String label, int expected) {
        GameRoom room = roomWith(guesserCount, correctCount);
        assertThat(scoringService.scoreDrawer(room))
                .as(label)
                .isEqualTo(expected);
    }

    static Stream<Arguments> drawerScoringCases() {
        return Stream.of(
                Arguments.of(3, 3, "all guessed → 100",              100),
                Arguments.of(3, 0, "none guessed → 0",                 0),
                Arguments.of(4, 2, "half guessed → 50",               50),
                Arguments.of(0, 0, "no guessers at all → 0 (no divide-by-zero)", 0)
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Test helper
    // ─────────────────────────────────────────────────────────────────────

    private GameRoom roomWith(int guesserCount, int correctCount) {
        GameRoom room = new GameRoom("room-1", "CODE12", true);

        Player drawer = new Player("drawer-sid", "Drawer", 0);
        drawer.setConnected(true);
        room.getPlayers().put(drawer.getSessionId(), drawer);

        List<String> drawerOrder = new ArrayList<>();
        drawerOrder.add(drawer.getSessionId());

        for (int i = 0; i < guesserCount; i++) {
            Player guesser = new Player("guesser-" + i, "Guesser" + i, i + 1);
            guesser.setConnected(true);
            guesser.setHasGuessedThisTurn(i < correctCount);
            room.getPlayers().put(guesser.getSessionId(), guesser);
            drawerOrder.add(guesser.getSessionId());
        }

        room.setDrawerOrder(drawerOrder);
        room.setCurrentDrawerIndex(0);

        return room;
    }
}
