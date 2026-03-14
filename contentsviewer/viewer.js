/**
 * Contents Viewer - JavaScript Logic
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- State & Constants ---
    let contentsData = [];
    let currentContent = null;
    const md = window.markdownit({
        html: true,
        linkify: true,
        typographer: true
    });

    // --- DOM Elements ---
    const articleTitle = document.getElementById('article-title');
    const articleDate = document.getElementById('article-date');
    const articleCategory = document.getElementById('article-category');
    const articleBody = document.getElementById('article-body');
    const loadingIndicator = document.getElementById('loading-indicator');
    const relatedList = document.getElementById('related-list');

    // Settings
    const settingsBtn = document.getElementById('reader-settings-btn');
    const settingsPanel = document.getElementById('settings-panel');
    const closeSettings = document.getElementById('close-settings');
    const fontSizeSlider = document.getElementById('font-size-slider');
    const fontSizeVal = document.getElementById('font-size-val');
    const lineHeightSlider = document.getElementById('line-height-slider');
    const lineHeightVal = document.getElementById('line-height-val');
    const themeBtns = document.querySelectorAll('.theme-btn');
    const fontBtns = document.querySelectorAll('.font-btn');

    // --- Initialization ---
    async function init() {
        setupSettings();
        const urlParams = new URLSearchParams(window.location.search);
        const slug = urlParams.get('slug');

        if (!slug) {
            showError("記事が指定されていません。");
            return;
        }

        try {
            const response = await fetch('../data/content.json');
            contentsData = await response.json();
            currentContent = contentsData.find(c => c.slug === slug);

            if (!currentContent) {
                showError("記事が見つかりませんでした。");
                return;
            }

            // If it has a URL but we're here, maybe it's an external link mistakenly opened
            if (currentContent.url) {
                window.location.href = currentContent.url;
                return;
            }

            await loadContent(currentContent);
        } catch (error) {
            console.error(error);
            showError("データの読み込みに失敗しました。");
        }
    }

    // --- Content Loading & Parsing ---
    async function loadContent(content) {
        document.title = `${content.title} | 十六月書房`;
        articleTitle.textContent = content.title;
        articleCategory.textContent = getCategoryName(content.type);
        articleCategory.className = `type-badge type-${content.type}`;

        try {
            const response = await fetch(`../data/MD_contents_master/${content.file}`);
            if (!response.ok) throw new Error("File not found");
            const rawText = await response.text();

            const { frontmatter, body } = parseMarkdown(rawText);
            
            if (frontmatter.created) {
                articleDate.textContent = frontmatter.created;
            }

            // Convert Wikilinks before rendering
            const processedBody = processWikilinks(body);
            
            // Render Markdown
            articleBody.innerHTML = md.render(processedBody);
            loadingIndicator.style.display = 'none';

            renderRelated(content, frontmatter);
        } catch (error) {
            console.error(error);
            showError("記事ファイルの取得に失敗しました。");
        }
    }

    function parseMarkdown(text) {
        const fmMatch = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
        let frontmatter = {};
        let body = text;

        if (fmMatch) {
            const fmStr = fmMatch[1];
            body = text.substring(fmMatch[0].length);
            
            // Simple YAML parser
            fmStr.split('\n').forEach(line => {
                const parts = line.split(':');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    let value = parts.slice(1).join(':').trim();
                    
                    // Arrays
                    if (value.startsWith('[') && value.endsWith(']')) {
                        value = value.slice(1, -1).split(',').map(v => v.trim());
                    }
                    frontmatter[key] = value;
                }
            });
        }

        return { frontmatter, body };
    }

    function processWikilinks(text) {
        // [[slug]] -> <a href="?slug=slug" class="wikilink">slug</a>
        // [[slug|display]] -> <a href="?slug=slug" class="wikilink">display</a>
        return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, slugPart, displayPart) => {
            const rawSlug = slugPart.trim();
            const display = displayPart ? displayPart.trim() : rawSlug;
            const resolvedSlug = resolveSlug(rawSlug);
            return `<a href="?slug=${resolvedSlug}" class="wikilink">${display}</a>`;
        });
    }

    function resolveSlug(input) {
        // 1. Try direct slug match
        const directMatch = contentsData.find(c => c.slug === input);
        if (directMatch) return directMatch.slug;

        // 2. Try title match
        const titleMatch = contentsData.find(c => c.title === input);
        if (titleMatch) return titleMatch.slug;

        // 3. Try partial title match (optional, but might be helpful)
        const partialMatch = contentsData.find(c => c.title.includes(input));
        if (partialMatch) return partialMatch.slug;

        // Fallback to original input
        return input;
    }

    // --- Related Articles ---
    function renderRelated(content, fm) {
        relatedList.innerHTML = '';
        
        let related = [];

        // 1. related in frontmatter
        if (fm.related && Array.isArray(fm.related)) {
            fm.related.forEach(relSlug => {
                const item = contentsData.find(c => c.slug === relSlug);
                if (item && !related.includes(item)) related.push(item);
            });
        }

        // 2. topics match
        if (fm.topics && Array.isArray(fm.topics)) {
            contentsData.forEach(item => {
                if (item.slug === content.slug) return;
                // Currently content.json doesn't have topics, but we could add them
                // or just rely on keywords which are closely related to topics
                const hasCommonKeyword = item.keywords && item.keywords.some(k => content.keywords && content.keywords.includes(k));
                if (hasCommonKeyword && !related.includes(item)) related.push(item);
            });
        }

        // 3. Same type
        contentsData.forEach(item => {
            if (related.length >= 6) return;
            if (item.slug === content.slug) return;
            if (item.type === content.type && !related.includes(item)) related.push(item);
        });

        if (related.length === 0) {
            relatedList.innerHTML = '<li>関連記事はありません。</li>';
            return;
        }

        related.slice(0, 6).forEach(item => {
            const li = document.createElement('li');
            const href = item.url ? item.url : `?slug=${item.slug}`;
            const target = item.url ? '_blank' : '_self';
            li.innerHTML = `
                <a href="${href}" target="${target}" class="related-item">
                    <span class="type-badge type-${item.type}">${getCategoryName(item.type)}</span>
                    <strong>${item.title}</strong>
                    <p>${item.description || ''}</p>
                </a>
            `;
            relatedList.appendChild(li);
        });
    }

    // --- Settings Logic ---
    function setupSettings() {
        // Load from storage
        const settings = JSON.parse(localStorage.getItem('reader-settings') || '{}');
        const theme = settings.theme || 'light';
        const font = settings.font || 'serif';
        const size = settings.size || 18;
        const line = settings.lineHeight || 1.8;

        applyTheme(theme);
        applyFont(font);
        applySize(size);
        applyLineHeight(line);

        // UI Binding
        settingsBtn.addEventListener('click', () => settingsPanel.classList.toggle('hidden'));
        closeSettings.addEventListener('click', () => settingsPanel.classList.add('hidden'));

        themeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                applyTheme(btn.dataset.theme);
                saveSettings();
            });
        });

        fontBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                applyFont(btn.dataset.font);
                saveSettings();
            });
        });

        fontSizeSlider.addEventListener('input', (e) => {
            applySize(e.target.value);
            saveSettings();
        });

        lineHeightSlider.addEventListener('input', (e) => {
            applyLineHeight(e.target.value);
            saveSettings();
        });
    }

    function applyTheme(theme) {
        document.body.classList.remove('theme-light', 'theme-sepia', 'theme-dark');
        document.body.classList.add(`theme-${theme}`);
        themeBtns.forEach(b => b.classList.toggle('active', b.dataset.theme === theme));
    }

    function applyFont(font) {
        document.body.style.setProperty('--reader-font-family', font === 'serif' ? '"Noto Serif JP", serif' : '"Zen Kaku Gothic New", sans-serif');
        fontBtns.forEach(b => b.classList.toggle('active', b.dataset.font === font));
    }

    function applySize(size) {
        document.body.style.setProperty('--reader-font-size', `${size}px`);
        fontSizeSlider.value = size;
        fontSizeVal.textContent = `${size}px`;
    }

    function applyLineHeight(line) {
        document.body.style.setProperty('--reader-line-height', line);
        lineHeightSlider.value = line;
        lineHeightVal.textContent = line;
    }

    function saveSettings() {
        const settings = {
            theme: document.body.classList.contains('theme-sepia') ? 'sepia' : (document.body.classList.contains('theme-dark') ? 'dark' : 'light'),
            font: fontBtns[0].classList.contains('active') ? 'serif' : 'sans',
            size: fontSizeSlider.value,
            lineHeight: lineHeightSlider.value
        };
        localStorage.setItem('reader-settings', JSON.stringify(settings));
    }

    // --- Helpers ---
    function getCategoryName(type) {
        const names = {
            'fragment': '断片',
            'essay': '論考',
            'project-note': '企画ノート',
            'work': '作品'
        };
        return names[type] || type;
    }

    function showError(msg) {
        loadingIndicator.style.display = 'none';
        articleBody.innerHTML = `<p class="error">${msg}</p>`;
    }

    init();
});
