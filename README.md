# 🎮 iPlayed

O **iPlayed** nasce da união de duas grandes paixões: o desenvolvimento de software e o universo dos jogos. Mais do que um simples rastreador, o projeto é um estudo prático de como construir uma aplicação robusta, escalável e tecnicamente rica, focada em quem realmente se importa com os detalhes de cada game jogado.

A ideia é criar um espaço inspirado no modelo do Letterboxd, onde o jogador pode ir além de uma nota superficial, avaliando critérios técnicos específicos de acordo com a plataforma em que viveu a experiência.

---

## 📍 Estado atual do projeto

> Atualizado em 30/09/2026. `gh issue list` no repositório é sempre a fonte mais fina; isto aqui é o resumo de orientação rápida.

**Milestone 2 (Integração com a IGDB) está quase concluída.** A ordem dos milestones seguintes foi revisada: segurança/autenticação vem antes do núcleo de reviews, porque criar uma review exige um usuário autenticado existindo (ver histórico de decisões nas issues do repositório).

| # | Milestone | Status |
|---|---|---|
| 1 | Fundação e Infraestrutura | ✅ Concluído |
| 2 | Integração de Dados (O Motor IGDB) | 🔵 Quase concluído |
| 3 | Segurança e Autenticação (O Filtro) | ⬜ Não iniciado |
| 4 | Núcleo do Negócio (Reviews e Ratings) | ⬜ Não iniciado |
| 5 | Polimento e Documentação | ⬜ Não iniciado |

**O que já funciona de verdade, hoje:**

* `GET /health/live` e `GET /health/ready` — sondas de saúde para infraestrutura (liveness e readiness, fora do `/api/v1`)
* `GET /api/v1/games/search?q=...&limit=...` — busca de jogos direto na IGDB (sem persistência local ainda)

Nada de reviews, notas ou autenticação existe na API ainda — isso é a visão do produto (próxima seção), não o estado atual. Para explorar os endpoints reais, importe [`docs/openapi.yaml`](docs/openapi.yaml) no Bruno, Insomnia ou Postman — o arquivo cresce junto com cada endpoint novo.

---

## ✨ Visão do produto

O projeto está sendo construído para resolver problemas reais de catalogação e análise de jogos — a lista abaixo descreve a visão completa, não o que já está implementado (ver "Estado atual" acima):

* **Avaliação Multidimensional:** Diferenciação entre a nota subjetiva (o seu "feeling" com o jogo) e notas técnicas para os critérios *Jogabilidade, Narrativa, Visual, Áudio e Desempenho Técnico* (nomes definidos, definição detalhada de cada um em andamento). As notas aceitam casas decimais (ex: 8.5, 9.0), e nem todo critério precisa ser preenchido em toda review.
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
3.  **Segurança:** Implementação de autenticação JWT e controle de permissões.
4.  **Domínio de Negócio:** Implementação das rotas de reviews, notas e cálculos de estatísticas.
5.  **Interface (Futuro):** Desenvolvimento de um front-end moderno para consumo da API.

---

## 🚀 Como rodar o projeto

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
