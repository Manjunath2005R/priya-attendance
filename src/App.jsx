import { useState, useEffect, useCallback, useRef } from "react";

// =============================================
// PRIYA INDUSTRIES ATTENDANCE SYSTEM
// Production App with Supabase + QR + GPS
// =============================================

// --- For demo/preview, we use localStorage as fallback ---
// --- In production, replace these with supabaseClient.js imports ---

const IS_DEMO = true; // Set to false when connected to Supabase

// ---- LOCAL STORAGE HELPERS (Demo Mode) ----
const store = {
  get(k, fb) { try { const d = localStorage.getItem('priya_' + k); return d ? JSON.parse(d) : fb; } catch { return fb; } },
  set(k, v) { localStorage.setItem('priya_' + k, JSON.stringify(v)); },
};

// ---- CONFIG ----
const DEFAULT_SETTINGS = {
  factory_name: 'Priya Industries',
  factory_lat: 13.3379, // ← UPDATE to your factory
  factory_lng: 77.1173, // ← UPDATE to your factory
  gps_radius_meters: 100,
  morning_start: 8,
  morning_end: 11,
  afternoon_start: 14,
  afternoon_end: 15.5,
  manager_pin: '1234',
  working_days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'],
};
const QR_CODE_VALUE = 'PRIYA-IND-ATT-2026';

// ---- DATE/TIME UTILS ----
const toDateStr = (d = new Date()) => d.toISOString().split('T')[0];
const fmtDate = s => new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateShort = s => new Date(s + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const fmtTime = s => new Date(s).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });

function getSession(settings) {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  if (h >= settings.morning_start && h <= settings.morning_end) return 'morning';
  if (h >= settings.afternoon_start && h <= settings.afternoon_end) return 'afternoon';
  return null;
}
function getNextSessionText(settings) {
  const now = new Date();
  const h = now.getHours() + now.getMinutes() / 60;
  if (h < settings.morning_start) return 'Morning scan opens at 8:00 AM';
  if (h > settings.morning_end && h < settings.afternoon_start) return 'Afternoon scan opens at 2:00 PM';
  if (h > settings.afternoon_end) return 'Scanning closed for today. See you tomorrow!';
  return null;
}
function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function dayStatus(records) {
  const m = records.some(r => r.session === 'morning');
  const a = records.some(r => r.session === 'afternoon');
  if (m && a) return { label: 'Full Day', color: '#16a34a', bg: '#dcfce7', val: 1 };
  if (m || a) return { label: 'Half Day', color: '#d97706', bg: '#fef3c7', val: 0.5 };
  return { label: 'Absent', color: '#dc2626', bg: '#fee2e2', val: 0 };
}
function getWeekRange() {
  const today = new Date();
  const dow = today.getDay();
  const daysBack = dow >= 2 ? dow - 2 : dow + 5;
  const tue = new Date(today); tue.setDate(today.getDate() - daysBack);
  const mon = new Date(tue); mon.setDate(tue.getDate() + 5); // Saturday end
  return { start: toDateStr(tue), end: toDateStr(mon) };
}

// ---- MAIN APP ----
export default function App() {
  const [view, setView] = useState('splash');
  const [settings, setSettings] = useState(() => store.get('settings', DEFAULT_SETTINGS));
  const [workers, setWorkers] = useState(() => store.get('workers', [
    { id: 'W001', name: 'Ravi Kumar', pin: '1001' },
    { id: 'W002', name: 'Suresh M', pin: '1002' },
    { id: 'W003', name: 'Manjunath R', pin: '1003' },
    { id: 'W004', name: 'Venkatesh S', pin: '1004' },
    { id: 'W005', name: 'Prakash N', pin: '1005' },
  ]));
  const [attendance, setAttendance] = useState(() => store.get('attendance', []));
  const [user, setUser] = useState(() => store.get('user', null));
  const [detailWorker, setDetailWorker] = useState(null);

  useEffect(() => { store.set('settings', settings); }, [settings]);
  useEffect(() => { store.set('workers', workers); }, [workers]);
  useEffect(() => { store.set('attendance', attendance); }, [attendance]);
  useEffect(() => { store.set('user', user); }, [user]);
  useEffect(() => { setTimeout(() => setView(user ? 'worker_home' : 'roles'), 1800); }, []);

  const mark = useCallback((wid, session, lat, lng, by = 'scan', reason = '') => {
    const rec = { worker_id: wid, date: toDateStr(), session, scan_time: new Date().toISOString(), latitude: lat, longitude: lng, marked_by: by, manual_reason: reason };
    setAttendance(p => [...p, rec]);
  }, []);

  const scanned = useCallback((wid, session) => {
    const today = toDateStr();
    return attendance.some(a => a.worker_id === wid && a.date === today && a.session === session);
  }, [attendance]);

  const logout = () => { setUser(null); store.set('user', null); setView('roles'); };

  const ctx = { view, setView, settings, setSettings, workers, setWorkers, attendance, setAttendance, user, setUser, mark, scanned, logout, detailWorker, setDetailWorker };

  return (
    <div style={S.app}>
      <style>{globalCSS}</style>
      {view === 'splash' && <Splash />}
      {view === 'roles' && <Roles {...ctx} />}
      {view === 'w_login' && <WorkerLogin {...ctx} />}
      {view === 'worker_home' && <WorkerHome {...ctx} />}
      {view === 'w_scan' && <WorkerScan {...ctx} />}
      {view === 'w_history' && <WorkerHistory {...ctx} />}
      {view === 'm_login' && <ManagerLogin {...ctx} />}
      {view === 'mgr' && <ManagerDash {...ctx} />}
      {view === 'm_workers' && <ManageWorkers {...ctx} />}
      {view === 'm_report' && <WeeklyReport {...ctx} />}
      {view === 'm_worker_detail' && <WorkerDetail {...ctx} />}
      {view === 'm_override' && <ManualOverride {...ctx} />}
      {view === 'm_settings' && <SettingsPage {...ctx} />}
      {view === 'm_qr' && <QRCodePage {...ctx} />}
    </div>
  );
}

