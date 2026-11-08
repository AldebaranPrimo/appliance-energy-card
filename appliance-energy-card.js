/*
 * Appliance Energy Card — a Home Assistant dashboard card for appliances on smart plugs: what is running now, the power
 * curve and usage of the last 24 hours, today's energy, and a device × day table of the energy used in the last days.
 *
 * Devices come from the "Individual devices" of the Home Assistant Energy dashboard, or from the card configuration.
 * https://github.com/AldebaranPrimo/appliance-energy-card — MIT licence.
 */
const VERSION = "1.0.0";

const STRINGS = {
  en: {
    title: "Appliances",
    house: "House",
    running: (names) => `Running: ${names}`,
    nothing: "Nothing running",
    check: (names) => `to check: ${names}`,
    noDevices: "No devices",
    noDevicesSub: "Add devices to the card, or individual devices to the Energy dashboard.",
    state: { use: "In use", idle: "Idle", off: "Off", na: "Unavailable", on: "On", low: "No power" },
    detail: { off: "plug off", na: "not responding", idle: (w) => `plug on · ${w}`, low: (w) => `almost zero (${w})` },
    since: (t) => `for ${t}`,
    today: (v) => `today ${v}`,
    meter: (v) => `meter ${v}`,
    max24: (v) => `24 h: max ${v}`,
    usageTitle: "Use in the last 24 hours",
    tapHint: "Tap: switch the plug on or off · hold: details",
    tableTitle: (n) => `Energy per device, last ${n} days`,
    tableSub: "kWh per day; the darker the box, the more energy.",
    total: "Total", tot: "tot.", noData: "no data",
    footer: "In every tile: state, energy today and meter reading, power curve of the last 24 hours with its maximum, and a strip with the use in the last 24 hours.",
    and: "and", minutes: (m) => `${m} min`, hours: (h, m) => (m ? `${h} h ${m} min` : `${h} h`),
  },
  it: {
    title: "Elettrodomestici",
    house: "Casa",
    running: (names) => `In funzione: ${names}`,
    nothing: "Nessun elettrodomestico in funzione",
    check: (names) => `da controllare: ${names}`,
    noDevices: "Nessun dispositivo",
    noDevicesSub: "Aggiungi i dispositivi alla scheda, o i dispositivi singoli alla dashboard Energia.",
    state: { use: "In funzione", idle: "A riposo", off: "Spenta", na: "Non risponde", on: "Acceso", low: "Senza consumo" },
    detail: { off: "presa spenta", na: "non risponde", idle: (w) => `presa accesa · ${w}`, low: (w) => `quasi a zero (${w})` },
    since: (t) => `da ${t}`,
    today: (v) => `oggi ${v}`,
    meter: (v) => `contatore ${v}`,
    max24: (v) => `24 h: massimo ${v}`,
    usageTitle: "Uso nelle ultime 24 ore",
    tapHint: "Tocca: accendi o spegni la presa · tieni premuto: dettagli",
    tableTitle: (n) => `Energia per dispositivo, ultimi ${n} giorni`,
    tableSub: "kWh al giorno; più scura la casella, più energia.",
    total: "Totale", tot: "tot.", noData: "nessun dato",
    footer: "In ogni riquadro: stato, energia di oggi e lettura del contatore, curva della potenza nelle ultime 24 ore con il massimo, striscia dell'uso nelle 24 ore.",
    and: "e", minutes: (m) => `${m} min`, hours: (h, m) => (m ? `${h} h ${m} min` : `${h} h`),
  },
};

// colour roles of the design: full colour = look at it now, dimmed = fine
const COLORS = { red: ["#d6453d", "#ffffff"], amber: ["#f2a33a", "#2a1a00"], green: ["#3aa55c", "#ffffff"], grey: ["#6b7078", "#ffffff"] };
const UNAVAILABLE = ["unavailable", "unknown", "none", ""];

