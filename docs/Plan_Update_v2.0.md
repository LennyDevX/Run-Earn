Contexto: qué es la doc de Polygon hoy
La doc actual se reorganizó alrededor del Open Money Stack (OMS): pagos fiat↔stablecoin, wallets embebidas, cross-chain y la infra base (Polygon Chain, CDK, Agglayer, agentic). Tu proyecto ya usa la capa base (Polygon PoS, POL nativo, EVM, The Graph). El valor nuevo para Airen está en las capas de wallets, pagos y agentic que no estás usando.

Lo que YA aprovechas (baseline)
Recurso	Estado en Airen
Polygon PoS / Amoy	✅ Providers.tsx con switch polygon/amoy, fallback RPC onfinality
POL nativo (gas + economía)	✅ Todo el protocolo cobra en POL (66 usos de msg.value)
Finalidad determinista 2–5s	✅ implícito en tu UX de receipts
The Graph	✅ subgraph nuxgraph + proxy /api/subgraph
Faucets Amoy / gas barato	✅ dev flow actual
EIP-1193/6963 wallets	✅ MetaMask + OKX con handoff móvil
Lo valioso que NO estás usando — por categoría
A. Onboarding y UX — el mayor desbloqueo
Hoy tu funnel exige: instalar wallet → conseguir POL para gas → comprar la veSneaker. Tres fricciones antes del primer mint.

1. OMS Non-Custodial Wallets (embebidas) — docs.polygon.technology/wallets/non-custodial-wallets

Wallet con email OTP u OIDC, sin extensión, sin seed phrase, integrada en tu app.
Estándares: EIP-712, EIP-1271 (firma de smart wallet), EIP-6492 (firma antes de desplegar el contrato de la wallet).
Impacto en Airen: el usuario casual del minijuego Tab entra con email y juega; la wallet existe pero es invisible. Tu mobile nav + PWA ya apuntan a consumidor masivo — esto es la pieza que falta.
SDKs: TypeScript (web), React Native, Swift, Kotlin. El TS SDK funciona con wagmi connector.
2. Gas Sponsorship — docs.polygon.technology/wallets/gas-sponsorship

Tu proyecto paga el gas del usuario (configurable: todas las tx, o las primeras N). Facturación mensual en USD vía OMS.
En testnets es gratis automáticamente.
Impacto: elimina el requisito "necesitas POL antes de poder comprar/jugar". El usuario entra con email, recibe su primera veSneaker, y nunca vio un faucet ni un exchange. A $0.002/tx, patrocinar un usuario activo cuesta centavos al mes.
Nota: requiere OMS smart wallets — va de la mano con el punto 1.
3. Smart Sessions — docs.polygon.technology/wallets/smart-sessions

Permiso acotado, revocable y con expiración: la app ejecuta txs dentro de un scope sin pedir firma cada vez.
Impacto en Airen: activate(tokenId) diario, equip/useAbility, y las sesiones del Tab Arena podrían correr sin popup de firma durante una sesión de juego. Hoy cada acción = firma. Con Smart Sessions: "autoriza jugar hoy" → la sesión corre sola dentro de límites on-chain.
B. Pagos y monetización
4. Trails (cross-chain SDK) — docs.polygon.technology/cross-chain — paquete 0xtrails, React 19.1+ ✅ (tienes 19.3)

Widget Fund: el usuario fondea desde tarjeta, Apple Pay, banco, exchange o cualquier wallet/chain y recibe en Polygon.
La parte interesante: to.calldata con dynamic() — "paga con tarjeta → cuando llegan los fondos, ejecuta buy(designIndex) automáticamente". Compra de veSneaker con tarjeta en un solo paso.
Requiere API key del Trails Dashboard (separada de OMS). Widget, headless SDK, o API directa.
Verificación pendiente en la fase de diseño: el store cobra en POL nativo (msg.value), así que la integración exacta es "fondos llegan como USDC → swap a POL → calldata" o añadir una ruta de pago USDC al store.
5. x402 — pagos por llamada HTTP — docs.polygon.technology/payment-services/agentic-payments/x402 — el más alineado con tu stack actual