// ---- SPLASH ----
function Splash() {
  return (
    <div style={S.splash}>
      <div className="fadeIn">
        <div style={S.splashLogo}>
          <svg width="72" height="72" viewBox="0 0 80 80"><rect width="80" height="80" rx="18" fill="#16613a"/><path d="M24 56L40 24L56 56Z" fill="none" stroke="#EAB308" strokeWidth="2.5"/><circle cx="40" cy="37" r="5.5" fill="#EAB308"/><rect x="22" y="60" width="36" height="2.5" rx="1.25" fill="#EAB308" opacity=".5"/></svg>
        </div>
        <h1 style={S.splashTitle}>Priya Industries</h1>
        <p style={S.splashSub}>Attendance Management System</p>
        <div style={S.loaderTrack}><div style={S.loaderThumb} className="slideLoader"/></div>
      </div>
    </div>
  );
}

// ---- ROLE SELECT ----
function Roles({ setView }) {
  return (
    <div style={S.center} className="fadeIn">
      <svg width="52" height="52" viewBox="0 0 80 80"><rect width="80" height="80" rx="18" fill="#16613a"/><path d="M24 56L40 24L56 56Z" fill="none" stroke="#EAB308" strokeWidth="2.5"/><circle cx="40" cy="37" r="5.5" fill="#EAB308"/></svg>
      <h2 style={S.title}>Priya Industries</h2>
      <p style={S.sub}>Select your role</p>
      <div style={S.roleRow}>
        <button className="card-hover" style={S.roleCard} onClick={() => setView('w_login')}>
          <div style={S.iconCircle}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16613a" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
          <strong style={{color:'#16613a',fontSize:15}}>Worker</strong>
          <span style={{fontSize:12,color:'#888'}}>Scan & mark attendance</span>
        </button>
        <button className="card-hover" style={S.roleCard} onClick={() => setView('m_login')}>
          <div style={S.iconCircle}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16613a" strokeWidth="1.5"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></div>
          <strong style={{color:'#16613a',fontSize:15}}>Manager</strong>
          <span style={{fontSize:12,color:'#888'}}>Dashboard & reports</span>
        </button>
      </div>
    </div>
  );
}

// ---- WORKER LOGIN ----
function WorkerLogin({ workers, setUser, setView }) {
  const [wid, setWid] = useState('');
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const go = () => {
    const w = workers.find(x => x.id.toLowerCase() === wid.trim().toLowerCase() && x.pin === pin);
    if (w) { setUser(w); setView('worker_home'); }
    else setErr('Invalid Worker ID or PIN');
  };
  return (
    <div style={S.center} className="fadeIn">
      <button style={S.back} onClick={() => setView('roles')}>← Back</button>
      <div style={S.iconCircle}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16613a" strokeWidth="1.5"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>
      <h2 style={S.title}>Worker Login</h2>
      <p style={S.sub}>Enter your Worker ID and PIN</p>
      <div style={S.form}>
        <label style={S.label}>Worker ID</label>
        <input style={S.input} placeholder="e.g. W001" value={wid} onChange={e => setWid(e.target.value)} />
        <label style={S.label}>PIN</label>
        <input style={S.input} type="password" placeholder="4-digit PIN" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key === 'Enter' && go()} />
        {err && <p style={S.err}>{err}</p>}
        <button style={S.btn} onClick={go}>Login</button>
      </div>
    </div>
  );
}

// ---- WORKER HOME ----
function WorkerHome({ user, scanned, attendance, settings, setView, logout }) {
  if (!user) { setView('roles'); return null; }
  const session = getSession(settings);
  const today = toDateStr();
  const todayRecs = attendance.filter(a => a.worker_id === user.id && a.date === today);
  const am = scanned(user.id, 'morning');
  const pm = scanned(user.id, 'afternoon');

  const month = today.substring(0, 7);
  const monthRecs = attendance.filter(a => a.worker_id === user.id && a.date.startsWith(month));
  const byDate = {};
  monthRecs.forEach(r => { if (!byDate[r.date]) byDate[r.date] = []; byDate[r.date].push(r); });
  let mDays = 0;
  Object.values(byDate).forEach(recs => { mDays += dayStatus(recs).val; });

  return (
    <div style={S.page} className="fadeIn">
      <div style={S.topBar}>
        <div>
          <p style={{margin:0,fontSize:13,color:'#888'}}>Welcome back,</p>
          <h2 style={{margin:'2px 0 0',fontSize:20,fontWeight:700,color:'#111'}}>{user.name}</h2>
          <p style={{margin:'2px 0 0',fontSize:12,color:'#aaa'}}>ID: {user.id}</p>
        </div>
        <button style={S.outBtn} onClick={logout}>Logout</button>
      </div>

      {/* Today's card */}
      <div style={S.card}>
        <p style={{margin:'0 0 10px',fontSize:12,fontWeight:600,color:'#999',textTransform:'uppercase',letterSpacing:1}}>Today — {fmtDateShort(today)}</p>
        <div style={{display:'flex',gap:10}}>
          <div style={{...S.chip, background: am ? '#dcfce7' : '#f9fafb'}}>
            <span style={{fontWeight:700,color: am ? '#16a34a' : '#bbb'}}>{am ? '✓' : '○'} Morning</span>
            {am && todayRecs.find(r => r.session==='morning') && <span style={{fontSize:11,color:'#888'}}>{fmtTime(todayRecs.find(r => r.session==='morning').scan_time)}</span>}
          </div>
          <div style={{...S.chip, background: pm ? '#dcfce7' : '#f9fafb'}}>
            <span style={{fontWeight:700,color: pm ? '#16a34a' : '#bbb'}}>{pm ? '✓' : '○'} Afternoon</span>
            {pm && todayRecs.find(r => r.session==='afternoon') && <span style={{fontSize:11,color:'#888'}}>{fmtTime(todayRecs.find(r => r.session==='afternoon').scan_time)}</span>}
          </div>
        </div>
      </div>

      {/* Month counter */}
      <div style={{textAlign:'center',padding:'12px 0 16px'}}>
        <span style={{fontSize:36,fontWeight:800,color:'#16613a'}}>{mDays}</span>
        <span style={{display:'block',fontSize:12,color:'#888'}}>effective days this month</span>
      </div>

      {/* Scan button */}
      {session && !scanned(user.id, session) ? (
        <button style={S.scanBtn} className="card-hover" onClick={() => setView('w_scan')}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/></svg>
          <span>Scan QR — {session === 'morning' ? 'Morning' : 'Afternoon'}</span>
        </button>
      ) : session && scanned(user.id, session) ? (
        <div style={{textAlign:'center',padding:'14px 20px',background:'#dcfce7',borderRadius:14,color:'#16a34a',fontWeight:600}}>
          ✓ {session === 'morning' ? 'Morning' : 'Afternoon'} scan completed
        </div>
      ) : (
        <div style={{textAlign:'center',padding:'14px 20px',background:'#f3f4f6',borderRadius:14,color:'#6b7280',fontSize:14}}>
          {getNextSessionText(settings)}
        </div>
      )}

      <button style={S.secBtn} onClick={() => setView('w_history')}>📋 View My Attendance History</button>
    </div>
  );
}

