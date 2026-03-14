// Haiku Universe Application Logic

// DOM Elements
const canvas = document.getElementById('network-canvas');
const detailPanel = document.getElementById('detail-panel');
const closePanelBtn = document.getElementById('close-panel');
const haikuView = document.getElementById('haiku-view');
const keywordView = document.getElementById('keyword-view');
const haikuTextEl = document.getElementById('haiku-text');
const haikuYearEl = document.getElementById('haiku-year');
const haikuNoteEl = document.getElementById('haiku-note');
const timeChainList = document.getElementById('time-chain-list');
const keywordTitleEl = document.getElementById('keyword-title');
const keywordHaikuList = document.getElementById('keyword-haiku-list');
const breadcrumbList = document.getElementById('breadcrumb-list');
const loadingOverlay = document.getElementById('loading');

// Start Screen Elements
const startScreen = document.getElementById('start-screen');
const startHaikuText = document.getElementById('start-haiku-text');
const startHaikuYear = document.getElementById('start-haiku-year');
const startRandomBtn = document.getElementById('start-random-btn');
const startEnterBtn = document.getElementById('start-enter-btn');

// List Overlay Elements
const showListBtn = document.getElementById('show-list-btn');
const haikuListOverlay = document.getElementById('haiku-list-overlay');
const closeListBtn = document.getElementById('close-list-btn');
const sortSelect = document.getElementById('sort-select');
const haikuVerticalList = document.getElementById('haiku-vertical-list');

// State
let haikus = [];
let keywords = [];
let contents = []; // content.json data
let network = null;
let nodesDataSet = null;
let edgesDataSet = null;
let historyLog = []; // { type: 'haiku' | 'keyword', id: string, name: string }
let currentStartHaiku = null;
let listTouchStartY = 0;
let listTouchStartScrollLeft = 0;

// Initialization
async function init() {
    try {
        const [haikuRes, keywordRes, contentRes] = await Promise.all([
            fetch('data/haiku.json'),
            fetch('data/keywords.json'),
            fetch('data/content.json').catch(() => ({ ok: false }))
        ]);
        
        haikus = await haikuRes.json();
        keywords = await keywordRes.json();
        if (contentRes.ok) {
            contents = await contentRes.json();
        }
        
        setupStartScreen();
        setupHaikuList();
        buildNetwork();
        
        // Deep link support: ?keyword=k0012 or ?haiku=h_001
        const urlParams = new URLSearchParams(window.location.search);
        const startKeywordId = urlParams.get('keyword');
        const startHaikuId = urlParams.get('haiku');
        
        if (startKeywordId || startHaikuId) {
            setTimeout(() => {
                window.enterUniverse(startKeywordId || startHaikuId);
            }, 800);
        }
    } catch (error) {
        console.error("Failed to load data:", error);
        loadingOverlay.innerHTML = '<p style="color:red;">データの読み込みに失敗しました。</p>';
    }
}

function setupStartScreen() {
    pickRandomStartHaiku();
    
    startRandomBtn.addEventListener('click', pickRandomStartHaiku);
    
    window.enterUniverse = (targetNodeId = null) => {
        startScreen.classList.add('hidden');
        if (targetNodeId) {
            setTimeout(() => {
                handleNodeClick(targetNodeId);
            }, 300);
        } else if (currentStartHaiku) {
            setTimeout(() => {
                handleNodeClick(`h_${currentStartHaiku.id}`);
            }, 300);
        }
    };

    startEnterBtn.addEventListener('click', () => window.enterUniverse());
    // Optionally allow clicking background to enter
    // startScreen.addEventListener('click', (e) => {
    //    if(e.target === startScreen) window.enterUniverse();
    // });
}

function getCurrentSeason() {
    const month = new Date().getMonth() + 1; // 1-12
    if (month >= 3 && month <= 5) return 'spring';
    if (month >= 6 && month <= 8) return 'summer';
    if (month >= 9 && month <= 11) return 'autumn';
    return 'winter'; // 12, 1, 2
}

