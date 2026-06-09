import {
  selectCanDraw,
  selectInGame,
  selectIsChoosingWord,
  selectIsDrawer,
} from './game.selectors';

describe('game selectors', () => {
  it('selectIsDrawer compares drawer session id to my session id', () => {
    expect(selectIsDrawer.projector('a', 'a')).toBe(true);
    expect(selectIsDrawer.projector('a', 'b')).toBe(false);
    expect(selectIsDrawer.projector(null, null)).toBe(false);
  });

  it('selectCanDraw is true only while DRAWING and I am the drawer', () => {
    expect(selectCanDraw.projector('DRAWING', true)).toBe(true);
    expect(selectCanDraw.projector('DRAWING', false)).toBe(false);
    expect(selectCanDraw.projector('WORD_SELECTION', true)).toBe(false);
  });

  it('selectInGame is false only in the lobby', () => {
    expect(selectInGame.projector('LOBBY')).toBe(false);
    expect(selectInGame.projector('DRAWING')).toBe(true);
    expect(selectInGame.projector('GAME_OVER')).toBe(true);
  });

  it('selectIsChoosingWord is true only during WORD_SELECTION with choices present', () => {
    expect(selectIsChoosingWord.projector('WORD_SELECTION', ['a', 'b', 'c', 'd'])).toBe(true);
    expect(selectIsChoosingWord.projector('WORD_SELECTION', null)).toBe(false);
    expect(selectIsChoosingWord.projector('DRAWING', ['a', 'b', 'c', 'd'])).toBe(false);
  });
});