// icon guessed from the device name when none is configured (a few words in English and Italian)
const ICON_GUESSES = [
  [["wash", "lavatrice"], "mdi:washing-machine"], [["dryer", "asciugatrice"], "mdi:tumble-dryer"],
  [["dishwasher", "lavastoviglie"], "mdi:dishwasher"], [["fridge", "frigo", "freezer", "congelatore"], "mdi:fridge-outline"],
  [["oven", "forno"], "mdi:stove"], [["microwave", "microonde"], "mdi:microwave"], [["coffee", "caff"], "mdi:coffee-maker-outline"],
  [["kettle", "bollitore"], "mdi:kettle-outline"], [["boiler", "caldaia", "water heater", "scaldabagno"], "mdi:water-boiler"],
  [["heater", "stufa", "radiator", "termosifone"], "mdi:radiator"], [["air con", "aircon", "condizionatore", "climatizzatore"], "mdi:air-conditioner"],
  [["vacuum", "aspirapolvere"], "mdi:vacuum-outline"], [["tv", "television", "televisore"], "mdi:television"],
  [["computer", "pc", "server", "informatica", "network", "router"], "mdi:desktop-tower-monitor"], [["hair", "phon", "fon"], "mdi:hair-dryer-outline"],
  [["charger", "caricatore", "bike", "bici", "ebike"], "mdi:battery-charging"], [["light", "lamp", "luce", "luci", "lux"], "mdi:lightbulb-outline"],
  [["pump", "pompa"], "mdi:pump"], [["fan", "ventilatore"], "mdi:fan"],
];

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const isNa = (st) => !st || UNAVAILABLE.includes(String(st.state).toLowerCase());
const num = (st) => { if (isNa(st)) return null; const v = parseFloat(st.state); return Number.isFinite(v) ? v : null; };
const finite = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const day0 = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };

function guessIcon(name) {
  const n = String(name || "").toLowerCase();
  const hit = ICON_GUESSES.find(([words]) => words.some((w) => (w.length <= 3 ? new RegExp(`\\b${w}\\b`).test(n) : n.includes(w))));
  return hit ? hit[1] : "mdi:power-plug-outline";
}

// small 24-hour curve, drawn in a 100 × 22 box
function sparkSvg(pts, t0, t1) {
  const vs = pts.map((p) => p.v);
  if (vs.length < 2) return "";
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const X = (t) => Math.min(100, Math.max(0, ((t - t0) / (t1 - t0)) * 100)), Y = (v) => (hi === lo ? 11 : 20 - ((v - lo) / (hi - lo)) * 18);
  return `<svg class="spark" viewBox="0 0 100 22" preserveAspectRatio="none" aria-hidden="true"><path d="${pts.map((p, i) => `${i ? "L" : "M"}${X(p.t).toFixed(2)},${Y(p.v).toFixed(2)}`).join("")}"/></svg>`;
}

// history points {t, v} from the compressed history API
const points = (list) => (list || []).map((x) => ({ t: (x.lu ?? x.lc) * 1000, s: x.s, v: parseFloat(x.s) })).sort((a, b) => a.t - b.t);

// average per interval; an interval without readings keeps the last known value (the state did not change)
function buckets(pts, t0, t1, n) {
  const step = (t1 - t0) / n, out = [];
  let i = 0, last = null;
  while (i < pts.length && pts[i].t < t0) { if (Number.isFinite(pts[i].v)) last = pts[i].v; i++; }
  for (let k = 0; k < n; k++) {
    const end = t0 + (k + 1) * step;
    let s = 0, c = 0;
    while (i < pts.length && pts[i].t < end) { if (Number.isFinite(pts[i].v)) { s += pts[i].v; c++; last = pts[i].v; } i++; }
    out.push({ t: t0 + (k + 0.5) * step, v: c ? s / c : last });
  }
  return out.filter((p) => p.v !== null);
}

