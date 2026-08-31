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
- **Log de exceção nas fronteiras HTTP e RPC**: `AllContextsExceptionsFilter`
  (`libs/common/src/filters/`) loga o erro **no serviço que o gerou** — resolve a
  cegueira do microservice (RPC não loga exceção por padrão) e diferencia contexto
  com prefixo `[http]`/`[rpc]`. Um único filtro cobre TCP-only, HTTP-only e hybrid:
  roteia por `host.getType()` e monta o delegate HTTP só quando há `httpAdapter`
  (composição, não herança — nunca IS-A filtro HTTP). Registrado via `APP_FILTER`
  (DI injeta o `HttpAdapterHost`) + `inheritAppConfig` para valer também no TCP.
- **Debugger multi-serviço (dev)**: `--inspect` por serviço no override do compose
  (portas 9229/9230/9231) + `.vscode/launch.json` com compound "all services".

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
(reservations → auth → payments...). É o substituto **passivo** do "step
contínuo entre serviços" (que o debugger não faz — processos separados).
Adicionar **OpenTelemetry**:

- Instrumentação automática de HTTP + Mongoose.
- Propagação de `trace-id` entre serviços. **Atenção ao TCP**: a comunicação
  entre microservices aqui é `Transport.TCP` (protocolo próprio do Nest), que
  **não carrega headers como HTTP** — o contexto de trace precisa ir no
  **payload** ou em metadata da mensagem, não em header. (Mesma limitação que
  fez o token ir no payload `{ Authentication }` em vez de cookie.)
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
- Nota: hoje os 3 serviços são hybrid ou HTTP (`NestFactory.create`), então têm
  adapter HTTP e um `/health` funciona em todos. Se algum virar microservice puro
  (`createMicroservice`, sem HTTP) — caso que o `AllContextsExceptionsFilter` já
  cobre (sem `httpAdapter` ele só usa o path RPC) — aí probe HTTP não se aplica:
  usar TCP check na porta ou uma casca HTTP mínima só para `/health`.

### 7. Error tracking (o "debugger passivo" de produção)

Em produção você **não** anexa um step-debugger (segurança + não dá para pausar
serviço servindo tráfego). O mais próximo é captura de exceção com contexto:

- **Sentry** (`@sentry/nestjs`) — captura a exceção com **stack trace + request +
  user + trace-id**, agrupa por fingerprint, e alerta. É o que te dá "onde
  quebrou em prod" sem reproduzir.
- Integrar com os exception filters já existentes: além de logar, reportar ao
  Sentry no `catch` (com o `trace-id` para casar com o trace/log).

### 8. Alerting & SLOs

Métrica sem alerta é gráfico bonito que ninguém olha na hora do incidente.

- **Alertas** sobre as métricas (item 4): taxa de erro 5xx acima de X%, latência
  p99 acima de Y, fila/broker saturado, Mongo down.
- **SLIs/SLOs**: definir indicadores (ex: disponibilidade, latência p99) e
  objetivos; alertar por **burn rate** do error budget, não por threshold seco.
- Método **RED** (Rate, Errors, Duration) por serviço e **USE** (Utilization,
  Saturation, Errors) por recurso — bom ponto de partida para o que medir.

### 9. Logging estruturado de eventos de domínio (padronizar em toda a app)

Hoje só o **infra logging** é padronizado (req/res/exceção, via `LoggerModule` +
filtro). Os **eventos de negócio** ainda quase não são logados — o primeiro é o
`notifications.service` (`this.logger.info({ messageId, to }, 'email sent')`), que
serve de **semente do padrão**. Falta replicar isso, de forma consistente, nos
momentos que importam: `user registered`, `login succeeded/failed`, `reservation
created`, `charge succeeded/failed`, `email sent`.

Regras do padrão (para não virar `console.log` espalhado nem log obeso):

- **Logger injetado por serviço**: `@InjectPinoLogger(Service.name)` +
  `private readonly logger: PinoLogger` — nunca `console.log`. (Cuidado com o
  gotcha ES2023: injetar/usar no constructor ou método, **não** em field initializer.)
- **Happy-path enxuto**: só o essencial numa linha (ex.: `email sent` →
  `{ messageId, to }`). Detalhe verboso (resposta crua do SMTP, payload inteiro)
  vai para `this.logger.debug(...)`, que fica **desligado em prod**.
- **Correlation / business ids em todo evento**: `reservationId`, `userId`,
  `x-request-id`. É o que liga os logs de N serviços a **uma** operação — casa com
  o item 5 (correlation ID) e o item 3 (tracing). Sem isso, cada log é uma ilha.
  Exige **threadar o id pelo payload** dos eventos RPC (o TCP não carrega headers).
- **Nível certo**: sucesso operacional → `info`; falha → `warn`/`error` (já vem do
  filtro). Não logar sucesso em `info` se o volume for altíssimo — aí `debug` +
  só falhas em `warn`.
- **PII**: `to` (email), CPF, etc. são dado pessoal. Manter (necessidade
  operacional) **ou** redigir/hashear conforme política — consistente com o
  `redact` que já existe no `LoggerModule`. Não deixar inconsistente entre serviços.
- **Mesma chave para o mesmo conceito** entre serviços (`userId` em todos, não
  `user_id` num e `uid` noutro) — senão a query no agregador vira inferno.

Meta: um `grep`/filtro no agregador por `reservationId` mostrar a **história
completa** daquela reserva atravessando auth → reservations → payments →
notifications, em ordem, sem adivinhação.

## Debugging: local vs produção (metodologia)

Filosofias **opostas**. Local é **interativo** (pausa e pergunta); prod é
**passivo** (instrumenta antes, lê telemetria depois — não dá para pausar tráfego
real).

**Ciclo real de um bug de produção:**

```
prod quebra
  → Sentry/trace mostra QUAL serviço + stack + trace-id
  → pega a request exata daquele trace-id
  → replica LOCAL com esse input (mesmo payload, determinístico)
  → attach debugger local (compound "all services") → step → acha a linha
  → fix → deploy
```

Prod te diz **o quê e onde** (observability); local te diz **por quê** (debugger).

**Limites do debugger (lembrar):**

- É **por processo**. Não existe step **contínuo** atravessando o TCP — cada
  serviço é um processo, você pausa em cada um separado. O "seguir a request
  entre serviços" contínuo é papel do **tracing**, não do debugger.
- Erro **assíncrono** (Observable/RPC) não é alcançado steppando a função que
  monta o pipeline — ela já retornou. Use **breakpoint no serviço que lança** ou
  **Caught Exceptions** para parar no `throw` exato.
- Modo "step limpo" (Caught OFF, `node_modules` no `skipFiles`) vs modo "caça"
  (Caught ON, `node_modules` fora do skip) são configs opostas — troque conforme
  o objetivo.

## Princípios (referência)

- **3 pilares**: logs (o que aconteceu), metrics (saúde agregada), traces
  (caminho de um request). Não depender só de log verboso.
- **Produção = JSON estruturado**, nunca pretty (máquina parseia; humano
  formata na leitura com `| pino-pretty` quando faz SSH).
- **Nível certo por padrão** (`info`) **+ poder subir sob demanda** (`debug`),
  em vez de "máximo log sempre".
- **Redigir sempre** dados sensíveis, em dev e prod.
