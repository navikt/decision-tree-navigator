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
let minRemaining = {}; // node id -> shortest path (in steps) to any end node
let maxRemaining = {}; // node id -> longest path (in steps) to any end node

const NOTES_KEY = (treeId) => `beslutt:${treeId}:notes`;
const INTRO_META_KEY = (treeId) => `beslutt:${treeId}:intro-meta`;
const MAX_NOTE_LEN = 1000;


// Set up HTML template rendering
// Clone a <template> by id and return its DocumentFragment
function cloneTemplate(id) {
    return document.getElementById(id).content.cloneNode(true);
}

function cloneButtonTemplate(templateId, labelText) {
    const tpl = document.getElementById(templateId);
    if (!tpl) {
        throw new Error(`Mangler buttontemplate med id="${templateId}"`);
    }

    const button = tpl.content.firstElementChild.cloneNode(true);

    if (labelText) {
        const labelSpan = button.querySelector(".navds-label");
        if (labelSpan) {
            labelSpan.textContent = labelText;
        }
    }

    return button;
}

function createButton(templateId, labelText, onClick) {
    const btn = cloneButtonTemplate(templateId, labelText);

    if (typeof onClick === "function") {
        btn.addEventListener("click", (e) => {
            e.preventDefault(); // common behaviour: don’t submit any forms
            onClick(e);
        });
    }

    return btn;
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

const NOTE_REQUIRED_MSG = "Skriv en begrunnelse for svaret ditt.";

function isNoteRequired(node) {
    const cfg = node && node.note;
    return !!(cfg && cfg.label && cfg.required);
}

function getNoteValue(wrapper, current) {
    const textarea = wrapper.querySelector(`#note-${current}`);
    return textarea ? textarea.value.trim() : "";
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

// Shortest and longest path (in steps) from each node to any reachable end node.
// Pure structural property of the tree — drives the "Steg N av M" / "Steg N av inntil M" label.
// Must run after normalizeTreeOptions(), since it expects node.options as [key, opt] pairs.
function computeStepRange(treeObj) {
    const maxMemo = {};
    const minMemo = {};
    const visiting = {};

    function walk(id) {
        if (maxMemo[id] !== undefined) return;
        if (visiting[id]) {
            maxMemo[id] = 0;
            minMemo[id] = 0;
            return;
        }
        visiting[id] = true;
        const node = treeObj[id];
        let maxR = 0;
        let minR = Infinity;
        if (node && !node.end && Array.isArray(node.options) && node.options.length) {
            node.options.forEach(([, opt]) => {
                if (opt && opt.next) {
                    walk(opt.next);
                    maxR = Math.max(maxR, 1 + maxMemo[opt.next]);
                    minR = Math.min(minR, 1 + minMemo[opt.next]);
                }
            });
        } else {
            minR = 0;
        }
        visiting[id] = false;
        maxMemo[id] = maxR;
        minMemo[id] = minR === Infinity ? 0 : minR;
    }

    Object.keys(treeObj).forEach(walk);
    minRemaining = minMemo;
    maxRemaining = maxMemo;
}

// Remove existing error summary box (if any)
function clearErrorSummary(wrapperEl) {
    const old = wrapperEl.querySelector("#error-summary");
    if (old) old.remove();
}

function createErrorSummary(wrapperEl, items, {focus = true} = {}) {
    clearErrorSummary(wrapperEl);

    const tpl = document.getElementById("error-summary-template");

    let box = tpl.content.firstElementChild.cloneNode(true);
    const list = box.querySelector(".navds-error-summary__list");
    if (list) {
        list.textContent = "";
        items.forEach(({text, href}) => {
            const li = document.createElement("li");
            const a = document.createElement("a");
            a.className = "navds-link";
            a.href = href;
            a.textContent = text;
            li.appendChild(a);
            list.appendChild(li);
        });
    }

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

function addDescribedBy(input, id) {
    if (!input || !id) return;
    const prev = input.getAttribute("aria-describedby") || "";
    const list = prev.split(" ").filter(Boolean);
    if (!list.includes(id)) list.push(id);
    input.setAttribute("aria-describedby", list.join(" "));
}

function removeDescribedBy(input, id) {
    if (!input || !id) return;
    const prev = input.getAttribute("aria-describedby") || "";
    const list = prev.split(" ").filter(Boolean).filter((x) => x !== id);
    if (list.length) {
        input.setAttribute("aria-describedby", list.join(" "));
    } else {
        input.removeAttribute("aria-describedby");
    }
}


// Inline error message for radio buttons
function showOptionError(fieldset, groupName, optErrId) {
    fieldset.classList.add("navds-fieldset--error");
    fieldset.setAttribute("aria-invalid", "true");

    const radios = fieldset.querySelectorAll(".navds-radio");
    radios.forEach((wrap) => {
        wrap.classList.add("navds-radio--error");
        wrap.setAttribute("data-color", "danger");
        const input = wrap.querySelector('input[type="radio"]');
        if (input) {
            addDescribedBy(input, optErrId);
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
            removeDescribedBy(input, optErrId);
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
        const msg = makeAkselErrorMessage(NOTE_ERR_ID, NOTE_REQUIRED_MSG);
        fieldWrap.insertBefore(msg, taWrap.nextSibling);
    }

    input.setAttribute("aria-invalid", "true");
    addDescribedBy(input, NOTE_ERR_ID);
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
    removeDescribedBy(input, NOTE_ERR_ID);
}

// Generic text input error handling (for intro fields)
function showTextFieldError(fieldWrap, inputEl, errId, message) {
    if (!fieldWrap || !inputEl) return;

    const textWrap = fieldWrap.querySelector('.navds-text-field');
    if (textWrap) {
        textWrap.classList.add('navds-text-field--error');
    }

    if (!fieldWrap.querySelector(`#${errId}`)) {
        const msg = makeAkselErrorMessage(errId, message);
        if (textWrap && textWrap.nextSibling) {
            fieldWrap.insertBefore(msg, textWrap.nextSibling);
        } else {
            fieldWrap.appendChild(msg);
        }
    }

    inputEl.setAttribute('aria-invalid', 'true');
    addDescribedBy(inputEl, errId);
}


function clearTextFieldError(fieldWrap, inputEl, errId) {
    if (!fieldWrap || !inputEl) return;

    const textWrap = fieldWrap.querySelector('.navds-text-field');
    if (textWrap) {
        textWrap.classList.remove('navds-text-field--error');
    }

    const msg = fieldWrap.querySelector(`#${errId}`);
    if (msg) msg.remove();

    inputEl.removeAttribute('aria-invalid');
    removeDescribedBy(inputEl, errId);
}


let treeId = "";
let notes = {};
let introMeta = {serviceName: "", contactPerson: ""};

function loadIntroMeta() {
    try {
        if (!treeId) return;
        const raw = localStorage.getItem(INTRO_META_KEY(treeId));
        if (raw) {
            const parsed = JSON.parse(raw);
            introMeta.serviceName = (parsed.serviceName || "").trim();
            introMeta.contactPerson = (parsed.contactPerson || "").trim();
        }
    } catch (e) {
        // ignore
    }
}

function setIntroMetaField(key, value) {
    introMeta[key] = (value || "").trim();
    try {
        if (treeId) localStorage.setItem(INTRO_META_KEY(treeId), JSON.stringify(introMeta));
    } catch (e) {
        // ignore
    }
}

// Ensure local data is cleared when the page is closed or navigated away
function cleanupNotes() {
    try {
        if (treeId) {
            localStorage.removeItem(NOTES_KEY(treeId));
            localStorage.removeItem(INTRO_META_KEY(treeId));
        }
    } catch (e) {
        // ignore storage errors
    }
}

// Use pagehide (fires on tab close, refresh, history nav; supports bfcache). Fallback to beforeunload.
window.addEventListener("pagehide", cleanupNotes);
window.addEventListener("beforeunload", cleanupNotes);

// Resolve tree id from URL, set title, load persisted notes, then fetch the tree
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

    notes = JSON.parse(localStorage.getItem(NOTES_KEY(treeId)) || "{}");
    await loadTree();
}


// Fetch the tree JSON, normalize it, then render the UI
async function loadTree() {
    try {
        const response = await fetch(window.TREE_FILE);
        tree = await response.json();
        normalizeTreeOptions(tree);
        computeStepRange(tree);
        render();
    } catch (e) {
        console.error("Failed to load tree:", e);
        document.getElementById("question").innerHTML = "<p>Kunne ikke laste beslutningstreet.</p>";
        const diagramEl = document.getElementById("mermaid-container");
        diagramEl.textContent = "";
        diagramEl.removeAttribute("data-processed");
    }

}

// Render the entire page for the current node
function render() {
    const stepNameHeader = document.getElementById("step-name");
    const treeTitleEl = document.getElementById("tree-title");

    const customTitle = (tree && typeof tree.title === "string") ? tree.title.trim() : "";
    const effectiveTitle = customTitle || window.TREE_TITLE;

    // Always show the tree title in the span above the H1
    if (treeTitleEl) {
        treeTitleEl.textContent = effectiveTitle || "";
    }

    const section = document.getElementById("question");
    const pathSection = document.getElementById("path");

    // Reset view
    section.innerHTML = "";
    pathSection.innerHTML = "";

    // 2) Finn gjeldende node og sjekk om vi er i intro-modus (startside før første interaksjon)
    const current = pathHistory[pathHistory.length - 1];
    const node = tree[current];
    const introMode = (current === "start" && !interacted);

    // Progress indicator: "N–M spørsmål" on the intro page, "Steg N av M" (or "av inntil M"
    // when the remaining depth isn't fixed across branches) once questions start.
    const progressSectionEl = document.getElementById("progress-section");
    const questionRangeEl = document.getElementById("question-range");
    if (progressSectionEl) progressSectionEl.innerHTML = "";
    if (questionRangeEl) questionRangeEl.textContent = "";

    if (introMode) {
        const rangeMin = minRemaining["start"] || 0;
        const rangeMax = maxRemaining["start"] || 0;
        if (questionRangeEl) {
            questionRangeEl.textContent = (rangeMin === rangeMax)
                ? `${rangeMin} spørsmål`
                : `${rangeMin}–${rangeMax} spørsmål`;
        }
    } else if (node && progressSectionEl) {
        const stepsTaken = pathHistory.length - 1;
        const maxR = maxRemaining[current] || 0;
        const minR = minRemaining[current] || 0;
        const totalStepsNum = node.end ? stepsTaken : Math.max(stepsTaken + maxR, stepsTaken + 1);
        const activeStepNum = node.end ? totalStepsNum : stepsTaken + 1;
        const stepsKnownExact = node.end || minR === maxR;
        const stepLabelText = stepsKnownExact
            ? `Steg ${activeStepNum} av ${totalStepsNum}`
            : `Steg ${activeStepNum} av inntil ${totalStepsNum}`;
        const translateX = totalStepsNum > 0 ? (100 - (activeStepNum / totalStepsNum) * 100) : 0;

        const bar = document.createElement("div");
        bar.className = "navds-progress-bar navds-progress-bar--medium";
        bar.setAttribute("aria-hidden", "true");
        const fg = document.createElement("div");
        fg.className = "navds-progress-bar__foreground";
        fg.style.setProperty("--__ac-progress-bar-translate", `-${translateX}%`);
        bar.appendChild(fg);
        progressSectionEl.appendChild(bar);

        const label = document.createElement("p");
        label.className = "navds-body-short step-label";
        label.textContent = stepLabelText;
        progressSectionEl.appendChild(label);
    }

    // Toggle page-type classes on the body element: "start", "question", "end"
    const pageEl = document.body;
    if (pageEl) {
        pageEl.classList.remove('start', 'question', 'end');
        if (introMode) {
            pageEl.classList.add('start');
        } else if (node && node.end) {
            pageEl.classList.add('end');
        } else {
            pageEl.classList.add('question');
        }
    }


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

    // Bygg en enkelt dt/dd-rad (Aksel FormSummary-mønster) for gjenbruk
    // mellom saks-metadata (navn/kontaktperson) og besvarte spørsmål.
    function makeAnswerRow(labelText, valueText, extraDdClass) {
        const row = document.createElement("div");
        row.className = "navds-form-summary__answer";

        const dt = document.createElement("dt");
        dt.className = "navds-label";
        dt.textContent = labelText;
        row.appendChild(dt);

        const dd = document.createElement("dd");
        dd.className = "navds-form-summary__value navds-body-long navds-body-long--medium" + (extraDdClass ? " " + extraDdClass : "");
        dd.textContent = valueText;
        row.appendChild(dd);

        return row;
    }

    if (!introMode) {
        const rows = [];

        // Sørg for at vi har oppdatert introMeta fra storage ved behov
        if (!introMeta || ((!introMeta.serviceName) && treeId)) {
            loadIntroMeta();
        }

        // Saks-metadata (navn til tjenesten / kontaktperson) som egne rader øverst
        if (introMeta && introMeta.serviceName) {
            rows.push(makeAnswerRow("Navn til tjenesten", introMeta.serviceName));
        }
        const hasContact = !!(introMeta && typeof introMeta.contactPerson === 'string' && introMeta.contactPerson.trim());
        if (hasContact) {
            rows.push(makeAnswerRow("Kontaktperson", introMeta.contactPerson.trim()));
        }

        // Besvarte spørsmål: bruk valgt alternativ sin label + notat,
        // og kun for ferdig besvarte steg (alle unntatt siste i pathHistory).
        completedIds.forEach((nodeId) => {
            const n = tree[nodeId];
            const opt = chosenForNode[nodeId];
            const labelText = opt && opt.label ? opt.label : "";
            const noteText = (getNote(nodeId) || "").trim();

            // Ikke vis noe hvis vi verken har label fra JSON eller notat
            if (!labelText && !noteText) return;

            const questionTitle = (n && (n["step-title"] || n.q)) || "";
            let row;
            if (labelText) {
                row = makeAnswerRow(questionTitle, labelText);
            } else {
                row = document.createElement("div");
                row.className = "navds-form-summary__answer";
                const dt = document.createElement("dt");
                dt.className = "navds-label";
                dt.textContent = questionTitle;
                row.appendChild(dt);
            }

            // Begrunnelse, hvis notert (egen dd, mer diskret stil)
            if (noteText) {
                const noteDd = document.createElement("dd");
                noteDd.className = "navds-form-summary__value navds-body-short navds-typo--color-subtle";
                noteDd.textContent = noteText;
                row.appendChild(noteDd);
            }

            rows.push(row);
        });

        if (rows.length > 0) {
            rows.forEach((row) => pathSection.appendChild(row));
        } else {
            const empty = document.createElement("p");
            empty.className = "navds-label";
            empty.textContent = "Svarene dine vises her etter hvert som du går gjennom stegene.";
            pathSection.appendChild(empty);
        }
    }

    if (!node) {
        const err = document.createElement("p");
        err.className = "navds-body-long";
        err.textContent = "Fant ikke dette steget i beslutningstreet.";
        section.appendChild(err);
        return;
    }

    // Intro page for trees
    if (introMode) {
        const introText = typeof tree["intro-text"] === "string" ? tree["intro-text"].trim() : "";

        stepNameHeader.textContent = effectiveTitle;
        loadIntroMeta();

        const wrapper = document.createElement("div");
        wrapper.className = "question-wrapper";

        if (introText) {
            const introTextEl = document.createElement("div");
            introTextEl.className = "navds-body-long";
            introTextEl.textContent = introText;
            wrapper.appendChild(introTextEl);
        }

        // Field 1: Navn til tjenesten (required)
        const serviceField = document.createElement('div');
        serviceField.className = 'navds-form-field';
        const serviceLabel = document.createElement('label');
        serviceLabel.className = 'navds-label';
        serviceLabel.setAttribute('for', 'intro-service-name');
        serviceLabel.textContent = 'Navn til tjenesten (obligatorisk)';
        const serviceWrap = document.createElement('div');
        serviceWrap.className = 'navds-text-field';
        const serviceInput = document.createElement('input');
        serviceInput.type = 'text';
        serviceInput.id = 'intro-service-name';
        serviceInput.className = 'navds-text-field__input';
        serviceInput.setAttribute('autocomplete', 'off');
        serviceInput.value = introMeta.serviceName || '';
        serviceInput.addEventListener('input', () => {
            setIntroMetaField('serviceName', serviceInput.value);
            clearTextFieldError(serviceField, serviceInput, 'intro-service-name-error');
            clearErrorSummary(wrapper);
        });
        serviceWrap.appendChild(serviceInput);
        serviceField.appendChild(serviceLabel);
        serviceField.appendChild(serviceWrap);

        // Field 2: Kontaktperson (optional)
        const contactField = document.createElement('div');
        contactField.className = 'navds-form-field';
        const contactLabel = document.createElement('label');
        contactLabel.className = 'navds-label';
        contactLabel.setAttribute('for', 'intro-contact-person');
        contactLabel.textContent = 'Kontaktperson (valgfritt)';
        const contactWrap = document.createElement('div');
        contactWrap.className = 'navds-text-field';
        const contactInput = document.createElement('input');
        contactInput.type = 'text';
        contactInput.id = 'intro-contact-person';
        contactInput.className = 'navds-text-field__input';
        contactInput.setAttribute('autocomplete', 'off');
        contactInput.value = introMeta.contactPerson || '';
        contactInput.addEventListener('input', () => {
            setIntroMetaField('contactPerson', contactInput.value);
        });
        contactWrap.appendChild(contactInput);
        contactField.appendChild(contactLabel);
        contactField.appendChild(contactWrap);

        // Append fields directly into wrapper (no extra container)
        wrapper.appendChild(serviceField);
        wrapper.appendChild(contactField);

        const btnRow = document.createElement("div");
        btnRow.className = "navds-stack navds-hstack navds-stack-gap navds-stack-direction buttons";
        btnRow.appendChild(makeStartButton());
        wrapper.appendChild(btnRow);

        section.appendChild(wrapper);

        // Always render the Mermaid diagram, even on the intro page
        drawMermaid(tree);

        return; // Stop here; do not render question UI in intro mode
    }


// 3) Bygg spørsmåls-UI fra template
    const questionFrag = cloneTemplate("question-template");
    const wrapper = questionFrag.querySelector(".question-wrapper");
    const helpEl = questionFrag.querySelector(".question-help");
    const noteContainer = questionFrag.querySelector(".note-container");
    const buttonsEl = questionFrag.querySelector(".buttons");


// Set the page header (h1#step-name) from node["step-title"] when provided; otherwise fall back to the question text
    if (stepNameHeader) {
        const rawStepTitle = (node && typeof node["step-title"] === "string") ? node["step-title"].trim() : "";
        const questionText = (node && typeof node.q === "string") ? node.q.trim() : "";
        stepNameHeader.textContent = introMode ? effectiveTitle : (rawStepTitle || questionText || "");
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
        legend.tabIndex = -1;
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

    function collectErrorsForCurrentNode({current, node, selectedNext, wrapper}) {
        const errors = [];

        // Radio required unless end node
        if (!selectedNext && !node.end) {
            errors.push({
                text: "Velg et alternativ.", href: `#legend-${current}`,
            });
        }

        // Note required?
        if (isNoteRequired(node)) {
            const value = getNoteValue(wrapper, current);
            if (!value) {
                errors.push({
                    text: NOTE_REQUIRED_MSG, href: `#note-${current}`,
                });
            }
        }

        return errors;
    }

    function updateErrorSummary(wrapper) {
        if (!attemptedSubmit) return;

        const errors = collectErrorsForCurrentNode({current, node, selectedNext, wrapper});

        clearErrorSummary(wrapper);
        if (errors.length > 0) {
            createErrorSummary(wrapper, errors, {focus: false});
        }
    }

    function resetTreeState() {
        // Clear all stored notes for this tree
        notes = {};
        if (treeId) {
            localStorage.removeItem(NOTES_KEY(treeId));
            localStorage.removeItem(INTRO_META_KEY(treeId));
        }
        // Clear intro meta in memory
        introMeta = {serviceName: "", contactPerson: ""};

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

    function focusStepTitle() {
        const stepTitle = document.getElementById("step-name");
        if (stepTitle) stepTitle.focus();
    }

    function makeNextButton() {
        return createButton("button-primary-right", "Neste steg", () => {
            interacted = true;
            attemptedSubmit = true;
            if (node.end) return;

            clearErrorSummary(wrapper);

            const errors = collectErrorsForCurrentNode({current, node, selectedNext, wrapper});

            // Drive inline errors based on which hrefs exist
            if (errors.some(e => e.href === `#legend-${current}`) && fieldset) {
                const groupName = `opt-${current}`;
                const optErrId = `fieldset-error-${current}`;
                showOptionError(fieldset, groupName, optErrId);
            }
            if (errors.some(e => e.href === `#note-${current}`)) {
                showNoteError(current, wrapper);
            }

            if (errors.length > 0) {
                createErrorSummary(wrapper, errors, {focus: true});
                return;
            }

            pathHistory.push(selectedNext);
            render();
            focusStepTitle();
        });
    }


    function makeStartButton() {
        return createButton("button-primary-right", "Start", () => {
            const wrapper = document.querySelector('#question .question-wrapper');
            const serviceInput = document.getElementById('intro-service-name');
            const serviceFieldWrap = serviceInput ? serviceInput.closest('.navds-form-field') : null;

            clearErrorSummary(wrapper || document);

            const errors = [];
            const value = (serviceInput && typeof serviceInput.value === 'string') ? serviceInput.value.trim() : '';

            if (!value) {
                if (serviceFieldWrap && serviceInput) {
                    showTextFieldError(serviceFieldWrap, serviceInput, 'intro-service-name-error', 'Skriv inn navn til tjenesten.',);
                }
                errors.push({text: 'Skriv inn navn til tjenesten.', href: '#intro-service-name'});
            }

            if (errors.length > 0) {
                if (wrapper) createErrorSummary(wrapper, errors, {focus: true});
                return;
            }

            setIntroMetaField('serviceName', value);
            const contactInput = document.getElementById('intro-contact-person');
            if (contactInput) setIntroMetaField('contactPerson', contactInput.value || '');

            interacted = true;
            render();
            focusStepTitle();
        });
    }

    function makeBackButton() {
        return createButton("button-secondary-left", "Forrige steg", () => {
            if (pathHistory.length > 1) {
                pathHistory.pop();
                render();
                focusStepTitle();
            }
        });
    }

    function makeBackToIntroButton() {
        return createButton("button-secondary-left", "Tilbake til start", () => {
            pathHistory.length = 1;
            interacted = false;
            render();
            focusStepTitle();
        });
    }

    function makeRestartButton() {
        return createButton("button-tertiary-left", "Start på nytt", () => {
            resetTreeState();
            render();
            focusStepTitle();
        });
    }


    function makePrintButton() {
        return createButton("button-print", null, () => {
            window.print();
        });
    }

    function makeExportJsonButton() {
        return createButton("button-tertiary-left-json", null, () => {
            exportAnswersAsJson();
        });
    }

    // Back buttons
    if (pathHistory.length > 1) {
        buttonsEl.appendChild(makeBackButton());
    } else {
        buttonsEl.appendChild(makeBackToIntroButton());
    }

    // Main action button(s): Next on a question, or the end-node action row
    if (node.end) {
        buttonsEl.appendChild(makePrintButton());
        buttonsEl.appendChild(makeExportJsonButton());
        buttonsEl.appendChild(makeRestartButton());
    } else {
        buttonsEl.appendChild(makeNextButton());
    }

    section.appendChild(questionFrag);
    drawMermaid(tree);
    lastRenderedNodeId = current;
}


// Generate Mermaid source code from the tree
function mermaidSource(tree, pathHistory, {useMarkdownLabels = true} = {}) {
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
        // Keep labels Mermaid-safe across versions; older bundles may not support markdown labels.
        const clean = String(txt || "").replace(/`/g, "'").replace(/\r?\n/g, " ").replace(/"/g, '\\"');
        const label = useMarkdownLabels ? `\`${clean}\`` : clean;
        switch (shape) {
            case "round":
                return `${id}("${label}")`;
            case "circle":
                return `${id}(("${label}"))`;
            case "stadium":
                return `${id}(["${label}"])`;
            case "subroutine":
                return `${id}[[${label}]]`;
            case "cylinder":
                return `${id}[("${label}")]`;
            case "diamond":
            case "rhombus":
                return `${id}{${label}}`;
            case "hex":
                return `${id}{{${label}}}`;
            case "asymmetric":
                return `${id}>${label}]`;
            case "parallelogram":
                return `${id}[/"${label}"/]`;
            case "trapezoid":
                return `${id}[/\"${label}\"\\]`;
            default:
                return `${id}["${label}"]`;
        }
    }

    function visit(id) {
        if (visitedNodes.has(id)) return;
        visitedNodes.add(id);

        const n = tree[id];
        const isEnd = !!n.end;

        // Defaulting logic:
        // - explicit n.shape wins
        // - start and end nodes -> stadium
        // - everything else -> rectangle
        const shape = n.shape || ((id === "start" || isEnd) ? "stadium" : "rect");

        nodeLines.push(drawNode(id, n.q, shape));

        // Highlight current and visited nodes, except on the intro page where the start node should not be highlighted
        if (id === current && !(isIntroDiagram && id === "start")) {
            classLines.push(`class ${id} current`);
        } else if (historySet.has(id) && !(isIntroDiagram && id === "start")) {
            classLines.push(`class ${id} visited`);
        }

        // End nodes also get the "outcome" look, in addition to current/visited if applicable
        if (isEnd) {
            classLines.push(`class ${id} outcome`);
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
        edgeLines.push(`linkStyle ${[...visitedEdges].join(",")} stroke:#0056b4,stroke-width:3px;`);
    }

    classLines.push(
        "classDef current fill:#e6f0ff,stroke:#0056b4,stroke-width:3px,color:#00347d,font-weight:700",
        "classDef visited fill:#f3fcf5,stroke:#06893a,stroke-width:2px,color:#005519",
        "classDef outcome fill:#fff7e6,stroke:#a35a00,stroke-width:2px,color:#4a2900"
    );

    return `graph TD\n${nodeLines.join("\n")}\n${edgeLines.join("\n")}\n${classLines.join("\n")}`;
}

// Build { tree, exportedAt, steps, result } from the full answer path and download it as JSON
function exportAnswersAsJson() {
    if (!tree) return;

    const steps = [];
    for (let i = 0; i < pathHistory.length - 1; i++) {
        const nodeId = pathHistory[i];
        const nextId = pathHistory[i + 1];
        const n = tree[nodeId];
        const match = (n.options || []).find(([, opt]) => opt && opt.next === nextId);
        const opt = match ? match[1] : null;
        steps.push({
            question: n["step-title"] || n.q,
            answer: opt ? opt.label : null,
            note: getNote(nodeId) || null
        });
    }

    const finalId = pathHistory[pathHistory.length - 1];
    const finalNode = tree[finalId] || {};
    const data = {
        tree: tree.title || "",
        exportedAt: new Date().toISOString(),
        serviceName: (introMeta && introMeta.serviceName) || null,
        contactPerson: (introMeta && introMeta.contactPerson) || null,
        steps,
        result: finalNode["step-title"] || finalNode.q || null
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {type: "application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "beslutt-svar.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Wire the "Vis beslutningsdiagram" expander. Collapsed by default; re-runs mermaid on open
// since it was hidden (display:none) while collapsed and may not have sized itself correctly.
function initDiagramToggle() {
    const toggleBtn = document.getElementById("diagram-toggle");
    const card = document.getElementById("diagram-card");
    const content = document.getElementById("diagram-content");
    if (!toggleBtn || !card || !content) return;

    toggleBtn.addEventListener("click", () => {
        const opening = !card.classList.contains("navds-expansioncard--open");
        card.classList.toggle("navds-expansioncard--open", opening);
        content.classList.toggle("navds-expansioncard__content--closed", !opening);
        content.setAttribute("aria-hidden", String(!opening));
        toggleBtn.setAttribute("aria-expanded", String(opening));
        if (opening) drawMermaid(tree);
    });
}

// Point "Åpne diagrammet" at a standalone HTML document holding a copy of the current SVG,
// so it's a real, navigable link (native semantics: works with ctrl/cmd-click, "open in new
// tab", copy link, etc.) rather than a JS-triggered popup.
let diagramLinkUrl = null;

function updateDiagramOpenLink(svg) {
    const link = document.getElementById("diagram-open-new-tab");
    if (!link || !svg) return;

    const title = (tree && typeof tree.title === "string" && tree.title.trim()) || window.TREE_TITLE || "Beslutningsdiagram";
    const doc = document.implementation.createHTMLDocument(title);
    doc.documentElement.lang = "no";
    const charsetMeta = doc.createElement("meta");
    charsetMeta.setAttribute("charset", "UTF-8");
    doc.head.insertBefore(charsetMeta, doc.head.firstChild);
    doc.body.style.margin = "0";
    doc.body.style.padding = "1rem";
    doc.body.style.boxSizing = "border-box";
    doc.body.appendChild(svg.cloneNode(true));

    const html = "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
    const blob = new Blob([html], {type: "text/html;charset=utf-8"});

    if (diagramLinkUrl) URL.revokeObjectURL(diagramLinkUrl);
    diagramLinkUrl = URL.createObjectURL(blob);
    link.href = diagramLinkUrl;
}

// Render the Mermaid diagram
async function drawMermaid(tree) {
    const el = document.getElementById('mermaid-container');
    if (!el) return;

    // Hvis mermaid ikke er tilgjengelig enda, bare hopp over / prøv igjen senere hvis du vil.
    if (typeof window.mermaid === "undefined") {
        return;
    }

    // Mermaid trenger et synlig (ikke display:none) element for å beregne kantpunkter riktig.
    // Diagrammet er skjult som standard; initDiagramToggle() tegner det når kortet åpnes.
    const card = document.getElementById('diagram-card');
    if (card && !card.classList.contains('navds-expansioncard--open')) {
        return;
    }

    try {
        el.textContent = mermaidSource(tree, pathHistory, {useMarkdownLabels: true});
        el.removeAttribute("data-processed");
        await mermaid.run({nodes: [el]});
    } catch (markdownErr) {
        try {
            console.warn("Mermaid render failed with markdown labels, retrying without markdown labels.", markdownErr);
            el.textContent = mermaidSource(tree, pathHistory, {useMarkdownLabels: false});
            el.removeAttribute("data-processed");
            await mermaid.run({nodes: [el]});
        } catch (fallbackErr) {
            console.error("Mermaid render failed.", fallbackErr);
            el.textContent = "Kunne ikke tegne beslutningsdiagrammet.";
            el.removeAttribute("data-processed");
            return;
        }
    }

    updateDiagramOpenLink(el.querySelector("svg"));
}


initDiagramToggle();
init();
