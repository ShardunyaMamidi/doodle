package com.mvp.doodle.model;

import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.Setter;

import java.util.List;

@Getter
@Setter
@AllArgsConstructor
public class DrawEvent {

    private String type;        // "stroke" | "clear" | "undo"
    private String strokeId;    // groups streamed batches into one stroke; null for clear/undo
    private List<double[]> points;
    private String color;
    private float lineWidth;
    private long timestamp;
}
