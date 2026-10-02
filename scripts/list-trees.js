// Aksel "ArrowRight" ikon (samme sti som brukes i tree.html sin primærknapp)
const ARROW_RIGHT_PATH = "M14.0878 6.87338C14.3788 6.68148 14.774 6.7139 15.0302 6.97006L19.5302 11.4701C19.6707 11.6107 19.7499 11.8015 19.7499 12.0003C19.7498 12.1991 19.6707 12.39 19.5302 12.5306L15.0302 17.0306C14.7739 17.2866 14.3788 17.3183 14.0878 17.1263C14.0462 17.0989 14.0062 17.0672 13.9696 17.0306C13.7133 16.7743 13.6817 16.3784 13.8739 16.0873C13.9013 16.0458 13.9331 16.0066 13.9696 15.9701L17.1893 12.7503H4.99988C4.58909 12.7503 4.25528 12.4196 4.24988 12.0101C4.24984 12.007 4.24988 12.0035 4.24988 12.0003C4.24988 11.5862 4.58572 11.2504 4.99988 11.2503H17.1893L13.9696 8.03061C13.7133 7.77433 13.6817 7.37837 13.8739 7.08725C13.9013 7.04583 13.9331 7.00655 13.9696 6.97006C14.0062 6.93345 14.0462 6.90084 14.0878 6.87338Z";

const SAFE_TREE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GOVERNANCE_STATUSES = new Set(['approved', 'draft', 'deprecated']);

function validateTree(tree, id) {
    if (!tree || typeof tree !== 'object' || Array.isArray(tree) ||
        tree.id !== id || typeof tree.title !== 'string' || !tree.title.trim() ||
        typeof tree.description !== 'string' ||
        typeof tree['intro-text'] !== 'string' ||
        !['governing', 'decision-support'].includes(tree.type)) {
        throw new Error(`Ugyldige metadata for beslutningstreet "${id}".`);
    }
    if (tree.type === 'governing' || tree.governance !== undefined) {
        const governance = tree.governance;
        if (!governance || typeof governance !== 'object' || Array.isArray(governance) ||
            !GOVERNANCE_STATUSES.has(governance.status) ||
            !['version', 'approvedBy', 'approvedDate'].every((key) => typeof governance[key] === 'string')) {
            throw new Error(`Ugyldige godkjenningsopplysninger for beslutningstreet "${id}".`);
        }
    }
}

function getTreeTypeLabel(tree) {
    if (tree.type === 'decision-support') return 'Beslutningsstøtte';
    const statusLabels = {
        approved: 'Godkjent',
        draft: 'Utkast',
        deprecated: 'Utgått'
    };
    return `Styrende · ${statusLabels[tree.governance.status]}`;
}

function createTreeCard(tree) {
    const a = document.createElement('a');
    a.className = 'tree-card';

    const url = new URL('tree.html', window.location.href);
    url.searchParams.set('id', tree.id);
    a.href = url.toString();

    const titleRow = document.createElement('span');
    titleRow.className = 'tree-card-row';

    const titleEl = document.createElement('span');
    titleEl.className = 'tree-card-title navds-heading navds-heading--small';
    titleEl.textContent = tree.title;
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

    const typeEl = document.createElement('span');
    typeEl.className = 'tree-card-type navds-label';
    typeEl.textContent = getTreeTypeLabel(tree);
    a.appendChild(typeEl);

    if (tree.description) {
        const descEl = document.createElement('span');
        descEl.className = 'navds-body-short navds-body-short--medium tree-card-desc';
        descEl.textContent = tree.description;
        a.appendChild(descEl);
    }

    return a;
}

async function loadList() {
    const governingNav = document.getElementById('governing-tree-list');
    const supportNav = document.getElementById('decision-support-tree-list');
    const otherGoverningNav = document.getElementById('other-governing-tree-list');
    if (!governingNav || !supportNav || !otherGoverningNav) return;

    function showError(type, message) {
        const errorEl = document.getElementById(type === 'decision-support' ? 'decision-support-tree-error' : 'governing-tree-error');
        errorEl.textContent = message;
        errorEl.hidden = false;
    }

    try {
        const response = await fetch('data/manifest.json');
        if (!response.ok) {
            console.error(`Kunne ikke laste manifest.json: HTTP ${response.status}`);
            showError('governing', 'Kunne ikke laste beslutningstrærne. Prøv å laste siden på nytt.');
            showError('decision-support', 'Kunne ikke laste beslutningstrærne. Prøv å laste siden på nytt.');
            return;
        }
        const treeIds = await response.json();
        if (!Array.isArray(treeIds)) {
            console.error('Ugyldig manifest.json: forventet en liste med tre-ID-er');
            showError('governing', 'Beslutningstrærne kunne ikke vises fordi listen over trær er ugyldig.');
            showError('decision-support', 'Beslutningstrærne kunne ikke vises fordi listen over trær er ugyldig.');
            return;
        }

        const entries = await Promise.all(treeIds.map(async (id) => {
            if (typeof id !== 'string' || !SAFE_TREE_ID.test(id)) {
                console.error('Ugyldig tre-ID i manifest.json', id);
                showError('governing', 'Ett eller flere beslutningstrær kunne ikke lastes fordi en tre-ID er ugyldig.');
                showError('decision-support', 'Ett eller flere beslutningstrær kunne ikke lastes fordi en tre-ID er ugyldig.');
                return null;
            }

            try {
                const treeResponse = await fetch(`data/${id}.json`);
                if (!treeResponse.ok) {
                    throw new Error(`Kunne ikke laste beslutningstreet "${id}": HTTP ${treeResponse.status}`);
                }
                const tree = await treeResponse.json();
                validateTree(tree, id);
                return tree;
            } catch (e) {
                console.error(`Kunne ikke laste beslutningstreet "${id}"`, e);
                showError('governing', 'Ett eller flere beslutningstrær kunne ikke lastes. Se konsollen for detaljer.');
                showError('decision-support', 'Ett eller flere beslutningstrær kunne ikke lastes. Se konsollen for detaljer.');
                return null;
            }
        }));

        entries.filter(Boolean).forEach((tree) => {
            const isApprovedGoverning = tree.type === 'governing' && tree.governance.status === 'approved';
            const list = tree.type === 'decision-support'
                ? supportNav
                : isApprovedGoverning ? governingNav : otherGoverningNav;
            list.appendChild(createTreeCard(tree));
        });
        document.getElementById('other-governing-trees').hidden = otherGoverningNav.childElementCount === 0;
    } catch (e) {
        console.error('Kunne ikke laste manifest.json', e);
        showError('governing', 'Kunne ikke laste beslutningstrærne. Prøv å laste siden på nytt.');
        showError('decision-support', 'Kunne ikke laste beslutningstrærne. Prøv å laste siden på nytt.');
    }
}

loadList();