import type { Config } from "jest";

const config: Config = {
  // Diz ao Jest para usar o ts-jest para arquivos .ts
  preset: "ts-jest",

  // Define o ambiente de execução (Node.js para APIs)
  testEnvironment: "node",

  // Onde os testes estão localizados
  roots: ["<rootDir>/src", "<rootDir>/tests"],

  // Padrão de nomes de arquivos de teste
  testMatch: ["**/*.spec.ts", "**/*.test.ts"],

  // Limpa os mocks automaticamente entre um teste e outro
  clearMocks: true,

  // Coleta cobertura de código (útil para ver o que ainda não foi testado)
  collectCoverage: true,
  collectCoverageFrom: ["src/**/*.ts", "!src/@types/**", "!src/server.ts"],
  coverageDirectory: "coverage",
  coverageProvider: "v8",

  // Mapeamento de caminhos (caso você use caminhos customizados no tsconfig)
  moduleNameMapper: {
    "@modules/(.*)": "<rootDir>/src/modules/$1",
    "@shared/(.*)": "<rootDir>/src/shared/$1",
  },
};

export default config;
