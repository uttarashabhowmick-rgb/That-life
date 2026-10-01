import React, { useState, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Modal,
  ActivityIndicator, StatusBar, AppState, Vibration, Linking, Platform,
} from 'react-native';
 
// RevenueCat is loaded safely: if it is missing or unsupported (web), the app still opens.
let Purchases = null;
try { if (Platform.OS !== 'web') Purchases = require('react-native-purchases').default; } catch (e) {}
 
// ---- RevenueCat ----
const RC_API_KEY = 'test_VPXijxrQoPhEfgLnxTrYRurIFvE';
const ENTITLEMENT = 'thatlife_pro';
const FREE_LIMIT = 2;
 
const buzz = (n) => { try { Vibration.vibrate(n); } catch (e) {} };
 
// ---------- On-device intent engine (rule-based, no API key, works offline) ----------
// "~" = optional task. {topic} is filled from the user's own words.
const TEMPLATES = [
  { name: 'Study', emoji: '📚', color: '#6366F1', mins: 45,
    keys: ['study', 'exam', 'revise', 'homework', 'learn', 'quiz', 'physics', 'maths', 'chemistry', 'biology', 'space'],
    tasks: ['Clear desk, phone face-down', 'Outline what "{topic}" covers', 'Deep study block on {topic}', 'Quiz yourself from the key points', '~Summarise in 5 lines'] },
  { name: 'Travel', emoji: '✈️', color: '#0EA5E9', mins: 30,
    keys: ['travel', 'trip', 'flight', 'train', 'journey', 'airport', 'vacation'],
    tasks: ['Check tickets & ID', 'Check weather at your destination', 'Pack essentials', 'Charge phone & power bank', '~Download offline maps'] },
  { name: 'Paperwork', emoji: '📋', color: '#EC4899', mins: 40,
    keys: ['scholarship', 'application', 'apply', 'visa', 'passport', 'renew', 'admission', 'certificate', 'document', 'loan'],
    tasks: ['Find the official requirements for "{topic}"', 'Gather the documents you already have', 'Get or scan anything that is missing', 'Fill in the form carefully', '~Double-check and save a copy'] },
  { name: 'Interview', emoji: '🤝', color: '#0891B2', mins: 40,
    keys: ['interview', 'job', 'resume', 'hiring', 'placement', 'recruiter'],
    tasks: ['Re-read the job description for "{topic}"', 'Write 3 stories from your experience', 'Practise answers out loud', 'Prepare 2 questions to ask them', '~Check your outfit and route'] },
  { name: 'Presentation', emoji: '🎤', color: '#F59E0B', mins: 40,
    keys: ['present', 'pitch', 'demo', 'talk', 'speech', 'seminar'],
    tasks: ['Write the 3 key points of "{topic}"', 'Rehearse out loud once', 'Prep for 2 tough questions', 'Check slides & tech', '~Do one full timed run'] },
  { name: 'Workout', emoji: '💪', color: '#EF4444', mins: 35,
    keys: ['workout', 'gym', 'run', 'exercise', 'yoga', 'fitness'],
    tasks: ['Fill water bottle', '5-min warm-up', 'Main set', 'Cool-down stretch', '~Log how it felt'] },
  { name: 'Cooking', emoji: '🍳', color: '#F97316', mins: 40,
    keys: ['cook', 'dinner', 'lunch', 'breakfast', 'recipe', 'bake', 'meal'],
    tasks: ['Gather ingredients for "{topic}"', 'Prep & chop', 'Cook', 'Plate & serve', '~Clean as you go'] },
];
const FALLBACK = { name: 'Focus', emoji: '🎯', color: '#10B981', mins: 30,
  tasks: ['Define what "done" looks like for "{topic}"', 'Do the first 10-minute step', 'Main focus block', '~Review & tidy up'] };
 
const FILLER = /^(i\s+(need|want|have|got|must|should)\s+to\s+|i\s+have\s+(a|an)\s+|i'm\s+|i am\s+|let's\s+|help me\s+)/i;
const VERB = /^(study|revise|learn|prepare|practice|cook|make|plan|finish|do|go|write|apply)\s+(for|on|about|to)?\s*(my|the|a|an)?\s*/i;
 
