import { execSync } from 'node:child_process';

export default async function globalSetup() {
  console.log('Iniciando o ambiente de teste...');
  execSync('npm run migrate:up:test', { stdio: 'inherit' });
}
