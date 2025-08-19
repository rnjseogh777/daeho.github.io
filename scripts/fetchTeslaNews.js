// scripts/fetchTeslaNews.js
// Google News RSS에서 "Tesla OR TSLA" 지난 1일 기사 → news/tesla.json 생성
import { parseStringPromise } from 'xml2js';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

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
    const resp = await fetch(RSS_URL, { redirect: 'follow' });
    if (!resp.ok) throw new Error(`RSS fetch failed: ${resp.status}`);
    const xml = await resp.text();
    const json = await parseStringPromise(xml);
    const items = json?.rss?.channel?.[0]?.item ?? [];
    const normalized = items.map(toPlainItem).sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
    const top = normalized.slice(0, MAX_ITEMS);

    await mkdir(dirname(OUT_PATH), { recursive: true }); // ← 폴더 자동 생성
    await writeFile(OUT_PATH, JSON.stringify(top, null, 2), 'utf-8');
    console.log(`Wrote ${top.length} items to ${OUT_PATH}`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