// time ranges [a, b] in which `on(point)` holds
function ranges(pts, t0, t1, on) {
  const out = [];
  let start = null;
  for (const p of pts) {
    const t = Math.max(t0, p.t);
    if (on(p) && start === null) start = t;
    else if (!on(p) && start !== null) { out.push([start, t]); start = null; }
  }
  if (start !== null) out.push([start, t1]);
  return out.filter(([a, b]) => b > t0 && b > a);
}

class ApplianceEnergyCard extends HTMLElement {
  static getStubConfig() { return {}; }

  setConfig(config) {
    if (config.devices !== undefined && !Array.isArray(config.devices)) throw new Error("devices must be a list");
    for (const d of config.devices || []) if (!d.power && !d.energy) throw new Error("every device needs power or energy");
    if (config.always_on !== undefined && !Array.isArray(config.always_on)) throw new Error("always_on must be a list of energy sensors or names");
    if (config.tap !== undefined && !["toggle", "details"].includes(config.tap)) throw new Error("tap must be toggle or details");
    this._config = { days: 7, threshold: 10, show_table: true, show_tiles: true, house_levels: [800, 2000], tap: "toggle", always_on: [], ...config };
    this._gen = (this._gen || 0) + 1;   // a discovery started with an older configuration is thrown away
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this._sig = null;
    this._hist = null; this._stats = null; this._today = {}; this._devices = null;
    this._histT = this._todayT = this._statsT = 0;
    if (this._hass) this._update(true);
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    this._update(first);
  }

  getCardSize() { return 8; }
  getGridOptions() { return { columns: 12, min_columns: 6 }; }

  _update(force) {
    if (!this._config || !this._hass) return;
    if (!this._devices) {
      if (!this._discovering) { this._discovering = true; this._discover().finally(() => { this._discovering = false; this._sig = null; this._update(true); }); }
      return;
    }
    const now = new Date();
    const ids = [this._config.house_power, ...(this._devices || []).flatMap((d) => [d.power, d.energy, d.switch, d.in_use])].filter(Boolean);
    const sig = ids.map((id) => this._hass.states[id]?.last_updated).join("|") + "|" + Math.floor(now / 60000) + "|" + this._lang().locale;
    if (sig === this._sig && !force) return;
    this._sig = sig;
    this._render();
    this._load().then((changed) => { if (changed) this._render(); });
  }

