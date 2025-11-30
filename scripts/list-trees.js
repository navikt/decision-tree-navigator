async function loadList() {
    const nav = document.getElementById('tree-list');
    if (!nav) return;

    try {
        const res = await fetch('data/trees.json');
        const trees = await res.json();

        const ul = document.createElement('ul');

        for (const {id, title} of trees) {
            if (!id || !title) continue;

            const li = document.createElement('li');
            const a = document.createElement('a');

            a.textContent = title;
            a.classList.add('navds-link');

            const url = new URL('tree.html', window.location.href);
            url.searchParams.set('id', id);
            a.href = url.toString();

            li.appendChild(a);
            ul.appendChild(li);
        }

        nav.appendChild(ul);
    } catch (e) {
        console.error('Kunne ikke laste trees.json', e);
    }
}

loadList();