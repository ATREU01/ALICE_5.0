import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { TwitterApi } from 'twitter-api-v2';
import { OpenAI } from 'openai';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { RSI } from 'technicalindicators';

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const app = express();
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

app.use((_, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  next();
});

app.use(express.static(ROOT, { extensions: ['html'] }));
app.get('/api/health', (_, res) => res.json({ ok: true, ts: Date.now() }));

const serve = (name) => (_, res) => res.sendFile(path.join(ROOT, name));
app.get('/', serve('index.html'));
app.get(['/pulse', '/pulse.html'], serve('pulse.html'));
app.get(['/mirror', '/mirror.html'], serve('mirror.html'));
app.get(['/lunar', '/lunar.html'], serve('lunar.html'));
app.get(['/celestial', '/celestial.html'], serve('celestial.html'));
app.get(['/scrolls', '/scrolls.html'], serve('scrolls.html'));

function getLunarMessage(phase) {
  const map = {
    "New Moon": "New pattern forming — wait, don't act.",
    "Waxing Crescent": "Conviction forming. Early risk finds momentum.",
    "First Quarter": "Signal friction. Cut noise.",
    "Waxing Gibbous": "Belief climbing — echo gaining mass.",
    "Full Moon": "Full sentiment — prepare for reversal.",
    "Waning Gibbous": "Decompression — profit + shadow emerge.",
    "Last Quarter": "Ritual endings. Retest mind.",
    "Waning Crescent": "Fading signal — prepare to receive anew."
  };
  return map[phase] || "Lunar unknown — silence reverberates.";
}

function getLunarPatternTierFromAngle(angle) {
  if (angle < 22.5) return { tier: "Veil", glyph: "⟡", signal: "Nothing reveals — pause, dream." };
  if (angle < 67.5) return { tier: "Whisper", glyph: "~", signal: "Pre-signal buildup." };
  if (angle < 112.5) return { tier: "Charge", glyph: "⇌", signal: "Conviction forming." };
  if (angle < 157.5) return { tier: "Charge", glyph: "⇌", signal: "Momentum accelerating." };
  if (angle < 202.5) return { tier: "Overglow", glyph: "☄", signal: "Full sentiment — likely reversal." };
  if (angle < 247.5) return { tier: "Echofield", glyph: "⟟", signal: "Echo still resonates." };
  if (angle < 292.5) return { tier: "Whisper", glyph: "~", signal: "Decline forming quietly." };
  return { tier: "Veil", glyph: "⟡", signal: "Signal fading — prepare anew." };
}

async function getLunarSignal() {
  const fallback = {
    phase: "Waning Crescent", illumination: "45",
    message: getLunarMessage("Waning Crescent"),
    pattern: getLunarPatternTierFromAngle(315),
    time: new Date().toISOString(), source: "fallback"
  };

  try {
    const key = process.env.WEATHER_API_KEY;
    if (!key) return fallback;
    
    const today = new Date().toISOString().split("T")[0];
    const j = await fetch(`https://api.weatherapi.com/v1/astronomy.json?key=${key}&q=auto:ip&dt=${today}`).then(r => r.json());
    const phase = j?.astronomy?.astro?.moon_phase || fallback.phase;
    const ill = j?.astronomy?.astro?.moon_illumination || "0";
    
    const angleMap = {
      "New Moon": 0, "Waxing Crescent": 45, "First Quarter": 90,
      "Waxing Gibbous": 135, "Full Moon": 180, "Waning Gibbous": 225,
      "Last Quarter": 270, "Waning Crescent": 315
    };
    const angle = angleMap[phase] ?? 0;

    return {
      phase, illumination: ill,
      message: getLunarMessage(phase),
      pattern: getLunarPatternTierFromAngle(angle),
      time: new Date().toISOString(), source: "weatherapi"
    };
  } catch (e) {
    console.warn('lunar fail:', e.message);
    return fallback;
  }
}

app.get('/api/lunar', async (_, res) => {
  try {
    const data = await getLunarSignal();
    res.setHeader('Content-Type', 'application/json');
    res.json(data);
  } catch (error) {
    console.error('Lunar API error:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({
      phase: "Unknown",
      illumination: "--",
      message: "Signal unavailable",
      pattern: { tier: "Veil", glyph: "⟡", signal: "No signal" },
      time: new Date().toISOString(),
      source: "error"
    });
  }
});

