# `decision-tree-navigator` 

Beslutt er en enkel løsning for å gå gjennom beslutningstrær og dokumentere vurderinger. Prøv det ut på [beslutt.nav.no](https://beslutt.nav.no/).

## Kjør Beslutt lokalt
Beslutt bruker vanlig HTML, CSS og JavaScript. Du trenger ikke å bygge noe, men start en enkel HTTP-server så nettleseren får hentet JSON-filene.

## Teknisk oppsett
Forsiden ligger i [index.html](https://github.com/navikt/decision-tree-navigator/blob/main/index.html). [list-trees.js](https://github.com/navikt/decision-tree-navigator/blob/main/scripts/list-trees.js) leser ID-ene i [manifest.json](https://github.com/navikt/decision-tree-navigator/blob/main/data/manifest.json) og henter resten fra tre-filene.

[tree.html](https://github.com/navikt/decision-tree-navigator/blob/main/tree.html) viser spørsmålene og beslutningsdiagrammet. [render-tree.js](https://github.com/navikt/decision-tree-navigator/blob/main/scripts/render-tree.js) laster tre-fila som hører til ID-en i URL-en.


## Legg til et tre
1. Opprett `data/<id>.json`. Bruk en ID med små bokstaver, tall og bindestreker.
2. Legg inn `id`, `title`, `description` og `type` øverst i fila, sammen med treets noder. `type` må være `official` eller `advisory`.
3. For `official`-trær legger du også inn `governance` med status `approved`, `draft` eller `deprecated`, og feltene `version`, `approvedBy` og `approvedDate`.
4. Hvis du ikke kjenner versjon, godkjenner eller dato ennå, lar du verdien stå som en tom streng. Grensesnittet viser bare felt som har en verdi.
5. Legg ID-en inn i `data/manifest.json`. Offisielle trær vises bare på forsiden når `governance.status` er `"approved"`. Trær med status `"draft"` vises heller ikke blant veiledende trær. Trær som ikke vises på forsiden, kan fortsatt åpnes direkte med `tree.html?id=<id>`.

`intro-text` støtter HTML, for eksempel avsnitt, lister og lenker. Ren tekst pakkes automatisk inn i et `<p>`-element.

Hver node kan ha et `read-more`-objekt med `read-more-about` (knappetekst) og `read-more-text` (innhold som støtter HTML). Når begge feltene har innhold, vises en utvidbar forklaring mellom hjelpeteksten og spørsmålet.

### `type` og `governance`

`type` sier hva slags beslutninger treet brukes til. Det finnes to typer:

- `type: "advisory"` er for veiledende trær som tilbyr en strukturert måte å gå gjennom og dokumentere vurderinger på, men ikke representerer Navs offisielt godkjente beslutningslogikk. Disse trærne trenger ikke et `governance`-objekt.
- `type: "official"` er for trær som representerer Navs offisielt godkjente, eller planlagte offisielle, beslutningslogikk. Disse må ha et `governance`-objekt.

#### `governance`-objektet

`governance`-objektet inneholder informasjon om godkjenning og versjonering av et offisielt beslutningstre.

Eksempel:

```json
{
  "governance": {
    "status": "approved",
    "version": "",
    "approvedBy": "",
    "approvedDate": ""
  }
}
```

- `governance.status` kan være:
    - `"approved"` - denne versjonen er godkjent som offisielt beslutningstre.
    - `"draft"` - treet er under arbeid eller venter på nødvendig godkjenning. Det vises ikke på forsiden, men kan åpnes med direkte URL.
    - `"deprecated"` - treet skal ikke lenger brukes til nye vurderinger. Offisielle trær med denne statusen vises ikke på forsiden, men beholdes tilgjengelige med direkte URL.
- `governance.version` er treets versjonsnummer.
- `governance.approvedBy` er hvem som har godkjent den offisielle beslutningslogikken.
- `governance.approvedDate` er datoen den offisielle beslutningslogikken sist ble formelt godkjent.

La feltene `version`, `approvedBy` og `approvedDate` stå som tomme strenger dersom opplysningene ikke er kjent ennå. Feltene fungerer også som en mal for hvilke opplysninger som kan fylles inn senere.  Grensesnittet viser bare governance-felt som har en verdi. JSON-eksporten tar med feltene også når de er tomme.

## Spørsmål med flere svar (avkryssing)

Spørsmål uten `answerType` beholder dagens radioknapper. `answerType: "radio"` kan også brukes eksplisitt. Sett `answerType: "checkbox"` for å tillate flere svar. Dette krever ingen nye avhengigheter.

Eksempel på en spørsmålsnode:

```json
{
  "step-title": "Bruksområder",
  "q": "Hvilke formål gjelder? Velg alle som passer.",
  "answerType": "checkbox",
  "choices": [
    {"id": "a", "label": "Formål A"},
    {"id": "b", "label": "Formål B"},
    {"id": "none", "label": "Ingen av disse", "exclusive": true}
  ],
  "routing": {
    "anySelectedExceptExclusive": "matching",
    "exclusiveSelected": "none"
  },
  "options": {
    "matching": {
      "next": "details",
      "buttonText": "Minst ett formål",
      "label": "Ett eller flere formål gjelder."
    },
    "none": {
      "next": "alternative",
      "buttonText": "Ingen formål",
      "label": "Ingen formål gjelder."
    }
  },
  "note": {
    "label": "Begrunn valgene",
    "required": true
  }
}
```

`details` og `alternative` må være eksisterende noder i samme tre. Et komplett, veiledende eksempel finnes i [data/checkbox-example.json](data/checkbox-example.json) og kan åpnes med `tree.html?id=checkbox-example`. Eksempelet er ikke oppført på forsiden og inneholder ingen juridisk klassifisering.

### Format og ruting

- `choices` er en ikke-tom liste. Hvert valg har en unik, stabil `id` og en ikke-tom `label`, begge tekststrenger. Valgene vises i rekkefølgen i listen. Etikettene behandles som ren tekst, ikke HTML, også i oppsummeringen og utskriften.
- Høyst ett valg kan ha `exclusive: true`. Et slikt valg fjerner alle andre avkryssinger. Et ordinært valg fjerner det eksklusive valget. `exclusive` må være en boolsk verdi hvis feltet er med.
- Minst ett ordinært valg må finnes. Spørsmål uten et eksklusivt valg passer bare når minst ett ordinært valg må gjelde. Når null treff er et gyldig svar, legg til et eksklusivt valg som «Ingen av disse».
- `routing.anySelectedExceptExclusive` er obligatorisk og angir nøkkelen i `options` som brukes når ett eller flere ordinære valg er valgt.
- `routing.exclusiveSelected` er obligatorisk når et eksklusivt valg finnes. Feltet angir nøkkelen i `options` som brukes når dette valget er valgt. Hvis feltet er oppgitt uten et eksklusivt valg, må det fortsatt vise til en gyldig nøkkel.
- Nøklene i `options` må være nøyaktig de nøklene som rutingsfeltene viser til. Ubrukte alternativer avvises; når et rutingsutfall fjernes, må det tilhørende alternativet også fjernes hvis ingen andre rutingsfelt bruker det.
- Minst ett valg kreves før «Neste steg». Tomt svar betyr aldri «Ingen av disse». Navigasjonen skjer først med «Neste steg», ikke ved avkryssing. Feilmeldinger vises ikke før brukeren forsøker å fortsette.

Ruting er konfigurert per spørsmål og tolker ikke ord som «Ja», «Nei» eller «Ingen av disse». `options` beholder grenmålene, grenetikettene og knappetekstene for diagrammet. Diagrammet får én kant per rutingsutfall i `options`, ikke per avkryssingsvalg, og markerer den bekreftede ruten.

Treinnlastingen validerer spørsmålsformatet og avviser blant annet dupliserte valg-ID-er, flere eksklusive valg, manglende ruting, ukjente eller ubrukte `options`-nøkler og grenmål som ikke finnes. Ugyldige trær viser en feilmelding i stedet for å velge en gren automatisk.

### Navigasjon, begrunnelser og dokumentasjon

Et svar bekreftes først når «Neste steg» lykkes, inkludert eventuell obligatorisk begrunnelse. «Forrige steg» og «Tilbake til start» forkaster ubekreftede endringer i selve svarvalget og gjenoppretter det sist bekreftede valget. Hvis spørsmålet aldri er besvart, gjenopprettes et tomt valg.

Når et tidligere svar bekreftes med en endret verdi, fjernes alle etterfølgende svar og begrunnelser, også dersom svaret gir samme rute. Dette hindrer gamle svar fra forlatte eller sammenfallende grener i å dukke opp igjen. Avkryssingssvar sammenlignes som mengder av ID-er, uten betydning av rekkefølge. Endrer du valgene og gjenoppretter det opprinnelige settet før «Neste steg», beholdes de etterfølgende svarene. En mislykket validering endrer ikke bekreftede svar eller etterfølgende tilstand.

Denne oppryddingen gjelder også radiospørsmål som en tilsiktet retting av navigasjonen. Formatet, visningen og eksportformatet for radiosvar er uendret.

Begrunnelser lagres fortsatt mens du skriver, uavhengig av om selve svarvalget bekreftes. Endrer du bare en begrunnelse, lagres den nye teksten uten at etterfølgende svar slettes. Både valgfrie og obligatoriske begrunnelser støttes. «Start på nytt» nullstiller valg, bekreftede svar, navigasjon og begrunnelser.

«Dine svar», utskriften, JSON-eksporten og markeringen i diagrammet bruker bare bekreftede svar langs den aktive, fullførte delen av stien. For avkryssing vises **alle valgte etiketter** i «Dine svar» og i utskriften, sammen med begrunnelsen, ikke bare den avledede grenetiketten.

Et avkryssingssteg eksporteres slik:

```json
{
  "question": "Bruksområder",
  "answer": ["Formål A", "Formål B"],
  "choiceIds": ["a", "b"],
  "routingOption": "matching",
  "note": "Begrunnelse for valgene."
}
```

`answer` inneholder de valgte etikettene, `choiceIds` de stabile ID-ene, og `routingOption` den avledede nøkkelen i `options`. Etiketter og ID-er eksporteres i rekkefølgen i `choices`. Radiosvar beholder tekstverdien i `answer` uten de nye feltene. `note` er `null` når begrunnelsen er tom.

### Test av avkryssingsspørsmål

**Automatiske tester:** Start en lokal HTTP-server fra rotmappen, for eksempel `py -m http.server 8765 --bind 127.0.0.1`, og åpne `http://127.0.0.1:8765/tests/checkbox.html`. Testsiden viser eksplisitt hvilke tester som består eller feiler. Den bruker de faktiske malene, kjøretidskoden og den medfølgende Mermaid-versjonen i en isolert iframe med testdata. Ingen pakker eller byggetrinn kreves. Testene endrer ikke eksisterende beslutningstrær. Bruk en egen lokal serverport for testing, adskilt fra pågående vurderinger, siden testene bruker sidens lokale lagring.

Testene dekker avkryssing og eksklusivitet, forsinket validering og feiltilknytning, bekreftelse og tilbake-navigasjon, endrede og gjenopprettede svar, begrunnelser, opprydding i forlatte grener, omstart, JSON-eksport, tekstinnholdet som brukes til utskrift, utskriftsknappen, faktisk Mermaid-rendering og eksisterende radiosvar. Ugyldige konfigurasjoner testes med lokale varianter av eksempeldataene.

**Manuelle kontroller:** Automatiske DOM-tester bekrefter ikke utskriftslayout eller full tilgjengelighet. Kontroller separat:

1. Fullfør eksempeltreet med flere avkryssinger og begrunnelser. Åpne forhåndsvisning for utskrift og kontroller at alle valgte etiketter og begrunnelser er med, også ved lange tekster, linjebryting og sideskift.
2. Kontroller Aksel-utseendet, synlig fokus og avkryssingsmerker. Bruk bare tastaturet: Tab til valgene, Mellomrom for å endre dem, og «Neste steg» for å fortsette.
3. Kontroller med skjermleser at feltsettets spørsmål og etiketter leses, at feiloppsummeringen får fokus etter ugyldig «Neste steg», og at lenker og tilknyttede feilmeldinger fungerer.

## Versjonering og godkjenning

Vi bruker et versjonsformat `X.Y.Z`. Versjonsnummeret beskriver hva slags endring som er gjort i treet. Formatet er inspirert av [Semantic Versioning](https://semver.org/), men nivåene er definert for beslutningstrær og governance, ikke for API-kompatibilitet.

- **Major (`X.0.0`)** brukes når beslutningslogikken endres. Dette omfatter blant annet endringer i spørsmål, svaralternativer, vilkår, forgreninger eller resultater som kan påvirke hvilken vei brukeren går gjennom treet eller hvilken konklusjon treet gir.
- **Minor (`X.Y.0`)** brukes ved innholdsmessige eller språklige forbedringer som ikke er ment å endre beslutningslogikken, for eksempel klarspråk, forklaringer eller hjelpetekst.
- **Patch (`X.Y.Z`)** brukes ved rent redaksjonelle eller tekniske rettelser uten betydning for innholdet, for eksempel skrivefeil, formatering, lenker eller tilgjengelighetsrettinger.

Eksempler:

```text
1.0.0 → 2.0.0   Endring i beslutningslogikken
1.0.0 → 1.1.0   Innholdsmessig eller språklig forbedring
1.1.0 → 1.1.1   Redaksjonell eller teknisk retting
```

### Når må en ny versjon godkjennes?

En ny versjon må godkjennes av den ansvarlige godkjenneren dersom endringen kan påvirke hvordan brukeren forstår vurderingen, hvilke svar brukeren velger, hvilken vei treet tar eller hvilket resultat treet gir.

Dette innebærer at:

- endringer i beslutningslogikken alltid krever ny godkjenning;
- endringer i rettslige vilkår, avgrensninger eller tolkninger alltid krever ny godkjenning;
- språklige endringer som kan påvirke meningen eller hvordan et spørsmål, svaralternativ, vilkår eller resultat forstås, krever ny godkjenning;
- rene skrivefeil, formateringsendringer, lenkeendringer og andre endringer uten semantisk betydning krever normalt ikke ny godkjenning.

En klarspråkendring er derfor ikke automatisk unntatt fra godkjenning. Dersom omformuleringen kan påvirke hvordan brukeren forstår eller svarer på spørsmålet, skal endringen godkjennes på nytt.

Er det tvil om en endring kan påvirke forståelsen, beslutningsforløpet eller utfallet, skal den behandles som en endring som krever ny godkjenning.

### Status under endringer

Når det gjøres en endring som krever ny godkjenning, settes:

```json
{
  "status": "draft"
}
```

mens endringen arbeides med og behandles.

Når den nye versjonen er godkjent, settes status tilbake til:

```json
{
  "status": "approved"
}
```

og `approvedBy` og `approvedDate` oppdateres.

Endringer som ikke krever ny godkjenning kan publiseres som minor- eller patch-versjoner uten at `approvedBy` eller `approvedDate` endres.

`approvedBy` og `approvedDate` viser dermed den siste formelle godkjenningen av den offisielle beslutningslogikken, ikke nødvendigvis tidspunktet for den siste redaksjonelle eller tekniske endringen.



## Spørsmål?
Har du spørsmål om koden eller repoet, kan du [opprette en sak på GitHub](https://github.com/navikt/decision-tree-navigator/issues).

For interne spørsmål kan du skrive til oss i Slack-kanalen [#TADA](https://nav-it.slack.com/archives/C03CXENSLMV).

![KI](images/ki.png) Vi har brukt GitHub Copilot til å lage deler av koden.
