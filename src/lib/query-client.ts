import { QueryClient } from '@tanstack/react-query';

// Singleton on the client; SSR not needed for this app's data routes
let _client: QueryClient | undefined;

export function getQueryClient() {
  if (!_client) {
    _client = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000, // 30s — reduce duplicate fetches
          gcTime: 5 * 60_000, // 5min cache
          refetchOnWindowFocus: false,
          retry: 1,
        },
      },
    });
  }
  return _client;
}
