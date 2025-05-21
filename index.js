const tree = {
    start: {
        q: "Er innholdet ifm. saksbehandling?",
        options: {
            yes: {
                next: "doNotUseAI",
                label: "Ja, det er ifm. saksbehandling."
            },
            no: {
                next: "contentType",
                label: "Nei, det er ikke ifm. saksbehandling."
            }
        }
    },
    contentType: {
        q: "Er innholdet en rapport?",
        options: {
            isReport: {
                next: "utvidetMerking",
                label: "Ja, det er en rapport."
            },
            notReport: {
                next: "publicContent",
                label: "Nei, det er ikke en rapport."
            }
        }
    },
    publicContent: {
        q: "Er innholdet tilgjengelig for allmenheten?",
        options: {
            isPublic: {
                next: "minimalMarking",
                label: "Ja, det er offentlig tilgjengelig."
            },
            notPublic: {
                next: "realisticContent",
                label: "Nei, det er bare til internt bruk."
            }
        }
    },
    realisticContent: {
        q: "Er innholdet fotorealistisk/virkelighetstro media?",
        options: {
            isRealistic: {
                next: "minimalMarking",
                label: "Ja, det er fotorealistisk elelr virkelighetstro."
            },
            notRealistic: {
                next: "normativeContent",
                label: "Nei, det er ikke fotorealistisk eller virkelighetstro."
            }
        }
    },
    normativeContent: {
        q: "Er innholdet retningsgivende eller arkiveringspliktig?",
        options: {
            isNormative: {
                next: "decideMarkingYourself",
                label: "Ja, det er retningsgivende eller arkiveringspliktig."
            },
            notNormative: {
                next: "markingNotRequired",
                label: "Nei, det er ikke retningsgivende eller arkiveringspliktig."
            }
        }
    },
    minimalMarking: {
        q: "Bruk minimal merking.",
        end: true
    },
    utvidetMerking: {
        q: "Bruk utvidet merking.",
        end: true
    },
    decideMarkingYourself: {
        q: "Bruk skjønn til å velge variant avhengig av kontekst og hvor omfattende innholdet er.",
        end: true
    },
    markingNotRequired: {
        q: "Bruk skjønn til å velge om du vil merke innholdet eller ei, og i så fall hvordan.",
        end: true
    },
    doNotUseAI: {
        q: "Generativ KI skal ikke brukes i forbindelse med saksbehandling.",
        end: true
    }
};

let history = ["start"];

function render() {
    const section = document.getElementById("tree");
    section.innerHTML = "";

    const current = history[history.length - 1];
    const node = tree[current];

    const question = document.createElement("h2");
    question.id = "question";
    question.setAttribute("tabindex", "-1");
    question.textContent = node.q;
    section.appendChild(question);

    // When coming to the end of the flow, add the restart button and return
    if (node.end) {
        const restart = document.createElement("button");
        restart.textContent = "Start på nytt";
        restart.onclick = () => {
            history = ["start"];
            render();
        };
        section.appendChild(restart);
        question.focus();

        return;
    }

    // Create the buttons
    for (const option of Object.values(node.options)) {
        const btn = document.createElement("button");
        btn.textContent = option.label;
        btn.onclick = () => {
            history.push(option.next);
            render();
        };
        section.appendChild(btn);
    }

    // Add back button when relevant
    if (history.length > 1) {
        const backBtn = document.createElement("button");
        backBtn.textContent = "Tilbake";

        backBtn.onclick = () => {
            history.pop();
            render();
        };
        section.appendChild(backBtn);
        question.focus();
    }



}

document.addEventListener("DOMContentLoaded", render);
