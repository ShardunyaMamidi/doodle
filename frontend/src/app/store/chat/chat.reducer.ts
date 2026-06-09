import { createFeature, createReducer, on } from '@ngrx/store';
import { ChatEvent } from '../../models/dtos';
import { RoomActions } from '../room/room.actions';
import { ChatActions } from './chat.actions';

const MAX_MESSAGES = 200;

export interface ChatSliceState {
  messages: ChatEvent[];
}

export const initialChatState: ChatSliceState = {
  messages: [],
};

export const chatFeature = createFeature({
  name: 'chat',
  reducer: createReducer(
    initialChatState,
    on(ChatActions.messageReceived, (state, { event }) => ({
      ...state,
      // keep only the most recent MAX_MESSAGES to bound memory
      messages: [...state.messages, event].slice(-MAX_MESSAGES),
    })),
    on(ChatActions.clear, RoomActions.leaveRoom, () => initialChatState),
  ),
});

export const {
  name: chatFeatureKey,
  reducer: chatReducer,
  selectMessages: selectChatMessages,
} = chatFeature;
