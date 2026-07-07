import { useEffect, useRef } from 'react';
import Head from 'next/head';

const BODY_HTML = `
<div class="wrap">
  <h1>Time Tracker</h1>
  <div class="sub">Log what you did each day. Export any month for invoicing.</div>
  <div id="loading-banner" style="background:#fff3cd;border:1px solid #ffe69c;color:#7a5c00;padding:10px 14px;border-radius:8px;font-size:13.5px;margin-bottom:16px;">
    Loading your saved data — please wait before adding or editing entries...
  </div>

  <div class="card">
    <div class="field">
      <label>Date</label>
      <input type="date" id="f-date">
    </div>
    <div class="row">
      <div class="field">
        <label>Client</label>
        <input type="text" id="f-client" placeholder="e.g. Pylon">
      </div>
      <div class="field">
        <label>Type</label>
        <select id="f-type">
          <option value="remote">Remote (₪300/hr)</option>
          <option value="site">Site visit (₪2,500)</option>
          <option value="custom">Custom rate</option>
        </select>
      </div>
    </div>
    <div class="row" id="rate-row">
      <div class="field" id="hours-field">
        <label>Hours</label>
        <input type="number" id="f-hours" step="0.25" min="0" value="1">
      </div>
      <div class="field" id="rate-field" style="display:none">
        <label>Amount (₪)</label>
        <input type="number" id="f-rate" step="1" min="0">
      </div>
    </div>
    <div class="field">
      <label>What did you do</label>
      <textarea id="f-desc" placeholder="Short description of the work..."></textarea>
    </div>
    <div class="row">
      <div class="field" style="flex:0 0 auto;display:flex;align-items:center;gap:6px;margin-top:18px;">
        <input type="checkbox" id="f-vat" checked style="width:auto;">
        <label style="margin:0;">Add VAT</label>
      </div>
      <div class="field">
        <label>VAT rate (%)</label>
        <input type="number" id="f-vat-rate" step="0.5" min="0" value="18">
      </div>
    </div>
    <button class="btn-primary" id="add-btn">Add entry</button>
    <button class="btn-secondary" id="cancel-edit-btn" style="display:none;margin-left:8px;">Cancel edit</button>
    <div class="status" id="status"></div>
  </div>

  <div class="card">
    <div class="month-nav">
      <button id="prev-month">&larr; Prev</button>
      <div class="label" id="month-label">—</div>
      <button id="next-month">Next &rarr;</button>
    </div>
    <div class="summary" id="summary"></div>
  </div>

  <div id="entries-list"></div>

  <div class="top-actions">
    <button class="btn-secondary" id="export-csv">Export month as CSV</button>
    <button class="btn-secondary" id="export-txt">Export month as text</button>
  </div>

  <div class="card" style="margin-top:24px;">
    <div style="font-weight:700;font-size:14px;margin-bottom:8px;">Data tools</div>
    <div class="sub" style="margin-bottom:12px;">Everything here is stored in Postgres now — not just this browser.</div>
    <button class="btn-secondary" id="show-all-btn">Show all stored entries</button>
    <button class="btn-secondary" id="export-all-btn">Export ALL entries (every month)</button>
    <div id="all-entries-view" style="margin-top:14px;"></div>
  </div>
</div>
`;

