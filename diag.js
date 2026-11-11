/* Enigma Console — loader with on-screen status messages. */

const say = (kind, msg) => {
    try {
        if (window.toastr && typeof window.toastr[kind] === 'function') {
            window.toastr[kind](msg, 'Enigma', { timeOut: 12000, extendedTimeOut: 12000 });
            return;
        }
    } catch { /* fall through to banner */ }
    const d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;left:8px;right:8px;top:80px;z-index:2147483647;padding:10px 12px;border-radius:8px;background:#ff2d55;color:#fff;font:14px sans-serif';
    (document.body || document.documentElement).append(d);
    setTimeout(() => d.remove(), 12000);
};

import('./index.js').then(() => {
    const el = document.getElementById('enigma-launcher');
    if (!el) {
        say('warning', 'Enigma: โหลด index.js แล้ว แต่ไม่มีปุ่ม');
        return;
    }
    // Report where the panel ends up after each tap (read-only).
    el.addEventListener('click', () => {
        setTimeout(() => {
            const p = document.getElementById('enigma-panel');
            if (!p) return;
            const r = p.getBoundingClientRect();
            const l = el.getBoundingClientRect();
            const layer = typeof p.matches === 'function' && p.matches(':popover-open');
            say('info', `Enigma: open=${p.classList.contains('open')} แผง top=${Math.round(r.top)} สูง=${Math.round(r.height)} ปุ่ม y=${Math.round(l.top)} toplayer=${layer} จอสูง=${window.innerHeight}`);
        }, 500);
    });
    say('success', 'Enigma: พร้อมใช้งาน — แตะปุ่มดาวเพื่อเปิดแผง');
}).catch(err => {
    say('error', 'Enigma: index.js ใช้งานไม่ได้ — ' + (err && err.message ? err.message : err));
});