function pickRandomStartHaiku() {
    if (haikus.length === 0) return;
    
    const currentSeason = getCurrentSeason();
    const currentYear = new Date().getFullYear();
    
    // Priority 1: Same season AND same year
    let candidates = haikus.filter(h => h.season === currentSeason && h.year === currentYear);
    // Priority 2: Same season AND year-1
    if (candidates.length === 0) {
        candidates = haikus.filter(h => h.season === currentSeason && h.year === currentYear - 1);
    }
    // Priority 3: Same season (any year)
    if (candidates.length === 0) {
        candidates = haikus.filter(h => h.season === currentSeason);
    }
    // Fallback: All haikus
    if (candidates.length === 0) {
        candidates = haikus;
    }
    
    console.log(`Season: ${currentSeason}, Candidates: ${candidates.length}`);
    const randIndex = Math.floor(Math.random() * candidates.length);
    currentStartHaiku = candidates[randIndex];
    
    let htmlText = currentStartHaiku.text;
    currentStartHaiku.keywords.forEach(kwId => {
        const kwData = keywords[kwId];
        if (kwData) {
            const searchTerms = [kwData.label];
            if (kwData.aliases && Array.isArray(kwData.aliases)) {
                searchTerms.push(...kwData.aliases);
            }
            // Sort by length desc to prevent partial matches replacing longer phrases
            searchTerms.sort((a, b) => b.length - a.length);
            const escapedTerms = searchTerms.map(t => t.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'));
            const regex = new RegExp(`(${escapedTerms.join('|')})`, 'g');
            htmlText = htmlText.replace(regex, `<span class="keyword-link" data-kw="${kwId}">$1</span>`);
        }
    });
    
    startHaikuText.innerHTML = htmlText;
    startHaikuYear.textContent = `${currentStartHaiku.year}年`;
    
    setTimeout(() => {
        startHaikuText.querySelectorAll('.keyword-link').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const kw = e.target.getAttribute('data-kw');
                window.enterUniverse(`kw_${kw}`);
            });
        });
    }, 50);
    
    // Simple reset animation
    startHaikuText.style.animation = 'none';
    void startHaikuText.offsetWidth; // trigger reflow
    startHaikuText.style.animation = 'fadeIn 1s ease forwards';
}

