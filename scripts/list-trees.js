async function loadList () {
    const nav = document.getElementById('tree-list');
    if (!nav) return;
    const ul = document.createElement("ul");
    try {
        const res = await fetch('data/trees.json');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const trees = await res.json();
        if (!Array.isArray(trees)) throw new Error("Ugyldig katalogformat");

        trees.forEach(({ id, title }) => {
            if (!id || !title) return;
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.textContent = title;
            const url = new URL('tree.html', window.location.href);
            url.searchParams.set('id', id);
            a.href = url.toString();
            li.appendChild(a);
            ul.appendChild(li);
        });
    } catch (e) {
        const err = document.createElement('p');
        err.setAttribute('role', 'alert');
        err.textContent = 'Kunne ikke laste listen over beslutningstrær.';
        nav.appendChild(err);
        return;
    }

    nav.appendChild(ul);
}
loadList();