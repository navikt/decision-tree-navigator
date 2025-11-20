/*
  Decision Tree Navigator — UI runtime (render-tree.js)
  ----------------------------------------------------
  Responsibilities:
  - Load a tree JSON by id from the URL (?id=...)
  - Maintain lightweight navigation state (pathHistory) and notes per node
  - Render three modes:
    1) Intro screen: H1 styled like H2, optional intro text, Start button, full diagram
    2) Question pages: Step title, help text, options, optional note field, Next/Back
    3) Final result page: includes intro text for print only
  - Validation policy (lean):
    - No errors before the first Next click on a node
    - After Next, show inline + summary errors
    - Radio error clears on selection; textarea error clears on input
    - Error summary disappears only when no errors remain
  Accessibility:
  - Keeps semantic H1, focuses error summary only on first show after Next
  - Adds/clears aria-invalid and aria-describedby for fields when errors toggle
*/

// Tree data and navigation state
let tree = {};
let pathHistory = ["start"];
let interacted = false;
let attemptedSubmit = false; // becomes true after user clicks Next on a node
let lastRenderedNodeId = null; // track node to reset attemptedSubmit when node changes
let selectedByNode = {};

const NOTES_KEY = (treeId) => `beslutt:${treeId}:notes`;
const MAX_NOTE_LEN = 1000;
const selectedByNode = {};



// Set up HTML template rendering
// Clone a <template> by id and return its DocumentFragment
function cloneTemplate(id) {
    return document.getElementById(id).content.cloneNode(true);
}

// Read persisted note for a node (empty string if none)
function getNote(nodeId) {
    return notes[nodeId] || "";
}

function setNote(nodeId, value) {
    const trimmed = (value ?? "").trim();
    notes[nodeId] = trimmed.length > MAX_NOTE_LEN ? trimmed.slice(0, MAX_NOTE_LEN) : trimmed;
    localStorage.setItem(NOTES_KEY(treeId), JSON.stringify(notes));
}


// Normalize each node’s options into a sorted array of [key, option] pairs.
// Sorting rule: by option.order (if present), otherwise alphabetically.
// This makes iteration/rendering deterministic while still letting the JSON
// use object syntax for human readability.
function normalizeTreeOptions(treeObj) {
    const sortPairs = (optionsObj) => Object.entries(optionsObj || {}).sort((a, b) => {
        const oa = (a[1] && typeof a[1].order === "number") ? a[1].order : Number.POSITIVE_INFINITY;
        const ob = (b[1] && typeof b[1].order === "number") ? b[1].order : Number.POSITIVE_INFINITY;
        return oa !== ob ? oa - ob : String(a[0]).localeCompare(String(b[0]));
    });

    for (const node of Object.values(treeObj)) {
        if (node && node.options && typeof node.options === "object" && !Array.isArray(node.options)) {
            node.options = sortPairs(node.options);
        }
    }
}

// Remove existing error summary box (if any)
function clearErrorSummary(wrapperEl) {
    const old = wrapperEl.querySelector("#error-summary");
    if (old) old.remove();
}

function createErrorSummary(wrapperEl, items, {focus = true} = {}) {
    clearErrorSummary(wrapperEl);

    const box = document.createElement("div");
    box.className = "navds-error-summary";
    box.id = "error-summary";
    box.tabIndex = -1;

    const heading = document.createElement("div");
    heading.className = "navds-error-summary__heading navds-heading";
    heading.textContent = "Du må rette disse feilene før du kan fortsette:";
    box.appendChild(heading);

    const list = document.createElement("ul");
    list.className = "navds-error-summary__list";

    items.forEach(({text, href}) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.className = "navds-link";
        a.href = href;
        a.textContent = text;
        li.appendChild(a);
        list.appendChild(li);
    });

    box.appendChild(list);

    const buttons = wrapperEl.querySelector(".buttons");
    if (buttons && buttons.parentNode === wrapperEl) {
        wrapperEl.insertBefore(box, buttons);
    } else {
        wrapperEl.insertBefore(box, wrapperEl.firstChild);
    }

    if (focus) {
        box.focus();
    }
}


