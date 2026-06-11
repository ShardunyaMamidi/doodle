export const environment = {
  production: false,
  // REST + WS go through the dev proxy (see proxy.conf.json) to avoid CORS.
  apiBaseUrl: '/api',
  wsUrl: '/ws-doodle', // SockJS resolves this against the page origin -> proxied to :8080
  reconnect: {
    delayMs: 2000,
    bannerAfterMs: 1000,
  },
  canvas: {
    throttleMs: 50, // draw-batch flush interval
    defaultColor: '#2C2620',
    defaultWidth: 4,
    minWidth: 1,
    maxWidth: 30,
    palette: [
      '#2C2620', '#e53935', '#fb8c00', '#fdd835',
      '#43a047', '#1e88e5', '#8e24aa', '#ffffff',
    ],
  },
};