  _lang() {
    const loc = this._config?.language || this._hass?.locale?.language || this._hass?.language || "en";
    const k = String(loc).toLowerCase().slice(0, 2);
    return { s: STRINGS[k] || STRINGS.en, locale: loc };
  }
  _fmt(v, dec = 1) {
    return v === null || v === undefined || !Number.isFinite(v) ? "—"
      : v.toLocaleString(this._lang().locale, { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  _watts(w) { return w === null ? "—" : `${this._fmt(Math.round(w), 0)} W`; }
  _kwh(v) { return v === null ? "—" : `${this._fmt(v, 2)} kWh`; }
  _duration(ms) {
    const { s } = this._lang(), m = Math.max(1, Math.round(ms / 60000));
    return m < 60 ? s.minutes(m) : s.hours(Math.floor(m / 60), m % 60);
  }

  // devices: from the configuration, or from the individual devices of the Energy dashboard
  async _discover() {
    const c = this._config, H = this._hass, gen = this._gen;
    const reg = H.entities || {};
    const sameDevice = (id) => { const dev = reg[id]?.device_id; return dev ? Object.values(reg).filter((e) => e.device_id === dev && !e.entity_category && !e.hidden) : []; };
    const findOn = (id, pred) => sameDevice(id).map((e) => e.entity_id).find((eid) => eid !== id && pred(eid, H.states[eid]));
    const isPower = (eid, st) => eid.startsWith("sensor.") && st?.attributes?.device_class === "power";
    const isSwitch = (eid) => eid.startsWith("switch.");
    const alwaysOn = c.always_on.map((x) => String(x).toLowerCase());
    const complete = (d) => {
      const base = d.energy || d.power;
      const name = d.name || H.states[d.switch]?.attributes?.friendly_name || (H.states[base]?.attributes?.friendly_name || base || "").replace(/\s*(energy|power|energia|potenza)$/i, "");
      const power = d.power === undefined ? (d.energy && findOn(d.energy, isPower)) || null : d.power || null;
      const sw = d.switch === undefined ? (findOn(power || d.energy, isSwitch) || null) : d.switch || null;
      const always = d.always_on ?? alwaysOn.some((x) => [d.energy, power, name].some((v) => v && String(v).toLowerCase() === x));
      return { ...d, name, power, switch: sw, always_on: !!always, icon: d.icon || H.states[sw]?.attributes?.icon || guessIcon(name) };
    };
    let list = [];
    if (Array.isArray(c.devices)) list = c.devices;
    else if (H.callWS) {
      try {
        const prefs = await H.callWS({ type: "energy/get_prefs" });
        list = (prefs?.device_consumption || []).map((d) => ({ name: d.name, energy: d.stat_consumption, power: d.stat_rate }));
      } catch (e) { list = []; }
      const ex = [].concat(c.exclude || []).map((x) => String(x).toLowerCase());
      list = list.filter((d) => !ex.includes(String(d.energy).toLowerCase()) && !ex.includes(String(d.name).toLowerCase()));
    }
    if (gen !== this._gen) return;
    this._devices = list.map(complete);
  }

  // power and in-use history (24 h, every 5 min), today's energy (every 10 min), daily statistics (every 30 min)
  async _load() {
    const H = this._hass, c = this._config, devs = this._devices || [];
    if (!H.callWS || !devs.length) return false;
    let changed = false;
    const now = Date.now();
    if (!this._histT || now - this._histT > 300000) {
      this._histT = now;
      const ids = [...new Set(devs.flatMap((d) => [d.power, d.in_use]).filter((id) => id && H.states[id]))];
      try {
        this._hist = ids.length ? await H.callWS({ type: "history/history_during_period", start_time: new Date(now - 86400000).toISOString(),
          entity_ids: ids, minimal_response: true, no_attributes: true, significant_changes_only: false }) : {};
      } catch (e) { this._hist = {}; }
      changed = true;
    }
    if (!this._todayT || now - this._todayT > 600000) {
      this._todayT = now;
      await Promise.all(devs.filter((d) => d.energy).map(async (d) => {
        try {
          const r = await H.callWS({ type: "recorder/statistic_during_period", statistic_id: d.energy, calendar: { period: "day" }, types: ["change"] });
          this._today[d.energy] = finite(r?.change);
        } catch (e) { this._today[d.energy] = null; }
      }));
      changed = true;
    }
    if (c.show_table && (!this._statsT || now - this._statsT > 1800000)) {
      this._statsT = now;
      const start = day0(new Date()); start.setDate(start.getDate() - (c.days - 1));
      const ids = devs.map((d) => d.energy).filter(Boolean);
      try {
        this._stats = ids.length ? await H.callWS({ type: "recorder/statistics_during_period", start_time: start.toISOString(), period: "day", statistic_ids: ids, types: ["change"] }) : {};
      } catch (e) { this._stats = {}; }
      changed = true;
    }
    return changed;
  }

  // state of one device: use, idle, off, na, on (always on), low (always on but almost no power)
  _state(d) {
    const H = this._hass, c = this._config;
    const pw = H.states[d.power], sw = H.states[d.switch], use = H.states[d.in_use];
    const w = num(pw), thr = d.threshold ?? c.threshold;
    if ((d.power && isNa(pw)) || (d.switch && isNa(sw))) return { kind: "na", w };
    if (d.switch && sw.state === "off") return { kind: "off", w };
    // always on: an alarm only when it is really off (1 W or less, or its own threshold), not between compressor cycles
    if (d.always_on) return (w !== null && w <= (d.threshold ?? 1)) || use?.state === "off" ? { kind: "low", w } : { kind: "on", w };
    if (use ? use.state === "on" : w !== null && w > thr) return { kind: "use", w, since: use ? new Date(use.last_changed).getTime() : this._usageStart(d) };
    return { kind: "idle", w };
  }

  // usage ranges in the last 24 hours: from the in-use sensor, otherwise from the power above the threshold
  _usage(d) {
    const t1 = Date.now(), t0 = t1 - 86400000, thr = d.threshold ?? this._config.threshold;
    if (d.in_use) return ranges(points(this._hist?.[d.in_use]), t0, t1, (p) => p.s === "on");
    if (!d.power) return [];
    return ranges(points(this._hist?.[d.power]), t0, t1, (p) => Number.isFinite(p.v) && p.v > thr);
  }
  _usageStart(d) { const r = this._usage(d); const last = r[r.length - 1]; return last && last[1] >= Date.now() - 60000 ? last[0] : null; }

  _render() {
    if (!this.shadowRoot || !this._hass || !this._config) return;
    const c = this._config, { s } = this._lang(), H = this._hass;
    const devs = this._devices || [];
    const list = (names) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} ${s.and} ${names[names.length - 1]}`);
    const house = c.house_power ? num(H.states[c.house_power]) : null;
    const [lvA, lvR] = c.house_levels;
    const houseColor = house === null ? COLORS.grey : house > lvR ? COLORS.red : house > lvA ? COLORS.amber : COLORS.green;
    const rows = devs.map((d) => ({ d, x: this._state(d) }));
    const using = rows.filter((r) => r.x.kind === "use");
    const problems = rows.filter((r) => r.x.kind === "low" || r.x.kind === "na");
    const houseText = c.house_power ? `${s.house} ${this._watts(house)}` : "";

    let banner;
    if (!devs.length) banner = this._banner(null, "mdi:power-plug-off-outline", s.noDevices, s.noDevicesSub);
    else if (using.length) banner = this._banner(COLORS.amber, using[0].d.icon, s.running(list(using.map((r) => r.d.name))),
      [using.map((r) => `${r.d.name} ${this._watts(r.x.w)}`).join(" · "), houseText, problems.length ? s.check(list(problems.map((r) => r.d.name))) : ""].filter(Boolean).join(" · "));
    else banner = this._banner(null, "mdi:power-plug-outline", s.nothing,
      [houseText, problems.length ? s.check(list(problems.map((r) => r.d.name))) : ""].filter(Boolean).join(" · ") || " ");

    const t1 = Date.now(), t0 = t1 - 86400000;
    const tile = ({ d, x }) => {
      const map = { use: [COLORS.amber, "full"], low: [COLORS.amber, "full"], na: [COLORS.grey, ""], off: [COLORS.grey, "dim"], idle: [COLORS.green, "dim"], on: [COLORS.green, "dim"] };
      const [[col, txt], cls] = map[x.kind];
      const idle = d.switch ? s.detail.idle(this._watts(x.w)) : d.power ? this._watts(x.w) : "";
      const detail = { use: this._watts(x.w), on: this._watts(x.w), off: s.detail.off, na: s.detail.na, idle, low: s.detail.low(this._watts(x.w)) }[x.kind];
      const since = x.since ? ` · ${s.since(this._duration(t1 - x.since))}` : "";
      const today = d.energy ? this._today[d.energy] : undefined;
      const meter = d.energy ? num(H.states[d.energy]) : null;
      const pts = points(this._hist?.[d.power]).filter((p) => Number.isFinite(p.v));
      const curve = this._hist ? buckets(pts, t0, t1, 96) : [];
      const inWindow = pts.filter((p) => p.t >= t0).map((p) => p.v).concat(curve.map((p) => p.v));
      const max = inWindow.length ? Math.max(...inWindow) : null;
      const use = this._usage(d).map(([a, b]) => `<i style="left:${(((a - t0) / 86400000) * 100).toFixed(2)}%;width:${Math.max(0.3, ((b - a) / 86400000) * 100).toFixed(2)}%"></i>`).join("");
      const energyLine = [today !== undefined && today !== null ? s.today(this._kwh(today)) : "", meter !== null ? s.meter(this._kwh(meter)) : ""].filter(Boolean).join(" · ");
      const toggles = this._toggles(d);
      return `<div class="tile ${cls}" style="--c:${col};--t:${txt}" data-info="${esc(d.power || d.energy || d.switch)}" ${toggles ? `data-toggle="${esc(d.switch)}"` : ""} title="${esc(toggles ? s.tapHint : "")}">
        <div class="row"><ha-icon icon="${esc(d.icon)}"></ha-icon><span class="name">${esc(d.name)}</span></div>
        <div class="value">${esc(s.state[x.kind])}</div>
        <div class="det">${esc(detail + since)}</div>
        ${energyLine ? `<div class="det">${esc(energyLine)}</div>` : ""}
        ${d.power ? `${sparkSvg(curve, t0, t1)}<div class="det">${esc(s.max24(this._watts(max)))}</div>` : ""}
        ${d.power || d.in_use ? `<div class="use" title="${esc(s.usageTitle)}">${use}</div>` : ""}
      </div>`;
    };

    this.shadowRoot.innerHTML = `<style>${STYLE}</style><ha-card lang="${esc(this._lang().locale)}">
      <div class="head"><h2>${esc(c.title ?? s.title)}</h2>${houseText ? `<span class="note" style="color:${houseColor[0]}">${esc(houseText)}</span>` : ""}</div>
      ${banner}
      ${c.show_tiles && devs.length ? `<div class="tiles">${rows.map(tile).join("")}</div>` : ""}
      ${c.show_table && devs.some((d) => d.energy) ? this._table() : ""}
      ${devs.length ? `<div class="foot">${esc(s.footer)}${devs.some((d) => this._toggles(d)) ? " " + esc(s.tapHint) + "." : ""}</div>` : ""}
    </ha-card>`;
    this.shadowRoot.querySelectorAll("[data-info]").forEach((el) => this._actions(el));
  }

  // device × day table of the energy used (daily statistics `change`; today from the running day's statistic)
  _table() {
    const c = this._config, { s, locale } = this._lang();
    const days = [...Array(c.days)].map((_, i) => { const d = day0(new Date()); d.setDate(d.getDate() - (c.days - 1) + i); return d; });
    const rows = (this._devices || []).filter((d) => d.energy).map((d) => {
      const per = {};
      (this._stats?.[d.energy] || []).forEach((r) => { per[day0(new Date(r.start)).toDateString()] = finite(r.change); });
      const v = days.map((day, i) => (i === days.length - 1 && finite(this._today[d.energy]) !== null ? this._today[d.energy] : per[day.toDateString()] ?? null));
      return { d, v };
    });
    const max = Math.max(0.01, ...rows.flatMap((r) => r.v.filter((x) => x !== null)));
    const cell = (x) => (x === null ? "—" : this._fmt(x, Math.abs(x) >= 10 ? 1 : 2));
    const [amber, amberText] = COLORS.amber;
    const head = `<div class="t"></div>${days.map((d) => `<div class="h">${esc(d.toLocaleDateString(locale, { weekday: "short" }))}<br>${d.getDate()}</div>`).join("")}<div class="h">${esc(s.tot)}</div>`;
    const body = rows.map(({ d, v }) => {
      const tot = v.reduce((a, b) => a + (b || 0), 0);
      return `<div class="t" data-info="${esc(d.energy)}">${esc(d.name)}</div>${v.map((x, i) => `<div title="${esc(`${d.name}, ${days[i].toLocaleDateString(locale)}: ${x === null ? s.noData : this._kwh(x)}`)}"
        style="background:color-mix(in srgb, ${amber} ${x ? Math.round(12 + (Math.max(0, x) / max) * 80) : 4}%, transparent);${x && x / max > 0.55 ? `color:${amberText}` : ""}">${cell(x)}</div>`).join("")}<div><b>${cell(tot)}</b></div>`;
    }).join("");
    const perDay = days.map((_, i) => rows.reduce((a, r) => a + (r.v[i] || 0), 0));
    const foot = `<div class="t"><b>${esc(s.total)}</b></div>${perDay.map((x) => `<div><b>${cell(x)}</b></div>`).join("")}<div><b>${cell(perDay.reduce((a, b) => a + b, 0))}</b></div>`;
    return `<div class="section"><div class="sec-title">${esc(s.tableTitle(c.days))}</div><div class="sec-sub">${esc(s.tableSub)}</div>
      <div class="map" style="grid-template-columns:minmax(64px, 1.5fr) repeat(${c.days}, minmax(0, 1fr)) minmax(0, 1.1fr)">${head}${body}${foot}</div></div>`;
  }

  // a tap switches the plug only with tap: toggle, and never for always-on appliances (fridge, network)
  _toggles(d) { return !!d.switch && !d.always_on && this._config.tap !== "details"; }

  _banner(color, icon, title, sub) {
    const style = color ? `style="--ac:${color[0]};--at:${color[1]}"` : "";
    return `<div class="banner ${color ? "" : "calm"}" ${style}><ha-icon icon="${esc(icon)}"></ha-icon><div><b>${esc(title)}</b><span>${esc(sub)}</span></div></div>`;
  }

  // tap: switch the plug (if any), otherwise details; long press: details
  _actions(el) {
    let timer = null, long = false;
    const info = el.dataset.info, toggle = el.dataset.toggle;
    const more = () => info && this.dispatchEvent(new CustomEvent("hass-more-info", { bubbles: true, composed: true, detail: { entityId: info } }));
    el.addEventListener("pointerdown", () => { long = false; timer = setTimeout(() => { long = true; more(); }, 550); });
    const stop = () => clearTimeout(timer);
    ["pointerup", "pointerleave", "pointercancel"].forEach((ev) => el.addEventListener(ev, stop));
    el.addEventListener("click", (ev) => {
      ev.stopPropagation();
      if (long) return;
      if (toggle) this._hass.callService("homeassistant", "toggle", { entity_id: toggle });
      else more();
    });
  }
}

const STYLE = `
  :host { display: block; container: aec / inline-size; }
  ha-card { display: block; padding: 16px; }
  .head { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .head h2 { margin: 0; font-size: 1rem; font-weight: 600; }
  .head .note { font-size: .82rem; font-weight: 700; font-variant-numeric: tabular-nums; }
  .banner { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; margin-bottom: 14px; background: var(--ac); color: var(--at); }
  .banner.calm { background: color-mix(in srgb, var(--secondary-text-color) 8%, transparent); color: inherit;
    border: 1px solid color-mix(in srgb, var(--secondary-text-color) 20%, transparent); }
  .banner ha-icon { --mdc-icon-size: 28px; flex: none; }
  .banner.calm ha-icon { color: var(--secondary-text-color); }
  .banner b { display: block; font-size: 1.08rem; line-height: 1.25; text-wrap: balance; }
  .banner span { display: block; font-size: .84rem; opacity: .88; margin-top: 2px; }
  .banner.calm span { color: var(--secondary-text-color); opacity: 1; }
  .tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(132px, 1fr)); gap: 8px; }
  .tile { --c: #6b7078; --t: #fff; display: flex; flex-direction: column; gap: 3px; padding: 10px 10px 9px; border-radius: 14px; min-width: 0;
    cursor: pointer; user-select: none; -webkit-tap-highlight-color: transparent;
    background: color-mix(in srgb, var(--c) 22%, var(--ha-card-background, var(--card-background-color, #1f2125)));
    border: 1px solid color-mix(in srgb, var(--c) 55%, transparent); }
  .tile.dim { opacity: .55; }
  .tile.full { background: var(--c); color: var(--t); border: 2px solid var(--c); box-shadow: 0 0 16px color-mix(in srgb, var(--c) 50%, transparent); }
  .tile .row { display: flex; align-items: flex-start; gap: 6px; min-width: 0; }
  .tile ha-icon { --mdc-icon-size: 20px; color: var(--c); flex: none; }
  .tile.full ha-icon { color: var(--t); }
  .tile .name { font-size: .78rem; font-weight: 600; line-height: 1.2; overflow-wrap: break-word; hyphens: auto; min-width: 0; }
  .tile .value { font-size: 1.05rem; font-weight: 700; line-height: 1.15; }
  .tile .det { font-size: .7rem; line-height: 1.3; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; color: var(--secondary-text-color); }
  .tile.full .det { color: inherit; opacity: .88; }
  svg.spark { width: 100%; height: 26px; display: block; margin-top: 2px; overflow: visible; }
  svg.spark path { fill: none; stroke: var(--c); stroke-width: 1.6; vector-effect: non-scaling-stroke; stroke-linejoin: round; }
  .tile.full svg.spark path { stroke: var(--t); }
  .use { position: relative; height: 6px; border-radius: 3px; margin-top: 4px; background: color-mix(in srgb, currentColor 14%, transparent); overflow: hidden; }
  .use i { position: absolute; top: 0; bottom: 0; background: var(--c); border-radius: 2px; min-width: 2px; }
  .tile.full .use i { background: var(--t); }
  .section { margin-top: 16px; padding-top: 12px; border-top: 1px solid var(--divider-color, rgba(127,127,127,.18)); }
  .sec-title { font-size: .72rem; font-weight: 700; letter-spacing: .07em; text-transform: uppercase; color: var(--secondary-text-color); }
  .sec-sub { font-size: .72rem; color: var(--secondary-text-color); margin-top: 2px; }
  .map { display: grid; gap: 2px; font-size: .72rem; font-variant-numeric: tabular-nums; margin-top: 8px; }
  .map div { padding: 4px 2px; border-radius: 4px; text-align: center; line-height: 1.25; min-width: 0; }
  .map .t { text-align: left; color: var(--secondary-text-color); overflow-wrap: anywhere; cursor: pointer; padding-left: 0; }
  .map .h { color: var(--secondary-text-color); font-size: .62rem; text-transform: uppercase; }
  .foot { margin-top: 12px; font-size: .72rem; color: var(--secondary-text-color); }
  @container aec (max-width: 440px) {
    ha-card { padding: 12px; }
    .tiles { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; }
    .tile { padding: 8px 8px 7px; }
    .tile .value { font-size: .95rem; }
    .map { font-size: .6rem; gap: 1px; }
    .map div { padding: 3px 0; letter-spacing: -.02em; }
    .map .h { font-size: .55rem; }
  }
`;

if (!customElements.get("appliance-energy-card")) customElements.define("appliance-energy-card", ApplianceEnergyCard);
window.customCards = window.customCards || [];
if (!window.customCards.some((x) => x.type === "appliance-energy-card")) {
  window.customCards.push({ type: "appliance-energy-card", name: "Appliance Energy Card", preview: true,
    description: "Appliances on smart plugs: what is running, 24-hour power and use, energy per device per day." });
}
console.info(`%c APPLIANCE-ENERGY-CARD %c ${VERSION} `, "color:#fff;background:#f2a33a;font-weight:700", "color:#f2a33a;background:#fff");
