const results = document.getElementById("results");
const frame = document.getElementById("runner");
const [html, runtime, example, radioTree] = await Promise.all([
    fetch("../tree.html").then((response) => response.text()),
    fetch("../scripts/render-tree.js").then((response) => response.text()),
    fetch("../data/checkbox-example.json").then((response) => response.json()),
    fetch("../data/rolle.json").then((response) => response.json())
]);
let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (!condition) throw new Error(message);
}

function equal(actual, expected, message) {
    assert(JSON.stringify(actual) === JSON.stringify(expected),
        `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

async function waitFor(check, message) {
    for (let i = 0; i < 200; i++) {
        if (check()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out: ${message}`);
}

async function test(name, run) {
    const item = document.createElement("li");
    try {
        await run();
        item.textContent = `PASS: ${name}`;
        passed++;
    } catch (error) {
        item.textContent = `FAIL: ${name}: ${error.message}`;
        failed++;
        console.error(name, error);
    }
    results.appendChild(item);
}

async function load(candidate = example) {
    const fixture = structuredClone(candidate);
    const doc = new DOMParser().parseFromString(html, "text/html");
    const base = doc.createElement("base");
    base.href = new URL("../", location.href).href;
    doc.head.prepend(base);
    const script = doc.querySelector('script[src="scripts/render-tree.js"]');
    script.removeAttribute("src");
    script.textContent = runtime.replace(/init\(\);\s*$/, `
        treeId = ${JSON.stringify(fixture.id)};
        canonicalTreeId = treeId;
        window.TREE_FILE = "test-fixture";
        window.fetch = async () => ({ok: true, json: async () => (${JSON.stringify(fixture)})});
        window.testRunner = {
            exportAnswersAsJson,
            answersEqual,
            source: () => mermaidSource(tree, pathHistory),
            state: () => structuredClone({selectedByNode, committedByNode, pathHistory, committedPath, notes})
        };
        loadTree();
    `);
    await new Promise((resolve) => {
        frame.onload = resolve;
        frame.srcdoc = "<!DOCTYPE html>\n" + doc.documentElement.outerHTML;
    });
    await waitFor(() => frame.contentWindow.testRunner &&
        (frame.contentDocument.querySelector("#intro-service-name") ||
            frame.contentDocument.querySelector("#question").textContent.includes("Ugyldig spørsmålskonfigurasjon")),
    "runner loaded");
    return frame.contentWindow.testRunner;
}

const query = (selector) => frame.contentDocument.querySelector(selector);
const all = (selector) => [...frame.contentDocument.querySelectorAll(selector)];
const state = () => frame.contentWindow.testRunner.state();
const checked = () => all("#question fieldset input:checked").map((input) => input.value);
const summary = () => query("#path").textContent;

function button(text) {
    const match = all("#question button").find((element) => element.textContent.trim() === text);
    assert(match, `Missing button: ${text}`);
    match.click();
}

function enter(selector, value) {
    const input = query(selector);
    assert(input, `Missing field: ${selector}`);
    input.value = value;
    input.dispatchEvent(new frame.contentWindow.Event("input", {bubbles: true}));
}

function choose(id) {
    const input = all("#question fieldset input").find((element) => element.value === id);
    assert(input, `Missing choice: ${id}`);
    input.click();
}

function note(value) {
    enter("#question textarea", value);
}

function start() {
    enter("#intro-service-name", "Checkbox regression test");
    button("Start");
}

function finish() {
    choose("yes");
    note("Follow-up note");
    button("Neste steg");
    choose("yes");
    note("Review note");
    button("Neste steg");
    assert(frame.contentDocument.body.classList.contains("end"), "Reached final assessment");
}

function backToStart() {
    button("Forrige steg");
    button("Forrige steg");
    button("Forrige steg");
}

