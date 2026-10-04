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

## Demo with the live AI (behind a sign-in)

To show Blueprint on its public URL with the real model, add these to the Vercel project
(*Settings → Environment Variables*, Production, type **Sensitive**), then redeploy:

| Variable | Value |
|---|---|
| `OPENAI_API_KEY` | A key from an OpenAI project with a monthly budget limit |
| `SITE_LOGIN_USER` | The user name you'll sign in with |
| `SITE_LOGIN_PASSWORD` | A long password (changing it signs everyone out) |

With the sign-in on:

- every page asks for the user name and password, and every API answers 401 without them
- live AI runs without the shared counter store
- each visitor gets 40 AI turns per 10 minutes

The signed-in start screen shows **AI live** or **AI offline**, with the reason on hover.
`/api/health` gives the same answer as JSON. The tested demo script is in
[docs/demo.md](docs/demo.md).

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
8. **Next steps** under every answer fit the project and its state: *"Mută lista la Berceni"* (stock
   short at the home store), *"Adaugă trepte"*, *"Fă-o în L: +2 × 2 m în dreapta"*, *"Adaugă ferăstrău
   unghiular"*, *"Alege deck din WPC"*, *"Plătesc cu puncte"*… Note the **"✓ N amounts verified"**
   badge under every answer.
9. **Reshape the project.** Say *"Fă-o în L cu o extindere de 2 × 2 m în dreapta"* or *"Adaugă 3
   trepte în față și ridic-o la 50 cm"* — or tap **Modifică** and drag an edge / tap **+** on the
   plan. Only what changed builds in 3D (new parts glow, removed ones sink away in red), the list
   is recalculated keeping the products you picked, and a receipt shows every material and the
   price difference (**Anulează** undoes it). Raising the deck swaps in taller pedestals by itself.
10. **Change anything by talking.** *"Alege varianta din WPC și arată-mi-o în vedere reală"* — the
    boards switch (re-sized for the project) and the 3D turns grey WPC; *"Arată-mi grinzile"*
    lifts and highlights the joists; *"Scoate geotextilul"*, *"Adaugă sugestiile"*, *"Mută lista la
    Berceni"*, *"Plătesc cu puncte"*, *"Anulează"* all work (live AI and offline).
11. **Don't know the size?** *"Vreau o terasă dar nu știu cât de mare"* → typical sizes to tap and a
    pace counter (1 pace ≈ 75 cm). Reload the page: the start screen offers **"Continuă proiectul"**.
12. Switch to Maria → **"Gazon nou"** (garden ×3 points), James → **"New bathroom"** in English,
   Elena → no personalisation consent. Try the mic button (voice, ro-RO / en-GB).
13. Close with **/pitch?retailer=hornbach** — the ROI calculator and the 6-week pilot plan.

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
| Calculators | `src/domain/calculators.ts` | 8 project types → material requirements by *role* (e.g. `18.4 l interior_paint`), with waste factors and the reasoning shown to the customer |
| Resolver | `src/domain/resolve.ts` | Role → product line by quality tier and spec match; cheapest pack-size combination (15 l + 5 l beats 2 × 10 l); skips tools the member already owns |
| Quote engine | `src/domain/quote.ts` | Line totals, best single offer per line, bundles, basket thresholds, loyalty points (tier + category multipliers), redemption cap, stock at chosen store, alternatives, delivery |
| Offers | `src/domain/offers.ts` | Eligibility by tier, segment, member, validity — targeted offers only with personalisation consent |
| Layout | `src/domain/layout.ts` | The editable sketch per project (zones, steps, openings, fence corners/gates), validated edit ops, geometry helpers |
| Look | `src/domain/look.ts` | How the chosen products look in 3D (colour, board width, tile format…) from catalogue specs |
| Items | `src/domain/items.ts` | Placeable fixtures/lights/furniture: sizes, mounting, product roles; placement lives in `layout.ts` |
| Sizes | `src/domain/sizes.ts` | Typical sizes, measuring tips and the pace estimator for customers who don't know their measurements |
| Agent tools | `src/agent/tools.ts` | `get_customer_context`, `calculate_project`, `edit_sketch`, `modify_basket`, `control_view`, `suggest_sizes`, `search_products`, `check_stock`, `get_offers`, `present_plan` |
| Agent loop | `src/agent/run.ts`, `llm.ts` | Streaming tool-use loop behind a provider-neutral `LlmClient` interface |
| Scripted agent | `src/agent/scripted.ts` | Offline RO/EN intent parser + same tools, used as fallback |
| Verification | `src/agent/verify.ts` | Every lei amount in the model's reply must exist in the quote; failing replies are replaced by the deterministic one |
| 3D | `src/components/blueprint/` | Procedural assemblies drawn from the layout, animated build and edit diffs, blueprint/real/exploded views, 2D plan editor |

