// scripts/fetchNewsMulti.js
// Google News RSS에서 "기업별 맞춤 쿼리"로 지난 1일 뉴스 수집 → /news/<티커>.json 저장
// - 의존성 없음 (정규식 기반 파싱)
// - 쿼리: 기업/증권 문맥 강화 (stock/shares/earnings...)
// - 후필터: 필수 키워드 포함 + 금지 키워드/도메인 제외
// - 결과 0건이면 빈 배열([]) 저장 → UI에서 "최근 24시간 내 기사 없음" 표시

const fs = require('fs').promises;
const path = require('path');

// ===== 회사별 설정 =====
// key: 티커(파일명), name: 회사명(표시용 선택), q: 검색어 구성(동의어/정확표현), negatives: 금지 단어
const COMPANIES = [
  { key: 'AAPL',  name: 'Apple',                q: ['"Apple Inc"', 'Apple', 'AAPL'], negatives: [] },
  { key: 'MSFT',  name: 'Microsoft',            q: ['"Microsoft Corporation"', 'Microsoft', 'MSFT'], negatives: [] },
  { key: 'NVDA',  name: 'NVIDIA',               q: ['"NVIDIA Corporation"', 'NVIDIA', 'NVDA'], negatives: [] },
  { key: 'GOOGL', name: 'Alphabet (Class A)',   q: ['"Alphabet Inc"', 'Alphabet', 'GOOGL', 'Google'], negatives: [] },
  { key: 'AMZN',  name: 'Amazon',               q: ['"Amazon.com"', 'Amazon', 'AMZN'], negatives: [] },
  { key: 'META',  name: 'Meta Platforms',       q: ['"Meta Platforms"', 'Meta', 'Facebook', 'META'], negatives: [] },
  { key: 'BRK.B', name: 'Berkshire Hathaway B', q: ['"Berkshire Hathaway"','"BRK.B"','"BRK B"'], negatives: [] },
  { key: 'JPM',   name: 'JPMorgan Chase',       q: ['"JPMorgan Chase"','JPMorgan','JPM'], negatives: [] },
  { key: 'UNH',   name: 'UnitedHealth',         q: ['"UnitedHealth Group"','UnitedHealth','UNH'], negatives: [] },
  { key: 'XOM',   name: 'Exxon Mobil',          q: ['"Exxon Mobil"','Exxon','XOM'], negatives: [] },
  { key: 'AVGO',  name: 'Broadcom',             q: ['"Broadcom Inc"','Broadcom','AVGO'], negatives: [] },
  // ⚠️ 혼동 잦은 종목들: KO/PEP/V
  { key: 'KO',    name: 'Coca-Cola',            q: ['"Coca-Cola"','"The Coca-Cola Company"','Coke'], negatives: ['knockout','boxing','MMA'] },
  { key: 'PEP',   name: 'PepsiCo',              q: ['"PepsiCo"','Pepsi','"Pepsi Cola"'], negatives: ['Guardiola','football','soccer','UEFA','Premier League','Man City','Manchester City'] },
  { key: 'V',     name: 'Visa',                 q: ['"Visa Inc"','"Visa card"','Visa'], negatives: ['immigration','visa application','embassy','passport','travel visa'] },
  { key: 'TSLA',  name: 'Tesla',                q: ['"Tesla, Inc."','Tesla','TSLA'], negatives: [] },
  { key: 'JNJ',   name: 'Johnson & Johnson',    q: ['"Johnson & Johnson"','JNJ'], negatives: [] },
  { key: 'PG',    name: 'Procter & Gamble',     q: ['"Procter & Gamble"','P&G','PG'], negatives: [] },
  { key: 'LLY',   name: 'Eli Lilly',            q: ['"Eli Lilly"','LLY'], negatives: [] },
  { key: 'HD',    name: 'Home Depot',           q: ['"Home Depot"','HD'], negatives: [] },
  { key: 'KO',    name: 'Coca-Cola',            q: ['"Coca-Cola"','Coke'], negatives: ['knockout','boxing','MMA'] },
  { key: 'PEP',   name: 'PepsiCo',              q: ['"PepsiCo"','Pepsi'], negatives: ['Guardiola','football','soccer','UEFA','Premier League','Man City','Manchester City'] },
  { key: 'SPY',   name: 'S&P 500 ETF',          q: ['"S&P 500"','SPY'], negatives: [] },
];

