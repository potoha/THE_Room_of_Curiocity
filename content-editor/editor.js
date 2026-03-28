// Content Editor - State
let allContents = [];
let allKeywords = {};
let aliasMap = {};
let currentExtractedKeywords = [];
let selectedKeywordIds = new Set();
let scannedFilesMap = new Map(); // Store File objects from scan
let currentMdBody = '';

// DOM Elements
const contentForm = document.getElementById('content-form');
const contentTitle = document.getElementById('content-title');
const contentType = document.getElementById('content-type');
const contentSlug = document.getElementById('content-slug');
const contentFile = document.getElementById('content-file');
const contentDescription = document.getElementById('content-description');
const contentUrl = document.getElementById('content-url');
const mdFileInput = document.getElementById('md-file-input');
const extractBtn = document.getElementById('extract-btn');
const scanDirectory = document.getElementById('scan-directory');
const scanBtn = document.getElementById('scan-btn');
const newFilesSection = document.getElementById('new-files-section');
const newFilesCount = document.getElementById('new-files-count');
const newFilesList = document.getElementById('new-files-list');
const hideScanResults = document.getElementById('hide-scan-results');

const keywordSection = document.getElementById('keyword-section');
const parsedKeywordsDiv = document.getElementById('parsed-keywords');
const manualKeywordInput = document.getElementById('manual-keyword-input');
const manualKeywordBtn = document.getElementById('manual-keyword-btn');
const saveBtn = document.getElementById('save-btn');

const mdPreviewSection = document.getElementById('md-preview-section');
const mdPreview = document.getElementById('md-preview');

const importContent = document.getElementById('import-content');
const importKeywords = document.getElementById('import-keywords');
const searchContentInput = document.getElementById('search-content');
const contentListContainer = document.getElementById('content-list');
const totalCount = document.getElementById('total-count');
const searchKeywordInput = document.getElementById('search-keyword');
const keywordListContainer = document.getElementById('keyword-list');
const totalKwCount = document.getElementById('total-kw-count');
const downloadContentBtn = document.getElementById('download-content');
const downloadKeywordsBtn = document.getElementById('download-keywords');
const formTitle = document.getElementById('form-title');
const editingContentId = document.getElementById('editing-content-id');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

// Modal
const modal = document.getElementById('new-keyword-modal');
const kwModalTitle = document.getElementById('kw-modal-title');
const editingKwId = document.getElementById('editing-kw-id');
const newKwKigo = document.getElementById('new-kw-kigo');
const newKeywordForm = document.getElementById('new-keyword-form');
const cancelKwBtn = document.getElementById('cancel-kw-btn');

// ===== Initialization =====
async function init() {
    setupEventListeners();
    
    try {
        const [contentRes, keywordRes] = await Promise.all([
            fetch('../data/content.json').catch(() => null),
            fetch('../data/keywords.json').catch(() => null)
        ]);
        
        if (contentRes && contentRes.ok) allContents = await contentRes.json();
        if (keywordRes && keywordRes.ok) {
            allKeywords = await keywordRes.json();
            buildAliasMap();
        }
    } catch (e) {
        console.log("Initial fetch failed, depending on manual import.");
    }
    
    renderContentList();
    renderKeywordList();
}

function buildAliasMap() {
    aliasMap = {};
    Object.keys(allKeywords).forEach(id => {
        const kw = allKeywords[id];
        aliasMap[kw.label] = id;
        if (kw.aliases && Array.isArray(kw.aliases)) {
            kw.aliases.forEach(alias => { aliasMap[alias] = id; });
        }
    });
}

