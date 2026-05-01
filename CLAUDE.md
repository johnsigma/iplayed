# iPlayed — CLAUDE.md

> Para descrição do projeto, stack e como rodar, leia o README.md.

## Estado atual

- Milestone atual: **1 — Fundação e Infraestrutura**
- Para o estado fino das issues abertas/fechadas, use `gh issue list` — é a fonte da verdade.

> Atualize esta seção apenas ao mudar de milestone ou surgir decisão arquitetural relevante.

## Convenções de código

- TypeScript estrito — nunca usar `any`
- SQL nativo sempre — nunca sugerir ORM ou query builder
- Validação de entrada sempre com Zod
- Variáveis de ambiente para todas as credenciais e chaves de API
- Path aliases configurados: `@shared/*` e `@modules/*`
- Dois tsconfig: `tsconfig.json` (IDE/type-check) e `tsconfig.build.json` (build de produção)

## Migrations

- Migrations são imutáveis depois de commitadas — nunca editar uma migration que já foi rodada e enviada ao repositório
- Mudanças de schema vêm sempre via nova migration
- Toda migration precisa de `up` e `down` funcionais
- Após criar uma migration, aplicar nos dois bancos: `npm run migrate:up` e `npm run migrate:up:test`

## Testes

- Cobertura de 100% é o objetivo — tudo que puder ser testado, deve ser
- O usuário está aprendendo sobre testes, então sempre explicar o que está sendo testado e por quê
- Usar Jest + Supertest (já configurados)
- Testes de integração devem usar banco real (não mocks do banco) — mocks mascaram divergências entre o código e o banco real
- Banco de testes isolado em container separado (porta 5434), gerenciado via `npm run migrate:up:test`
- Dados de seed (`criteria`) são imutáveis nos testes; `platforms` é tabela dinâmica e é truncada entre testes
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

**Se envolver qualquer item abaixo, PARE e avise:**
"⚠️ Esta tarefa pode se beneficiar do Opus. Deseja trocar o modelo?"

Critérios para usar o Opus:

- Arquitetura de sistema (múltiplos serviços, integração externa)
- Algoritmos de agregação/cálculo de médias complexos
- Refatoração grande (mais de 500 linhas)
- Debugging de problema sem causa clara
- Design patterns complexos
- Qualquer tarefa com raciocínio em múltiplas etapas interdependentes

**Quando o Opus já estiver em uso**, ao iniciar uma nova tarefa, reavalie. Se a nova tarefa não atingir nenhum dos critérios acima, sugira voltar ao Sonnet:

"⚠️ Esta próxima tarefa não tem complexidade que se beneficie do Opus. Sugiro trocar para o Sonnet com `/model sonnet`."

**Não interromper fluxo:** se você está no meio de uma tarefa complexa em andamento (mesmo que a sub-etapa atual pareça simples), não sugerir a troca — espere a tarefa atual terminar.
