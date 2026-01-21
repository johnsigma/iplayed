import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: Number(process.env.POSTGRES_PORT),
});

// Listener para erros inesperados no cliente do banco (evita crash da aplicação)
pool.on('error', (err, client) => {
  console.error('Erro inesperado no cliente do PostgreSQL', err);
  process.exit(-1);
});

// Teste rápido de conexão (Opcional, mas bom para debug inicial)
pool.connect((err) => {
  if (err) {
    console.log(process.env.POSTGRES_HOST);
    console.log(process.env.POSTGRES_PASSWORD);
    console.error('❌ Erro ao conectar no Banco de Dados:', err.message);
  } else {
    console.log('✅ Conectado ao Banco de Dados com sucesso!');
  }
});

export { pool };
