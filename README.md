# Blueprint — an AI project agent for DIY retail, by WalletLoop

> *"I want a 4 × 3 m deck in the garden."*
> → a 3D blueprint of **their** deck, the complete shopping list with exact quantities,
> **their** price with WalletLoop offers applied, points earned, which store has it all in stock,
> a step-by-step plan and the best weather window to build it. In ~10 seconds.

Blueprint runs inside a retailer's app or straight from a link on the customer's **WalletLoop
wallet pass** (no app install needed — the pass already knows who the member is). It is
white-label: the same build demos as a neutral retailer ("Atelier"), as HORNBACH
(`?retailer=hornbach`) or any other DIY chain on WalletLoop.

![Entry](docs/screenshots/01-entry.png)

| Live project board | Shopping list, offers & stock |
|---|---|
| ![Board](docs/screenshots/02-board.png) | ![List](docs/screenshots/03-list.png) |
| **Exploded 3D view** | **Plan, tips & safety** |
| ![Exploded](docs/screenshots/04-exploded.png) | ![Plan](docs/screenshots/05-plan.png) |
| **Stock map & WalletLoop offers** | **List on the wallet pass, sorted by aisle** |
| ![Stock](docs/screenshots/07-stock-offers.png) | ![Wallet](docs/screenshots/08-wallet.png) |
| **Best days to build (live forecast)** | |
| ![Weather](docs/screenshots/06-weather.png) | |

---

## Quick start

```bash
npm install
cp .env.example .env.local        # add OPENAI_API_KEY (optional — see offline mode)
npm run dev                        # http://localhost:3000
```

| URL | What you get |
|---|---|
| `/` | Neutral demo retailer "Atelier" |
| `/?retailer=hornbach` | HORNBACH white-label (name, colour, store names) |
| `/?retailer=brico` | A third example tenant |
| `/?demo=1` | Starts in **offline demo mode** (no LLM calls, instant, deterministic) |
| `/?member=WL-RO-204518` | Opens with a specific demo member |
| `/pitch?retailer=hornbach` | **Pitch page** for a retailer: problem, live project numbers, how it works, trust, ROI calculator, pilot plan (`&lang=en` for English) |

Live deployment (offline demo mode until an `OPENAI_API_KEY` is added in Vercel):
**https://blueprint-walletloop.vercel.app** · pitch: **https://blueprint-walletloop.vercel.app/pitch?retailer=hornbach**

**Offline demo mode.** If there is no API key, the model is rate-limited, or you toggle the
header badge (`AI live` ↔ `Demo offline`), a rule-based agent takes over. It uses **the same
tools** (real calculations, prices, stock, offers), hand-written plans and replies built from the
quote — perfect for pitching on bad Wi-Fi. Fallback is automatic if the LLM fails before
streaming.

## The 3-minute pitch demo

1. **Pick a pass** — four WalletLoop members: Andrei (Gold, renovating, already owns tools),
   Maria (Silver, garden lover), James (Bronze, expat, English), Elena (**no personalisation
   consent** — shows GDPR-respecting behaviour).
2. Andrei → **"Terasă 4 × 3 m"**. Watch the construction log, the deck assemble in 3D (supports
   → joists → boards), the price count up.
3. Point at: *owned tools skipped* ("you bought a drill in March"), *Gold −15 % on paint*,
   *free decking oil bundle*, *150 lei project discount*, *+7.641 points*, *supports short at
   Militari → Berceni has everything, 9.9 km → one tap to move*.
4. Toggle **Real / Exploded** views; hover a shopping-list line to highlight that layer in 3D.
5. Tap **Economic / Standard / Premium** — the same project priced three ways, switched instantly.
6. **"Trimite lista în Wallet"** — the pass flips over: the list sorted by aisle (a walking
   route through the store), tick-off boxes, a QR for the till.
7. Scroll: plan with durations, pro tips, hazard-striped safety box, **7-day weather window**
   (live Open-Meteo forecast, best days to build).
8. Quick replies: *"Variantă mai ieftină"*, *"Ce oferte am?"* (coupons with personal reasons),
   *"Unde e totul pe stoc?"* (Romania stock map). Note the **"✓ N amounts verified"** badge
   under every answer.
9. **Reshape the project.** Say *"Fă-o în L cu o extindere de 2 × 2 m în dreapta"* or *"Adaugă 3
   trepte în față și ridic-o la 50 cm"* — or tap **Modifică** and drag an edge / tap **+** on the
   plan. Only what changed builds in 3D (new parts glow, removed ones sink away in red), the list
   is recalculated keeping the products you picked, and a receipt shows every material and the
   price difference (**Anulează** undoes it). Raising the deck swaps in taller pedestals by itself.
