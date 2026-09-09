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

## Pilarer følger nå foreldremodellen sin (flytting og rotasjon)

En større endring: en pilar sin posisjon er ikke lenger et fast punkt på
plata — den er relativ til modellen den ble klikket på. Flytt eller roter
hovedmodellen, og alle pilarene som står på den følger med, akkurat som du
ba om («deres referanseramme er ikke absolutt, den er relativ til deres
foreldre»). En pilar har ikke lenger egne Move/Free rotate/Place on face-
kontroller i det hele tatt — verken i sidepanelet eller hurtigknappene i
3D-visningen — siden det ikke finnes noen selvstendig posisjon for de
kontrollene å endre lenger; kortet viser i stedet en kort merknad om at den
følger foreldremodellen. Skalering, speilvending og fjerning fungerer som
før, siden de bare gjelder pilarens egen form, ikke plasseringen.

Slik virker det: idet en pilar lages, regnes klikkpunktet om til en vektor
relativt til foreldremodellens origo, i foreldrens *urotert* lokale ramme —
uavhengig av hvilken rotasjon foreldren måtte ha akkurat da. Hver gang
foreldrens transformasjon endres (flytt, roter, plasser-på-flate), regnes
pilarens absolutte posisjon på nytt ut fra denne lagrede vektoren og
foreldrens *nye* transformasjon. Matematikken (i `plate-tools.ts`) er testet
grundig og uavhengig — blant annet en 90°-rotasjon kontrollert mot THREE.js
sin egen, separate 2D-rotasjonsfunksjon, ikke bare mot seg selv.

Underveis dukket det opp to beslektede, snikende feil som begge er rettet
og dekket av egne regresjonstester:

- **Foreldrens egen plassering var ofte ukjent.** En modell som aldri er
  flyttet manuelt har `offset: null` — «la rutenett-utregningen bestemme» —
  og det finnes ingen verdi lagret noe sted for hvor det faktisk endte opp.
  Løsning: idet en pilar lages, «festes» foreldrens plassering til nøyaktig
  der den står akkurat da (hentet fra selve 3D-nettets faktiske posisjon,
  ikke fra den mulige `null`-verdien), slik at forholdet har noe konkret å
  regne ut fra videre.
- **En senere rotasjon på foreldren kunne løsne festet igjen.** Den
  eksisterende «behold posisjon»-fiksen fra forrige runde beskyttet bare et
  objekt som *er* et barn — ikke et objekt som *har* barn. Uten denne andre
  fiksen ville det å rotere hovedmodellen (etter at den allerede hadde fått
  en pilar) nullstille dens egen plassering på nytt, og pilaren ville da bli
  regnet ut fra plate-origo i stedet for der modellen faktisk står — samme
  type feil som sist, bare ett skritt lenger unna. Bekreftet med en test som
  viser nøyaktig hva som ville skjedd uten fiksen, side om side med riktig
  resultat.

To ting verdt å vite, med vilje ikke løst nå:

- **Pilarens høyde er fast**, selv om X/Y-posisjonen følger foreldren. Om
  foreldren vippes slik at det opprinnelige klikkpunktet havner et helt
  annet sted i høyden, er det for stort et skritt (måtte regnere ut og bygge
  en helt ny STL-geometri for pilaren, hver gang foreldren endres) til å ta
  som en del av denne rettelsen. X/Y følger nøyaktig; høyden gjør det ikke.
- **«Arrange»** vil fortsatt kunne flytte en pilar om den er med i utvalget,
  av samme grunn som nevnt forrige runde.

## Rettet: pilarer mistet posisjonen sin ved redigering

Ekte bug, funnet nøyaktig: å rotere (eller skalere, eller speilvende) en
pilar nullstilte posisjonen dens (`offset`) — akkurat som å rotere en helt
vanlig modell alltid har gjort, med vilje, siden den gamle plasseringen ikke
nødvendigvis passer etter at formen har endret seg. For en pilar er
posisjonen derimot hele poenget — det nøyaktige punktet du klikket under. Når
den nullstilles, faller pilaren inn i den samme delte rutenett-utregningen
som ModelViewer bruker for alt uten fast posisjon — en utregning som ser på
størrelsen og antallet av *alle* slike gjenstander samlet, ikke bare den ene
du faktisk endret. Det forklarer nøyaktig det som ble rapportert: pilaren
«klistret til plata» i stedet for spissen, og senere flyttet seg med
foreldremodellen uten synlig logikk — begge var symptomer på samme rutenett-
utregning som reagerte på en endring et helt annet sted.

Rettet på alle stedene det kunne skje — rotasjon (både via gripepunktet i
visningen og ±90°-knappene), skalering, og speilvending — ved å la en pilar
beholde sin nøyaktige posisjon gjennom alle disse, mens vanlige modeller
fortsatt oppfører seg som før. Bekreftet ved faktisk å ødelegge fiksen
midlertidig og se testen feile riktig, så gjenopprette den og se den bestå —
ikke bare lest koden og antatt den er riktig.

Én beslektet ting som *ikke* er fikset, verdt å nevne: den eksplisitte
«Arrange»-handlingen (be motoren pakke platen på nytt) vil fortsatt flytte en
pilar om den er med i utvalget, siden Arrange sin hele jobb er å flytte ting
for å pakke bedre — det er ikke det samme problemet som over (en tilfeldig
bivirkning), men verdt å vite om.

## Pilarer grupperes under modellen de ble laget fra

En pilar laget med «Klikk og plasser» vises nå ikke lenger som sitt eget,
løsrevne element i lista — den grupperes under modellen du klikket på, som
et «tilknyttet element». Som standard vises hvert tilknyttet element som én
kompakt linje (navn, mål, en ×-knapp for å fjerne den); klikk linja for å
utvide til akkurat de samme kontrollene (Place on face, Free rotate, Move,
Scale, Mirror, Reset) som et element øverst i lista har. Fjernes
hovedmodellen, dukker en tilhørende pilar opp igjen som sitt eget element —
den forsvinner aldri.

Med vilje **ikke** bygget: at pilaren følger med når hovedmodellen roteres
etterpå. Vris hovedmodellen til en vinkel som gjør en pilar ubrukelig, og det
er et bevisst valg — fjern den manuelt med ×-knappen, akkurat som med en
hvilken som helst hånd-plassert støtte i en vanlig slicer.

Bygget om ett hakk enklere enn første forsøk: det var i utgangspunktet et
eget vis/skjul-nivå for *hele* gruppen med tilknyttede elementer, men det
matchet ikke ordlyden din («når lista er kollapset skal den vise én linje per
element») — fjernet det ekstra nivået, så lista med tilknyttede elementer
vises alltid, med bare det ene per-element nivået av utvid/kollaps igjen.
Fanget også en grammatikk-feil («tilknyttetede» i stedet for «tilknyttede»)
ved faktisk å rendre komponenten og sjekke teksten, ikke bare lese koden.

## Gulvet er gjennomsiktig nedenfra

Platen (det grå gulvet) blokkerte synet når kameraet var under platen — nyttig
noen ganger med «Place on face», siden det er lettere å treffe riktig vinkel
med kameraet der. Gulvflaten vises nå bare fra oven (der den fortsatt ser ut
som en vanlig, ugjennomsiktig plate); sett nedenfra kulles den bort
helt, mens rutenettet og kantlinjen (som ikke har en «side» å kulle) forblir
synlige. Bekreftet direkte: sendte en stråle ned mot platen ovenfra (traff,
som forventet) og en stråle opp mot den nedenfra (traff ikke, som forventet)
— for både rektangulær og rund plate.

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