async function exported() {
    const win = frame.contentWindow;
    let blob;
    const create = win.URL.createObjectURL;
    const click = win.HTMLAnchorElement.prototype.click;
    win.URL.createObjectURL = (value) => {
        blob = value;
        return create.call(win.URL, value);
    };
    win.HTMLAnchorElement.prototype.click = function () {};
    try {
        win.testRunner.exportAnswersAsJson();
        assert(blob, "Export created a Blob");
        return JSON.parse(await blob.text());
    } finally {
        win.URL.createObjectURL = create;
        win.HTMLAnchorElement.prototype.click = click;
    }
}

await test("Required selection and note errors appear only after Next and clear independently", async () => {
    await load();
    start();
    assert(!query("#error-summary") && !query("[aria-invalid]"), "No premature errors");
    button("Neste steg");
    assert(query("#error-summary") === frame.contentDocument.activeElement, "ErrorSummary receives focus");
    equal(all("#error-summary a").length, 2, "Selection and note errors");
    const input = query('input[type="checkbox"]');
    assert(input.getAttribute("aria-invalid") === "true", "Checkbox marked invalid");
    const errorId = input.getAttribute("aria-describedby");
    assert(frame.contentDocument.getElementById(errorId), "Error is associated with checkbox");
    equal(query("#error-summary a").getAttribute("href"), "#legend-start", "Summary targets legend");
    choose("a");
    equal(all("#error-summary a").length, 1, "Note error remains");
    choose("a");
    equal(all("#error-summary a").length, 2, "Removing last selection restores error after Next");
    choose("a");
    note("Required note");
    assert(!query("#error-summary") && !query("[aria-invalid]"), "All errors cleared");
    button("Neste steg");
    equal(state().pathHistory, ["start", "details"], "One ordinary selection route");
    equal(state().committedByNode.start, ["a"], "Committed checkbox array");
    button("Forrige steg");
    note("");
    button("Neste steg");
    button("Tilbake til start");
    start();
    choose("b");
    assert(!query("#error-summary") && !query("[aria-invalid]"), "Intro return resets validation attempt");
});

await test("Multiple choices, native labels and exclusivity in both directions", async () => {
    await load();
    start();
    const inputs = all('input[type="checkbox"]');
    assert(inputs.every((input) => input.labels.length === 1 && input.labels[0].htmlFor === input.id),
        "Every native checkbox has an associated label");
    inputs[0].labels[0].click();
    choose("b");
    equal(checked(), ["a", "b"], "Several ordinary choices");
    choose("none");
    equal(checked(), ["none"], "Exclusive choice clears ordinary choices");
    choose("c");
    equal(checked(), ["c"], "Ordinary choice clears exclusive choice");
    choose("none");
    note("None applies");
    button("Neste steg");
    equal(state().pathHistory, ["start", "alternative"], "Configured exclusive routing");
    assert(summary().includes("Ingen av disse") && !summary().includes("Ingen formål gjelder."),
        "Summary shows actual choice, not route label");
});

await test("Multiple selected labels, notes, JSON export and print source", async () => {
    await load();
    start();
    choose("a");
    choose("b");
    note("Purpose note");
    button("Neste steg");
    finish();
    equal(all("#path .navds-form-summary__answer ul li").map((item) => item.textContent),
        ["Formål A", "Formål B"], "All selected labels in shared screen/print summary");
    assert(summary().includes("Purpose note") && summary().includes("Follow-up note"), "Notes included");
    const data = await exported();
    equal(data.steps[0], {
        question: "Bruksområder", answer: ["Formål A", "Formål B"],
        choiceIds: ["a", "b"], routingOption: "matching", note: "Purpose note"
    }, "Checkbox export");
    equal(data.steps[1], {
        question: "Oppfølging", answer: "Formålene følges opp.", note: "Follow-up note"
    }, "Radio export format unchanged");
    let printed = false;
    frame.contentWindow.print = () => { printed = true; };
    query("#answers-print-btn").click();
    assert(printed, "Print button invokes browser print");
});