function makeAkselErrorMessage(id, text) {
    const p = document.createElement("p");
    p.className = "navds-error-message navds-label navds-error-message--show-icon";
    p.id = id;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 17 16");
    svg.setAttribute("fill", "none");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("focusable", "false");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("clip-rule", "evenodd");
    path.setAttribute("d", "M3.49209 11.534L8.11398 2.7594C8.48895 2.04752 9.50833 2.04743 9.88343 2.75924L14.5073 11.5339C14.8582 12.1998 14.3753 13 13.6226 13H4.37685C3.6242 13 3.14132 12.1999 3.49209 11.534ZM9.74855 10.495C9.74855 10.9092 9.41276 11.245 8.99855 11.245C8.58433 11.245 8.24855 10.9092 8.24855 10.495C8.24855 10.0808 8.58433 9.74497 8.99855 9.74497C9.41276 9.74497 9.74855 10.0808 9.74855 10.495ZM9.49988 5.49997C9.49988 5.22383 9.27602 4.99997 8.99988 4.99997C8.72373 4.99997 8.49988 5.22383 8.49988 5.49997V7.99997C8.49988 8.27611 8.72373 8.49997 8.99988 8.49997C9.27602 8.49997 9.49988 8.27611 9.49988 7.99997Z");
    path.setAttribute("fill", "currentColor");
    svg.appendChild(path);

    p.appendChild(svg);
    p.appendChild(document.createTextNode(text));
    return p;
}

// Inline error message for radio buttons
function showOptionError(fieldset, groupName, optErrId) {
    fieldset.classList.add("navds-radio-group", "navds-radio-group--medium", "navds-fieldset", "navds-fieldset--medium", "navds-fieldset--error");
    fieldset.setAttribute("aria-invalid", "true");

    const radios = fieldset.querySelectorAll(".navds-radio");
    radios.forEach((wrap) => {
        wrap.classList.add("navds-radio--error");
        wrap.setAttribute("data-color", "danger");
        const input = wrap.querySelector('input[type="radio"]');
        if (input) {
            const prev = input.getAttribute("aria-describedby") || "";
            const list = prev.split(" ").filter(Boolean);
            if (!list.includes(optErrId)) list.push(optErrId);
            input.setAttribute("aria-describedby", list.join(" "));
        }
    });

    let errContainer = fieldset.querySelector(`#${optErrId}`);
    if (!errContainer) {
        errContainer = document.createElement("div");
        errContainer.id = optErrId;
        errContainer.className = "navds-fieldset__error";
        errContainer.setAttribute("aria-live", "polite");
        errContainer.setAttribute("aria-relevant", "additions removals");

        const p = makeAkselErrorMessage(`${optErrId}-msg`, "Du må velge et alternativ.");
        errContainer.appendChild(p);

        const radioList = fieldset.querySelector(".navds-radio-buttons");
        if (radioList && radioList.parentNode === fieldset) {
            fieldset.insertBefore(errContainer, radioList.nextSibling);
        } else {
            fieldset.appendChild(errContainer);
        }
    }
}

function clearOptionError(fieldset, optErrId) {
    fieldset.classList.remove("navds-fieldset--error");
    fieldset.removeAttribute("aria-invalid");

    const container = fieldset.querySelector(`#${optErrId}`);
    if (container) container.remove();

    const radios = fieldset.querySelectorAll(".navds-radio");
    radios.forEach((wrap) => {
        wrap.classList.remove("navds-radio--error");
        wrap.removeAttribute("data-color");
        const input = wrap.querySelector('input[type="radio"]');
        if (input) {
            const prev = input.getAttribute("aria-describedby") || "";
            const list = prev.split(" ").filter((x) => x && x !== optErrId);
            if (list.length) input.setAttribute("aria-describedby", list.join(" ")); else input.removeAttribute("aria-describedby");
        }
    });
}

// Inline error message for textarea
function showNoteError(current, section) {
    const input = section.querySelector(`#note-${current}`);
    if (!input) return;

    const taWrap = section.querySelector(`#ta-wrap-${current}`);
    const fieldWrap = input.closest(".navds-form-field");
    if (!taWrap || !fieldWrap) return;

    const NOTE_ERR_ID = `note-err-${current}`;

    taWrap.classList.add("navds-textarea--error");

    if (!fieldWrap.querySelector(`#${NOTE_ERR_ID}`)) {
        const msg = makeAkselErrorMessage(NOTE_ERR_ID, "Du må begrunne svaret ditt.");
        fieldWrap.insertBefore(msg, taWrap.nextSibling);
    }

    input.setAttribute("aria-invalid", "true");
    const maxId = `maxlen-${current}`;
    const prev = input.getAttribute("aria-describedby") || "";
    const base = prev
        .split(" ")
        .filter(Boolean)
        .filter((x) => x !== NOTE_ERR_ID && x !== maxId);

    input.setAttribute("aria-describedby", [NOTE_ERR_ID, ...base, maxId].join(" "));
}

