# 🎮 iPlayed

O **iPlayed** nasce da união de duas grandes paixões: o desenvolvimento de software e o universo dos jogos. Mais do que um simples rastreador, o projeto é um estudo prático de como construir uma aplicação robusta, escalável e tecnicamente rica, focada em quem realmente se importa com os detalhes de cada game jogado.

A ideia é criar um espaço inspirado no modelo do Letterboxd, onde o jogador pode ir além de uma nota superficial, avaliando critérios técnicos específicos de acordo com a plataforma em que viveu a experiência.

---

## ✨ Funcionalidades em Foco

O projeto está sendo construído para resolver problemas reais de catalogação e análise de jogos:

* **Avaliação Multidimensional:** Diferenciação entre a nota subjetiva (o seu "feeling" com o jogo) e notas técnicas para critérios como *Jogabilidade, Trilha Sonora, História, Gráficos e Level Design*. As notas aceitam casas decimais (ex: 8.5, 9.0).
* **Contexto por Plataforma:** Reconhecemos que a experiência de um jogo pode mudar drasticamente entre plataformas. O iPlayed permite registrar e filtrar análises baseadas no hardware utilizado.
* **Integração com IGDB:** Uso da base de dados da IGDB (Twitch) para buscar metadados reais, capas e datas de lançamento, mantendo um cache local para performance e consistência.
* **Métricas da Comunidade:** Processamento inteligente de médias de notas e volume de avaliações, oferecendo uma visão técnica e social de cada título.

---

## 🛠️ Escolhas Tecnológicas

Este projeto serve como um laboratório de boas práticas e exploração de tecnologias modernas de backend:

* **Node.js & TypeScript:** Escolhidos para garantir segurança de tipos e alta performance em operações assíncronas.
* **PostgreSQL:** O coração dos dados, utilizado para garantir integridade referencial e permitir consultas complexas de agregação.
* **SQL Nativo (node-postgres):** Optei por não utilizar um ORM nesta fase para aprofundar o domínio sobre modelagem de dados e otimização de consultas.
* **Validação com Zod:** Garantia de que todos os dados que entram na API seguem rigorosamente o contrato definido.
* **Docker:** Toda a infraestrutura é containerizada para garantir que o ambiente de desenvolvimento seja idêntico em qualquer máquina.

---

## 📈 Roadmap de Estudo

O desenvolvimento está organizado em etapas orgânicas, permitindo uma evolução gradual do código e da complexidade:

1.  **Fundação:** Setup de infraestrutura, Docker e modelagem inicial do banco de dados.
2.  **Motor de Dados:** Integração com a API externa e lógica de persistência local.
3.  **Domínio de Negócio:** Implementação das rotas de reviews, notas e cálculos de estatísticas.
4.  **Segurança:** Implementação de autenticação JWT e controle de permissões.
5.  **Interface (Futuro):** Desenvolvimento de um front-end moderno para consumo da API.

---

## 🚀 Como rodar o projeto

> *Nota: O projeto está atualmente no Milestone 2 (Integração de Dados — IGDB).*

1.  Clone o repositório.
2.  Certifique-se de ter o Docker instalado.
3.  Copie `.env.example` para `.env.development` e `.env.test` e preencha as credenciais.
4.  Instale as dependências com `npm install`.
5.  Execute `docker compose up -d` para subir os bancos de desenvolvimento e teste (definidos em `compose.yaml`).
6.  Rode as migrations: `npm run migrate:up` (banco de desenvolvimento) e `npm run migrate:up:test` (banco de teste).
7.  Inicie o servidor com `npm run dev`.

---

## 📄 Licença
Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.