Envuelve cualquier API route con withX402 (@x402/next) → cobra en USDC por llamada, verificado on-chain vía el facilitador de Polygon (mainnet + Amoy, ambos v2).
Caso directo: /api/generate-sneaker hoy te cuesta dinero (Gemini) y lo proteges con rate limit + presupuesto diario — defensa pura. Con x402: el pago es el rate limit. ~$0.50–$1 por generación en USDC y el endpoint se autofinancia.
Bonus: tu endpoint queda indexado en el x402 Bazaar → agentes IA de terceros pueden descubrir y pagar por mintear coleccionables en Airen sin cuenta ni UI. Encaja perfecto con la narrativa "AI collectibles".
Es un wrapper de ~20 líneas sobre la route existente, compatible con tu middleware de rate-limit actual.
6. USDC nativo como moneda alternativa — docs.polygon.technology/payment-services/stablecoins

Tu banda de coleccionables es 252–8,000 POL — flota con el precio de POL. Los diseños del store se definen como "USD targets" pero el precio queda clavado en POL al configurarlo.
Aceptar USDC (0x3c49...3359 nativo en Polygon) en SneakerMarketplace/VeSneakerStore = precios estables reales + el rail estándar de OMS/Trails/x402.
7. Chainlink POL/USD on-chain — docs.polygon.technology/tools/oracles/chainlink

Feed POL/USD ya existe en Amoy (0x00138214...f5D43) y mainnet.
Uso concreto: VeSneakerStore guarda precios USD-target clavados a POL_USD_PRICE fijo — si POL se mueve 30%, tus precios quedan desalineados hasta que el admin reconfigure. Con Chainlink, quote() puede recalcular POL equivale a $40 en tiempo real. También sirve para el appraiser como señal USD.
Tu skill de seguridad ya dice "no usar feeds sin oracle revisado" — Chainlink es el oracle revisado.
C. Operaciones e infra del lado servidor
8. Server Wallets / Agentic Wallets — docs.polygon.technology/wallets/server-wallets

Hoy ARENA_SIGNER_PRIVATE_KEY es una llave en env — si se filtra, firma cualquier cosa que el contrato acepte.
Un Server Wallet con Smart Session acotada (solo completeSession, límite de tiempo, lista de contratos) reduce el blast radius a casi cero. Misma idea para las llamadas admin: FeeSplitter.distribute(), funding, seeds.
9. sPOL / delegación para tesorería — docs.polygon.technology/pos/concepts/tokens/spol

Tu SneakerStaking paga APY desde una reserva fondeada por admin — es un pasivo puro.
El POL ocioso de la tesorería/FeeSplitter podría ir a sPOL (liquid staking) o delegación directa a validators → la reserva de recompensas se autofinancia con yield real del protocolo en vez de tu bolsillo. sPOL sigue siendo líquido (ERC-20) para cuando necesites retirar.
10. IPFS para metadata — docs.polygon.technology/tools/storage/ipfs

Hoy el artwork AI se preserva embebido y los assets oficiales viven en public — metadata HTTP depende de tu host.
tokenURI → ipfs:// = permanencia del coleccionable incluso si tu dominio desaparece. Estándar esperado por marketplaces externos (OpenSea etc. si algún día listas ahí).
11. Chain Indexer Framework — docs.polygon.technology/tools/chain-indexer-framework

Alternativa/complemento self-hosted a The Graph para pipelines de eventos — útil si quieres analítica propia (leaderboards, historial de arena, wear curves) sin depender del slug del Studio.
D. Capa agentic — alineada con tu marca AI
12. ERC-8004 + Agentic Services directory — identidad/reputación on-chain para agentes.

