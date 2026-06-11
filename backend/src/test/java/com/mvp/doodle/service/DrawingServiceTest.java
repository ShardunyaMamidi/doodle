package com.mvp.doodle.service;

import com.mvp.doodle.dto.inbound.gameplay.DrawMessageIn;
import com.mvp.doodle.model.DrawEvent;
import com.mvp.doodle.model.GameRoom;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DrawingServiceTest {

    private DrawingService drawingService;
    private GameRoom room;

    @BeforeEach
    void setUp() {
        drawingService = new DrawingService();
        room = new GameRoom("room-1", "CODE12", true);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  addStroke
    // ─────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("addStroke appends the event to the buffer and returns it")
    void addStroke_appendsAndReturns() {
        DrawEvent event = drawingService.addStroke(room, strokeMsg());

        assertThat(room.getCanvasBuffer()).containsExactly(event);
        assertThat(event.getType()).isEqualTo("stroke");
    }

    // ─────────────────────────────────────────────────────────────────────
    //  clearCanvas
    // ─────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("clearCanvas wipes the buffer and leaves a single 'clear' marker")
    void clearCanvas_wipesAndAddsSingleClearEvent() {
        drawingService.addStroke(room, strokeMsg());
        drawingService.addStroke(room, strokeMsg());

        drawingService.clearCanvas(room);

        assertThat(room.getCanvasBuffer()).hasSize(1);
        assertThat(room.getCanvasBuffer().get(0).getType()).isEqualTo("clear");
    }

    // ─────────────────────────────────────────────────────────────────────
    //  undoLast
    // ─────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("undoLast removes the most recent stroke and returns true")
    void undoLast_removesLastStroke_returnsTrue() {
        drawingService.addStroke(room, strokeMsg());
        drawingService.addStroke(room, strokeMsg());

        boolean removed = drawingService.undoLast(room);

        assertThat(removed).isTrue();
        // One stroke gone, one remains; an "undo" marker is appended
        assertThat(countType("stroke")).isEqualTo(1);
        assertThat(countType("undo")).isEqualTo(1);
    }

    @Test
    @DisplayName("undoLast on an empty buffer returns false and does not crash")
    void undoLast_emptyBuffer_returnsFalse() {
        boolean removed = drawingService.undoLast(room);

        assertThat(removed).isFalse();
        assertThat(room.getCanvasBuffer()).isEmpty();
    }

    @Test
    @DisplayName("REGRESSION: undo after a clear returns false and adds NO undo marker")
    void undoLast_afterClear_returnsFalse_noPhantomMarker() {
        // This is the bug we fixed: previously undoLast always appended an
        // "undo" event even when there was no stroke to remove, poisoning the
        // buffer (and getting broadcast to clients).
        drawingService.clearCanvas(room); // buffer = ["clear"]

        boolean removed = drawingService.undoLast(room);

        assertThat(removed).isFalse();
        // Buffer is untouched — still just the clear marker, no phantom "undo"
        assertThat(room.getCanvasBuffer()).hasSize(1);
        assertThat(countType("undo")).isZero();
    }

    @Test
    @DisplayName("undoLast removes ALL batches of a streamed stroke sharing one strokeId")
    void undoLast_removesAllBatchesOfStreamedStroke() {
        // A single stroke streamed as three throttled batches (same strokeId)...
        drawingService.addStroke(room, strokeMsg("stroke-A"));
        drawingService.addStroke(room, strokeMsg("stroke-A"));
        drawingService.addStroke(room, strokeMsg("stroke-A"));
        // ...followed by a second, separate stroke.
        drawingService.addStroke(room, strokeMsg("stroke-B"));

        boolean removed = drawingService.undoLast(room);

        assertThat(removed).isTrue();
        // Only stroke-B (one batch) is gone; all three stroke-A batches remain.
        assertThat(countType("stroke")).isEqualTo(3);
        assertThat(countType("undo")).isEqualTo(1);

        // Undo again removes all three stroke-A batches in one shot.
        drawingService.undoLast(room);
        assertThat(countType("stroke")).isZero();
    }

    @Test
    @DisplayName("undoLast skips non-stroke markers to find the stroke beneath them")
    void undoLast_skipsNonStrokeMarkers() {
        drawingService.addStroke(room, strokeMsg());
        // Manually drop a non-stroke marker on top of the stroke
        room.getCanvasBuffer().add(new DrawEvent("clear", null, null, null, 0, 0));
        // buffer = ["stroke", "clear"]

        boolean removed = drawingService.undoLast(room);

        assertThat(removed).isTrue();
        // The stroke underneath the clear marker was the one removed
        assertThat(countType("stroke")).isZero();
    }

    // ─────────────────────────────────────────────────────────────────────
    //  getSnapshot
    // ─────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("getSnapshot returns an immutable copy")
    void getSnapshot_isImmutable() {
        drawingService.addStroke(room, strokeMsg());

        List<DrawEvent> snapshot = drawingService.getSnapshot(room);

        assertThatThrownBy(() -> snapshot.add(new DrawEvent("stroke", null, null, null, 0, 0)))
                .isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    @DisplayName("getSnapshot is decoupled — later buffer changes don't affect it")
    void getSnapshot_decoupledFromBuffer() {
        drawingService.addStroke(room, strokeMsg());
        List<DrawEvent> snapshot = drawingService.getSnapshot(room);
        assertThat(snapshot).hasSize(1);

        // Mutate the live buffer after taking the snapshot
        drawingService.addStroke(room, strokeMsg());

        // Snapshot is a point-in-time copy — still size 1
        assertThat(snapshot).hasSize(1);
        assertThat(room.getCanvasBuffer()).hasSize(2);
    }

    // ─────────────────────────────────────────────────────────────────────
    //  resetCanvas
    // ─────────────────────────────────────────────────────────────────────

    @Test
    @DisplayName("resetCanvas empties the buffer completely (no marker, unlike clear)")
    void resetCanvas_wipesCompletely() {
        drawingService.addStroke(room, strokeMsg());
        drawingService.addStroke(room, strokeMsg());

        drawingService.resetCanvas(room);

        assertThat(room.getCanvasBuffer()).isEmpty();
    }

    // ─────────────────────────────────────────────────────────────────────
    //  Test helpers
    // ─────────────────────────────────────────────────────────────────────

    private DrawMessageIn strokeMsg() {
        return strokeMsg(java.util.UUID.randomUUID().toString());
    }

    private DrawMessageIn strokeMsg(String strokeId) {
        return new DrawMessageIn("stroke", strokeId, List.of(new double[]{1, 2, 0.5}), "#000000", 5f);
    }

    private long countType(String type) {
        return room.getCanvasBuffer().stream()
                .filter(e -> type.equals(e.getType()))
                .count();
    }
}
