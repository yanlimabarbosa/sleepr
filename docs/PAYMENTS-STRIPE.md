# Payments (Stripe) — curso vs production-grade

Nota sobre o microservice de pagamento: o **conceito** (um serviço `payments`
isolado, chamado via TCP pelo `reservations`) é sólido e escalável. O **mecânico
Stripe** que o curso usa é **didático e hoje legado** — funciona no vídeo por
detalhes de conta/versão, não porque é o jeito atual. Este doc registra a
diferença para quando isso virar algo real.

## O que o curso faz (e por que quebra hoje)

```ts
// payments.service.ts — cria o PaymentMethod NO BACKEND a partir do cartão
const paymentMethod = await this.stripe.paymentMethods.create({
  type: 'card',
  card: { number, cvc, exp_month, exp_year }, // dado de cartão cru
});
```

Dois problemas:

1. **Raw card data bloqueado.** Mandar número de cartão cru pro backend exige a
   permissão "raw card data APIs", que **não** é self-service — precisa pedir ao
   suporte da Stripe (test mode: só e-mail; live mode: e-mail + documento PCI
   SAQ D / Attestation). Contas novas (a nossa) nascem bloqueadas; a conta do
   curso é antiga/liberada. Por isso o mesmo código roda no vídeo e falha aqui,
   com: *"Sending credit card numbers directly to the Stripe API is generally
   unsafe..."*.
   Fonte: <https://support.stripe.com/questions/enabling-access-to-raw-card-data-apis>

2. **API legada.** A Tokens API (`tok_...`) e a Sources API (`src_...`) foram
   **substituídas** pela Payment Methods API (`pm_...`) como forma recomendada de
   coletar/armazenar pagamento. Criar `PaymentMethod` no servidor a partir de
   cartão/token é o modelo que a Stripe está aposentando.
   Fonte: <https://docs.stripe.com/payments/payment-methods/transitioning>

## Nossa solução no projeto (test PaymentMethod `pm_`)

Em vez de mandar cartão cru (bloqueado) ou criar um `PaymentMethod` a partir de um
token de teste (`tok_visa`, que é o hash legado de backwards-compatibility),
usamos um **test PaymentMethod pronto** da Stripe direto no PaymentIntent:

```ts
const paymentIntent = await this.stripe.paymentIntents.create({
  amount: amount * 100,
  confirm: true,
  currency: 'usd',
  payment_method: 'pm_card_visa', // test PaymentMethod pré-fabricado (pm_)
});
```

Por que isso é melhor que o `paymentMethods.create({ card })` original (e que o
`tok_visa` que chegamos a testar):

- `pm_card_visa` é um **PaymentMethod** (`pm_`) — a API **atual** e recomendada,
  não a Tokens API legada (`tok_`) nem o envio de cartão cru (bloqueado).
- Some o passo `paymentMethods.create` no backend: o `pm_` já é o método pronto,
  passado direto no `PaymentIntent`. Menos código, menos legado.

Outros test PaymentMethods úteis: `pm_card_visa`, `pm_card_mastercard`,
`pm_card_chargeDeclined` (para testar falha de cobrança).
Fonte: <https://docs.stripe.com/testing#cards>

**Nota (fidelidade ao curso):** o `CreateChargeDto` **mantém** o `card: CardDto`
(cvc/exp/number, com `@ValidateNested`) e o `.http` ainda envia o cartão — como no
curso. Mas o service **ignora** esse `card` e usa o `pm_card_visa` chumbado. Ou
seja, hoje o `card` é **input validado porém não usado** — um smell didático: em
produção não se enviaria cartão cru ao backend (ver fluxo abaixo). Mantido assim
só para não divergir do vídeo.

A única diferença para o fluxo production-grade abaixo é **quem cria o `pm_`**:
aqui é um id de teste chumbado no backend; em produção, o **client** (Stripe.js/
Elements) cria o `pm_` do cartão real e manda o id.

## O padrão moderno da Stripe (o que se faz de verdade)

### A regra inviolável (vale em TODO fluxo moderno)

```
O CARTÃO É COLETADO NO CLIENT (Stripe.js / Payment Element).
O BACKEND NUNCA VÊ O NÚMERO DO CARTÃO (PAN).
```