function plan(goal) {
  const low = goal.toLowerCase();
  let tpl = FALLBACK, best = 0;
  TEMPLATES.forEach((t) => { const sc = t.keys.filter((k) => low.includes(k)).length; if (sc > best) { best = sc; tpl = t; } });
  let mins = tpl.mins, custom = false;
  const dm = low.match(/(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/);
  if (dm) { const n = parseFloat(dm[1]); mins = Math.max(5, Math.min(240, Math.round(/^h/.test(dm[2]) ? n * 60 : n))); custom = true; }
  const urgent = /\b(tomorrow|tonight|urgent|asap|today|deadline|due|late)\b/.test(low);
  if (urgent && !custom) mins = Math.round(mins * 0.8);
  const topic = goal.trim().replace(FILLER, '').replace(VERB, '')
    .replace(/\b(for\s+)?\d+(\.\d+)?\s*(hours?|hrs?|minutes?|mins?)\b/i, '').replace(/[.!?]+$/, '').trim() || goal.trim();
  let tasks = tpl.tasks.map((x) => ({ t: x.replace('~', '').replace('{topic}', topic), opt: x.startsWith('~'), done: false }));
  if (urgent) tasks = tasks.filter((t) => !t.opt);
  const hour = new Date().getHours();
  if (hour >= 22 || hour < 5) tasks.push({ t: 'Set a hard stop: sleep beats cramming', opt: true, done: false });
  const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
  const log = [`🕒 Context: ${part} session`];
  if (custom) log.unshift(`⏱️ Read your time limit → ${mins} min plan`);
  if (urgent) log.unshift('🚨 Deadline detected → compact plan, optional tasks removed');
  log.unshift(`🧠 Understood "${topic}" → ${tpl.name} workspace`);
  return { goal, topic, tpl, tasks, secs: mins * 60, total: mins * 60, sprint: 0, inSprint: false,
    trimmed: false, extended: false, distractions: 0, startedAt: Date.now(), log };
}
 
// ---------- Your own notes, analysed on-device ----------
const STOP = new Set(['the', 'and', 'for', 'with', 'about', 'tonight', 'tomorrow', 'today', 'need', 'want', 'going', 'from', 'into', 'this', 'that', 'minutes', 'hours', 'min']);
const SYN = {
  space: ['astronomy', 'planet', 'galaxy', 'nasa', 'star', 'orbit', 'moon', 'universe', 'telescope'],
  physics: ['force', 'energy', 'motion', 'gravity', 'velocity'],
  scholarship: ['marksheet', 'income', 'essay', 'deadline', 'application'],
  interview: ['resume', 'portfolio', 'teamwork'],
  delhi: ['hotel', 'flight', 'metro'], travelling: ['flight', 'hotel', 'ticket'], travel: ['flight', 'hotel', 'ticket'],
};
const PERSONAL = {
  Study: { gaps: [['Past papers', ['paper', 'pyq']], ['Summary / formula sheet', ['formula', 'summary']]] },
  Travel: { gaps: [['Tickets / boarding pass', ['ticket', 'boarding', 'flight']], ['Hotel booking', ['hotel', 'reservation']], ['ID / visa', ['passport', 'visa', 'aadhaar']]] },
  Paperwork: { gaps: [['ID proof', ['aadhaar', 'passport', 'id card', 'license']], ['Marksheet / certificates', ['marksheet', 'certificate']],
    ['Passport-size photo', ['photo']], ['Income / bank proof', ['income', 'bank']]] },
  Interview: { gaps: [['Resume / CV', ['resume']], ['Job description', ['job description', 'role']], ['Portfolio / projects', ['portfolio', 'project']]] },
  Presentation: { gaps: [['Slides', ['slide', 'deck']], ['Script / notes', ['script', 'notes']]] },
  Focus: { gaps: [['Notes or reference material', ['notes', 'guide', 'summary']]] },
};
const DEMO = [
  { name: 'Space notes', text: 'The Milky Way contains over 100 billion stars. A light-year is the distance light travels in one year. Black holes form when massive stars collapse. The James Webb telescope observes the universe in infrared. Mars has the tallest volcano in the solar system, Olympus Mons. Neil Armstrong walked on the Moon in 1969.' },
  { name: 'Scholarship checklist', text: 'The scholarship application needs the latest marksheet, a passport size photo and an income certificate. The application deadline is the last day of the month. Write a 500 word essay about your goals. Two recommendation letters are required from teachers.' },
  { name: 'Delhi trip plan', text: 'Flight to Delhi leaves at 6:40 AM. Hotel near Connaught Place is booked for three nights. Visit Humayun Tomb and the Red Fort. Take the metro from the airport to the hotel.' },
  { name: 'Interview prep', text: 'The interview is for a junior developer role. Review your project portfolio and be ready to explain one project in detail. Prepare answers about teamwork and deadlines. Research the company before the interview.' },
];
 
const words = (t) => t.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));
 
