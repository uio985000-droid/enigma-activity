/* Enigma Console — a control panel for the active Chat Completion preset.
 * It only flips prompt entries on/off (by identifier, listed in config.json).
 * Nothing in the preset text is changed. */

const EXT_ID = 'enigma-console';
const LS_TAB = `${EXT_ID}:tab`;
const LS_VAULT = `${EXT_ID}:vault`;
const DEFAULT_DUMMY = 100001;

let CFG = null;
let modPromise = null;
let activeTab = 0;
let els = {};

/* ---------- small helpers ---------- */

function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === false || v == null) continue;
        if (k === 'class') el.className = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v);
    }
    for (const kid of kids.flat()) {
        if (kid == null || kid === false) continue;
        el.append(kid && kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
}

function lsGet(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
    } catch {
        return fallback;
    }
}

function lsSet(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch { /* storage blocked */ }
}

function clamp(n, lo, hi) {
    return Math.min(Math.max(n, lo), hi);
}

function setStatus(text, kind = '') {
    if (!els.status) return;
    els.status.textContent = text;
    els.status.className = `en-status ${kind}`;
}

function toast(kind, text) {
    try { window.toastr?.[kind]?.(text, 'Enigma Console'); } catch { /* no toastr */ }
    setStatus(text, kind === 'error' ? 'err' : '');
}

/* ---------- symbol: inverted pentagram in a circle ---------- */

function pentagram(uid, size) {
    const cx = 50, cy = 50, R = 37;
    const pts = [0, 1, 2, 3, 4].map(i => {
        const a = (Math.PI / 180) * (90 + 72 * i); // first vertex points down
        return [cx + R * Math.cos(a), cy + R * Math.sin(a)];
    });
    const walk = [0, 2, 4, 1, 3, 0];
    const d = walk.map((k, i) => `${i ? 'L' : 'M'}${pts[k][0].toFixed(2)} ${pts[k][1].toFixed(2)}`).join(' ') + 'Z';
    return `<svg width="${size}" height="${size}" viewBox="0 0 100 100" aria-hidden="true">
        <defs><linearGradient id="${uid}" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ff2d55"/><stop offset="0.55" stop-color="#ff4d9a"/><stop offset="1" stop-color="#ffb3c9"/>
        </linearGradient></defs>
        <circle cx="50" cy="50" r="44" fill="none" stroke="url(#${uid})" stroke-width="5"/>
        <path d="${d}" fill="none" stroke="url(#${uid})" stroke-width="5" stroke-linejoin="round"/>
    </svg>`;
}

/* ---------- access to the Chat Completion prompt order ---------- */

async function loadMod() {
    if (!modPromise) {
        modPromise = import('/scripts/openai.js').catch(err => {
            modPromise = null;
            throw err;
        });
    }
    return modPromise;
}

function dummyId(mod) {
    return mod.promptManager?.configuration?.promptOrder?.dummyId ?? DEFAULT_DUMMY;
}

function getOrder(mod) {
    const po = mod?.oai_settings?.prompt_order;
    if (!Array.isArray(po)) return null;
    const id = String(dummyId(mod));
    return po.find(o => String(o.character_id) === id)?.order ?? null;
}

function findRow(order, id) {
    return order.find(r => r.identifier === id) || null;
}

function isOn(order, id) {
    return !!findRow(order, id)?.enabled;
}

function setOn(order, id, value) {
    const row = findRow(order, id);
    if (!row) return false;
    row.enabled = !!value;
    return true;
}

function applyChoice(order, sec, item) {
    const ids = sec.items.map(i => i.id);
    const cur = isOn(order, item.id);
    if (sec.mode === 'multi') {
        setOn(order, item.id, !cur);
    } else if (sec.mode === 'optional') {
        ids.forEach(id => setOn(order, id, false));
        if (!cur) setOn(order, item.id, true);
    } else {
        ids.forEach(id => setOn(order, id, id === item.id));
    }
}

function allIds() {
    const out = [];
    for (const tab of CFG.tabs) for (const sec of tab.sections) for (const it of sec.items) out.push(it.id);
    return out;
}

function snapshot(order) {
    const snap = {};
    for (const id of allIds()) {
        const row = findRow(order, id);
        if (row) snap[id] = !!row.enabled;
    }
    return snap;
}

async function commit(mod) {
    try { mod.promptManager?.render?.(false); } catch { /* UI refresh is best effort */ }
    try {
        const save = window.SillyTavern?.getContext?.()?.saveSettingsDebounced;
        if (typeof save === 'function') save();
        else mod.promptManager?.saveServiceSettings?.();
    } catch { /* ignore */ }
}

