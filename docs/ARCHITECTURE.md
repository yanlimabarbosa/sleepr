# Arquitetura — roadmap de hardening (fase 2, pós-curso)

Diagnóstico e plano para sair de um **distributed monolith** para microservices
de verdade. Nada aqui está implementado — é o norte da fase 2, depois do curso.

## Diagnóstico atual

Distributed monolith: serviços separados fisicamente, mas acoplados.

- Comunicação **síncrona** ponto-a-ponto (`ClientProxy.send` sobre TCP).
- **Banco compartilhado** — `reservationdocuments` e `userdocuments` no mesmo db
  `sleepr`.
- **Auth é SPOF**: toda request autenticada faz `send('authenticate')` para o auth
  validar o token. Auth cai → nenhuma request autenticada funciona em serviço
  nenhum, e há um round-trip de rede por request.

## 1. Auth self-validation (JWT assimétrico) — maior ganho, menor esforço

Hoje: `HS256` (segredo compartilhado) + round-trip TCP por request.

Alvo: `RS256`/`ES256`. Auth **assina** com a chave privada; cada serviço **valida
localmente** com a chave pública (ou via endpoint JWKS). É o modelo OAuth2/OIDC
(Auth0, Keycloak, Cognito; equivale a `oauth2ResourceServer` no Spring, `AddJwtBearer`
no .NET).

Ganhos:

- Auth sai do caminho crítico: só é preciso para **emitir** token (login), não
  para **validar**. Auth cai → sessões existentes seguem funcionando.
- Validação local, sem rede → ~0 latência por request.

Trade-off: validação local não vê **revogação instantânea** (token vale até
expirar). Mitigação = tokens de acesso curtos + refresh token (próxima seção) e,
para revogação imediata, denylist em Redis.

## 2. Access token curto + refresh token

Fecha o trade-off da revogação e é padrão de sessão em OIDC.

- **Access token** curto (~5–15 min), `RS256`, auto-verificável. Usado em toda
  request.
- **Refresh token** longo, opaco, guardado server-side (Redis/DB do auth). Só o
  auth o consome, num endpoint `/refresh`, para emitir novo access token.
- **Revogação**: apagar/invalidar o refresh token corta a renovação; para matar
  um access token antes de expirar, denylist por `jti` em Redis.
- Rotação de refresh token a cada uso (detecta replay).

## 3. Redis

Propósito real (não "porque sim"):

- Denylist de `jti` para revogação imediata (fecha o gap da seção 1).
- Store de refresh tokens (seção 2).
- Cache e rate-limiting.

## 4. Postgres no lugar do Mongo

Reservation/payment/auth são **relacionais e transacionais** (integridade,
`invoiceId ↔ reservation`, valores). Mongo foi escolha didática do curso. Migrar
enquanto o domínio é pequeno é barato; depois, caro. Stack: Postgres + Prisma ou
TypeORM.

## 5. Database-per-service

Cada serviço dono do seu banco → deploy, schema e escala independentes; falha de
DB isolada num serviço.

Trade-off (o custo real): acabam JOINs entre serviços e transações distribuídas.
Coordenar reservation↔payment passa a exigir **saga** (passos com compensação) e
**eventual consistency**. É o passo onde a dor aparece — por isso vem depois de 1–4.

## 6. Event-driven onde faz sentido (não em tudo)

| operação | padrão |
| --- | --- |
| Precisa da resposta agora para decidir (cobrar antes de reservar) | síncrono ou saga |
| Efeito colateral / reação (notificar, email, analytics, read-model) | evento (async) |
| Validar auth | local (self-contained) |

reservation→payment evolui para uma **saga** ("reserva pendente → cobra → confirma
/ cancela"), não para um `send` síncrono acoplado. Broker: RabbitMQ/Kafka/NATS.

## 7. OpenTelemetry + correlation ID

Com os serviços desacoplados, seguir um request atravessando N serviços vira
tracing, não debugger. Detalhes em `OBSERVABILITY.md`. Lembrar: TCP não carrega
headers → trace context vai no payload.

## Ordem sugerida

1. RS256 self-validation — mata o SPOF do auth e a latência por request.
2. Redis — denylist + refresh store.
3. Access curto + refresh token.
4. Postgres.
5. Database-per-service (aqui começam as sagas).
6. Event-driven / saga em reservation↔payment.
7. OpenTelemetry + correlation ID.

Fazer item a item, cada um como exercício. Terminar o curso antes.

Relacionado: `PAYMENTS-STRIPE.md`, `MICROSERVICE-COMMUNICATION.md`,
`OBSERVABILITY.md`, `AUTH-STRATEGIES.md`.
