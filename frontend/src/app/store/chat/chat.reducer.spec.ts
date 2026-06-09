import { ChatEvent } from '../../models/dtos';
import { RoomActions } from '../room/room.actions';
import { ChatActions } from './chat.actions';
import { chatReducer, initialChatState } from './chat.reducer';

const msg = (text: string): ChatEvent => ({ senderName: 'a', text, type: 'chat' });

describe('chatReducer', () => {
  it('appends received messages in order', () => {
    let state = chatReducer(initialChatState, ChatActions.messageReceived({ event: msg('hi') }));
    state = chatReducer(state, ChatActions.messageReceived({ event: msg('there') }));
    expect(state.messages.map((m) => m.text)).toEqual(['hi', 'there']);
  });

  it('caps history at 200 messages', () => {
    let state = initialChatState;
    for (let i = 0; i < 250; i++) {
      state = chatReducer(state, ChatActions.messageReceived({ event: msg(`m${i}`) }));
    }
    expect(state.messages).toHaveLength(200);
    expect(state.messages[0].text).toBe('m50');
    expect(state.messages[199].text).toBe('m249');
  });

  it('clears on Clear and on leaveRoom', () => {
    const state = chatReducer(initialChatState, ChatActions.messageReceived({ event: msg('hi') }));
    expect(chatReducer(state, ChatActions.clear()).messages).toHaveLength(0);
    expect(chatReducer(state, RoomActions.leaveRoom()).messages).toHaveLength(0);
  });
});