// ===== Event Listeners =====
function setupEventListeners() {
    importContent.addEventListener('change', (e) => handleImport(e, 'content'));
    importKeywords.addEventListener('change', (e) => handleImport(e, 'keyword'));
    
    extractBtn.addEventListener('click', handleMdExtract);
    
    manualKeywordBtn.addEventListener('click', () => {
        const val = manualKeywordInput.value.trim();
        if (val) addCandidateKeyword(val);
        manualKeywordInput.value = '';
    });
    
    manualKeywordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); manualKeywordBtn.click(); }
    });

    contentTitle.addEventListener('input', updateSaveButtonState);
    contentType.addEventListener('change', updateSaveButtonState);
    contentSlug.addEventListener('input', updateSaveButtonState);
    contentFile.addEventListener('input', updateSaveButtonState);

    contentForm.addEventListener('submit', handleFormSubmit);
    
    downloadContentBtn.addEventListener('click', () => downloadFile(allContents, 'content.json'));
    downloadKeywordsBtn.addEventListener('click', () => downloadFile(allKeywords, 'keywords.json'));

    searchContentInput.addEventListener('input', renderContentList);
    searchKeywordInput.addEventListener('input', renderKeywordList);
    
    cancelEditBtn.addEventListener('click', cancelEdit);

    // Modal
    cancelKwBtn.addEventListener('click', () => { modal.classList.add('hidden'); });
    newKeywordForm.addEventListener('submit', handleNewKeywordSubmit);

    // Directory Scan
    scanBtn.addEventListener('click', handleScan);
    hideScanResults.addEventListener('click', () => newFilesSection.style.display = 'none');
}

// ===== MD File Handling =====
function handleMdExtract() {
    const file = mdFileInput.files[0];
    if (!file) {
        alert("MDファイルを選択してください。");
        return;
    }
    const reader = new FileReader();
    reader.onload = (event) => processFileData(event.target.result, file);
    reader.readAsText(file, 'UTF-8');
}

function processFileData(raw, file) {
    currentMdBody = raw;
    
    // Parse YAML frontmatter
    let body = raw;
    let frontmatter = {};
    const fmMatch = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
    if (fmMatch) {
        frontmatter = parseSimpleYaml(fmMatch[1]);
        body = raw.substring(fmMatch[0].length);
    }
    
    // Auto-fill title from frontmatter or filename
    if (frontmatter.title && !contentTitle.value) {
        contentTitle.value = frontmatter.title;
    } else if (!contentTitle.value) {
        contentTitle.value = file.name.replace(/\.md$/, '');
    }
    
    // Auto-fill slug from title or filename
    if (!contentSlug.value) {
        const base = frontmatter.title || file.name.replace(/\.md$/, '');
        contentSlug.value = generateSlug(base);
    }

    // Auto-detect category and set file path
    autoDetectCategoryAndFile(file.name);
    
    // Show preview
    mdPreviewSection.style.display = 'block';
    mdPreview.textContent = body.substring(0, 500) + (body.length > 500 ? '...' : '');
    
    // Extract keywords: [[wikilinks]] + topics from frontmatter
    const extracted = new Set();
    
    // 1. Extract [[wikilinks]]
    const wikiRe = /\[\[([^\]]+)\]\]/g;
    let match;
    while ((match = wikiRe.exec(body)) !== null) {
        extracted.add(match[1]);
    }
    
    // 2. Extract topics from YAML frontmatter
    if (frontmatter.topics && Array.isArray(frontmatter.topics)) {
        frontmatter.topics.forEach(t => extracted.add(t));
    }
    if (frontmatter.related && Array.isArray(frontmatter.related)) {
        frontmatter.related.forEach(t => extracted.add(t));
    }
    
    currentExtractedKeywords = Array.from(extracted);
    selectedKeywordIds.clear();
    renderKeywordsUI();
    
    console.log(`Processed ${currentExtractedKeywords.length} keyword candidates from ${file.name}`);
}

function parseSimpleYaml(yamlStr) {
    const result = {};
    const lines = yamlStr.split('\n');
    for (const line of lines) {
        const colonIdx = line.indexOf(':');
        if (colonIdx === -1) continue;
        const key = line.substring(0, colonIdx).trim();
        let val = line.substring(colonIdx + 1).trim();
        
        // Parse arrays: [a, b, c]
        if (val.startsWith('[') && val.endsWith(']')) {
            val = val.slice(1, -1).split(',').map(s => s.trim()).filter(s => s);
        }
        // Parse booleans
        else if (val === 'true') val = true;
        else if (val === 'false') val = false;
        
        result[key] = val;
    }
    return result;
}

