import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { TwitterApi } from 'twitter-api-v2';
import { OpenAI } from 'openai';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { RSI } from 'technicalindicators';
import fs from 'fs/promises';

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
    return j.coins.slice(0, limit).map(c => ({ id: c.item.id, symbol: `$${c.item.symbol.toUpperCase()}` }));
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
      id
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
  return `Create a mystical crypto oracle poster for ${token}.

Archetype: ${archetype}
Sentiment: ${sentiment}
Moon Phase: ${moon}
Oracle Quote: "${quote}"

Style: dark cosmic mysticism, neon glows (cyan/pink/purple), sacred geometry, occult symbolism
Mood: enigmatic, prophetic, crypto-spiritual
Elements: ${token} symbol prominent, moon phase visualization, archetype iconography

Make it visually striking and memeable. No text except the token symbol.`;
}

async function generatePosterImage(data) {
  try {
    const prompt = buildPosterPrompt(data);
    const res = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: 1,
      size: '1024x1024',
      quality: 'standard',
      style: 'vivid'
    });
    return res.data[0].url;
  } catch (e) {
    console.error('Image gen fail:', e.message);
    return null;
  }
}

async function downloadImageBuffer(url) {
  try {
    const res = await fetch(url);
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch (e) {
    console.error('Image download fail:', e.message);
    return null;
  }
}

function formatNumber(num) {
  if (!num || isNaN(num)) return '0';
  if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
  if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
  if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
  return `$${num.toFixed(2)}`;
}

async function generateOracleInsight(lunar, tokenData, archetype) {
  const quote = quoteFromArchetype(archetype);
  const rsiStr = tokenData.rsi ? `RSI ${tokenData.rsi}` : 'RSI unknown';
  const priceStr = tokenData.price ? `Price: ${tokenData.price < 1 ? tokenData.price.toFixed(6) : tokenData.price.toFixed(2)}` : '';
  const volStr = tokenData.volumeUSD ? `Vol ${formatNumber(tokenData.volumeUSD)}` : '';

  const baseTweet = `"${quote}"

$${tokenData.symbol} • ${rsiStr} • ${lunar.pattern.tier} ${lunar.pattern.glyph}
${priceStr}${priceStr && volStr ? ' • ' : ''}${volStr}`;

  if (baseTweet.length <= 279) return baseTweet;

  return `"${quote}"

$${tokenData.symbol} • ${rsiStr} • ${lunar.pattern.glyph}`;
}

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

app.get('/api/cron/post', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const isVercelCron = req.headers['user-agent']?.includes('vercel-cron');
  const hasValidKey = process.env.CRON_SECRET && req.query.key === process.env.CRON_SECRET;
  
  if (!isVercelCron && !hasValidKey) {
    return res.status(403).json({ ok: false, reason: 'forbidden' });
  }
  if (!rw) return res.status(200).json({ ok: true, skipped: 'missing X creds' });

  try {
    const trending = await getTrendingTokens(1);
    const pick = trending[0] || { id: 'evaa-protocol', symbol: '$EVAA' };
    const tokenData = await getTokenDataById(pick.id);
    const lunar = await getLunarSignal();
    
    const archetype = identifyArchetype({
      symbol: pick.symbol,
      rsi: tokenData?.rsi ?? 50,
      volume: tokenData?.volumeUSD
    });

    const quote = quoteFromArchetype(archetype);
    const mood = tokenData.rsi >= 78 ? 'intense overload' : tokenData.rsi >= 61 ? 'charged momentum' : 'focused echo';

    const posterData = {
      token: pick.symbol,
      archetype,
      sentiment: mood,
      moon: lunar.phase,
      quote
    };

    const imageUrl = await generatePosterImage(posterData);
    const oracleText = await generateOracleInsight(lunar, tokenData, archetype);

    let tweetId = null;
    let sigilUrl = imageUrl;

    if (imageUrl) {
      const buffer = await downloadImageBuffer(imageUrl);
      if (buffer) {
        const mediaId = await rw.v1.uploadMedia(buffer, { mimeType: 'image/png' });
        const result = await rw.v2.tweet({ text: oracleText.slice(0, 279), media: { media_ids: [mediaId] } });
        tweetId = result.data.id;
        
        // Save to resonance log - DISABLED: Vercel serverless has read-only filesystem
        // TODO: Migrate to Vercel KV or database
        
        return res.json({ ok: true, posted: oracleText, image: true, tweetId });
      }
    }

    const result = await rw.v2.tweet({ text: oracleText.slice(0, 279) });
    tweetId = result.data.id;
    
    // Save to resonance log - DISABLED: Vercel serverless has read-only filesystem
    // TODO: Migrate to Vercel KV or database
    
    res.json({ ok: true, posted: oracleText, image: false, tweetId });
  } catch (e) {
    res.status(200).json({ ok: false, error: String(e) });
  }
});

