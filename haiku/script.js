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

// State
let haikus = [];
let keywords = [];
let network = null;
let nodesDataSet = null;
let edgesDataSet = null;
let historyLog = []; // { type: 'haiku' | 'keyword', id: string, name: string }
let currentStartHaiku = null;

// Initialization
async function init() {
    try {
        // Since we are running locally via a server, fetch from parent dir data folder
        const [haikuRes, keywordRes] = await Promise.all([
            fetch('../data/haiku.json'),
            fetch('../data/keywords.json')
        ]);
        
        haikus = await haikuRes.json();
        keywords = await keywordRes.json();
        
        setupStartScreen();
        buildNetwork();
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

function pickRandomStartHaiku() {
    if (haikus.length === 0) return;
    const randIndex = Math.floor(Math.random() * haikus.length);
    currentStartHaiku = haikus[randIndex];
    
    let htmlText = currentStartHaiku.text;
    currentStartHaiku.keywords.forEach(kwId => {
        const kwData = keywords[kwId];
        if (kwData) {
            const regex = new RegExp(kwData.label, 'g');
            htmlText = htmlText.replace(regex, `<span class="keyword-link" data-kw="${kwId}">${kwData.label}</span>`);
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
    
    // Add Keyword Nodes
    Object.keys(keywords).forEach(kwId => {
        const kwData = keywords[kwId];
        nodesDataSet.add({
            id: `kw_${kwId}`,
            label: kwData.label,
            group: 'keyword',
            value: 20, // size
            font: { size: 18, color: '#c5a880', face: 'Noto Serif JP' },
            color: {
                background: 'rgba(197, 168, 128, 0.1)',
                border: '#c5a880',
                highlight: { background: 'rgba(197, 168, 128, 0.5)', border: '#fff' }
            }
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
    // Simple naive replacement (can be improved for overlapping keywords)
    haiku.keywords.forEach(kwId => {
        const kwData = keywords[kwId];
        if (kwData) {
            const regex = new RegExp(kwData.label, 'g');
            htmlText = htmlText.replace(regex, `<span class="keyword-link" data-kw="${kwId}">${kwData.label}</span>`);
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

function showKeyword(kw) {
    const kwLabel = keywords[kw] ? keywords[kw].label : kw;
    keywordTitleEl.textContent = kwLabel;
    
    const relatedHaikus = haikus.filter(h => h.keywords.includes(kw));
    
    keywordHaikuList.innerHTML = '';
    if (relatedHaikus.length === 0) {
        keywordHaikuList.innerHTML = '<li><p class="meta-text">関連する俳句がありません。</p></li>';
    } else {
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

    keywordView.classList.remove('hidden');
    haikuView.classList.add('hidden');
    detailPanel.classList.remove('hidden');
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

// Start
init();
