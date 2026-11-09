/**
 * Volleyball Court Canvas Engine
 * Handles high-DPI landscape court rendering, zone annotations,
 * touch/mouse trajectory drawing, pass-quality heat map and trajectory overlays.
 */

class VolleyballCourt {
  /**
   * @param {string|HTMLCanvasElement} canvas canvas id or element
   */
  constructor(canvas, options = {}) {
    this.canvas = typeof canvas === 'string' ? document.getElementById(canvas) : canvas;
    this.ctx = this.canvas.getContext('2d');
    this.options = Object.assign({
      showZones: true,
      showHeat: false,
      showPasserLabels: false,
      flipped: false, // display rotated 180° (service zone on the right), data stays canonical
      interactive: true,
      fixedSize: null, // {width, height, pixelRatio} for offscreen (report) rendering
      onTrajectoryDraftChanged: null
    }, options);

    // Court Dimensions in meters (standard FIVB 18m x 9m)
    this.courtLength = 18.0; // from x = 0 (server baseline) to x = 18 (receiving team baseline)
    this.courtWidth = 9.0;   // from y = 0 (top sideline) to y = 9 (bottom sideline)
    
    // Virtual Bounds (including free zone / out margins)
    this.minX = -3.5;
    this.maxX = 21.5;
    this.minY = -2.5;
    this.maxY = 11.5;

    // Zoomed view of just the receiving half (bounds are in on-screen orientation)
    if (this.options.receptionOnly) {
      this.minX = this.options.flipped ? -2.0 : 8.5;
      this.maxX = this.options.flipped ? 9.5 : 20.0;
      this.minY = -0.8;
      this.maxY = 9.8;
    }

    // Drawing State
    this.draftStart = null; // {x, y} in meters
    this.draftEnd = null;   // {x, y} in meters
    this.isDragging = false;
    this.trajectories = []; // array of saved passes to render
    this.zoneStats = null;  // {zone: summary} from PassAnalytics.byZone

    this.initCanvasSize();
    if (this.options.interactive) this.setupEventListeners();
  }

  /**
   * Render a static court (no interaction) to a PNG data URL, for reports.
   */
  static renderToDataURL({ width = 1000, height = 560, pixelRatio = 2, trajectories = [], zoneStats = null,
                           showZones = true, showHeat = false, showPasserLabels = false, flipped = false,
                           receptionOnly = false }) {
    const canvas = document.createElement('canvas');
    const court = new VolleyballCourt(canvas, {
      interactive: false,
      fixedSize: { width, height, pixelRatio },
      showZones, showHeat, showPasserLabels, flipped, receptionOnly
    });
    court.trajectories = trajectories;
    court.zoneStats = zoneStats;
    court.render();
    return canvas.toDataURL('image/png');
  }

  // CSS-pixel size of the drawing surface
  getRect() {
    if (this.options.fixedSize) {
      return { width: this.options.fixedSize.width, height: this.options.fixedSize.height };
    }
    return this.canvas.getBoundingClientRect();
  }

  initCanvasSize() {
    if (this.options.fixedSize) {
      const { width, height, pixelRatio = 2 } = this.options.fixedSize;
      this.dpr = pixelRatio;
      this.canvas.width = Math.floor(width * pixelRatio);
      this.canvas.height = Math.floor(height * pixelRatio);
      this.render();
      return;
    }
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(rect.width * dpr);
    this.canvas.height = Math.floor(rect.height * dpr);
    this.dpr = dpr;
    this.render();
  }

