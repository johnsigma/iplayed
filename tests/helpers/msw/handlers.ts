import { http, HttpResponse } from 'msw';

export const twitchTokenHandler = http.post(
  'https://id.twitch.tv/oauth2/token',
  () => {
    return HttpResponse.json({
      access_token: 'mock_access_token',
      expires_in: 3600,
      token_type: 'bearer',
    });
  },
);

export const igdbGamesHandler = http.post('https://api.igdb.com/v4/games', () =>
  HttpResponse.json([]),
);

export const handlers = [twitchTokenHandler, igdbGamesHandler];
