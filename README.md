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

## Orbit snap (kameraet)

Nede til venstre i 3D-visningen er det en «Orbit snap»-knapp. Slår du den på,
dukker det opp tre ringer med de samme snap-strekene som i «Free rotate» —
denne gangen rundt punktet kameraet svinger om, ikke rundt modellen. Dra i en
ring for å svinge *visningen* i faste steg (5/10/15/45°) i stedet for
frihånd. Vanlig dra-for-å-rotere andre steder i visningen virker som før.

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
