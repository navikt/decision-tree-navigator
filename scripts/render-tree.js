let tree = {};
let history = ["start"];
let interacted = false;

// Figure out which tree we're loading based on the URL params
const params = new URLSearchParams(window.location.search);
const id = params.get("id");

console.log("[viewer] script loaded, id =", id);

if (!id) {
    document.body.innerHTML =
        "<p>No <code>id</code> query-parameter was supplied.</p>";
    throw new Error("Missing ?id=");
}


// Load the tree data
let entry = {title: id, file: `${id}.json`};

try {
    const catalog = await fetch("data/trees.json").then(r => r.json());
    const match = catalog.find(t => t.id === id);
    if (match) entry = match;
} catch (_) {
}

window.TREE_FILE = `data/${entry.file}`;
window.TREE_TITLE = entry.title;
document.title = entry.title;


// Load decision tree from external JSON file instead of hardcoding
async function loadTree() {
    try {

        const response = await fetch(window.TREE_FILE);
        if (!response.ok) throw new Error("Could not load decision tree");

        tree = await response.json();


        render();
    } catch (e) {
        console.error("Failed to load tree:", e);
        document.getElementById("tree").innerHTML = "<p>Kunne ikke laste beslutningstreet.</p>";
    }
}

function render() {

    document.getElementById("tree-name").textContent = window.TREE_TITLE;

    const section = document.getElementById("tree");
    const pathSection = document.getElementById("path");

    pathSection.innerHTML = "";
    section.innerHTML = "";

    // Build the path
    const ul = document.createElement("ul");
    for (let i = 1; i < history.length; i++) {
        const prevNode = tree[history[i - 1]];
        const nextKey = history[i];
        const option = Object.values(prevNode.options).find(opt => opt.next === nextKey);
        if (option && option.label) {
            const li = document.createElement("li");
            li.textContent = option.label;
            ul.appendChild(li);
        }
    }
    pathSection.appendChild(ul);


    const current = history[history.length - 1];
    const node = tree[current];

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

    if (node.help) {
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
            history = ["start"];
            interacted = false;
            render();
        };
        btnRow.appendChild(restart);
    } else {
        // Answer buttons
        for (const option of Object.values(node.options)) {
            const btn = document.createElement("button");
            const btnText = option.buttonText;
            btn.innerHTML = `<span class='navds-label'>${btnText}</span>`;
            btn.className = "navds-button navds-button--primary navds-button--medium";
            btn.onclick = () => {
                history.push(option.next);
                render();
            };
            btnRow.appendChild(btn);
        }
    }

    // Back button
    if (history.length > 1) {
        const backBtn = document.createElement("button");
        backBtn.innerHTML = "<span class='navds-label'>Tilbake</span>";
        backBtn.className = "navds-button navds-button--tertiary navds-button--medium";
        backBtn.onclick = () => {
            history.pop();
            render();
        };

        btnRow.appendChild(backBtn);
    }

    // Only control focus after user interaction
    if (interacted) question.focus();
    interacted = true;

    section.appendChild(btnRow);
    drawMermaid(tree);
}

// Generate Mermaid source code from the tree
function mermaidSource(tree, history) {
    const nodeLines = [];
    const edgeLines = [];
    const classLines = [];
    let edgeNo = -1;
    const visitedEdges = new Set();
    const visitedNodes = new Set();     // for traversal
    const historySet = new Set(history); // for styling
    const drawnEdges = new Set();
    const current = history[history.length - 1];

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
                return `${id}[/\\"${esc}\\"\\]`;
            default:
                return `${id}["${esc}"]`;
        }
    }

    function visit(id) {
        if (visitedNodes.has(id)) return;
        visitedNodes.add(id);

        const n = tree[id];
        nodeLines.push(drawNode(id, n.q, n.shape));

        if (id === current) {
            classLines.push(`class ${id} current`);
        } else if (historySet.has(id)) {
            classLines.push(`class ${id} visited`);
        }


        if (!n.end) {
            for (const opt of Object.values(n.options)) {
                const label = opt.buttonText.replace(/"/g, '\\"');
                const edgeKey = `${id}->${opt.next}`;

                if (!drawnEdges.has(edgeKey)) {
                    edgeNo++;
                    edgeLines.push(`${id} -->|${label}| ${opt.next}`);
                    drawnEdges.add(edgeKey);

                    // Highlight edge if it's part of the actual clicked path
                    if (history.some((h, i) => i && history[i - 1] === id && h === opt.next)) {
                        visitedEdges.add(edgeNo);
                    }
                }

                visit(opt.next);
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
    el.textContent = mermaidSource(tree, history);
    el.removeAttribute("data-processed");
    mermaid.run({nodes: [el]});
}

(async () => {

    const params = new URLSearchParams(location.search);
    const id = params.get("id");
    if (!id) {
        document.body.innerHTML =
            "<p>No <code>id</code> query-parameter was supplied.</p>";
        return;
    }

    let entry = {title: id, file: `${id}.json`};
    try {
        const r = await fetch("data/trees.json");
        if (r.ok) {
            const cat = await r.json();
            const m = cat.find(t => t.id === id);
            if (m) entry = m;
        }
    } catch (e) {
        console.warn("No catalog – falling back to", entry.file);
    }

    window.TREE_FILE = `data/${entry.file}`;
    window.TREE_TITLE = entry.title;
    document.title = entry.title;
    const h1 = document.getElementById("tree-name");
    if (h1) h1.textContent = entry.title;

    await loadTree();
})();