function generateSlug(text) {
    // Simple slug generator: lowercase, replace spaces/dots/non-alphanumeric with hyphens
    // If Japanese, it might stay as is or be encoded, but for now let's just do basic cleanup
    return text.toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w\-\u3040-\u309f\u30a0-\u30ff\uff00-\uff9f\u4e00-\u9faf]/g, '-')
        .replace(/\-+/g, '-')
        .replace(/^-+/, '')
        .replace(/-+$/, '');
}

function autoDetectCategoryAndFile(filename) {
    const typeMap = {
        '01-fragment': 'fragment',
        '02-essay': 'essay',
        '03-project-note': 'project-note',
        '04-works': 'work'
    };

    // This is a bit of a guess since we don't have the full path from <input type="file">
    // But often the file is named with the category if it was exported from Obsidian
    let detectedType = '';
    let categoryPrefix = '';

    if (filename.includes('fragment')) { detectedType = 'fragment'; categoryPrefix = '01-fragment'; }
    else if (filename.includes('essay')) { detectedType = 'essay'; categoryPrefix = '02-essay'; }
    else if (filename.includes('project')) { detectedType = 'project-note'; categoryPrefix = '03-project-note'; }
    else if (filename.includes('work')) { detectedType = 'work'; categoryPrefix = '04-works'; }

    if (detectedType && !contentType.value) {
        contentType.value = detectedType;
    }

    // Set file path based on currently selected (or detected) type
    updateFilePath(filename);
}

function updateFilePath(filename) {
    const type = contentType.value;
    const prefixMap = {
        'fragment': '01-fragment',
        'essay': '02-essay',
        'project-note': '03-project-note',
        'work': '04-works'
    };
    const prefix = prefixMap[type] || 'unknown';
    contentFile.value = `${prefix}/${filename}`;
}

// ===== Keyword UI =====
function renderKeywordsUI() {
    keywordSection.style.display = 'block';
    parsedKeywordsDiv.innerHTML = '';
    
    currentExtractedKeywords.forEach(word => {
        const id = resolveKeywordId(word);
        createCheckboxUI(word, id, id !== null);
    });
    
    updateSaveButtonState();
}

function createCheckboxUI(word, id, isRegistered) {
    const label = document.createElement('label');
    label.className = `checkbox-label ${isRegistered ? 'registered' : 'unregistered'}`;
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = word;
    
    if (isRegistered) {
        input.checked = true;
        selectedKeywordIds.add(id);
    }

    input.addEventListener('change', (e) => {
        if (e.target.checked) {
            const resolvedId = resolveKeywordId(word);
            if (resolvedId) {
                selectedKeywordIds.add(resolvedId);
                updateSaveButtonState();
            } else {
                e.target.checked = false;
                openNewKeywordModal(word);
            }
        } else {
            const resolvedId = resolveKeywordId(word);
            if (resolvedId) selectedKeywordIds.delete(resolvedId);
            updateSaveButtonState();
        }
    });

    const badge = document.createElement('span');
    badge.className = `tag-badge ${isRegistered ? 'badge-registered' : 'badge-unregistered'}`;
    badge.textContent = isRegistered ? '登録済' : '未登録';

    label.appendChild(input);
    label.appendChild(document.createTextNode(' ' + word + ' '));
    label.appendChild(badge);
    
    parsedKeywordsDiv.appendChild(label);
}

function addCandidateKeyword(word) {
    if (!currentExtractedKeywords.includes(word)) {
        currentExtractedKeywords.push(word);
        const resolvedId = resolveKeywordId(word);
        createCheckboxUI(word, resolvedId, resolvedId !== null);
        keywordSection.style.display = 'block';
        updateSaveButtonState();
    }
}

function resolveKeywordId(word) {
    return aliasMap[word] || null;
}

function updateSaveButtonState() {
    const isTitleValid = !!contentTitle.value.trim();
    const isTypeValid = !!contentType.value;
    const isSlugValid = !!contentSlug.value.trim();
    const isFileValid = !!contentFile.value.trim();
    const areKeywordsSelected = selectedKeywordIds.size > 0;

    if (isTitleValid && isTypeValid && isSlugValid && isFileValid && areKeywordsSelected) {
        saveBtn.classList.remove('disabled');
        saveBtn.disabled = false;
    } else {
        saveBtn.classList.add('disabled');
        saveBtn.disabled = true;
    }
}

