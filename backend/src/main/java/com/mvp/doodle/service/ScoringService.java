package com.mvp.doodle.service;

import com.mvp.doodle.model.GameRoom;
import com.mvp.doodle.model.Player;
import org.springframework.stereotype.Service;

@Service
public class ScoringService {
    private static final int BASE_POINTS = 100;
    private static final int POINTS_PER_RANK = 15;

    // Formula to use: floor(BASE * (timeRatio + orderBonus))
    // timeRatio = timeLeft / totalTime
    // OrderBonus = max(0, (totalGuesser - guessOrder) * pntPerRank))

    public int scoreGuesser(int timeLeftSec, int totalTimeSec, int guessOrder, int totalGuessers) {
        double timeRatio = (double) timeLeftSec / totalTimeSec;
        double orderBonus = Math.max(0, (totalGuessers - guessOrder) * POINTS_PER_RANK);
        return Math.max(10, (int)(BASE_POINTS * timeRatio + orderBonus));
    }

    // Formula: floor(BASE * (correct / total))
    public int scoreDrawer(GameRoom room) {
        long correctCount = room.getGuessers().stream().filter(Player::isHasGuessedThisTurn).count();
        int totalGuessers = room.getGuessers().size();

        if (totalGuessers == 0) return 0;
        return (int)(BASE_POINTS * ((double) correctCount / totalGuessers));
    }
}