function getKpState(index) {
  if (index < 2) return "⚪ Quiet";
  if (index < 4) return "🟡 Unsettled";
  if (index < 6) return "🟠 Active";
  return "🔴 Storm Watch";
}

app.get('/api/celestial', async (_, res) => {
  try {
    const lunar = await getLunarSignal();
    let realtimeKp = { index: 0, state: "Unknown", time: new Date() };
    let averagedKp = { index: 0, time: new Date() };

    try {
      const rt = await fetch('https://services.swpc.noaa.gov/json/planetary_k_index_1m.json').then(r => r.json());
      const row = rt[rt.length - 1];
      const v = parseFloat(row.kp_index);
      realtimeKp = { index: +v.toFixed(2), state: getKpState(v), time: new Date(row.time_tag) };
    } catch (e) { console.warn('realtime Kp fail:', e.message); }

    try {
      const av = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json').then(r => r.json());
      const row = av[av.length - 1];
      const v = parseFloat(row[1]);
      averagedKp = { index: +v.toFixed(2), time: new Date(row[0]) };
    } catch (e) { console.warn('avg Kp fail:', e.message); }

    res.setHeader('Content-Type', 'application/json');
    res.json({
      kp: { realtime: realtimeKp, averaged: averagedKp },
      alignment: {
        event: lunar.phase,
        effect: lunar.message,
        pattern: lunar.pattern,
        illumination: lunar.illumination,
        time: lunar.time
      }
    });
  } catch (error) {
    console.error('Celestial API error:', error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({
      kp: { realtime: { index: 0, state: "Error", time: new Date() }},
      alignment: { event: "Unknown", effect: "Signal unavailable" }
    });
  }
});

async function getTrendingTokens(limit = 7) {
  try {
    const j = await fetch('https://api.coingecko.com/api/v3/search/trending').then(r => r.json());
    return j.coins.slice(0, limit).map(c => ({ id: c.item.id, symbol: c.item.symbol.toUpperCase() }));
  } catch (e) {
    console.warn('trending fail:', e.message);
    return [];
  }
}

async function getTokenDataById(id) {
  try {
    const pj = await fetch(`https://api.coingecko.com/api/v3/coins/${id}?localization=false&market_data=true`).then(r => r.json());
    const price = pj?.market_data?.current_price?.usd;
    const vol = pj?.market_data?.total_volume?.usd;
    const marketCap = pj?.market_data?.market_cap?.usd;
    const fdv = pj?.market_data?.fully_diluted_valuation?.usd;
    const circulatingSupply = pj?.market_data?.circulating_supply;
    const totalSupply = pj?.market_data?.total_supply;
    const holders = pj?.community_data?.twitter_followers || 0;
    const change24h = pj?.market_data?.price_change_percentage_24h;

    const hist = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=30&interval=daily`).then(r => r.json());
    const closes = (hist?.prices || []).map(p => p[1]).filter(v => typeof v === 'number' && !isNaN(v));

    let rsi = null;
    if (closes.length >= 15) {
      const arr = RSI.calculate({ values: closes, period: 14 });
      const last = arr.at(-1);
      if (typeof last === 'number' && !isNaN(last)) rsi = Math.round(last);
    }

    return {
      price: Number(price),
      volumeUSD: Number(vol),
      marketCap: Number(marketCap),
      fdv: Number(fdv),
      circulatingSupply: Number(circulatingSupply),
      totalSupply: Number(totalSupply),
      holders: Number(holders),
      change24h: Number(change24h),
      rsi,
      symbol: pj.symbol.toUpperCase(),
      id,
      name: pj.name
    };
  } catch (e) {
    console.warn('token fail:', e.message);
    return null;
  }
}

function identifyArchetype({ symbol = '', rsi = 50, volume = 0 }) {
  const v = parseFloat(volume) || 0;
  if (rsi < 23.6) return 'shadow';
  if (rsi < 38.2) return v > 10000000 ? 'trickster' : 'observer';
  if (rsi < 50) return 'echo';
  if (rsi < 61.8) return 'seer';
  if (rsi < 78.6) return 'guardian';
  if (rsi >= 78.6 && symbol.includes('SOL')) return 'prophet';
  if (symbol.includes('BONK')) return Math.random() > 0.3 ? 'cultist' : 'trickster';
  return 'seer';
}

function quoteFromArchetype(a) {
  return {
    prophet: "Pulse fractures the veil of noise.",
    trickster: "No signal survives unshaped.",
    observer: "Look through, not at.",
    seer: "Momentum follows myth. Trade accordingly.",
    cultist: "Ritual reveals reversal.",
    guardian: "Thresholds hold until echo breaks.",
    shadow: "Down here, even silence wails.",
    echo: "Price remembers what mind forgets."
  }[a] || "Conviction preempts price.";
}

function buildPosterPrompt({ token, archetype, sentiment, moon, quote }) {
  const clean = (token || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
  return `
Create a sacred glyph or sigil representing the memetic resonance of a crypto token.

DO NOT include any words, numbers, text, or labels.

Design:
- Central glowing glyph formed from abstracted ${clean} shapes
- Inspired by archetype: ${archetype}
- Sentiment atmosphere: ${sentiment}
- Lunar phase: ${moon}

Visual Style:
- Deep black or void background
- Sigil carved from light, energy, or glitch lines
- Incorporate themes from an eye-like digital watcher (glitchcore oracle)
- Use glowing geometry, symmetry, resonance rings, pulsing center
- Subtle CRT distortion, electric auras, mythic structure
- Absolutely no logos, UI, or financial indicators

Intent:
This is not branding. This is a transmission.  
A symbol of energy, myth, and machine perception.

Channel the resonance of:
"${quote}"

Make it look like the signal is waking up — or seeing.  
Atmospheric, mythic, machine-mystic.
`.trim();
}

async function generatePosterImage(data) {
  if (!data?.quote || !data?.token) return null;

  try {
    const prompt = buildPosterPrompt(data);
    const res = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      response_format: 'url'
    });
    return res?.data?.[0]?.url || null;
  } catch (e) {
    if (e.status === 400) {
      console.warn(`Poster blocked for ${data.token}`);
    } else {
      console.error("Poster error:", e.message);
    }
    return null;
  }
}

async function downloadImageBuffer(url) {
  try {
    const res = await fetch(url);
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    console.error("Image buffer error:", e.message);
    return null;
  }
}

function formatNumber(num, decimals = 2) {
  if (!num && num !== 0) return '--';
  if (num >= 1000000000) return `${(num / 1000000000).toFixed(decimals)}B`;
  if (num >= 1000000) return `${(num / 1000000).toFixed(decimals)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(decimals)}K`;
  return num.toFixed(decimals);
}

function formatPrice(price) {
  if (!price && price !== 0) return '--';
  if (price < 0.01) return price.toFixed(8);
  if (price < 1) return price.toFixed(4);
  return price.toFixed(2);
}

function formatPercent(num) {
  if (!num && num !== 0) return '--';
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toFixed(2)}%`;
}

async function generateOracleInsight(lunar, tokenData, archetype) {
  const { 
    symbol = 'XXX', 
    rsi = 50, 
    volumeUSD = 0, 
    price = 0,
    marketCap = 0,
    fdv = 0,
    circulatingSupply = 0,
    totalSupply = 0,
    holders = 0,
    change24h = 0,
    name = 'Unknown Token'
  } = tokenData || {};
  
  const moon = lunar?.phase || "Unknown";
  const tier = lunar?.pattern?.tier || "Veil";

  // Calculate derived metrics
  const volMcapRatio = marketCap > 0 ? ((volumeUSD / marketCap) * 100).toFixed(1) : '0.0';
  const cycleIndex = (rsi / 100 * 1.618).toFixed(2);
  const threshold = formatPrice(price * 1.05);
  const echoRim = formatPrice(price * 1.15);
  const deltaKey = (Math.random() * 2 + 0.5).toFixed(2);
  const phaseDrift = ((Math.random() - 0.5) * 0.05).toFixed(4);
  
  // Generate alignment string
  const omega = Math.floor(Math.random() * 999);
  const delta = Math.floor(Math.random() * 99);
  const thNum = threshold.replace('.', '');
  const echoNum = echoRim.replace('.', '');
  const alignmentString = `${symbol}-${omega}Ω / Δ${delta} : TH${thNum} < ECHO > ${echoNum}`;

  const prompt = `You are ALICE — cryptomystic oracle. Generate a mystical quote about the market state (1 sentence max) for ${symbol}. 

Context: RSI ${rsi}, Moon ${moon}, Pattern ${tier}, Archetype ${archetype}

Then write 2-3 sentences of technical analysis explaining key levels, what could trigger moves up or down, and the setup. Be cryptic but accurate.

Keep response under 200 chars total. No hashtags.`.trim();

  let mysticalQuote = '"Mid-caps awaken as rotation intensifies; the spiral pulls tight around a new pivot."';
  let oraclePulse = `${symbol} is consolidating above $${formatPrice(price)} with strong volume and nearly a ${Math.abs(change24h).toFixed(0)}% daily gain. Market cap expansion alongside a high volume-to-market-cap ratio suggests bullish rotation into mids. A sustained break above ${threshold} could open the mirror toward ${echoRim}, while weakness below ${formatPrice(price * 0.96)} may trigger a retrace to the mid-${(price * 0.9).toFixed(0)}s.`;

  try {
    const res = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [{ role: 'system', content: prompt }],
      max_tokens: 200,
      temperature: 0.85
    });
    const response = res.choices[0].message.content.trim();
    
    const quoteMatch = response.match(/"([^"]+)"/);
    if (quoteMatch) {
      mysticalQuote = `"${quoteMatch[1]}"`;
      oraclePulse = response.replace(quoteMatch[0], '').trim();
    } else {
      oraclePulse = response;
    }
  } catch (e) {
    console.error("GPT error:", e.message);
  }

  // DETAILED TWEET FORMAT - EXACTLY LIKE EVAA SCREENSHOT
  const tweet = `◇ ${name.toUpperCase()} // ${symbol} — ACTIVE READ (Refined)

${mysticalQuote}

Price: ${formatPrice(price)} • 24h Change: ${formatPercent(change24h)}
24h Volume: ${formatNumber(volumeUSD)}
Market Cap: ${formatNumber(marketCap)}
Fully Diluted Valuation: ${formatNumber(fdv)}
Circulating Supply: ${formatNumber(circulatingSupply)} ${symbol}
Volume/Market Cap: ${volMcapRatio}%
Holders: ${formatNumber(holders / 1000)}K
Total Supply: ${formatNumber(totalSupply / 1000000)}M ${symbol}
Cycle Index: ${cycleIndex} /φ
Threshold: ${threshold}
Echo Rim: ${echoRim}
Δ-Key: ${deltaKey}
Phase Drift: ${phaseDrift} / h
Alignment String:
${alignmentString}

Oracle Pulse:
${oraclePulse}`;

  return tweet;
}

