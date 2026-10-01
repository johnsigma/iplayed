import { Request, Response } from 'express';
import { pool } from '../../database';

// Quanto a readiness espera o banco responder antes de concluir que ele não
// está pronto. Sem limite, um pool esgotado (o `pg` não tem timeout de
// conexão por padrão) deixaria a própria sonda pendurada — e uma sonda que
// não responde é tratada como falha pelo load balancer, só que mais devagar.
const DEFAULT_READINESS_TIMEOUT_MS = 2_000;

export class HealthController {
  constructor(
    private readonly readinessTimeoutMs: number = DEFAULT_READINESS_TIMEOUT_MS,
  ) {}

  // Liveness: "o processo está vivo?". Quem pergunta é o orquestrador, que
  // reinicia o processo se a resposta falhar. Por isso não consulta nada:
  // se checasse o banco, uma oscilação dele faria o orquestrador reiniciar a
  // aplicação em loop, piorando o problema que a sonda devia ajudar a
  // resolver.
  live = (_req: Request, res: Response): Response => {
    res.set('Cache-Control', 'no-store');
    return res.status(200).json({ status: 'ok' });
  };

  // Readiness: "pode receber tráfego agora?". Quem pergunta é o load
  // balancer, que para de mandar requisições se a resposta falhar. Checa só
  // dependências fortes — hoje, o banco. A IGDB fica de fora de propósito:
  // com ela fora do ar só a busca degrada (jogos já salvos, login e reviews
  // continuam funcionando), e tirar do ar uma aplicação majoritariamente
  // saudável seria pior que o problema.
  //
  // O corpo é mínimo de propósito: esta rota é pública, e detalhes (versão do
  // banco, mensagem de erro) pertencem a um diagnóstico protegido.
  ready = async (_req: Request, res: Response): Promise<Response> => {
    res.set('Cache-Control', 'no-store');

    try {
      await this.withTimeout(pool.query('SELECT 1'));
      return res.status(200).json({ status: 'ok' });
    } catch (error) {
      console.error('Readiness check failed:', error);
      return res.status(503).json({ status: 'error' });
    }
  };

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;

    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new Error(`Database did not respond in ${this.readinessTimeoutMs}ms`),
          ),
        this.readinessTimeoutMs,
      );
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