function clearNoteError(current, section) {
    const input = section.querySelector(`#note-${current}`);
    if (!input) return;

    const taWrap = section.querySelector(`#ta-wrap-${current}`);
    const fieldWrap = input.closest(".navds-form-field");
    const NOTE_ERR_ID = `note-err-${current}`;

    if (taWrap) {
        taWrap.classList.remove("navds-textarea--error");
    }

    if (fieldWrap) {
        const msg = fieldWrap.querySelector(`#${NOTE_ERR_ID}`);
        if (msg) msg.remove();
    }

    input.removeAttribute("aria-invalid");

    const prev = input.getAttribute("aria-describedby") || "";
    if (prev) {
        const list = prev
            .split(" ")
            .filter((x) => x && x !== NOTE_ERR_ID);

        if (list.length) {
            input.setAttribute("aria-describedby", list.join(" "));
        } else {
            input.removeAttribute("aria-describedby");
        }
    }
}


let treeId = "";
let notes = {};

// Bootstrap: resolve tree id from URL, set title, load persisted notes, then fetch the tree
async function init() {
    const params = new URLSearchParams(window.location.search);
    treeId = params.get("id");
    if (!treeId) {
        document.body.innerHTML = "<p>Mangler <code>?id=</code> i URL-en.</p>";
        return;
    }

    let entry = {title: treeId, file: `${treeId}.json`};

    try {
        const catalog = await fetch("data/trees.json").then(r => r.json());
        const match = catalog.find(t => t.id === treeId);
        if (match) entry = match;
    } catch {
        // still fall back silently
    }

    window.TREE_FILE = `data/${entry.file}`;
    window.TREE_TITLE = entry.title;

    document.title = entry.title;
    document.getElementById("tree-name").textContent = entry.title;

    notes = JSON.parse(localStorage.getItem(NOTES_KEY(treeId)) || "{}");
    await loadTree();
}


// Fetch the tree JSON, normalize it, then render the UI
async function loadTree() {
    try {
        const response = await fetch(window.TREE_FILE);
        tree = await response.json();
        normalizeTreeOptions(tree);
        render();
    } catch (e) {
        console.error("Failed to load tree:", e);
        document.getElementById("tree").innerHTML = "<p>Kunne ikke laste beslutningstreet.</p>";
        const diagramEl = document.getElementById("mermaid-container");
        diagramEl.textContent = "";
        diagramEl.removeAttribute("data-processed");
    }

}

