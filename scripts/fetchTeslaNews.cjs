// scripts/fetchTeslaNews.cjs
// Google News RSS에서 "Tesla OR TSLA" 지난 1일 기사 → news/tesla.json 생성
const { parseStringPromise } = require('xml2js');
const { writeFile, mkdir } = require('fs').promises;
const { dirname } = require('path');

// 한국어 뉴스 / 최근 1일
const RSS_URL = 'https://news.google.com/rss/search?q=Tesla%20OR%20TSLA%20when:1d&hl=ko&gl=KR&ceid=KR:ko';
const OUT_PATH = './news/tesla.json';
const MAX_ITEMS = 5;

function toPlainItem(it) {
  const title = it.title?.[0] ?? '';
  const link  = it.link?.[0] ?? '';
  const pubDate = it.pubDate?.[0] ?? '';
  return { title, link, pubDate };
}

(async () => {
  try {
    // Node 20+ 에서 fetch 전역 제공
    const resp = await fetch(RSS_URL, { redirect: 'follow' });
    if (!resp.ok) throw new Error(`RSS fetch failed: ${resp.status}`);
    const xml = await resp.text();
    const json = await parseStringPromise(xml);
    const items = json?.rss?.channel?.[0]?.item ?? [];

    const normalized = items
      .map(toPlainItem)
      .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate))
      .slice(0, MAX_ITEMS);

    await mkdir(dirname(OUT_PATH), { recursive: true }); // 폴더 자동 생성
    await writeFile(OUT_PATH, JSON.stringify(normalized, null, 2), 'utf-8');
    console.log(`Wrote ${normalized.length} items to ${OUT_PATH}`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
