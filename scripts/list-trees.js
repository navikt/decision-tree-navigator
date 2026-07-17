// Aksel "ArrowRight" ikon (samme sti som brukes i tree.html sin primærknapp)
const ARROW_RIGHT_PATH = "M14.0878 6.87338C14.3788 6.68148 14.774 6.7139 15.0302 6.97006L19.5302 11.4701C19.6707 11.6107 19.7499 11.8015 19.7499 12.0003C19.7498 12.1991 19.6707 12.39 19.5302 12.5306L15.0302 17.0306C14.7739 17.2866 14.3788 17.3183 14.0878 17.1263C14.0462 17.0989 14.0062 17.0672 13.9696 17.0306C13.7133 16.7743 13.6817 16.3784 13.8739 16.0873C13.9013 16.0458 13.9331 16.0066 13.9696 15.9701L17.1893 12.7503H4.99988C4.58909 12.7503 4.25528 12.4196 4.24988 12.0101C4.24984 12.007 4.24988 12.0035 4.24988 12.0003C4.24988 11.5862 4.58572 11.2504 4.99988 11.2503H17.1893L13.9696 8.03061C13.7133 7.77433 13.6817 7.37837 13.8739 7.08725C13.9013 7.04583 13.9331 7.00655 13.9696 6.97006C14.0062 6.93345 14.0462 6.90084 14.0878 6.87338Z";

function createTreeCard({id, title, desc}) {
    const a = document.createElement('a');
    a.className = 'tree-card';

    const url = new URL('tree.html', window.location.href);
    url.searchParams.set('id', id);
    a.href = url.toString();

    const titleRow = document.createElement('span');
    titleRow.className = 'tree-card-row';

    const titleEl = document.createElement('span');
    titleEl.className = 'tree-card-title navds-heading navds-heading--small';
    titleEl.textContent = title;
    titleRow.appendChild(titleEl);

    const arrow = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    arrow.setAttribute('class', 'tree-card-arrow');
    arrow.setAttribute('width', '20');
    arrow.setAttribute('height', '20');
    arrow.setAttribute('viewBox', '0 0 24 24');
    arrow.setAttribute('fill', 'none');
    arrow.setAttribute('aria-hidden', 'true');
    const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    arrowPath.setAttribute('d', ARROW_RIGHT_PATH);
    arrowPath.setAttribute('fill', 'currentColor');
    arrow.appendChild(arrowPath);
    titleRow.appendChild(arrow);

    a.appendChild(titleRow);

    if (desc) {
        const descEl = document.createElement('span');
        descEl.className = 'navds-body-short navds-body-short--medium tree-card-desc';
        descEl.textContent = desc;
        a.appendChild(descEl);
    }

    return a;
}

async function loadList() {
    const nav = document.getElementById('tree-list');
    if (!nav) return;

    try {
        const res = await fetch('data/trees.json');
        const trees = await res.json();

        for (const tree of trees) {
            if (!tree.id || !tree.title) continue;
            nav.appendChild(createTreeCard(tree));
        }
    } catch (e) {
        console.error('Kunne ikke laste trees.json', e);
    }
}

loadList();