/* ---------- rendering ---------- */

function infoText(mod, id) {
    const p = mod?.oai_settings?.prompts?.find(x => x.identifier === id);
    const c = (p?.content || '').trim();
    return c.length > 600 ? c.slice(0, 600) + ' …' : c;
}

function showInfo(mod, item) {
    const body = infoText(mod, item.id);
    els.info.replaceChildren(
        h('div', { class: 'en-info-card' },
            h('div', { class: 'en-info-title' }, `${item.emoji || ''} ${item.label}`),
            item.desc ? h('div', { class: 'en-info-desc' }, item.desc) : null,
            body ? h('pre', { class: 'en-info-pre' }, body) : null,
            h('button', { class: 'en-btn', type: 'button', onclick: () => els.info.classList.remove('open') }, 'ปิด'),
        ),
    );
    els.info.classList.add('open');
}

function renderChip(mod, order, sec, item) {
    const row = findRow(order, item.id);
    const on = !!row?.enabled;
    const main = h('button', {
        class: 'en-chip-main', type: 'button', disabled: row ? false : 'disabled',
        title: item.desc || item.label,
        onclick: async () => {
            applyChoice(order, sec, item);
            await commit(mod);
            renderBody(mod);
        },
    }, h('span', { class: 'en-emoji' }, item.emoji || '◆'), h('span', { class: 'en-label' }, item.label));
    const info = h('button', {
        class: 'en-chip-i', type: 'button', 'aria-label': 'info',
        onclick: () => showInfo(mod, item),
    }, 'i');
    return h('div', { class: `en-chip${on ? ' on' : ''}${row ? '' : ' missing'}` }, main, info);
}

function renderVault(mod, order) {
    const vault = lsGet(LS_VAULT, {});
    const nameInput = h('input', { class: 'en-input', type: 'text', placeholder: 'ชื่อชุดตั้งค่า', maxlength: '40' });
    const saveBtn = h('button', {
        class: 'en-btn primary', type: 'button',
        onclick: () => {
            const name = nameInput.value.trim();
            if (!name) { toast('warning', 'ตั้งชื่อก่อนบันทึก'); return; }
            vault[name] = snapshot(order);
            lsSet(LS_VAULT, vault);
            toast('success', `บันทึกชุด "${name}" แล้ว`);
            renderBody(mod);
        },
    }, 'บันทึกชุดปัจจุบัน');
    const rows = Object.keys(vault).map(name => h('div', { class: 'en-vault-row' },
        h('span', { class: 'en-vault-name' }, name),
        h('button', {
            class: 'en-btn', type: 'button',
            onclick: async () => {
                for (const [id, val] of Object.entries(vault[name])) setOn(order, id, val);
                await commit(mod);
                toast('success', `โหลดชุด "${name}" แล้ว`);
                renderBody(mod);
            },
        }, 'โหลด'),
        h('button', {
            class: 'en-btn danger', type: 'button',
            onclick: () => {
                delete vault[name];
                lsSet(LS_VAULT, vault);
                renderBody(mod);
            },
        }, 'ลบ'),
    ));
    return h('div', { class: 'en-vault' },
        h('div', { class: 'en-vault-add' }, nameInput, saveBtn),
        rows.length ? rows : h('div', { class: 'en-muted' }, 'ยังไม่มีชุดที่บันทึกไว้'),
    );
}

function renderSection(mod, order, sec) {
    const total = sec.items.length;
    const on = sec.items.filter(it => isOn(order, it.id)).length;
    const head = h('div', { class: 'en-sec-head' },
        h('span', { class: 'en-no' }, sec.no),
        h('span', { class: 'en-sec-title' }, sec.title),
        h('span', { class: 'en-sec-sub' }, `· ${sec.sub}`),
        sec.mode === 'vault' ? null : h('span', { class: 'en-count' }, `${on}/${total}`),
    );
    const content = sec.mode === 'vault'
        ? renderVault(mod, order)
        : h('div', { class: 'en-chips' }, sec.items.map(it => renderChip(mod, order, sec, it)));
    return h('section', { class: 'en-sec' }, head, content);
}