app.get('/api/cron/reply', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const isVercelCron = req.headers['user-agent']?.includes('vercel-cron');
  const hasValidKey = process.env.CRON_SECRET && req.query.key === process.env.CRON_SECRET;
  
  if (!isVercelCron && !hasValidKey) {
    return res.status(403).json({ ok: false, reason: 'forbidden' });
  }
  if (!rw) return res.status(200).json({ ok: true, skipped: 'missing X creds' });

  const MEMORY_PATH = path.join(ROOT, 'memory.json');
  
  try {
    let memory = [];
    try {
      const data = await fs.readFile(MEMORY_PATH, 'utf-8');
      memory = JSON.parse(data);
    } catch (e) {
      memory = [];
    }

    const me = await rw.v2.me();
    const tweets = await rw.v2.search({
      query: `@${me.data.username}`,
      max_results: 10,
      'tweet.fields': 'created_at,author_id,conversation_id'
    });

    if (!tweets.data || tweets.data.length === 0) {
      return res.json({ ok: true, sent: 0, message: 'No mentions found' });
    }

    const newTweets = tweets.data.filter(t => {
      return t.author_id !== me.data.id && !memory.includes(t.id);
    });

    if (newTweets.length === 0) {
      return res.json({ ok: true, sent: 0, message: 'No new mentions' });
    }

    let sent = 0;
    const errors = [];
    
    for (const t of newTweets.slice(0, 3)) {
      try {
        let coin = null;
        const match = t.text.match(/\$([A-Z]{2,10})/);
        
        if (match) {
          const sym = match[1];
          try {
            const searchRes = await fetch(`https://api.coingecko.com/api/v3/search?query=${sym}`).then(r => r.json());
            const found = searchRes.coins?.find(c => c.symbol.toUpperCase() === sym);
            if (found) coin = { id: found.id, symbol: `$${found.symbol.toUpperCase()}` };
          } catch (e) {
            console.warn('Token search failed:', e.message);
          }
        }

        if (!coin) {
          const trending = await getTrendingTokens(1);
          coin = trending[0] || { id: 'bitcoin', symbol: '$BTC' };
        }

        const tokenData = await getTokenDataById(coin.id);
        if (!tokenData) {
          console.warn(`No data for ${coin.symbol}`);
          continue;
        }

        const lunar = await getLunarSignal();
        const archetype = identifyArchetype({
          symbol: coin.symbol,
          rsi: tokenData?.rsi ?? 50,
          volume: tokenData?.volumeUSD
        });

        const insight = await generateOracleInsight(lunar, tokenData, archetype);
        
        // Reply to the tweet
        await rw.v2.reply(insight.slice(0, 279), t.id);
        
        // Add to memory
        memory.push(t.id);
        sent++;
        
        console.log(`✅ Replied to ${t.id} from @${t.author_id}`);
        
        // Wait 3 seconds between replies to avoid rate limits
        await new Promise(r => setTimeout(r, 3000));
        
      } catch (err) {
        console.error(`❌ Failed to reply to ${t.id}:`, err.message);
        errors.push({ tweet_id: t.id, error: err.message });
        
        // If we hit a 429, stop immediately
        if (err.code === 429 || err.message.includes('429')) {
          console.warn('⚠️ Rate limited - stopping replies');
          break;
        }
      }
    }

    // Save memory (keep last 100)
    await fs.writeFile(MEMORY_PATH, JSON.stringify(memory.slice(-100), null, 2));

    res.json({ 
      ok: true, 
      sent, 
      total_mentions: tweets.length,
      new_mentions: newTweets.length,
      errors: errors.length > 0 ? errors : undefined
    });
    
  } catch (e) {
    console.error('Reply cron error:', e);
    res.status(200).json({ ok: false, error: String(e) });
  }
});

app.get('/api/pulse', async (_, res) => {
  try {
    const log = await loadResonanceLog();
    
    // Get last 20 signals
    const recent = log.slice(0, 20);
    
    // Count active archetypes
    const activeArchetypes = {};
    recent.forEach(signal => {
      activeArchetypes[signal.archetype] = (activeArchetypes[signal.archetype] || 0) + 1;
    });
    
    // Get total counts
    const totalCounts = {};
    log.forEach(signal => {
      totalCounts[signal.archetype] = (totalCounts[signal.archetype] || 0) + 1;
    });
    
    res.setHeader('Content-Type', 'application/json');
    res.json({
      active: activeArchetypes,
      total: totalCounts,
      recentSignals: recent.length,
      totalSignals: log.length
    });
  } catch (error) {
    console.error('Pulse API error:', error);
    res.status(500).json({
      active: {},
      total: {},
      recentSignals: 0,
      totalSignals: 0
    });
  }
});