### Project types

| Type | Say (RO / EN) | Calculated from the sketch | 3D sketch |
|---|---|---|---|
| `deck` | „terasă din lemn 4 × 3 m” / “4 × 3 m deck” | boards (by width), joists (cut lists), screws, pedestals (by height), membrane, oil; steps, L/U shapes | membrane → pedestals → joists → boards, steps |
| `paint_room` | „vopsesc dormitorul 4 × 3,5 m” | walls − openings, ceiling, coats, primer/filler by surface, tape, foil | room shell, taped and painted walls |
| `laminate_floor` | „parchet în living 5 × 4 m” | laminate + waste (diagonal), underlay, vapour barrier, skirting along the outline, profiles per door | slab → barrier → underlay → planks → skirting |
| `tiling` | „baie 2,5 × 2 m” / “bathroom” | floor/wall tiles per wall height, adhesive by format, grout, spacers, primer, waterproofing | walls, waterproofing, tiles in the chosen format |
| `fence` | „gard 20 m, 1,8 m” | panels per run between gates, posts (shared corners), concrete, clips, caps, gates | footings → posts → panels → gates → caps |
| `drywall_partition` | „perete de gips-carton 3,5 m” | boards (layers, both sides), CW/UW, screws, anchors, tape, compound, wool | tracks → studs → wool → boards |
| `lawn` | „gazon nou pe 80 mp” | seed, topsoil, fertiliser (new or overseed) | soil → topsoil → growing grass |
| `paving` | „alee din pavele 6 × 1,2 m”, „curte pavată”, „intrare auto” / “paver path”, “patio”, “driveway” | dig depth, geotextile, crushed stone (10/15/25 cm for path/patio/driveway, +15 % compaction), 4 cm bedding sand, pavers (+5 %, 8 cm for cars), jointing sand by coverage, kerbs along the outline + kerb concrete, tamper or (hired) plate compactor | cut-away: membrane → stone → sand → pavers in the chosen format/colour (running bond) → kerbs on concrete, dug into the lawn |

**Paving** (`paving`, added 2026-09-28) is zone-based like the deck: L/U shapes, resize, placed
furniture (table, BBQ, loungers, planters, garden lights), plus a *use* (path / patio / driveway —
cars get 8 cm pavers on a 25 cm base and footway kerbs) and *edging* on/off, both one tap in the plan
editor or a sentence („fă-o pentru mașini”, „fără borduri”). Catalogue: Betonix pavers sold per m²
(20 × 10, 30 × 20, 30 × 30; grey, red, sand, anthracite, autumn mix), stone and sand in 25 kg bags or
1 t big bags, quartz or polymeric jointing sand, concrete kerbs or spiked steel edging (which makes the
kerb concrete unnecessary — the list says so). Swapping the pavers re-lays the sketch in the new
format and colour.

| Paver path in L, anthracite, with a garden set | Phone |
|---|---|
| ![Paving](docs/screenshots/paving-desktop.png) | ![Paving on a phone](docs/screenshots/paving-phone.png) |

Conversation state (basket, store, project) is round-tripped by the client, so the server is
stateless and horizontally scalable; history and state from the browser are validated before reuse
(`src/agent/state.ts`).

### The assistant can change everything on screen

The model has the same powers as the customer's fingers, and sees the live list (including hand edits)
in its instructions:

