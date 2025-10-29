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
    let entry = { title: treeId, file: `${treeId}.json` };

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

    // Build the path
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
        section.innerHTML = "<p role=\"alert\">Fant ikke noden i treet. Dataene kan være ugyldige.</p>";
        // Clear diagram to avoid stale content
        const diagramEl = document.getElementById("mermaid-container");
        if (diagramEl) {
            diagramEl.textContent = "";
            diagramEl.removeAttribute("data-processed");
        }
        return;
    }

    // Build the question & help box
    const question = document.createElement("h2");
    const wrapper = document.createElement("div");

    wrapper.className = "question-wrapper";
    question.id = "question";
    question.setAttribute("tabindex", "-1");
    question.textContent = node.q;



    // Make a print button
    function makePrintButton() {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "navds-button navds-button--primary navds-button--medium print";
        btn.innerHTML = "<span class='navds-button__icon'></span><span class='navds-label'>Skriv ut resultatet</span>";
        btn.addEventListener("click", () => window.print());
        return btn;
    }

    // Add checkbox and print button when finishing the flow
    if (node.end) {
        question.classList.add("final-result");
        pathSection.appendChild(makePrintButton());
    }

    wrapper.appendChild(question);

    if (typeof node.help === "string" && node.help.trim() !== "") {
        const helpBox = document.createElement("p");
        helpBox.className = "help-box";
        helpBox.innerHTML = node.help;
        wrapper.appendChild(helpBox);
    }

    section.appendChild(wrapper);


    // Build the button wrapper
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
            msg.className = "free-text-hint";
            msg.textContent = "Ingen valg tilgjengelig for denne noden.";
            wrapper.appendChild(msg);

        } else {

            const fieldset = document.createElement("fieldset");
            fieldset.className = "navds-fieldset";
            fieldset.setAttribute("role", "radiogroup");
            const legend = document.createElement("legend");
            const legendId = `legend-${current}`;
            legend.id = legendId;
            legend.className = "navds-fieldset__legend navds-label";
            legend.textContent = "Velg et alternativ";
            fieldset.setAttribute("aria-labelledby", legendId);
            fieldset.appendChild(legend);
            const groupEl = document.createElement("div");
            groupEl.className = "navds-radio-buttons";
            fieldset.appendChild(groupEl);

            let selectedNext = "";
            const groupName = `opt-${current}`;
            const optErrId = `opt-err-${current}`;

            optionEntries.forEach(([key, option], idx) => {
                if (!option) return;
                const id = `${groupName}-${idx}`;
                const radioWrap = document.createElement("div");
                radioWrap.className = "navds-radio";

                const input = document.createElement("input");
                input.type = "radio";
                input.className = "navds-radio__input";
                input.name = groupName;
                input.id = id;
                input.value = key;
                input.addEventListener("change", () => {
                    selectedNext = option.next;
                    // Clear any previous error state on selection
                    const errEl = fieldset.querySelector(`#${optErrId}`);
                    if (errEl) {
                        errEl.remove();
                    }
                    fieldset.removeAttribute("aria-invalid");
                    const prev = fieldset.getAttribute("aria-describedby") || "";
                    const list = prev.split(" ").filter(x => x && x !== optErrId);
                    if (list.length) fieldset.setAttribute("aria-describedby", list.join(" "));
                    else fieldset.removeAttribute("aria-describedby");
                });

                const label = document.createElement("label");
                label.className = "navds-radio__label";
                label.setAttribute("for", id);
                label.textContent = option.buttonText || key;

                radioWrap.appendChild(input);
                radioWrap.appendChild(label);
                groupEl.appendChild(radioWrap);
            });

            wrapper.appendChild(fieldset);

            // Create Next button
            const nextBtn = document.createElement("button");
            nextBtn.type = "button";
            nextBtn.innerHTML = "<span class='navds-label'>Neste</span>";
            nextBtn.className = "navds-button navds-button--primary navds-button--medium";
            nextBtn.addEventListener("click", () => {
                // Require an option selection; show accessible error on the radio group
                if (!selectedNext) {
                    if (!fieldset.querySelector(`#${optErrId}`)) {
                        const err = document.createElement("p");
                        err.className = "navds-error-message navds-label navds-error-message--show-icon";
                        err.id = optErrId;

                        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                        svg.setAttribute("viewBox", "0 0 17 16");
                        svg.setAttribute("fill", "none");
                        svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
                        svg.setAttribute("focusable", "false");
                        svg.setAttribute("aria-hidden", "true");
                        const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
                        path.setAttribute("fill-rule", "evenodd");
                        path.setAttribute("clip-rule", "evenodd");
                        path.setAttribute("d", "M3.49209 11.534L8.11398 2.7594C8.48895 2.04752 9.50833 2.04743 9.88343 2.75924L14.5073 11.5339C14.8582 12.1998 14.3753 13 13.6226 13H4.37685C3.6242 13 3.14132 12.1999 3.49209 11.534ZM9.74855 10.495C9.74855 10.9092 9.41276 11.245 8.99855 11.245C8.58433 11.245 8.24855 10.9092 8.24855 10.495C8.24855 10.0808 8.58433 9.74497 8.99855 9.74497C9.41276 9.74497 9.74855 10.0808 9.74855 10.495ZM9.49988 5.49997C9.49988 5.22383 9.27602 4.99997 8.99988 4.99997C8.72373 4.99997 8.49988 5.22383 8.49988 5.49997V7.99997C8.49988 8.27611 8.72373 8.49997 8.99988 8.49997C9.27602 8.49997 9.49988 8.27611 9.49988 7.99997V5.49997Z");
                        path.setAttribute("fill", "currentColor");
                        svg.appendChild(path);
                        err.appendChild(svg);
                        err.appendChild(document.createTextNode("Du må velge et alternativ før du kan gå videre."));
                        fieldset.appendChild(err);
                    }
                    fieldset.setAttribute("aria-invalid", "true");
                    const prev = fieldset.getAttribute("aria-describedby") || "";
                    const list = prev.split(" ").filter(Boolean);
                    if (!list.includes(optErrId)) list.push(optErrId);
                    fieldset.setAttribute("aria-describedby", list.join(" "));
                    // Focus the first radio for convenience
                    const firstRadio = fieldset.querySelector(`input[type="radio"][name="${groupName}"]`);
                    if (firstRadio) firstRadio.focus();
                    return;
                }

                // If note is required, enforce before proceeding
                if (node.note?.required) {
                    const val = getNote(current);
                    if (!val.trim()) {
                        // Show error and focus
                        const fieldWrap = section.querySelector(".free-text-field");
                        if (fieldWrap && !fieldWrap.querySelector(".free-text-error")) {
                            const errId = `err-${current}`;
                            const err = document.createElement("div");
                            err.className = "free-text-error";
                            err.id = errId;
                            err.textContent = "Dette feltet er obligatorisk.";
                            fieldWrap.appendChild(err);
                        }
                        const input = section.querySelector(`#note-${current}`);
                        if (input) {
                            input.setAttribute("aria-invalid", "true");
                            const prevDescribed = input.getAttribute("aria-describedby") || "";
                            let list = prevDescribed.split(" ").filter(Boolean);
                            const errId = `err-${current}`;
                            const maxId = `maxlen-${current}`;
                            if (!list.includes(errId)) {
                                list.push(errId);
                            }
                            // Ensure the max-length note id is always last in the list
                            list = list.filter(x => x !== maxId);
                            list.push(maxId);
                            input.setAttribute("aria-describedby", list.join(" "));
                            input.focus();
                        }
                        return;
                    }
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

    // Place the free-text field between the fieldset (options) and the buttons
    if (node.note && node.note.label && node.note.label.trim() !== "") {
        const {label, hint, required} = node.note;
        const fieldId = `note-${current}`;
        const hintId = `hint-${current}`;
        const maxId = `maxlen-${current}`;

        const fieldWrap = document.createElement("div");
        fieldWrap.className = "free-text-field";

        const lab = document.createElement("label");
        lab.setAttribute("for", fieldId);
        lab.textContent = label;
        if (required) lab.textContent += " (påkrevd)";
        fieldWrap.appendChild(lab);

        if (hint) {
            const hintEl = document.createElement("div");
            hintEl.className = "free-text-hint";
            hintEl.id = hintId;
            hintEl.textContent = hint;
            fieldWrap.appendChild(hintEl);
        }

        const input = document.createElement("textarea");
        input.className = "free-text-input";
        input.id = fieldId;
        input.maxLength = MAX_NOTE_LEN;
        input.value = getNote(current);
        // aria-describedby: include hint first (if any), then max length note at the end
        const described = [];
        if (hint) described.push(hintId);
        described.push(maxId);
        if (described.length) input.setAttribute("aria-describedby", described.join(" "));
        if (required) {
            input.required = true;
            input.setAttribute("aria-required", "true");
        }

        input.addEventListener("input", () => {
            setNote(current, input.value);
            const err = fieldWrap.querySelector(".free-text-error");
            if (err && input.value.trim()) {
                const errId = err.id;
                err.remove();
                input.removeAttribute("aria-invalid");
                const prev = input.getAttribute("aria-describedby") || "";
                const list = prev.split(" ").filter(x => x && x !== errId);
                if (list.length) input.setAttribute("aria-describedby", list.join(" "));
                else input.removeAttribute("aria-describedby");
            }
        });

        fieldWrap.appendChild(input);
        // Add the visible max length note under the text field
        const maxNote = document.createElement("div");
        maxNote.className = "free-text-maxlen";
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
