// Load decision tree from external JSON file instead of hardcoding
let tree = {};
let history = ["start"];

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
    const ul = document.createElement("ul");
    pathSection.innerHTML = "";
    section.innerHTML = "";


// Build the label path, skipping the first node (no label led to 'start')
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

    const question = document.createElement("h2");
    question.id = "question";
    question.setAttribute("tabindex", "-1");
    question.textContent = node.q;
    section.appendChild(question);

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

    for (const option of Object.values(node.options)) {
        const btn = document.createElement("button");
        btn.textContent = option.buttonText;
        btn.onclick = () => {
            history.push(option.next);
            render();
        };
        section.appendChild(btn);
    }

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

document.addEventListener("DOMContentLoaded", loadTree);