| Customer says | Tool |
|---|---|
| "WPC instead of larch", "fewer screws", "remove the saw", "add the oil", "move it to Berceni" | `modify_basket` — `choose` re-sizes the new option for the project; suggestions live in session state (add / dismiss) |
| "L-shape", "3 steps at the front", "a gate", "undo" | `edit_sketch` (with layout history) |
| "show me the joists", "exploded view", "open the cart", "pay with points", "open the plan editor" | `control_view` → a `ui` event the client applies (sketch view/highlight, panels, cart, product sheet) |
| "I don't know the size" | `suggest_sizes` → typical sizes + pace estimator |

**Fast first answer.** Before the model starts, the server loads the member profile and, when the
message clearly describes a complete project, calculates it deterministically: the sketch and
the priced list are on screen in under a second, and both results are handed to the model as
tool calls it already made — it only writes the plan and the reply (2 requests instead of 3–4).
If the model fails after that, the turn completes from the template plan and the quote.

**The sketch shows the actual products** (`src/domain/look.ts`): board width/colour, joist
section, tile format (incl. wood-look planks in running bond), laminate decor, paint colour,
panel/gate material, paver format and colour, kerb size — straight from catalogue specs. Swapping an option re-draws the sketch
(same part ids → the change morphs and glows). Why not real 3D models of each SKU: retailers
rarely have them, image-to-3D isn't dimensionally reliable, and the sketch is mostly boards,
tiles and panels whose look is fully described by their specs; hero products can get a GLB later.

**Saved sessions.** The project is kept in the customer's browser (per retailer + member, 30 days);
the start screen offers to continue it.

**Plans.** `tenant.plans`: `"ai"` (demo) lets the model write the step-by-step plan, marked as AI;
`"approved"` always shows the retailer-reviewed template, with the model's tips in a separate
AI section.

### Put anything in the sketch

