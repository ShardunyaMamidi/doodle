export const environment = {
  production: false,
  // REST + WS go through the dev proxy (see proxy.conf.json) to avoid CORS.
  apiBaseUrl: '/api',
  wsUrl: '/ws-doodle', // SockJS resolves this against the page origin -> proxied to :8080
  reconnect: {
    delayMs: 2000,
    bannerAfterMs: 1000,
  },
};