// Render the entire page for the current node
function render() {
    const headerEl = document.getElementById("tree-name");
    const stepNameHeader = document.getElementById("step-name");
    const introEl = document.getElementById("tree-intro");

    const customTitle = (tree && typeof tree.title === "string") ? tree.title.trim() : "";
    headerEl.textContent = customTitle || window.TREE_TITLE;


    const section = document.getElementById("tree");
    const pathSection = document.getElementById("path");

    // Reset view
    section.innerHTML = "";
    pathSection.innerHTML = "";

    // 2) Finn gjeldende node og sjekk om vi er i intro-modus (startside før første interaksjon)
    const current = pathHistory[pathHistory.length - 1];
    const node = tree[current];
    const introMode = (current === "start" && !interacted);

    // Reset validation-attempt flag when node changes
    if (current !== lastRenderedNodeId) {
        attemptedSubmit = false;
    }

    // 1) Bygg "Dine svar": bruk valgt alternativ sin label + notat,
    // og kun for ferdig besvarte steg (alle unntatt siste i pathHistory).
    const completedIds = pathHistory.slice(0, -1); // alle tidligere steg

    // Lag et oppslagskart: nodeId -> valgt alternativ-objekt
    const chosenForNode = {};
    for (let i = 0; i < pathHistory.length - 1; i++) {
        const nodeId = pathHistory[i];
        const nextId = pathHistory[i + 1];
        const n = tree[nodeId];

        const match = n.options.find(([, opt]) => opt && opt.next === nextId);
        if (match) {
            const [, opt] = match;
            chosenForNode[nodeId] = opt;
        }
    }

    if (!introMode && completedIds.length > 0) {
        const pathList = document.createElement("ul");
        pathList.className = "navds-list navds-list--unordered";

        completedIds.forEach((nodeId) => {
            const opt = chosenForNode[nodeId];
            const labelText = opt && opt.label ? opt.label : "";
            const noteText = (getNote(nodeId) || "").trim();

            // Ikke vis noe hvis vi verken har label fra JSON eller notat
            if (!labelText && !noteText) return;

            const li = document.createElement("li");
            li.className = "navds-list__item";

            // Hovedtekst: label fra JSON (valgt alternativ)
            if (labelText) {
                const labelContainer = document.createElement("div");
                labelContainer.className = "navds-label";
                labelContainer.textContent = labelText;
                li.appendChild(labelContainer);
            }

            // Notat: vis bare hvis det faktisk finnes
            if (noteText) {
                const noteContainer = document.createElement("div");
                noteContainer.className = "navds-body-long";
                noteContainer.textContent = noteText;
                li.appendChild(noteContainer);
            }

            pathList.appendChild(li);
        });

        if (pathList.children.length > 0) {
            pathSection.appendChild(pathList);
        }
    }


    // Skjul hele svar-seksjonen i intro-modus
    const answersEl = document.getElementById("answers");
    if (answersEl) {
        answersEl.style.display = introMode ? "none" : "";

        // Fjern eventuell gammel print-knapp
        const oldPrint = answersEl.querySelector("#answers-print-btn");
        if (oldPrint) oldPrint.remove();
    }

    if (!node) {
        const err = document.createElement("p");
        err.className = "navds-body-long";
        err.textContent = "Fant ikke dette steget i beslutningstreet.";
        section.appendChild(err);
        return;
    }

    // Styling of H1 & H2 depend on whether we're on the intro page or the question page
    if (headerEl) {
        if (introMode) {
            headerEl.className = stepNameHeader ? stepNameHeader.className : "navds-heading navds-heading--xlarge";
        } else {
            headerEl.className = "normalFontWeight-0-1-4 navds-heading navds-heading--xsmall navds-typo--color-subtle";
        }
    }

    if (introEl) {
        const introText = (typeof tree["intro"] === "string" && tree["intro"].trim()) ? tree["intro"].trim() : (typeof tree["intro-text"] === "string" ? tree["intro-text"].trim() : "");

        // Show intro text only on the intro page (before first interaction)
        if (introMode) {
            introEl.textContent = introText || "";
            introEl.style.display = introText ? "" : "none";
            introEl.classList.remove("print-only");
        } else if (node.end) {
            // On the final page, keep the intro hidden on screen but include it in the DOM
            // so that print styles can reveal it in the printout.
            introEl.textContent = introText || "";
            introEl.style.display = "none";
            if (introText) {
                introEl.classList.add("print-only");
            } else {
                introEl.classList.remove("print-only");
            }
        } else {
            // Hide and clear on all question pages
            introEl.textContent = "";
            introEl.style.display = "none";
            introEl.classList.remove("print-only");
        }
    }

// 3) Bygg spørsmåls-UI fra template
    const questionFrag = cloneTemplate("question-template");
    const wrapper = questionFrag.querySelector(".question-wrapper");
    const helpEl = questionFrag.querySelector(".question-help");
    const noteContainer = questionFrag.querySelector(".note-container");
    const buttonsEl = questionFrag.querySelector(".buttons");
    const destructiveButtonsEl = questionFrag.querySelector(".destructive-buttons");


// Set the page header (h2#step-name) from node["step-title"] when provided; otherwise fall back to the question text
    if (stepNameHeader) {
        const rawStepTitle = (node && typeof node["step-title"] === "string") ? node["step-title"].trim() : "";
        const questionText = (node && typeof node.q === "string") ? node.q.trim() : "";
        stepNameHeader.textContent = introMode ? "" : (rawStepTitle || questionText || "");
        stepNameHeader.style.display = introMode ? "none" : "";
        stepNameHeader.setAttribute("aria-hidden", introMode ? "true" : "false");
    }

    if (node.end) {
        wrapper.classList.add("final-result");
    }

    // På intro-siden viser vi ikke hjelpetekst
    if (!introMode && typeof node.help === "string" && node.help.trim()) {
        // hjelp-tekst kan være HTML
        helpEl.innerHTML = node.help;
    } else {
        helpEl.remove();
    }

    // 4) Radio-gruppe (alternativer)
    let fieldset = null;
    let selectedNext = null;

    if (!introMode && !node.end && Array.isArray(node.options) && node.options.length > 0) {
        const fieldsetFrag = cloneTemplate("radio-group-template");
        fieldset = fieldsetFrag.querySelector("fieldset");
        const legend = fieldsetFrag.querySelector("legend");
        const radioContainer = fieldsetFrag.querySelector(".navds-radio-buttons");

        const groupName = `opt-${current}`;
        const optErrId = `fieldset-error-${current}`;


        legend.id = `legend-${current}`;
        const baseText = (node && typeof node.q === "string") ? node.q.trim() : "";
        const requiredText = " (obligatorisk)";
        legend.textContent = (baseText || "Velg et alternativ") + requiredText;


        node.options.forEach(([key, opt], idx) => {
            const optFrag = cloneTemplate("radio-option-template");
            const input = optFrag.querySelector("input");
            const labelEl = optFrag.querySelector("label.navds-radio__label");
            const labelSpan = optFrag.querySelector(".navds-body-short");
            const id = `${groupName}-${idx}`;

            input.id = id;
            input.name = groupName;
            input.value = key;
            labelEl.htmlFor = id;
            labelSpan.innerHTML = opt.buttonText || key;

            const previouslySelectedKey = selectedByNode[current];
            if (previouslySelectedKey === key) {
                input.checked = true;
                selectedNext = opt.next;
            }

            input.addEventListener("change", () => {
                selectedByNode[current] = key;
                selectedNext = opt.next;
                clearOptionError(fieldset, optErrId);
                updateErrorSummary(wrapper);
            });

            radioContainer.appendChild(optFrag);
        });


        wrapper.insertBefore(fieldsetFrag, noteContainer);
    }

    // 5) Generate the free-text field from the template
    if (!introMode && node.note && node.note.label) {
        const {label, hint, required} = node.note;
        const noteFrag = cloneTemplate("note-template");
        const labelEl = noteFrag.querySelector("label");
        const hintEl = noteFrag.querySelector(".hint");
        const textarea = noteFrag.querySelector("textarea");
        const maxEl = noteFrag.querySelector(".maxlen");

        const fieldId = `note-${current}`;
        const hintId = `hint-${current}`;
        const maxId = `maxlen-${current}`;

        const taWrap = noteFrag.querySelector(".navds-textarea");
        taWrap.id = `ta-wrap-${current}`;
        labelEl.setAttribute("for", fieldId);
        labelEl.textContent = label + (required ? " (obligatorisk)" : " (valgfritt)");


        if (hintEl) {
            if (hint) {
                hintEl.id = hintId;
                hintEl.textContent = hint;
            } else {
                hintEl.remove();
            }
        }

        if (textarea) {
            textarea.id = fieldId;
            textarea.maxLength = MAX_NOTE_LEN;
            textarea.value = getNote(current);
            textarea.setAttribute("rows", "6");

            const described = [];
            if (hint && hintEl) described.push(hintId);
            if (maxEl) described.push(maxId);
            if (described.length) {
                textarea.setAttribute("aria-describedby", described.join(" "));
            }
            if (required) textarea.required = true;


            textarea.addEventListener("input", () => {
                setNote(current, textarea.value);


                clearNoteError(current, wrapper);


                updateErrorSummary(wrapper);
            });
        }

        maxEl.id = maxId;
        maxEl.textContent = `Maks ${MAX_NOTE_LEN} tegn.`;
        noteContainer.appendChild(noteFrag);

    }


    function updateErrorSummary(wrapper) {
        // Do not show any summary before user attempts to go Next
        if (!attemptedSubmit) return;

        const errors = [];

        // 1) Radio selected?
        if (!selectedNext && !node.end) {
            errors.push({
                text: "Velg et alternativ.", href: `#legend-${current}`,
            });
        }

        // 2) Note required?
        const noteConfig = node.note;
        const noteIsRequired = noteConfig && noteConfig.label && noteConfig.required;

        if (noteIsRequired) {
            const textarea = wrapper.querySelector(`#note-${current}`);
            const value = textarea ? textarea.value.trim() : "";
            if (!value) {
                errors.push({
                    text: "Skriv en begrunnelse for svaret ditt.", href: `#note-${current}`,
                });
            }
        }

        clearErrorSummary(wrapper);

        if (errors.length > 0) {
            createErrorSummary(wrapper, errors, {focus: false});
        }
        // If no errors remain, the summary stays cleared (disappears)
    }

    function resetTreeState() {
        // Clear all stored notes for this tree
        notes = {};
        if (treeId) {
            localStorage.removeItem(NOTES_KEY(treeId));
        }

        // Clear stored radio selections
        for (const key in selectedByNode) {
            delete selectedByNode[key];
        }

        // Reset navigation state
        pathHistory = ["start"];
        interacted = false;
        attemptedSubmit = false;
        lastRenderedNodeId = null;
        selectedByNode = {};
    }


    // Knapper
    function makeNextButton() {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "navds-button navds-button--primary navds-button--medium navds-button--icon navds-button--icon-right";

        btn.innerHTML = "<span class='navds-label'>Neste steg</span>" + "<span class='navds-button__icon' aria-hidden='true'><svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n" + "<path d=\"M14.0878 6.87338C14.3788 6.68148 14.774 6.7139 15.0302 6.97006L19.5302 11.4701C19.6707 11.6107 19.7499 11.8015 19.7499 12.0003C19.7498 12.1991 19.6707 12.39 19.5302 12.5306L15.0302 17.0306C14.7739 17.2866 14.3788 17.3183 14.0878 17.1263C14.0462 17.0989 14.0062 17.0672 13.9696 17.0306C13.7133 16.7743 13.6817 16.3784 13.8739 16.0873C13.9013 16.0458 13.9331 16.0066 13.9696 15.9701L17.1893 12.7503H4.99988C4.58909 12.7503 4.25528 12.4196 4.24988 12.0101C4.24984 12.007 4.24988 12.0035 4.24988 12.0003C4.24988 11.5862 4.58572 11.2504 4.99988 11.2503H17.1893L13.9696 8.03061C13.7133 7.77433 13.6817 7.37837 13.8739 7.08725C13.9013 7.04583 13.9331 7.00655 13.9696 6.97006C14.0062 6.93345 14.0462 6.90084 14.0878 6.87338Z\" fill=\"#ffffff\"/>\n" + "</svg>\n</span>";


        btn.addEventListener("click", (e) => {
            e.preventDefault();
            interacted = true;
            attemptedSubmit = true;

            if (node.end) return;

            // Fjern eventuell gammel summary
            clearErrorSummary(wrapper);

            const errors = [];

            // 1) Radio må være valgt
            if (!selectedNext) {
                if (fieldset && typeof showOptionError === "function") {
                    const groupName = `opt-${current}`;
                    const optErrId = `fieldset-error-${current}`;
                    showOptionError(fieldset, groupName, optErrId);
                }

                errors.push({
                    text: "Velg et alternativ.", href: `#legend-${current}`,
                });
            }

            // 2) Notatfelt hvis det er påkrevd
            const noteConfig = node.note;
            const noteIsRequired = noteConfig && noteConfig.label && noteConfig.required;

            if (noteIsRequired) {
                const textarea = wrapper.querySelector(`#note-${current}`);
                const value = textarea ? textarea.value.trim() : "";

                if (!value) {

                    showNoteError(current, wrapper);


                    errors.push({
                        text: "Skriv en begrunnelse for svaret ditt.", href: `#note-${current}`,
                    });
                }
            }

            // 3) Hvis vi har feil, vis summary rett over knappene
            if (errors.length > 0) {
                createErrorSummary(wrapper, errors, {focus: true});
                return;
            }

            // Alt ok, gå videre
            pathHistory.push(selectedNext);
            render();
        });

        return btn;
    }

    function makeStartButton() {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "navds-button navds-button--primary navds-button--medium navds-button--icon navds-button--icon-right";

        btn.innerHTML =
            "<span class='navds-label'>Start</span>" +
            "<span class='navds-button__icon' aria-hidden='true'>" +
            "<svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">" +
            "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M8.61965 6.3536C8.84869 6.21883 9.13193 6.21533 9.36423 6.34438L18.3642 11.3444C18.6023 11.4767 18.75 11.7276 18.75 12C18.75 12.2724 18.6023 12.5233 18.3642 12.6556L9.36423 17.6556C9.13193 17.7847 8.84869 17.7812 8.61965 17.6464C8.39062 17.5116 8.25 17.2657 8.25 17V7C8.25 6.73426 8.39062 6.48836 8.61965 6.3536ZM9.75 8.27464V15.7254L16.4557 12L9.75 8.27464Z\" fill=\"currentColor\"/>" +
            "</svg>" +
            "</span>";
        btn.addEventListener("click", (e) => {
            e.preventDefault();
            interacted = true;
            render();
            // Flytt fokus til stegtittel for kontekst
            const h2 = document.getElementById("step-name");
            if (h2) {
                h2.setAttribute("tabindex", "-1");
                h2.focus();
                h2.addEventListener("blur", () => h2.removeAttribute("tabindex"), {once: true});
            }
        });
        return btn;
    }

    function makeBackButton() {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "navds-button navds-button--secondary navds-button--medium navds-button--icon navds-button--icon-left";
        btn.innerHTML = "<span class='navds-button__icon' aria-hidden='true'><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"1em\" height=\"1em\" fill=\"none\" viewBox=\"0 0 24 24\" focusable=\"false\" role=\"img\" aria-hidden=\"true\"><path fill=\"currentColor\" d=\"M8.97 6.97a.75.75 0 1 1 1.06 1.06l-3.22 3.22H19a.75.75 0 0 1 0 1.5H6.81l3.22 3.22a.75.75 0 1 1-1.06 1.06l-4.5-4.5a.75.75 0 0 1 0-1.06z\"></path></svg></span>" + "<span class='navds-label'>Forrige steg</span>";

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            if (pathHistory.length > 1) {
                pathHistory.pop();
                render();
            }
        });

        return btn;
    }


    function makeRestartButton() {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "navds-button navds-button--tertiary navds-button--medium navds-button--icon navds-button--icon-left";
        btn.innerHTML = "<span class='navds-button__icon' aria-hidden='true'><svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n" + "<path d=\"M18.7463 7.25C17.2522 5.1318 14.787 3.75 12 3.75C7.44365 3.75 3.75 7.44365 3.75 12C3.75 16.5563 7.44365 20.25 12 20.25C16.5563 20.25 20.25 16.5563 20.25 12C20.25 11.5858 20.5858 11.25 21 11.25C21.4142 11.25 21.75 11.5858 21.75 12C21.75 17.3848 17.3848 21.75 12 21.75C6.61522 21.75 2.25 17.3848 2.25 12C2.25 6.61522 6.61522 2.25 12 2.25C15.1606 2.25 17.969 3.75399 19.75 6.08327V3.5C19.75 3.08579 20.0858 2.75 20.5 2.75C20.9142 2.75 21.25 3.08579 21.25 3.5V8C21.25 8.41421 20.9142 8.75 20.5 8.75H16C15.5858 8.75 15.25 8.41421 15.25 8C15.25 7.58579 15.5858 7.25 16 7.25H18.7463Z\" fill=\"currentColor\"/>\n" + "</svg>\n</span>" + "<span class='navds-label'>Slett data og start på nytt</span>";

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            resetTreeState();
            render();
            // Flytt fokus til topp etter restart
            const h1 = document.getElementById("tree-name");
            if (h1) {
                h1.setAttribute("tabindex", "-1");
                h1.focus();
                h1.addEventListener("blur", () => h1.removeAttribute("tabindex"), {once: true});
            }
        });

        return btn;
    }

    function makeHomeButton() {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "navds-button navds-button--tertiary navds-button--medium navds-button--icon navds-button--icon-left";
        btn.innerHTML = "<span class='navds-button__icon' aria-hidden='true'><svg width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">\n" + "<path fill-rule=\"evenodd\" clip-rule=\"evenodd\" d=\"M4.5 6.25C4.08579 6.25 3.75 6.58579 3.75 7C3.75 7.41421 4.08579 7.75 4.5 7.75H5.30548L6.18119 19.1342C6.25132 20.046 7.01159 20.75 7.92603 20.75H16.074C16.9884 20.75 17.7487 20.046 17.8188 19.1342L18.6945 7.75H19.5C19.9142 7.75 20.25 7.41421 20.25 7C20.25 6.58579 19.9142 6.25 19.5 6.25H16.75V6C16.75 4.48122 15.5188 3.25 14 3.25H10C8.48122 3.25 7.25 4.48122 7.25 6V6.25H4.5ZM10 4.75C9.30964 4.75 8.75 5.30964 8.75 6V6.25H15.25V6C15.25 5.30964 14.6904 4.75 14 4.75H10ZM6.80991 7.75L7.67677 19.0192C7.68679 19.1494 7.7954 19.25 7.92603 19.25H16.074C16.2046 19.25 16.3132 19.1494 16.3232 19.0192L17.1901 7.75H6.80991ZM10 9.75C10.4142 9.75 10.75 10.0858 10.75 10.5V16.5C10.75 16.9142 10.4142 17.25 10 17.25C9.58579 17.25 9.25 16.9142 9.25 16.5V10.5C9.25 10.0858 9.58579 9.75 10 9.75ZM14 9.75C14.4142 9.75 14.75 10.0858 14.75 10.5V16.5C14.75 16.9142 14.4142 17.25 14 17.25C13.5858 17.25 13.25 16.9142 13.25 16.5V10.5C13.25 10.0858 13.5858 9.75 14 9.75Z\" fill=\"currentColor\"/>\n" + "</svg>\n</span>" + "<span class='navds-label'>Slett data og gå til forsiden</span>";

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            resetTreeState();
            window.location.href = "index.html";
        });

        return btn;
    }

    function makePrintButton() {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.id = "answers-print-btn";
        btn.className = "navds-button navds-button--primary navds-button--medium print";
        btn.innerHTML = "<span class='navds-button__icon' aria-hidden='true'></span>" + "<span class='navds-label'>Skriv ut</span>";

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            window.print();
        });

        return btn;
    }


    if (!introMode && pathHistory.length > 1) {
        buttonsEl.appendChild(makeBackButton());
    }

    if (introMode) {
        buttonsEl.appendChild(makeStartButton());
    } else if (node.end) {
        destructiveButtonsEl.appendChild(makeRestartButton());
        destructiveButtonsEl.appendChild(makeHomeButton());
    } else {
        buttonsEl.appendChild(makeNextButton());
    }


    // På resultatsiden: vis "Skriv ut"-knapp nederst under "Dine svar"
    if (node.end) {
        if (answersEl) {
            const printBtn = makePrintButton();
            answersEl.appendChild(printBtn);
        }
    }

    // 7) Legg inn spørsmålet i seksjonen
    section.appendChild(questionFrag);

    // 8) Tegn mermaid-grafen som før
    drawMermaid(tree);

    // Remember which node we just rendered to manage validation state per node
    lastRenderedNodeId = current;
}