function analyze(vault, topic, tplName) {
  const base = words(topic);
  const toks = [...new Set([...base, ...base.flatMap((w) => SYN[w] || [])])];
  const P = PERSONAL[tplName] || PERSONAL.Focus;
  const rows = vault.map((it) => {
    const name = it.name.toLowerCase(); const text = it.text.toLowerCase();
    const score = toks.reduce((a, k) => a + (name.includes(k) ? 5 : 0) + Math.min(text.split(k).length - 1, 5), 0);
    return { it, score };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  const pts = [];
  rows.forEach((r) => r.it.text.split(/\n+|[.!?]\s+/).forEach((sn) => {
    const t = sn.trim(); if (t.length < 20 || t.length > 260) return;
    const low = t.toLowerCase(); const h = toks.filter((k) => low.includes(k));
    if (h.length) pts.push({ t, src: r.it.name, sc: h.length });
  }));
  pts.sort((a, b) => b.sc - a.sc);
  const seen = new Set(); const points = pts.filter((p) => (seen.has(p.t) ? false : seen.add(p.t))).slice(0, 6);
  const hay = vault.map((v) => (v.name + ' ' + v.text).toLowerCase()).join(' ');
  const gaps = P.gaps.filter(([, ks]) => !ks.some((k) => hay.includes(k))).map(([l]) => l);
  return { rows, points, gaps };
}
 
const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const addLog = (e, m) => ({ ...e, log: [m, ...e.log].slice(0, 6) });
const trim = (e) => ({ ...e, trimmed: true, tasks: e.tasks.filter((t) => t.done || !t.opt) });
const Btn = ({ label, onPress }) => (
  <TouchableOpacity style={s.small} onPress={onPress}><Text style={s.chipT}>{label}</Text></TouchableOpacity>
);
const q = encodeURIComponent;
 
class Boundary extends React.Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (<ScrollView style={{ flex: 1, backgroundColor: '#0B0F1A' }} contentContainerStyle={{ padding: 24, paddingTop: 70 }}>
      <Text style={{ color: '#FCA5A5', fontSize: 20, fontWeight: '700' }}>That Life hit an error</Text>
      <Text style={{ color: '#fff', marginTop: 12 }}>{String(this.state.err && this.state.err.message)}</Text></ScrollView>);
  }
}
export default function App() { return <Boundary><Main /></Boundary>; }
 
