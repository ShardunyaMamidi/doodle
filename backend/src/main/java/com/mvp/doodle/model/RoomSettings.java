package com.mvp.doodle.model;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class RoomSettings {

    private int maxPlayers = 8;
    private int rounds = 3;
    private int turnTimeSeconds = 80;
    private int wordSelectionSeconds = 15;
    private String language = "en";
}