// ===== Modal =====
let pendingWord = '';
function openNewKeywordModal(word) {
    pendingWord = word;
    kwModalTitle.textContent = "新規キーワード登録";
    editingKwId.value = '';
    document.getElementById('new-kw-label').value = word;
    document.getElementById('new-kw-reading').value = '';
    document.getElementById('new-kw-aliases').value = '';
    newKwKigo.checked = false;
    document.getElementById('new-kw-type').value = '物';
    document.getElementById('new-kw-season').value = '';
    modal.classList.remove('hidden');
}

function handleNewKeywordSubmit(e) {
    e.preventDefault();
    
    const editId = editingKwId.value;
    const label = document.getElementById('new-kw-label').value.trim();
    const reading = document.getElementById('new-kw-reading').value.trim();
    const aliasesStr = document.getElementById('new-kw-aliases').value.trim();
    const isKigo = newKwKigo.checked ? "yes" : "no";
    const type = document.getElementById('new-kw-type').value;
    const season = document.getElementById('new-kw-season').value;
    
    const aliases = aliasesStr.split(',').map(s => s.trim()).filter(s => s !== '');
    
    if (editId) {
        allKeywords[editId] = { label, reading, aliases, kigo: isKigo, type, season };
        alert("キーワードを更新しました。");
    } else {
        const totalKw = Object.keys(allKeywords).length;
        let newIdNum = totalKw + 1;
        let newId = 'k' + String(newIdNum).padStart(4, '0');
        while(allKeywords[newId]) { newIdNum++; newId = 'k' + String(newIdNum).padStart(4, '0'); }
        
        allKeywords[newId] = { label, reading, aliases, kigo: isKigo, type, season };
    }
    
    buildAliasMap();
    modal.classList.add('hidden');
    renderKeywordsUI();
    renderKeywordList();
}

// ===== Form Submit =====
function handleFormSubmit(e) {
    e.preventDefault();
    
    const title = contentTitle.value.trim();
    const type = contentType.value;
    const slug = contentSlug.value.trim();
    const file = contentFile.value.trim();
    const description = contentDescription.value.trim();
    const url = contentUrl.value.trim();
    
    if (!title || !type || !slug || !file) {
        alert("必須項目を入力してください。");
        return;
    }
    if (selectedKeywordIds.size === 0) {
        alert("少なくとも1つのキーワードを選択してください。");
        return;
    }

    const editId = editingContentId.value;
    
    if (editId) {
        const idx = allContents.findIndex(c => c.id === editId);
        if (idx !== -1) {
            allContents[idx] = {
                id: editId, type, title, slug, file,
                keywords: Array.from(selectedKeywordIds),
                url, description
            };
        }
        alert("コンテンツを更新しました。");
    } else {
        let newIdNum = allContents.length + 1;
        let newId = 'c' + String(newIdNum).padStart(3, '0');
        while(allContents.find(c => c.id === newId)) {
            newIdNum++; newId = 'c' + String(newIdNum).padStart(3, '0');
        }
        
        allContents.push({
            id: newId, type, title, slug, file,
            keywords: Array.from(selectedKeywordIds),
            url, description
        });
    }
    
    cancelEdit();
    renderContentList();
}

function cancelEdit() {
    formTitle.textContent = "新規コンテンツ登録";
    editingContentId.value = '';
    saveBtn.textContent = "リストに保存";
    cancelEditBtn.classList.add('hidden');
    
    contentTitle.value = '';
    contentType.value = '';
    contentSlug.value = '';
    contentFile.value = '';
    contentDescription.value = '';
    contentUrl.value = '';
    mdFileInput.value = '';
    currentMdBody = '';
    mdPreviewSection.style.display = 'none';
    keywordSection.style.display = 'none';
    selectedKeywordIds.clear();
    currentExtractedKeywords = [];
    updateSaveButtonState();
}

