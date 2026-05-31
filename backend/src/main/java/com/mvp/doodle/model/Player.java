package com.mvp.doodle.model;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class Player {

    private String sessionId;
    private String name;
    private int avatarId;
    private int score;
    private boolean hasGuessedThisTurn;
    private int guessOrder;
    private boolean connected;

    public Player(String sessionId, String name, int avatarId) {
        this.sessionId = sessionId;
        this.name = name;
        this.avatarId = avatarId;
    }

    public void resetForNewTurn() {
        this.hasGuessedThisTurn = false;
        this.guessOrder = 0;
    }
}