  // Convert real court meters (x, y) to canvas pixels
  metersToPixels(mx, my) {
    // Flipped view = looking at the court from the opposite sideline (180° rotation),
    // so stored coordinates never change; only the on-screen mapping does.
    if (this.options.flipped) {
      mx = this.courtLength - mx;
      my = this.courtWidth - my;
    }
    const rect = this.getRect();
    const scaleX = (rect.width * this.dpr) / (this.maxX - this.minX);
    const scaleY = (rect.height * this.dpr) / (this.maxY - this.minY);
    const scale = Math.min(scaleX, scaleY);

    const totalWidthPx = (this.maxX - this.minX) * scale;
    const totalHeightPx = (this.maxY - this.minY) * scale;
    const offsetX = ((rect.width * this.dpr) - totalWidthPx) / 2;
    const offsetY = ((rect.height * this.dpr) - totalHeightPx) / 2;

    const px = offsetX + (mx - this.minX) * scale;
    const py = offsetY + (my - this.minY) * scale;
    return { px, py, scale };
  }

  // Convert canvas pixels to real court meters (x, y)
  pixelsToMeters(px, py) {
    const rect = this.getRect();
    const scaleX = (rect.width * this.dpr) / (this.maxX - this.minX);
    const scaleY = (rect.height * this.dpr) / (this.maxY - this.minY);
    const scale = Math.min(scaleX, scaleY);

    const totalWidthPx = (this.maxX - this.minX) * scale;
    const totalHeightPx = (this.maxY - this.minY) * scale;
    const offsetX = ((rect.width * this.dpr) - totalWidthPx) / 2;
    const offsetY = ((rect.height * this.dpr) - totalHeightPx) / 2;

    const mx = this.minX + (px - offsetX) / scale;
    const my = this.minY + (py - offsetY) / scale;
    if (this.options.flipped) {
      return { x: this.courtLength - mx, y: this.courtWidth - my };
    }
    return { x: mx, y: my };
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.initCanvasSize());

