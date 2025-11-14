# decision-tree-navigator
Et PoC på tilgjengelig brukergrensesnitt som lar deg navigere gjennom beslutningstreer.

Besøk grensesnittet på [beslutt.nav.no](https://beslutt.nav.no/).

## Gör så här:
### Kjør Beslutt lokalt
Verktøyet er lagd av ren CSS/JS/HTML.  Du trenger ingen byggsystemer eller noe for å kjøre verktøyet lokalt--bare åpne index.html i nettleseren din.  

### Legg til et nytt tre
Lagre en json-fil med tre-dataen i [data-mappa](https://github.com/navikt/decision-tree-navigator/tree/main/data) og oppdater [trees.json](https://github.com/navikt/decision-tree-navigator/blob/main/data/trees.json) med det nye treets tittel og filnavn.  ID'en kan være hva du ønsker, det er bare en nøkkel som brukes som en parameter i URLen for å laste inn tre-dataen til tree.html.  

## Teknisk oppsett
### Hovedsiden med tre-lista
[index.html](https://github.com/navikt/decision-tree-navigator/blob/main/index.html) genererer forsiden og bruker [list-trees.js](https://github.com/navikt/decision-tree-navigator/blob/main/scripts/list-trees.js) til å lese [trees.json](https://github.com/navikt/decision-tree-navigator/blob/main/data/trees.json) og lage en innholdsfortegnelse over beslutningstrærene som befinner seg i [data-mappa](https://github.com/navikt/decision-tree-navigator/tree/main/data).  

### Tree-sidene
[tree.html](https://github.com/navikt/decision-tree-navigator/blob/main/tree.html) er rammen til spørsmålene/trediagrammet.  Det er [render-tree.js](https://github.com/navikt/decision-tree-navigator/blob/main/scripts/render-tree.js) som genererer hovedvekten av innholdet basert på beslutningstreet som er spesifisert via id-parameteret i URLen.  

## Henvendelser:
Spørsmål knyttet til koden eller repo'en kan stilles som issues her på GitHub.

Interne henvendelser kan sendes via Slack i kanalen [#TADA](https://nav-it.slack.com/archives/C03CXENSLMV).

![KI](images/ki.png) Koden er laget med hjelp fra ChatGPT.