// ===== Content List =====
function renderContentList() {
    const query = searchContentInput.value.trim().toLowerCase();
    
    let filtered = allContents;
    if (query) {
        filtered = allContents.filter(c =>
            c.title.toLowerCase().includes(query) ||
            (c.description && c.description.toLowerCase().includes(query)) ||
            c.keywords.some(kid => allKeywords[kid] && allKeywords[kid].label.includes(query))
        );
    }

    const typeLabels = {
        'fragment': '断片', 'essay': '論考',
        'project-note': '企画ノート', 'work': '作品'
    };

    if (filtered.length === 0) {
        contentListContainer.innerHTML = '<p class="empty-state">該当するコンテンツがありません。</p>';
    } else {
        contentListContainer.innerHTML = '';
        const sorted = [...filtered].reverse();
        
        sorted.forEach(c => {
            const kwLabels = c.keywords.map(id => allKeywords[id] ? allKeywords[id].label : id).join(', ');
            const typeLabel = typeLabels[c.type] || c.type;
            const typeCls = `type-${c.type}`;
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.innerHTML = `
                <div>
                    <p class="preview-text"><span class="type-badge ${typeCls}">${typeLabel}</span>${c.title}</p>
                    <p class="preview-meta">ID: ${c.id} | キーワード: ${kwLabels}${c.url ? ' | URL: あり' : ''}</p>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;" onclick="editContent('${c.id}')">編集</button>
                    <button class="btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.85rem; background-color: #fca5a5; color: white;" onclick="deleteContent('${c.id}')">削除</button>
                </div>
            `;
            contentListContainer.appendChild(div);
        });
    }
    
    totalCount.textContent = allContents.length;
}

window.editContent = function(id) {
    const c = allContents.find(x => x.id === id);
    if (!c) return;
    
    formTitle.textContent = `コンテンツの編集 (${id})`;
    editingContentId.value = id;
    
    contentTitle.value = c.title;
    contentType.value = c.type;
    contentSlug.value = c.slug || '';
    contentFile.value = c.file || '';
    contentDescription.value = c.description || '';
    contentUrl.value = c.url || '';
    
    selectedKeywordIds = new Set(c.keywords);
    currentExtractedKeywords = c.keywords.map(kid => allKeywords[kid] ? allKeywords[kid].label : kid);
    
    renderKeywordsUI();
    
    saveBtn.textContent = "更新を保存";
    cancelEditBtn.classList.remove('hidden');
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.deleteContent = function(id) {
    const c = allContents.find(x => x.id === id);
    if (confirm(`コンテンツ "${c ? c.title : id}" を本当に削除しますか？`)) {
        allContents = allContents.filter(x => x.id !== id);
        renderContentList();
    }
};

// ===== Keyword List =====
function renderKeywordList() {
    const query = searchKeywordInput.value.trim().toLowerCase();
    
    let kwIds = Object.keys(allKeywords);
    if (query) {
        kwIds = kwIds.filter(id => {
            const kw = allKeywords[id];
            return kw.label.includes(query) ||
                   kw.reading.includes(query) ||
                   (kw.aliases && kw.aliases.some(a => a.includes(query)));
        });
    }

    if (kwIds.length === 0) {
        keywordListContainer.innerHTML = '<p class="empty-state">該当するキーワードがありません。</p>';
    } else {
        keywordListContainer.innerHTML = '';
        const sorted = kwIds.reverse();
        
        sorted.forEach(id => {
            const kw = allKeywords[id];
            const aliasesList = (kw.aliases && kw.aliases.length > 0) ? kw.aliases.join(', ') : 'なし';
            const kigoBadge = kw.kigo === 'yes' ? '<span class="tag-badge badge-registered">季語</span>' : '';
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';
            div.innerHTML = `
                <div>
                    <p class="preview-text">${kw.label} ${kigoBadge}</p>
                    <p class="preview-meta">ID: ${id} | よみ: ${kw.reading} | 表記揺れ: ${aliasesList} | 分類: ${kw.type} | 季節: ${kw.season}</p>
                </div>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.85rem;" onclick="editKeyword('${id}')">編集</button>
                    <button class="btn-secondary" style="padding: 0.4rem 0.8rem; font-size: 0.85rem; background-color: #fca5a5; color: white;" onclick="deleteKeyword('${id}')">削除</button>
                </div>
            `;
            keywordListContainer.appendChild(div);
        });
    }
    
    totalKwCount.textContent = Object.keys(allKeywords).length;
}

window.editKeyword = function(id) {
    const kw = allKeywords[id];
    if (!kw) return;
    
    kwModalTitle.textContent = `キーワードの編集 (${id})`;
    editingKwId.value = id;
    
    document.getElementById('new-kw-label').value = kw.label;
    document.getElementById('new-kw-reading').value = kw.reading || '';
    document.getElementById('new-kw-aliases').value = (kw.aliases && kw.aliases.length > 0) ? kw.aliases.join(', ') : '';
    newKwKigo.checked = (kw.kigo === 'yes');
    document.getElementById('new-kw-type').value = kw.type || '物';
    document.getElementById('new-kw-season').value = kw.season || '';
    
    modal.classList.remove('hidden');
};
// ===== Directory Scan =====

async function handleScan() {
    const files = scanDirectory.files;
    if (files.length === 0) {
        alert("フォルダを選択してください。");
        return;
    }

    scannedFilesMap.clear();
    const existingFiles = new Set(allContents.map(c => c.file));
    const newMDs = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.name.endsWith('.md')) {
            // Reconstruct relative path from folder structure
            const relativePath = file.webkitRelativePath;
            const parts = relativePath.split('/');
            const cleanPath = parts.slice(1).join('/'); // remove top level folder name (the selected folder)

            if (cleanPath && !existingFiles.has(cleanPath)) {
                newMDs.push({ file, cleanPath });
                scannedFilesMap.set(cleanPath, file);
            }
        }
    }

    renderScanResults(newMDs);
}