function buildNetwork() {
    nodesDataSet = new vis.DataSet();
    edgesDataSet = new vis.DataSet();
    
    // Calculate degree for each keyword (haiku count + content count)
    const kwHaikuDegrees = {};
    const kwContentDegrees = {};
    Object.keys(keywords).forEach(kw => {
        kwHaikuDegrees[kw] = 0;
        kwContentDegrees[kw] = 0;
    });
    haikus.forEach(h => {
        h.keywords.forEach(kw => {
            if (kwHaikuDegrees[kw] !== undefined) kwHaikuDegrees[kw]++;
        });
    });
    contents.forEach(c => {
        (c.keywords || []).forEach(kw => {
            if (kwContentDegrees[kw] !== undefined) kwContentDegrees[kw]++;
        });
    });

    const SCALE = 12; // Scale factor for coordinates
    function getRandomInRange(min, max) {
        return Math.random() * (max - min) + min;
    }
    
    // Add Keyword Nodes
    Object.keys(keywords).forEach(kwId => {
        const kwData = keywords[kwId];
        const haikuDeg = kwHaikuDegrees[kwId] || 0;
        const contentDeg = kwContentDegrees[kwId] || 0;
        const degree = haikuDeg + contentDeg;
        
        let r, theta;
        const isSeasonal = (kwData.kigo === 'yes' || !!kwData.season);
        let nodeColor = {
            background: 'rgba(197, 168, 128, 0.1)',
            border: '#c5a880',
            highlight: { background: 'rgba(197, 168, 128, 0.5)', border: '#fff' }
        };

        if (isSeasonal) {
            // Seasonal: 30 < r < 85
            r = getRandomInRange(30, 85) * SCALE;
            if (kwData.season === 'spring') {
                theta = getRandomInRange(0, Math.PI/2); // Q1
                nodeColor = { background: 'rgba(255, 183, 197, 0.1)', border: '#ffb7c5', highlight: { background: 'rgba(255, 183, 197, 0.5)', border: '#fff' } };
            } else if (kwData.season === 'summer') {
                theta = getRandomInRange(Math.PI/2, Math.PI); // Q2
                nodeColor = { background: 'rgba(96, 165, 250, 0.1)', border: '#60a5fa', highlight: { background: 'rgba(96, 165, 250, 0.5)', border: '#fff' } };
            } else if (kwData.season === 'winter') {
                theta = getRandomInRange(Math.PI, 3*Math.PI/2); // Q3
                nodeColor = { background: 'rgba(255, 255, 255, 0.1)', border: '#ffffff', highlight: { background: 'rgba(255, 255, 255, 0.5)', border: '#fff' } };
            } else if (kwData.season === 'autumn') {
                theta = getRandomInRange(3*Math.PI/2, 2*Math.PI); // Q4
                nodeColor = { background: 'rgba(251, 146, 60, 0.1)', border: '#fb923c', highlight: { background: 'rgba(251, 146, 60, 0.5)', border: '#fff' } };
            } else {
                theta = getRandomInRange(0, 2*Math.PI); // default
            }
        } else {
            // Non-seasonal
            if (degree > 1) {
                // High connectivity: inner circle r < 30
                r = getRandomInRange(0, 30) * SCALE;
            } else {
                // Low connectivity: outer circle r > 85
                r = getRandomInRange(85, 130) * SCALE;
            }
            theta = getRandomInRange(0, 2*Math.PI);
        }

        const x = r * Math.cos(theta);
        const y = -(r * Math.sin(theta)); // Invert Y so +MathY is visually Top

        nodesDataSet.add({
            id: `kw_${kwId}`,
            label: kwData.label,
            group: 'keyword',
            value: 15 + (degree * 4), // size weighted by haiku + content count
            x: x,
            y: y,
            physics: false, // keep keywords in their assigned locations
            font: { size: Math.min(24, 16 + degree), color: nodeColor.border, face: 'Noto Serif JP' },
            color: nodeColor
        });
    });

    // Add Haiku Nodes
    haikus.forEach(haiku => {
        nodesDataSet.add({
            id: `h_${haiku.id}`,
            label: '', // Empty initially, filled on hover
            group: 'haiku',
            value: 10,
            font: { size: 14, color: '#e0e6ed', face: 'Noto Serif JP' },
            color: {
                background: 'rgba(140, 155, 175, 0.4)',
                border: '#8c9baf',
                highlight: { background: '#fff', border: '#fff' }
            }
        });

        // Add Edges from Haiku to Keywords
        haiku.keywords.forEach(kwId => {
            if (keywords[kwId]) {
                edgesDataSet.add({
                    from: `h_${haiku.id}`,
                    to: `kw_${kwId}`,
                    color: { color: 'rgba(197, 168, 128, 0.15)', highlight: 'rgba(197, 168, 128, 0.8)' },
                    width: 1,
                    smooth: { type: 'continuous' }
                });
            }
        });
    });

    const data = { nodes: nodesDataSet, edges: edgesDataSet };
    const options = {
        nodes: {
            shape: 'dot',
            scaling: {
                min: 5,
                max: 30,
                label: { enabled: true, min: 10, max: 24 }
            }
        },
        physics: {
            forceAtlas2Based: {
                gravitationalConstant: -80,
                centralGravity: 0.005,
                springLength: 120,
                springConstant: 0.04
            },
            maxVelocity: 40,
            solver: 'forceAtlas2Based',
            timestep: 0.35,
            stabilization: {
                iterations: 150,
                updateInterval: 25
            }
        },
        interaction: {
            hover: true,
            tooltipDelay: 200,
            zoomView: true
        }
    };

    network = new vis.Network(canvas, data, options);

    // Events
    network.once('stabilizationIterationsDone', () => {
        loadingOverlay.classList.add('hidden');
        // Local network view: focus on the start haiku's first keyword
        if (currentStartHaiku && currentStartHaiku.keywords.length > 0) {
            const focusKw = currentStartHaiku.keywords[0];
            network.focus(`kw_${focusKw}`, {
                scale: 1.8,
                animation: { duration: 1500, easingFunction: 'easeInOutQuad' }
            });
        }
    });

    network.on('hoverNode', function (params) {
        if (params.node.startsWith('h_')) {
            const hId = params.node.replace('h_', '');
            const hk = haikus.find(h => h.id === hId);
            if (hk) {
                // Show full text as label when hovered
                nodesDataSet.update({id: params.node, label: hk.text});
            }
        }
    });

    network.on('blurNode', function (params) {
        if (params.node.startsWith('h_')) {
            // Remove full text label
            nodesDataSet.update({id: params.node, label: ''});
        }
    });

    network.on('click', (params) => {
        if (params.nodes.length > 0) {
            const nodeId = params.nodes[0];
            handleNodeClick(nodeId);
        } else {
            closePanel();
        }
    });

    // Close btn
    closePanelBtn.addEventListener('click', closePanel);
}

