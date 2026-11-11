/* Enigma Console — loader with on-screen status messages. */

const say = (kind, msg) => {
    try {
        if (window.toastr && typeof window.toastr[kind] === 'function') {
            window.toastr[kind](msg, 'Enigma', { timeOut: 20000, extendedTimeOut: 20000 });
            return;
        }
    } catch { /* fall through to banner */ }
    const d = document.createElement('div');
    d.textContent = msg;
    d.style.cssText = 'position:fixed;left:8px;right:8px;top:80px;z-index:2147483647;padding:10px 12px;border-radius:8px;background:#ff2d55;color:#fff;font:14px sans-serif';
    (document.body || document.documentElement).append(d);
    setTimeout(() => d.remove(), 20000);
};

say('info', 'Enigma: ขั้น 1 — สคริปต์ถูกโหลดแล้ว');

import('./index.js').then(() => {
    const el = document.getElementById('enigma-launcher');
    if (!el) {
        say('warning', 'Enigma: โหลด index.js แล้ว แต่ไม่มีปุ่ม');
        return;
    }
    el.style.setProperty('position', 'fixed', 'important');
    el.style.setProperty('top', '45%', 'important');
    el.style.setProperty('left', '6px', 'important');
    el.style.setProperty('bottom', 'auto', 'important');
    el.style.setProperty('display', 'flex', 'important');
    el.style.setProperty('z-index', '2147483647', 'important');
    const r = el.getBoundingClientRect();
    say('success', `Enigma: ขั้น 2 — สร้างปุ่มแล้ว ตำแหน่ง x=${Math.round(r.left)} y=${Math.round(r.top)} ขนาด ${Math.round(r.width)}x${Math.round(r.height)}`);
}).catch(err => {
    say('error', 'Enigma: index.js ใช้งานไม่ได้ — ' + (err && err.message ? err.message : err));
});
