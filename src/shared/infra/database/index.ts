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

// Teste rápido de conexão (Opcional, mas bom para debug inicial)
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Erro ao conectar no Banco de Dados:', err.message);
    return;
  }

  console.log('✅ Conectado ao Banco de Dados com sucesso!');
  release(); // Devolve o client ao pool — sem isso, cada import vazava uma conexão
});

export { pool };