await test("Unchanged back/forward and restoring an unordered set preserve the completed suffix", async () => {
    await load();
    start();
    choose("a");
    choose("b");
    note("Purpose note");
    button("Neste steg");
    finish();
    backToStart();
    equal(checked(), ["a", "b"], "Selections restored on Back");
    equal(state().committedPath, ["start", "details", "review", "done"], "Completed path retained");
    assert(frame.contentWindow.testRunner.answersEqual(["a", "b"], ["b", "a"]),
        "Checkbox comparison ignores ID order");
    choose("a");
    choose("b");
    choose("b");
    choose("a");
    button("Neste steg");
    equal(checked(), ["yes"], "Follow-up answer preserved after restoring same set");
    equal(query("textarea").value, "Follow-up note", "Follow-up note preserved");
    button("Neste steg");
    equal(checked(), ["yes"], "Later answer preserved");
    equal(query("textarea").value, "Review note", "Later note preserved");
    button("Neste steg");
    equal((await exported()).steps[0].choiceIds, ["a", "b"], "Export in choice declaration order");
    assert(frame.contentWindow.testRunner.state().committedByNode.start.length === 2, "Committed array preserved");
});

await test("Only successful Next with a changed checkbox answer invalidates downstream state", async () => {
    await load();
    start();
    choose("a");
    note("Original note");
    button("Neste steg");
    finish();
    backToStart();
    choose("b");
    note("");
    button("Neste steg");
    equal(state().committedByNode.start, ["a"], "Failed Next does not commit");
    assert(state().committedByNode.details && state().notes.review, "Failed Next preserves suffix");
    note("Updated purpose note");
    button("Neste steg");
    equal(checked(), [], "Same-route answer change clears next answer");
    equal(query("textarea").value, "", "Same-route change clears next note");
    assert(!state().committedByNode.review && !state().notes.review, "Later committed answer and note removed");
    const stored = JSON.parse(frame.contentWindow.localStorage.getItem("beslutt:checkbox-example:notes"));
    assert(!stored.details && !stored.review, "Persisted abandoned notes removed");
});

await test("Changing branches clears rejoined answers and cannot resurrect the abandoned branch", async () => {
    await load();
    start();
    choose("a");
    note("Purpose");
    button("Neste steg");
    finish();
    backToStart();
    choose("none");
    button("Neste steg");
    choose("yes");
    button("Neste steg");
    equal(checked(), [], "Rejoined review has no stale answer");
    equal(query("textarea").value, "", "Rejoined review has no stale note");
    button("Forrige steg");
    button("Forrige steg");
    choose("a");
    button("Neste steg");
    equal(checked(), [], "Abandoned details answer not resurrected");
    equal(query("textarea").value, "", "Abandoned details note not resurrected");
});

await test("Back discards uncommitted checkbox edits, including first answers and intro return", async () => {
    await load();
    start();
    choose("b");
    button("Tilbake til start");
    start();
    equal(checked(), [], "First uncommitted selection discarded");
    choose("a");
    note("Saved purpose");
    button("Neste steg");
    finish();
    backToStart();
    choose("none");
    button("Tilbake til start");
    start();
    equal(checked(), ["a"], "Committed selection restored after intro return");
    button("Neste steg");
    equal(checked(), ["yes"], "Downstream answer preserved");
    choose("no");
    button("Forrige steg");
    button("Neste steg");
    equal(checked(), ["yes"], "Radio draft discarded on Back");
    button("Neste steg");
    equal(checked(), ["yes"], "Later answer also preserved");
});

await test("Back discards a checkbox draft on a later question", async () => {
    const candidate = structuredClone(example);
    candidate.details = structuredClone(candidate.start);
    candidate.details.note.required = false;
    candidate.details.options.matching.next = "review";
    candidate.details.options.none.next = "review";
    await load(candidate);
    start();
    choose("a");
    note("Purpose");
    button("Neste steg");
    choose("b");
    button("Forrige steg");
    button("Neste steg");
    equal(checked(), [], "Uncommitted first answer on later checkbox discarded");
    choose("b");
    button("Neste steg");
    button("Forrige steg");
    choose("none");
    button("Forrige steg");
    button("Neste steg");
    equal(checked(), ["b"], "Later checkbox restored to committed selection");
});

