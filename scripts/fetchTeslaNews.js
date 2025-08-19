// scripts/fetchTeslaNews.js
// Google News RSS에서 "Tesla OR TSLA" 지난 1일 기사 → news/tesla.json 생성 (의존성 없음)
const fs = require('fs').promises;
const path = require('path');

const RSS_URL = 'https://news.google.com/rss/search?q=Tesla%20OR%20TSLA%20when:1d&hl=ko&gl=KR&ceid=KR:ko';
const OUT_PATH = path.join(process.cwd(), 'news', 'tesla.json');
const MAX_ITEMS = 5;

// <![CDATA[...]]> 제거 + 기본 엔티티 디코딩
function unescapeXml(s = '') {
  return s
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function pickTag(block, tag) {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i');
  const m = block.match(re);
  return m ? unescapeXml(m[1].trim()) : '';
}

(async () => {
  try {
    const resp = await fetch(RSS_URL, { redirect: 'follow' });
    if (!resp.ok) throw new Error(`RSS fetch failed: ${resp.status}`);
    const xml = await resp.text();

    // <item> ... </item> 블록 추출
    const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
    const parsed = items.map(it => ({
      title: pickTag(it, 'title'),
      link:  pickTag(it, 'link'),
      pubDate: pickTag(it, 'pubDate')
    }))
    .filter(x => x.title && x.link)
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
    .slice(0, MAX_ITEMS);

    await fs.mkdir(path.dirname(OUT_PATH), { recursive: true }); // 폴더 자동 생성
    await fs.writeFile(OUT_PATH, JSON.stringify(parsed, null, 2), 'utf-8');
    console.log(`Wrote ${parsed.length} items to ${OUT_PATH}`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
