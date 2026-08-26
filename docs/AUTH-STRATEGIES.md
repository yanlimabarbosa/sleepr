# Autenticação em Microservices — Abordagens & Comparação

Documento de referência para a estratégia de auth do sleepr. Hoje usamos
**validação delegada** (cada serviço pergunta ao auth via TCP). Esta é uma
escolha **didática** — no futuro provavelmente migraremos para **validação
local stateless**. Aqui ficam todas as opções, prós/contras e o caminho de
migração.

## Estado atual (o que temos hoje)

**Abordagem: chamar o auth por request (validação delegada via TCP).**

Fluxo:
```
reservations POST /reservations
  → JwtAuthGuard (@app/common)  [CanActivate custom]
      pega cookie Authentication
      authClient.send('authenticate', { Authentication: jwt })  ──TCP──┐
                                                                        │
                                              ┌─ auth ──────────────────▼──┐
                                              │ @MessagePattern('authenticate')
                                              │ @UseGuards(JwtAuthGuard local = AuthGuard('jwt'))
                                              │   JwtStrategy:
                                              │     extrai token (cookie ou payload RPC)
                                              │     verifica assinatura (JWT_SECRET, HS256)
                                              │     decodifica payload { userId }
                                              │     validate → usersService.getUser(userId)
                                              │     retorna user  ──TCP──┐
                                              └─────────────────────────┘
      tap((res) => request.user = res)  ◄──────────────────────────────┘
      → autoriza (true)
  → @CurrentUser() user  lê request.user
```

Peças envolvidas:
- `libs/common/src/auth/jwt-auth.guard.ts` — guard que delega via `ClientProxy`.
- `apps/auth/src/strategies/jwt.strategy.ts` — valida assinatura + carrega user.
- `apps/*/reservations.module.ts` — `ClientsModule.registerAsync([AUTH_SERVICE])`.
- `apps/auth/src/main.ts` — `connectMicroservice({ transport: TCP })`.
- Token: **HS256**, `JWT_SECRET` compartilhado, cookie httpOnly `Authentication`.

---

## As 4 abordagens

### 1. Validação local stateless — RS256 + JWKS  ⭐ (alvo futuro)

Cada serviço valida o JWT **sozinho**, verificando a assinatura com a **chave
pública** do auth. Nenhuma chamada ao auth por request.

```
auth assina com chave PRIVADA (só ele tem)
cada serviço valida com chave PÚBLICA (busca do JWKS uma vez, cacheia)
```

```ts
// strategy em CADA serviço
super({
  jwtFromRequest: ExtractJwt.fromExtractors([
    (req) => req.cookies?.Authentication ?? null,
  ]),
  secretOrKey: publicKey,        // chave pública do auth
  algorithms: ['RS256'],
});

validate(payload: TokenPayload) {
  return payload;                // só { userId }, sem DB, sem chamar auth
}
```

**Prós:**
- Zero round-trip — latência mínima.
- Sem gargalo / SPOF — auth caindo não derruba validação dos outros.
- Escala horizontal perfeita.
- Serviços validam mas **não forjam** (só têm a pública). Auth é o único emissor.
- Padrão da indústria (Auth0, Cognito, Keycloak).

**Contras:**
- Revogação difícil — token vale até expirar (mitigar com tokens curtos + refresh).
- Setup de chaves (par privada/pública, endpoint JWKS, rotação).
- Lógica de validação em cada serviço (copiável / lib compartilhada).

### 2. Validação local stateless — HS256 (segredo compartilhado)

Igual à #1, mas com **segredo simétrico** em vez de par de chaves.

```
auth assina com JWT_SECRET
cada serviço valida com o MESMO JWT_SECRET
```

```ts
super({
  jwtFromRequest: ExtractJwt.fromExtractors([...]),
  secretOrKey: configService.getOrThrow('JWT_SECRET'),  // segredo compartilhado
});
validate(payload) { return payload; }
```

