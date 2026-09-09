# CraftBot 2 – skjærer for skolen

En 3D-skjærer (slicer) som kjører helt i nettleseren, laget for CraftBot 2-skriveren på skolen.
Elevene slipper en STL-fil i vinduet, velger profil og materiale, trykker **Slice** og laster ned
en `.gcode`-fil som leveres til læreren. Ingenting installeres, ingen server, ingen opplasting –
alt skjer på elevens egen maskin.

Skjæremotoren er den ekte **OrcaSlicer 2.4.2** kompilert til WebAssembly, fra det åpne prosjektet
[OrcaWeb](https://github.com/Hiosdra/OrcaWeb). Skriverprofilen, de seks kvalitetsprofilene og
materialprofilene (PLA, PETG, TPU) er Craftbot sine egne OrcaSlicer-profiler, hentet fra
`profiles/Craftbot/` og bygget om av `scripts/build-craftbot-profiles.ts`.

## Slik publiseres siden (GitHub Pages)

1. Opprett repositoriet `SaH-Sage/CraftBot-2-slicer` på GitHub (offentlig – lisensen krever det).
2. Last opp alle filene i denne mappa (dra dem inn i GitHub, eller `git push`).
3. I repositoriet: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
4. Fanen **Actions** viser jobben «Deploy to GitHub Pages». Når den er grønn (3–5 min) ligger siden på
   `https://sah-sage.github.io/CraftBot-2-slicer/`

Jobben laster ned skjæremotoren (ca. 38 MB) fra OrcaWeb sine utgivelser og bygger siden. Ingenting
kompileres. Hver `git push` til `master` publiserer på nytt.

## Visningen er 1080 × 810 (Modell-fanen)

Modell-fanen (full bredde, ingen konkurrerende innhold) viser nå 3D-visningen
i nøyaktig 1080 × 810. Innstillinger-fanen viser visningen ved siden av selve
innstillingspanelet i to kolonner — der er det ikke plass til en fast
1080 px bredde uten å ødelegge den layouten, så den bruker samme 4:3-form,
skalert til kolonnens faktiske bredde.

Sidens innhold er gjort bredere (fra 1024 til 1152 px) slik at
3D-visningen faktisk får plass til sin fulle, faste størrelse på 1080 × 810,
i stedet for å bli klemt av en smalere sideramme.

3D-visningen i Modell- og Innstillinger-fanen er nå 1080 × 810 (4:3) på en
stor skjerm, og krymper proporsjonalt på en mindre en, i stedet for en fast
liten boks.

## Kameraet er nærmere modellen som standard

3D-visningen zoomer nå til selve modellen, ikke hele platen — en liten del
fyller mesteparten av bildet i stedet for å drukne på en 250 × 200 mm plate.
Roterer eller flytter du en modell (Place on face, Free rotate, skalering)
beholder kameraet posisjonen du selv har satt, i stedet for å hoppe tilbake
til standardvisningen — det nullstilles bare når du bytter fil eller maskin.

## Fri rotasjon (gizmo)

Trykk «Free rotate» på en modell for å feste tre fargede ringer til den midt i
3D-visningen — dra i en ring for å rotere fritt om den aksen. «Snap»-knappene
over lista (Av/5°/15°/45°) bestemmer hvor rotasjonen låser seg fast; dra litt
og modellen hopper til nærmeste steg. Sluttresultatet legges inn i den samme
rotasjonsverdien som ±90°-knappene bruker, så det som vises er nøyaktig det
som skjæres. «Free rotate» og «Place on face» kan ikke være aktive samtidig —
å slå på den ene skrur av den andre.

## Ringene er større

Rotasjonsringene (både «Free rotate» på modellen og «Orbit snap» på
kameraet) er nå 50 % større enn standardstørrelsen.

## Visningen lastes med det samme

3D-visningen vises nå fra siden lastes — en tom plate, ikke en tom boks —
i stedet for å dukke opp først når en STL-fil slippes inn. Sengens
kamera-vinkel husker seg selv på samme måte som for modeller.

## Visningen er der fra første stund

3D-visningen vises nå med det samme siden lastes — en tom plate — i stedet
for å vente på at en fil skal lastes inn. Kameraet er riktig plassert fra
aller første bilde (ikke bare etter at en fil er ferdig lest), siden dette nå
skjer synkront ved oppstart i stedet for å vente på en asynkron innlasting.

## Kameraet husker synsvinkelen på tvers av faner

Modell-, Innstillinger- og Skjær-fanen har hver sin egen 3D-visning (de er
tekniske sett tre ulike visninger, ikke én delt), så tidligere ble kameraet
nullstilt hver gang du byttet fane, selv om selve modellen ikke hadde endret
seg. Kameraets posisjon lagres nå på tvers av alle tre, nøkkelet til hvilke
filer og hvilken maskin som vises — bytt fane, og du kommer tilbake til
akkurat den vinkelen du forlot.

## Orbit snap (kameraet)

Nede til venstre i 3D-visningen er det en «Orbit snap»-knapp. Slår du den på,
dukker det opp tre ringer med de samme snap-strekene som i «Free rotate» —
denne gangen rundt punktet kameraet svinger om, ikke rundt modellen. Dra i en
ring for å svinge *visningen* i faste steg (5/10/15/45°) i stedet for
frihånd. Vanlig dra-for-å-rotere andre steder i visningen virker som før.

## Klikk og plasser: pilar direkte fra et punkt på modellen

Ny knapp, «Klikk og plasser», ved siden av mål-feltene for støttepilaren. Slå
den på og klikk et punkt på modellen i 3D-visningen — en pilar dukker opp
med det samme, akkurat høy nok til å nå fra plata og opp til punktet du
klikket, og stående nøyaktig under det punktet. Bunn/topp-diameter bruker de
samme feltene som «Skriv inn mål selv».

Verifisert som en full kjede, ikke bare hver bit for seg: simulerte et klikk
(en stråle rett ned mot en testmodell), matet treffpunktet gjennom nøyaktig
den samme høyde/posisjon-logikken appen selv bruker, og skar den resulterende
pilaren gjennom den ekte motoren — 100 lag × 0.2 mm = nøyaktig 20 mm, samme
høyde som det simulerte klikket.

## Klikk i visningen for å velge modell

Har du flere ting på platen (f.eks. hoveddelen og en eller flere pilarer),
kan du nå klikke direkte på en av dem i 3D-visningen for å velge den — den
får et svakt blått skjær. «Place on face», «Free rotate» og «Move» nederst
til venstre virker på den valgte modellen i stedet for alltid den første.
Er en av disse allerede aktiv og du klikker en annen modell, følger den
aktive modusen med til den nye modellen i stedet for å ignorere klikket.

## Om «støtte-modifikatorer» — hva som var mulig, og hva som ikke var det

Ekte støtte-blokkere/-forsterkere (der en form direkte styrer motorens egen
støttealgoritme) krever at motoren mottar volum-type-informasjon sammen med
selve geometrien. Jeg sjekket dette direkte i brobroen (orca-wasm/bridge/
slicer.cpp): selv 3MF-import — det rikeste formatet broen støtter — slår
sammen alle volum til ett flatt mesh (`combined.merge(obj->mesh())`) *før*
noe config eller skjæring i det hele tatt ser det. Det finnes ingen vei
gjennom for volum-type noe sted. Å bygge dette ordentlig krever å utvide selve
C++-broen og bygge WASM-motoren på nytt — noe som trenger et bygge-miljø jeg
ikke har tilgang til her.

I stedet: **manuell støttepilar** — en egen, smal form du selv plasserer
under et overheng med «Move», og som skrives ut sammen med resten av platen
som en helt ordinær del. Dette er samme teknikk folk bruker i enhver slicer
når automatisk støtte ikke er riktig verktøy for akkurat ett sted. Formen er
avsmalnet (bredere ved bunnen, smalere på toppen — begge mål justerbare) slik
at den er lett å knekke av etter print, uten å skade selve modellen der den
har vært i kontakt.

Lagt til samtidig: en **kule**-primitiv, siden formsettet uansett fikk et
løft. Begge nye formene er skåret gjennom den ekte motoren og verifisert —
også et realistisk tynt eksempel (2 → 0.6 mm, 30 mm høy).

En mulig videre forbedring, ikke bygget nå: la appen selv måle modellens
høyde akkurat der pilaren står (ved å sende en stråle ned gjennom modellen på
den XY-posisjonen), og foreslå en fornuftig pilar-høyde automatisk i stedet
for at du må anslå den selv.

## To knapper nederst i Innstillinger

«Ready to slice»-knappen er nå to knapper side ved side. «Ready to slice →»
gjør akkurat som før — tar deg til Skjær-fanen, ingenting mer. Den nye
«Slice»-knappen tar deg til samme fane og starter skjæringen med det samme,
for den som bare vil ha resultatet uten et ekstra klikk. «Slice» er grået ut
når det ikke er noe å skjære, eller en skjæring allerede pågår.

## Rettet: 3D-visningen og selve utskriften kunne peke ulik vei

Etter å ha kombinert to rotasjoner på samme modell (f.eks. «Free rotate» og
deretter «Place on face», eller «Free rotate» to ganger på ulike akser) kunne
det som faktisk ble skåret ende opp dreid feil i forhold til det 3D-visningen
viste — så mye som 90°.

Årsaken: selve skjæremotoren bygger en rotasjon fra de tre lagrede tallene i
en litt annen rekkefølge enn det nettleser-forhåndsvisningen brukte som
standard. For én enkelt rotasjon spiller ikke dette noen rolle — tallene blir
identiske uansett rekkefølge — så alt så riktig ut helt til to rotasjoner ble
kombinert. Bekreftet direkte: skar en tydelig asymmetrisk testboks gjennom
den ekte motoren med en kjent, kombinert rotasjon, og sammenlignet den
faktiske høyden mot begge mulige rekkefølger — motoren fulgte tydelig den
ene, forhåndsvisningen den andre. Rettet slik at begge nå bruker samme
rekkefølge, og lagt til en automatisk test som hadde fanget opp akkurat dette
(bekreftet: testen feiler med den gamle rekkefølgen, består med den nye).

## Innstillinger: enkelt som standard, avansert bak en knapp

Innstillinger-fanen viser nå bare det en elev faktisk trenger å velge:
materiale, kvalitetsprofil, fyllprosent og støtte på/av. Alt annet — lag-
høyde, veggtall, hastigheter, brim/raft/skirt, sømplassering og mer — ligger
bak «Show advanced settings»-knappen, akkurat som Speed og Seam & Surface
alltid har gjort.

Dyse-diameter, maks byggehøyde og temperaturene (dyse/seng) vises fortsatt,
men er grået ut og kan ikke endres — de følger printeren og det valgte
materialet, ikke noe en elev skal justere for hånd. Bytter du materiale,
følger riktig temperatur automatisk med fra Craftbot sin egen profil.

Testet direkte: rendret panelet og sjekket maskinelt at alle avanserte felt
er helt fraværende (ikke bare CSS-skjult) i standardvisningen, at de fire
grunnleggende valgene forblir fullt redigerbare, og at printer/dyse/
temperatur-feltene er synlige men reelt deaktiverte.

## Rettet: av/på-bryteren i Innstillinger

Prikken i «Enable supports»-bryteren (og alle andre av/på-brytere) satt feil
plassert. Byttet til en enklere, mer universelt støttet måte å posisjonere
den på. Bekreftet: av-tilstand ved 2px, på-tilstand ved 22px, begge innenfor
bryterens grenser.

## Snarveier for Free rotate og Move, rett i visningen

Nederst til venstre i 3D-visningen ligger nå tre knapper — «Place on face»,
«Free rotate» og «Move» — som virker på den (eneste) modellen på platen. De er
en snarvei til akkurat de samme knappene i panelet lenger ned, ikke noe eget.
Kun én av de tre kan være aktiv om gangen, uansett hvor du skrur den på.
Knappene er alltid synlige (også på den tomme platen før noen fil er lastet
inn) — de er bare grået ut og uklikkbare til det finnes en modell.

**Rettet:** knappene i panelet lenger ned sluttet å virke i en tidligere
runde — hvert klikk ba om tre separate tilstandsoppdateringer for å slå på
én modus og skru av de to andre, og siden alle tre gikk gjennom den samme
delte tilstanden, vant den siste oppdateringen og nullstilte alt igjen, hver
gang. Hvert knappetrykk gjør nå bare ett kall, som skal.

## Move: flytt modellen for hånd

En ny knapp, «Move», legger piler og en firkantet hake på modellen — dra i
den firkantede haken for å flytte fritt i X og Y, eller i en pil for å
flytte langs bare én akse. Z er låst helt ute (ikke bare skjult): modellen
kan ikke løftes av platen. Verifisert direkte mot biblioteket: Z endres
aldri under en dra-operasjon, og aksen for løft er umulig å treffe.

## Orbit snap er fjernet

Kameraets egen «Orbit snap»-knapp er tatt bort igjen — den viste seg for
upålitelig i bruk. «Free rotate» (rotere modellen, med samme snap-ringer)
er upåvirket og fungerer som før, bare 50 % større.

## Snap-streker på rotasjonsringene

Ringene i «Free rotate» har nå streker rundt seg som markerer hvor rotasjonen
låser seg fast — lange streker hver 90°, middels hver 45°, korte ved hvert
steg av valgt snap-verdi (5/10/15/45°). Bytter du snap-verdi oppdateres
strekene med det samme. Slår du av snap («Av») forsvinner strekene helt,
siden det da ikke er noe fast å vise. Strekene er bygget som en del av selve
ringene (samme skalering, samme oppførsel når du holder musa over en akse),
ikke en løsrevet tegning oppå — de treffer nøyaktig samme radius og plan som
selve ringen, verifisert mot bibliotekets egen geometri.

## Orienteringshjelp (view helper)

Øverst til høyre i 3D-visningen sitter en liten X/Y/Z-indikator som viser hvilken
vei modellen vender. Klikk på en av de seks aksepunktene for å svinge kameraet
rett ned den aksen (f.eks. rett ovenfra). Å dra selve indikatoren for å snurre
kameraet er ikke støttet — bruk resten av 3D-visningen til det, slik du
allerede gjør.

## Slicer-visning (lag-for-lag)

Etter en skjæring åpner «Layers»-panelet seg automatisk under 3D-visningen: modellen til venstre,
selve verktøybanen (toolpath) til høyre med fargekodede funksjoner (yttervegg, fyll, støtte osv.),
en glidebryter for å bla gjennom lagene ett og ett, og en «Travels»-knapp som viser
tomkjøringene. Trykk «Layers»-knappen for å skjule/vise det igjen.

## Plassering av modellen (plate tools)

Under 3D-visningen har hver modell sine egne verktøy: roter ±90° om X/Y/Z eller en valgfri vinkel,
**Place on face** (trykk knappen og klikk på flaten i 3D-visningen som skal ligge mot plata),
skalering i prosent, **Fit to bed**, speiling og nullstilling. Når «Place on face» er aktiv, lyser flaten som er under peikeren opp idet du beveger musa over modellen, så du ser nøyaktig hvilken flate du er i ferd med å velge før du klikker. Auto-orient og Arrange finnes fortsatt.
Nederst kan du lage en kube eller sylinder i valgfri størrelse til testutskrifter.

Under *Supports & Adhesion* i innstillingene ligger også terskelvinkel for overheng, antall
grensesjiktlag og «support on build plate only».

## Første utskrift – sjekkliste

- Skriv ut en liten kube (20 mm) med *0,20 mm – Standard* og PLA før elevene slipper til.
- Start-scriptet homer, varmer opp (venter på seng og dyse) og løfter dysen 5 mm. Skjørtet
  (to runder) primer dysen. Slutt-scriptet løfter 10 mm, homer X/Y og slår av varme og motorer.
- Havner utskriften 5 mm for langt til høyre: Craftbot definerer skriveområdet som X 5–255. Siden
  bruker 0–250. Det er normalt uten betydning for elevdeler.
- Kjør `npx tsx scripts/validate-craftbot.ts` (etter `npm ci` og `npm run setup`) for å skjære en
  kube med alle 18 kombinasjoner uten nettleser og se G-koden.

## Hva som er endret i forhold til Craftbot sine profiler

Craftbot laget aldri Orca-profiler for CraftBot 2. Plus Pro har samme seng (250 × 200 × 200),
samme 0,4 mm dyse og samme type direktedrevet ekstruder, så Plus Pro-profilen brukes med fire
tilpasninger (se kommentarene i `scripts/build-craftbot-profiles.ts`):

1. `gcode_flavor` «craftbotplus» finnes bare i Craftbot sin Orca-versjon → `marlin`.
2. Craftbot sitt start/slutt-script bruker variabler som bare finnes i deres versjon → erstattet av et
   CraftBot 2-script bygget på den samme enkeltekstruder-grenen.
3. «Fast»-variantene (600 mm/s fyll, 4000 mm/s²) tilbys ikke.
4. Sengtypen settes til varm plate, slik at materialets sengtemperatur brukes (PLA 65/68 °C,
   PETG 80 °C, TPU 25 °C).

Alt annet – laghøyder, topp/bunn-lag, vegger, fyll, hastigheter, akselerasjon, linjebredder,
retraksjon (0,6 mm), temperaturer, kjøling – er Craftbot sine tall.

## Utvikling

```
npm ci
npm run setup                          # laster ned skjæremotoren til public/wasm/
npm run dev                            # http://localhost:5173
npx tsx scripts/build-craftbot-profiles.ts   # bygger src/data/orca-profiles.json på nytt
npx tsx scripts/validate-craftbot.ts         # skjærer en kube med alle profiler (uten nettleser)
npm test
```

`src/lib/profiles.test.upstream.ts` er OrcaWeb sine egne tester for flerskriver-oppsett; de kjøres
ikke her fordi siden bare har én skriver.

## Lisens

AGPL-3.0, som OrcaWeb og OrcaSlicer. Craftbot sine profiler ligger under `profiles/Craftbot/` med
samme lisens som i OrcaSlicer-treet de kommer fra. Se `LICENSE` og `NOTICE.md`.

---

**English summary:** a browser-only slicer for the school's CraftBot 2, built on OrcaWeb (OrcaSlicer
2.4.2 in WebAssembly) with Craftbot's own OrcaSlicer profiles bundled as the only printer. Deploy by
creating the public repository, uploading these files and setting Pages → Source to *GitHub Actions*.