function renderBody(mod) {
    if (!els.body) return;
    const order = getOrder(mod);
    if (!order) {
        els.body.replaceChildren(h('div', { class: 'en-empty' },
            'หา prompt order ของ Chat Completion ไม่เจอ — เปิดโหมด Chat Completion และโหลดพรีเซ็ตก่อน'));
        setStatus('ไม่พบ prompt order', 'err');
        return;
    }
    const tab = CFG.tabs[activeTab];
    const missing = tab.sections.flatMap(s => s.items).filter(it => !findRow(order, it.id)).length;
    els.body.replaceChildren(...tab.sections.map(sec => renderSection(mod, order, sec)));
    const preset = mod.oai_settings?.preset_settings_openai;
    setStatus(
        `${preset ? `พรีเซ็ต: ${preset}` : 'Enigma Console'}${missing ? ` · ไม่พบ ${missing} รายการ (พรีเซ็ตนี้ไม่มี)` : ''}`,
        missing ? 'warn' : '',
    );
}

function renderTabs(mod) {
    els.tabs.replaceChildren(...CFG.tabs.map((tab, i) => h('button', {
        class: `en-tab${i === activeTab ? ' active' : ''}`, type: 'button',
        title: tab.th,
        onclick: () => {
            activeTab = i;
            lsSet(LS_TAB, i);
            els.info.classList.remove('open');
            renderTabs(mod);
            renderBody(mod);
            els.body.scrollTop = 0;
        },
    }, h('span', { class: 'en-tab-en' }, tab.label), h('span', { class: 'en-tab-th' }, tab.th))));
}

/* ---------- open / close ---------- */

async function ensureConfig() {
    if (CFG) return CFG;
    const res = await fetch(new URL('./config.json', import.meta.url));
    if (!res.ok) throw new Error(`config.json ${res.status}`);
    CFG = await res.json();
    activeTab = clamp(Number(lsGet(LS_TAB, 0)) || 0, 0, CFG.tabs.length - 1);
    return CFG;
}

async function openPanel() {
    els.panel.classList.add('open');
    topLayer(els.panel, true);
    els.launcher.classList.add('active');
    try {
        await ensureConfig();
        const mod = await loadMod();
        renderTabs(mod);
        renderBody(mod);
    } catch (err) {
        console.error('[Enigma Console]', err);
        els.body.replaceChildren(h('div', { class: 'en-empty' }, `เปิดไม่สำเร็จ: ${err?.message || err}`));
        setStatus('เกิดข้อผิดพลาด ดู Console ของเบราว์เซอร์', 'err');
    }
}

function closePanel() {
    els.panel.classList.remove('open');
    topLayer(els.panel, false);
    els.launcher.classList.remove('active');
    els.info?.classList.remove('open');
}

function togglePanel() {
    if (els.panel.classList.contains('open')) closePanel();
    else openPanel();
}

/* ---------- top layer (immune to transformed/zero-height ancestors) ---------- */

function topLayer(el, on) {
    try {
        if (typeof el.showPopover !== 'function') return;
        if (!el.hasAttribute('popover')) el.setAttribute('popover', 'manual');
        const open = el.matches(':popover-open');
        if (on && !open) el.showPopover();
        else if (!on && open) el.hidePopover();
    } catch { /* older browsers: normal fixed positioning */ }
}

/* ---------- boot ---------- */

function buildUI() {
    const launcher = h('button', {
        id: 'enigma-launcher', class: 'en-launcher', type: 'button',
        'aria-label': 'Enigma Console', title: 'Enigma Console', html: pentagram('enL', 34),
    });

    const tabs = h('div', { class: 'en-tabs' });
    const body = h('div', { class: 'en-body' });
    const info = h('div', { class: 'en-info' });
    const status = h('div', { class: 'en-status' }, 'Enigma Console');
    const panel = h('div', { id: 'enigma-panel', class: 'en-panel' },
        h('div', { class: 'en-grip' }),
        h('div', { class: 'en-head' },
            h('span', { class: 'en-logo', html: pentagram('enH', 22) }),
            h('span', { class: 'en-title' }, 'ENIGMA CONSOLE'),
            h('button', { class: 'en-close', type: 'button', 'aria-label': 'close', onclick: closePanel }, '✕'),
        ),
        tabs, body, status, info,
    );

    document.body.append(launcher, panel);
    els = { launcher, panel, tabs, body, info, status };
    launcher.addEventListener('click', togglePanel);

    // Top-layer (popover) elements get UA defaults; neutralise them inline.
    Object.assign(launcher.style, { top: 'auto', right: 'auto', left: '8px', bottom: '140px', margin: '0', overflow: 'visible', touchAction: 'manipulation' });
    Object.assign(panel.style, { top: 'auto', margin: '0', height: 'auto', padding: '0', overflow: 'hidden', borderWidth: '2px 0 0 0', width: 'min(100%, 720px)' });
    launcher.setAttribute('popover', 'manual');
    panel.setAttribute('popover', 'manual');
    topLayer(launcher, true);
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && panel.classList.contains('open')) closePanel();
    });
}