function Main() {
  const [env, setEnv] = useState(null); const [input, setInput] = useState(''); const [launches, setLaunches] = useState(0);
  const [pro, setPro] = useState(false); const [paywall, setPaywall] = useState(false); const [pkgs, setPkgs] = useState([]);
  const [busy, setBusy] = useState(false); const [msg, setMsg] = useState(''); const [hist, setHist] = useState([]);
  const [vault, setVault] = useState([]); const [tab, setTab] = useState(0);
  const [nn, setNn] = useState(''); const [nt, setNt] = useState('');
  const on = !!env;
  const doneCount = env ? env.tasks.filter((t) => t.done).length : 0;
  const strict = !!(env && env.sprint > 0);
  const A = useMemo(() => (env ? analyze(vault, env.topic, env.tpl.name) : null), [vault, env && env.topic]);
 
  // RevenueCat init (phones only; safely skipped if unavailable)
  useEffect(() => {
    (async () => {
      try {
        if (!Purchases) return;
        Purchases.configure({ apiKey: RC_API_KEY });
        const info = await Purchases.getCustomerInfo();
        setPro(!!info.entitlements.active[ENTITLEMENT]);
      } catch (e) { setMsg('RevenueCat: ' + e.message); }
    })();
  }, []);
 
  // Clock
  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => setEnv((e) => e && { ...e, secs: Math.max(0, e.secs - 1), sprint: Math.max(0, e.sprint - 1) }), 1000);
    return () => clearInterval(id);
  }, [on]);
 
  // AUTO-ADAPT 1: sense the user leaving the app
  useEffect(() => {
    let away = null;
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') { if (away == null) away = Date.now(); return; }
      if (away) {
        const sec = Math.round((Date.now() - away) / 1000); away = null;
        if (sec >= 15) {
          buzz(200);
          setEnv((e) => e && addLog({ ...e, sprint: 300, inSprint: true, distractions: e.distractions + 1 }, `📵 Detected: you left the app for ${sec}s → focus lock + 5-min sprint`));
        }
      }
    });
    return () => { try { sub.remove(); } catch (e) {} };
  }, []);
 
  // AUTO-ADAPT 2: pace, sprint end, time-up
  useEffect(() => {
    if (!env) return;
    const frac = env.tasks.filter((t) => t.done).length / env.tasks.length;
    if (env.inSprint && env.sprint === 0) { buzz(200); setEnv((e) => addLog({ ...e, inSprint: false }, '🔓 Sprint complete: tools unlocked')); }
    if (env.secs === 0) {
      buzz(400);
      if (frac < 1 && !env.extended) setEnv((e) => addLog({ ...e, secs: 300, total: e.total + 300, extended: true }, '⏳ Time up with tasks left → auto-extended 5 min'));
    } else if (env.secs % 20 === 0 && !env.trimmed && (env.total - env.secs) / env.total > 0.6 && frac < 0.4) {
      setEnv((e) => addLog(trim(e), '📉 Behind schedule → optional tasks auto-cut'));
    }
  }, [env && env.secs]);
 
  // AUTO-ADAPT 3: progress
  useEffect(() => {
    if (!env) return;
    const n = env.tasks.length;
    if (doneCount === n) setEnv((e) => addLog(e, '🏁 All tasks done: tap Goal complete'));
    else if (doneCount > 0 && doneCount === Math.ceil(n / 2)) setEnv((e) => addLog(e, '🎯 Halfway: take a 3-min break, then finish strong'));
  }, [doneCount]);
 
  const openPaywall = async () => {
    setPaywall(true); setBusy(true); setMsg('');
    try {
      if (!Purchases) throw new Error('real purchases run in the phone app build');
      const o = await Purchases.getOfferings();
      setPkgs(o.current ? o.current.availablePackages : []);
      if (!o.current) setMsg('No current offering. Create one in the RevenueCat dashboard.');
    } catch (e) { setMsg('RevenueCat: ' + e.message); }
    setBusy(false);
  };
  const buy = async (p) => {
    setBusy(true);
    try {
      const { customerInfo } = await Purchases.purchasePackage(p);
      if (customerInfo.entitlements.active[ENTITLEMENT]) { setPro(true); setPaywall(false); }
    } catch (e) { if (!e.userCancelled) setMsg(e.message); }
    setBusy(false);
  };
  const restore = async () => {
    try {
      const info = await Purchases.restorePurchases();
      if (info.entitlements.active[ENTITLEMENT]) { setPro(true); setPaywall(false); } else setMsg('Nothing to restore.');
    } catch (e) { setMsg(e.message); }
  };
 
  const launch = (text) => {
    const goal = (typeof text === 'string' ? text : input).trim();
    if (!goal) return;
    if (!pro && launches >= FREE_LIMIT) { openPaywall(); return; }
    setLaunches((n) => n + 1); setTab(0); setEnv(plan(goal)); setInput('');
  };
  const distracted = () => setEnv((e) => addLog({ ...e, sprint: 300, inSprint: true, distractions: e.distractions + 1 }, '⚠️ Distraction reported → focus lock + 5-min sprint'));
  const late = () => setEnv((e) => {
    const secs = Math.ceil(e.secs * 0.6);
    return addLog({ ...trim(e), secs, total: e.total - (e.secs - secs) }, '⏰ Running late → optional tasks cut, timer shortened 40%');
  });
  const toggle = (i) => setEnv((e) => ({ ...e, tasks: e.tasks.map((t, j) => (j === i ? { ...t, done: !t.done } : t)) }));
  const finish = () => {
    const score = Math.max(0, 100 - 15 * env.distractions);
    const mins = Math.max(1, Math.round((Date.now() - env.startedAt) / 60000));
    setHist((h) => [{ goal: env.topic, emoji: env.tpl.emoji, done: doneCount, n: env.tasks.length, score, mins }, ...h]);
    setEnv(null);
  };
  const addNote = () => {
    if (!nt.trim()) return;
    setVault((v) => [...v, { name: nn.trim() || 'Note', text: nt.trim() }]); setNn(''); setNt('');
  };
 
  const color = env ? env.tpl.color : '#6366F1';
  const TABS = ['Plan', 'My stuff', 'Key points', 'Explore'];
 
  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={s.pad} keyboardShouldPersistTaps="handled">
        {!env ? (
          <View>
            <Text style={s.brand}>THAT LIFE {pro ? '· PRO' : ''}</Text>
            <Text style={s.h1}>What are you trying to accomplish right now?</Text>
            {hist.length > 0 && <Text style={s.banner}>✅ Workspace dissolved. Back to your normal phone.</Text>}
            <TextInput style={s.input} value={input} onChangeText={setInput} placeholder="e.g. I need to study space for 45 minutes"
              placeholderTextColor="#6B7280" multiline />
            <TouchableOpacity style={[s.btn, { backgroundColor: color }]} onPress={() => launch()}>
              <Text style={s.btnT}>Build my environment</Text>
            </TouchableOpacity>
            <Text style={s.sub}>Try:</Text>
            {['I need to study space for 45 minutes', 'Apply for a scholarship', "I'm travelling to Delhi tonight", 'Prepare for my job interview'].map((x) => (
              <TouchableOpacity key={x} style={s.chip} onPress={() => launch(x)}><Text style={s.chipT}>{x}</Text></TouchableOpacity>
            ))}
 
            <Text style={s.sub}>My notes: {vault.length} saved (kept in this app, nothing uploaded)</Text>
            <View style={s.card}>
              <TextInput style={s.mini} value={nn} onChangeText={setNn} placeholder="Title (e.g. Physics notes)" placeholderTextColor="#6B7280" />
              <TextInput style={s.mini} value={nt} onChangeText={setNt} multiline placeholder="Paste text from your notes, files or documents" placeholderTextColor="#6B7280" />
              <View style={s.row}>
                <Btn label="+ Save note" onPress={addNote} />
                <Btn label="✨ Load demo notes" onPress={() => setVault((v) => [...v, ...DEMO])} />
                {vault.length > 0 && <Btn label="🗑️ Clear" onPress={() => setVault([])} />}
              </View>
              {vault.map((v, i) => <Text key={i} style={s.logT}>📄 {v.name}</Text>)}
            </View>
 
            {hist.length > 0 && <Text style={s.sub}>Your progress: {hist.length} goal{hist.length > 1 ? 's' : ''} · {hist.reduce((a, h) => a + h.mins, 0)} min focused</Text>}
            {hist.map((h, i) => <Text key={i} style={s.logT}>{h.emoji} {h.goal} · {h.done}/{h.n} tasks · {h.mins} min · focus {h.score}%</Text>)}
            {!pro && <Text style={s.sub}>{Math.max(0, FREE_LIMIT - launches)} free workspaces left</Text>}
            {!pro && <TouchableOpacity onPress={openPaywall}><Text style={s.link}>Unlock That Life Pro</Text></TouchableOpacity>}
          </View>
        ) : (
          <View>
            <Text style={s.brand}>{env.tpl.emoji} {env.tpl.name.toUpperCase()} WORKSPACE</Text>
            <Text style={s.h1}>{env.topic}</Text>
            <Text style={[s.timer, { color }]}>{fmt(env.secs)}</Text>
            <Text style={s.logT}>Focus score {Math.max(0, 100 - 15 * env.distractions)}%</Text>
            <View style={s.bar}><View style={[s.fill, { backgroundColor: color, width: `${(doneCount / env.tasks.length) * 100}%` }]} /></View>
            {strict && <Text style={s.strict}>🔒 Focus lock {fmt(env.sprint)}: finish your tasks, extra sections return when the sprint ends</Text>}
            <View style={s.row}>{TABS.map((t, i) => (
              <TouchableOpacity key={t} style={[s.small, tab === i && { backgroundColor: color }]} onPress={() => setTab(i)}><Text style={s.chipT}>{t}</Text></TouchableOpacity>))}</View>
 
            {tab === 0 && (<View>
              {env.tasks.map((t, i) => (
                <TouchableOpacity key={i} style={s.task} onPress={() => toggle(i)}>
                  <Text style={[s.taskT, t.done && s.done]}>{t.done ? '☑' : '☐'} {t.t}{t.opt ? '  (optional)' : ''}</Text>
                </TouchableOpacity>
              ))}
              <Text style={s.sub}>Life changed? Adapt:</Text>
              <View style={s.row}>
                <Btn label="😵 Distracted" onPress={distracted} />
                <Btn label="⏰ Running late" onPress={late} />
                <Btn label="🔄 New goal" onPress={() => setEnv(null)} />
              </View>
              <TouchableOpacity style={[s.btn, { backgroundColor: color }]} onPress={finish}><Text style={s.btnT}>✅ Goal complete</Text></TouchableOpacity>
              <Text style={s.sub}>Adaptation log</Text>
              {env.log.map((l, i) => <Text key={i} style={s.logT}>{l}</Text>)}
            </View>)}
 
            {tab === 1 && !strict && (<View>
              <Text style={s.sub}>Your saved notes about "{env.topic}" ({A.rows.length})</Text>
              {vault.length === 0 && <Text style={s.logT}>You have no saved notes yet. Add some on the home screen (New goal → My notes).</Text>}
              {vault.length > 0 && A.rows.length === 0 && <Text style={s.logT}>None of your {vault.length} notes match this goal.</Text>}
              {A.rows.map((r, i) => (<View key={i} style={s.card}><Text style={s.tt}>📄 {r.it.name}</Text>
                <Text style={s.logT} numberOfLines={3}>{r.it.text}</Text></View>))}
            </View>)}
 
            {tab === 2 && !strict && (<View>
              <Text style={s.sub}>Important points from your own notes</Text>
              {A.points.length === 0 && <Text style={s.logT}>No key points yet. Save notes that mention "{env.topic}".</Text>}
              {A.points.map((p, i) => (<View key={i} style={s.card}><Text style={s.chipT}>⭐ {p.t}.</Text><Text style={s.logT}>from {p.src}</Text></View>))}
            </View>)}
 
            {tab === 3 && !strict && (<View>
              <Text style={s.sub}>What's missing from your files</Text>
              {A.gaps.length === 0 && <Text style={s.logT}>Nothing obvious is missing. Nice.</Text>}
              {A.gaps.map((g) => (
                <TouchableOpacity key={g} style={s.gap} onPress={() => Linking.openURL(`https://www.google.com/search?q=${q(env.topic + ' ' + g)}`)}>
                  <Text style={s.chipT}>🕳️ Missing: {g}. Tap to find it</Text></TouchableOpacity>))}
              <Text style={s.sub}>Explore more</Text>
              <View style={s.row}>
                <Btn label="📖 Wikipedia" onPress={() => Linking.openURL('https://en.wikipedia.org/wiki/Special:Search?search=' + q(env.topic))} />
                <Btn label="▶️ Videos" onPress={() => Linking.openURL('https://www.youtube.com/results?search_query=' + q(env.topic))} />
                <Btn label="🔎 Search" onPress={() => Linking.openURL('https://www.google.com/search?q=' + q(env.topic))} />
              </View>
            </View>)}
          </View>
        )}
      </ScrollView>
 
      <Modal visible={paywall} animationType="slide" transparent>
        <View style={s.modalBg}><View style={s.modal}>
          <Text style={s.h1}>That Life Pro</Text>
          <Text style={s.chipT}>Unlimited workspaces and adaptive re-planning.</Text>
          {busy && <ActivityIndicator color="#fff" style={{ margin: 16 }} />}
          {pkgs.map((p) => (
            <TouchableOpacity key={p.identifier} style={[s.btn, { backgroundColor: '#6366F1' }]} onPress={() => buy(p)}>
              <Text style={s.btnT}>{p.product.title || p.identifier} · {p.product.priceString}</Text>
            </TouchableOpacity>
          ))}
          {!!msg && <Text style={s.logT}>{msg}</Text>}
          {(!Purchases || (pkgs.length === 0 && !busy)) && <Btn label="Demo unlock (RevenueCat offering not loaded)" onPress={() => { setPro(true); setPaywall(false); }} />}
          {!!Purchases && pkgs.length > 0 && <TouchableOpacity onPress={restore}><Text style={s.link}>Restore purchases</Text></TouchableOpacity>}
          <TouchableOpacity onPress={() => setPaywall(false)}><Text style={s.link}>Not now</Text></TouchableOpacity>
        </View></View>
      </Modal>
    </View>
  );
}
 
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B0F1A' }, pad: { padding: 22, paddingTop: 56, paddingBottom: 60 },
  brand: { color: '#9CA3AF', letterSpacing: 2, fontSize: 12, marginBottom: 8 },
  h1: { color: '#fff', fontSize: 26, fontWeight: '700', marginBottom: 14 },
  input: { backgroundColor: '#161B2B', color: '#fff', borderRadius: 14, padding: 14, fontSize: 16, minHeight: 70, marginBottom: 12 },
  mini: { backgroundColor: '#0B0F1A', color: '#fff', borderRadius: 10, padding: 10, fontSize: 15, marginVertical: 5 },
  btn: { padding: 15, borderRadius: 14, alignItems: 'center', marginVertical: 8 }, btnT: { color: '#fff', fontWeight: '700', fontSize: 16 },
  sub: { color: '#9CA3AF', marginTop: 18, marginBottom: 6 },
  chip: { backgroundColor: '#161B2B', padding: 13, borderRadius: 12, marginVertical: 4 }, chipT: { color: '#E5E7EB', fontSize: 15 },
  small: { backgroundColor: '#242B40', padding: 11, borderRadius: 12, marginRight: 8, marginTop: 6 }, row: { flexDirection: 'row', flexWrap: 'wrap' },
  gap: { backgroundColor: '#2A2414', padding: 11, borderRadius: 10, marginTop: 6 },
  card: { backgroundColor: '#161B2B', borderRadius: 14, padding: 14, marginTop: 12 }, tt: { color: '#fff', fontWeight: '700', marginBottom: 6 },
  link: { color: '#818CF8', textAlign: 'center', marginTop: 14 },
  timer: { fontSize: 56, fontWeight: '800', marginVertical: 4 },
  bar: { height: 8, backgroundColor: '#161B2B', borderRadius: 4, marginVertical: 10 }, fill: { height: 8, borderRadius: 4 },
  task: { backgroundColor: '#161B2B', padding: 14, borderRadius: 12, marginVertical: 4 }, taskT: { color: '#fff', fontSize: 16 },
  done: { color: '#6B7280', textDecorationLine: 'line-through' },
  strict: { color: '#FCA5A5', backgroundColor: '#2A1418', padding: 12, borderRadius: 12, marginTop: 12 },
  logT: { color: '#9CA3AF', marginVertical: 3 }, banner: { color: '#6EE7B7', marginBottom: 12 },
  modalBg: { flex: 1, backgroundColor: '#000A', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#0B0F1A', padding: 24, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
});
 