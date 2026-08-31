# Docker — deep dive (fase 2, pós-curso)

Tópicos para entender Docker networking e compose a fundo, hands-on. Nada aqui é
tarefa pendente do curso — é a lista de estudo para depois. Aprender rodando os
comandos, não só lendo.

## Contexto que originou isso

Revisando `docker-compose.yaml` / `docker-compose.override.yml`:

- Serviços no mesmo compose falam por **nome de serviço** (DNS interno), sem `ports`.
- `ports:` publica container→**host** — só necessário para tráfego de fora do Docker
  (browser, curl, `.http`).
- Microservices internos (`payments`, `notifications`, TCP-only) **não precisam** de
  `ports:` — só a borda (`reservations` HTTP gateway, `auth` login) publica.

## Tópicos para o deep dive

### 1. Bridge network por dentro
- `docker0` (bridge default) e a bridge que o compose cria por projeto.
- **veth pairs**: cada container tem uma ponta; a outra pluga na bridge do host.
- **DNS embutido** em `127.0.0.11` dentro do container — é ele que resolve nome de
  serviço → IP interno. Ver com `docker compose exec reservations getent hosts payments`.
- Comando: `docker network inspect <rede>`.

### 2. `ports` vs `expose`
- `ports:` → publica no host (cria NAT/iptables). Cruza a fronteira host→container.
- `expose:` → só documentação/metadata, **não** publica nada. Sibling já alcança sem isso.
- Regra de produção: publicar só a borda; serviço interno fica sem `ports`.

### 3. Network drivers
| driver | quando |
| --- | --- |
| **bridge** | default single-host (nosso caso) |
| **host** | container usa a stack de rede do host direto (sem isolamento, sem NAT) |
| **none** | sem rede |
| **overlay** | multi-host (Swarm/k8s) — rede virtual entre máquinas |

### 4. iptables / NAT
- O que `ports: "3000:3000"` de fato escreve no kernel (regras DNAT).
- Ver as regras aparecerem/sumirem ao adicionar/remover `ports`.
- Comando: `sudo iptables -t nat -L -n` (ou `nft` no Fedora).

### 5. Custom networks / segmentação
- Declarar `networks:` próprias (ex.: `frontend` vs `backend`) para que `payments`
  não enxergue nem a borda — só quem precisa se fala.
- Isola blast radius e força tráfego pelo gateway.

### 6. DNS round-robin / scaling
- `deploy: replicas: N` + um nome de serviço → Docker faz round-robin no DNS.
- Load balance básico de graça, sem LB externo.

### 7. Namespaces (a base de tudo)
- Container = processo isolado por **namespaces** (net, pid, mount, uts...) + cgroups.
- Entrar no net namespace de um container: `nsenter` / `docker compose exec`.
- Ver que "a rede do container" é só um network namespace com suas próprias interfaces.

## Como estudar
Rodar em cima deste próprio projeto: `docker network ls`, `docker network inspect`,
`nsenter` no namespace, `getent hosts <serviço>`, observar iptables. Comparar com
Spring/.NET onde o mesmo papel some atrás de service discovery / k8s Services.

Relacionado: `ARCHITECTURE.md` (database-per-service, event-driven), `MICROSERVICE-COMMUNICATION.md`.