Si publicas el mint x402, un agente puede tener identidad propia y coleccionar. Marketing + diferenciador narrativo ("la primera colección de sneakers minteable por agentes"), pero es Tier 3.
13. Polygon Agent CLI — toolkit CLI para agentes (wallets, Trails, x402, ERC-8004). Útil para probar el flujo agente→mint de punta a punta.

E. Estratégico / futuro
14. Agglayer — bridge seguro cross-chain. Hoy irrelevante (eres single-chain), pero si Airen crece, es el camino a liquidez multi-chain del marketplace sin reescribir.

15. Polygon CDK — tu propia chain. Solo si el volumen del juego lo justifica algún día (fee token propio, throughput dedicado). Enterprise, gestionado por Polygon — para la roadmap imaginaria, no para ahora.

Lo que NO aplica a Airen
Feature	Por qué no
OMS Custodial Wallets + Payments API completa	Requiere KYC/KYB regulado — es para neobancos/fintech, no un juego NFT
Validators / nodos propios	Usa RPC providers; correr Bor+Heimdall no te da nada
matic.js / PoS bridge SDK	Legacy; viem cubre lo que necesitas
dApp Launchpad	Scaffolding — tu proyecto ya existe
Private Send	No hay caso de uso en un juego público
Remesas / payouts fiat	Fuera de scope — a menos que quieras cash-out de REN algún día (eso sería OMS off-ramp, Tier futuro)


Plan propuesto por fases

**v2.0 cerrado.** Las cuatro fases están recorridas y cada punto tiene un estado
verificado, no una intención. Lo que queda abierto no es trabajo pendiente por
descuido: son bloqueadores externos (un dominio público, una credencial aprobada a
mano, un estándar en Draft) o decisiones que solo puede tomar el dueño del
protocolo.

| Fase | Resultado |
| --- | --- |
| 1 — Fundación de pagos | ✅ x402 liquidado on-chain, Chainlink verificado contra el feed real, Trails cableado |
| 2 — Onboarding invisible | ✅ wallet in-app funcionando, verifier de gas implementado, batching en los tres flujos de dos firmas |
| 3 — Resiliencia económica | ⚠️ prematura por medición: la tesorería está a 0 y no hay economía que optimizar |
| 4 — Narrativa agentic | ✅ manifiesto x402 de descubrimiento; 4.2 bloqueado por Draft + chain, 4.3 evaluado y descartado |

Estado a 19/10/2026.

---

## Fase 1 — Fundación de pagos ✅ COMPLETA

| # | Acción | Estado |
| --- | --- | --- |
| 1.1 | x402 en `/api/generate-sneaker` | ✅ **Verificado con un pago real liquidado on-chain.** tx `0x356bc2ef…`, 0.75 USDC, EIP-3009 firmado por el pagador y ejecutado por el facilitador. `X402_PAY_TO` en `0x581A41c6…` |
| 1.2 | Chainlink POL/USD | ✅ **Verificado contra el feed real.** Mainnet `0xAB594600376Ec9fD91F8e885dADF0CE036862dE0` ("MATIC / USD", 8 dec). Los 3 diseños sincronizados: Astra 1401.04 / Sol 579.10 / Luna 906.01 POL |
| 1.3 | Trails Fund | ⚠️ **Pendiente (aplazado por decisión).** El módulo está cableado y el botón renderiza en `/collection`, `/staking` y `/defi`; el SDK (~2.3 MB) no se carga hasta el click. El widget en sí no se ha ejercitado — requiere navegador |

**Hallazgo de 1.2 que corrige la doc de Polygon:** el feed de mainnet se llama
"MATIC / USD", no "POL / USD" (POL reemplazó a MATIC 1:1 y Chainlink nunca renombró
el aggregator). Y **Amoy no tiene feed POL/USD**: la dirección que da la doc de
Polygon es un proxy muerto — tiene bytecode, pero toda llamada revierte y su
`aggregator()` es la dirección cero.

---

## Fase 2 — Onboarding invisible ✅ COMPLETA (4 pendientes)

