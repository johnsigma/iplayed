import { execSync } from 'node:child_process';

// Este arquivo é executado antes de todos os testes. Ele é responsável por configurar o ambiente de teste, como rodar as migrações do banco de dados para garantir que a estrutura esteja correta antes dos testes serem executados.
export default async function globalSetup() {
  console.log('Iniciando o ambiente de teste...');
  execSync('npm run migrate:up:test', { stdio: 'inherit' });
}