10. Switch to Maria → **"Gazon nou"** (garden ×3 points), James → **"New bathroom"** in English,
   Elena → no personalisation consent. Try the mic button (voice, ro-RO / en-GB).
11. Close with **/pitch?retailer=hornbach** — the ROI calculator and the 6-week pilot plan.

## How it works

```
 Wallet pass link / retailer app
            │
            ▼
 ┌──────────────────────┐   NDJSON stream: status · text · cards · state
 │  Next.js UI (React)  │◀───────────────────────────────────────────┐
 │  rail + live board   │                                            │
 └──────────┬───────────┘                                            │
            │ POST /api/chat {message, history, state}               │
            ▼                                                        │
 ┌──────────────────────┐  tools   ┌──────────────────────────────┐  │
 │ Agent loop           │─────────▶│ Domain (pure, tested)        │  │
 │ OpenAI Responses API │          │  calculators → resolver →    │  │
 │  or scripted agent   │◀─────────│  quote engine (offers,points,│──┘
 └──────────────────────┘  JSON    │  stock, alternatives)        │
                                   └──────────────┬───────────────┘
                                                  │ adapters
                     ┌────────────────┬───────────┴───┬──────────────────┐
                     ▼                ▼               ▼                  ▼
                 Catalogue        Inventory        Stores          WalletLoop loyalty
               (retailer API)   (retailer API)  (retailer API)   (members, offers, pass)
```

**The LLM never does maths and never invents products.** It gathers the customer's intent and
dimensions, calls tools, and explains results. Everything with a number comes from code:

| Layer | File | Responsibility |
|---|---|---|
| Calculators | `src/domain/calculators.ts` | 7 project types → material requirements by *role* (e.g. `18.4 l interior_paint`), with waste factors and the reasoning shown to the customer |
| Resolver | `src/domain/resolve.ts` | Role → product line by quality tier and spec match; cheapest pack-size combination (15 l + 5 l beats 2 × 10 l); skips tools the member already owns |
| Quote engine | `src/domain/quote.ts` | Line totals, best single offer per line, bundles, basket thresholds, loyalty points (tier + category multipliers), redemption cap, stock at chosen store, alternatives, delivery |
| Offers | `src/domain/offers.ts` | Eligibility by tier, segment, member, validity — targeted offers only with personalisation consent |
| Layout | `src/domain/layout.ts` | The editable sketch per project (zones, steps, openings, fence corners/gates), validated edit ops, geometry helpers |
| Agent tools | `src/agent/tools.ts` | `get_customer_context`, `calculate_project`, `edit_sketch`, `modify_basket`, `search_products`, `check_stock`, `get_offers`, `present_plan` |
| Agent loop | `src/agent/run.ts`, `llm.ts` | Streaming tool-use loop behind a provider-neutral `LlmClient` interface |
| Scripted agent | `src/agent/scripted.ts` | Offline RO/EN intent parser + same tools, used as fallback |
| Verification | `src/agent/verify.ts` | Every lei amount in the model's reply must exist in the quote; failing replies are replaced by the deterministic one |
| 3D | `src/components/blueprint/` | Procedural assemblies drawn from the layout, animated build and edit diffs, blueprint/real/exploded views, 2D plan editor |

Conversation state (basket, store, project) is round-tripped by the client, so the server is
stateless and horizontally scalable; history and state from the browser are validated before reuse
(`src/agent/state.ts`).

### The editable sketch

Every project has a **layout** (`src/domain/layout.ts`) — zones (L/U shapes), deck height and steps,
fence corners and gates, doors/windows, per-wall tile heights. It is the single source of truth:
the calculators compute quantities from it and the 3D builders draw it, so the sketch and the
shopping list can't disagree.

- Edits are validated `SketchOp`s (`resize`, `add_zone`, `add_steps`, `set_height`, `add_opening`,
  `add_fence_segment`, `set_wall_tiles`, `set_option`, …) with a readable change log.
- The agent uses them through the **`edit_sketch`** tool; the plan editor posts the same ops to
  **`/api/sketch`** (no LLM call — instant and free). Both keep the customer's product picks
  (unless they no longer fit, e.g. pedestals after raising a deck), leave out what they removed and
  return a **change card**: per-material difference and the price delta, which the verifier accepts.
- The 3D scene diffs part ids between builds, so an edit animates only new/resized/removed parts,
  and the camera glides instead of jumping.
- **When to sketch** is per retailer: `sketch: "auto"` draws every project (demos), `"on_demand"`
  shows a light card with a *Schițează proiectul* button and only builds the 3D when asked
  (production — most people just want the list). Override with `?sketch=auto|on_demand`.
- Cost: hand edits cost nothing (deterministic); an edit by chat is one normal agent turn.

