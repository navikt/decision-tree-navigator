# decision-tree-navigator
Et PoC på tilgjengelig brukergrensesnitt som lar deg navigere gjennom beslutningstreer.

Besøk grensesnittet på [beslutt.nav.no](https://beslutt.nav.no/).

## Gör så här:
### Kjør Beslutt lokalt
Verktøyet er lagd av ren CSS/JS/HTML.  Du trenger ingen byggsystemer eller noe for å kjøre verktøyet lokalt--bare åpne index.html i nettleseren din.  

### Legg til et nytt tre
Lagre treet som `data/<id>.json`, der `<id>` er en liten bokstav-slug med bindestreker. JSON-fila må inneholde samme `id`, `title`, `description` og `type` (`governing` eller `decision-support`) sammen med treets noder. Legg ID-en til i `data/manifest.json` for å vise treet på forsiden. Treet lastes på `tree.html?id=<id>`.

`governance` er bare relevant for `governing`-trær. Objektet kan inneholde `status`, `version`, `approvedBy` og `approvedDate`. Sett status til `draft`, `approved` eller `deprecated`; en treversjon vises som styrende bare når `type` er `governing` og `governance.status` er `approved`. Godkjenning gjelder den konkrete versjonen. Ikke fyll inn godkjenningsstatus, versjon, godkjenner eller dato uten verifisert informasjon. Når status mangler, opplyser grensesnittet om at godkjenningsstatus ikke er oppgitt.

## Teknisk oppsett
### Hovedsiden med tre-lista
[index.html](https://github.com/navikt/decision-tree-navigator/blob/main/index.html) genererer forsiden. [list-trees.js](https://github.com/navikt/decision-tree-navigator/blob/main/scripts/list-trees.js) leser ID-ene i [manifest.json](https://github.com/navikt/decision-tree-navigator/blob/main/data/manifest.json) og henter metadata fra de tilhørende tre-filene.

### Tree-sidene
[tree.html](https://github.com/navikt/decision-tree-navigator/blob/main/tree.html) er rammen til spørsmålene/trediagrammet. [render-tree.js](https://github.com/navikt/decision-tree-navigator/blob/main/scripts/render-tree.js) laster tre-fila som samsvarer med den validerte ID-en i URL-en.

## Henvendelser:
Spørsmål knyttet til koden eller repo'en kan stilles som issues her på GitHub.

Interne henvendelser kan sendes via Slack i kanalen [#TADA](https://nav-it.slack.com/archives/C03CXENSLMV).

![KI](images/ki.png) Koden er laget med hjelp fra Github Copilot.