await test("A note-only edit saves the new note without invalidating later answers or notes", async () => {
    await load();
    start();
    choose("a");
    note("Original note");
    button("Neste steg");
    finish();
    backToStart();
    note("Edited note only");
    button("Neste steg");
    equal(checked(), ["yes"], "Next answer remains");
    equal(query("textarea").value, "Follow-up note", "Next note remains");
    button("Neste steg");
    equal(checked(), ["yes"], "Later answer remains");
    equal(query("textarea").value, "Review note", "Later note remains");
    button("Neste steg");
    equal((await exported()).steps[0].note, "Edited note only", "Updated note exported");
    assert(summary().includes("Edited note only"), "Updated note in screen and print source");
});

await test("Outputs never resolve checkbox or radio selections from uncommitted drafts", async () => {
    await load();
    start();
    choose("a");
    note("Purpose");
    button("Neste steg");
    finish();
    backToStart();
    choose("none");
    note("");
    button("Neste steg");
    const api = frame.contentWindow.testRunner;
    const draftState = state();
    equal(draftState.committedByNode.start, ["a"], "Checkbox commitment unchanged");
    const source = api.source();
    assert(!source.includes("linkStyle "), "Active path has no completed edges");
    equal((await exported()).steps, [], "Retained suffix not exported");
    assert(!summary().includes("Ingen av disse"), "Draft absent from summary");
    note("Purpose");
    choose("a");
    button("Neste steg");
    choose("no");
    const data = await exported();
    equal(data.steps.length, 1, "Current uncommitted question not exported");
    equal(data.steps[0].answer, ["Formål A"], "Completed checkbox still uses committed selection");
    assert(!summary().includes("Formålene følges ikke opp."), "Radio draft absent from summary");
    assert(api.source().includes("linkStyle "), "Only completed committed route highlighted");
});

await test("Changed radio answers intentionally invalidate the suffix, even with the same destination", async () => {
    await load();
    start();
    choose("a");
    note("Purpose");
    button("Neste steg");
    finish();
    button("Forrige steg");
    button("Forrige steg");
    choose("no");
    assert(state().committedByNode.review, "Radio draft has not invalidated suffix");
    button("Neste steg");
    equal(checked(), [], "Changed radio answer clears rejoined review");
    equal(query("textarea").value, "", "Changed radio answer clears review note");
});

await test("Plain-text labels and checkbox questions without an exclusive choice", async () => {
    const candidate = structuredClone(example);
    candidate.start.choices = [{id: "plain", label: "<b>Literal label</b>"}];
    delete candidate.start.routing.exclusiveSelected;
    await load(candidate);
    start();
    assert(!query("fieldset label b"), "Label markup not parsed");
    assert(query("fieldset label").textContent.includes("<b>Literal label</b>"), "Literal label shown");
    choose("plain");
    note("Purpose");
    button("Neste steg");
    assert(!query("#path b"), "Summary markup not parsed");
    equal((await exported()).steps[0].answer, ["<b>Literal label</b>"], "Literal label exported");
});

await test("Actual Mermaid renders routing outcomes and highlights only the selected parallel outcome", async () => {
    const candidate = structuredClone(example);
    candidate.start.options.none.next = "details";
    await load(candidate);
    start();
    choose("none");
    note("Purpose");
    button("Neste steg");
    const source = frame.contentWindow.testRunner.source();
    equal((source.match(/start -->\|/g) || []).length, 2, "Two outcome edges, not four choice edges");
    const edgeLines = source.split("\n").filter((line) => line.includes(" -->|"));
    const selectedIndex = edgeLines.findIndex((line) => line.includes("start -->|Ingen formål|"));
    assert(source.includes(`linkStyle ${selectedIndex} `), "Only selected routing key highlighted");
    query("#diagram-toggle").click();
    await waitFor(() => query("#mermaid-container svg") &&
        query("#diagram-open-new-tab").getAttribute("href")?.startsWith("blob:"), "Mermaid SVG rendered");
    assert(!query("#mermaid-container .error-icon"), "No Mermaid error diagram");
    assert(query("#mermaid-container svg").textContent.includes("Ingen formål"), "Outcome label rendered");
});

