import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
  Compass, BookOpen, ScanLine, Home,
  MapPin, Camera, Bell, Globe, Sparkles
} from 'lucide-react';

/* =============================================================
   NOOR — Muslim Companion
   A single-file React app with five features:
   1. Home dashboard (next prayer + daily verse)
   2. Prayer times (from Aladhan API)
   3. Qibla compass (great-circle bearing to Mecca)
   4. Quran reader (Surah list + verses, from Quran.com API)
   5. Halal scanner (Open Food Facts barcode lookup)
   ============================================================= */

const KAABA_LAT = 21.4225;
const KAABA_LON = 39.8262;

/* ---------------- Storage helpers (localStorage) ---------------- */
const storage = {
  get: (key, fallback) => {
    try {
      const raw = localStorage.getItem(`noor:${key}`);
      return raw ? JSON.parse(raw) : fallback;
    } catch { return fallback; }
  },
  set: (key, value) => {
    try { localStorage.setItem(`noor:${key}`, JSON.stringify(value)); } catch {}
  }
};

/* ---------------- Qibla math (great-circle bearing) ---------------- */
function calculateQibla(lat, lon) {
  const toRad = d => d * Math.PI / 180;
  const toDeg = r => r * 180 / Math.PI;
  const phi1 = toRad(lat);
  const phi2 = toRad(KAABA_LAT);
  const dLon = toRad(KAABA_LON - lon);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/* ---------------- Prayer name mappings ---------------- */
const PRAYERS = [
  { key: 'Fajr',    arabic: 'الفجر',    en: 'Fajr' },
  { key: 'Dhuhr',   arabic: 'الظهر',    en: 'Dhuhr' },
  { key: 'Asr',     arabic: 'العصر',    en: 'Asr' },
  { key: 'Maghrib', arabic: 'المغرب',  en: 'Maghrib' },
  { key: 'Isha',    arabic: 'العشاء',  en: 'Isha' }
];

const CALC_METHODS = [
  { id: 2, name: 'ISNA (North America)' },
  { id: 3, name: 'Muslim World League' },
  { id: 4, name: 'Umm al-Qura (Mecca)' },
  { id: 1, name: 'Karachi' },
  { id: 5, name: 'Egyptian' },
  { id: 8, name: 'Gulf Region' },
  { id: 13, name: 'Diyanet (Turkey)' }
];

/* ---------------- Format helpers ---------------- */
function fmtTime12(hhmm) {
  if (!hhmm) return '--:--';
  const [h, m] = hhmm.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function minutesUntil(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date();
  const target = new Date();
  target.setHours(h, m, 0, 0);
  if (target < now) target.setDate(target.getDate() + 1);
  return Math.floor((target - now) / 60000);
}

function fmtCountdown(mins) {
  if (mins == null) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `in ${m} minute${m !== 1 ? 's' : ''}`;
  return `in ${h}h ${m}m`;
}

/* ---------------- A small selection of Quran verses for daily display ---------------- */
const DAILY_VERSES = [
  { ar: 'إِنَّ مَعَ الْعُسْرِ يُسْرًا', en: 'Indeed, with hardship comes ease.', ref: 'Quran 94:6' },
  { ar: 'وَاللَّهُ خَيْرُ الرَّازِقِينَ', en: 'And Allah is the best of providers.', ref: 'Quran 62:11' },
  { ar: 'فَاذْكُرُونِي أَذْكُرْكُمْ', en: 'So remember Me; I will remember you.', ref: 'Quran 2:152' },
  { ar: 'إِنَّ اللَّهَ مَعَ الصَّابِرِينَ', en: 'Indeed, Allah is with the patient.', ref: 'Quran 2:153' },
  { ar: 'وَمَنْ يَتَوَكَّلْ عَلَى اللَّهِ فَهُوَ حَسْبُهُ', en: 'And whoever relies upon Allah — He is sufficient for him.', ref: 'Quran 65:3' },
  { ar: 'رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً', en: 'Our Lord, give us in this world that which is good and in the Hereafter that which is good.', ref: 'Quran 2:201' },
  { ar: 'لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا', en: 'Allah does not burden a soul beyond that it can bear.', ref: 'Quran 2:286' }
];

function todayVerse() {
  const day = Math.floor(Date.now() / 86400000);
  return DAILY_VERSES[day % DAILY_VERSES.length];
}

/* ---------------- Haram / questionable ingredient flagging ---------------- */
const HARAM_KEYWORDS = [
  'pork', 'lard', 'bacon', 'ham', 'gelatin', 'gelatine',
  'alcohol', 'ethanol', 'wine', 'rum', 'beer',
  'pepsin', 'rennet'
];
const MUSHBOOH_KEYWORDS = [
  'mono- and diglycerides', 'monoglycerides', 'diglycerides',
  'glycerol', 'glycerin', 'lecithin', 'emulsifier',
  'natural flavor', 'natural flavour', 'e120', 'e441', 'e542',
  'enzymes', 'shortening', 'whey'
];

function analyzeIngredients(text) {
  if (!text) return { status: 'unknown', flags: [] };
  const lower = text.toLowerCase();
  const haramHits = HARAM_KEYWORDS.filter(k => lower.includes(k));
  const mushboohHits = MUSHBOOH_KEYWORDS.filter(k => lower.includes(k));
  if (haramHits.length) return { status: 'haram', flags: haramHits };
  if (mushboohHits.length) return { status: 'mushbooh', flags: mushboohHits };
  return { status: 'halal', flags: [] };
}

/* =============================================================
   COMPONENT
   ============================================================= */
export default function App() {
  const [view, setView] = useState('home');
  const [settings, setSettings] = useState(() => storage.get('settings', {
    method: 2,
    location: null,
    locationName: null
  }));
  const [prayerData, setPrayerData] = useState(null);
  const [loadingPrayers, setLoadingPrayers] = useState(false);
  const [prayerError, setPrayerError] = useState(null);

  useEffect(() => { storage.set('settings', settings); }, [settings]);

  /* ---------------- Location request ---------------- */
  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setPrayerError('Geolocation not supported by this browser.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const loc = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        setSettings(s => ({ ...s, location: loc }));
      },
      err => setPrayerError(`Location error: ${err.message}`),
      { timeout: 15000, enableHighAccuracy: false }
    );
  }, []);

  /* ---------------- Fetch prayer times when location/method changes ---------------- */
  useEffect(() => {
    if (!settings.location) return;
    const { lat, lon } = settings.location;
    setLoadingPrayers(true);
    setPrayerError(null);
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const url = `https://api.aladhan.com/v1/timings/${dd}-${mm}-${yyyy}?latitude=${lat}&longitude=${lon}&method=${settings.method}`;
    fetch(url)
      .then(r => {
        if (!r.ok) throw new Error('Could not fetch prayer times');
        return r.json();
      })
      .then(data => {
        setPrayerData(data.data);
        if (data.data?.meta?.timezone && !settings.locationName) {
          setSettings(s => ({ ...s, locationName: data.data.meta.timezone.split('/').pop().replace(/_/g, ' ') }));
        }
      })
      .catch(err => setPrayerError(err.message))
      .finally(() => setLoadingPrayers(false));
  }, [settings.location, settings.method, settings.locationName]);

  /* ---------------- Derived: next prayer ---------------- */
  const nextPrayer = useMemo(() => {
    if (!prayerData?.timings) return null;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let next = null;
    for (const p of PRAYERS) {
      const t = prayerData.timings[p.key];
      if (!t) continue;
      const [h, m] = t.split(':').map(Number);
      const totalMin = h * 60 + m;
      if (totalMin > nowMin) { next = { ...p, time: t }; break; }
    }
    if (!next) next = { ...PRAYERS[0], time: prayerData.timings.Fajr, tomorrow: true };
    return next;
  }, [prayerData]);

  /* =================================================================
     RENDER ROUTING
     ================================================================= */
  return (
    <div className="app">
      <Header settings={settings} prayerData={prayerData} />
      <div className="content">
        {view === 'home' && (
          <HomeView
            settings={settings}
            requestLocation={requestLocation}
            prayerData={prayerData}
            nextPrayer={nextPrayer}
            loading={loadingPrayers}
            error={prayerError}
            onNavigate={setView}
          />
        )}
        {view === 'prayers' && (
          <PrayersView
            settings={settings}
            prayerData={prayerData}
            nextPrayer={nextPrayer}
            loading={loadingPrayers}
            error={prayerError}
            requestLocation={requestLocation}
          />
        )}
        {view === 'qibla' && (
          <QiblaView settings={settings} requestLocation={requestLocation} />
        )}
        {view === 'quran' && <QuranView />}
        {view === 'scanner' && <ScannerView />}
        {view === 'settings' && (
          <SettingsView settings={settings} setSettings={setSettings} requestLocation={requestLocation} />
        )}
      </div>
      <BottomNav view={view} setView={setView} />
    </div>
  );
}