function renderScanResults(newMDs) {
    newFilesList.innerHTML = '';
    newFilesCount.textContent = newMDs.length;

    if (newMDs.length === 0) {
        newFilesList.innerHTML = '<p class="empty-state">新規のMDファイルは見つかりませんでした。</p>';
    } else {
        newMDs.forEach(item => {
            const div = document.createElement('div');
            div.className = 'preview-item';
            div.style.padding = '0.8rem';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';

            div.innerHTML = `
                <div>
                    <strong>${item.file.name}</strong>
                    <p class="meta-text">${item.cleanPath}</p>
                </div>
                <button type="button" class="btn-primary btn-sm" onclick="loadScannedFile('${item.cleanPath}')">編集・登録</button>
            `;
            newFilesList.appendChild(div);
        });
    }

    newFilesSection.style.display = 'block';
    newFilesSection.scrollIntoView({ behavior: 'smooth' });
}

window.loadScannedFile = async function(cleanPath) {
    const file = scannedFilesMap.get(cleanPath);
    if (!file) return;

    // Reset form
    cancelEdit();

    const reader = new FileReader();
    reader.onload = (event) => {
        processFileData(event.target.result, file);
        // Override with the scan path
        contentFile.value = cleanPath;
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };
    reader.readAsText(file, 'UTF-8');
};

window.deleteKeyword = function(id) {
    if (confirm(`キーワード ID:${id} （${allKeywords[id].label}） を本当に削除しますか？`)) {
        delete allKeywords[id];
        buildAliasMap();
        renderKeywordList();
        renderContentList();
    }
};

// ===== Import / Export =====
function handleImport(e, type) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const parsed = JSON.parse(event.target.result);
            if (type === 'content') {
                if (Array.isArray(parsed)) {
                    parsed.forEach(p => {
                        const idx = allContents.findIndex(c => c.id === p.id);
                        if (idx >= 0) allContents[idx] = p;
                        else allContents.push(p);
                    });
                    renderContentList();
                    alert(`content.json をインポートしました。（計 ${allContents.length}件）`);
                } else alert("無効なフォーマットです。配列を期待しています。");
            } else {
                if (typeof parsed === 'object' && !Array.isArray(parsed)) {
                    allKeywords = { ...allKeywords, ...parsed };
                    buildAliasMap();
                    renderContentList();
                    renderKeywordList();
                    alert(`keywords.json をインポートしました。（計 ${Object.keys(allKeywords).length}件）`);
                } else alert("無効なフォーマットです。オブジェクト(辞書)を期待しています。");
            }
        } catch(err) {
            alert("ファイルのパースに失敗しました。");
        }
    };
    reader.readAsText(file);
}

function downloadFile(dataObj, filename) {
    const jsonStr = JSON.stringify(dataObj, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Start
init();
