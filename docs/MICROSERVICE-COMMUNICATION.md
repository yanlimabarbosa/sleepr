# Comunicação entre microservices — curso vs mercado

Nota sobre como `reservations` fala com `payments` (e `auth`). O **conceito**
(serviços isolados conversando via `ClientProxy`) é sólido. O **transporte** que o
curso usa (`Transport.TCP`) é didático. Este doc separa o que é padrão de mercado
do que é escolha simplificada do curso.

## As duas comunicações do fluxo (não confundir)

Tem **duas** chamadas de rede, e só uma usa Observable:

| comunicação                    | quem faz              | tipo         |
| ------------------------------ | --------------------- | ------------ |
| reservations → payments (TCP)  | `ClientProxy.send()`  | **Observable** |
| payments → Stripe (HTTP)       | Stripe SDK            | **Promise**  |

O Observable nasce **no `ClientProxy.send()` do lado que chama**, não na rede nem
na Stripe. É decisão de design do Nest para comunicação **entre microservices**.
A chamada externa à Stripe é Promise comum (`await`). Nenhuma relação entre os dois.

## `ClientProxy` — é o padrão (dentro do Nest)

`ClientProxy` (de `@nestjs/microservices`) **é** a forma idiomática de comunicação
serviço-a-serviço no Nest. Não é gambiarra do curso. Ponto forte: é
**transport-agnostic** — o mesmo `send()` roda sobre TCP, Redis, RabbitMQ, Kafka,
NATS ou gRPC. Trocar o transporte é mudar config, **não** reescrever o service.

Por isso `send()` retorna `Observable` mesmo para 1 request → 1 response: a API
precisa cobrir também transportes que **stremam** várias respostas (ex: gRPC
streaming). `Observable` modela "1 valor" e "N valores"; `Promise` só modelaria o
primeiro. É o denominador comum. De brinde, vêm operadores (`timeout`, `retry`,
`catchError`) no `pipe`. Para 1 valor, dá para converter com
`await firstValueFrom(...)` e tratar como Promise.

## O transporte TCP — didático, não padrão de prod

`Transport.TCP` (protocolo próprio do Nest) é fácil de subir (por isso o curso
usa), mas é nicho — pouca gente roda em produção séria. O que o mercado escolhe:

| necessidade                | transporte de mercado          | por quê                                       |
| -------------------------- | ------------------------------ | --------------------------------------------- |
| RPC síncrono tipado        | **gRPC**                       | contrato via `.proto`, binário, multi-linguagem |
| Comunicação async/eventos  | **Kafka / RabbitMQ / NATS**    | desacopla, resiliente, buffer, retry          |
| REST simples               | HTTP + service discovery       | universal, fácil de debugar                   |
| TCP nativo do Nest         | raro em prod                   | didático, sem ecossistema de tooling          |

Como o `ClientProxy` é agnóstico, migrar TCP → gRPC/Kafka é trocar config, não
lógica. Bônus do gRPC: o `.proto` **gera os tipos**, resolvendo o `any` que hoje
volta de `send('create_charge')` sem generic.

## Síncrono vs event-driven — a decisão de arquitetura

O fluxo atual é **síncrono e acoplado**: `reservations` chama `payments` e
**espera** a resposta (bloqueia o request HTTP).

```
reservations CHAMA payments e ESPERA  →  payments cai/lento = reservations trava junto
```

Alternativa **event-driven** (comum em arquitetura madura):

```
reservations publica "reservation_requested"
   → payments consome, cobra, publica "payment_succeeded" / "payment_failed"
   → reservations reage ao evento e confirma/cancela
```

| aspecto        | síncrono (`send` + espera) | event-driven (broker)                 |
| -------------- | -------------------------- | ------------------------------------- |
| Acoplamento    | temporal (um cai, trava)   | desacoplado (enfileira)               |
| Complexidade   | baixa                      | alta (eventual consistency, saga)     |
| Escala         | limitada pelo mais lento   | serviços escalam independente         |
| Resposta       | imediata                   | assíncrona (reage a evento depois)    |

**Não é "síncrono errado, async certo".** É trade-off por contexto. Pagamento é
justamente um caso onde síncrono se **defende**: tu quer saber na hora se cobrou
**antes** de confirmar a reserva. Event-driven paga quando há muitos serviços,
alta carga e tolerância a consistência eventual.

## Recomendação registrada

1. **Manter `ClientProxy`** — padrão Nest, abstração certa, não trocar.
2. **TCP para o curso** — didático, ensina o conceito. Em prod, trocar por **gRPC**
   (RPC síncrono tipado) ou **broker** (async) — só config, o `ClientProxy` fica.
3. **`send` síncrono para a cobrança é defensável** mesmo em prod — pagamento quer
   resposta imediata antes de confirmar.
4. O que **não** é padrão-ouro é o TCP nativo em si — mas o `ClientProxy` que fala
   com ele, é.

Relacionado: ver `PAYMENTS-STRIPE.md` (curso vs production-grade do Stripe) e a
seção de tracing em `OBSERVABILITY.md` (TCP não carrega headers → trace/token vão
no payload).