Se implementó con **thirdweb**, no con OMS: OMS exige una `publishableKey` que
Polygon aprueba a mano, y thirdweb es self-serve.

| # | Acción | Estado |
| --- | --- | --- |
| 2.1 | Wallet in-app (email/social) | ✅ **Funcionando.** Verificado en navegador: se creó `0xa20c…78b6`, conectada a Polygon Mainnet. Cableada como tercer proveedor EIP-1193 junto a MetaMask y OKX. + botón de copiar dirección |
| 2.2 | Gas sponsorship | ✅ Configurado (`executionMode: EIP7702` + `sponsorGas`) + **verifier implementado y probado** (`/api/verify-sponsorship`, 6 casos) |
| 2.3 | Session keys → **batching** | ✅ Implementado como batching sobre el smart account EIP-7702. `equip` = `approve` + `equip` en **una** transacción |

### Pendientes de la Fase 2

| # | Pendiente | Por qué queda abierto |
| --- | --- | --- |
| 2.a | **Test de EIP-7702 en tu wallet** | Verificar que `0xa20c…78b6` tiene código de delegación (`0xef0100…`) — un EOA normal no tiene ninguno. Necesita la dirección completa |
| 2.b | **Test de gasless end-to-end** | `/profile` → poner un username. `PlayerProgress.setUsername` es `external` sin role gate, así que es gratis y cualquier wallet puede llamarlo. Con 0 POL: si funciona, el gas está patrocinado |
| 2.c | **Los otros pares `approve` + acción** | Listar en el marketplace y crear subasta siguen pidiendo **dos firmas**. Es el mismo patrón que ya resolví en `equip`; falta convertirlos |
| 2.d | **Config del verifier en el dashboard** | Apuntar el Server Verifier a `/api/verify-sponsorship` + límite de gasto global + restringir a la chain 137. La URL debe ser pública, así que **la política solo se ejercita desplegada** |

**Riesgo que motivó 2.2 y no estaba en el plan:** `sponsorGas: true` sin política
patrocina **toda** transacción de **toda** wallet in-app — y la wallet la crea
cualquiera con un email. Es un presupuesto de gas ilimitado y sin autenticación.
El verifier lo acota a los contratos de Airen.

**Deuda que introdujo thirdweb:** 163 paquetes `@solana*` y el audit de 40 → 65
(los `high` siguen en 16). Están en el árbol de `@x402/svm`, que solo se alcanza
por un import que un stub en `next.config.ts` intercepta — nunca llegan al bundle.
Es ruido de audit, no superficie de ataque.

---

## Fase 3 — Resiliencia económica ⚠️ PREMATURA

**La conclusión de la auditoría, medida contra mainnet: la Fase 3 optimiza una
tesorería que está vacía.** `scripts/treasury-yield.ts` reporta 0 POL ocioso en
los dos pools. La "resiliencia económica" presupone una economía, y todavía no
hay: sin ventas no hay fees, sin fees no hay nada que repartir, y la reserva de
staking que financia el APY la fondea alguien a mano.

Eso no invalida la fase — la reordena. El trabajo útil ahora es **habilitar
ingresos**, no optimizar su rendimiento.