function handleNodeClick(nodeId) {
    // Focus node
    network.focus(nodeId, {
        scale: 1.2,
        animation: { duration: 1000, easingFunction: 'easeInOutQuad' }
    });

    if (nodeId.startsWith('kw_')) {
        const kw = nodeId.replace('kw_', '');
        showKeyword(kw);
        const kwLabel = keywords[kw] ? keywords[kw].label : kw;
        addToHistory('keyword', kw, kwLabel);
    } else if (nodeId.startsWith('h_')) {
        const hId = nodeId.replace('h_', '');
        showHaiku(hId);
        // Find haiku text for history
        const hk = haikus.find(h => h.id === hId);
        const namePreview = hk.text.split('\\n')[0].substring(0, 5) + '...';
        addToHistory('haiku', hId, namePreview);
    }
}

function showHaiku(id) {
    const haiku = haikus.find(h => h.id === id);
    if (!haiku) return;

    // Build text with clickable keywords
    let htmlText = haiku.text;
    // Replace labels and aliases with span links
    haiku.keywords.forEach(kwId => {
        const kwData = keywords[kwId];
        if (kwData) {
            const searchTerms = [kwData.label];
            if (kwData.aliases && Array.isArray(kwData.aliases)) {
                searchTerms.push(...kwData.aliases);
            }
            searchTerms.sort((a, b) => b.length - a.length);
            const escapedTerms = searchTerms.map(t => t.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&'));
            const regex = new RegExp(`(${escapedTerms.join('|')})`, 'g');
            htmlText = htmlText.replace(regex, `<span class="keyword-link" data-kw="${kwId}">$1</span>`);
        }
    });

    haikuTextEl.innerHTML = htmlText;
    haikuYearEl.textContent = `${haiku.year}年`;
    
    const noteContent = haiku.preface || haiku.note;
    if (noteContent) {
        haikuNoteEl.textContent = noteContent;
        haikuNoteEl.style.display = 'block';
    } else {
        haikuNoteEl.textContent = '';
        haikuNoteEl.style.display = 'none';
    }
    adjustHaikuDetailSpacing(haiku.text, noteContent || '');

    // Process keyword links
    setTimeout(() => {
        document.querySelectorAll('.keyword-link').forEach(el => {
            el.addEventListener('click', (e) => {
                e.stopPropagation();
                const kw = e.target.getAttribute('data-kw');
                handleNodeClick(`kw_${kw}`);
            });
        });
    }, 50);

    // Time chain: Haikus from +/- 1 year
    const targetYear = haiku.year;
    const timeChain = haikus.filter(h => h.id !== id && Math.abs(h.year - targetYear) <= 1);
    
    timeChainList.innerHTML = '';
    if (timeChain.length === 0) {
        timeChainList.innerHTML = '<li><p class="meta-text">同時期の俳句は見つかりませんでした。</p></li>';
    } else {
        timeChain.forEach(h => {
            const li = document.createElement('li');
            li.innerHTML = `
                <p class="preview-text">${h.text}</p>
                <p class="meta-text">${h.year}年</p>
            `;
            li.addEventListener('click', () => handleNodeClick(`h_${h.id}`));
            timeChainList.appendChild(li);
        });
    }

    haikuView.classList.remove('hidden');
    keywordView.classList.add('hidden');
    detailPanel.classList.remove('hidden');
}

function adjustHaikuDetailSpacing(haikuText, noteText) {
    const plainHaikuLength = (haikuText || '').replace(/\s/g, '').length;
    const plainNoteLength = (noteText || '').replace(/\s/g, '').length;
    const extraGap = Math.min(1.8, (plainHaikuLength * 0.02) + (plainNoteLength * 0.015));
    const dynamicGap = Math.max(1.4, 1.8 + extraGap);
    detailPanel.style.setProperty('--haiku-column-gap', `${dynamicGap}rem`);
}

function showKeyword(kw) {
    const kwLabel = keywords[kw] ? keywords[kw].label : kw;
    keywordTitleEl.textContent = kwLabel;
    
    // --- Haiku section ---
    const relatedHaikus = haikus.filter(h => h.keywords.includes(kw));
    keywordHaikuList.innerHTML = '';
    const haikuSection = document.querySelector('.keyword-haikus');
    if (relatedHaikus.length === 0) {
        haikuSection.classList.add('empty-section');
    } else {
        haikuSection.classList.remove('empty-section');
        relatedHaikus.forEach(h => {
            const li = document.createElement('li');
            li.innerHTML = `
                <p class="preview-text">${h.text}</p>
                <p class="meta-text">${h.year}年</p>
            `;
            li.addEventListener('click', () => handleNodeClick(`h_${h.id}`));
            keywordHaikuList.appendChild(li);
        });
    }
    
    // --- Content sections (Fragment / Essay / Works) ---
    const relatedContents = contents.filter(c => (c.keywords || []).includes(kw));
    const fragments = relatedContents.filter(c => c.type === 'fragment');
    const essays = relatedContents.filter(c => c.type === 'essay');
    const works = relatedContents.filter(c => c.type === 'work');
    
    renderContentSection('keyword-fragment-list', '.keyword-fragments', fragments);
    renderContentSection('keyword-essay-list', '.keyword-essays', essays);
    renderContentSection('keyword-work-list', '.keyword-works', works);

    keywordView.classList.remove('hidden');
    haikuView.classList.add('hidden');
    detailPanel.classList.remove('hidden');
}

function renderContentSection(listId, sectionSelector, items) {
    const listEl = document.getElementById(listId);
    const sectionEl = document.querySelector(sectionSelector);
    if (!listEl || !sectionEl) return;
    
    listEl.innerHTML = '';
    if (items.length === 0) {
        sectionEl.classList.add('empty-section');
    } else {
        sectionEl.classList.remove('empty-section');
        items.forEach(c => {
            const li = document.createElement('li');
            const hasUrl = c.url && c.url.trim() !== '';
            li.innerHTML = `
                <p class="preview-text">${c.title}</p>
                <p class="meta-text">${c.description || ''}</p>
            `;
            if (hasUrl) {
                li.addEventListener('click', () => window.open(c.url, '_blank'));
                li.style.cursor = 'pointer';
            } else if (c.slug) {
                li.addEventListener('click', () => {
                    window.location.href = `contentsviewer/index.html?slug=${c.slug}`;
                });
                li.style.cursor = 'pointer';
            } else {
                li.style.cursor = 'default';
            }
            listEl.appendChild(li);
        });
    }
}

function closePanel() {
    detailPanel.classList.add('hidden');
}

function addToHistory(type, id, name) {
    // Avoid double logging the same consecutive item
    if (historyLog.length > 0 && historyLog[historyLog.length - 1].id === id) return;

    historyLog.push({ type, id, name });
    
    // Keep max 5 items
    if (historyLog.length > 5) {
        historyLog.shift();
    }
    
    renderBreadcrumbs();
}

function renderBreadcrumbs() {
    breadcrumbList.innerHTML = '';
    historyLog.forEach((item, index) => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.className = 'crumb-link';
        a.textContent = item.name;
        
        a.addEventListener('click', (e) => {
            e.preventDefault();
            const nodeId = item.type === 'keyword' ? `kw_${item.id}` : `h_${item.id}`;
            handleNodeClick(nodeId);
        });

        li.appendChild(a);
        breadcrumbList.appendChild(li);
    });
}