**Prós:**
- Zero round-trip, sem gargalo (igual #1).
- **Setup simples** — só o `JWT_SECRET` já compartilhado; sem infra de chaves.
- Migração trivial a partir do que já temos (o auth já usa HS256).

**Contras:**
- **Todo serviço conhece o segredo → qualquer um pode forjar tokens.** Só aceitável
  entre serviços internos confiáveis.
- Rotação de segredo afeta todos ao mesmo tempo.
- Mesma limitação de revogação da #1.

### 3. API Gateway

Um ponto de entrada valida o token **uma vez** na borda e repassa a identidade
(ex: header `X-User-Id`) pros serviços internos, que **confiam** no gateway.

```
browser → [API Gateway] valida 1x, injeta X-User-Id ──┐
                        ┌─────────────────────────────┼───────────────┐
                        ▼                             ▼                ▼
                  [reservations]                [payments]      [notifications]
                  lê X-User-Id (não revalida)
```

```ts
// serviço interno — não valida JWT, só confia no header do gateway
@Post()
create(@Headers('x-user-id') userId: string, @Body() dto) {
  return this.service.create(dto, userId);
}
```

**Prós:**
- Valida uma vez — serviços internos ficam mínimos (só leem header).
- Sem round-trip nos serviços internos.
- Ponto central pra rate limiting, logging, CORS, WAF — não só auth.
- Troca de estratégia de auth num lugar só.

**Contras:**
- **Depende de isolamento de rede rígido** — se um serviço interno vazar pra
  internet, qualquer um forja `X-User-Id`. Segurança "confia no gateway" é frágil
  sem rede privada garantida.
- Gateway vira SPOF (mitigar com réplicas/HA).
- Mais uma peça de infra.
- Revogação: mesma limitação stateless (a menos que o gateway consulte um store).

### 4. Chamar auth por request (o que temos hoje)

Cada request protegida faz uma chamada síncrona ao auth pra validar.

**Prós:**
- **Revogação instantânea** — o auth checa o estado atual toda vez; banir/deslogar
  tem efeito imediato. (Único que resolve isso naturalmente.)
- Fonte única da verdade — permissões mudaram? reflete na hora.
- Conceitualmente simples ("pergunta pro dono").
- **Ótimo pra aprender comunicação entre microservices** (TCP, ClientProxy,
  MessagePattern) — motivo da escolha no curso.

**Contras:**
- Round-trip por request — latência extra sempre.
- Auth = SPOF e gargalo: cai o auth, cai tudo; escala do auth limita o sistema.
- Reacopla os serviços ao auth (anti-microservice).
- Mais complexo nos serviços (ClientProxy, TCP, retry, timeout).

---

## Comparação

| Critério | 1. Local RS256 | 2. Local HS256 | 3. Gateway | 4. Chamar auth (atual) |
|---|---|---|---|---|
| Round-trip por request | não | não | não (nos serviços) | **sim** |
| Auth é gargalo/SPOF? | não | não | não | **sim** |
| Cada serviço valida? | sim (local) | sim (local) | não (gateway) | não (delega) |
| Pode forjar token? | só o auth emite | **qualquer serviço** | n/a | só o auth |
| Revogação instantânea | difícil | difícil | difícil | **fácil** |
| Isolamento de rede crítico? | não | não | **sim** | não |
| Complexidade nos serviços | média | baixa | mínima | média/alta |
| Setup de infra | chaves/JWKS | mínimo | gateway | ClientProxy/TCP |
| Padrão de mercado | **muito** | pouco/médio | **muito** | pouco (didático) |

## Ranking (caso geral)

1. 🥇 **Local stateless RS256 + JWKS** — maioria dos casos; escala, muitos serviços, terceiros.
2. 🥈 **API Gateway** — quando já há borda clara + rede isolada; centraliza rate limit/log.
3. 🥉 **Local stateless HS256** — poucos serviços internos confiáveis.
4. **Chamar auth por request** — só quando revogação instantânea é requisito duro, ou sistema pequeno/didático.

> O ranking assume que **expiração curta é aceitável**. Se o domínio exige kill
> instantâneo de sessão (banco, saúde, admin sensível), a #4 sobe ou combina-se
> com as outras — ver híbrido abaixo.

## Híbrido (o que big techs realmente fazem)

Combina performance do stateless com controle de revogação:

- **Access token stateless curto** (~5–15 min) → validação **local** (rápido, sem
  round-trip na maioria das requests).
- **Refresh token** de longa duração + **blacklist** (Redis/store no auth) →
  revogação controlada; usado só no endpoint `/refresh`.
- Access token expira rápido → mesmo sem revogar, a janela de risco é pequena.

Resultado: rápido no caminho quente, com revogação onde importa.

## Caminho de migração (sleepr: #4 → #2 → #1)

**Passo 1 — #4 → #2 (local HS256), migração mínima:**
- Dar ao `reservations` (e futuros serviços) a **própria `JwtStrategy`** que valida
  com o `JWT_SECRET` compartilhado (igual à do auth).
- Trocar o `JwtAuthGuard` do `@app/common` (delega via TCP) por `AuthGuard('jwt')`
  local em cada serviço.
- Remover `ClientsModule.register([AUTH_SERVICE])`, o `ClientProxy`, o
  `@MessagePattern('authenticate')` e o `connectMicroservice` TCP (se o TCP não for
  usado pra mais nada).
- `validate(payload)` retorna `{ userId }` direto — sem carregar user do banco (o
  `reservations` não tem/precisa do banco de users).
- Ganho imediato: some o round-trip e o acoplamento ao auth.

**Passo 2 — #2 → #1 (RS256 + JWKS), endurecer:**
- Auth passa a assinar com **chave privada** (RS256), expõe a **pública** via JWKS.
- Serviços validam com a pública (`algorithms: ['RS256']`), buscam/cacheiam a
  chave do JWKS.
- Serviços deixam de conhecer segredo → não conseguem forjar. Só o auth emite.

**Passo 3 — revogação (se/quando necessário):**
- Encurtar `JWT_EXPIRATION` (access token) + adicionar refresh token.
- Blacklist de refresh (Redis) pra logout/ban instantâneo.

## Notas específicas do projeto

- Hoje: HS256, `JWT_SECRET` compartilhado, cookie httpOnly `Authentication`,
  `JWT_EXPIRATION=3600` (1h — longo pra um access token; encurtar ao adotar refresh).
- A `JwtStrategy` do auth já suporta extrair token de **cookie (HTTP)** e de
  **payload (RPC)** — ao migrar pra local, o caminho RPC deixa de ser necessário.
- O `@CurrentUser()` (em `@app/common`) lê `request.user`; com validação local, o
  que popula `request.user` passa a ser o `validate` local (payload), não a resposta
  TCP do auth.
- Decisão de manter o #4 por enquanto é **pedagógica** (aprender comunicação de
  microservices). Migrar quando performance/escala/desacoplamento pesarem mais que
  o valor didático.