// 중복 제거 (혹시 위 배열 편집하다 중복 넣었을 때 대비)
const seen = new Set();
const QUERIES = COMPANIES.filter(c => (c.key && !seen.has(c.key)) && seen.add(c.key));

// ===== 검색 파라미터/문맥 =====
const HL  = 'ko', GL = 'KR', CEID = 'KR:ko';  // 한국어 뉴스 기준. 영어권 원하면 'en','US','US:en'
const MAX_ITEMS = 5;
const DELAY_MS  = 1200;                       // 요청 사이 1.2s
const CONTEXT   = ['stock','shares','earnings','results','guidance','revenue','profit','dividend','market','NYSE','NASDAQ']; // 재무 문맥 강화

// 스포츠/엔터/이민 등 전역 금지어 + 금지 도메인 (후필터)
const GLOBAL_NEG_WORDS = ['football','soccer','UEFA','FIFA','Premier League','La Liga','Guardiola','knockout','boxing','MMA','immigration','embassy','passport'];
const BLOCKED_DOMAINS  = ['goal.com','skysports.com','espn.com','uefa.com','fifa.com','premierleague.com'];

// 유틸리티
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const unescapeXml = (s='') =>
  s.replace(/<!\[CDATA\[(.*?)\]\]>/gs,'$1')
   .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
   .replace(/&quot;/g,'"').replace(/&#39;/g,"'");
const pickTag = (block, tag) => {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`,'i');
  const m = block.match(re);
  return m ? unescapeXml(m[1].trim()) : '';
};
const containsAny = (text, arr) => {
  const t = text.toLowerCase();
  return arr.some(w => t.includes(w.toLowerCase()));
};

// 쿼리 문자열 구성 (기업 동의어 + 재무 문맥 + 1일)
function buildQuery(entry){
  const must = `(${entry.q.join(' OR ')})`;
  const ctx  = `(${CONTEXT.join(' OR ')})`;
  // 금지어를 검색 단계에도 반영하면 가끔 과하게 걸러지니, 가벼운 것만 일부 포함
  const minus = []; // entry.negatives.map(n => `-${JSON.stringify(n)}`)  // 원하면 활성화
  return `${must} ${ctx} when:1d ${minus.join(' ')}`.trim();
}

// 항목 후필터: 회사 동의어 포함 + 금지어/도메인 제외
function isRelevant(entry, item){
  const title = (item.title || '').toLowerCase();
  const link  = item.link || '';
  let host = '';
  try { host = new URL(link).hostname.toLowerCase(); } catch (e) {}

  // 회사 동의어 중 하나는 반드시 제목에 존재하도록 (정확도 ↑)
  const okSyn = containsAny(title, entry.q);

  // 전역/회사 금지어가 제목에 있으면 제외
  const badWord = containsAny(title, GLOBAL_NEG_WORDS.concat(entry.negatives||[]));

  // 스포츠/비즈니스 비관련 도메인 제외
  const badHost = BLOCKED_DOMAINS.some(d => host.endsWith(d));

  return okSyn && !badWord && !badHost;
}

async function fetchAndWrite(entry){
  const q = buildQuery(entry);
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${HL}&gl=${GL}&ceid=${CEID}`;

  const resp = await fetch(url, { redirect: 'follow' });
  if (!resp.ok) throw new Error(`RSS failed for ${entry.key}: ${resp.status}`);
  const xml = await resp.text();

  // <item> 블록 파싱
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const parsed = items.map(it => ({
    title:  pickTag(it,'title'),
    link:   pickTag(it,'link'),
    pubDate:pickTag(it,'pubDate')
  }))
  .filter(x => x.title && x.link)
  .sort((a,b) => new Date(b.pubDate) - new Date(a.pubDate));

  // 후필터 + 상위 N개
  const filtered = parsed.filter(it => isRelevant(entry, it)).slice(0, MAX_ITEMS);

  // 결과 저장 (없으면 빈 배열)
  const out = path.join(process.cwd(), 'news', `${entry.key}.json`);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, JSON.stringify(filtered, null, 2), 'utf-8');

  console.log(`Wrote ${entry.key}.json: ${filtered.length} items (raw:${parsed.length})`);
}

(async () => {
  for (const entry of QUERIES) {
    try { await fetchAndWrite(entry); }
    catch (e) { console.error(e); }
    await sleep(DELAY_MS);
  }
})();