export default function Home() {
  const mountRef = useRef(null);

  useEffect(() => {
    // ---- App state ----
    let entries = [];
    let dataLoaded = false;
    let editingId = null;
    let currentMonth = new Date();
    currentMonth.setDate(1);

    const $ = (id) => document.getElementById(id);

    function setControlsEnabled(enabled) {
      ['add-btn','cancel-edit-btn','prev-month','next-month','export-csv','export-txt','show-all-btn','export-all-btn'].forEach(id => {
        const el = $(id);
        if (el) el.disabled = !enabled;
      });
    }
    setControlsEnabled(false);

    function fmtMonthKey(d) { return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0'); }
    function fmtMonthLabel(d) { return d.toLocaleString('en-US', { month: 'long', year: 'numeric' }); }
    function todayStr() {
      const d = new Date();
      return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
    }

    function setStatus(msg, isError) {
      const el = $('status');
      if (!el) return;
      el.textContent = msg;
      el.style.color = isError ? '#b3453d' : '#2f6b4f';
      if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 2500);
    }

    function computeAmount(type, hours, rate) {
      if (type === 'remote') return hours * 300;
      if (type === 'site') return 2500;
      return rate || 0;
    }

    // ---- API calls (this replaces window.storage) ----
    async function apiGetAll() {
      const res = await fetch('/api/entries');
      if (!res.ok) throw new Error('Failed to load entries');
      return res.json();
    }
    async function apiCreate(entry) {
      const res = await fetch('/api/entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (!res.ok) throw new Error('Failed to create entry');
      return res.json();
    }
    async function apiUpdate(id, entry) {
      const res = await fetch(`/api/entries/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
      if (!res.ok) throw new Error('Failed to update entry');
      return res.json();
    }
    async function apiDelete(id) {
      const res = await fetch(`/api/entries/${id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) throw new Error('Failed to delete entry');
    }

    async function loadEntries() {
      try {
        entries = await apiGetAll();
      } catch (e) {
        entries = [];
        setStatus('Could not load from database — check connection', true);
      }
      dataLoaded = true;
      setControlsEnabled(true);
      const banner = $('loading-banner');
      if (banner) banner.style.display = 'none';
      render();
    }

    function resetForm() {
      editingId = null;
      $('add-btn').textContent = 'Add entry';
      $('cancel-edit-btn').style.display = 'none';
      $('f-date').value = todayStr();
      $('f-client').value = '';
      $('f-type').value = 'remote';
      $('f-hours').value = '1';
      $('f-rate').value = '';
      $('f-desc').value = '';
      $('f-vat').checked = true;
      $('f-vat-rate').value = '18';
      $('hours-field').style.display = '';
      $('rate-field').style.display = 'none';
    }

    $('f-date').value = todayStr();

    $('f-type').addEventListener('change', (e) => {
      const type = e.target.value;
      $('hours-field').style.display = (type === 'remote') ? '' : 'none';
      $('rate-field').style.display = (type === 'custom') ? '' : 'none';
    });

    $('add-btn').addEventListener('click', async () => {
      if (!dataLoaded) { setStatus('Still loading your data — one second...', true); return; }
      const date = $('f-date').value;
      const client = $('f-client').value.trim();
      const type = $('f-type').value;
      const hours = parseFloat($('f-hours').value) || 0;
      const rate = parseFloat($('f-rate').value) || 0;
      const desc = $('f-desc').value.trim();
      const vatApplies = $('f-vat').checked;
      const vatRate = parseFloat($('f-vat-rate').value) || 0;

      if (!date || !desc) { setStatus('Add a date and description', true); return; }

      const amount = computeAmount(type, hours, rate);
      const vatAmount = vatApplies ? Math.round(amount * vatRate) / 100 : 0;
      const payload = {
        date, client, type,
        hours: type === 'remote' ? hours : null,
        amount, vatApplies, vatRate, vatAmount,
        total: amount + vatAmount,
        desc,
      };

      try {
        if (editingId) {
          const updated = await apiUpdate(editingId, payload);
          const idx = entries.findIndex(e => e.id === editingId);
          if (idx !== -1) entries[idx] = updated;
          setStatus('Entry updated ✓');
          resetForm();
        } else {
          const created = await apiCreate(payload);
          entries.push(created);
          $('f-desc').value = '';
          setStatus('Entry added ✓');
        }
      } catch (e) {
        setStatus('Save failed — check your connection', true);
        return;
      }

      const entryMonth = date.slice(0,7);
      if (entryMonth !== fmtMonthKey(currentMonth)) {
        currentMonth = new Date(date + '-01T00:00:00');
        currentMonth.setDate(1);
      }
      render();
    });

    $('cancel-edit-btn').addEventListener('click', () => {
      resetForm();
      setStatus('Edit cancelled');
    });

    window.editEntry = function(id) {
      const e = entries.find(x => x.id === id);
      if (!e) return;
      editingId = id;
      $('f-date').value = e.date;
      $('f-client').value = e.client || '';
      $('f-type').value = e.type;
      $('f-hours').value = e.hours || 1;
      $('f-rate').value = e.type === 'custom' ? e.amount : '';
      $('f-desc').value = e.desc;
      $('f-vat').checked = !!e.vatApplies;
      $('f-vat-rate').value = e.vatRate ?? 18;
      $('hours-field').style.display = (e.type === 'remote') ? '' : 'none';
      $('rate-field').style.display = (e.type === 'custom') ? '' : 'none';
      $('add-btn').textContent = 'Save changes';
      $('cancel-edit-btn').style.display = '';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.deleteEntry = async function(id) {
      try {
        await apiDelete(id);
        entries = entries.filter(e => e.id !== id);
        if (editingId === id) resetForm();
        setStatus('Entry deleted');
      } catch (e) {
        setStatus('Delete failed — check your connection', true);
      }
      render();
    };

    $('prev-month').addEventListener('click', () => { currentMonth.setMonth(currentMonth.getMonth() - 1); render(); });
    $('next-month').addEventListener('click', () => { currentMonth.setMonth(currentMonth.getMonth() + 1); render(); });

    function getMonthEntries() {
      const key = fmtMonthKey(currentMonth);
      return entries
        .filter(e => e && typeof e.date === 'string' && e.date.slice(0,7) === key)
        .sort((a,b) => a.date.localeCompare(b.date));
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    function render() {
      try { renderInner(); }
      catch (err) {
        $('entries-list').innerHTML = '<div class="empty">Something went wrong displaying this month. Your data is safe in the database — try refreshing.</div>';
        setStatus('Display error — data not lost', true);
      }
    }

    function renderInner() {
      $('month-label').textContent = fmtMonthLabel(currentMonth);
      const monthEntries = getMonthEntries();

      const totalHours = monthEntries.reduce((s,e) => s + (Number(e.hours) || 0), 0);
      const totalAmount = monthEntries.reduce((s,e) => s + (Number(e.amount) || 0), 0);
      const totalVat = monthEntries.reduce((s,e) => s + (Number(e.vatAmount) || 0), 0);
      const totalWithVat = totalAmount + totalVat;
      const clients = new Set(monthEntries.map(e => e.client).filter(Boolean));

      $('summary').innerHTML = `
        <div class="stat"><div class="num">${monthEntries.length}</div><div class="lbl">Entries</div></div>
        <div class="stat"><div class="num">${totalHours}</div><div class="lbl">Hours</div></div>
        <div class="stat"><div class="num">${clients.size}</div><div class="lbl">Clients</div></div>
        <div class="stat"><div class="num">₪${totalAmount.toLocaleString()}</div><div class="lbl">Subtotal (before VAT)</div></div>
        <div class="stat"><div class="num">₪${totalVat.toLocaleString()}</div><div class="lbl">VAT</div></div>
        <div class="stat"><div class="num">₪${totalWithVat.toLocaleString()}</div><div class="lbl">Total incl. VAT</div></div>
      `;

      const list = $('entries-list');
      if (monthEntries.length === 0) {
        list.innerHTML = '<div class="empty">No entries for this month yet.</div>';
        return;
      }

      list.innerHTML = monthEntries.map(e => {
        const typeLabel = e.type === 'remote' ? `${e.hours}h remote` : (e.type === 'site' ? 'Site visit' : 'Custom');
        return `
        <div class="entry">
          <div class="entry-top">
            <div>
              <span class="entry-date">${e.date}</span>
              <span class="entry-meta"> · ${e.client || 'No client'} · ${typeLabel}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span class="entry-amount">₪${(e.total ?? e.amount).toLocaleString()}</span>
              <button class="btn-danger" style="color:#2f6b4f" onclick="editEntry('${e.id}')">Edit</button>
              <button class="btn-danger" onclick="deleteEntry('${e.id}')">✕</button>
            </div>
          </div>
          <div class="entry-desc">${escapeHtml(e.desc)}</div>
          ${e.vatApplies ? `<div class="entry-meta" style="margin-top:4px;">₪${e.amount.toLocaleString()} + ${e.vatRate}% VAT (₪${e.vatAmount.toLocaleString()})</div>` : `<div class="entry-meta" style="margin-top:4px;">No VAT</div>`}
        </div>`;
      }).join('');
    }

    function downloadFile(filename, content, mime) {
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    $('export-csv').addEventListener('click', () => {
      const monthEntries = getMonthEntries();
      if (monthEntries.length === 0) { setStatus('Nothing to export', true); return; }
      const rows = [['Date','Client','Type','Hours','Amount (ILS)','VAT %','VAT (ILS)','Total incl. VAT (ILS)','Description']];
      monthEntries.forEach(e => {
        rows.push([e.date, e.client || '', e.type, e.hours || '', e.amount, e.vatApplies ? e.vatRate : 0, e.vatAmount || 0, e.total ?? e.amount, e.desc.replace(/\n/g,' ')]);
      });
      const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
      downloadFile(`timesheet-${fmtMonthKey(currentMonth)}.csv`, csv, 'text/csv');
      setStatus('CSV downloaded ✓');
    });

    $('export-txt').addEventListener('click', () => {
      const monthEntries = getMonthEntries();
      if (monthEntries.length === 0) { setStatus('Nothing to export', true); return; }
      const totalAmount = monthEntries.reduce((s,e) => s + (e.amount || 0), 0);
      const totalVat = monthEntries.reduce((s,e) => s + (e.vatAmount || 0), 0);
      const totalWithVat = totalAmount + totalVat;
      let out = `Timesheet — ${fmtMonthLabel(currentMonth)}\n${'='.repeat(40)}\n\n`;
      monthEntries.forEach(e => {
        const typeLabel = e.type === 'remote' ? `${e.hours}h remote` : (e.type === 'site' ? 'Site visit' : 'Custom');
        const vatLine = e.vatApplies ? `₪${e.amount} + ${e.vatRate}% VAT (₪${e.vatAmount}) = ₪${e.total}` : `₪${e.amount} (no VAT)`;
        out += `${e.date} | ${e.client || 'No client'} | ${typeLabel} | ${vatLine}\n${e.desc}\n\n`;
      });
      out += `${'-'.repeat(40)}\nSubtotal (before VAT): ₪${totalAmount.toLocaleString()}\nVAT: ₪${totalVat.toLocaleString()}\nTotal incl. VAT: ₪${totalWithVat.toLocaleString()}\n`;
      downloadFile(`timesheet-${fmtMonthKey(currentMonth)}.txt`, out, 'text/plain');
      setStatus('Text file downloaded ✓');
    });

    $('show-all-btn').addEventListener('click', async () => {
      const view = $('all-entries-view');
      view.innerHTML = 'Loading from database...';
      try {
        const all = await apiGetAll();
        if (all.length === 0) { view.innerHTML = '<div class="empty">No entries found in the database.</div>'; return; }
        const byMonth = {};
        all.forEach(e => { const m = e.date.slice(0,7); byMonth[m] = (byMonth[m] || 0) + 1; });
        const rowsHtml = Object.keys(byMonth).sort().map(m =>
          `<div style="padding:6px 0;border-bottom:1px solid #e4e1da;font-size:13.5px;"><strong>${m}</strong> — ${byMonth[m]} entr${byMonth[m]===1?'y':'ies'}</div>`
        ).join('');
        view.innerHTML = `<div style="font-size:13px;color:#6b7268;margin-bottom:6px;">Total in database: ${all.length}</div>${rowsHtml}`;
      } catch (e) {
        view.innerHTML = '<div class="empty">Could not read from database.</div>';
      }
    });

    $('export-all-btn').addEventListener('click', async () => {
      try {
        const all = await apiGetAll();
        if (all.length === 0) { setStatus('No stored data to export', true); return; }
        const rows = [['Date','Client','Type','Hours','Amount (ILS)','VAT %','VAT (ILS)','Total incl. VAT (ILS)','Description']];
        all.forEach(e => {
          rows.push([e.date, e.client || '', e.type, e.hours || '', e.amount, e.vatRate || '', e.vatAmount || '', e.total || '', (e.desc || '').replace(/\n/g,' ')]);
        });
        const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(',')).join('\n');
        downloadFile('timetracker-ALL-export.csv', csv, 'text/csv');
        setStatus('Full export downloaded ✓');
      } catch (e) {
        setStatus('Export failed', true);
      }
    });

    loadEntries();

    // Cleanup on unmount (React StrictMode/dev double-invoke safety)
    return () => {
      delete window.editEntry;
      delete window.deleteEntry;
    };
  }, []);

  return (
    <>
      <Head>
        <title>Time Tracker</title>
      </Head>
      <style jsx global>{`
        :root {
          --bg: #faf9f7; --card: #ffffff; --ink: #1f2320; --muted: #6b7268;
          --accent: #2f6b4f; --accent-soft: #e7f1ec; --border: #e4e1da; --danger: #b3453d;
        }
        * { box-sizing: border-box; }
        body {
          margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          background: var(--bg); color: var(--ink); padding: 24px 16px 60px;
        }
        .wrap { max-width: 720px; margin: 0 auto; }
        h1 { font-size: 22px; margin: 0 0 4px; letter-spacing: -0.01em; }
        .sub { color: var(--muted); font-size: 14px; margin-bottom: 20px; }
        .card { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 18px; margin-bottom: 18px; }
        label { display: block; font-size: 12.5px; color: var(--muted); margin-bottom: 4px; font-weight: 600; }
        input, textarea, select {
          width: 100%; padding: 9px 10px; border: 1px solid var(--border); border-radius: 8px;
          font-size: 14px; font-family: inherit; background: #fff; color: var(--ink);
        }
        textarea { resize: vertical; min-height: 60px; }
        .row { display: flex; gap: 10px; }
        .row > div { flex: 1; }
        .field { margin-bottom: 12px; }
        button {
          cursor: pointer; border: none; border-radius: 8px; font-size: 14px;
          font-weight: 600; padding: 10px 16px; font-family: inherit;
        }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        .btn-primary { background: var(--accent); color: #fff; }
        .btn-primary:hover { background: #275a41; }
        .btn-secondary { background: var(--accent-soft); color: var(--accent); }
        .btn-secondary:hover { background: #dcece3; }
        .btn-danger { background: transparent; color: var(--danger); padding: 4px 8px; font-size: 12px; }
        .btn-danger:hover { text-decoration: underline; }
        .month-nav { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .month-nav .label { font-weight: 700; font-size: 16px; }
        .month-nav button { background: var(--accent-soft); color: var(--accent); padding: 6px 12px; }
        .entry { border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; background: #fff; }
        .entry-top { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
        .entry-date { font-weight: 700; font-size: 13px; }
        .entry-meta { color: var(--muted); font-size: 12.5px; }
        .entry-desc { margin-top: 4px; font-size: 14px; line-height: 1.4; white-space: pre-wrap; }
        .entry-amount { font-weight: 700; color: var(--accent); font-size: 13px; white-space: nowrap; }
        .summary { display: flex; gap: 18px; flex-wrap: wrap; margin-bottom: 4px; }
        .summary .stat .num { font-size: 20px; font-weight: 700; }
        .summary .stat .lbl { font-size: 12px; color: var(--muted); }
        .empty { text-align: center; color: var(--muted); padding: 30px 0; font-size: 14px; }
        .top-actions { display: flex; gap: 8px; margin-top: 10px; }
        .status { font-size: 12.5px; color: var(--accent); height: 16px; margin-top: 6px; }
      `}</style>
      <div ref={mountRef} dangerouslySetInnerHTML={{ __html: BODY_HTML }} />
    </>
  );
}