await test("Restart clears editable answers, commitments, paths and notes", async () => {
    await load();
    start();
    choose("a");
    note("Purpose");
    button("Neste steg");
    finish();
    button("Start på nytt");
    const reset = state();
    equal(reset.selectedByNode, {}, "Editable answers reset");
    equal(reset.committedByNode, {}, "Committed answers reset");
    equal(reset.committedPath, ["start"], "Committed path reset");
    equal(reset.pathHistory, ["start"], "Navigation path reset");
    equal(reset.notes, {}, "Notes reset");
    start();
    equal(checked(), [], "Checkboxes reset");
    equal(query("textarea").value, "", "Note reset");
});

for (const [name, mutate] of [
    ["nonexistent ordinary routing key", (tree) => { tree.start.routing.anySelectedExceptExclusive = "missing"; }],
    ["nonexistent exclusive routing key", (tree) => { tree.start.routing.exclusiveSelected = "missing"; }],
    ["missing ordinary routing", (tree) => { delete tree.start.routing.anySelectedExceptExclusive; }],
    ["missing exclusive routing", (tree) => { delete tree.start.routing.exclusiveSelected; }],
    ["multiple exclusive choices", (tree) => { tree.start.choices[0].exclusive = true; }],
    ["duplicate choice IDs", (tree) => { tree.start.choices[1].id = "a"; }],
    ["empty choices", (tree) => { tree.start.choices = []; }],
    ["missing label", (tree) => { delete tree.start.choices[0].label; }],
    ["invalid exclusive flag", (tree) => { tree.start.choices[0].exclusive = "true"; }],
    ["no ordinary choices", (tree) => { tree.start.choices = [tree.start.choices[3]]; }],
    ["nonexistent destination", (tree) => { tree.start.options.none.next = "missing"; }],
    ["unsupported answer type", (tree) => { tree.start.answerType = "select"; }]
]) {
    await test(`Malformed configuration rejected: ${name}`, async () => {
        const candidate = structuredClone(example);
        mutate(candidate);
        await load(candidate);
        assert(query("#question").textContent.includes('Ugyldig spørsmålskonfigurasjon i "start"'),
            "Visible error identifies invalid node");
        assert(!query("#intro-service-name"), "Invalid tree cannot start");
    });
}

await test("Existing radio-only tree preserves rendering, summary, notes and export format", async () => {
    await load(radioTree);
    start();
    assert(!query('input[type="checkbox"]') && all('input[type="radio"]').length === 2,
        "Existing radios unchanged");
    choose("no");
    button("Tilbake til start");
    start();
    equal(checked(), [], "Uncommitted radio at intro discarded");
    choose("yes");
    note("Radio note");
    button("Neste steg");
    assert(frame.contentDocument.body.classList.contains("end"), "Original radio route");
    assert(summary().includes(radioTree.start.options.yes.label), "Original radio label");
    const data = await exported();
    equal(data.steps, [{
        question: radioTree.start["step-title"], answer: radioTree.start.options.yes.label, note: "Radio note"
    }], "Original radio step shape");
    equal(data.tree.governance, radioTree.governance, "Governance unchanged");
    button("Forrige steg");
    equal(checked(), ["yes"], "Committed radio restored");
});

document.getElementById("status").textContent = `${passed} passed, ${failed} failed`;
document.body.dataset.testResult = failed ? "failed" : "passed";