// --- Haiku List View Logic ---
function openListView() {
    renderHaikuList(sortSelect.value || 'newest');
    haikuListOverlay.classList.remove('hidden');
    showListBtn.style.display = 'none';
    toggleUniverseInteraction(false);
}

function closeListView() {
    haikuListOverlay.classList.add('hidden');
    showListBtn.style.display = 'flex';
    toggleUniverseInteraction(true);
}

function toggleUniverseInteraction(enabled) {
    if (!network) return;
    network.setOptions({
        interaction: {
            dragView: enabled,
            zoomView: enabled,
            dragNodes: enabled,
            hover: enabled
        }
    });
}

function setupHaikuList() {
    showListBtn.addEventListener('click', openListView);

    closeListBtn.addEventListener('click', closeListView);

    sortSelect.addEventListener('change', (e) => {
        renderHaikuList(e.target.value);
    });

    // Close on background click
    haikuListOverlay.addEventListener('click', (e) => {
        if (e.target === haikuListOverlay) {
            closeListView();
        }
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !haikuListOverlay.classList.contains('hidden')) {
            closeListView();
        }
    });

    // Convert vertical mouse wheel to horizontal movement (forward moves left in RTL)
    haikuVerticalList.addEventListener('wheel', (e) => {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
        e.preventDefault();
        // In modern browsers, scrollBy with a negative left value pans leftward
        haikuVerticalList.scrollBy({ left: -e.deltaY });
    }, { passive: false });

    // Touch events for vertical-to-horizontal translation are removed.
    // Native horizontal swiping works perfectly and intuitively for RTL horizontal lists on mobile touchscreens.
}

