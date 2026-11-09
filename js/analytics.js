/**
 * Service-Receive (Pass) Analytics Engine
 * Pass ratings use the standard 0-3 scale:
 *   0 = Error (ace against / shanked), 1 = Not good, 2 = Good, 3 = Perfect.
 * Computes pass averages, rating distributions, zone and serve-type
 * breakdowns, and smoothed probabilities for the next pass.
 */

const PASS_RATINGS = [
  { value: 0, key: 'error',    label: 'Error',    color: '#ef4444' },
  { value: 1, key: 'not_good', label: 'Not good', color: '#f97316' },
  { value: 2, key: 'good',     label: 'Good',     color: '#3b82f6' },
  { value: 3, key: 'perfect',  label: 'Perfect',  color: '#10b981' }
];

const SERVE_TYPES = ['Jump Float', 'Float', 'Jump Topspin', 'Topspin'];

// Receiving court zones (x in [9, 18], y in [0, 9]), seen from the receiving team
const ZONES = [
  { zone: 1, name: 'Zone 1 (Back-Right)',   x0: 12, x1: 18, y0: 0, y1: 3 },
  { zone: 6, name: 'Zone 6 (Back-Center)',  x0: 12, x1: 18, y0: 3, y1: 6 },
  { zone: 5, name: 'Zone 5 (Back-Left)',    x0: 12, x1: 18, y0: 6, y1: 9 },
  { zone: 2, name: 'Zone 2 (Front-Right)',  x0: 9,  x1: 12, y0: 0, y1: 3 },
  { zone: 3, name: 'Zone 3 (Front-Center)', x0: 9,  x1: 12, y0: 3, y1: 6 },
  { zone: 4, name: 'Zone 4 (Front-Left)',   x0: 9,  x1: 12, y0: 6, y1: 9 }
];

class PassAnalytics {
  static ratingInfo(value) {
    return PASS_RATINGS[Number(value)] || PASS_RATINGS[0];
  }

  static ratingColor(value) {
    return PassAnalytics.ratingInfo(value).color;
  }

  /**
   * Zone (1-6) where the passer played the ball. A ball played outside the
   * lines is clamped to the nearest zone; contact on the serving side is invalid.
   * @returns {number|null}
   */
  static zoneNumber(x, y) {
    if (x < 9.0) return null;
    const cx = Math.min(x, 18.0);
    const cy = Math.min(Math.max(y, 0), 9.0);
    const z = ZONES.find(z => cx >= z.x0 && cx <= z.x1 && cy >= z.y0 && cy <= z.y1);
    return z ? z.zone : null;
  }

  static zoneName(zone) {
    const z = ZONES.find(z => z.zone === Number(zone));
    return z ? z.name : 'Unknown';
  }

  static isOutside(x, y) {
    return x > 18.0 || y < 0.0 || y > 9.0;
  }

  /**
   * Summary of a set of passes: counts per rating, average and percentages.
   */
  static summarize(passes) {
    const counts = [0, 0, 0, 0];
    passes.forEach(p => {
      const r = Number(p.rating);
      if (r >= 0 && r <= 3) counts[r]++;
    });
    const count = counts.reduce((a, b) => a + b, 0);
    const sum = counts.reduce((acc, c, r) => acc + c * r, 0);
    const pct = n => (count ? Math.round((n / count) * 100) : 0);
    return {
      count,
      counts,
      avg: count ? sum / count : null,
      positivePct: pct(counts[2] + counts[3]),
      perfectPct: pct(counts[3]),
      errorPct: pct(counts[0])
    };
  }

  static groupBy(passes, keyFn) {
    const groups = {};
    passes.forEach(p => {
      const key = keyFn(p);
      if (key === null || key === undefined || key === '') return;
      (groups[key] = groups[key] || []).push(p);
    });
    const result = {};
    Object.keys(groups).forEach(k => { result[k] = PassAnalytics.summarize(groups[k]); });
    return result;
  }