/* =============================================================
   HEADER
   ============================================================= */
function Header({ settings, prayerData }) {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric'
  });
  const hijri = prayerData?.date?.hijri
    ? `${prayerData.date.hijri.day} ${prayerData.date.hijri.month.en} ${prayerData.date.hijri.year}`
    : null;
  return (
    <header className="hdr">
      <div className="hdr-brand">N <span className="dot">◆</span> O <span className="dot">◆</span> O <span className="dot">◆</span> R</div>
      <div className="hdr-sub">Muslim Companion</div>
      <div className="hdr-date">
        {today}
        {hijri && <span className="hijri">{hijri}</span>}
      </div>
    </header>
  );
}

/* =============================================================
   HOME VIEW
   ============================================================= */
function HomeView({ settings, requestLocation, prayerData, nextPrayer, loading, error, onNavigate }) {
  const verse = todayVerse();

  if (!settings.location) {
    return (
      <div>
        <div className="section-label">Welcome</div>
        <div className="verse-card" style={{ textAlign: 'center' }}>
          <p style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: 22, marginBottom: 16 }}>
            Assalamu alaikum
          </p>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)', marginBottom: 20, lineHeight: 1.7 }}>
            To show your prayer times and qibla direction, Noor needs your location.
          </p>
          <button className="btn-primary" onClick={requestLocation}>
            <MapPin size={16} /> Share Location
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {loading && <LoadingDots label="Calculating times" />}
      {error && <div className="error">{error}</div>}

      {nextPrayer && (
        <>
          <div className="section-label">Next Prayer</div>
          <div className="prayer-now">
            <div className="prayer-now-label">{nextPrayer.tomorrow ? 'Tomorrow' : 'Coming up'}</div>
            <div className="prayer-now-name">{nextPrayer.en}</div>
            <div className="prayer-now-arabic">{nextPrayer.arabic}</div>
            <div className="prayer-now-time">{fmtTime12(nextPrayer.time)}</div>
            <div className="prayer-now-countdown">{fmtCountdown(minutesUntil(nextPrayer.time))}</div>
          </div>
        </>
      )}

      <div className="section-label">Verse of the Day</div>
      <div className="verse-card">
        <div className="verse-arabic">{verse.ar}</div>
        <div className="verse-translation">{verse.en}</div>
        <div className="verse-ref">— {verse.ref} —</div>
      </div>

      <div className="section-label">Tools</div>
      <div className="actions-grid">
        <button className="action-card" onClick={() => onNavigate('qibla')}>
          <Compass className="action-card-icon" />
          <div className="action-card-title">Qibla</div>
          <div className="action-card-sub">Find the direction</div>
        </button>
        <button className="action-card" onClick={() => onNavigate('quran')}>
          <BookOpen className="action-card-icon" />
          <div className="action-card-title">Quran</div>
          <div className="action-card-sub">Read & reflect</div>
        </button>
        <button className="action-card" onClick={() => onNavigate('scanner')}>
          <ScanLine className="action-card-icon" />
          <div className="action-card-title">Halal Scan</div>
          <div className="action-card-sub">Check ingredients</div>
        </button>
        <button className="action-card" onClick={() => onNavigate('prayers')}>
          <Bell className="action-card-icon" />
          <div className="action-card-title">All Times</div>
          <div className="action-card-sub">Today's schedule</div>
        </button>
      </div>
    </div>
  );
}