// ---- QR SCANNER ----
function WorkerScan({ user, settings, scanned, mark, setView }) {
  const [phase, setPhase] = useState('ready'); // ready|camera|verifying|success|fail
  const [failMsg, setFailMsg] = useState('');
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const animRef = useRef(null);
  const canvasRef = useRef(null);
  const session = getSession(settings);

  const stopCam = useCallback(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => () => stopCam(), [stopCam]);

  if (!session) return (
    <div style={S.center} className="fadeIn">
      <button style={S.back} onClick={() => setView('worker_home')}>← Back</button>
      <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/></svg>
      <h3 style={{color:'#666',marginTop:12}}>No Active Session</h3>
      <p style={{color:'#999'}}>{getNextSessionText(settings)}</p>
    </div>
  );

  if (scanned(user.id, session)) return (
    <div style={S.center} className="fadeIn">
      <button style={S.back} onClick={() => setView('worker_home')}>← Back</button>
      <div style={S.bigCheck}>✓</div>
      <h3 style={{color:'#16a34a',marginTop:12}}>Already Scanned!</h3>
      <p style={{color:'#888'}}>{session === 'morning' ? 'Morning' : 'Afternoon'} attendance already marked.</p>
    </div>
  );

  const startCam = async () => {
    setPhase('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } } });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; videoRef.current.play(); }
      // In production: use jsQR to auto-detect. For now: manual confirm button.
      // To add jsQR: npm install jsqr, then scan frames in a requestAnimationFrame loop
    } catch {
      setPhase('fail');
      setFailMsg('Camera access denied. Please allow camera permission in your browser settings, then try again.');
    }
  };

  const verifyGPS = () => {
    stopCam();
    setPhase('verifying');
    if (!navigator.geolocation) {
      setPhase('fail'); setFailMsg('GPS not available. Please enable location services.'); return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const dist = haversine(pos.coords.latitude, pos.coords.longitude, settings.factory_lat, settings.factory_lng);
        if (dist <= settings.gps_radius_meters) {
          mark(user.id, session, pos.coords.latitude, pos.coords.longitude);
          setPhase('success');
        } else {
          setPhase('fail');
          setFailMsg(`You are ${Math.round(dist)}m away from the factory. Must be within ${settings.gps_radius_meters}m.`);
        }
      },
      err => {
        setPhase('fail');
        setFailMsg(err.code === 1 ? 'Location permission denied. Please allow GPS access.' : 'Cannot determine location. Ensure GPS is on and try again.');
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  return (
    <div style={S.scanPage} className="fadeIn">
      <button style={{...S.back, color:'white', zIndex:10}} onClick={() => { stopCam(); setView('worker_home'); }}>← Back</button>

      {phase === 'ready' && (
        <div style={S.center}>
          <svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="#16613a" strokeWidth="1.2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/></svg>
          <h3 style={{color:'#16613a',margin:'16px 0 6px'}}>{session === 'morning' ? 'Morning' : 'Afternoon'} Scan</h3>
          <p style={{color:'#888',marginBottom:24,textAlign:'center'}}>Point your camera at the QR code at the factory entrance</p>
          <button style={S.btn} onClick={startCam}>📷 Open Camera</button>
          <p style={{fontSize:11,color:'#bbb',marginTop:12}}>Camera & GPS permission required</p>
        </div>
      )}

      {phase === 'camera' && (
        <div style={{width:'100%',position:'relative'}}>
          <video ref={videoRef} style={{width:'100%',borderRadius:16,display:'block'}} playsInline muted />
          <canvas ref={canvasRef} style={{display:'none'}} />
          <div style={{position:'absolute',inset:0,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center'}}>
            <div style={{width:200,height:200,border:'3px solid rgba(255,255,255,0.8)',borderRadius:20,boxShadow:'0 0 0 9999px rgba(0,0,0,0.45)'}} />
            <p style={{color:'white',fontSize:13,marginTop:14,textShadow:'0 1px 4px rgba(0,0,0,0.6)'}}>Align QR code in the frame</p>
          </div>
          <div style={{padding:'16px 20px'}}>
            <button style={{...S.btn,background:'#16a34a'}} onClick={verifyGPS}>✓ QR Scanned — Verify Location</button>
            <p style={{fontSize:11,color:'rgba(255,255,255,0.6)',textAlign:'center',marginTop:8}}>Tap after pointing at the factory QR code</p>
          </div>
        </div>
      )}

      {phase === 'verifying' && (
        <div style={S.center}>
          <div className="spin" style={{width:48,height:48,border:'4px solid #e5e7eb',borderTopColor:'#16613a',borderRadius:'50%'}} />
          <h3 style={{color:'#16613a',marginTop:16}}>Verifying Location...</h3>
          <p style={{color:'#888'}}>Confirming you're at the factory</p>
        </div>
      )}

      {phase === 'success' && (
        <div style={S.center}>
          <div style={{...S.bigCheck,width:80,height:80,fontSize:40}}>✓</div>
          <h3 style={{color:'#16a34a',marginTop:16,fontSize:22}}>Attendance Marked!</h3>
          <p style={{color:'#888',marginBottom:24}}>{session === 'morning' ? 'Morning' : 'Afternoon'} scan recorded at {fmtTime(new Date().toISOString())}</p>
          <button style={S.btn} onClick={() => setView('worker_home')}>Done</button>
        </div>
      )}

      {phase === 'fail' && (
        <div style={S.center}>
          <div style={{...S.bigCheck,background:'#fee2e2',color:'#dc2626',width:80,height:80,fontSize:40}}>✗</div>
          <h3 style={{color:'#dc2626',marginTop:16}}>Scan Failed</h3>
          <p style={{color:'#888',marginBottom:24,textAlign:'center',maxWidth:300}}>{failMsg}</p>
          <button style={S.btn} onClick={() => setPhase('ready')}>Try Again</button>
        </div>
      )}
    </div>
  );
}

// ---- WORKER HISTORY ----
function WorkerHistory({ user, attendance, setView }) {
  const recs = attendance.filter(a => a.worker_id === user.id);
  const byDate = {};
  recs.forEach(r => { if (!byDate[r.date]) byDate[r.date] = []; byDate[r.date].push(r); });
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
  let total = 0;
  dates.forEach(d => { total += dayStatus(byDate[d]).val; });

  return (
    <div style={S.page} className="fadeIn">
      <button style={S.back} onClick={() => setView('worker_home')}>← Back</button>
      <h2 style={{...S.title,marginTop:36}}>My Attendance</h2>
      <div style={S.statRow}>
        <div style={S.statBox}><span style={S.statN}>{dates.length}</span><span style={S.statL}>Days Logged</span></div>
        <div style={S.statBox}><span style={S.statN}>{total}</span><span style={S.statL}>Effective Days</span></div>
      </div>
      <div style={S.list}>
        {dates.length === 0 && <p style={{textAlign:'center',color:'#bbb',padding:20}}>No records yet. Start scanning!</p>}
        {dates.map(d => {
          const dr = byDate[d]; const st = dayStatus(dr);
          return (
            <div key={d} style={S.listItem}>
              <div>
                <p style={{margin:0,fontSize:14,fontWeight:600,color:'#333'}}>{fmtDateShort(d)}</p>
                <div style={{display:'flex',gap:8,marginTop:4}}>
                  {dr.map((r,i) => <span key={i} style={{fontSize:12,color:'#888'}}>{r.session==='morning'?'🌅':'🌇'} {fmtTime(r.scan_time)} {r.marked_by==='manual'?'(manual)':''}</span>)}
                </div>
              </div>
              <span style={{padding:'4px 10px',borderRadius:8,fontSize:12,fontWeight:600,background:st.bg,color:st.color}}>{st.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- MANAGER LOGIN ----
function ManagerLogin({ settings, setView }) {
  const [pin, setPin] = useState('');
  const [err, setErr] = useState('');
  const go = () => { if (pin === settings.manager_pin) setView('mgr'); else setErr('Incorrect PIN'); };
  return (
    <div style={S.center} className="fadeIn">
      <button style={S.back} onClick={() => setView('roles')}>← Back</button>
      <div style={S.iconCircle}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16613a" strokeWidth="1.5"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg></div>
      <h2 style={S.title}>Manager Login</h2>
      <div style={S.form}>
        <label style={S.label}>PIN</label>
        <input style={S.input} type="password" placeholder="Enter manager PIN" value={pin} onChange={e => setPin(e.target.value)} onKeyDown={e => e.key==='Enter'&&go()} />
        {err && <p style={S.err}>{err}</p>}
        <button style={S.btn} onClick={go}>Login</button>
        <p style={{fontSize:12,color:'#bbb',textAlign:'center',marginTop:8}}>Default PIN: 1234</p>
      </div>
    </div>
  );
}

// ---- MANAGER DASHBOARD ----
function ManagerDash({ workers, attendance, settings, setView }) {
  const today = toDateStr();
  const todayRecs = attendance.filter(a => a.date === today);
  const session = getSession(settings);

  const wStatus = workers.map(w => {
    const r = todayRecs.filter(x => x.worker_id === w.id);
    return { ...w, am: r.find(x => x.session === 'morning'), pm: r.find(x => x.session === 'afternoon'), status: dayStatus(r) };
  });
  const present = wStatus.filter(w => w.am || w.pm).length;
  const absent = workers.length - present;

  return (
    <div style={S.page} className="fadeIn">
      <div style={S.topBar}>
        <div><h2 style={{margin:0,fontSize:22,fontWeight:800,color:'#111'}}>Dashboard</h2><p style={{margin:'2px 0 0',fontSize:13,color:'#999'}}>{fmtDate(today)}</p></div>
        <button style={S.outBtn} onClick={() => setView('roles')}>Logout</button>
      </div>

      {/* Stats */}
      <div style={{display:'flex',gap:8,margin:'0 0 20px'}}>
        <div style={{...S.miniStat}}><span style={{fontSize:24,fontWeight:800,color:'#16613a'}}>{workers.length}</span><span style={{fontSize:11,color:'#999'}}>Total</span></div>
        <div style={{...S.miniStat,background:'#dcfce7'}}><span style={{fontSize:24,fontWeight:800,color:'#16a34a'}}>{present}</span><span style={{fontSize:11,color:'#666'}}>Present</span></div>
        <div style={{...S.miniStat,background:'#fee2e2'}}><span style={{fontSize:24,fontWeight:800,color:'#dc2626'}}>{absent}</span><span style={{fontSize:11,color:'#666'}}>Absent</span></div>
      </div>

      {/* Session indicator */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',margin:'0 0 10px'}}>
        <h3 style={{margin:0,fontSize:15,fontWeight:700,color:'#444'}}>Today's Attendance</h3>
        <span style={{fontSize:12,color: session ? '#16a34a' : '#dc2626'}}>{session ? `🟢 ${session} scan open` : '🔴 Scan closed'}</span>
      </div>

      {/* Worker list */}
      <div style={S.list}>
        {wStatus.map(w => (
          <div key={w.id} style={S.listItem}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={{...S.avatar, background: w.am||w.pm ? '#dcfce7' : '#fee2e2'}}>{w.name[0]}</div>
              <div><p style={{margin:0,fontSize:14,fontWeight:600,color:'#333'}}>{w.name}</p><p style={{margin:0,fontSize:11,color:'#aaa'}}>{w.id}</p></div>
            </div>
            <div style={{display:'flex',gap:5}}>
              <span style={{...S.miniChip, background: w.am?'#dcfce7':'#f3f4f6', color: w.am?'#16a34a':'#ccc'}}>{w.am?'✓':'—'} AM</span>
              <span style={{...S.miniChip, background: w.pm?'#dcfce7':'#f3f4f6', color: w.pm?'#16a34a':'#ccc'}}>{w.pm?'✓':'—'} PM</span>
            </div>
          </div>
        ))}
      </div>

      {/* Nav buttons */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,margin:'16px 0'}}>
        {[
          { label: '👥 Workers', v: 'm_workers' },
          { label: '📊 Weekly Report', v: 'm_report' },
          { label: '✏️ Manual Mark', v: 'm_override' },
          { label: '⚙️ Settings', v: 'm_settings' },
        ].map(n => (
          <button key={n.v} className="card-hover" style={S.navCard} onClick={() => setView(n.v)}>{n.label}</button>
        ))}
      </div>
      <button className="card-hover" style={{...S.navCard,width:'100%'}} onClick={() => setView('m_qr')}>🖨️ View / Print QR Code</button>
    </div>
  );
}

// ---- MANAGE WORKERS ----
function ManageWorkers({ workers, setWorkers, setView }) {
  const [show, setShow] = useState(false);
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [msg, setMsg] = useState('');

  const add = () => {
    if (!name.trim() || !pin.trim()) return;
    const maxNum = workers.reduce((mx, w) => { const n = parseInt(w.id.replace('W', '')); return n > mx ? n : mx; }, 0);
    const nid = 'W' + String(maxNum + 1).padStart(3, '0');
    setWorkers(p => [...p, { id: nid, name: name.trim(), pin }]);
    setMsg(`✓ ${name.trim()} added as ${nid}`);
    setName(''); setPin(''); setShow(false);
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <div style={S.page} className="fadeIn">
      <button style={S.back} onClick={() => setView('mgr')}>← Dashboard</button>
      <h2 style={{...S.title,marginTop:36}}>Manage Workers</h2>
      <p style={S.sub}>{workers.length} registered workers</p>
      {msg && <div style={{padding:'10px 16px',background:'#dcfce7',borderRadius:10,color:'#16a34a',fontWeight:600,textAlign:'center',marginBottom:12}}>{msg}</div>}
      <button style={{...S.btn,marginBottom:16}} onClick={() => setShow(!show)}>{show ? 'Cancel' : '+ Add Worker'}</button>
      {show && (
        <div style={{...S.card,marginBottom:16}}>
          <input style={S.input} placeholder="Worker name" value={name} onChange={e => setName(e.target.value)} />
          <input style={S.input} placeholder="4-digit PIN" value={pin} onChange={e => setPin(e.target.value)} maxLength={4} />
          <button style={{...S.btn,marginTop:4}} onClick={add}>Add</button>
        </div>
      )}
      <div style={S.list}>
        {workers.map(w => (
          <div key={w.id} style={S.listItem}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={S.avatar}>{w.name[0]}</div>
              <div><p style={{margin:0,fontSize:14,fontWeight:600,color:'#333'}}>{w.name}</p><p style={{margin:0,fontSize:11,color:'#aaa'}}>{w.id} · PIN: {w.pin}</p></div>
            </div>
            <button style={{background:'none',border:'1px solid #fca5a5',borderRadius:8,padding:'3px 10px',color:'#dc2626',fontSize:12,cursor:'pointer'}} onClick={() => { if (confirm('Remove ' + w.name + '?')) setWorkers(p => p.filter(x => x.id !== w.id)); }}>Remove</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---- WEEKLY REPORT (Tuesday) ----
function WeeklyReport({ workers, attendance, setView, setDetailWorker }) {
  const range = getWeekRange();
  const weekRecs = attendance.filter(a => a.date >= range.start && a.date <= range.end);

  const report = workers.map(w => {
    const wr = weekRecs.filter(r => r.worker_id === w.id);
    const byDate = {};
    wr.forEach(r => { if (!byDate[r.date]) byDate[r.date] = []; byDate[r.date].push(r); });
    let full = 0, half = 0;
    Object.values(byDate).forEach(d => {
      const s = d.map(r => r.session);
      if (s.includes('morning') && s.includes('afternoon')) full++;
      else half++;
    });
    return { ...w, full, half, total: full + half * 0.5 };
  }).sort((a, b) => b.total - a.total);

  const isTuesday = new Date().getDay() === 2;

  return (
    <div style={S.page} className="fadeIn">
      <button style={S.back} onClick={() => setView('mgr')}>← Dashboard</button>
      <h2 style={{...S.title,marginTop:36}}>Weekly Report</h2>
      <p style={S.sub}>{fmtDateShort(range.start)} → {fmtDateShort(range.end)}</p>
      {isTuesday && <div style={{padding:'8px 14px',background:'#EAB308',borderRadius:10,color:'white',fontWeight:600,textAlign:'center',marginBottom:12,fontSize:13}}>📅 Today is Tuesday — Payment day!</div>}

      <div style={{...S.card,padding:'10px 14px',marginBottom:12,background:'#f0fdf4'}}>
        <div style={{display:'flex',justifyContent:'space-between'}}>
          <span style={{fontWeight:700,fontSize:13,color:'#16613a'}}>Worker</span>
          <div style={{display:'flex',gap:20}}>
            <span style={{fontWeight:700,fontSize:13,color:'#16613a',width:40,textAlign:'center'}}>Full</span>
            <span style={{fontWeight:700,fontSize:13,color:'#d97706',width:40,textAlign:'center'}}>Half</span>
            <span style={{fontWeight:700,fontSize:13,color:'#111',width:50,textAlign:'center'}}>Total</span>
          </div>
        </div>
      </div>

      <div style={S.list}>
        {report.map(w => (
          <button key={w.id} style={{...S.listItem,border:'none',cursor:'pointer',textAlign:'left',width:'100%'}} onClick={() => { setDetailWorker(w); setView('m_worker_detail'); }}>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <div style={S.avatar}>{w.name[0]}</div>
              <div><p style={{margin:0,fontSize:13,fontWeight:600,color:'#333'}}>{w.name}</p><p style={{margin:0,fontSize:11,color:'#aaa'}}>{w.id}</p></div>
            </div>
            <div style={{display:'flex',gap:20}}>
              <span style={{width:40,textAlign:'center',fontWeight:700,color:'#16a34a'}}>{w.full}</span>
              <span style={{width:40,textAlign:'center',fontWeight:700,color:'#d97706'}}>{w.half}</span>
              <span style={{width:50,textAlign:'center',fontWeight:800,color:'#111',fontSize:16}}>{w.total}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ---- WORKER DETAIL (from manager) ----
function WorkerDetail({ detailWorker, attendance, setView }) {
  if (!detailWorker) { setView('mgr'); return null; }
  const recs = attendance.filter(a => a.worker_id === detailWorker.id);
  const byDate = {};
  recs.forEach(r => { if (!byDate[r.date]) byDate[r.date] = []; byDate[r.date].push(r); });
  const dates = Object.keys(byDate).sort((a, b) => b.localeCompare(a));
  let total = 0;
  dates.forEach(d => { total += dayStatus(byDate[d]).val; });

  return (
    <div style={S.page} className="fadeIn">
      <button style={S.back} onClick={() => setView('m_report')}>← Report</button>
      <h2 style={{...S.title,marginTop:36}}>{detailWorker.name}</h2>
      <p style={S.sub}>{detailWorker.id}</p>
      <div style={S.statRow}>
        <div style={S.statBox}><span style={S.statN}>{dates.length}</span><span style={S.statL}>Days Logged</span></div>
        <div style={S.statBox}><span style={S.statN}>{total}</span><span style={S.statL}>Effective Days</span></div>
      </div>
      <div style={S.list}>
        {dates.map(d => {
          const dr = byDate[d]; const st = dayStatus(dr);
          return (
            <div key={d} style={S.listItem}>
              <div>
                <p style={{margin:0,fontSize:14,fontWeight:600,color:'#333'}}>{fmtDateShort(d)}</p>
                <div style={{display:'flex',gap:8,marginTop:4}}>
                  {dr.map((r,i) => <span key={i} style={{fontSize:12,color:'#888'}}>{r.session==='morning'?'🌅':'🌇'} {fmtTime(r.scan_time)} {r.marked_by==='manual'?' (manual)':''}</span>)}
                </div>
              </div>
              <span style={{padding:'4px 10px',borderRadius:8,fontSize:12,fontWeight:600,background:st.bg,color:st.color}}>{st.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---- MANUAL OVERRIDE ----
function ManualOverride({ workers, attendance, mark, scanned, setView }) {
  const [sel, setSel] = useState('');
  const [session, setSession] = useState('morning');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState('');

  const doMark = () => {
    if (!sel || !reason.trim()) return;
    if (scanned(sel, session)) { setMsg('⚠️ Already marked for this session!'); setTimeout(() => setMsg(''), 3000); return; }
    mark(sel, session, 0, 0, 'manual', reason.trim());
    const w = workers.find(x => x.id === sel);
    setMsg(`✓ ${session} attendance marked for ${w?.name}`);
    setReason('');
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <div style={S.page} className="fadeIn">
      <button style={S.back} onClick={() => setView('mgr')}>← Dashboard</button>
      <h2 style={{...S.title,marginTop:36}}>Manual Override</h2>
      <p style={S.sub}>Mark attendance when worker's phone is unavailable</p>

      {msg && <div style={{padding:'10px 14px',background: msg.startsWith('⚠') ? '#fef3c7' : '#dcfce7',borderRadius:10,fontWeight:600,textAlign:'center',marginBottom:12,color: msg.startsWith('⚠') ? '#92400e' : '#16a34a'}}>{msg}</div>}

      <div style={S.card}>
        <label style={S.label}>Select Worker</label>
        <select style={S.input} value={sel} onChange={e => setSel(e.target.value)}>
          <option value="">-- Choose worker --</option>
          {workers.map(w => <option key={w.id} value={w.id}>{w.name} ({w.id})</option>)}
        </select>

        <label style={S.label}>Session</label>
        <div style={{display:'flex',gap:8,marginBottom:12}}>
          <button style={{...S.miniChip,flex:1,padding:'10px',cursor:'pointer',fontWeight:700,background: session==='morning'?'#16613a':'#f3f4f6',color: session==='morning'?'white':'#888'}} onClick={() => setSession('morning')}>Morning</button>
          <button style={{...S.miniChip,flex:1,padding:'10px',cursor:'pointer',fontWeight:700,background: session==='afternoon'?'#16613a':'#f3f4f6',color: session==='afternoon'?'white':'#888'}} onClick={() => setSession('afternoon')}>Afternoon</button>
        </div>

        <label style={S.label}>Reason</label>
        <input style={S.input} placeholder="e.g. Phone was dead" value={reason} onChange={e => setReason(e.target.value)} />

        <button style={{...S.btn,marginTop:8}} onClick={doMark}>Mark Attendance</button>
      </div>
    </div>
  );
}

// ---- SETTINGS ----
function SettingsPage({ settings, setSettings, setView }) {
  const [lat, setLat] = useState(String(settings.factory_lat));
  const [lng, setLng] = useState(String(settings.factory_lng));
  const [pin, setPin] = useState(settings.manager_pin);
  const [radius, setRadius] = useState(String(settings.gps_radius_meters));
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSettings(p => ({ ...p, factory_lat: parseFloat(lat), factory_lng: parseFloat(lng), manager_pin: pin, gps_radius_meters: parseInt(radius) }));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={S.page} className="fadeIn">
      <button style={S.back} onClick={() => setView('mgr')}>← Dashboard</button>
      <h2 style={{...S.title,marginTop:36}}>Settings</h2>
      {saved && <div style={{padding:'10px',background:'#dcfce7',borderRadius:10,color:'#16a34a',fontWeight:600,textAlign:'center',marginBottom:12}}>✓ Settings saved!</div>}
      <div style={S.card}>
        <label style={S.label}>Factory Latitude</label>
        <input style={S.input} value={lat} onChange={e => setLat(e.target.value)} />
        <label style={S.label}>Factory Longitude</label>
        <input style={S.input} value={lng} onChange={e => setLng(e.target.value)} />
        <label style={S.label}>GPS Radius (meters)</label>
        <input style={S.input} value={radius} onChange={e => setRadius(e.target.value)} />
        <label style={S.label}>Manager PIN</label>
        <input style={S.input} value={pin} onChange={e => setPin(e.target.value)} />
        <button style={{...S.btn,marginTop:8}} onClick={save}>Save Settings</button>
      </div>
      <p style={{fontSize:12,color:'#bbb',textAlign:'center',marginTop:12}}>To find your factory coordinates: Open Google Maps → Long press on your location → Copy the numbers</p>
    </div>
  );
}

// ---- QR CODE PAGE ----
function QRCodePage({ setView }) {
  // Generate a simple QR code SVG for the factory
  // In production, use a QR library. This generates a visual placeholder with the code value.
  return (
    <div style={S.page} className="fadeIn">
      <button style={S.back} onClick={() => setView('mgr')}>← Dashboard</button>
      <h2 style={{...S.title,marginTop:36}}>Factory QR Code</h2>
      <p style={S.sub}>Print this and stick at the entrance</p>

      <div style={{background:'white',padding:32,borderRadius:20,boxShadow:'0 4px 20px rgba(0,0,0,0.1)',textAlign:'center',margin:'16px 0'}}>
        <div style={{border:'3px solid #16613a',borderRadius:16,padding:20,display:'inline-block'}}>
          {/* QR Code visual representation */}
          <svg viewBox="0 0 200 200" width="180" height="180">
            {/* Simplified QR pattern */}
            <rect width="200" height="200" fill="white"/>
            {/* Position patterns */}
            <rect x="10" y="10" width="50" height="50" rx="4" fill="none" stroke="#16613a" strokeWidth="6"/>
            <rect x="22" y="22" width="26" height="26" rx="2" fill="#16613a"/>
            <rect x="140" y="10" width="50" height="50" rx="4" fill="none" stroke="#16613a" strokeWidth="6"/>
            <rect x="152" y="22" width="26" height="26" rx="2" fill="#16613a"/>
            <rect x="10" y="140" width="50" height="50" rx="4" fill="none" stroke="#16613a" strokeWidth="6"/>
            <rect x="22" y="152" width="26" height="26" rx="2" fill="#16613a"/>
            {/* Data modules */}
            {[70,80,90,100,110,120].map(x => [70,80,90,100,110,120,130,140,150,160].map(y =>
              (x+y)%20===0 || (x*y)%7===0 ? <rect key={x+'-'+y} x={x} y={y} width="8" height="8" fill="#16613a" rx="1"/> : null
            ))}
            {[10,20,30,40,50,60,70,80,90,100,110,120,130,140,150,160,170,180].map(x =>
              x%20===0 ? <rect key={'h'+x} x={x} y="68" width="8" height="3" fill="#16613a" rx="0.5"/> : null
            )}
            {[70,80,90,100,110,120,130].map(y =>
              <rect key={'v'+y} x="68" y={y} width="3" height="8" fill="#16613a" rx="0.5"/>
            )}
            <rect x="140" y="140" width="12" height="12" rx="2" fill="#16613a"/>
            <rect x="155" y="140" width="8" height="8" fill="#16613a"/>
            <rect x="140" y="155" width="8" height="8" fill="#16613a"/>
            <rect x="160" y="160" width="12" height="12" rx="2" fill="#16613a"/>
            <rect x="170" y="145" width="8" height="8" fill="#16613a"/>
            <rect x="145" y="170" width="8" height="8" fill="#16613a"/>
          </svg>
        </div>
        <p style={{margin:'16px 0 4px',fontSize:14,fontWeight:700,color:'#16613a'}}>PRIYA INDUSTRIES</p>
        <p style={{margin:0,fontSize:11,color:'#999'}}>Scan for attendance · Code: {QR_CODE_VALUE}</p>
      </div>

      <div style={{...S.card,background:'#fffbeb'}}>
        <p style={{margin:0,fontSize:13,color:'#92400e',lineHeight:1.6}}>
          <strong>📋 How to set up the real QR code:</strong><br/>
          1. Go to <strong>qr-code-generator.com</strong><br/>
          2. Enter this text: <strong>{QR_CODE_VALUE}</strong><br/>
          3. Download the QR code image<br/>
          4. Print on A4 paper<br/>
          5. Laminate it (for durability)<br/>
          6. Stick at factory entrance at eye level
        </p>
      </div>
    </div>
  );
}

// ============================================
// STYLES
// ============================================
const S = {
  app: { fontFamily: "'DM Sans', 'Nunito', system-ui, sans-serif", maxWidth: 480, margin: '0 auto', minHeight: '100vh', background: '#f8f8f5', color: '#111', WebkitFontSmoothing: 'antialiased' },
  splash: { display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',background:'linear-gradient(155deg,#16613a 0%,#0c3d22 100%)',padding:40 },
  splashLogo: { marginBottom:20 },
  splashTitle: { color:'#EAB308',fontSize:26,fontWeight:800,margin:0,letterSpacing:0.5 },
  splashSub: { color:'rgba(255,255,255,0.6)',fontSize:14,marginTop:4 },
  loaderTrack: { width:100,height:3,background:'rgba(255,255,255,0.12)',borderRadius:3,marginTop:32,overflow:'hidden' },
  loaderThumb: { width:'35%',height:'100%',background:'#EAB308',borderRadius:3 },
  center: { display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',minHeight:'100vh',padding:'40px 24px',position:'relative' },
  title: { fontSize:22,fontWeight:800,color:'#111',margin:'12px 0 4px',textAlign:'center' },
  sub: { fontSize:13,color:'#999',margin:'0 0 20px',textAlign:'center' },
  roleRow: { display:'flex',gap:14,marginTop:8 },
  roleCard: { display:'flex',flexDirection:'column',alignItems:'center',gap:8,padding:'24px 20px',border:'2px solid #eee',borderRadius:16,background:'white',cursor:'pointer',width:148,boxShadow:'0 2px 10px rgba(0,0,0,0.04)' },
  iconCircle: { width:60,height:60,borderRadius:14,background:'#ecfdf5',display:'flex',alignItems:'center',justifyContent:'center' },
  back: { position:'absolute',top:18,left:18,background:'none',border:'none',color:'#16613a',fontSize:14,fontWeight:700,cursor:'pointer',padding:'4px 0',zIndex:5 },
  btn: { width:'100%',maxWidth:320,padding:'13px 20px',background:'#16613a',color:'white',border:'none',borderRadius:12,fontSize:15,fontWeight:700,cursor:'pointer',boxShadow:'0 4px 14px rgba(22,97,58,0.25)' },
  secBtn: { width:'100%',maxWidth:320,padding:'12px 20px',background:'white',color:'#16613a',border:'2px solid #16613a',borderRadius:12,fontSize:14,fontWeight:600,cursor:'pointer',marginTop:14 },
  outBtn: { background:'none',border:'1px solid #ddd',borderRadius:8,padding:'6px 14px',color:'#888',fontSize:13,cursor:'pointer' },
  form: { width:'100%',maxWidth:320 },
  label: { display:'block',fontSize:12,fontWeight:700,color:'#666',marginBottom:5,marginTop:8 },
  input: { width:'100%',padding:'11px 14px',border:'2px solid #eee',borderRadius:10,fontSize:14,outline:'none',boxSizing:'border-box',background:'white',marginBottom:6 },
  err: { color:'#dc2626',fontSize:13,margin:'8px 0' },
  page: { padding:'20px 18px',minHeight:'100vh',position:'relative' },
  topBar: { display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:20 },
  card: { padding:18,background:'white',borderRadius:16,boxShadow:'0 2px 12px rgba(0,0,0,0.05)',marginBottom:14 },
  chip: { flex:1,padding:'12px 8px',borderRadius:10,display:'flex',flexDirection:'column',alignItems:'center',gap:2 },
  scanBtn: { width:'100%',maxWidth:360,padding:'16px 20px',background:'linear-gradient(135deg,#16613a,#1e8a4e)',color:'white',border:'none',borderRadius:14,fontSize:16,fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:12,boxShadow:'0 6px 20px rgba(22,97,58,0.3)' },
  scanPage: { minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24,position:'relative',background:'#f8f8f5' },
  bigCheck: { width:64,height:64,borderRadius:'50%',background:'#dcfce7',color:'#16a34a',display:'flex',alignItems:'center',justifyContent:'center',fontSize:32,fontWeight:700 },
  statRow: { display:'flex',gap:12,marginBottom:16,width:'100%',maxWidth:360 },
  statBox: { flex:1,display:'flex',flexDirection:'column',alignItems:'center',padding:'14px 8px',background:'white',borderRadius:12,boxShadow:'0 2px 8px rgba(0,0,0,0.04)' },
  statN: { fontSize:26,fontWeight:800,color:'#16613a' },
  statL: { fontSize:11,color:'#999',marginTop:2 },
  list: { marginBottom:16 },
  listItem: { display:'flex',justifyContent:'space-between',alignItems:'center',padding:'12px 14px',background:'white',borderRadius:12,marginBottom:6,boxShadow:'0 1px 4px rgba(0,0,0,0.03)' },
  avatar: { width:38,height:38,borderRadius:10,background:'#ecfdf5',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,fontWeight:700,color:'#16613a',flexShrink:0 },
  miniChip: { padding:'4px 8px',borderRadius:6,fontSize:11,fontWeight:600 },
  miniStat: { flex:1,padding:'14px 6px',background:'white',borderRadius:14,textAlign:'center',boxShadow:'0 2px 8px rgba(0,0,0,0.04)',display:'flex',flexDirection:'column',gap:2 },
  navCard: { padding:'14px 10px',background:'white',border:'2px solid #eee',borderRadius:12,cursor:'pointer',fontSize:14,fontWeight:600,color:'#333',textAlign:'center' },
};

const globalCSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
  body { margin: 0; background: #f8f8f5; }
  .fadeIn { animation: fadeIn 0.4s ease-out; }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  .slideLoader { animation: slideL 1.4s ease-in-out infinite; }
  @keyframes slideL { 0% { transform: translateX(-100%); } 50% { transform: translateX(220%); } 100% { transform: translateX(-100%); } }
  .spin { animation: spin 0.7s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .card-hover { transition: all 0.15s ease; }
  .card-hover:hover { transform: translateY(-2px); box-shadow: 0 6px 20px rgba(0,0,0,0.08) !important; }
  .card-hover:active { transform: translateY(0); }
  input:focus { border-color: #16613a !important; }
  select { appearance: auto; }
  button { font-family: inherit; }
`;