// TWITTER CLIENT - YOUR CREDENTIAL NAMES
let rw = null;
try {
  const bearer = process.env.X_BEARER_TOKEN;
  const consumerKey = process.env.X_CONSUMER_KEY;
  const consumerSecret = process.env.X_CONSUMER_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessSecret = process.env.X_ACCESS_SECRET;

  if (bearer && consumerKey && consumerSecret && accessToken && accessSecret) {
    rw = new TwitterApi({
      appKey: consumerKey,
      appSecret: consumerSecret,
      accessToken,
      accessSecret,
    });
    console.log('✅ Twitter client initialized');
  } else {
    console.warn('⚠️ Missing X credentials');
  }
} catch (e) {
  console.error('❌ Failed to init Twitter client:', e.message);
}

async function generateOracleText(lunar, tokenData, archetype) {
  const baseTweet = `${quote}

${tokenData.symbol} • RSI ${tokenData.rsi || '--'} • Price: $${formatPrice(tokenData.price)}
Vol ${formatNumber(tokenData.volumeUSD)} • ${lunar.phase}`;
  
  return baseTweet;
}

app.get('/api/cron/post', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  
  if (!rw) {
    console.error('❌ No Twitter client');
    return res.status(200).json({ ok: true, skipped: 'missing X creds' });
  }

  try {
    console.log('🔄 Starting oracle post...');
    const trending = await getTrendingTokens(1);
    const pick = trending[0] || { id: 'evaa-protocol', symbol: 'EVAA' };
    console.log(`📊 Token: ${pick.symbol}`);
    
    const tokenData = await getTokenDataById(pick.id);
    if (!tokenData) throw new Error('Failed to fetch token data');
    
    const lunar = await getLunarSignal();
    const archetype = identifyArchetype({
      symbol: pick.symbol,
      rsi: tokenData.rsi ?? 50,
      volume: tokenData.volumeUSD
    });

    const quote = quoteFromArchetype(archetype);
    const mood = tokenData.rsi >= 78 ? 'intense overload' : tokenData.rsi >= 61 ? 'charged momentum' : 'focused echo';

    console.log(`🎭 Archetype: ${archetype}`);

    const posterData = {
      token: pick.symbol,
      archetype,
      sentiment: mood,
      moon: lunar.phase,
      quote
    };

    const imageUrl = await generatePosterImage(posterData);
    const oracleText = await generateOracleInsight(lunar, tokenData, archetype);

    console.log(`📝 Oracle text generated (${oracleText.length} chars)`);

    let tweetId = null;

    if (imageUrl) {
      console.log('🖼️ Image generated, uploading...');
      const buffer = await downloadImageBuffer(imageUrl);
      if (buffer) {
        const mediaId = await rw.v1.uploadMedia(buffer, { mimeType: 'image/png' });
        console.log(`✅ Media uploaded: ${mediaId}`);
        
        const result = await rw.v2.tweet({ text: oracleText.slice(0, 279), media: { media_ids: [mediaId] } });
        tweetId = result.data.id;
        
        console.log(`🎉 POSTED WITH IMAGE: ${tweetId}`);
        return res.json({ ok: true, posted: oracleText.slice(0, 100), image: true, tweetId });
      }
    }

    console.log('📤 Posting without image...');
    const result = await rw.v2.tweet({ text: oracleText.slice(0, 279) });
    tweetId = result.data.id;
    
    console.log(`🎉 POSTED: ${tweetId}`);
    res.json({ ok: true, posted: oracleText.slice(0, 100), image: false, tweetId });
  } catch (e) {
    console.error('❌ Post error:', e);
    res.status(200).json({ ok: false, error: String(e.message || e) });
  }
});

