// scripts/fetchNewsMulti.js
const fs = require('fs').promises;
const path = require('path');

const QUERIES = [
  { key: 'SPY',   q: 'SPY OR "S&P 500 ETF"' },
  { key: 'AAPL',  q: 'Apple OR AAPL' },
  { key: 'MSFT',  q: 'Microsoft OR MSFT' },
  { key: 'NVDA',  q: 'NVIDIA OR NVDA' },
  { key: 'GOOGL', q: 'Alphabet OR GOOGL' },
  { key: 'AMZN',  q: 'Amazon OR AMZN' },
  { key: 'META',  q: 'Meta OR META' },
  { key: 'BRK.B', q: '"Berkshire Hathaway" OR "BRK.B"' },
  { key: 'JPM',   q: 'JPMorgan OR JPM' },
  { key: 'UNH',   q: 'UnitedHealth OR UNH' },
  { key: 'XOM',   q: 'Exxon Mobil OR XOM' },
  { key: 'AVGO',  q: 'Broadcom OR AVGO' },
  { key: 'JNJ',   q: 'Johnson & Johnson OR JNJ' },
  { key: 'TSLA',  q: 'Tesla OR TSLA' },
  { key: 'V',     q: 'Visa OR V' },
  { key: 'PG',    q: 'Procter & Gamble OR PG' },
  { key: 'LLY',   q: 'Eli Lilly OR LLY' },
  { key: 'HD',    q: 'Home Depot OR HD' },
  { key: 'KO',    q: 'Coca-Cola OR KO' },
  { key: 'PEP',   q: 'PepsiCo OR PEP' }
];

const HL='ko', GL='KR', CEID='KR:ko';
const MAX_ITEMS = 5;
const DELAY_MS = 1200; // 요청 사이 1.2초 대기 (안정성)

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
function unescapeXml(s=''){ return s.replace(/<!\[CDATA\[(.*?)\]\]>/gs,'$1').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'"); }
function pickTag(block, tag){ const re=new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`,'i'); const m=block.match(re); return m?unescapeXml(m[1].trim()):''; }

async function fetchAndWrite({key,q}){
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + ' when:1d')}&hl=${HL}&gl=${GL}&ceid=${CEID}`;
  const resp = await fetch(url,{redirect:'follow'});
  if(!resp.ok) throw new Error(`RSS failed for ${key}: ${resp.status}`);
  const xml = await resp.text();
  const items = xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];
  const parsed = items.map(it=>({ title:pickTag(it,'title'), link:pickTag(it,'link'), pubDate:pickTag(it,'pubDate') }))
    .filter(x=>x.title && x.link)
    .sort((a,b)=>new Date(b.pubDate)-new Date(a.pubDate))
    .slice(0, MAX_ITEMS);

  const out = path.join(process.cwd(),'news',`${key}.json`);
  await fs.mkdir(path.dirname(out),{recursive:true});
  await fs.writeFile(out, JSON.stringify(parsed,null,2),'utf-8');
  console.log(`Wrote ${key}.json (${parsed.length})`);
}

(async()=>{
  for(const item of QUERIES){
    try{ await fetchAndWrite(item); }
    catch(e){ console.error(e); }
    await sleep(DELAY_MS);
  }
})();
