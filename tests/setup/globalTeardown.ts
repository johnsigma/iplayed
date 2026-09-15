// Não importa o módulo de banco de propósito: o `globalTeardown` roda em um
// registro de módulos separado, então o pool que ele criaria não seria o
// mesmo usado pelos testes — fechá-lo não serviria de nada. Cada arquivo de
// integração fecha o seu próprio pool no `afterAll` (ver closeDatabase).
export default async function globalTeardown() {
  console.log('Limpando o ambiente de teste...');
}
