let tree = {};
let pathHistory = ["start"];
let interacted = false;

const NOTES_KEY = (treeId) => `beslutt:${treeId}:notes`;
const MAX_NOTE_LEN = 1000;

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
    box.setAttribute("role", "alert");
    box.setAttribute("aria-live", "polite");
    box.tabIndex = -1;

    const heading = document.createElement("div");
    heading.className = "navds-error-summary__heading navds-heading";
    heading.textContent = "Det er feil i skjemaet";
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

    // error container under radio list
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
        const msg = makeAkselErrorMessage(NOTE_ERR_ID, "Dette feltet er obligatorisk.");
        fieldWrap.insertBefore(msg, taWrap.nextSibling);
    }

    // ARIA only; no focus shift here
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

    pathSection.innerHTML = "";
    section.innerHTML = "";

    // Build the path the user has taken through the tree as an unordered list
    const ul = document.createElement("ul");
    for (let i = 1; i < pathHistory.length; i++) {
        const prevId = pathHistory[i - 1];
        const prevNode = tree[prevId];
        if (!prevNode) continue;
        const nextKey = pathHistory[i];

        let option;

        if (Array.isArray(prevNode.options)) {
            const hit = prevNode.options.find(([, opt]) => opt && opt.next === nextKey);
            option = hit && hit[1];
        }

        if (option && option.label) {
            const li = document.createElement("li");
            li.textContent = option.label;

            // If the previous node had a note, render it under the label
            if (prevNode.note) {
                const txt = getNote(prevId);
                if (txt && txt.trim()) {
                    const noteP = document.createElement("p");
                    noteP.appendChild(document.createTextNode(txt));
                    li.appendChild(noteP);
                }
            }

            ul.appendChild(li);
        }
    }

    pathSection.appendChild(ul);


    const current = pathHistory[pathHistory.length - 1];
    const node = tree[current];

    if (!node) {
        section.innerHTML = "<p>Fant ikke noden i treet. Dataene kan være ugyldige.</p>";
        // Clear diagram to avoid stale content
        const diagramEl = document.getElementById("mermaid-container");
        if (diagramEl) {
            diagramEl.textContent = "";
            diagramEl.removeAttribute("data-processed");
        }
        return;
    }

    // Check if we're at an end node and if so add a "Konklusjon" section
    if (node.end) {
        const conclusionHeading = document.createElement("h3");
        conclusionHeading.textContent = "Konklusjon";
        pathSection.appendChild(conclusionHeading);

        const conclusionParagraph = document.createElement("p");
        conclusionParagraph.textContent = node.q || "Ingen konklusjon angitt.";
        pathSection.appendChild(conclusionParagraph);
    }

    const question = document.createElement("h2");
    const wrapper = document.createElement("div");

    wrapper.className = "question-wrapper";
    question.id = "question";
    question.setAttribute("tabindex", "-1");
    question.textContent = node.q;

    function makePrintButton() {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "navds-button navds-button--primary navds-button--medium print";
        btn.innerHTML = "<span class='navds-button__icon'></span><span class='navds-label'>Skriv ut resultatet</span>";
        btn.addEventListener("click", () => window.print());
        return btn;
    }

    if (node.end) {
        question.classList.add("final-result");
        pathSection.appendChild(makePrintButton());
    }

    wrapper.appendChild(question);

    if (typeof node.help === "string" && node.help.trim() !== "") {
        const helpBox = document.createElement("p");
        helpBox.innerHTML = node.help;
        wrapper.appendChild(helpBox);
    }

    section.appendChild(wrapper);


    // Build the nav buttons
    const btnRow = document.createElement("div");
    btnRow.className =
        "navds-stack navds-hstack navds-stack-gap navds-stack-direction navds-stack-wrap";
    btnRow.id = "buttons";
    btnRow.style.setProperty("--__ac-stack-gap-xs", "var(--a-spacing-4)");

    // Put buttons in the wrapper
    if (node.end) {
        // Restart button (primary)
        const restart = document.createElement("button");
        restart.innerHTML = "<span class='navds-label'>Start på nytt</span>";
        restart.className = "navds-button navds-button--secondary navds-button--medium";
        restart.onclick = () => {
            pathHistory = ["start"];
            interacted = false;
            localStorage.removeItem(NOTES_KEY(treeId));
            notes = {};
            render();
        };
        btnRow.appendChild(restart);
    } else {

        const optionEntries = Array.isArray(node.options) ? node.options : [];

        if (optionEntries.length === 0) {
            const msg = document.createElement("div");
            msg.className = "navds-hint-text";
            msg.textContent = "Ingen valg tilgjengelig for denne noden.";
            wrapper.appendChild(msg);

        } else {

            const fieldset = document.createElement("fieldset");
            fieldset.className = "navds-radio-group navds-radio-group--medium navds-fieldset navds-fieldset--medium";
            fieldset.setAttribute("role", "radiogroup");

            const legend = document.createElement("legend");
            const legendId = `legend-${current}`;
            legend.setAttribute("tabindex", "-1")
            legend.id = legendId;
            legend.className = "navds-fieldset__legend navds-label";
            legend.textContent = "Velg et alternativ (obligatorisk)";
            fieldset.appendChild(legend);

            const groupEl = document.createElement("div");
            groupEl.className = "navds-radio-buttons";
            fieldset.appendChild(groupEl);

            let selectedNext = "";
            const groupName = `opt-${current}`;
// Use Aksel-like id for fieldset error container
            const optErrId = `fieldset-error-${current}`;

            optionEntries.forEach(([key, option], idx) => {
                if (!option) return;
                const id = `${groupName}-${idx}`;
                const radioWrap = document.createElement("div");
                radioWrap.className = "navds-radio navds-radio--medium";

                const input = document.createElement("input");
                input.type = "radio";
                input.className = "navds-radio__input";
                input.name = groupName;
                input.id = id;
                input.value = key;

                input.addEventListener("change", () => {
                    selectedNext = option.next;

                    // --- Clear group error state on selection
                    clearOptionError(fieldset, optErrId);
                });

                const label = document.createElement("label");
                label.className = "navds-radio__label";
                label.setAttribute("for", id);
                label.innerHTML = `<span class="navds-radio__content"><span class="navds-body-short navds-body-short--medium">${option.buttonText || key}</span></span>`;

                radioWrap.appendChild(input);
                radioWrap.appendChild(label);
                groupEl.appendChild(radioWrap);
            });

            wrapper.appendChild(fieldset);


            // Create Next button
            const nextBtn = document.createElement("button");
            nextBtn.type = "button";
            nextBtn.innerHTML = "<span class='navds-label'>Neste steg</span>";
            nextBtn.className = "navds-responsive navds-responsive__above--sm navds-button navds-button--primary navds-button--medium";
            nextBtn.setAttribute("data-variant", "primary");

            nextBtn.addEventListener("click", () => {
                const errors = [];

                // Textarea required
                if (node.note?.required && !getNote(current).trim()) {
                    showNoteError(current, section);
                    errors.push({
                        text: "Fyll ut den obligatoriske begrunnelsen.",
                        href: `#note-${current}`,
                    });
                }

                // Radio required
                if (!selectedNext) {
                    showOptionError(fieldset, groupName, optErrId);
                    errors.push({
                        text: "Velg et alternativ.",
                        href: `#legend-${current}`,
                    });
                }

                if (errors.length) {
                    createErrorSummary(wrapper, errors);
                    return;
                } else {
                    clearErrorSummary(wrapper);
                }

                pathHistory.push(selectedNext);
                render();
            });


            btnRow.appendChild(nextBtn);
        }


    }

    // Back button
    if (pathHistory.length > 1) {
        const backBtn = document.createElement("button");
        backBtn.innerHTML = "<span class='navds-label'>Tilbake</span>";
        backBtn.className = "navds-button navds-button--tertiary navds-button--medium";
        backBtn.onclick = () => {
            pathHistory.pop();
            render();
        };

        btnRow.appendChild(backBtn);
    }

    // Only control focus after user interaction
    if (interacted) question.focus();
    interacted = true;

    // Free-text field between the radio-fieldset and the nav buttons
    if (node.note && node.note.label && node.note.label.trim() !== "") {
        const {label, hint, required} = node.note;
        const fieldId = `note-${current}`;
        const hintId = `hint-${current}`;
        const maxId = `maxlen-${current}`;

        // Wrapper for textarea stuff
        const fieldWrap = document.createElement("div");
        fieldWrap.className = "navds-form-field free-text-field";

        const lab = document.createElement("label");
        lab.setAttribute("for", fieldId);
        lab.className = "navds-label";
        lab.textContent = label + (required ? " (obligatorisk)" : " (valgfritt)");
        fieldWrap.appendChild(lab);

        if (hint) {
            const hintEl = document.createElement("div");
            hintEl.className = "navds-hint-text";
            hintEl.id = hintId;
            hintEl.textContent = hint;
            fieldWrap.appendChild(hintEl);
        }

        // ⚠️ This wrapper is what we’ll toggle with --error and insert the error message after
        const taWrap = document.createElement("div");
        taWrap.className = "navds-textarea";
        taWrap.id = `ta-wrap-${current}`;

        const input = document.createElement("textarea");
        input.className = "navds-textarea__input";
        input.id = fieldId;
        input.maxLength = MAX_NOTE_LEN;
        input.value = getNote(current);
        const described = [];
        if (hint) described.push(hintId);
        described.push(maxId);
        input.setAttribute("aria-describedby", described.join(" "));
        if (required) input.required = true;

        taWrap.appendChild(input);
        fieldWrap.appendChild(taWrap);

// clear note-error on input
        const NOTE_ERR_ID = `note-err-${current}`;
        input.addEventListener("input", () => {
            setNote(current, input.value);
            const err = fieldWrap.querySelector(`#${NOTE_ERR_ID}`);
            if (err && input.value.trim()) {
                err.remove();
                input.removeAttribute("aria-invalid");
                taWrap.classList.remove("navds-textarea--error");

                const prev = input.getAttribute("aria-describedby") || "";
                const list = prev.split(" ").filter(x => x && x !== NOTE_ERR_ID);
                input.setAttribute("aria-describedby", list.join(" "));
            }
        });


        // Max-length note
        const maxNote = document.createElement("div");
        maxNote.className = "navds-hint-text";
        maxNote.id = maxId;
        maxNote.textContent = `Maks ${MAX_NOTE_LEN} tegn.`;
        fieldWrap.appendChild(maxNote);

        wrapper.appendChild(fieldWrap);
    }

    section.appendChild(btnRow);
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
