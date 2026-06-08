import { createFeature, createReducer, on } from '@ngrx/store';
import { ConnectionActions, ConnectionStatus } from './connection.actions';

export interface ConnectionState {
  status: ConnectionStatus;
}

export const initialConnectionState: ConnectionState = {
  status: 'disconnected',
};

export const connectionFeature = createFeature({
  name: 'connection',
  reducer: createReducer(
    initialConnectionState,
    on(ConnectionActions.connect, (state) => ({ ...state, status: 'connecting' as const })),
    on(ConnectionActions.disconnect, (state) => ({ ...state, status: 'disconnected' as const })),
    on(ConnectionActions.statusChanged, (state, { status }) => ({ ...state, status })),
  ),
});

export const {
  name: connectionFeatureKey,
  reducer: connectionReducer,
  selectStatus: selectConnectionStatus,
} = connectionFeature;