// Generate Mermaid source code from the tree
function mermaidSource(tree, pathHistory) {
    const nodeLines = [];
    const edgeLines = [];
    const classLines = [];
    let edgeNo = -1;
    const visitedEdges = new Set();
    const visitedNodes = new Set();     // for traversal
    const historySet = new Set(pathHistory); // for styling
    const drawnEdges = new Set();
    const current = pathHistory[pathHistory.length - 1];
    // On the intro page (before any interaction), do not highlight the first node
    const isIntroDiagram = (pathHistory.length === 1 && !interacted);

    function drawNode(id, txt, shape = "rect") {
        const esc = txt.replace(/"/g, '\\"').replace(/\n/g, " ");
        switch (shape) {
            case "round":
                return `${id}("${esc}")`;
            case "circle":
                return `${id}(("${esc}"))`;
            case "stadium":
                return `${id}(["${esc}"])`;
            case "subroutine":
                return `${id}[[${esc}]]`;
            case "cylinder":
                return `${id}[("${esc}")]`;
            case "diamond":
            case "rhombus":
                return `${id}{${esc}}`;
            case "hexagon":
                return `${id}{{${esc}}}`;
            case "asymmetric":
                return `${id}>${esc}]`;
            case "parallelogram":
                return `${id}[/"${esc}"/]`;
            case "trapezoid":
                return `${id}[/\"${esc}\"\\]`;
            default:
                return `${id}["${esc}"]`;
        }
    }

    function visit(id) {
        if (visitedNodes.has(id)) return;
        visitedNodes.add(id);

        const n = tree[id];
        nodeLines.push(drawNode(id, n.q, n.shape));

        // Highlight current and visited nodes, except on the intro page where the start node should not be highlighted
        if (id === current && !(isIntroDiagram && id === "start")) {
            classLines.push(`class ${id} current`);
        } else if (historySet.has(id) && !(isIntroDiagram && id === "start")) {
            classLines.push(`class ${id} visited`);
        }


        if (!n.end && n.options) {
            const optionEntries = Array.isArray(n.options) ? n.options : [];
            for (const [, opt] of optionEntries) {
                if (!opt) continue;
                const label = (opt.buttonText || "").replace(/"/g, '\\"');
                const edgeKey = `${id}->${opt.next}`;

                if (!drawnEdges.has(edgeKey)) {
                    edgeNo++;
                    edgeLines.push(`${id} -->|${label}| ${opt.next}`);
                    drawnEdges.add(edgeKey);

                    // Highlight edge if it's part of the actual clicked path
                    if (pathHistory.some((h, i) => i && pathHistory[i - 1] === id && h === opt.next)) {
                        visitedEdges.add(edgeNo);
                    }
                }

                if (opt.next) visit(opt.next);
            }
        }
    }

    visit("start");

    if (visitedEdges.size) {
        edgeLines.push(`linkStyle ${[...visitedEdges].join(",")} stroke:#1844a3,stroke-width:2px;`);
    }

    classLines.push("classDef current fill:#fff2b3,stroke:#333,stroke-width:3px", "classDef visited fill:#e6f0ff,stroke:#1844a3,stroke-width:2px");

    return `graph TD\n${nodeLines.join("\n")}\n${edgeLines.join("\n")}\n${classLines.join("\n")}`;
}

// Render the Mermaid diagram
function drawMermaid(tree) {
    const el = document.getElementById('mermaid-container');
    if (!el) return;
    el.textContent = mermaidSource(tree, pathHistory);
    el.removeAttribute("data-processed");
    mermaid.run({nodes: [el]});
}

init();