    // Pointer events handle both touch (mobile/tablet) and mouse cleanly
    this.canvas.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this.handlePointerCancel(e));
  }

  getPointerCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) * this.dpr;
    const py = (e.clientY - rect.top) * this.dpr;
    return this.pixelsToMeters(px, py);
  }

  handlePointerDown(e) {
    this.canvas.setPointerCapture(e.pointerId);
    const pt = this.getPointerCanvasPos(e);

    // If we don't have a start point, set start point
    if (!this.draftStart) {
      this.draftStart = { x: pt.x, y: pt.y };
      this.draftEnd = null;
      this.isDragging = true;
    } else if (this.draftStart && !this.draftEnd) {
      // 2nd tap sets the end point
      this.draftEnd = { x: pt.x, y: pt.y };
      this.isDragging = false;
    } else {
      // If we already had both, start a new trajectory
      this.draftStart = { x: pt.x, y: pt.y };
      this.draftEnd = null;
      this.isDragging = true;
    }

    this.notifyDraftChanged();
    this.render();
  }

  handlePointerMove(e) {
    if (!this.isDragging || !this.draftStart) return;
    const pt = this.getPointerCanvasPos(e);
    this.draftEnd = { x: pt.x, y: pt.y };
    this.render();
  }

  handlePointerUp(e) {
    if (this.isDragging && this.draftStart && this.draftEnd) {
      // If dragged at least a small distance, finalize end point
      const dx = this.draftEnd.x - this.draftStart.x;
      const dy = this.draftEnd.y - this.draftStart.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.5) {
        // Was just a single tap; keep waiting for second tap
        this.draftEnd = null;
      }
    }
    this.isDragging = false;
    this.notifyDraftChanged();
    this.render();
  }

  handlePointerCancel() {
    this.isDragging = false;
    this.render();
  }

  clearDraft() {
    this.draftStart = null;
    this.draftEnd = null;
    this.isDragging = false;
    this.notifyDraftChanged();
    this.render();
  }

  notifyDraftChanged() {
    if (this.options.onTrajectoryDraftChanged) {
      this.options.onTrajectoryDraftChanged(this.draftStart, this.draftEnd);
    }
  }

  setTrajectories(trajectories) {
    this.trajectories = trajectories || [];
    this.render();
  }

  setZoneStats(stats) {
    this.zoneStats = stats;
    this.render();
  }

  setShowZones(show) {
    this.options.showZones = show;
    this.render();
  }

  setShowHeat(show) {
    this.options.showHeat = show;
    this.render();
  }

  setShowPasserLabels(show) {
    this.options.showPasserLabels = show;
    this.render();
  }

  setFlipped(flipped) {
    this.options.flipped = flipped;
    this.render();
  }

  render() {
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    this.renderCourtBackground();
    if (this.options.showHeat && this.zoneStats) {
      this.renderHeatOverlay();
    }
    this.renderCourtLines();
    if (this.options.showZones) {
      this.renderZones();
    }
    this.renderHistoricalTrajectories();
    this.renderCurrentDraft();
  }

  renderCourtBackground() {
    const { ctx } = this;
    const { scale } = this.metersToPixels(0, 0);

    // Outer Free Zone (FIVB Terracotta)
    const pMin = this.metersToPixels(this.minX, this.minY);
    const pMax = this.metersToPixels(this.maxX, this.maxY);
    
    ctx.fillStyle = '#a1421a'; // FIVB Outer runoff orange/terracotta
    ctx.fillRect(pMin.px, pMin.py, pMax.px - pMin.px, pMax.py - pMin.py);

    // Court Playing Area (18m x 9m) - FIVB Olympic Blue
    const c0 = this.metersToPixels(0, 0);
    const c1 = this.metersToPixels(18, 9);
    
    // Slight gradient on playing surface for premium depth
    const grad = ctx.createLinearGradient(c0.px, c0.py, c1.px, c1.py);
    grad.addColorStop(0, '#1d4ed8');
    grad.addColorStop(1, '#1e3a8a');
    ctx.fillStyle = grad;
    ctx.fillRect(c0.px, c0.py, c1.px - c0.px, c1.py - c0.py);

    // Service Runway zone behind server baseline (left side: -3.0 to 0.0)
    const s0 = this.metersToPixels(-3.0, 0);
    const s1 = this.metersToPixels(0, 9);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.fillRect(s0.px, s0.py, s1.px - s0.px, s1.py - s0.py);
  }

  renderCourtLines() {
    const { ctx } = this;
    const lineWidth = Math.max(2 * this.dpr, 3);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'square';

    // Outer Boundary (18m x 9m)
    const c0 = this.metersToPixels(0, 0);
    const c1 = this.metersToPixels(18, 9);
    ctx.strokeRect(c0.px, c0.py, c1.px - c0.px, c1.py - c0.py);

    // Server Baseline Extension marks (standard 15cm hash lines behind baseline)
    const hTop0 = this.metersToPixels(-0.8, 0);
    const hTop1 = this.metersToPixels(0, 0);
    const hBot0 = this.metersToPixels(-0.8, 9);
    const hBot1 = this.metersToPixels(0, 9);
    ctx.beginPath();
    ctx.moveTo(hTop0.px, hTop0.py); ctx.lineTo(hTop1.px, hTop1.py);
    ctx.moveTo(hBot0.px, hBot0.py); ctx.lineTo(hBot1.px, hBot1.py);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.stroke();

    // Left Attack Line (x = 6.0)
    const aL0 = this.metersToPixels(6, 0);
    const aL1 = this.metersToPixels(6, 9);
    ctx.beginPath();
    ctx.moveTo(aL0.px, aL0.py);
    ctx.lineTo(aL1.px, aL1.py);
    ctx.strokeStyle = '#ffffff';
    ctx.stroke();

    // Right Attack Line (x = 12.0)
    const aR0 = this.metersToPixels(12, 0);
    const aR1 = this.metersToPixels(12, 9);
    ctx.beginPath();
    ctx.moveTo(aR0.px, aR0.py);
    ctx.lineTo(aR1.px, aR1.py);
    ctx.stroke();

    // Center Net Line (x = 9.0)
    const net0 = this.metersToPixels(9, -0.6);
    const net1 = this.metersToPixels(9, 9.6);
    
    // Net shadow & mesh band
    ctx.lineWidth = lineWidth * 2.2;
    ctx.strokeStyle = '#0f172a';
    ctx.beginPath();
    ctx.moveTo(net0.px, net0.py);
    ctx.lineTo(net1.px, net1.py);
    ctx.stroke();

    ctx.lineWidth = lineWidth * 1.5;
    ctx.strokeStyle = '#f8fafc';
    ctx.beginPath();
    ctx.moveTo(net0.px, net0.py);
    ctx.lineTo(net1.px, net1.py);
    ctx.stroke();

    // Net Antennae (at y=0 and y=9 on the net)
    const antTop0 = this.metersToPixels(9, -0.8);
    const antTop1 = this.metersToPixels(9, 0.8);
    ctx.lineWidth = 4 * this.dpr;
    ctx.strokeStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(antTop0.px, antTop0.py);
    ctx.lineTo(antTop1.px, antTop1.py);
    ctx.stroke();

    const antBot0 = this.metersToPixels(9, 8.2);
    const antBot1 = this.metersToPixels(9, 9.8);
    ctx.beginPath();
    ctx.moveTo(antBot0.px, antBot0.py);
    ctx.lineTo(antBot1.px, antBot1.py);
    ctx.stroke();
  }

  renderZones() {
    const { ctx } = this;
    const fontPx = Math.max(12 * this.dpr, 13);
    ctx.font = `800 ${fontPx}px Outfit, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Receiving court 6 zones (x in [9, 18], y in [0, 9])
    const showStats = this.options.showHeat && this.zoneStats;
    ZONES.forEach(z => {
      const p = this.metersToPixels((z.x0 + z.x1) / 2, (z.y0 + z.y1) / 2);
      const stats = showStats ? this.zoneStats[z.zone] : null;
      const pillH = (stats ? 40 : 24) * this.dpr;

      // Subtle zone pill background
      ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
      ctx.beginPath();
      ctx.roundRect(p.px - 34 * this.dpr, p.py - pillH / 2, 68 * this.dpr, pillH, 6 * this.dpr);
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      if (stats) {
        ctx.font = `700 ${fontPx * 0.75}px Outfit, sans-serif`;
        ctx.fillText(`ZONE ${z.zone}`, p.px, p.py - 10 * this.dpr);
        ctx.font = `800 ${fontPx * 1.05}px Outfit, sans-serif`;
        ctx.fillText(`${PassAnalytics.formatAvg(stats.avg)} (${stats.count})`, p.px, p.py + 7 * this.dpr);
        ctx.font = `800 ${fontPx}px Outfit, sans-serif`;
      } else {
        ctx.fillText(`ZONE ${z.zone}`, p.px, p.py);
      }
    });

    // Label the opponent's service side and the receiving side
    const sPos = this.metersToPixels(-1.8, 4.5);
    ctx.save();
    ctx.translate(sPos.px, sPos.py);
    ctx.rotate(this.options.flipped ? Math.PI / 2 : -Math.PI / 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = `700 ${fontPx * 0.9}px Outfit, sans-serif`;
    ctx.fillText('SERVER', 0, 0);
    ctx.restore();

    const rPos = this.metersToPixels(19.8, 4.5);
    ctx.save();
    ctx.translate(rPos.px, rPos.py);
    ctx.rotate(this.options.flipped ? -Math.PI / 2 : Math.PI / 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = `700 ${fontPx * 0.9}px Outfit, sans-serif`;
    ctx.fillText('RECEPTION', 0, 0);
    ctx.restore();
  }

  // Colors each receiving zone by its pass average (red = poor, green = perfect)
  renderHeatOverlay() {
    const { ctx } = this;
    ZONES.forEach(z => {
      const stats = this.zoneStats[z.zone];
      if (!stats || !stats.count) return;
      const p0 = this.metersToPixels(z.x0, z.y0);
      const p1 = this.metersToPixels(z.x1, z.y1);
      ctx.fillStyle = PassAnalytics.heatColor(stats.avg, 0.55);
      ctx.fillRect(Math.min(p0.px, p1.px), Math.min(p0.py, p1.py), Math.abs(p1.px - p0.px), Math.abs(p1.py - p0.py));
    });
  }

  renderHistoricalTrajectories() {
    if (!this.trajectories || this.trajectories.length === 0) return;

    this.trajectories.forEach((traj, idx) => {
      const isLatest = idx === this.trajectories.length - 1;
      this.drawTrajectoryLine(
        traj.start_x, traj.start_y,
        traj.end_x, traj.end_y,
        PassAnalytics.ratingColor(traj.rating),
        isLatest ? 1.0 : 0.65,
        false
      );
    });

    if (this.options.showPasserLabels) {
      const { ctx } = this;
      ctx.save();
      ctx.font = `800 ${10 * this.dpr}px Outfit, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      this.trajectories.forEach(traj => {
        const p = this.metersToPixels(traj.end_x, traj.end_y);
        ctx.lineWidth = 3 * this.dpr;
        ctx.strokeStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.strokeText(`#${traj.passer_number}`, p.px, p.py - 8 * this.dpr);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`#${traj.passer_number}`, p.px, p.py - 8 * this.dpr);
      });
      ctx.restore();
    }
  }

  renderCurrentDraft() {
    const { ctx } = this;
    if (!this.draftStart) return;

    const pStart = this.metersToPixels(this.draftStart.x, this.draftStart.y);

    // Glowing start point pulse
    ctx.beginPath();
    ctx.arc(pStart.px, pStart.py, 8 * this.dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#38bdf8';
    ctx.shadowBlur = 12 * this.dpr;
    ctx.fill();
    ctx.shadowBlur = 0;

    // Small white core
    ctx.beginPath();
    ctx.arc(pStart.px, pStart.py, 3.5 * this.dpr, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    if (this.draftEnd) {
      // Draw live rubber-band trajectory line
      this.drawTrajectoryLine(
        this.draftStart.x, this.draftStart.y,
        this.draftEnd.x, this.draftEnd.y,
        '#fbbf24', // Yellow for draft
        1.0,
        true
      );
    }
  }

  drawTrajectoryLine(sx, sy, ex, ey, strokeColor, opacity = 1.0, isDraft = false) {
    const { ctx } = this;
    const p0 = this.metersToPixels(sx, sy);
    const p1 = this.metersToPixels(ex, ey);

    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.strokeStyle = strokeColor;
    ctx.fillStyle = strokeColor;
    ctx.lineWidth = (isDraft ? 3.5 : 2.8) * this.dpr;
    ctx.lineCap = 'round';

    // Trajectory Line
    ctx.beginPath();
    ctx.moveTo(p0.px, p0.py);
    ctx.lineTo(p1.px, p1.py);
    ctx.stroke();

    // Start point dot
    ctx.beginPath();
    ctx.arc(p0.px, p0.py, 4.5 * this.dpr, 0, Math.PI * 2);
    ctx.fill();

    // Pass contact point (white-rimmed dot) for recorded passes
    if (!isDraft) {
      ctx.beginPath();
      ctx.arc(p1.px, p1.py, 5.5 * this.dpr, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1.5 * this.dpr;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
      ctx.restore();
      return;
    }

    // Arrowhead at contact point while drawing
    const angle = Math.atan2(p1.py - p0.py, p1.px - p0.px);
    const headLen = 12 * this.dpr;
    ctx.beginPath();
    ctx.moveTo(p1.px, p1.py);
    ctx.lineTo(
      p1.px - headLen * Math.cos(angle - Math.PI / 6),
      p1.py - headLen * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      p1.px - headLen * Math.cos(angle + Math.PI / 6),
      p1.py - headLen * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();

    // Contact ring for draft
    ctx.beginPath();
    ctx.arc(p1.px, p1.py, 10 * this.dpr, 0, Math.PI * 2);
    ctx.lineWidth = 2 * this.dpr;
    ctx.stroke();

    ctx.restore();
  }
}

window.VolleyballCourt = VolleyballCourt;
