async function loadList () {
    const nav = document.getElementById('tree-list');
    const ul = document.createElement("ul");
    const trees = await fetch('../data/trees.json').then(r => r.json());

    trees.forEach(({ id, title }) => {
        const li = document.createElement('li');
        li.innerHTML = `<a href="tree.html?id=${encodeURIComponent(id)}">${title}</a>`;
        ul.appendChild(li);
    });

    nav.appendChild(ul);
}
loadList();