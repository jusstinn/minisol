import type { ProjectType } from "@/domain/calculators";
import type { Lang } from "@/domain/types";
import type { PlanView } from "./types";

/**
 * Hand-written work plans used by the offline (scripted) demo agent.
 * Parametrised by the calculator inputs so titles and summaries match the project.
 */

type Inputs = Record<string, unknown>;
const n = (v: unknown, lang: Lang, d = 2) =>
  typeof v === "number" ? v.toLocaleString(lang === "en" ? "en-GB" : "ro-RO", { maximumFractionDigits: d }) : "?";

type Draft = Omit<PlanView, "safetyWarnings"> & { safety: string[] };
type Template = (i: Inputs) => Draft;

const PLANS: Record<ProjectType, Record<Lang, Template>> = {
  deck: {
    ro: (i) => ({
      title: `Terasă din deck ${n(i.lengthM, "ro")} × ${n(i.widthM, "ro")} m`,
      summary: `Terasă de ${n((i.lengthM as number) * (i.widthM as number), "ro")} m² pe suporturi reglabile, cu grinzi la 40 cm și deck montat pe lungime. Se face în 2 persoane într-un weekend.`,
      steps: [
        { title: "Trasează și măsoară", detail: "Marchează conturul cu sfoară și țăruși. Verifică diagonalele: dacă sunt egale, colțurile sunt la 90°.", duration: "1 h" },
        { title: "Pregătește terenul", detail: "Scoate stratul vegetal, nivelează și compactează. Lasă o pantă de 1–2% dinspre casă pentru scurgerea apei.", duration: "3–5 h" },
        { title: "Întinde geotextilul", detail: "Acoperă toată suprafața cu suprapuneri de 10 cm, ca să nu crească buruieni sub terasă.", duration: "30 min" },
        { title: "Așază suporturile reglabile", detail: "Pune câte un rând de suporturi sub fiecare grindă, la max. 60 cm. Reglează-le la aceeași cotă cu nivela.", duration: "2–3 h" },
        { title: "Montează grinzile", detail: "Grinzile se pun la 40 cm interax, perpendicular pe direcția deck-ului. Verifică planeitatea pe toată lungimea.", duration: "2–3 h" },
        { title: "Montează deck-ul", detail: "Prinde fiecare scândură cu 2 șuruburi inox pe fiecare grindă, cu rost de 5 mm (folosește un distanțier).", duration: "5–8 h" },
        { title: "Finisează", detail: "Taie capetele la linie, șlefuiește muchiile și aplică uleiul în 2 straturi, pe vreme uscată.", duration: "1 zi" },
      ],
      tips: [
        "Pre-găurește capetele scândurilor ca să nu crape lemnul.",
        "Pornește primul rând de la casă — e linia care se vede cel mai mult.",
        "Lasă 1 cm față de pereți pentru dilatare și ventilație.",
        "Cumpără toate scândurile din același lot, ca nuanța să fie uniformă.",
      ],
      safety: ["Poartă ochelari și mănuși la tăiere și înșurubare.", "Peste 60 cm înălțime terasa are nevoie de balustradă."],
    }),
    en: (i) => ({
      title: `${n(i.lengthM, "en")} × ${n(i.widthM, "en")} m garden deck`,
      summary: `A ${n((i.lengthM as number) * (i.widthM as number), "en")} m² deck on adjustable supports, joists at 40 cm centres and boards running lengthwise. A two-person weekend job.`,
      steps: [
        { title: "Set out and measure", detail: "Mark the outline with string and pegs. Check the diagonals: when they match, the corners are square.", duration: "1 h" },
        { title: "Prepare the ground", detail: "Strip the turf, level and compact. Keep a 1–2% fall away from the house for drainage.", duration: "3–5 h" },
        { title: "Lay the weed membrane", detail: "Cover the whole area with 10 cm overlaps so nothing grows under the deck.", duration: "30 min" },
        { title: "Place the adjustable supports", detail: "One row of supports under each joist, max 60 cm apart. Level them all to the same height.", duration: "2–3 h" },
        { title: "Fix the joists", detail: "Joists at 40 cm centres, perpendicular to the boards. Check they're flat along their whole length.", duration: "2–3 h" },
        { title: "Lay the boards", detail: "Two stainless screws per board per joist, with a 5 mm gap (use a spacer).", duration: "5–8 h" },
        { title: "Finish", detail: "Trim the ends in one line, sand the edges and apply two coats of decking oil on a dry day.", duration: "1 day" },
      ],
      tips: [
        "Pre-drill board ends so the timber doesn't split.",
        "Start the first row at the house — it's the line everyone sees.",
        "Leave 1 cm to walls for expansion and airflow.",
        "Buy all boards from the same batch so the colour matches.",
      ],
      safety: ["Wear glasses and gloves when cutting and screwing.", "Decks over 60 cm high need a railing."],
    }),
  },
  paint_room: {
    ro: (i) => ({
      title: `Vopsire cameră ${n(i.lengthM, "ro")} × ${n(i.widthM, "ro")} m`,
      summary: `Pereți${i.paintCeiling === false ? "" : " și tavan"} în ${n(i.coats, "ro", 0)} straturi. Se face într-o zi plus timpul de uscare între straturi.`,
      steps: [
        { title: "Golește și protejează", detail: "Mută mobila în centru, acoperă totul cu folie și lipește banda de mascare pe plinte, tocuri și pervaz.", duration: "1 h" },
        { title: "Repară pereții", detail: "Umple fisurile și găurile cu glet, lasă să se usuce și șlefuiește fin.", duration: "1–2 h" },
        { title: "Aplică amorsa (dacă e nevoie)", detail: "Pe glet nou sau pereți absorbanți, amorsa face ca vopseaua să se întindă uniform.", duration: "1 h + 4 h uscare" },
        { title: "Decupează colțurile", detail: "Cu pensula, trasează o bandă de 5 cm pe colțuri, lângă tavan și în jurul prizelor.", duration: "45 min" },
        { title: "Primul strat", detail: "Tavanul întâi, apoi pereții, cu trafaletul în formă de W. Lucrează umed pe umed ca să nu rămână urme.", duration: "2 h" },
        { title: "Al doilea strat", detail: "După timpul de uscare de pe găleată (de obicei 4–6 h), aplică al doilea strat.", duration: "2 h" },
        { title: "Curăță", detail: "Scoate banda cât vopseaua e încă ușor umedă, ca să ai margini curate.", duration: "30 min" },
      ],
      tips: ["Amestecă toate gălețile între ele dacă ai nuanțat culoarea.", "Nu vopsi în lumină directă de soare — se usucă neuniform.", "Înfășoară trafaletul în folie între straturi, nu trebuie spălat."],
      safety: ["Aerisește camera în timpul și după vopsire.", "Folosește o scară stabilă pentru tavan."],
    }),
    en: (i) => ({
      title: `Painting a ${n(i.lengthM, "en")} × ${n(i.widthM, "en")} m room`,
      summary: `Walls${i.paintCeiling === false ? "" : " and ceiling"} in ${n(i.coats, "en", 0)} coats. One day of work plus drying time between coats.`,
      steps: [
        { title: "Clear and protect", detail: "Move furniture to the centre, cover everything and tape skirting, frames and sills.", duration: "1 h" },
        { title: "Repair the walls", detail: "Fill cracks and holes, let it dry and sand smooth.", duration: "1–2 h" },
        { title: "Prime (if needed)", detail: "On fresh filler or porous walls, primer makes the paint go on evenly.", duration: "1 h + 4 h drying" },
        { title: "Cut in", detail: "Brush a 5 cm band in corners, along the ceiling and around sockets.", duration: "45 min" },
        { title: "First coat", detail: "Ceiling first, then walls, rolling in a W pattern. Keep a wet edge to avoid lap marks.", duration: "2 h" },
        { title: "Second coat", detail: "After the drying time on the tin (usually 4–6 h), apply the second coat.", duration: "2 h" },
        { title: "Clean up", detail: "Pull the tape while the paint is still slightly wet for crisp edges.", duration: "30 min" },
      ],
      tips: ["Box (mix) all tins together if the colour was tinted.", "Don't paint in direct sunlight — it dries unevenly.", "Wrap the roller in cling film between coats instead of washing it."],
      safety: ["Ventilate the room during and after painting.", "Use a stable ladder for the ceiling."],
    }),
  },
  laminate_floor: {
    ro: (i) => ({
      title: `Parchet laminat ${n(i.lengthM, "ro")} × ${n(i.widthM, "ro")} m`,
      summary: `Montaj flotant pe ${n((i.lengthM as number) * (i.widthM as number), "ro")} m², cu folie de suport${i.subfloor === "concrete" ? " și barieră de vapori pe șapă" : ""}. O zi de lucru pentru o persoană.`,
      steps: [
        { title: "Aclimatizează parchetul", detail: "Lasă pachetele închise în cameră 48 h, ca lemnul să ia temperatura și umiditatea camerei.", duration: "48 h" },
        { title: "Verifică suportul", detail: "Suprafața trebuie curată, uscată și plană (max. 2 mm la 1 m). Demontează plintele vechi.", duration: "1 h" },
        { title: "Întinde folia", detail: "Pe beton întâi bariera de vapori cu suprapuneri de 20 cm, apoi folia de parchet cap la cap.", duration: "30 min" },
        { title: "Primul rând", detail: "Începe de la peretele cel mai lung, cu limba spre perete și pene de 10 mm pentru rostul de dilatare.", duration: "1 h" },
        { title: "Montează restul rândurilor", detail: "Decalează îmbinările cu minimum 40 cm. Folosește bucata tăiată la capăt pentru rândul următor.", duration: "4–6 h" },
        { title: "Plinte și profile", detail: "Scoate penele, montează plintele pe perete (nu pe parchet) și profilele de trecere la uși.", duration: "2 h" },
      ],
      tips: ["Deschide pachete din cutii diferite ca să amesteci nuanțele.", "La tocuri, taie tocul pe jos în loc să decupezi parchetul.", "Nu fixa niciodată parchetul flotant cu cuie sau adeziv."],
      safety: ["Poartă ochelari de protecție la tăiere.", "Genunchierele îți salvează genunchii la o zi întreagă pe jos."],
    }),
    en: (i) => ({
      title: `Laminate floor ${n(i.lengthM, "en")} × ${n(i.widthM, "en")} m`,
      summary: `Floating install over ${n((i.lengthM as number) * (i.widthM as number), "en")} m² with underlay${i.subfloor === "concrete" ? " and a vapour barrier on the screed" : ""}. A one-person, one-day job.`,
      steps: [
        { title: "Acclimatise the boards", detail: "Leave the closed packs in the room for 48 h to match its temperature and humidity.", duration: "48 h" },
        { title: "Check the subfloor", detail: "Clean, dry and flat (max 2 mm over 1 m). Remove the old skirting.", duration: "1 h" },
        { title: "Lay the underlay", detail: "On concrete, vapour barrier first with 20 cm overlaps, then the underlay butted edge to edge.", duration: "30 min" },
        { title: "First row", detail: "Start along the longest wall, tongue to the wall, with 10 mm wedges for the expansion gap.", duration: "1 h" },
        { title: "Lay the rest", detail: "Stagger joints by at least 40 cm. Use the offcut from each row to start the next.", duration: "4–6 h" },
        { title: "Skirting and profiles", detail: "Remove wedges, fix skirting to the wall (never the floor) and fit door transition strips.", duration: "2 h" },
      ],
      tips: ["Open packs from different boxes to mix the shades.", "Undercut door frames instead of notching the boards.", "Never nail or glue a floating floor."],
      safety: ["Wear safety glasses when cutting.", "Knee pads make a full day on the floor bearable."],
    }),
  },
  tiling: {
    ro: (i) => ({
      title: `${i.roomType === "kitchen" ? "Bucătărie" : "Baie"} ${n(i.lengthM, "ro")} × ${n(i.widthM, "ro")} m`,
      summary: `Gresie pe pardoseală${(i.wallTileHeightM as number) > 0 ? ` și faianță până la ${n(i.wallTileHeightM, "ro")} m` : ""}${i.roomType === "bathroom" ? ", cu hidroizolație în zona umedă" : ""}. Lucrare de nivel mediu spre avansat — planifică 3–4 zile cu uscările.`,
      steps: [
        { title: "Pregătește suportul", detail: "Suprafețe curate, plane și solide. Aplică amorsa și lasă-o să se usuce.", duration: "1 h + 4 h uscare" },
        ...(i.roomType === "bathroom" ? [{ title: "Hidroizolează", detail: "Două straturi pe pardoseală, 20 cm pe pereți și în toată zona de duș, cu bandă la colțuri.", duration: "2 h + 1 noapte" }] : []),
        { title: "Planifică așezarea", detail: "Pornește din mijlocul peretelui vizibil, ca plăcile tăiate să fie egale la capete.", duration: "1 h" },
        { title: "Faianța", detail: "Montează de jos în sus, cu adeziv întins cu gletiera dințată și distanțieri între plăci.", duration: "1–2 zile" },
        { title: "Gresia", detail: "Pornește din colțul opus ușii, verifică planeitatea cu nivela la fiecare placă.", duration: "1 zi" },
        { title: "Rostuiește", detail: "După 24 h, umple rosturile cu drișca de cauciuc, pe diagonală, apoi curăță cu buretele umed.", duration: "3 h" },
        { title: "Siliconează", detail: "La colțuri, cadă și duș folosește silicon sanitar, nu chit — acolo se mișcă materialele.", duration: "1 h" },
      ],
      tips: ["Amestecă plăci din mai multe cutii ca nuanța să fie uniformă.", "Pentru plăci de 60 × 60 aplică adeziv și pe spatele plăcii (dublă încleiere).", "Păstrează 2–3 plăci de rezervă pentru reparații."],
      safety: ["Nu muta prize, circuite electrice sau țevi de gaz — apelează la un electrician/instalator autorizat.", "Mască de praf și ochelari la tăiere."],
    }),
    en: (i) => ({
      title: `${i.roomType === "kitchen" ? "Kitchen" : "Bathroom"} ${n(i.lengthM, "en")} × ${n(i.widthM, "en")} m`,
      summary: `Floor tiles${(i.wallTileHeightM as number) > 0 ? ` and wall tiles up to ${n(i.wallTileHeightM, "en")} m` : ""}${i.roomType === "bathroom" ? ", with waterproofing in the wet zone" : ""}. Intermediate to advanced — plan 3–4 days including drying.`,
      steps: [
        { title: "Prepare the substrate", detail: "Clean, flat and sound surfaces. Prime and let it dry.", duration: "1 h + 4 h drying" },
        ...(i.roomType === "bathroom" ? [{ title: "Waterproof", detail: "Two coats on the floor, 20 cm up the walls and the whole shower zone, with tape in the corners.", duration: "2 h + overnight" }] : []),
        { title: "Plan the layout", detail: "Start from the centre of the most visible wall so cut tiles are equal at both ends.", duration: "1 h" },
        { title: "Wall tiles", detail: "Work bottom-up with adhesive spread by a notched trowel and spacers between tiles.", duration: "1–2 days" },
        { title: "Floor tiles", detail: "Start in the corner opposite the door and check level on every tile.", duration: "1 day" },
        { title: "Grout", detail: "After 24 h, grout diagonally with a rubber float, then wipe with a damp sponge.", duration: "3 h" },
        { title: "Seal", detail: "Use sanitary silicone — not grout — in corners and around the bath and shower.", duration: "1 h" },
      ],
      tips: ["Mix tiles from several boxes for an even shade.", "For 60 × 60 tiles, back-butter each tile as well.", "Keep 2–3 spare tiles for future repairs."],
      safety: ["Never move sockets, circuits or gas pipes yourself — use a licensed electrician/plumber.", "Dust mask and glasses when cutting."],
    }),
  },
  fence: {
    ro: (i) => ({
      title: `Gard ${n(i.lengthM, "ro")} m × ${n(i.heightM, "ro")} m`,
      summary: `Panouri de 1,8 m între stâlpi fixați în beton rapid. Doi oameni, un weekend.`,
      steps: [
        { title: "Verifică limita și rețelele", detail: "Confirmă limita de proprietate și traseul cablurilor/țevilor subterane înainte să sapi.", duration: "1 h" },
        { title: "Trasează linia", detail: "Întinde o sfoară între capete și marchează pozițiile stâlpilor la 1,89 m.", duration: "1 h" },
        { title: "Sapă gropile", detail: "Adâncime ~60 cm (o treime din înălțimea gardului), diametru 25–30 cm.", duration: "3–4 h" },
        { title: "Toarnă stâlpii", detail: "Stâlp la nivelă pe două fețe, beton rapid și apă după instrucțiuni. Montează câte doi stâlpi odată cu panoul între ei.", duration: "3–4 h" },
        { title: "Montează panourile", detail: "Prinde panourile cu câte 4 cleme, verificând linia de sus cu sfoara.", duration: "2–3 h" },
        { title: "Finisează", detail: "Pune capacele pe stâlpi și aplică lazura pe ambele fețe.", duration: "3 h" },
      ],
      tips: ["Montează un panou provizoriu ca distanțier înainte ca betonul să prindă.", "Pe teren în pantă, fă trepte egale, nu înclina panourile.", "Lazura pe vreme uscată, peste 10 °C."],
      safety: ["Nu săpa fără să verifici rețelele subterane.", "Mănuși la manipularea panourilor și a betonului."],
    }),
    en: (i) => ({
      title: `${n(i.lengthM, "en")} m × ${n(i.heightM, "en")} m panel fence`,
      summary: `1.8 m panels between posts set in post-fix concrete. Two people, one weekend.`,
      steps: [
        { title: "Check boundary and services", detail: "Confirm the property line and any underground cables/pipes before digging.", duration: "1 h" },
        { title: "Set out the line", detail: "Run a string line and mark post positions every 1.89 m.", duration: "1 h" },
        { title: "Dig the holes", detail: "About 60 cm deep (a third of the fence height), 25–30 cm wide.", duration: "3–4 h" },
        { title: "Set the posts", detail: "Plumb on two faces, then post-fix concrete and water as instructed. Set posts in pairs with the panel between them.", duration: "3–4 h" },
        { title: "Fit the panels", detail: "Four clips per panel, checking the top line against the string.", duration: "2–3 h" },
        { title: "Finish", detail: "Fit post caps and stain both sides.", duration: "3 h" },
      ],
      tips: ["Dry-fit a panel as a spacer before the concrete sets.", "On slopes, step the panels — don't tilt them.", "Stain on a dry day above 10 °C."],
      safety: ["Never dig without checking for buried services.", "Gloves when handling panels and concrete."],
    }),
  },
  drywall_partition: {
    ro: (i) => ({
      title: `Perete gips-carton ${n(i.lengthM, "ro")} × ${n(i.heightM, "ro")} m`,
      summary: `Structură pe profile CW/UW la 60 cm${i.insulation === false ? "" : ", umplută cu vată minerală pentru izolare fonică"}, placată pe ambele fețe.`,
      steps: [
        { title: "Trasează peretele", detail: "Marchează linia pe pardoseală, transfer-o pe tavan cu nivela laser sau cu firul cu plumb.", duration: "1 h" },
        { title: "Fixează profilele UW", detail: "Bandă de etanșare sub profil, apoi dibluri la 50 cm în pardoseală și tavan.", duration: "1–2 h" },
        { title: "Montează montanții CW", detail: "La 60 cm interax, dublați lângă ușă. Taie-i cu 1 cm mai scurți decât înălțimea.", duration: "2 h" },
        { title: "Prima față + izolația", detail: "Placează o față, apoi așază vata minerală între montanți fără goluri.", duration: "3 h" },
        { title: "A doua față", detail: "Decalează rosturile plăcilor față de cealaltă parte. Șuruburi la 25 cm.", duration: "3 h" },
        { title: "Rosturi și glet", detail: "Bandă de rost și două straturi de glet, apoi șlefuire fină. Gata de vopsit.", duration: "1 zi cu uscări" },
      ],
      tips: ["Plănuiește prizele înainte să închizi a doua față.", "Adâncește ușor șuruburile sub suprafață, fără să rupi cartonul.", "Pune un montant din lemn în interior unde vei agăța rafturi."],
      safety: ["Nu modifica pereți portanți fără inginer.", "Mască la șlefuire, mănuși la vată."],
    }),
    en: (i) => ({
      title: `${n(i.lengthM, "en")} × ${n(i.heightM, "en")} m drywall partition`,
      summary: `CW/UW metal frame at 60 cm${i.insulation === false ? "" : ", filled with mineral wool for sound insulation"}, boarded on both sides.`,
      steps: [
        { title: "Set out the wall", detail: "Mark the line on the floor and transfer it to the ceiling with a laser or plumb line.", duration: "1 h" },
        { title: "Fix the UW tracks", detail: "Sealing tape under the track, then anchors every 50 cm into floor and ceiling.", duration: "1–2 h" },
        { title: "Fit the CW studs", detail: "At 60 cm centres, doubled at the door. Cut them 1 cm shorter than the height.", duration: "2 h" },
        { title: "First side + insulation", detail: "Board one side, then fit mineral wool between studs with no gaps.", duration: "3 h" },
        { title: "Second side", detail: "Stagger joints against the other side. Screws every 25 cm.", duration: "3 h" },
        { title: "Tape and fill", detail: "Joint tape and two coats of compound, then a fine sand. Ready to paint.", duration: "1 day incl. drying" },
      ],
      tips: ["Plan sockets before closing the second side.", "Sink screw heads just below the surface without tearing the paper.", "Add a timber noggin where shelves will hang."],
      safety: ["Never alter load-bearing walls without an engineer.", "Mask when sanding, gloves for mineral wool."],
    }),
  },
  lawn: {
    ro: (i) => ({
      title: `Gazon nou ${n(i.areaM2, "ro", 0)} m²`,
      summary: `${i.mode === "overseed" ? "Refacerea gazonului existent prin supraînsămânțare." : "Gazon semănat de la zero, pe un strat nou de pământ."} Primele 3 săptămâni contează cel mai mult: udare zilnică.`,
      steps: [
        { title: "Curăță terenul", detail: "Scoate buruienile cu rădăcină, pietrele și resturile.", duration: "2–4 h" },
        { title: "Afânează și nivelează", detail: "Sapă 15–20 cm, apoi nivelează cu grebla. Întinde stratul de pământ nou.", duration: "3–5 h" },
        { title: "Compactează ușor", detail: "Trece cu tăvălugul ca să nu rămână goluri, apoi greblează fin la suprafață.", duration: "1 h" },
        { title: "Seamănă", detail: "Împarte semințele în două, seamănă pe lung și apoi pe lat pentru acoperire uniformă.", duration: "1 h" },
        { title: "Îngrășământ și încorporare", detail: "Aplică îngrășământul starter și greblează ușor ca semințele să intre 0,5–1 cm în sol.", duration: "1 h" },
        { title: "Udă", detail: "Zilnic, fin, dimineața, până la prima tundere (la ~8 cm înălțime).", duration: "3 săptămâni" },
      ],
      tips: ["Cea mai bună perioadă: aprilie–mai sau sfârșit de august–septembrie.", "Nu călca pe gazon 3 săptămâni.", "Prima tundere doar vârfurile, la 5–6 cm."],
      safety: ["Poartă mănuși la manipularea îngrășămintelor și ține-le departe de copii și animale."],
    }),
    en: (i) => ({
      title: `New lawn, ${n(i.areaM2, "en", 0)} m²`,
      summary: `${i.mode === "overseed" ? "Renovating the existing lawn by overseeding." : "A lawn sown from scratch on fresh soil."} The first three weeks matter most: water every day.`,
      steps: [
        { title: "Clear the ground", detail: "Remove weeds with their roots, stones and debris.", duration: "2–4 h" },
        { title: "Loosen and level", detail: "Dig 15–20 cm, then level with a rake. Spread the new soil.", duration: "3–5 h" },
        { title: "Firm gently", detail: "Roll to remove air pockets, then rake the surface fine.", duration: "1 h" },
        { title: "Sow", detail: "Split the seed in two; sow lengthwise then crosswise for even cover.", duration: "1 h" },
        { title: "Feed and rake in", detail: "Spread starter fertiliser and rake lightly so seed sits 0.5–1 cm deep.", duration: "1 h" },
        { title: "Water", detail: "Daily, gently, in the morning, until the first cut (at ~8 cm).", duration: "3 weeks" },
      ],
      tips: ["Best time: April–May or late August–September.", "Keep off the lawn for 3 weeks.", "First cut: tips only, to 5–6 cm."],
      safety: ["Wear gloves with fertiliser and keep it away from children and pets."],
    }),
  },
};

export function scriptedPlan(type: ProjectType, inputs: Inputs, lang: Lang): PlanView {
  const { safety, ...plan } = PLANS[type][lang](inputs);
  return { ...plan, safetyWarnings: safety };
}