app.get('/api/mirror', async (_, res) => {
  try {
    const log = await loadResonanceLog();
    
    // Count all tweets by archetype
    const distribution = {};
    log.forEach(signal => {
      distribution[signal.archetype] = (distribution[signal.archetype] || 0) + 1;
    });
    
    // Calculate percentages
    const total = log.length;
    const percentages = {};
    Object.keys(distribution).forEach(arch => {
      percentages[arch] = ((distribution[arch] / total) * 100).toFixed(1);
    });
    
    res.setHeader('Content-Type', 'application/json');
    res.json({
      distribution,
      percentages,
      total
    });
  } catch (error) {
    console.error('Mirror API error:', error);
    res.status(500).json({
      distribution: {},
      percentages: {},
      total: 0
    });
  }
});

const RESONANCE_LOG_PATH = path.join(ROOT, 'resonance-log.json');

async function loadResonanceLog() {
  try {
    const data = await fs.readFile(RESONANCE_LOG_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    return [];
  }
}

async function saveResonanceLog(log) {
  try {
    await fs.writeFile(RESONANCE_LOG_PATH, JSON.stringify(log, null, 2));
  } catch (e) {
    console.error('Failed to save resonance log:', e);
  }
}

app.get('/api/resonance', async (_, res) => {
  try {
    const log = await loadResonanceLog();
    res.setHeader('Content-Type', 'application/json');
    res.json(log);
  } catch (error) {
    console.error('Resonance log error:', error);
    res.status(500).json([]);
  }
});

app.get('/api/sync-tweets', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const isVercelCron = req.headers['user-agent']?.includes('vercel-cron');
  const hasValidKey = process.env.CRON_SECRET && req.query.key === process.env.CRON_SECRET;
  
  if (!isVercelCron && !hasValidKey) {
    return res.status(403).json({ ok: false, reason: 'forbidden' });
  }
  if (!rw) return res.status(200).json({ ok: true, skipped: 'missing X creds' });

  try {
    const me = await rw.v2.me();
    const tweets = await rw.v2.userTimeline(me.data.id, {
      max_results: 50,
      'tweet.fields': 'created_at,public_metrics,attachments',
      expansions: 'attachments.media_keys',
      'media.fields': 'url,preview_image_url'
    });

    const log = [];
    
    for await (const tweet of tweets) {
      const tokenMatch = tweet.text.match(/\$([A-Z]{2,10})/);
      const token = tokenMatch ? `$${tokenMatch[1]}` : null;
      
      const rsiMatch = tweet.text.match(/RSI (\d+)/);
      const rsi = rsiMatch ? parseInt(rsiMatch[1]) : null;
      
      const priceMatch = tweet.text.match(/Price: ([0-9.]+)/);
      const price = priceMatch ? parseFloat(priceMatch[1]) : null;
      
      const volMatch = tweet.text.match(/Vol \$([0-9,.]+[KMB]?)/);
      const volume = volMatch ? volMatch[1] : null;
      
      // Extract sigil URL from media if present
      let sigil = null;
      if (tweet.attachments?.media_keys && tweets.includes?.media) {
        const media = tweets.includes.media.find(m => tweet.attachments.media_keys.includes(m.media_key));
        sigil = media?.url || media?.preview_image_url || null;
      }
      
      let archetype = 'seer';
      if (rsi) {
        if (rsi < 23.6) archetype = 'shadow';
        else if (rsi < 38.2) archetype = 'observer';
        else if (rsi < 50) archetype = 'echo';
        else if (rsi < 61.8) archetype = 'seer';
        else if (rsi < 78.6) archetype = 'guardian';
        else archetype = 'prophet';
      }
      
      log.push({
        id: tweet.id,
        archetype,
        token,
        content: tweet.text,
        timestamp: tweet.created_at,
        rsi,
        price,
        volume,
        sigil,
        likes: tweet.public_metrics?.like_count || 0,
        retweets: tweet.public_metrics?.retweet_count || 0
      });
    }

    await saveResonanceLog(log);
    res.json({ ok: true, synced: log.length });
  } catch (e) {
    console.error('Tweet sync error:', e);
    res.status(200).json({ ok: false, error: String(e) });
  }
});

export default app;