  static byZone(passes) {
    return PassAnalytics.groupBy(passes, p => p.zone);
  }

  static byServeType(passes) {
    return PassAnalytics.groupBy(passes, p => p.serve_type);
  }

  static byPasser(passes) {
    return PassAnalytics.groupBy(passes, p => p.passer_number);
  }

  /**
   * Probability of each rating for the next pass, with Dirichlet/Laplace
   * smoothing (alpha = 0.5 prior) so small samples don't give 0% or 100%.
   */
  static distribution(passes, alpha = 0.5) {
    const { counts, count } = PassAnalytics.summarize(passes);
    const total = count + 4 * alpha;
    return counts.map(c => Math.round(((c + alpha) / total) * 100));
  }

  /**
   * Average shrunk toward a reference average, so a zone with one bad pass
   * doesn't automatically become "the weakest zone".
   */
  static shrunkAvg(summary, referenceAvg, k = 2) {
    if (!summary || !summary.count) return referenceAvg;
    return (summary.avg * summary.count + referenceAvg * k) / (summary.count + k);
  }

  /**
   * Weakest and strongest group (zone, serve type, ...) by shrunk average.
   * @param {Object} groups output of groupBy/byZone/...
   */
  static extremes(groups, referenceAvg, minCount = 2) {
    const keys = Object.keys(groups).filter(k => groups[k].count >= minCount);
    if (keys.length === 0) return { weakest: null, strongest: null };
    const scored = keys
      .map(k => ({ key: k, summary: groups[k], score: PassAnalytics.shrunkAvg(groups[k], referenceAvg) }))
      .sort((a, b) => a.score - b.score);
    return {
      weakest: scored[0],
      strongest: scored.length > 1 ? scored[scored.length - 1] : null
    };
  }

  static confidenceLabel(count) {
    if (count === 0) return 'No Data';
    if (count >= 7) return `High (${count} passes)`;
    if (count >= 3) return `Moderate (${count} passes)`;
    return `Low (${count} pass${count === 1 ? '' : 'es'})`;
  }

  static formatAvg(avg) {
    return avg === null || avg === undefined ? '–' : avg.toFixed(2);
  }

  /**
   * Heat color for a pass average: red (0) -> amber (1.5) -> green (3).
   */
  static heatColor(avg, alpha = 1) {
    if (avg === null || avg === undefined) return `rgba(100, 116, 139, ${alpha})`;
    const hue = Math.max(0, Math.min(3, avg)) / 3 * 135;
    return `hsla(${hue.toFixed(0)}, 80%, 45%, ${alpha})`;
  }

  /**
   * Short coaching notes for one passer (or the whole team when passer is null).
   */
  static notes(passes, teamAvg) {
    const s = PassAnalytics.summarize(passes);
    if (s.count === 0) return [];
    const ref = teamAvg === null || teamAvg === undefined ? s.avg : teamAvg;
    const notes = [];

    const zones = PassAnalytics.extremes(PassAnalytics.byZone(passes), ref);
    if (zones.weakest && zones.weakest.summary.avg < ref) {
      const z = zones.weakest;
      notes.push(`Weakest in ${PassAnalytics.zoneName(z.key)}: avg ${PassAnalytics.formatAvg(z.summary.avg)} on ${z.summary.count} passes.`);
    }

    const types = PassAnalytics.extremes(PassAnalytics.byServeType(passes), ref);
    if (types.weakest && types.weakest.summary.avg < ref) {
      const t = types.weakest;
      notes.push(`Struggles against ${t.key}: avg ${PassAnalytics.formatAvg(t.summary.avg)} on ${t.summary.count} passes.`);
    }

    if (s.count >= 3 && s.errorPct >= 20) {
      notes.push(`High error rate: ${s.counts[0]} errors (${s.errorPct}%).`);
    }
    return notes;
  }
}

window.PASS_RATINGS = PASS_RATINGS;
window.SERVE_TYPES = SERVE_TYPES;
window.ZONES = ZONES;
window.PassAnalytics = PassAnalytics;
