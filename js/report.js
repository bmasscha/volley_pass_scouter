/**
 * Post-Game Reception Report
 * Builds a printable (Print / Save as PDF) report of one team's service
 * reception, and a self-contained HTML version that can be shared as a file.
 * Court images are embedded as PNG data URLs so the report works offline.
 */

const REPORT_CSS = `
.report-doc {
  --rp-ink: #0f172a;
  --rp-muted: #475569;
  --rp-line: #e2e8f0;
  --rp-soft: #f1f5f9;
  background: #ffffff;
  color: var(--rp-ink);
  font-family: 'Outfit', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-width: 1000px;
  margin: 0 auto;
  padding: 32px 36px 40px;
  user-select: text;
  -webkit-user-select: text;
  line-height: 1.4;
}
.report-doc * { box-sizing: border-box; }
.report-doc h1 { font-size: 1.7rem; font-weight: 800; margin: 0; letter-spacing: -0.01em; }
.report-doc h2 {
  font-size: 1.05rem; font-weight: 800; margin: 0 0 10px;
  text-transform: uppercase; letter-spacing: 0.06em; color: var(--rp-muted);
}
.report-doc h3 { font-size: 1.05rem; font-weight: 800; margin: 0; }
.rp-header {
  display: flex; justify-content: space-between; align-items: flex-end; gap: 16px;
  border-bottom: 3px solid var(--rp-ink); padding-bottom: 12px; margin-bottom: 20px;
}
.rp-sub { color: var(--rp-muted); font-size: 1rem; margin-top: 2px; }
.rp-meta { text-align: right; color: var(--rp-muted); font-size: 0.9rem; }
.rp-section { margin-bottom: 26px; break-inside: avoid; page-break-inside: avoid; }
.rp-kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 14px; }
.rp-kpi { background: var(--rp-soft); border-radius: 10px; padding: 12px 14px; }
.rp-kpi-value { font-size: 1.9rem; font-weight: 800; font-family: 'JetBrains Mono', monospace; }
.rp-kpi-label { font-size: 0.8rem; color: var(--rp-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
.rp-stack { display: flex; height: 16px; border-radius: 8px; overflow: hidden; background: var(--rp-line); }
.rp-stack > span { display: block; height: 100%; }
.rp-stack.small { height: 10px; min-width: 90px; }
.rp-legend { display: flex; flex-wrap: wrap; gap: 14px; font-size: 0.82rem; color: var(--rp-muted); margin-top: 6px; }
.rp-dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: -1px; }
.rp-findings { margin: 0; padding-left: 20px; }
.rp-findings li { margin-bottom: 4px; }
.report-doc table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.report-doc th {
  text-align: right; font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.05em;
  color: var(--rp-muted); padding: 6px 8px; border-bottom: 2px solid var(--rp-line);
}
.report-doc td { text-align: right; padding: 6px 8px; border-bottom: 1px solid var(--rp-line); font-variant-numeric: tabular-nums; }
.report-doc th:first-child, .report-doc td:first-child { text-align: left; }
.report-doc tr.rp-total td { font-weight: 800; border-top: 2px solid var(--rp-ink); border-bottom: none; }
.rp-avg { font-weight: 800; }
.rp-heat { color: #fff; font-weight: 700; text-align: center !important; border: 2px solid #fff; border-radius: 6px; }
.rp-heat.empty { background: var(--rp-soft); color: #94a3b8; }
.rp-figures { display: grid; grid-template-columns: 0.62fr 1fr; gap: 14px; align-items: start; }
.rp-figure { margin: 0; }
.rp-figure img { width: 100%; display: block; border-radius: 8px; }
.rp-figure figcaption { font-size: 0.82rem; color: var(--rp-muted); margin-top: 4px; }
.rp-passers { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.rp-passer { border: 1px solid var(--rp-line); border-radius: 10px; padding: 12px; break-inside: avoid; page-break-inside: avoid; }
.rp-passer-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; }
.rp-passer-avg { font-family: 'JetBrains Mono', monospace; font-weight: 800; font-size: 1.2rem; }
.rp-passer img { width: 100%; display: block; border-radius: 6px; margin-bottom: 8px; }
.rp-passer-line { font-size: 0.85rem; color: var(--rp-muted); margin-bottom: 4px; }
.rp-passer ul { margin: 6px 0 0; padding-left: 18px; font-size: 0.85rem; }
.rp-footer { border-top: 1px solid var(--rp-line); padding-top: 10px; font-size: 0.78rem; color: var(--rp-muted); }
.rp-page-break { break-before: page; page-break-before: always; }
@media (max-width: 700px) {
  .report-doc { padding: 20px 16px; }
  .rp-kpis { grid-template-columns: repeat(2, 1fr); }
  .rp-figures, .rp-passers { grid-template-columns: 1fr; }
  .rp-table-wrap { overflow-x: auto; }
}
@media print {
  .report-doc { max-width: none; padding: 0; }
  .rp-kpi, .rp-stack > span, .rp-heat, .rp-dot { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

class PassReport {
  static escape(value) {
    return String(value === undefined || value === null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  static ensureStyles() {
    if (document.getElementById('reportStyles')) return;
    const style = document.createElement('style');
    style.id = 'reportStyles';
    style.textContent = REPORT_CSS;
    document.head.appendChild(style);
  }

  static stackBar(summary, small = false) {
    if (!summary.count) return `<div class="rp-stack${small ? ' small' : ''}"></div>`;
    const parts = [...PASS_RATINGS].reverse().map(r => {
      const pct = (summary.counts[r.value] / summary.count) * 100;
      return pct > 0 ? `<span style="width:${pct.toFixed(1)}%;background:${r.color}" title="${r.label}: ${summary.counts[r.value]}"></span>` : '';
    });
    return `<div class="rp-stack${small ? ' small' : ''}">${parts.join('')}</div>`;
  }

  static heatCell(summary) {
    if (!summary || !summary.count) return '<td class="rp-heat empty">–</td>';
    return `<td class="rp-heat" style="background:${PassAnalytics.heatColor(summary.avg)}">${PassAnalytics.formatAvg(summary.avg)}<br><small>${summary.count}</small></td>`;
  }

  static matchDate(passes) {
    const times = passes.map(p => Date.parse(p.timestamp)).filter(t => !isNaN(t));
    const d = times.length ? new Date(Math.min(...times)) : new Date();
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  }

  // Passers ordered by number of passes, then jersey number
  static passerList(passes, roster) {
    const byPasser = PassAnalytics.byPasser(passes);
    const nums = Object.keys(byPasser);
    (roster || []).forEach(n => { if (!nums.includes(n)) nums.push(n); });
    return nums
      .map(n => ({ num: n, summary: byPasser[n] || PassAnalytics.summarize([]) }))
      .filter(p => p.summary.count > 0)
      .sort((a, b) => b.summary.count - a.summary.count || parseInt(a.num, 10) - parseInt(b.num, 10));
  }

  static findings(passes, passers, team) {
    const fmt = PassAnalytics.formatAvg;
    const out = [];
    out.push(`Team pass average <b>${fmt(team.avg)}</b> on ${team.count} serves received; ${team.positivePct}% positive (good or perfect), ${team.perfectPct}% perfect.`);

    const rated = passers.filter(p => p.summary.count >= 3);
    if (rated.length >= 2) {
      const sorted = [...rated].sort((a, b) => b.summary.avg - a.summary.avg);
      const best = sorted[0];
      const worst = sorted[sorted.length - 1];
      out.push(`Best passer: <b>#${best.num}</b> (avg ${fmt(best.summary.avg)} on ${best.summary.count}). Weakest: <b>#${worst.num}</b> (avg ${fmt(worst.summary.avg)} on ${worst.summary.count}).`);
    }

    if (passers.length) {
      const target = passers[0];
      const share = Math.round((target.summary.count / team.count) * 100);
      out.push(`Most targeted passer: <b>#${target.num}</b> with ${target.summary.count} of ${team.count} serves (${share}%).`);
    }

    const zones = PassAnalytics.extremes(PassAnalytics.byZone(passes), team.avg);
    if (zones.weakest) {
      let line = `Weakest zone: <b>${PassAnalytics.zoneName(zones.weakest.key)}</b> (avg ${fmt(zones.weakest.summary.avg)} on ${zones.weakest.summary.count})`;
      if (zones.strongest) line += `; strongest: ${PassAnalytics.zoneName(zones.strongest.key)} (avg ${fmt(zones.strongest.summary.avg)})`;
      out.push(line + '.');
    }

    const types = PassAnalytics.extremes(PassAnalytics.byServeType(passes), team.avg);
    if (types.weakest && types.strongest) {
      out.push(`Hardest serve type to receive: <b>${PassReport.escape(types.weakest.key)}</b> (avg ${fmt(types.weakest.summary.avg)} on ${types.weakest.summary.count}).`);
    }

    if (team.counts[0] > 0) {
      const errs = passers.filter(p => p.summary.counts[0] > 0).sort((a, b) => b.summary.counts[0] - a.summary.counts[0]);
      const list = errs.slice(0, 3).map(p => `#${p.num} (${p.summary.counts[0]})`).join(', ');
      out.push(`${team.counts[0]} reception error${team.counts[0] === 1 ? '' : 's'} / aces conceded: ${list}.`);
    } else {
      out.push('No reception errors - no aces conceded.');
    }
    return out;
  }

  /**
   * @param {HTMLElement} container
   * @param {{receivingTeam, servingTeam, roster, passes, flipped}} data
   */
  static render(container, data) {
    PassReport.ensureStyles();
    const esc = PassReport.escape;
    const fmt = PassAnalytics.formatAvg;
    const { passes, flipped } = data;
    const team = PassAnalytics.summarize(passes);
    const passers = PassReport.passerList(passes, data.roster);
    const zoneOrder = [4, 3, 2, 5, 6, 1]; // front row then back row, left to right as seen by the passers

    const kpi = (value, label, color) =>
      `<div class="rp-kpi"><div class="rp-kpi-value"${color ? ` style="color:${color}"` : ''}>${value}</div><div class="rp-kpi-label">${label}</div></div>`;

    const legend = `<div class="rp-legend">${[...PASS_RATINGS].reverse().map(r =>
      `<span><span class="rp-dot" style="background:${r.color}"></span>${r.label} (${r.value}) – ${team.counts[r.value]}</span>`).join('')}</div>`;

    const passerRows = passers.map(p => {
      const s = p.summary;
      return `<tr>
        <td><b>#${esc(p.num)}</b></td>
        <td>${s.count}</td>
        <td class="rp-avg" style="color:${PassAnalytics.heatColor(s.avg)}">${fmt(s.avg)}</td>
        <td>${s.counts[3]}</td><td>${s.counts[2]}</td><td>${s.counts[1]}</td><td>${s.counts[0]}</td>
        <td>${s.positivePct}%</td><td>${s.perfectPct}%</td>
        <td>${PassReport.stackBar(s, true)}</td>
      </tr>`;
    }).join('');

    const zoneHeader = zoneOrder.map(z => `<th style="text-align:center">Z${z}</th>`).join('');
    const zoneRows = passers.map(p => {
      const zs = PassAnalytics.byZone(passes.filter(x => String(x.passer_number) === String(p.num)));
      return `<tr><td><b>#${esc(p.num)}</b></td>${zoneOrder.map(z => PassReport.heatCell(zs[z])).join('')}</tr>`;
    }).join('');
    const teamZones = PassAnalytics.byZone(passes);
    const zoneTotal = `<tr class="rp-total"><td>Team</td>${zoneOrder.map(z => PassReport.heatCell(teamZones[z])).join('')}</tr>`;

    const types = PassAnalytics.byServeType(passes);
    const typeRows = SERVE_TYPES.filter(t => types[t]).map(t => {
      const s = types[t];
      return `<tr><td>${esc(t)}</td><td>${s.count}</td>
        <td class="rp-avg" style="color:${PassAnalytics.heatColor(s.avg)}">${fmt(s.avg)}</td>
        <td>${s.positivePct}%</td><td>${s.perfectPct}%</td><td>${s.errorPct}%</td>
        <td>${PassReport.stackBar(s, true)}</td></tr>`;
    }).join('');

    const heatImg = VolleyballCourt.renderToDataURL({ width: 320, height: 295, pixelRatio: 5, zoneStats: teamZones, showHeat: true, flipped, receptionOnly: true });
    const trajImg = VolleyballCourt.renderToDataURL({ width: 900, height: 504, trajectories: passes, showPasserLabels: true, flipped });

    const passerCards = passers.map(p => {
      const mine = passes.filter(x => String(x.passer_number) === String(p.num));
      const s = p.summary;
      const img = VolleyballCourt.renderToDataURL({
        width: 560, height: 314, pixelRatio: 2, trajectories: mine,
        zoneStats: PassAnalytics.byZone(mine), showHeat: true, flipped
      });
      const notes = PassAnalytics.notes(mine, team.avg);
      return `<div class="rp-passer">
        <div class="rp-passer-head">
          <h3>#${esc(p.num)}</h3>
          <span class="rp-passer-avg" style="color:${PassAnalytics.heatColor(s.avg)}">${fmt(s.avg)}</span>
        </div>
        <img src="${img}" alt="Passes of #${esc(p.num)}">
        <div class="rp-passer-line">${s.count} passes · ${s.counts[3]} perfect · ${s.counts[2]} good · ${s.counts[1]} not good · ${s.counts[0]} error · ${s.positivePct}% positive</div>
        ${PassReport.stackBar(s)}
        ${notes.length ? `<ul>${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      </div>`;
    }).join('');

    container.innerHTML = `
      <div class="report-doc">
        <header class="rp-header">
          <div>
            <h1>Reception Report – ${esc(data.receivingTeam)}</h1>
            <div class="rp-sub">Service reception against ${esc(data.servingTeam)}</div>
          </div>
          <div class="rp-meta">${esc(PassReport.matchDate(passes))}<br>${team.count} serves received</div>
        </header>

        <section class="rp-section">
          <div class="rp-kpis">
            ${kpi(fmt(team.avg), 'Pass average (0–3)', PassAnalytics.heatColor(team.avg))}
            ${kpi(`${team.positivePct}%`, 'Positive (good + perfect)')}
            ${kpi(`${team.perfectPct}%`, 'Perfect')}
            ${kpi(team.counts[0], `Errors / aces (${team.errorPct}%)`, team.counts[0] ? PASS_RATINGS[0].color : null)}
          </div>
          ${PassReport.stackBar(team)}
          ${legend}
        </section>

        <section class="rp-section">
          <h2>Key findings</h2>
          <ul class="rp-findings">${PassReport.findings(passes, passers, team).map(f => `<li>${f}</li>`).join('')}</ul>
        </section>

        <section class="rp-section">
          <h2>Passers</h2>
          <div class="rp-table-wrap">
          <table>
            <thead><tr><th>Passer</th><th>Passes</th><th>Avg</th><th>Perfect</th><th>Good</th><th>Not good</th><th>Error</th><th>Pos %</th><th>Perf %</th><th>Distribution</th></tr></thead>
            <tbody>
              ${passerRows}
              <tr class="rp-total"><td>Team</td><td>${team.count}</td><td>${fmt(team.avg)}</td>
                <td>${team.counts[3]}</td><td>${team.counts[2]}</td><td>${team.counts[1]}</td><td>${team.counts[0]}</td>
                <td>${team.positivePct}%</td><td>${team.perfectPct}%</td><td>${PassReport.stackBar(team, true)}</td></tr>
            </tbody>
          </table>
          </div>
        </section>

        <section class="rp-section">
          <h2>Reception zones</h2>
          <div class="rp-figures">
            <figure class="rp-figure"><img src="${heatImg}" alt="Zone heat map"><figcaption>Pass average per zone (number of passes). Red = poor, green = perfect.</figcaption></figure>
            <figure class="rp-figure"><img src="${trajImg}" alt="All serve trajectories"><figcaption>All serves, from server to pass contact point, colored by pass rating.</figcaption></figure>
          </div>
        </section>

        <section class="rp-section">
          <h2>Pass average per passer and zone</h2>
          <div class="rp-table-wrap">
          <table>
            <thead><tr><th>Passer</th>${zoneHeader}</tr></thead>
            <tbody>${zoneRows}${zoneTotal}</tbody>
          </table>
          </div>
          <div class="rp-legend">Front row: Z4 – Z3 – Z2 · Back row: Z5 – Z6 – Z1. Small number = passes.</div>
        </section>

        ${typeRows ? `
        <section class="rp-section">
          <h2>By serve type</h2>
          <table>
            <thead><tr><th>Serve type</th><th>Passes</th><th>Avg</th><th>Pos %</th><th>Perf %</th><th>Error %</th><th>Distribution</th></tr></thead>
            <tbody>${typeRows}</tbody>
          </table>
        </section>` : ''}

        <section class="rp-page-break">
          <h2>Per passer</h2>
          <div class="rp-passers">${passerCards}</div>
        </section>

        <footer class="rp-footer" style="margin-top:20px">
          Rating scale: 3 = Perfect (all attack options for the setter) · 2 = Good (limited options) · 1 = Not good (no quick attack) · 0 = Error (ace or ball lost).
          Generated by Volleyball Pass Scout.
        </footer>
      </div>`;
  }

  static toStandaloneHtml(container, data) {
    const title = `Reception report – ${PassReport.escape(data.receivingTeam)} vs ${PassReport.escape(data.servingTeam)}`;
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;800&family=JetBrains+Mono:wght@700;800&display=swap" rel="stylesheet">
<style>
body { margin: 0; background: #e2e8f0; }
.report-doc { margin: 24px auto; box-shadow: 0 4px 24px rgba(15, 23, 42, 0.15); }
@media print { body { background: #fff; } .report-doc { margin: 0; box-shadow: none; } }
${REPORT_CSS}
</style>
</head>
<body>
${container.innerHTML}
</body>
</html>`;
  }
}

window.PassReport = PassReport;
