# iPlayed — CLAUDE.md

> Para descrição completa do projeto, leia o README.md.

## Stack

- Runtime: Node.js + TypeScript
- Banco: PostgreSQL com SQL nativo (node-postgres) — sem ORM
- Validação: Zod
- Infraestrutura: Docker / docker-compose
- Integração externa: IGDB API (Twitch)
- Autenticação (futuro): JWT

## Estado atual do projeto

- Milestone 1 (Infraestrutura) em andamento
- Docker e banco configurados
- Próximos passos: integração IGDB e lógica de persistência

> **Nota sobre esta seção:** Atualizar apenas ao mudar de milestone ou surgir decisão arquitetural relevante.
> Para o estado fino das issues (o que está aberto/fechado), consultar o GitHub via `gh` — ele é a fonte da verdade.

## Comandos importantes

- `docker-compose up -d` — sobe o banco
- `npm install` — instala dependências
- `npm run dev` — inicia o servidor (confirmar quando configurado)

## Convenções de código

- TypeScript estrito — nunca usar `any`
- SQL nativo sempre — nunca sugerir ORM ou query builder
- Validação de entrada sempre com Zod
- Variáveis de ambiente para todas as credenciais e chaves de API

## Testes

- Cobertura de 100% é o objetivo — tudo que puder ser testado, deve ser
- O usuário está aprendendo sobre testes, então sempre explicar o que está sendo testado e por quê
- Usar Jest + Supertest (já configurados)
- Testes de integração devem usar banco real (não mocks do banco) — mocks mascaram divergências entre o código e o banco real
- Criar testes junto com cada feature, nunca deixar para depois
- Sempre avisar quando uma feature nova exige novos testes ou quando testes existentes precisam ser atualizados

## Gestão de tarefas

O projeto usa Milestones e Tasks no GitHub (não sprints).

Antes de iniciar qualquer task, você deve:

1. Ler a task atual completamente
2. Verificar as tasks e milestones seguintes em busca de funcionalidades que:
   - Complementem o que está sendo feito agora
   - Possam influenciar decisões de arquitetura
   - Sejam mais fáceis de implementar se consideradas desde já
3. Apresentar um resumo do que encontrou, informando:
   - O que a task exige
   - Se existe algo nas tasks futuras que vale antecipar
4. Só então perguntar se deve avançar

## Avisos e sinalizações

- **GitHub — issues/milestones:** Sempre avisar quando uma nova issue ou milestone dever ser criada no GitHub para rastrear trabalho em andamento ou planejado
- **Git — commits:** Sempre avisar quando for um bom momento para fazer um commit (após feature, correção ou configuração significativa estar completa e funcional)
- **Erros e complexidade:** Sempre que ocorrer um erro ou entrarmos em um tópico complexo/delicado, explicar detalhadamente a situação, apresentar comparativos quando útil e listar prós e contras das alternativas disponíveis
- **README:** Sempre avisar quando uma evolução do projeto merecer ser documentada no README.md, sugerindo o que incluir ou modificar

## Avaliação de complexidade

Antes de iniciar qualquer tarefa, avalie a complexidade.
Se envolver qualquer item abaixo, PARE e avise:
"⚠️ Esta tarefa pode se beneficiar do Opus. Deseja trocar o modelo?"

Critérios para usar o Opus:

- Arquitetura de sistema (múltiplos serviços, integração externa)
- Algoritmos de agregação/cálculo de médias complexos
- Refatoração grande (mais de 500 linhas)
- Debugging de problema sem causa clara
- Design patterns complexos
- Qualquer tarefa com raciocínio em múltiplas etapas interdependentes