"Pune o toaletă lângă ușă, un lavoar pe peretele din stânga cu o oglindă deasupra și o plafonieră" —
the assistant (or the customer, from the plan editor's **Adaugă** palette) places fixtures, lights and
furniture (`src/domain/items.ts`: 23 kinds — WC, washbasin, shower, bathtub, mirror, towel radiator,
ceiling/wall/floor lights, garden lights, table/garden set, BBQ, lounger, parasol, planter, sofa, bed,
wardrobe, TV…). A placement solver turns "against the left wall", "in the back-right corner", "next to
the door / window / gate / steps / sink" (a wall item by a floor item goes *above* it) into
coordinates, checks indoor/outdoor, wall/ceiling mounting and height-aware collisions, and slides
items along the wall when a spot is taken. Items the store sells become priced list lines (with
options); sofas, beds etc. are drawn for context. In the plan editor items can be dragged, rotated
(↻) and removed (×).

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

### Your own plans and models

Customers can bring their own files into the sketch: **Încarcă** in the sketch controls or in the plan
editor's header, or drop a file on the sketch (phones: the Schiță tab). Files are opened **in the
browser and stay on the device** — nothing is uploaded, except the optional AI read below.

- **3D model** — GLB, single-file glTF or OBJ, ≤ 30 MB and ≤ 500k triangles, parsed with three.js'
  own loaders. glTF that points at external files or needs Draco/KTX2 decoders is refused, and only
  `data:`/`blob:` URLs are ever loaded. It is drawn as context around the sketch (translucent blue
  with one merged edge overlay in the blueprint views, its own materials in the real view) and never
  explodes, animates or changes the camera fit. Dock controls: units (guessed from the bounding box:
  > 200 → mm, > 20 → cm, else m), turn 90°, move ±0.1 / ±1 m, on the ground, opacity, hide, remove.
- **Architect's plan** — PNG, JPG, WebP or the first page of a PDF (pdf.js, rendered locally). It
  sits under the plan editor. *Calibrează*: tap both ends of a known dimension and type the real
  distance; then *Aliniază* (drag), turn 90°, opacity, hide. Once calibrated it is also laid on the
  ground of the 3D sketch (toggle *3D*).
- **Read the sizes with AI** (optional) — only shown when an OpenAI key is configured and
  `AGENT_MODE` isn't `scripted` (`GET /api/plan-read`). One downscaled JPEG (≤ 1.5 MB) goes to
  `POST /api/plan-read` (Responses API, image input, strict JSON schema, `store: false`, per-visitor
  limit `PLAN_READS_PER_10_MIN`, pass session required in product mode, the image is never logged).
  Rooms come back as chips marked *citite de AI — verifică-le*; tapping one sends a normal chat
  message ("Baie 3,2 × 2,4 m"), so nothing is applied without the customer.
- **Storage** — IndexedDB `blueprint-uploads` / `files`, keys `${tenant}:${memberId}:{model|plan}:{meta|blob}`
  (blob = the file, meta = placement / calibration / AI reading). The meta carries the id of the
  conversation's first message, which the saved session keeps: a reload or *Continuă* brings the
  files back, a new project doesn't inherit them, and *forget my project* deletes them.
- **Code** — `src/lib/uploads/*` (checks, units, calibration, IndexedDB, loaders, store) and
  `src/components/blueprint/{UserModel,PlanGround,PlanUnderlay,PlanCalibrator,ModelControls,PlanControls}.tsx`
  + `blueprint/uploads/*`. The sketch only exposes two hooks: `Scene`'s `extra` and `PlanEditor`'s
  `underlay` props. Samples: `docs/samples/house.glb`, `docs/samples/plan-baie.png`
  (`npx tsx scripts/make-upload-samples.ts`).

| Own 3D model (real view) | Calibrated plan + AI-read size sent to the chat | Phone (Schiță tab) |
| --- | --- | --- |
| ![](docs/screenshots/uploads-model.png) | ![](docs/screenshots/uploads-plan.png) | ![](docs/screenshots/uploads-phone.png) |

### Client interaction: next steps, send to phone, Click & Collect, hints, a11y

| Next steps that fit the project | Send to phone (QR + link) |
|---|---|
| ![Next steps](docs/screenshots/interaction-next-steps.png) | ![Share](docs/screenshots/interaction-share-desktop.png) |
| **Reserve in store: stock check, nearest store** | **Reserved: code, pickup window, held until** |
| ![Reserve](docs/screenshots/interaction-reserve-short.png) | ![Reserved](docs/screenshots/interaction-reserve-done.png) |
| **Compare two options for a job** | **First-run hint on the sketch** |
| ![Compare](docs/screenshots/interaction-compare-desktop.png) | ![Hint](docs/screenshots/interaction-hint-sketch.png) |

Phone (390 × 844): [project received](docs/screenshots/interaction-share-received.png) →
[reopened](docs/screenshots/interaction-share-restored.png) ·
[pickup step](docs/screenshots/interaction-reserve-phone.png) ·
[reservation on the pass](docs/screenshots/interaction-reserve-wallet.png) ·
[compare](docs/screenshots/interaction-compare-phone.png) ·
[chat hint](docs/screenshots/interaction-hint-phone-chat.png) ·
[English chips](docs/screenshots/interaction-en-chips-phone.png).

- **Context-aware next steps** (`src/lib/nextSteps.ts`, pure): 3–5 chips from the board — fix first
  (move the list to the nearest store that has everything; *Anulează* right after a change), then a
  reshape per project (steps / L-shape for decks, gate / corner / height for fences, wall tiles to
  1,2 m for bathrooms, window, door, extend, an L-turn / edging on-off for paving…), the suggested extra by name, WPC for decks, a
  structural layer to look at (or the realistic view on on-demand tenants), points, cheaper, offers.
  Never repeats what the customer already asked; per-kind caps. Every chip is plain text sent as a
  message, so it also works with the live model — and the tests run **every chip of every starter
  project (RO + EN) through the offline agent** and check it did what it says. The offline parser
  learned one thing: *"Adaugă ferăstrăul"* adds just that suggestion.
- **Send to phone** (header *Pe telefon*): QR + *Copiază link* (+ the native share sheet where there
  is one). The link carries a snapshot in the URL fragment `#p=` — project type, inputs, the edited
  sketch, basket sku × qty + role, store, quality, language; **no conversation, no member, nothing
  personal**; deflate-raw + base64url (≈ 0,4–0,7 kB for the starter projects; plain-JSON fallback).
  The receiving page moves it out of the address bar (also through the pass-link sign-in), shows
  *"Trimis de pe alt dispozitiv"* and opens it for the member picked there: `POST /api/restore`
  (session required in product mode) sanitises it, recalculates the project from the shared sketch
  and re-prices the customer's own picks for **that** member; the chat says *"Am redeschis proiectul
  trimis de pe alt dispozitiv"*.
- **Reserve in store (demo Click & Collect)**: store with its hours, the list's availability there
  (short lines flagged, one tap to *Rezervă la Berceni* — the nearest store with everything — or
  reserve the rest), 2-hour pickup windows today/tomorrow from the store's opening hours
  (`src/lib/pickup.ts`, 08–20 when unknown; ready 2 h after reserving), then a reservation code with
  barcode, pickup window, *păstrat până* (closing time of the next open day) and *Adaugă în Wallet*
  (code and window on the pass). Labelled as a demo throughout — nothing reaches the store; the
  retailer's order API goes behind the same screen (roadmap 3).
- **Compară variantele**: in the options drawer, any alternative side by side with the one in the
  list — price for this project with the member's offers (real difference and %), pack sizes,
  quality, rating, stock, highlights, the better side marked.
- **First-run hints**: one at a time, only when the target is on screen, never over a dialog or
  blocking; dismissed by ×, Escape, using the thing or after 14 s, and never shown again
  (`localStorage` `blueprint:hints:v1`).
- **Accessibility**: dialogs (cart, wallet pass, share) trap focus, close on Escape and give focus
  back; chips, phone tabs and pickup windows work with the arrow keys; icon buttons are named; the
  conversation announces each finished answer once (not every streamed word); secondary text is
  ≥ 4.5 : 1 (`--ink-3` darkened); every motion animation follows *reduce motion*.

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
- Demo data lives in `src/data/` (313 products with fictional brands, 11 stores modelled on a
  Romanian DIY network, deterministic stock, 10 WalletLoop offers, 4 personas).

## Production entry: signed pass links

In the demo anyone can pick one of the four members. In production the customer never says who
they are: they tap the Blueprint link on their wallet pass. Set `REQUIRE_PASS_LINK=1` and
`PASS_LINK_SECRET` (≥ 32 characters, shared with WalletLoop's pass backend) to switch it on.
Without `REQUIRE_PASS_LINK` the demo behaves exactly as before.

1. **Pass → signed link.** WalletLoop's pass backend puts `https://…/?retailer=<tenant>&t=<token>` on
   the pass, where `token = v1.<base64url(payload)>.<base64url(HMAC-SHA256(secret, "v1.<base64url(payload)>"))>`
   and `payload = { m: memberId, t: tenantId, exp: unixSeconds, l?: "ro"|"en", n?: nonce }`
   (`src/lib/passToken.ts`).
2. **Link → cookie.** `src/proxy.ts` (Next 16's replacement for middleware) runs only on page requests
   carrying `t`. It checks the signature (constant-time), expiry (60 s clock skew) and that the token's
   tenant is the page's retailer, then sets an httpOnly, SameSite=Lax session cookie (Secure and
   `__Host-` prefixed in production, path `/`) and redirects to the same URL without `t`, so the token
   never stays in the address bar or history. The cookie holds a separate session token (derived key,
   never valid as a link) that expires with the link, at most after 12 h. A bad or expired link clears
   any older session and shows a "open it again from your card" note.
3. **Cookie → routes.** The page renders only that member's pass (no picker); without a session it asks
   the customer to open Blueprint from their card in Wallet. Every API route resolves the member via
   `memberFromRequest()` / `sessionFromRequest()` in `src/lib/session.ts`: the `memberId` the browser
   sends is ignored, a missing/invalid session (or one for another tenant) gets **401**, and
   `/api/members` returns only the session's member.

Mint a link by hand (what the pass backend does; base URL from `PUBLIC_BASE_URL`, default `http://localhost:3100`):

```bash
npx tsx --env-file=.env.local scripts/make-pass-link.ts WL-RO-204518 hornbach 24   # <memberId> [tenant] [hours]
```

Tokens are bearer credentials: they are never logged (only the rejection reason is). The nonce `n`
lets the pass backend track or revoke individual links; the app does not keep server-side state.

### Two deployments: demo and pilot

Both Vercel projects build `main` on every push:

| Project | URL | Mode |
| --- | --- | --- |
| `blueprint-walletloop` | blueprint-walletloop.vercel.app | Open demo (member picker, "Atelier" brand) |
| `blueprint-pilot` | blueprint-pilot-walletloop.vercel.app | Product mode for HORNBACH: `REQUIRE_PASS_LINK=1`, `TENANT=hornbach` |

The pilot needs two secrets. Add them in *Project → Settings → Environment Variables*, then redeploy:

- `PASS_LINK_SECRET`: generate it with `openssl rand -base64 48`. Share the same value with
  WalletLoop's pass backend, and put it in your `.env.local` to mint links by hand. Until it is set,
  the pilot deliberately fails with a configuration error rather than open up.
- `OPENAI_API_KEY`: optional. Without it the pilot runs the offline agent.

## Privacy & safety

- **Data minimisation**: the model sees tier, points, home store, city, interests and
  purchase history — never name, email, phone or exact location. No personalisation consent →
  no interests/history and no targeted offers. No location consent → only home store is used.
- `store: false` on every model call; history lives in the customer's browser.
- For EU production, run the model in-region (Azure OpenAI EU, or Claude via AWS Bedrock
  Frankfurt / Google Vertex EU) — the `LlmClient` interface is the only thing to swap.
- Safety rules in the prompt and calculators: electrics, gas, structural walls, work at height
  → licensed professional; hazard notes per project.

### Two models, and staying inside OpenAI's limits

- **Two models:**
  - **The conversation model** (`OPENAI_MODEL`, `gpt-5.4-mini`) runs every turn: tools, sketch edits, list changes, replies.
  - **The plan model** (`OPENAI_PLAN_MODEL`, e.g. `gpt-5.5`) writes a new project's step-by-step plan, in one compact call of about 2–4k tokens (`src/agent/planWriter.ts`).
- **The plan runs in parallel with the reply.** The reply starts in about a second, and the plan card follows when it's ready. If the plan model is busy or fails, the reviewed template plan is used.
- **The governor** (`src/agent/models.ts`) counts requests per minute, tokens per minute and requests per day for each model (`OPENAI_*` / `OPENAI_PLAN_*`):
  - Near a per-minute limit it waits for the next minute, if that's at most 20 s away, and shows "AI-ul e ocupat — aștept …" (AI busy, waiting).
  - Past a daily limit it doesn't call the model, and the turn falls back.
- **Who the limits apply to:**
  - **Pilot:** the member from the signed pass link.
  - **Demo behind the site sign-in:** the sign-in session, a random id in the signed cookie, so each device counts separately even with a shared user name.
  - **Otherwise:** the IP.
  
  On top of that:
  - a looser per-IP cap
  - a short cooldown between one visitor's turns (`LLM_COOLDOWN_S`)
  - the deployment's daily caps

### Abuse and prompt injection

Everything with a price comes from the deterministic engine, so a hijacked model can't change what
anyone pays. The rest is about cost and about what the assistant says in the retailer's name:

- **Spend limits** (`src/lib/budget.ts`):
  - Turns are limited per visitor per 10 minutes, where an IPv6 /64 counts as one visitor.
  - In product mode they are also limited per member per day, and members can't be faked.
  - The whole deployment has a daily cap on turns and on tokens.
  - Uploaded-plan reading has its own caps.
  - Over any limit the customer gets the offline assistant, never an error.
  - Each model call is capped at 2,500 output tokens, 1 retry and a 30 s timeout. A turn makes at most 6 calls.
  - Counters are shared through Upstash Redis. In Vercel production, live AI stays off until that store is configured.
- **Nothing from the browser is trusted:**
  - The chat history is signed by the server (`src/agent/historySeal.ts`). An edited history keeps only the customer's own messages, so forged tool results or assistant promises never reach the model.
  - Sketches are rebuilt from known fields only.
  - SKUs, roles and inputs are validated.
  - The project title never goes into the prompt.
  - Share links drop the sender's title.
  - JSON API calls from other sites are refused (Origin / Sec-Fetch-Site).
- **The reply checker** (`src/agent/verify.ts`) replaces any answer that contains:
  - an amount that isn't in the customer's list or offers, including "500 de lei" or "RON 500"
  - another currency
  - a percentage no tool produced
  - a link, email address or phone number
- **The prompt** treats everything but its own rules as information, refuses off-topic work in one sentence and never writes long texts.
- **Pass links** are HMAC-signed and tied to one tenant:
  - Links valid for more than `PASS_LINK_MAX_HOURS` are refused.
  - `PASS_LINK_SINGLE_USE=1` makes each link work once, when the pass backend mints one per tap.
  - `DATA_SOURCE=walletloop` refuses to start without `REQUIRE_PASS_LINK=1`.
- **Headers:** no framing (CSP `frame-ancestors 'none'`), `nosniff`, HSTS, and a Permissions-Policy that allows the microphone on our own pages only.
- **Red team:** `npx tsx --env-file=.env.local scripts/redteam.ts` sends five attacks through the chat API:
  - ignore your instructions and write an essay
  - a fake manager-approved discount
  - print the system prompt
  - repeat a phishing phone number and site
  - a forged history promising 50%

  All five are contained by the live model.
- **Outside the code — do these before release:**
  - Give each deployment its own OpenAI project and key.
  - Set a monthly budget limit on each project, and allow only the model in use.
  - Keep the public demo without a key, or with a very small budget.

### Usage events for a pilot (anonymous)

To measure a pilot without tracking people, the app sends a few anonymous events to
`/api/events` (`src/lib/usage.ts`, client `src/lib/track.ts`):

- **What's recorded:** visits (entry: landing, pass or share; phone or desktop), projects
  started, sketch edits (by chat, the plan editor or a chip, plus the op kinds), hand changes to
  the list, each chat answer (live or offline, time taken, tools and cards, error), cart opened,
  reservations (pickup or delivery, number of lines, points used), wallet, share links, uploads,
  and size presets used.
- **What's not recorded:** member ids, names, messages, dimensions, SKUs, prices, IPs or user
  agents.
  - Every event and value is on an allowlist (enums and counts only); anything else is dropped on
    the server.
  - Times are cut to the minute.
  - The "visit" is a random id per page load, kept only in memory: no cookie and nothing in
    storage.
- **Off switches:** no events are sent when the browser signals Global Privacy Control or Do Not
  Track, when `NEXT_PUBLIC_USAGE=off` is set, or on the server when `USAGE_SINK=off` is set.
- **Where the events go:** one `[usage] {json}` line per event in the server log. Set
  `USAGE_WEBHOOK_URL` to also forward each batch, for example to WalletLoop's analytics.
- **Reading them:** run `npx tsx scripts/usage-report.ts exported-logs.txt` to print the funnel
  (visited → started a project → changed the sketch → opened the cart → reserved), projects by
  type, how people edit, reply latency (median and p90) and reservations. `--json` gives the
  same numbers as JSON.

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
npm test                     # unit tests: calculators, pack optimiser, quote engine, offers, layout, agents, routes
npm run typecheck
npm run eval -- --scripted   # agent scenarios against the offline agent (no API calls)
npm run validate:catalog     # catalogue integrity (roles, units, tiers, fictional brands)
npx tsx scripts/inspect-project.ts deck '{"lengthM":4,"widthM":3}' WL-RO-100231 premium
npx tsx --env-file=.env.local scripts/try-agent.ts "Vreau o terasă de 4x3 m" WL-RO-100231
npx tsx --env-file=.env.local scripts/make-pass-link.ts WL-RO-100231 hornbach 24   # signed pass link
npm run eval                 # live-model scenarios with automatic accuracy checks
npx tsx scripts/usage-report.ts logs.txt     # pilot funnel from exported [usage] log lines
```

CI (`.github/workflows/ci.yml`) runs on every push to `main` and on every pull request:
- types, lint and unit tests
- the offline agent eval
- the catalogue rules
- a production build

None of these steps calls OpenAI.

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
