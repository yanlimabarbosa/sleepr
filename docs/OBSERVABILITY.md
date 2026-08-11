# Observability — Roadmap & TODO

Estado atual e próximos passos para observabilidade do sleepr. Logging já está
com **Pino** (`nestjs-pino`), estruturado, via `LoggerModule` em `libs/common`.

## Estado atual (feito)

- **Logging estruturado** com Pino (`libs/common/src/logger/logger.module.ts`).
- **Formato por ambiente**: `pino-pretty` só em dev; produção emite **JSON puro**
  (`transport: undefined`) — parseável por agregadores, sem corromper.
- **Níveis por status**: 2xx/3xx → `info`, 4xx → `warn`, 5xx/exceção → `error`.
- **Serializers enxutos**: request loga `method + url + body`; response loga
  `statusCode`; erro loga `type + message + stack`.
- **Redação de sensíveis**: `req.body.password` e `req.headers.authorization`
  saem como `***`.

## TODO — próximos passos

### 1. Nível de log dinâmico (prioridade alta)

Permitir subir para `debug` em produção **sob demanda**, sem redeploy:

```ts
level:
  process.env.LOG_LEVEL ??
  (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
```

Durante um incidente: setar `LOG_LEVEL=debug` no container, investigar, e
voltar para `info`. Evita o anti-padrão de "logar tudo sempre" (custo de
ingestão, ruído que esconde sinal, risco de vazar dado).

### 2. Body de request apenas em dev

Hoje o body loga em dev **e** prod (com senha redigida). Em produção, logar body
de todo request pode vazar outros dados sensíveis (CPF, cartão) e inchar o log.
Condicionar para dev:

```ts
req: (req) => ({
  method: req.method,
  url: req.url,
  ...(process.env.NODE_ENV !== 'production' && { body: req.body }),
}),
```

### 3. Distributed Tracing (pilar principal para microservices)

Logs sozinhos não contam a história de um request atravessando serviços
(reservations → auth → payments...). Adicionar **OpenTelemetry**:

- Instrumentação automática de HTTP + Mongoose.
- Propagação de `trace-id` entre serviços (via headers na comunicação
  TCP/RabbitMQ quando os microservices se comunicarem).
- Exportar para um coletor (Jaeger/Tempo/Datadog).
- Correlacionar log ↔ trace: incluir `trace-id`/`span-id` em cada log linha
  (pino permite via `mixin` ou `genReqId`).

### 4. Metrics

Terceiro pilar (logs, metrics, traces):

- Expor `/metrics` (Prometheus) — latência (histogram), req/s, taxa de erro,
  saúde das conexões (Mongo, broker).
- `@willsoto/nestjs-prometheus` é uma opção idiomática para NestJS.

### 5. Correlation ID

- `genReqId` no pino-http para gerar/propagar um `x-request-id` por request.
- Passar esse id adiante na comunicação entre microservices para rastrear a
  requisição fim-a-fim nos logs de todos os serviços.

### 6. Health checks

- `@nestjs/terminus` para `/health` (liveness/readiness) — checar Mongo e
  dependências. Útil para orquestração (Docker/K8s) e para o `exclude` do
  pino-http (não logar as rotas de health).

## Princípios (referência)

- **3 pilares**: logs (o que aconteceu), metrics (saúde agregada), traces
  (caminho de um request). Não depender só de log verboso.
- **Produção = JSON estruturado**, nunca pretty (máquina parseia; humano
  formata na leitura com `| pino-pretty` quando faz SSH).
- **Nível certo por padrão** (`info`) **+ poder subir sob demanda** (`debug`),
  em vez de "máximo log sempre".
- **Redigir sempre** dados sensíveis, em dev e prod.