function boot() {
    if (document.getElementById('enigma-launcher')) return;
    try {
        buildUI();
        window.EnigmaConsole = { open: openPanel, close: closePanel, version: '1.1.0' };
    } catch (err) {
        console.error('[Enigma Console] boot failed', err);
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();span', { class: 'en-tab-en' }, tab.label), h('span', { class: 'en-tab-th' }, tab.th))));
}

/* ---------- open / close ---------- */

async function ensureConfig() {
    if (CFG) return CFG;
    const res = await fetch(new URL('./config.json', import.meta.url));
    if (!res.ok) throw new Error(`config.json ${res.status}`);
    CFG = await res.json();
    activeTab = clamp(Number(lsGet(LS_TAB, 0)) || 0, 0, CFG.tabs.length - 1);
    return CFG;
}

async function openPanel() {
    els.panel.classList.add('open');
    els.launcher.classList.add('active');
    try {
        await ensureConfig();
        const mod = await loadMod();
        renderTabs(mod);
        renderBody(mod);
    } catch (err) {
        console.error('[Enigma Console]', err);
        els.body.replaceChildren(h('div', { class: 'en-empty' }, `เปิดไม่สำเร็จ: ${err?.message || err}`));
        setStatus('เกิดข้อผิดพลาด ดู Console ของเบราว์เซอร์', 'err');
    }
}

function closePanel() {
    els.panel.classList.remove('open');
    els.launcher.classList.remove('active');
    els.info?.classList.remove('open');
}

function togglePanel() {
    if (els.panel.classList.contains('open')) closePanel();
    else openPanel();
}

/* ---------- draggable launcher ---------- */

function makeDraggable(el, onTap) {
    let sx = 0, sy = 0, ox = 0, oy = 0, moved = false, pid = null;
    el.addEventListener('pointerdown', e => {
        pid = e.pointerId;
        try { el.setPointerCapture(pid); } catch { /* ignore */ }
        sx = e.clientX; sy = e.clientY;
        const r = el.getBoundingClientRect();
        ox = r.left; oy = r.top; moved = false;
    });
    el.addEventListener('pointermove', e => {
        if (pid !== e.pointerId) return;
        const dx = e.clientX - sx, dy = e.clientY - sy;
        if (!moved && Math.hypot(dx, dy) < 8) return;
        moved = true;
        el.style.left = `${clamp(ox + dx, 4, window.innerWidth - el.offsetWidth - 4)}px`;
        el.style.top = `${clamp(oy + dy, 4, window.innerHeight - el.offsetHeight - 4)}px`;
        el.style.bottom = 'auto';
    });
    const end = e => {
        if (pid !== e.pointerId) return;
        try { el.releasePointerCapture(pid); } catch { /* ignore */ }
        pid = null;
        if (moved) lsSet(LS_POS, { left: el.style.left, top: el.style.top });
        else onTap();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => { pid = null; });
}

/* ---------- boot ---------- */

function buildUI() {
    const launcher = h('button', {
        id: 'enigma-launcher', class: 'en-launcher', type: 'button',
        'aria-label': 'Enigma Console', title: 'Enigma Console', html: pentagram('enL', 34),
    });
    const pos = lsGet(LS_POS, null);
    if (pos?.left && pos?.top) {
        launcher.style.left = pos.left;
        launcher.style.top = pos.top;
        launcher.style.bottom = 'auto';
    }

    const tabs = h('div', { class: 'en-tabs' });
    const body = h('div', { class: 'en-body' });
    const info = h('div', { class: 'en-info' });
    const status = h('div', { class: 'en-status' }, 'Enigma Console');
    const panel = h('div', { id: 'enigma-panel', class: 'en-panel' },
        h('div', { class: 'en-grip' }),
        h('div', { class: 'en-head' },
            h('span', { class: 'en-logo', html: pentagram('enH', 22) }),
            h('span', { class: 'en-title' }, 'ENIGMA CONSOLE'),
            h('button', { class: 'en-close', type: 'button', 'aria-label': 'close', onclick: closePanel }, '✕'),
        ),
        tabs, body, status, info,
    );

    document.body.append(launcher, panel);
    els = { launcher, panel, tabs, body, info, status };
    makeDraggable(launcher, togglePanel);
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && panel.classList.contains('open')) closePanel();
    });
}

function boot() {
    if (document.getElementById('enigma-launcher')) return;
    try {
        buildUI();
        window.EnigmaConsole = { open: openPanel, close: closePanel, version: '1.0.0' };
    } catch (err) {
        console.error('[Enigma Console] boot failed', err);
    }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