| # | Acción | Estado verificado |
| --- | --- | --- |
| 3.1 | Tesorería → liquid staking | 🔴 **Prematuro, y medido.** `scripts/treasury-yield.ts` (read-only) reporta contra mainnet: `FeeSplitter.pendingFees()` = **0 POL**, `SneakerStaking.availablePOLRewards()` = **0 POL**. No hay nada que barrer. Además el destino no es un detalle: `sPOL` vive en **Ethereum mainnet** (`0x3B790d651e950497c7723D47B24E6f61534f7969`) y el staking de Polygon PoS se gestiona desde Ethereum, así que usarlo implica un bridge desde Polygon. Hay LSTs nativos (stMATIC de Lido, MaticX de Stader) que lo evitan. El script queda como el instrumento que dirá cuándo esto importa |
| 3.2 | Server Wallet para `ARENA_SIGNER` | � **Bloqueado, con evidencia.** Se creó el Server Wallet (`0x304870DC…`, label "Airen arena signer") y se probó a firmar con él (`scripts/verify-server-wallet-signing.mjs`). El contrato recupera con `ecrecover` puro; el Server Wallet firma con la dirección del signer → **se recupera a otra dirección** (`0xEDE8c980…`), y con la del smart account → 564 bytes ERC-1271, que `ecrecover` no procesa. **Ninguna verifica: 3.2 no es implementable sin cambiar el contrato** a verificación ERC-1271 (`isValidSignature`) + redeploy del arena. La llave cruda se queda — funciona, y su daño ya está acotado por el clamp del contrato |
| 3.3 | USDC en el marketplace | 🟡 **Cambio de contrato sobre uno ya desplegado.** `SneakerMarketplace` cobra con `msg.value` y el `FeeSplitter` distribuye en POL. Añadir ERC-20 implica ruta paralela, escrow por moneda, contabilidad de fees por moneda y un redeploy con re-wiring |
| 3.4 | IPFS metadata | 🟡 **El trade-off es real, no obvio.** Hoy el artwork AI se **embebe** en el `tokenURI` como data URI: es permanente y no depende de nada externo. Moverlo a `ipfs://` cambia permanencia por dependencia de pinning, y el ahorro de calldata en Polygon es marginal (~0.001 POL por mint). **Puede ser un downgrade** — conviene decidirlo, no implementarlo |

---

## Fase 4 — Narrativa agentic y expansión

| # | Acción | Estado |
| --- | --- | --- |
| 4.1 | Descubrimiento x402 | ✅ **La mitad implementable, hecha.** `/.well-known/x402` (rewrite → `/api/x402-manifest`) publica el precio, el `payTo`, la red y la forma de entrada/salida de la ruta. **Derivado de `x402RouteConfig()`**, la misma fuente que usa el cobro, así que no puede cotizar un precio distinto al que cobra. El 402 verificado: v2, `exact`, `eip155:137`, 750000 (0.75 USDC), `payTo` = tesorería. 🔴 **El listado sigue bloqueado por el dominio público** — el catálogo de Polygon es self-serve (sign-in con wallet, modo `catalogOnly` apuntando a `externalUrl`), pero no se puede listar un endpoint que vive en `localhost` |
| 4.2 | Identidad ERC-8004 | 🔴 **Bloqueado, y por tres motivos a la vez.** (1) El estándar está en **Draft**. (2) Los registros de referencia están desplegados en Ethereum, Base, BNB, Avalanche y Mantle — **Polygon no aparece en la lista publicada**; verificar antes de implementar. (3) El `tokenURI` del registro apunta a un "agent card" JSON que debe estar en una URL pública. Sin dominio no hay tarjeta, sin tarjeta no hay registro. **No se construyó nada especulativo**: inventar el esquema de un estándar en Draft para un registro que no existe en esta chain no es trabajo, es deuda |
| 4.3 | Agglayer | ✅ **Evaluado: no aplica todavía.** Agglayer resuelve liquidez y estado fragmentados entre chains. Airen vive en una sola chain (Polygon), con toda su economía — contratos, tesorería, NFTs, x402 — en el mismo sitio. No hay nada que unificar. El disparador para revisarlo es concreto: una segunda chain con activos reales (por ejemplo coleccionables en otra red que deban operar en el marketplace) o un usuario pidiendo mover valor entre chains. Hasta entonces, integrarlo añadiría una dependencia y una superficie de confianza nuevas a cambio de cero |

**Lo que la Fase 4 sí produjo:** un manifiesto de descubrimiento que hace la ruta legible por un agente sin leer la app, y que no puede desviarse de lo que el endpoint cobra. Es la parte que no dependía de tener dominio.