## Integrating the real systems

Everything the agent touches goes through four interfaces in `src/adapters/types.ts`:

```ts
CatalogProvider   get · getMany · search · byRoles
InventoryProvider stock(storeIds, skus)            // batch
StoreProvider     list
LoyaltyProvider   getMember · getOffers            // WalletLoop
```

- **WalletLoop** — `src/adapters/walletloop.ts` is a ready skeleton for the WalletLoop REST API
  (`DATA_SOURCE=walletloop`); adjust the two mappers to the final payloads.
- **Retailer catalogue/stock** — implement the three providers against the retailer's product
  and store-inventory APIs. The only extra data the agent needs is a **role tag** per product
  (e.g. `deck_board`, `tile_adhesive`) plus `content` (how much one sales unit provides) and a
  coverage spec for paints/oils/seed. That mapping is typically a one-off enrichment job over
  the retailer's category tree.
- Demo data lives in `src/data/` (255 products with fictional brands, 11 stores modelled on a
  Romanian DIY network, deterministic stock, 10 WalletLoop offers, 4 personas).

## Privacy & safety

- **Data minimisation**: the model sees tier, points, home store, city, interests and
  purchase history — never name, email, phone or exact location. No personalisation consent →
  no interests/history and no targeted offers. No location consent → only home store is used.
- `store: false` on every model call; history lives in the customer's browser.
- For EU production, run the model in-region (Azure OpenAI EU, or Claude via AWS Bedrock
  Frankfurt / Google Vertex EU) — the `LlmClient` interface is the only thing to swap.
- Safety rules in the prompt and calculators: electrics, gas, structural walls, work at height
  → licensed professional; hazard notes per project.

### Price display (EU / Romanian consumer law)

The quote engine (`src/domain/quote.ts`) does the maths; the list and cart only render it.

- **Prior price on reductions** (Omnibus, Directive 98/6/EC art. 6a): a crossed-out price is
  only ever the product's **lowest price of the last 30 days** (`Product.lowestPrice30d`, never
  above today's price), labelled "Cel mai mic preț din ultimele 30 de zile". If an offer does not
  beat it, the line shows its price with nothing struck through, and the basket's "you save"
  (`quote.saving`) is measured from those references. The retailer adapter must supply
  `lowestPrice30d`; the demo derives it from a seeded history in `src/data/priceHistory.ts`.
- **Personalised prices** (Consumer Rights Directive art. 6(1)(ea)): tier (above entry), segment
  and member-targeted offers are personalised (`isPersonalisedOffer`), badged on the line and
  disclosed in the list and cart footers; offers open to every member are not flagged.
- **Unit price** per l / kg / m / m² (per piece for multi-packs) next to pack products, from the
  list price; none when it equals the selling price.
- **VAT**: all prices include VAT, stated next to the totals.

## Scripts

```bash
npm test                     # 67 unit tests: calculators, pack optimiser, quote engine, offers, scripted agent
npm run typecheck
npm run validate:catalog     # catalogue integrity (roles, units, tiers, fictional brands)
npx tsx scripts/inspect-project.ts deck '{"lengthM":4,"widthM":3}' WL-RO-100231 premium
npx tsx --env-file=.env.local scripts/try-agent.ts "Vreau o terasă de 4x3 m" WL-RO-100231
npm run eval                 # live-model scenarios with automatic accuracy checks
```

## Configuration

See `.env.example`. Key ones: `OPENAI_API_KEY`, `OPENAI_MODEL` (default `gpt-5.4-mini`),
`AGENT_MODE=scripted`, `TENANT`, `DATA_SOURCE`. Per retailer (`src/config/tenant.ts`): brand,
colours, loyalty programme name and `sketch: "auto" | "on_demand"` (demo tenant: auto; HORNBACH and
Brico Nord: on demand).

> **Note on the current OpenAI key:** the account is on a low usage tier (≈50 requests/day
> for `gpt-5.4-mini`, 3 req/min for `gpt-5.5`). One customer turn uses 3–4 requests. Add a
> payment method / raise the tier before live demos — or demo in offline mode.

## Roadmap to production

1. Real catalogue/stock/store adapters + role-tagging job for the retailer's assortment.
2. WalletLoop API mappers + push the shopping list to the wallet pass (back-of-pass field +
   lock-screen notification near the store — WalletLoop already does geo-triggered pushes).
3. Click & Collect reservation via the retailer's order API.
4. More project types (roof insulation, kitchen, wardrobes, irrigation) — each is a calculator,
   a 3D builder and a plan template.
5. Analytics: basket size uplift vs. control, conversion to reservation, offer redemption.
6. Eval suite in CI (`scripts/eval.ts`) with a larger scenario set.
