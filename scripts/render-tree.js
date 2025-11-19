let tree = {};
let pathHistory = ["start"];
let interacted = false;

const NOTES_KEY = (treeId) => `beslutt:${treeId}:notes`;
const MAX_NOTE_LEN = 1000;

// Set up HTML template rendering
function cloneTemplate(id) {
    const tmpl = document.getElementById(id);
    if (!tmpl) {
        console.error(`Mangler template med id=${id}`);
        return document.createDocumentFragment();
    }
    return tmpl.content.cloneNode(true);
}


function getNote(nodeId) {
    return notes[nodeId] || "";
}

function setNote(nodeId, value) {
    const trimmed = (value ?? "").trim();
    notes[nodeId] = trimmed.length > MAX_NOTE_LEN ? trimmed.slice(0, MAX_NOTE_LEN) : trimmed;
    localStorage.setItem(NOTES_KEY(treeId), JSON.stringify(notes));
}

function normalizeTreeOptions(treeObj) {
    const sortPairs = (optionsObj) =>
        Object.entries(optionsObj || {}).sort((a, b) => {
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

function clearErrorSummary(wrapperEl) {
    const old = wrapperEl.querySelector("#error-summary");
    if (old) old.remove();
}

function createErrorSummary(wrapperEl, items) {
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

    items.forEach(({ text, href }) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.className = "navds-link";
        a.href = href;
        a.textContent = text;
        li.appendChild(a);
        list.appendChild(li);
    });

    box.appendChild(list);
    wrapperEl.insertBefore(box, wrapperEl.firstChild);
    box.focus();
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
    fieldset.classList.add(
        "navds-radio-group", "navds-radio-group--medium",
        "navds-fieldset", "navds-fieldset--medium", "navds-fieldset--error"
    );
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
            if (list.length) input.setAttribute("aria-describedby", list.join(" "));
            else input.removeAttribute("aria-describedby");
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
    const base = prev.split(" ").filter(Boolean).filter(x => x !== NOTE_ERR_ID && x !== maxId);
    input.setAttribute("aria-describedby", [NOTE_ERR_ID, ...base, maxId].join(" "));
}

let treeId = "";
let notes = {};

async function init() {
    // Figure out which tree we're loading based on the URL params
    const params = new URLSearchParams(window.location.search);
    treeId = params.get("id");

    if (!treeId) {
        document.body.innerHTML =
            "<p>No <code>id</code> query-parameter was supplied.</p>";
        throw new Error("Missing ?id=");
    }

    // Resolve catalog entry
    let entry = {title: treeId, file: `${treeId}.json`};

    try {
        const catalog = await fetch("data/trees.json").then(r => r.json());
        const match = catalog.find(t => t.id === treeId);
        if (match) entry = match;
    } catch (_) {
        console.warn("No catalog – falling back to", entry.file);
    }

    window.TREE_FILE = `data/${entry.file}`;
    window.TREE_TITLE = entry.title;
    document.title = entry.title;
    const h1 = document.getElementById("tree-name");
    if (h1) h1.textContent = entry.title;

    // Initialize notes from storage after we know the tree id
    notes = JSON.parse(localStorage.getItem(NOTES_KEY(treeId)) || "{}");

    await loadTree();
}

async function loadTree() {
    try {

        const response = await fetch(window.TREE_FILE);
        if (!response.ok) throw new Error("Could not load decision tree");

        tree = await response.json();
        normalizeTreeOptions(tree);
        render();

    } catch (e) {
        console.error("Failed to load tree:", e);
        const treeEl = document.getElementById("tree");
        if (treeEl) treeEl.innerHTML = "<p>Kunne ikke laste beslutningstreet.</p>";
        const diagramEl = document.getElementById("mermaid-container");
        if (diagramEl) {
            diagramEl.textContent = "";
            diagramEl.removeAttribute("data-processed");
        }
    }
}

function render() {
    const headerEl = document.getElementById("tree-name");
    if (headerEl) {
        const customTitle = (tree && typeof tree.title === "string") ? tree.title.trim() : "";
        headerEl.textContent = customTitle || window.TREE_TITLE;
    }

    const section = document.getElementById("tree");
    const pathSection = document.getElementById("path");

    if (!section || !pathSection) {
        console.error("Mangler #tree og/eller #path i DOM-en");
        return;
    }

    // Reset view
    section.innerHTML = "";
    pathSection.innerHTML = "";

    // 1) Bygg stien (kan være enklere enn du har i dag; tilpass om du vil)
    const pathList = document.createElement("ul");
    pathList.className = "navds-list navds-list--unordered";

    pathHistory.forEach((nodeId, idx) => {
        const n = tree[nodeId];
        if (!n) return;
        const li = document.createElement("li");
        li.className = "navds-list__item";

        const txt = [];
        if (n.q) txt.push(n.q);
        if (idx < pathHistory.length - 1 && Array.isArray(n.options)) {
            // finn valgt alternativ (helt valgfritt å vise)
            const nextId = pathHistory[idx + 1];
            const opt = n.options.find(([, o]) => o && o.next === nextId);
            if (opt) {
                const [, o] = opt;
                txt.push(`→ ${o.buttonText || ""}`.trim());
            }
        }
        li.textContent = txt.join(" ");
        pathList.appendChild(li);
    });

    pathSection.appendChild(pathList);

    // 2) Finn gjeldende node
    const current = pathHistory[pathHistory.length - 1];
    const node = tree[current];

    if (!node) {
        const err = document.createElement("p");
        err.className = "navds-body-long";
        err.textContent = "Fant ikke dette steget i beslutningstreet.";
        section.appendChild(err);
        return;
    }

    // 3) Bygg spørsmåls-UI fra template
    const questionFrag = cloneTemplate("question-template");
    const wrapper = questionFrag.querySelector(".question-wrapper");
    const questionEl = questionFrag.querySelector(".question-text");
    const helpEl = questionFrag.querySelector(".question-help");
    const noteContainer = questionFrag.querySelector(".note-container");
    const buttonsEl = questionFrag.querySelector(".buttons");

    if (!wrapper || !questionEl || !buttonsEl) {
        console.error("Template question-template mangler forventede elementer");
        section.appendChild(questionFrag);
        return;
    }

    questionEl.textContent = node.q || "";

    if (node.end) {
        questionEl.classList.add("final-result");
    }

    if (typeof node.help === "string" && node.help.trim()) {
        // hjelp-tekst kan være HTML
        helpEl.innerHTML = node.help;
    } else {
        helpEl.remove();
    }

    // 4) Radio-gruppe (alternativer)
    let fieldset = null;
    let selectedNext = null;

    if (!node.end && Array.isArray(node.options) && node.options.length > 0) {
        const fieldsetFrag = cloneTemplate("radio-group-template");
        fieldset = fieldsetFrag.querySelector("fieldset");
        const legend = fieldsetFrag.querySelector("legend");
        const radioContainer = fieldsetFrag.querySelector(".navds-radio-buttons");

        const groupName = `opt-${current}`;
        const optErrId = `fieldset-error-${current}`;

        if (legend) {
            legend.id = `legend-${current}`;
            legend.textContent = "Velg et alternativ (obligatorisk)";
        }

        node.options.forEach(([key, opt], idx) => {
            if (!opt) return;
            const optFrag = cloneTemplate("radio-option-template");
            const wrap = optFrag.querySelector(".navds-radio");
            const input = optFrag.querySelector("input");
            const labelSpan = optFrag.querySelector(".navds-body-short");

            if (!wrap || !input || !labelSpan) return;

            const id = `${groupName}-${idx}`;
            input.id = id;
            input.name = groupName;
            input.value = key;

            // buttonText kan inneholde enkel HTML
            labelSpan.innerHTML = opt.buttonText || key;

            input.addEventListener("change", () => {
                selectedNext = opt.next;
                if (typeof clearOptionError === "function") {
                    clearOptionError(fieldset, optErrId);
                }
            });

            radioContainer.appendChild(optFrag);
        });

        wrapper.appendChild(fieldsetFrag);
    }

    // 5) Notat-felt fra template
    if (node.note && node.note.label) {
        const { label, hint, required } = node.note;
        const noteFrag = cloneTemplate("note-template");
        const fieldWrap = noteFrag.querySelector(".navds-form-field");
        const labelEl = noteFrag.querySelector("label");
        const hintEl = noteFrag.querySelector(".hint");
        const textarea = noteFrag.querySelector("textarea");
        const maxEl = noteFrag.querySelector(".maxlen");

        const fieldId = `note-${current}`;
        const hintId = `hint-${current}`;
        const maxId = `maxlen-${current}`;

        if (labelEl) {
            labelEl.setAttribute("for", fieldId);
            labelEl.textContent = label + (required ? " (obligatorisk)" : " (valgfritt)");
        }

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
                // hvis du har egen clearNoteError, kall den her
            });
        }

        if (maxEl) {
            maxEl.id = maxId;
            maxEl.textContent = `Maks ${MAX_NOTE_LEN} tegn.`;
        }

        if (fieldWrap) {
            noteContainer.appendChild(noteFrag);
        }
    }

    // 6) Knapper (bruk gjerne eksisterende hjelpefunksjoner, bare endre signatur hvis nødvendig)
    function makeNextButton() {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "navds-button navds-button--primary navds-button--medium";
        btn.innerHTML = "<span class='navds-label'>Neste</span>";

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            interacted = true;

            if (node.end) return;

            if (!selectedNext) {
                if (fieldset && typeof showOptionError === "function") {
                    const groupName = `opt-${current}`;
                    const optErrId = `fieldset-error-${current}`;
                    showOptionError(fieldset, groupName, optErrId);
                }
                // og error summary hvis du har det fra før
                return;
            }

            pathHistory.push(selectedNext);
            render();
        });

        return btn;
    }

    function makeBackButton() {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "navds-button navds-button--tertiary navds-button--medium";
        btn.innerHTML = "<span class='navds-label'>Tilbake</span>";

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
        btn.className = "navds-button navds-button--primary navds-button--medium";
        btn.innerHTML = "<span class='navds-label'>Start på nytt</span>";

        btn.addEventListener("click", (e) => {
            e.preventDefault();
            pathHistory = ["start"];
            interacted = false;
            // nullstill notater for dette treet hvis du vil
            localStorage.removeItem(NOTES_KEY(treeId));
            notes = {};
            render();
        });

        return btn;
    }

    if (node.end) {
        buttonsEl.appendChild(makeRestartButton());
    } else {
        buttonsEl.appendChild(makeNextButton());
    }
    if (pathHistory.length > 1) {
        buttonsEl.appendChild(makeBackButton());
    }

    // 7) Legg inn spørsmålet i seksjonen
    section.appendChild(questionFrag);

    // 8) Tegn mermaid-grafen som før
    drawMermaid(tree);
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
        if (!n) return;
        nodeLines.push(drawNode(id, n.q, n.shape));

        if (id === current) {
            classLines.push(`class ${id} current`);
        } else if (historySet.has(id)) {
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
        edgeLines.push(
            `linkStyle ${[...visitedEdges].join(",")} stroke:#1844a3,stroke-width:2px;`
        );
    }

    classLines.push(
        "classDef current fill:#fff2b3,stroke:#333,stroke-width:3px",
        "classDef visited fill:#e6f0ff,stroke:#1844a3,stroke-width:2px"
    );

    return `graph TD\n${nodeLines.join("\n")}\n${edgeLines.join(
        "\n"
    )}\n${classLines.join("\n")}`;
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
