import fs from 'fs';
import path from 'path';
import { pool } from './index'; // Importa sua conexão existente

async function setupDatabase() {
  const client = await pool.connect();

  try {
    // 1. Lê o arquivo SQL
    const sqlPath = path.join(__dirname, 'init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('🔄 Resetando e criando tabelas...');

    // 2. Executa o SQL
    await client.query(sql);

    console.log('✅ Banco de dados configurado com sucesso!');
    console.log('📊 Critérios e Plataformas iniciais inseridos.');
  } catch (err) {
    console.error('❌ Erro ao configurar banco:', err);
  } finally {
    client.release();
    await pool.end(); // Fecha a conexão do script
  }
}

setupDatabase();
