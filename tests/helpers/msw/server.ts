import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);

/**
 * Ao usar `server` junto de supertest (requisições HTTP reais contra `app`,
 * como em testes de endpoint), o MSW intercepta TODO o tráfego HTTP do
 * processo — inclusive as chamadas do próprio supertest para o servidor de
 * teste local, que nada têm a ver com as APIs externas mockadas aqui. Sem
 * isso, cada requisição de teste imprimiria um aviso de "unhandled request",
 * mesmo passando.
 *
 * Passar isto como `onUnhandledRequest` em `server.listen({...})` silencia
 * só o tráfego de loopback (127.0.0.1/localhost) e mantém o aviso para
 * qualquer outra chamada externa genuinamente sem handler — que é
 * exatamente o sinal que se quer preservar (ex: esquecer de mockar um
 * endpoint novo da IGDB).
 */
export function bypassLocalRequests(
  request: Request,
  print: { warning: () => void },
): void {
  const url = new URL(request.url);
  const isLocalRequest =
    url.hostname === '127.0.0.1' || url.hostname === 'localhost';

  if (!isLocalRequest) {
    print.warning();
  }
}
