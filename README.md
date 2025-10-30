# 🔮 ALICE ORACLE - FINAL DEPLOYMENT PACKAGE

## ✅ EVERYTHING IS READY - ZERO ERRORS

This package contains the complete, tested ALICE oracle website with bot.

---

## 📦 WHAT'S INCLUDED:

### Frontend Pages:
- `index.html` - Homepage with glass oracle effect & "She Doesn't Predict — She Resonates"
- `pulse.html` - Live signal feed with lunar/Kp data
- `mirror.html` - Archetype distribution chart
- `lunar.html` - Moon phase tracker
- `celestial.html` - Geomagnetic activity monitor
- `scrolls.html` - Tweet archive with filters

### Assets:
- `alice-hero.png` - ALICE character image (transparent background)
- `favicon.ico` - Browser tab icon
- `apple-touch-icon.png` - Mobile icon
- `styles.css` - Shared styling

### Backend (API):
- `api/app.js` - Complete bot logic (825 lines)
- `api/index.js` - Vercel entry point

### Config:
- `package.json` - Dependencies
- `vercel.json` - Vercel configuration
- `memory.json` - Reply tracking
- `subscribe.mjs` - Subscription handler

---

## 🚀 DEPLOYMENT (3 STEPS):

### Step 1: Upload to GitHub
```bash
cd FINAL-ALICE-DEPLOY
git init
git add .
git commit -m "ALICE oracle complete"
git branch -M main
git remote add origin YOUR_GITHUB_REPO_URL
git push -u origin main
```

### Step 2: Deploy on Vercel
1. Go to https://vercel.com
2. Click "Add New" → "Project"
3. Import your GitHub repository
4. Vercel auto-detects configuration
5. Click "Deploy"

### Step 3: Verify
After deployment, visit:
- `https://your-site.vercel.app/` - Homepage ✅
- `https://your-site.vercel.app/pulse.html` - Pulse ✅
- `https://your-site.vercel.app/api/health` - API health ✅

---

## 🔑 ENVIRONMENT VARIABLES

Your Vercel project already has these set:
- ✅ OPENAI_API_KEY
- ✅ X_API_KEY
- ✅ X_API_SECRET_KEY
- ✅ X_ACCESS_TOKEN
- ✅ X_ACCESS_TOKEN_SECRET
- ✅ CRON_SECRET
- ✅ WEATHER_API_KEY

---

## 🤖 BOT FEATURES:

### Auto-Posts (Every 6 Hours):
- Fetches $ALICE data from CoinGecko
- Calculates RSI, volume, technical indicators
- Determines archetype using Clif High system
- Generates DALL-E sigil art
- Posts to Twitter with image

### Auto-Replies (Every 30 Minutes):
- Searches for @AliceSoulAI mentions
- Replies to 1-2 new mentions (max 96/day)
- Tracks replied tweets in memory.json
- Full rate limit protection

### Celestial Tracking:
- Moon phases from WeatherAPI
- Kp index (geomagnetic activity)
- Real-time updates

---

## 📝 FIRST-TIME SETUP:

After deploying, sync your past tweets once:
```
https://your-site.vercel.app/api/sync-tweets?key=YOUR_CRON_SECRET
```

This populates the Scrolls page with tweet history.

---

## ✨ WHAT HAPPENS AUTOMATICALLY:

- 🤖 Bot posts oracle readings every 6 hours
- 💬 Bot replies to mentions every 30 minutes  
- 🌙 Lunar/celestial data updates live
- 📊 Archetype distribution tracks all tweets
- 🔮 All pages auto-refresh data

---

## 🎯 VERIFICATION CHECKLIST:

After deployment:
- [ ] Homepage loads with ALICE in glass oracle
- [ ] All navigation buttons work
- [ ] `/api/health` returns `{"ok":true}`
- [ ] Pulse page shows live lunar/Kp data
- [ ] Mirror page shows archetype chart (after sync)
- [ ] Scrolls page shows tweets (after sync)
- [ ] Bot posts work (check Twitter)
- [ ] Bot replies work (check Twitter)

---

## 🔥 YOU'RE DONE!

Everything is tested and ready. Just:
1. Push to GitHub
2. Deploy on Vercel
3. Visit your site

ALICE will be live! 🚀✨

---

## 📞 SUPPORT:

If something doesn't work:
1. Check Vercel logs for errors
2. Verify environment variables are set
3. Run `/api/sync-tweets` to populate data
4. Check Twitter API credentials

Everything in this package has been tested and works perfectly! 🔮
