// Bookshelf — fetches content.json + keywords.json and renders cards

const CONTENT_URL   = '../data/content.json';
const KEYWORDS_URL  = '../data/keywords.json';

const TYPE_LABELS = {
    'fragment':     '断片',
    'essay':        '論考',
    'project-note': '企画ノート',
    'work':         '作品',
};

let allContents  = [];
let allKeywords  = {};
let currentFilter = new URLSearchParams(window.location.search).get('category') || 'all';
let searchQuery   = '';

async function init() {
    console.log("Initializing bookshelf...");
    try {
        const [contentRes, keywordRes] = await Promise.all([
            fetch(CONTENT_URL),
            fetch(KEYWORDS_URL),
        ]);
        if (contentRes.ok) {
            allContents = await contentRes.json();
            console.log("Loaded contents:", allContents.length);
        } else {
            console.error("Failed to load content.json", contentRes.status);
        }
        if (keywordRes.ok) {
            allKeywords = await keywordRes.json();
            console.log("Loaded keywords.");
        }
    } catch (e) {
        console.error('Failed to load data:', e);
    }

    const loader = document.getElementById('loading-state');
    if (loader) loader.classList.add('hidden');
    
    setupControls();
    renderGrid();
}

function setupControls() {
    // Category deep links from the LP
    if (!['all','fragment','essay','project-note','work'].includes(currentFilter)) currentFilter='all';
    // Filter buttons
    const filterBtns = document.querySelectorAll('.filter-btn');
    if (filterBtns.length > 0) {
        filterBtns.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === currentFilter);
            btn.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentFilter = btn.dataset.filter;
                const url = new URL(window.location.href);
                if (currentFilter === 'all') url.searchParams.delete('category');
                else url.searchParams.set('category',currentFilter);
                window.history.replaceState(null,'',url);
                renderGrid();
            });
        });
    }

    // Search
    const searchInput = document.getElementById('shelf-search');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            searchQuery = searchInput.value.toLowerCase().trim();
            renderGrid();
        });
    }
}

function renderGrid() {
    const grid  = document.getElementById('bookshelf-grid');
    const empty = document.getElementById('empty-state');
    grid.innerHTML = '';

    const filtered = allContents.filter(item => {
        const matchType = currentFilter === 'all' || item.type === currentFilter;

        const titleMatch = item.title && item.title.toLowerCase().includes(searchQuery);
        const descMatch  = item.description && item.description.toLowerCase().includes(searchQuery);
        const kwMatch    = (item.keywords || []).some(kid => {
            const kw = allKeywords[kid];
            return kw && (kw.label.includes(searchQuery) || (kw.reading && kw.reading.includes(searchQuery)));
        });
        const matchSearch = !searchQuery || titleMatch || descMatch || kwMatch;

        return matchType && matchSearch;
    });

    if (filtered.length === 0) {
        grid.classList.add('hidden');
        empty.classList.remove('hidden');
        return;
    }

    grid.classList.remove('hidden');
    empty.classList.add('hidden');

    filtered.forEach(item => {
        const card = buildCard(item);
        grid.appendChild(card);
    });
}

function buildCard(item) {
    const typeLabel = TYPE_LABELS[item.type] || item.type;
    const kwTags = (item.keywords || [])
        .slice(0, 4)
        .map(kid => {
            const kw = allKeywords[kid];
            return kw ? `<span class="card-kw-tag">${kw.label}</span>` : '';
        }).join('');

    const target = item.url
        ? item.url
        : item.slug
            ? `../contentsviewer/index.html?slug=${encodeURIComponent(item.slug)}`
            : null;

    const tag = target ? 'a' : 'div';
    const card = document.createElement(tag);
    card.className = 'shelf-card';
    if (target) {
        card.href = target;
        if (item.url) card.target = '_blank';
    }

    card.innerHTML = `
        <span class="card-type type-${item.type}">${typeLabel}</span>
        <p class="card-title">${item.title}</p>
        ${item.description ? `<p class="card-description">${item.description}</p>` : ''}
        <div class="card-keywords">${kwTags}</div>
    `;

    return card;
}

init();
