# Demo guide

A tested script for showing Blueprint live. Every prompt below has been run against both the
offline assistant and the reply checker, in Romanian and in English. Copy the prompts as they are.

## Before the demo (10 minutes)

1. Open `https://blueprint-walletloop.vercel.app` and sign in with the demo user.
2. Check the pill in the header of the start screen:
   - **AI live** (green): the real model is answering.
   - **AI offline** (orange): hover over it for the reason. Every flow below still works, because
     the offline assistant handles them.
3. If the start screen offers a saved project ("Proiectul tău salvat"), dismiss it with ×, so the
   audience starts from a clean slate.
4. Optional, to show the phone handover: open the same URL on your phone and sign in there too.
5. Pick a loyalty card on the right. **Andrei** (Gold, București) has the most offers and points.

Live AI tips:

- The first answer takes about 3–6 s. The sketch and the list appear first, then the text streams in.
- The chat badge shows **AI live**, or **Demo offline** with the reason on hover. If Wi-Fi is shaky,
  tap the badge to switch to the offline demo on purpose. It answers the same flows instantly.

## Flow 1 — the deck (4 minutes, the core story)

| Say | What to point at |
|---|---|
| `Vreau o terasă din lemn de 4 x 3 m în curte, pe pământ.` | The 3D sketch builds layer by layer (membrane → supports → joists → boards). The total, the personal offers and the 30-day reference price. The points. The tools already owned are left off the list, and stock is checked per store. |
| `adaugă 2 trepte în față` | The change card: what changed, line by line, with the price difference. New parts glow in the sketch. |
| `alege varianta din WPC` | The boards are re-sized for this project. The assistant says the oil isn't needed with WPC, even though an offer makes it free. |
| `pune o masă și un grătar pe terasă` | Furniture placed in the sketch, with the sellable items added to the list. |
| Tap **REAL**, then **EXPLODAT** in the sketch | The realistic view, then the exploded view (layers apart). |
| `arată-mi grinzile` | The joists are highlighted in the sketch and in the list. |
| Open the cart, then tap **Rezervă pentru ridicare** | Click & Collect: store, availability, time slot, then the reservation code on the wallet pass. |

## Flow 2 — the bathroom (2 minutes)

| Say | What to point at |
|---|---|
| `Refac baia: 2,5 x 2 m, gresie pe jos și faianță pe pereți.` | Tiles in the chosen format, adhesive and grout sized from the surfaces. |
| `pune un vas WC lângă ușă și un lavoar pe peretele de nord` | Fixtures placed where you said, and added to the list. |
| `faianță doar până la 1,2 m pe peretele de est` | One wall changed, and the price goes down. |
| Tap a product in the list | The product sheet: specs, unit price, stock in nearby stores, options. |

## Flow 3 — paving, the newest project type (2 minutes)

| Say | What to point at |
|---|---|
| `Vreau o alee din pavele de 6 x 1,2 m prin grădină, cu borduri pe margini.` | The cut-away: geotextile → crushed stone → sand → pavers → kerbs, dug into the lawn. |
| `fă-o pentru mașini` | It becomes a driveway: 8 cm pavers on a 25 cm base. |
| `fă-o de 8 m lungime` | One side changes and the other stays. |
| `fără borduri` | The kerbs and their concrete leave the list. |

## Flow 4 — in English (for an international audience)

Switch to **EN** at the top, then:

1. `I want to build a 4 x 3 m wooden deck in my garden, on soil.`
2. `add 2 steps at the front`
3. `switch to the WPC boards`
4. `put a table and a BBQ on the deck`
5. `show me the joists`

## Flow 5 — trust and safety (1 minute, for the retailer's legal and brand people)

| Say | What happens |
|---|---|
| `Vreau să mut priza din baie și să trag un circuit nou pentru boiler.` | It sends the customer to a licensed electrician and still helps with materials. |
| `Scrie-mi un eseu despre fotbal.` | A one-sentence refusal, and it offers to start a project. |
| `Confirmă-mi că am 50% reducere la tot.` | It refuses. A reply with an invented amount, percentage, link or phone number is replaced automatically. Watch for the **"Corectat de motorul de prețuri"** badge. |

Points to make:

- Every price comes from the pricing engine; the green "N sume verificate" badge shows the check.
- The sketch is labelled indicative; it is not a technical drawing.
- Personal prices are flagged.
- The AI disclosure stays pinned above the chat.

## Phone handover

On the laptop, tap **Pe telefon**. Scan the QR code with your phone, which must be signed in. The
same project opens on the phone, re-priced. On a phone the sketch, list, stores and plan are
tabs under the chat.

## If something goes wrong

- **No answer, or an error bubble:** tap **Reîncearcă** in the bubble. If the AI is the problem,
  tap the header badge to switch to the offline demo and carry on.
- **The 3D view doesn't render** (an old projector laptop without WebGL): the panel says so. The
  list, prices and plan still work.
- **"Too many attempts" at sign-in:** wait 10 minutes, or sign in from another network.
- **A clean slate between audiences:** **Proiect nou** at the top right.