/* =============================================================
   PRAYERS VIEW
   ============================================================= */
function PrayersView({ settings, prayerData, nextPrayer, loading, error, requestLocation }) {
  if (!settings.location) {
    return (
      <div className="error" style={{ background: 'transparent', border: 'none', color: 'var(--ink-soft)' }}>
        Please share your location first.
        <div style={{ marginTop: 16 }}>
          <button className="btn-primary" onClick={requestLocation}>
            <MapPin size={16} /> Share Location
          </button>
        </div>
      </div>
    );
  }
  if (loading) return <LoadingDots label="Loading prayer times" />;
  if (error) return <div className="error">{error}</div>;
  if (!prayerData) return null;

  const timings = prayerData.timings;
  return (
    <div>
      <div className="location-bar">
        <MapPin size={12} />
        {settings.locationName || `${settings.location.lat.toFixed(2)}, ${settings.location.lon.toFixed(2)}`}
      </div>

      <div className="section-label">Today's Prayers</div>
      <div className="prayer-list">
        {PRAYERS.map((p, i) => (
          <div
            key={p.key}
            className={`prayer-row ${nextPrayer?.key === p.key && !nextPrayer.tomorrow ? 'active' : ''}`}
          >
            <div className="prayer-row-num">{['i', 'ii', 'iii', 'iv', 'v'][i]}</div>
            <div>
              <div className="prayer-row-name">{p.en}</div>
              <div className="prayer-row-arabic">{p.arabic}</div>
            </div>
            <div className="prayer-row-time">{fmtTime12(timings[p.key])}</div>
          </div>
        ))}
      </div>

      <div className="section-label">Additional Times</div>
      <div className="prayer-list">
        {['Sunrise', 'Sunset', 'Midnight'].filter(k => timings[k]).map(k => (
          <div key={k} className="prayer-row">
            <div></div>
            <div>
              <div className="prayer-row-name" style={{ fontSize: 18, color: 'var(--ink-soft)' }}>{k}</div>
            </div>
            <div className="prayer-row-time" style={{ fontSize: 18 }}>{fmtTime12(timings[k])}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* =============================================================
   QIBLA VIEW
   ============================================================= */
function QiblaView({ settings, requestLocation }) {
  const [heading, setHeading] = useState(null);
  const [orientationGranted, setOrientationGranted] = useState(false);

  const qiblaBearing = settings.location
    ? calculateQibla(settings.location.lat, settings.location.lon)
    : null;

  /* Try to subscribe to deviceorientation. iOS requires permission. */
  useEffect(() => {
    if (!orientationGranted) return;
    function handler(e) {
      // iOS provides webkitCompassHeading (true heading)
      // Other browsers provide alpha (0 = north, but with quirks)
      const h = e.webkitCompassHeading != null ? e.webkitCompassHeading : (360 - (e.alpha || 0));
      setHeading(h);
    }
    window.addEventListener('deviceorientation', handler, true);
    return () => window.removeEventListener('deviceorientation', handler, true);
  }, [orientationGranted]);

  async function enableCompass() {
    // iOS Safari requires explicit permission for orientation
    if (typeof DeviceOrientationEvent !== 'undefined'
        && typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const state = await DeviceOrientationEvent.requestPermission();
        if (state === 'granted') setOrientationGranted(true);
      } catch (e) {
        setOrientationGranted(false);
      }
    } else {
      setOrientationGranted(true);
    }
  }

  if (!settings.location) {
    return (
      <div style={{ textAlign: 'center', padding: 40 }}>
        <p style={{ marginBottom: 20, color: 'var(--ink-soft)' }}>Location required for Qibla direction.</p>
        <button className="btn-primary" onClick={requestLocation}>
          <MapPin size={16} /> Share Location
        </button>
      </div>
    );
  }

  // Rotation: if we have device heading, point needle toward (qibla - heading)
  // Without heading, just point at the qibla bearing from north
  const needleRotation = heading != null ? (qiblaBearing - heading) : qiblaBearing;

  return (
    <div className="qibla-stage">
      <div className="section-label" style={{ alignSelf: 'stretch' }}>Direction to Mecca</div>

      <div className="qibla-compass">
        <div className="compass-ring"></div>
        <div className="compass-label n">N</div>
        <div className="compass-label e">E</div>
        <div className="compass-label s">S</div>
        <div className="compass-label w">W</div>
        <div className="compass-needle" style={{ transform: `rotate(${needleRotation}deg)` }}>
          <div className="compass-needle-arrow"></div>
        </div>
        <div className="compass-center"></div>
      </div>

      <div className="qibla-info">
        <div className="qibla-bearing">
          {Math.round(qiblaBearing)}<span className="qibla-bearing-deg">°</span>
        </div>
        <div className="qibla-instr">
          {heading != null
            ? 'Hold your device flat. The arrow points toward Mecca.'
            : `From your location, the Qibla is ${Math.round(qiblaBearing)}° clockwise from true north.`}
        </div>
        {!orientationGranted && (
          <button className="btn-secondary" style={{ marginTop: 20 }} onClick={enableCompass}>
            Enable Live Compass
          </button>
        )}
      </div>
    </div>
  );
}

/* =============================================================
   QURAN VIEW
   ============================================================= */
function QuranView() {
  const [surahs, setSurahs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    fetch('https://api.quran.com/api/v4/chapters?language=en')
      .then(r => r.ok ? r.json() : Promise.reject(new Error('Failed to load Quran chapters')))
      .then(d => setSurahs(d.chapters))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingDots label="Loading the Quran" />;
  if (error) return <div className="error">{error}</div>;

  if (selected) {
    return <SurahDetail surah={selected} onBack={() => setSelected(null)} />;
  }

  const filtered = surahs?.filter(s =>
    s.name_simple.toLowerCase().includes(search.toLowerCase()) ||
    String(s.id) === search.trim()
  ) || [];

  return (
    <div>
      <div className="section-label">The Quran · 114 Surahs</div>
      <input
        className="surah-search"
        placeholder="Search by name or number"
        value={search}
        onChange={e => setSearch(e.target.value)}
      />
      <div className="surah-list">
        {filtered.map(s => (
          <button key={s.id} className="surah-item" onClick={() => setSelected(s)}>
            <div className="surah-num"><span>{s.id}</span></div>
            <div>
              <div className="surah-name">{s.name_simple}</div>
              <div className="surah-meta">
                {s.translated_name?.name} · {s.verses_count} verses · {s.revelation_place}
              </div>
            </div>
            <div className="surah-arabic">{s.name_arabic}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function SurahDetail({ surah, onBack }) {
  const [verses, setVerses] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Pull Arabic + Sahih International translation (id 20)
    Promise.all([
      fetch(`https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=${surah.id}`).then(r => r.json()),
      fetch(`https://api.quran.com/api/v4/quran/translations/20?chapter_number=${surah.id}`).then(r => r.json())
    ])
      .then(([arabic, english]) => {
        const merged = arabic.verses.map((v, i) => ({
          key: v.verse_key,
          arabic: v.text_uthmani,
          english: english.translations[i]?.text?.replace(/<[^>]+>/g, '') || ''
        }));
        setVerses(merged);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [surah.id]);

  return (
    <div>
      <button className="btn-secondary" onClick={onBack} style={{ marginBottom: 20 }}>← Back</button>

      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div className="surah-arabic" style={{ fontSize: 36 }}>{surah.name_arabic}</div>
        <div className="surah-name" style={{ fontSize: 26, marginTop: 6 }}>{surah.name_simple}</div>
        <div className="surah-meta" style={{ marginTop: 8 }}>{surah.translated_name?.name}</div>
      </div>

      <div className="divider-ornament">◆ ◆ ◆</div>

      {loading && <LoadingDots label="Loading verses" />}
      {error && <div className="error">{error}</div>}

      {verses?.map(v => (
        <div key={v.key} className="verse-card" style={{ marginBottom: 16 }}>
          <div className="verse-arabic" style={{ fontSize: 22 }}>{v.arabic}</div>
          <div className="verse-translation" style={{ fontSize: 16 }}>{v.english}</div>
          <div className="verse-ref">— {v.key} —</div>
        </div>
      ))}
    </div>
  );
}

/* =============================================================
   SCANNER VIEW (manual barcode entry for v1; camera scan is Phase 2)
   ============================================================= */
function ScannerView() {
  const [barcode, setBarcode] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function lookup() {
    if (!barcode.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const r = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode.trim()}.json`);
      const d = await r.json();
      if (d.status !== 1) {
        setError('Product not found in Open Food Facts database.');
      } else {
        const product = d.product;
        const ingredients = product.ingredients_text_en || product.ingredients_text || '';
        const analysis = analyzeIngredients(ingredients);
        setResult({
          name: product.product_name || 'Unnamed Product',
          brand: product.brands || '',
          ingredients,
          ...analysis
        });
      }
    } catch (e) {
      setError('Network error — could not reach the database.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="scanner-stage">
      <div className="section-label" style={{ alignSelf: 'stretch' }}>Halal Check</div>

      <div className="scanner-frame">
        <div className="scanner-frame-corner tl"></div>
        <div className="scanner-frame-corner tr"></div>
        <div className="scanner-frame-corner bl"></div>
        <div className="scanner-frame-corner br"></div>
        <Camera size={48} color="var(--gold)" />
      </div>

      <p style={{ fontSize: 13, color: 'var(--ink-faint)', marginBottom: 16, padding: '0 20px' }}>
        Camera scanning coming soon. Enter a product barcode below to check its ingredients.
      </p>

      <div style={{ display: 'flex', gap: 8, padding: '0 20px', marginBottom: 16 }}>
        <input
          className="surah-search"
          style={{ marginBottom: 0, flex: 1 }}
          placeholder="Enter barcode (e.g. 5449000000996)"
          value={barcode}
          onChange={e => setBarcode(e.target.value)}
          inputMode="numeric"
        />
        <button className="btn-primary" onClick={lookup} disabled={loading}>
          {loading ? '...' : 'Check'}
        </button>
      </div>

      {error && <div className="error" style={{ margin: '0 20px' }}>{error}</div>}

      {result && (
        <div className="scan-result">
          <div className={`scan-result-status ${result.status}`}>
            {result.status === 'halal' && <>✓ Likely Halal</>}
            {result.status === 'haram' && <>✗ Contains Haram</>}
            {result.status === 'mushbooh' && <>! Questionable</>}
          </div>
          <div className="scan-result-product">{result.name}</div>
          {result.brand && <div style={{ fontSize: 12, color: 'var(--ink-faint)', letterSpacing: '0.1em' }}>{result.brand}</div>}
          {result.flags.length > 0 && (
            <div className="scan-result-flag">
              <strong>Flagged ingredients:</strong> {result.flags.join(', ')}
            </div>
          )}
          {result.ingredients && (
            <div className="scan-result-flag" style={{ fontSize: 11, color: 'var(--ink-faint)' }}>
              <strong>All ingredients:</strong> {result.ingredients}
            </div>
          )}
        </div>
      )}

      <div className="scan-disclaimer">
        <strong>Important:</strong> This is an automated screening tool and not a halal certification.
        Ingredients can be sourced from halal or non-halal origins, and recipes change.
        Always verify with the manufacturer or look for certified halal logos before consuming.
      </div>
    </div>
  );
}

/* =============================================================
   SETTINGS VIEW
   ============================================================= */
function SettingsView({ settings, setSettings, requestLocation }) {
  return (
    <div>
      <div className="section-label">Preferences</div>

      <div className="setting-group">
        <div className="setting-row">
          <div>
            <div className="setting-label">Calculation Method</div>
            <div className="setting-desc">Determines how prayer times are calculated</div>
          </div>
          <select
            className="setting-select"
            value={settings.method}
            onChange={e => setSettings(s => ({ ...s, method: Number(e.target.value) }))}
          >
            {CALC_METHODS.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Location</div>
            <div className="setting-desc">
              {settings.location
                ? `${settings.locationName || 'GPS'} (${settings.location.lat.toFixed(2)}, ${settings.location.lon.toFixed(2)})`
                : 'Not set'}
            </div>
          </div>
          <button className="btn-secondary" onClick={requestLocation}>
            {settings.location ? 'Update' : 'Set'}
          </button>
        </div>
      </div>

      <div className="section-label">About</div>
      <div className="setting-group">
        <div className="setting-row">
          <div>
            <div className="setting-label">Noor</div>
            <div className="setting-desc">v1.0 · Built with care</div>
          </div>
          <Sparkles size={18} color="var(--gold)" />
        </div>
        <div className="setting-row">
          <div>
            <div className="setting-label">Data Sources</div>
            <div className="setting-desc">Aladhan · Quran.com · Open Food Facts</div>
          </div>
          <Globe size={18} color="var(--gold)" />
        </div>
      </div>

      <div className="scan-disclaimer" style={{ marginTop: 20 }}>
        Noor is a personal companion tool, not a religious authority. For matters of fiqh,
        please consult qualified scholars.
      </div>
    </div>
  );
}

/* =============================================================
   BOTTOM NAV
   ============================================================= */
function BottomNav({ view, setView }) {
  const tabs = [
    { id: 'home',     icon: Home,      label: 'Home' },
    { id: 'prayers',  icon: Bell,      label: 'Prayers' },
    { id: 'qibla',    icon: Compass,   label: 'Qibla' },
    { id: 'quran',    icon: BookOpen,  label: 'Quran' },
    { id: 'scanner',  icon: ScanLine,  label: 'Scan' }
  ];
  return (
    <nav className="nav">
      {tabs.map(t => {
        const Icon = t.icon;
        return (
          <button
            key={t.id}
            className={`nav-btn ${view === t.id ? 'active' : ''}`}
            onClick={() => setView(t.id)}
          >
            <Icon size={20} />
            <span className="nav-btn-label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

/* =============================================================
   LOADING DOTS
   ============================================================= */
function LoadingDots({ label }) {
  return (
    <div className="loading">
      <div style={{ marginBottom: 12 }}>{label}</div>
      <span className="loading-dot"></span>
      <span className="loading-dot"></span>
      <span className="loading-dot"></span>
    </div>
  );
}
