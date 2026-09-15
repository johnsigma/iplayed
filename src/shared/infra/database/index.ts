import { Pool } from 'pg';
import dotenv from 'dotenv';
import { expand } from 'dotenv-expand';

expand(
  dotenv.config({ path: `.env.${process.env.NODE_ENV ?? 'development'}` }),
);

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: Number(process.env.POSTGRES_PORT),
});

// Listener para erros inesperados em clientes ociosos do pool (ex: o Postgres
// derruba uma conexão parada). Sem esse listener, o Node trataria isso como
// um evento 'error' sem handler e derrubaria o processo sozinho — mas
// chamar `process.exit` aqui era pior do que o problema que evitava: uma
// soluço passageira de rede derrubava a aplicação inteira, não só a conexão
// afetada. Só logamos; o pool cria uma conexão nova quando precisar.
pool.on('error', (err) => {
  console.error('Erro inesperado em um cliente ocioso do PostgreSQL:', err);
});

/**
 * Verificação de conectividade para o boot da aplicação.
 *
 * Isto é uma função exportada, e não código no topo do módulo, de propósito:
 * enquanto rodava no import, qualquer arquivo que importasse o `pool` abria
 * uma conexão sem pedir — inclusive o teardown dos testes, que importa o
 * módulo só para fechar o pool. O `end()` competia com esse `connect()` em
 * andamento e deixava um handle aberto, impedindo o processo de encerrar.
 *
 * Quem tem efeito colateral é o ponto de entrada (server.ts), não o import.
 */
export async function checkDatabaseConnection(): Promise<void> {
  try {
    const client = await pool.connect();
    client.release(); // Devolve o client ao pool — sem isso, a conexão vaza
    console.log('✅ Conectado ao Banco de Dados com sucesso!');
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'erro desconhecido';
    console.error('❌ Erro ao conectar no Banco de Dados:', reason);
  }
}

export { pool };