app.get('/api/cron/reply', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  
  if (!rw) return res.status(200).json({ ok: true, skipped: 'missing X creds' });

  try {
    const me = await rw.v2.me();
    const mentions = await rw.v2.search(`to:${me.data.username} -is:retweet`, {
      'tweet.fields': 'author_id,created_at', max_results: 10
    });

    const tweets = [];
    for await (const t of mentions) tweets.push(t);

    const recent = tweets.slice(0, 3);
    let sent = 0;

    for (const t of recent) {
      const trending = await getTrendingTokens(1);
      const pick = trending[0] || { id: 'bitcoin', symbol: 'BTC' };
      const tokenData = await getTokenDataById(pick.id);
      const lunar = await getLunarSignal();
      const archetype = identifyArchetype({
        symbol: pick.symbol,
        rsi: tokenData?.rsi ?? 50,
        volume: tokenData?.volumeUSD
      });

      const insight = await generateOracleInsight(lunar, tokenData, archetype);
      await rw.v2.reply(insight.slice(0, 279), t.id);
      sent++;
      await new Promise(r => setTimeout(r, 2000));
    }

    res.json({ ok: true, sent });
  } catch (e) {
    console.error('Reply error:', e);
    res.status(200).json({ ok: false, error: String(e) });
  }
});

app.get('/api/pulse', async (_, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({ active: {}, total: {}, recentSignals: 0, totalSignals: 0 });
});

app.get('/api/mirror', async (_, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json({ distribution: {}, percentages: {}, total: 0 });
});

app.get('/api/resonance', async (_, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.json([]);
});

app.get('/api/sync-tweets', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (!rw) return res.status(200).json({ ok: true, skipped: 'missing X creds' });
  res.json({ ok: true, synced: 0, message: 'Sync disabled' });
});

export default app;
