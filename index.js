// Load decision tree from external JSON file instead of hardcoding
let tree = {};
let history = ["start"];
let interacted = false;

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

    // Build the question
    const question = document.createElement("h2");
    question.id = "question";
    question.setAttribute("tabindex", "-1");
    question.textContent = node.q;
    section.appendChild(question);

    // Build the button wrapper
    const btnRow = document.createElement("div");
    btnRow.className =
        "navds-stack navds-hstack navds-stack-gap navds-stack-direction navds-stack-wrap";
    /* give the utility its gap token */
    btnRow.style.setProperty("--__ac-stack-gap-xs", "var(--a-spacing-4)");

    // Put buttons in the wrapper
    if (node.end) {
        // Restart button
        const restart = document.createElement("button");
        restart.textContent = "Start på nytt";
        restart.className   = "navds-button navds-button--primary navds-button--medium";
        restart.onclick     = () => { history = ["start"]; interacted = false; render(); };
        btnRow.appendChild(restart);
    } else {
        // Answer buttons
        for (const option of Object.values(node.options)) {
            const btn = document.createElement("button");
            btn.textContent = option.buttonText;
            btn.className   = "navds-button navds-button--primary navds-button--medium";
            btn.onclick     = () => { history.push(option.next); render(); };
            btnRow.appendChild(btn);
        }
        // Back button
        if (history.length > 1) {
            const backBtn = document.createElement("button");
            backBtn.textContent = "Tilbake";
            backBtn.className   = "navds-button navds-button--tertiary navds-button--medium";
            backBtn.onclick     = () => { history.pop(); render(); };
            btnRow.appendChild(backBtn);
        }
    }

    // Only control focus after user interaction
    if (interacted) question.focus();
    interacted = true;

    section.appendChild(btnRow);

}


document.addEventListener("DOMContentLoaded", loadTree);