O dado do cartão vai do browser **direto pra Stripe**; o backend só lida com
objetos da Stripe (PaymentIntent / CheckoutSession) e um **`client_secret`**. É
isso que tira a aplicação do escopo PCI-DSS. O curso faz o **oposto** (cartão cru
→ backend → Stripe), por isso é legado/inseguro.

### As duas integrações recomendadas (em ordem de preferência da Stripe)

**1. Checkout Sessions API + Payment Element** — recomendado para a **maioria**.
A própria doc diz: *"Não use a Payment Intents API a menos que solicitado
explicitamente, pois exige significativamente mais código."* Menos código, a
Stripe cuida de mais coisa (impostos, line items, etc.).

**2. Payment Intents API + Payment Element** — mais controle, mais código. Só
quando precisar de algo que o Checkout não entrega.

> O curso usa **Payment Intents crua com cartão no backend** — dois níveis atrás:
> nem usa o Payment Element (client-side), nem o Checkout Session. É didático.

### Fluxo concreto — Payment Intents + Payment Element (o mais perto do nosso)

**Backend** — cria o PaymentIntent e devolve o `client_secret` (NÃO confirma):

```ts
const paymentIntent = await stripe.paymentIntents.create({
  amount: amount * 100,
  currency: 'usd',
  automatic_payment_methods: { enabled: true },
  // SEM confirm: true, SEM payment_method — quem confirma é o client
});
return { clientSecret: paymentIntent.client_secret };
```

**Client (browser)** — coleta o cartão e confirma; o backend nunca toca no cartão:

```js
const stripe = Stripe('pk_test_...');                  // chave PÚBLICA
const elements = stripe.elements({ clientSecret });     // client_secret do backend
const paymentElement = elements.create('payment');
paymentElement.mount('#payment-element');               // UI de cartão da Stripe

await stripe.confirmPayment({
  elements,
  confirmParams: { return_url: 'https://seuapp.com/success' },
});
```

### Curso vs moderno

| aspecto            | curso (Payment Intents cru)        | moderno (Element, client-side)            |
| ------------------ | ---------------------------------- | ----------------------------------------- |
| Quem coleta cartão | backend (recebe cvc/número)        | **client** (Payment Element)              |
| Backend vê o PAN?  | sim ❌                              | **não** ✓ — fora do escopo PCI            |
| Quem confirma      | backend (`confirm: true`)          | **client** (`stripe.confirmPayment`)      |
| `return_url`       | vira o 500 do redirect             | nativo no client (a página dele)          |
| Nível recomendado  | evitar                             | 2º (1º é Checkout Session)                 |

### Por que o `confirm: true` no backend deu aquele 500 do `return_url`

`confirm: true` tenta confirmar **no backend**. Métodos redirect exigem um
`return_url` (pra onde devolver o cliente), que o backend não tem. No fluxo
moderno quem confirma é o **client**, que **tem** uma página → o `return_url` é
natural lá. O curso força a confirmação no lugar errado — daí o erro. Nosso
`payment_method_types: ['card']` contorna limitando a cartão (sem redirect), mas
é remendo: o certo é confirmar no client.

Fontes:
- <https://docs.stripe.com/payments/quickstart> (Checkout Sessions + Payment Element é o recomendado)
- <https://docs.stripe.com/payments/accept-a-payment>
- <https://docs.stripe.com/payments/payment-methods>

## Estado atual (feito nesta sessão)

- `reservations.service.create` usa `.pipe(map(...))` (retorna o Observable, Nest
  subscreve): cobra **primeiro**, e só então persiste a reservation com o
  `paymentIntent.id` real como `invoiceId` (antes era um `"123"` chumbado).
- Retorno do RPC tipado: `send<ChargeResponse>('create_charge', ...)` — interface
  `ChargeResponse { id: string }` em `libs/common` como contrato do RPC (análogo a
  um proto no gRPC), mantendo o reservations desacoplado do SDK da Stripe.
- Cobrança funcional: `pm_card_visa` + `payment_method_types: ['card']`.

## Pendências (didático → produção)

- **Confirmar no client, não no backend**: hoje `confirm: true` no service é o
  anti-padrão que causou o 500 do `return_url`. O certo é o backend só devolver o
  `client_secret` e o Payment Element confirmar (ver seção do padrão moderno).
- **Não enviar cartão cru**: o `card` no `CreateChargeDto`/`.http` é validado mas
  ignorado (`pm_card_visa` chumbado). Em produção, o cartão nunca chega ao backend.