function renderHaikuList(sortBy) {
    haikuVerticalList.innerHTML = '';
    
    let sortedHaikus = [...haikus];

    if (sortBy === 'newest') {
        sortedHaikus.sort((a, b) => b.year - a.year);
    } else if (sortBy === 'season') {
        const seasonOrder = { 'spring': 1, 'summer': 2, 'autumn': 3, 'winter': 4, 'newyear': 5, '': 6 };
        sortedHaikus.sort((a, b) => (seasonOrder[a.season] || 6) - (seasonOrder[b.season] || 6));
    } else if (sortBy === 'random') {
        sortedHaikus.sort(() => Math.random() - 0.5);
    }

    sortedHaikus.forEach(h => {
        const item = document.createElement('div');
        item.className = 'list-haiku-item';
        
        const seasonDict = { 'spring': '春', 'summer': '夏', 'autumn': '秋', 'winter': '冬', 'newyear': '新年' };
        const seasonText = seasonDict[h.season] || '無季';

        item.innerHTML = `
            <div class="vertical-text">${h.text}</div>
            <div class="list-haiku-meta">
                <span>${h.year}年</span>
                <span>${seasonText}</span>
            </div>
        `;

        item.addEventListener('click', () => {
            closeListView();
            startScreen.classList.add('hidden');
            handleNodeClick(`h_${h.id}`);
        });

        haikuVerticalList.appendChild(item);
    });
}

// Start
init();
