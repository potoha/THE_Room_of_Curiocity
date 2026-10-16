// トップページのおすすめ作品。登録済みの data/content.json が唯一の参照先。
(async function () {
  const container = document.getElementById('featured-works');
  if (!container) return;
  try {
    const response = await fetch('data/content.json');
    if (!response.ok) throw new Error('Could not fetch works');
    const works = await response.json();
    const priority = ['先輩と宇宙飛行士'];
    const featured = [...works].filter(w => w.featured === true)
      .sort((a,b) => (a.featuredOrder||999)-(b.featuredOrder||999));
    const ordered = [
      ...featured,
      ...priority.map(title => works.find(w => w.title === title)).filter(Boolean),
      ...works.filter(w => w.type === 'essay' || w.type === 'work')
    ].filter((w, i, arr) => w && arr.findIndex(x => x.id === w.id) === i).slice(0, 3);
    container.replaceChildren();
    const labels = {'fragment':'断片','essay':'評論・随筆','project-note':'制作ノート','work':'小説・作品'};
    for (const entry of ordered) {
      const a = document.createElement('a'); a.className = 'feature-item';
      const url = entry.url || ('contentsviewer/index.html?slug='+encodeURIComponent(entry.slug));
      a.href = url; if (entry.url && /^https?:\/\//.test(entry.url)) { a.target = '_blank'; a.rel='noopener noreferrer'; }
      const type = document.createElement('span'); type.className='feature-type'; type.textContent=labels[entry.type]||'文章';
      const title=document.createElement('h3');title.textContent=entry.title;
      const desc=document.createElement('p');desc.textContent=entry.description||'作品を読む';
      a.append(type,title,desc);container.append(a);
    }
    if (!ordered.length) container.textContent='展示作品は準備中です。';
  } catch(error) {
    console.error(error);
    container.replaceChildren();
    const a=document.createElement('a'); a.href='bookshelf/index.html';a.className='text-link';a.textContent='作品一覧を見る ↗';container.append(a);
  }
})();


// 句の引用は既存アーカイブを参照する。演出用なので取得失敗時もトップの導線は維持。
(async function displayHeroHaiku() {
  const slot = document.getElementById('hero-haiku');
  if (!slot) return;
  try {
    const response = await fetch('data/haiku.json');
    if (!response.ok) return;
    const haiku = await response.json();
    const season = ['winter','winter','spring','spring','spring','summer','summer','summer','autumn','autumn','autumn','winter'][new Date().getMonth()];
    const candidates = haiku.filter(h => h.season === season && h.text);
    const options = candidates.length ? candidates : haiku.filter(h=>h.text);
    // 日ごとに一定、更新時のちらつきを避ける
    const index = Math.floor(Date.now() / 86400000) % options.length;
    if (options.length) slot.textContent = options[index].text;
  } catch (_) { /* decorative enhancement, no impact on navigation */ }
})();
