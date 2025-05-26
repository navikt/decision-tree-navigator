
let tree = {};
let history = ["start"];
let interacted = false;

// Load decision tree from external JSON file instead of hardcoding
async function loadTree() {
    try {
        const response = await fetch("trees/tree.json");
        if (!response.ok) throw new Error("Could not load decision tree");
        tree = await response.json();
        render();
    } catch (e) {
        console.error("Failed to load tree:", e);
        document.getElementById("tree").innerHTML = "<p>Kunne ikke laste beslutningstreet.</p>";
    }
}

function render() {
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
    if (node.end) { question.classList.add("final-result"); }
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
        restart.textContent = "Start på nytt";
        restart.className = "navds-button navds-button--primary navds-button--medium";
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
            btn.textContent = option.buttonText;
            btn.className = "navds-button navds-button--primary navds-button--medium";
            btn.onclick = () => {
                history.push(option.next);
                render();
            };
            btnRow.appendChild(btn);
        }
    }

    /*  👇  Back button now lives outside the if/else so it shows up everywhere  */
    if (history.length > 1) {
        const backBtn = document.createElement("button");
        backBtn.textContent = "Tilbake";
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

    const visitedNodes = new Set(history);
    const current = history[history.length - 1];

    function visit(id) {
        const n = tree[id];
        const txt = n.q.replace(/"/g, '\\"').replace(/\n/g, " ");

        nodeLines.push(`${id}["${txt}"]`);

        if (id === current) {
            classLines.push(`class ${id} current`);
        } else if (visitedNodes.has(id)) {
            classLines.push(`class ${id} visited`);
        }

        if (!n.end) {
            Object.values(n.options).forEach(opt => {
                const label = opt.buttonText.replace(/"/g, '\\"');
                edgeNo += 1;
                edgeLines.push(`${id} -->|${label}| ${opt.next}`);

                // Mark edge as walked if it's part of the history
                if (history.some((h, i) => i && history[i - 1] === id && h === opt.next)) {
                    visitedEdges.add(edgeNo);
                }
                visit(opt.next);
            });
        }
    }

    visit("start");

    // Highlight walked edges
    if (visitedEdges.size) {
        edgeLines.push(
            `linkStyle ${[...visitedEdges].join(",")} stroke:#1844a3,stroke-width:2px;`
        );
    }

    classLines.push(
        "classDef current fill:#fff2b3,stroke:#333,stroke-width:3px",
        "classDef visited fill:#e6f0ff,stroke:#1844a3,stroke-width:2px"
    );

    return `graph TD\n${nodeLines.join("\n")}\n${edgeLines.join("\n")}\n${classLines.join("\n")}`;
}

// Render the Mermaid diagram
function drawMermaid(tree) {
    const el = document.getElementById('mermaid-container');
    el.textContent = mermaidSource(tree, history);
    el.removeAttribute("data-processed");
    mermaid.run({nodes: [el]});
}

document.addEventListener("DOMContentLoaded", loadTree);