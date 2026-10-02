# `decision-tree-navigator` 

Beslutt er en enkel løsning for å gå gjennom beslutningstrær og dokumentere vurderinger. Prøv det ut på [beslutt.nav.no](https://beslutt.nav.no/).

## Kjør Beslutt lokalt
Beslutt bruker vanlig HTML, CSS og JavaScript. Du trenger ikke å bygge noe, men start en enkel HTTP-server så nettleseren får hentet JSON-filene.

## Teknisk oppsett
Forsiden ligger i [index.html](https://github.com/navikt/decision-tree-navigator/blob/main/index.html). [list-trees.js](https://github.com/navikt/decision-tree-navigator/blob/main/scripts/list-trees.js) leser ID-ene i [manifest.json](https://github.com/navikt/decision-tree-navigator/blob/main/data/manifest.json) og henter resten fra tre-filene.

[tree.html](https://github.com/navikt/decision-tree-navigator/blob/main/tree.html) viser spørsmålene og beslutningsdiagrammet. [render-tree.js](https://github.com/navikt/decision-tree-navigator/blob/main/scripts/render-tree.js) laster tre-fila som hører til ID-en i URL-en.


## Legg til et tre
1. Opprett `data/<id>.json`. Bruk en ID med små bokstaver, tall og bindestreker.
2. Legg inn `id`, `title`, `description` og `type` øverst i fila, sammen med treets noder. `type` må være `governing` eller `decision-support`.
3. For `governing`-trær legger du også inn `governance` med status `approved`, `draft` eller `deprecated`, og feltene `version`, `approvedBy` og `approvedDate`.
4. Hvis du ikke kjenner versjon, godkjenner eller dato ennå, lar du verdien stå som en tom streng. Grensesnittet viser bare felt som har en verdi.
5. Legg ID-en inn i `data/manifest.json` der du vil at treet skal vises.

### `type` og `governance`

`type` sier hva slags beslutninger treet brukes til. Det finnes to typer:

- `type: "decision-support"` er for trær som brukes som beslutningsstøtte. Slike trær tilbyr en strukturert måte å gå gjennom og dokumentere vurderinger på, men representerer ikke Navs offisielt godkjente beslutningslogikk. Disse trærne trenger ikke et `governance`-objekt.
- `type: "governing"` er for trær som representerer Navs offisielt godkjente, eller planlagte offisielle, beslutningslogikk. Disse må ha et `governance`-objekt.

#### `governance`-objektet

`governance`-objektet inneholder informasjon om godkjenning og versjonering av et styrende beslutningstre.

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
    - `"approved"` - denne versjonen er godkjent som styrende beslutningstre.
    - `"draft"` - treet er under arbeid eller venter på nødvendig godkjenning.
    - `"deprecated"` - treet skal ikke lenger brukes til nye vurderinger.
- `governance.version` er treets versjonsnummer.
- `governance.approvedBy` er hvem som har godkjent den styrende beslutningslogikken.
- `governance.approvedDate` er datoen den styrende beslutningslogikken sist ble formelt godkjent.

La feltene `version`, `approvedBy` og `approvedDate` stå som tomme strenger dersom opplysningene ikke er kjent ennå. Feltene fungerer også som en mal for hvilke opplysninger som kan fylles inn senere.  Grensesnittet viser bare governance-felt som har en verdi. JSON-eksporten tar med feltene også når de er tomme.

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
"status": "draft"
```

mens endringen arbeides med og behandles.

Når den nye versjonen er godkjent, settes status tilbake til:

```json
"status": "approved"
```

og `approvedBy` og `approvedDate` oppdateres.

Endringer som ikke krever ny godkjenning kan publiseres som minor- eller patch-versjoner uten at `approvedBy` eller `approvedDate` endres.

`approvedBy` og `approvedDate` viser dermed den siste formelle godkjenningen av den styrende beslutningslogikken, ikke nødvendigvis tidspunktet for den siste redaksjonelle eller tekniske endringen.



## Spørsmål?
Har du spørsmål om koden eller repoet, kan du [opprette en sak på GitHub](https://github.com/navikt/decision-tree-navigator/issues).

For interne spørsmål kan du skrive til oss i Slack-kanalen [#TADA](https://nav-it.slack.com/archives/C03CXENSLMV).

![KI](images/ki.png) Vi har brukt GitHub Copilot til å lage deler av koden.
