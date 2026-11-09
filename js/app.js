/**
 * Main Application Controller for Volleyball Pass Scout
 */

(function () {
  const DEFAULT_ROSTER = ['1', '3', '4', '7', '9', '11', '14', '18'];

  // Application State
  const state = {
    teamName: 'My Team',
    opponentName: 'Opponent',
    rosters: { own: [...DEFAULT_ROSTER], opponent: [...DEFAULT_ROSTER] },
    receivingSide: 'own', // 'own' | 'opponent' - whose reception is being scouted
    selectedPlayer: '7',
    selectedServeType: 'Jump Float',
    passes: [],
    filterMode: 'player', // 'player' | 'all'
    draftStart: null,
    draftEnd: null,
    showHeat: true,
    courtFlipped: false // view only: service zone drawn on the right
  };

  const STORAGE_KEY = 'vball_pass_scout_state_v1';

  // DOM Elements
  const displayTeamName = document.getElementById('displayTeamName');
  const displayOpponentName = document.getElementById('displayOpponentName');
  const sideSwitch = document.getElementById('sideSwitch');
  const sideOwnBtn = document.getElementById('sideOwnBtn');
  const sideOppBtn = document.getElementById('sideOppBtn');
  const playerRosterGrid = document.getElementById('playerRosterGrid');
  const playerPassCountBadge = document.getElementById('playerPassCountBadge');
  const serveTypeGrid = document.getElementById('serveTypeGrid');
  const draftStatusIndicator = document.getElementById('draftStatusIndicator');
  const courtHintText = document.getElementById('courtHintText');
  const ratingButtons = document.querySelectorAll('.rating-btn');

  const clearCurrentDraftBtn = document.getElementById('clearCurrentDraftBtn');
  const undoBtn = document.getElementById('undoBtn');
  const newGameBtn = document.getElementById('newGameBtn');
  const filterBtn = document.getElementById('filterBtn');
  const filterLabel = document.getElementById('filterLabel');

  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const importCsvBtn = document.getElementById('importCsvBtn');
  const csvFileInput = document.getElementById('csvFileInput');

  const toggleFullscreenBtn = document.getElementById('toggleFullscreenBtn');
  const installAppBtn = document.getElementById('installAppBtn');
  let deferredPrompt = null;

  const toggleHeatOverlay = document.getElementById('toggleHeatOverlay');
  const toggleZonesOverlay = document.getElementById('toggleZonesOverlay');
  const toggleFlipCourt = document.getElementById('toggleFlipCourt');
  const serveDirectionText = document.getElementById('serveDirectionText');

  // Stats elements
  const statsCardTitle = document.getElementById('statsCardTitle');
  const statsConfidenceBadge = document.getElementById('statsConfidenceBadge');
  const statAvgVal = document.getElementById('statAvgVal');
  const statPositiveVal = document.getElementById('statPositiveVal');
  const statTeamAvgVal = document.getElementById('statTeamAvgVal');
  const ratingBars = document.getElementById('ratingBars');
  const statNotesText = document.getElementById('statNotesText');

  // Modal elements
  const setupModal = document.getElementById('setupModal');
  const openSetupBtn = document.getElementById('openSetupBtn');
  const closeSetupModalBtn = document.getElementById('closeSetupModalBtn');
  const cancelSetupBtn = document.getElementById('cancelSetupBtn');
  const saveSetupBtn = document.getElementById('saveSetupBtn');
  const teamNameInput = document.getElementById('teamNameInput');
  const oppNameInput = document.getElementById('oppNameInput');
  const setupSideSwitch = document.getElementById('setupSideSwitch');

  // Touch Roster Setup Modal State & UI Elements (one roster per team)
  let modalRosters = { own: [], opponent: [] };
  let modalSide = 'own';
  let numpadBuffer = '';

  const setupSelectedCountBadge = document.getElementById('setupSelectedCountBadge');
  const setupSelectedChips = document.getElementById('setupSelectedChips');
  const presetRoster12Btn = document.getElementById('presetRoster12Btn');
  const presetRoster18Btn = document.getElementById('presetRoster18Btn');
  const presetClearBtn = document.getElementById('presetClearBtn');
  const setupNumberToggleGrid = document.getElementById('setupNumberToggleGrid');
  const numpadDisplay = document.getElementById('numpadDisplay');
  const numpadGrid = document.getElementById('numpadGrid');
  const numpadClearBtn = document.getElementById('numpadClearBtn');
  const numpadAddBtn = document.getElementById('numpadAddBtn');

  // Fun 3D trajectory viewer (separate rendering, does not affect the 2D court)
  const open3DBtn = document.getElementById('open3DBtn');
  const close3DModalBtn = document.getElementById('close3DModalBtn');
  const view3DModal = document.getElementById('view3DModal');
  let court3D = null;

  // Post-game report
  const openReportBtn = document.getElementById('openReportBtn');
  const reportOverlay = document.getElementById('reportOverlay');
  const closeReportBtn = document.getElementById('closeReportBtn');
  const printReportBtn = document.getElementById('printReportBtn');
  const downloadReportBtn = document.getElementById('downloadReportBtn');

  function currentRoster() {
    return state.rosters[state.receivingSide];
  }

  function receivingTeamName(side = state.receivingSide) {
    return side === 'own' ? state.teamName : state.opponentName;
  }

  function servingTeamName(side = state.receivingSide) {
    return side === 'own' ? state.opponentName : state.teamName;
  }

  // Passes of the team whose reception is currently being scouted
  function sidePasses() {
    return state.passes.filter(p => p.side === state.receivingSide);
  }

  function passerPasses(num = state.selectedPlayer) {
    return sidePasses().filter(p => String(p.passer_number) === String(num));
  }

  function sortNumbers(list) {
    return list.sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  }

  function renderSetupRosterUI() {
    const roster = sortNumbers(modalRosters[modalSide]);

    setupSideSwitch.querySelectorAll('.side-btn').forEach(btn => {
      const side = btn.getAttribute('data-side');
      btn.classList.toggle('active', side === modalSide);
      const name = side === 'own' ? teamNameInput.value.trim() : oppNameInput.value.trim();
      btn.textContent = name || (side === 'own' ? 'My Team' : 'Opponent');
    });

    if (setupSelectedCountBadge) {
      setupSelectedCountBadge.textContent = `${roster.length} Selected`;
    }

    if (setupSelectedChips) {
      setupSelectedChips.innerHTML = '';
      if (roster.length === 0) {
        setupSelectedChips.innerHTML = `<span style="font-size: 0.8rem; color: #64748b; font-style: italic;">No players selected. Tap numbers below to add.</span>`;
      } else {
        roster.forEach(num => {
          const chip = document.createElement('span');
          chip.className = 'setup-chip';
          chip.innerHTML = `#${num} <button type="button" class="setup-chip-remove" aria-label="Remove player ${num}">&times;</button>`;
          chip.querySelector('.setup-chip-remove').addEventListener('click', () => {
            modalRosters[modalSide] = modalRosters[modalSide].filter(p => p !== num);
            renderSetupRosterUI();
          });
          setupSelectedChips.appendChild(chip);
        });
      }
    }

    if (setupNumberToggleGrid) {
      setupNumberToggleGrid.innerHTML = '';
      for (let i = 1; i <= 24; i++) {
        const numStr = i.toString();
        const isSelected = roster.includes(numStr);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `jersey-toggle-btn ${isSelected ? 'selected' : ''}`;
        btn.textContent = numStr;
        btn.title = `Toggle player #${numStr}`;
        btn.addEventListener('click', () => {
          if (modalRosters[modalSide].includes(numStr)) {
            modalRosters[modalSide] = modalRosters[modalSide].filter(p => p !== numStr);
          } else {
            modalRosters[modalSide].push(numStr);
          }
          renderSetupRosterUI();
        });
        setupNumberToggleGrid.appendChild(btn);
      }
    }

    if (numpadDisplay) {
      numpadDisplay.textContent = numpadBuffer ? `Typed: #${numpadBuffer}` : 'Typed: --';
    }
  }

  function openModal() {
    modalRosters = {
      own: [...state.rosters.own],
      opponent: [...state.rosters.opponent]
    };
    modalSide = state.receivingSide;

    teamNameInput.value = state.teamName || '';
    oppNameInput.value = state.opponentName || '';
    numpadBuffer = '';

    renderSetupRosterUI();
    setupModal.classList.add('open');
  }

  function closeModal() {
    setupModal.classList.remove('open');
  }

  // Initialize Court Canvas
  const court = new VolleyballCourt('courtCanvas', {
    showZones: true,
    showHeat: true,
    flipped: false,
    onTrajectoryDraftChanged: (start, end) => handleDraftChanged(start, end)
  });

  // Load persisted state
  function init() {
    loadFromLocalStorage();

    applyCourtFlip();
    toggleHeatOverlay.checked = state.showHeat;
    court.setShowHeat(state.showHeat);
    renderMatchInfo();
    renderPlayerRoster();
    renderServeTypeButtons();
    updateCourtDisplay();
    updateStats();
    updateUndoState();
    attachEventListeners();
  }

  function refreshAll() {
    renderMatchInfo();
    renderPlayerRoster();
    updateCourtDisplay();
    updateStats();
    updateUndoState();
  }

  function startNewGame() {
    const confirmed = confirm(
      'Start a new game? This clears all recorded passes for the current match.\n\nExport CSV or download the report first if you want to keep this data.'
    );
    if (!confirmed) return;

    state.passes = [];
    state.draftStart = null;
    state.draftEnd = null;
    court.clearDraft();
    saveToLocalStorage();
    refreshAll();

    openModal();
  }

  function handleDraftChanged(start, end) {
    state.draftStart = start;
    state.draftEnd = end;

    if (!start) {
      courtHintText.textContent = '👉 Tap behind the baseline where the server stands';
      draftStatusIndicator.textContent = 'Waiting for trajectory...';
      draftStatusIndicator.className = 'draft-indicator';
      setRatingButtonsEnabled(false);
    } else if (!end) {
      courtHintText.textContent = '🎯 Tap where the passer played the ball';
      draftStatusIndicator.textContent = 'Start set. Tap contact point...';
      draftStatusIndicator.className = 'draft-indicator';
      setRatingButtonsEnabled(false);
    } else if (!state.selectedPlayer) {
      courtHintText.textContent = '⚠️ Add passers in the match setup (⚙️) first.';
      draftStatusIndicator.textContent = 'No passer selected';
      draftStatusIndicator.className = 'draft-indicator';
      setRatingButtonsEnabled(false);
    } else {
      const zone = PassAnalytics.zoneNumber(end.x, end.y);
      if (zone === null) {
        courtHintText.textContent = '⚠️ The pass contact must be on the receiving side of the net.';
        draftStatusIndicator.textContent = 'Tap again on the receiving side';
        draftStatusIndicator.className = 'draft-indicator';
        setRatingButtonsEnabled(false);
        return;
      }
      const where = PassAnalytics.isOutside(end.x, end.y) ? `outside the lines near zone ${zone}` : `zone ${zone}`;
      courtHintText.textContent = `✅ #${state.selectedPlayer} passed in ${where}. Rate the pass!`;
      draftStatusIndicator.textContent = `Ready: #${state.selectedPlayer}, zone ${zone}`;
      draftStatusIndicator.className = 'draft-indicator ready';
      setRatingButtonsEnabled(true);
    }
  }

  function setRatingButtonsEnabled(enabled) {
    ratingButtons.forEach(btn => { btn.disabled = !enabled; });
  }

  function recordPass(rating) {
    if (!state.draftStart || !state.draftEnd || !state.selectedPlayer) return;
    const zone = PassAnalytics.zoneNumber(state.draftEnd.x, state.draftEnd.y);
    if (zone === null) return;

    state.passes.push({
      id: 'pas_' + Date.now(),
      side: state.receivingSide,
      receiving_team: receivingTeamName(),
      serving_team: servingTeamName(),
      passer_number: state.selectedPlayer,
      serve_type: state.selectedServeType,
      rating: rating, // 0 = Error, 1 = Not good, 2 = Good, 3 = Perfect
      start_x: Number(state.draftStart.x.toFixed(2)),
      start_y: Number(state.draftStart.y.toFixed(2)),
      end_x: Number(state.draftEnd.x.toFixed(2)),
      end_y: Number(state.draftEnd.y.toFixed(2)),
      zone: zone,
      timestamp: new Date().toISOString()
    });
    saveToLocalStorage();

    court.clearDraft();
    courtHintText.textContent = `💾 Saved: #${state.selectedPlayer} – ${PassAnalytics.ratingInfo(rating).label}. Tap the next server position.`;

    updateCourtDisplay();
    updateStats();
    renderPlayerRoster();
    updateUndoState();
  }

  function getFilteredPasses() {
    return state.filterMode === 'player' ? passerPasses() : sidePasses();
  }

  function updateCourtDisplay() {
    const filtered = getFilteredPasses();
    court.zoneStats = PassAnalytics.byZone(filtered);
    court.options.showPasserLabels = state.filterMode === 'all';
    court.setTrajectories(filtered);

    if (court3D && view3DModal.classList.contains('open')) {
      court3D.setTrajectories(filtered);
    }
  }

  function open3DView() {
    if (!court3D) {
      court3D = new Court3DView('court3DCanvas');
    }
    view3DModal.classList.add('open');
    // Canvas was hidden (display:none) until now, so re-measure its size
    // now that the modal is actually laid out.
    court3D.initCanvasSize();
    court3D.setTrajectories(getFilteredPasses());
  }

  function close3DView() {
    view3DModal.classList.remove('open');
  }

  function updateStats() {
    const mine = passerPasses();
    const team = PassAnalytics.summarize(sidePasses());
    const s = PassAnalytics.summarize(mine);

    statsCardTitle.textContent = state.selectedPlayer ? `PASSER #${state.selectedPlayer} STATS` : 'PASSER STATS';
    statsConfidenceBadge.textContent = PassAnalytics.confidenceLabel(s.count);
    statsConfidenceBadge.className = s.count >= 3 ? 'badge active' : 'badge';

    statAvgVal.textContent = PassAnalytics.formatAvg(s.avg);
    statAvgVal.style.color = s.count ? PassAnalytics.heatColor(s.avg) : '';
    statPositiveVal.textContent = s.count ? `${s.positivePct}%` : '–';
    statTeamAvgVal.textContent = PassAnalytics.formatAvg(team.avg);

    ratingBars.innerHTML = '';
    [...PASS_RATINGS].reverse().forEach(r => {
      const n = s.counts[r.value];
      const pct = s.count ? Math.round((n / s.count) * 100) : 0;
      const row = document.createElement('div');
      row.className = 'prob-row';
      row.innerHTML = `
        <div class="prob-header">
          <span class="prob-name">${r.label}</span>
          <span class="prob-val">${n} · ${pct}%</span>
        </div>
        <div class="prob-track">
          <div class="prob-fill" style="width: ${pct}%; background: ${r.color};"></div>
        </div>`;
      ratingBars.appendChild(row);
    });

    if (!s.count) {
      statNotesText.textContent = state.selectedPlayer
        ? `No passes recorded yet for #${state.selectedPlayer}.`
        : 'Select a passer to start.';
    } else {
      const notes = PassAnalytics.notes(mine, team.avg);
      const vsType = PassAnalytics.summarize(mine.filter(p => p.serve_type === state.selectedServeType));
      if (vsType.count) {
        notes.push(`Vs ${state.selectedServeType}: avg ${PassAnalytics.formatAvg(vsType.avg)} on ${vsType.count} passes.`);
      }
      statNotesText.textContent = notes.length ? notes.join(' ') : 'No clear weakness yet - keep scouting.';
    }

    const count = mine.length;
    playerPassCountBadge.textContent = `${count} pass${count === 1 ? '' : 'es'}`;
  }

  function renderMatchInfo() {
    displayTeamName.textContent = state.teamName;
    displayOpponentName.textContent = state.opponentName;
    sideOwnBtn.textContent = state.teamName;
    sideOppBtn.textContent = state.opponentName;
    sideOwnBtn.classList.toggle('active', state.receivingSide === 'own');
    sideOppBtn.classList.toggle('active', state.receivingSide === 'opponent');
  }

  function renderPlayerRoster() {
    playerRosterGrid.innerHTML = '';
    currentRoster().forEach(num => {
      const btn = document.createElement('button');
      btn.className = `player-chip ${num === state.selectedPlayer ? 'active' : ''}`;

      const s = PassAnalytics.summarize(passerPasses(num));
      btn.innerHTML = `
        <span>#${num}</span>
        <span style="font-size: 0.65rem; opacity: 0.75; font-weight: 500;">${s.count ? `${s.count} · ${PassAnalytics.formatAvg(s.avg)}` : '0'}</span>
      `;

      btn.addEventListener('click', () => {
        state.selectedPlayer = num;
        renderPlayerRoster();
        updateCourtDisplay();
        updateStats();
        // Re-evaluate a finished drawing so the hint names the new passer
        handleDraftChanged(state.draftStart, state.draftEnd);
      });

      playerRosterGrid.appendChild(btn);
    });
  }

  function renderServeTypeButtons() {
    serveTypeGrid.querySelectorAll('.serve-type-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-type') === state.selectedServeType);
    });
  }

  function setReceivingSide(side) {
    if (side === state.receivingSide) return;
    state.receivingSide = side;
    const roster = currentRoster();
    if (!roster.includes(state.selectedPlayer)) {
      state.selectedPlayer = roster[0] || null;
    }
    court.clearDraft();
    saveToLocalStorage();
    refreshAll();
  }

  function updateUndoState() {
    undoBtn.disabled = sidePasses().length === 0;
  }

  function undoLastPass() {
    // Undo the most recent pass of the team currently shown
    for (let i = state.passes.length - 1; i >= 0; i--) {
      if (state.passes[i].side === state.receivingSide) {
        state.passes.splice(i, 1);
        break;
      }
    }
    saveToLocalStorage();
    updateCourtDisplay();
    updateStats();
    renderPlayerRoster();
    updateUndoState();
  }

  // CSV Export
  const CSV_HEADERS = [
    'id', 'receiving_side', 'receiving_team', 'serving_team', 'passer_number', 'serve_type',
    'rating', 'rating_label', 'start_x_m', 'start_y_m', 'end_x_m', 'end_y_m', 'zone', 'timestamp'
  ];

  function csvQuote(value) {
    return `"${String(value === undefined || value === null ? '' : value).replace(/"/g, '""')}"`;
  }

  function exportToCsv() {
    if (state.passes.length === 0) {
      alert('No passes recorded yet to export.');
      return;
    }

    const rows = state.passes.map(p => [
      p.id,
      p.side,
      csvQuote(p.receiving_team),
      csvQuote(p.serving_team),
      p.passer_number,
      csvQuote(p.serve_type),
      p.rating,
      csvQuote(PassAnalytics.ratingInfo(p.rating).label),
      p.start_x,
      p.start_y,
      p.end_x,
      p.end_y,
      p.zone,
      csvQuote(p.timestamp)
    ]);

    const csvContent = [CSV_HEADERS.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    const dateStr = new Date().toISOString().slice(0, 10);
    const safe = s => s.replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadFile(csvContent, `pass_scout_${safe(state.teamName)}_vs_${safe(state.opponentName)}_${dateStr}.csv`, 'text/csv;charset=utf-8;');
  }

  function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.setAttribute('download', filename);
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
    URL.revokeObjectURL(url);
  }

  // Splits one CSV line, honouring quoted fields that contain commas or "" escapes
  function parseCsvLine(line) {
    const cols = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cur += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        cols.push(cur.trim()); cur = '';
      } else {
        cur += ch;
      }
    }
    cols.push(cur.trim());
    return cols;
  }

  // CSV Import
  function importFromCsv(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const lines = evt.target.result.split(/\r?\n/).filter(l => l.trim().length > 0);
        if (lines.length < 2) return;

        const header = parseCsvLine(lines[0]);
        const idx = name => header.indexOf(name);
        if (idx('passer_number') === -1 || idx('rating') === -1) {
          alert('This CSV is not a Pass Scout export (missing passer_number / rating columns).');
          return;
        }

        const imported = [];
        for (let i = 1; i < lines.length; i++) {
          const c = parseCsvLine(lines[i]);
          const get = name => (idx(name) === -1 ? '' : c[idx(name)]);
          const rating = parseInt(get('rating'), 10);
          const endX = parseFloat(get('end_x_m'));
          const endY = parseFloat(get('end_y_m'));
          if (isNaN(rating) || rating < 0 || rating > 3 || isNaN(endX) || isNaN(endY)) continue;
          imported.push({
            id: get('id') || 'pas_' + Date.now() + '_' + i,
            side: get('receiving_side') === 'opponent' ? 'opponent' : 'own',
            receiving_team: get('receiving_team'),
            serving_team: get('serving_team'),
            passer_number: get('passer_number'),
            serve_type: get('serve_type'),
            rating,
            start_x: parseFloat(get('start_x_m')),
            start_y: parseFloat(get('start_y_m')),
            end_x: endX,
            end_y: endY,
            zone: parseInt(get('zone'), 10) || PassAnalytics.zoneNumber(endX, endY),
            timestamp: get('timestamp') || new Date().toISOString()
          });
        }

        if (imported.length === 0) {
          alert('No valid passes found in this CSV.');
          return;
        }
        if (state.passes.length > 0 && !confirm(`Replace the ${state.passes.length} passes currently recorded with ${imported.length} passes from the file?`)) {
          return;
        }

        state.passes = imported;
        // Restore team names and make every imported passer selectable
        const ownRow = imported.find(p => p.side === 'own');
        const oppRow = imported.find(p => p.side === 'opponent');
        if (ownRow) { state.teamName = ownRow.receiving_team || state.teamName; state.opponentName = ownRow.serving_team || state.opponentName; }
        else if (oppRow) { state.opponentName = oppRow.receiving_team || state.opponentName; state.teamName = oppRow.serving_team || state.teamName; }
        imported.forEach(p => {
          const roster = state.rosters[p.side];
          if (p.passer_number && !roster.includes(p.passer_number)) roster.push(p.passer_number);
        });
        sortNumbers(state.rosters.own);
        sortNumbers(state.rosters.opponent);
        if (!ownRow && oppRow) state.receivingSide = 'opponent';
        if (!currentRoster().includes(state.selectedPlayer)) state.selectedPlayer = currentRoster()[0] || null;

        saveToLocalStorage();
        refreshAll();
        alert(`Successfully imported ${imported.length} passes!`);
      } catch (err) {
        alert('Could not parse CSV file. Please verify format.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function toggleFilter() {
    state.filterMode = state.filterMode === 'player' ? 'all' : 'player';
    filterLabel.textContent = state.filterMode === 'all' ? 'All Passers' : 'Current Passer';
    updateCourtDisplay();
  }

  // Post-game report
  function reportData() {
    return {
      receivingTeam: receivingTeamName(),
      servingTeam: servingTeamName(),
      roster: currentRoster(),
      passes: sidePasses(),
      flipped: state.courtFlipped
    };
  }

  function openReport() {
    if (sidePasses().length === 0) {
      alert(`No passes recorded yet for ${receivingTeamName()}.`);
      return;
    }
    PassReport.render(document.getElementById('reportContent'), reportData());
    reportOverlay.classList.add('open');
    document.body.classList.add('report-open');
  }

  function closeReport() {
    reportOverlay.classList.remove('open');
    document.body.classList.remove('report-open');
  }

  function downloadReport() {
    const data = reportData();
    const html = PassReport.toStandaloneHtml(document.getElementById('reportContent'), data);
    const dateStr = new Date().toISOString().slice(0, 10);
    const safe = s => s.replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadFile(html, `reception_report_${safe(data.receivingTeam)}_vs_${safe(data.servingTeam)}_${dateStr}.html`, 'text/html;charset=utf-8;');
  }

  function saveToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        teamName: state.teamName,
        opponentName: state.opponentName,
        rosters: state.rosters,
        receivingSide: state.receivingSide,
        selectedPlayer: state.selectedPlayer,
        passes: state.passes,
        showHeat: state.showHeat,
        courtFlipped: state.courtFlipped
      }));
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
  }

  function loadFromLocalStorage() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (data) {
        const parsed = JSON.parse(data);
        if (parsed.teamName) state.teamName = parsed.teamName;
        if (parsed.opponentName) state.opponentName = parsed.opponentName;
        if (parsed.rosters) {
          if (Array.isArray(parsed.rosters.own)) state.rosters.own = parsed.rosters.own;
          if (Array.isArray(parsed.rosters.opponent)) state.rosters.opponent = parsed.rosters.opponent;
        }
        if (parsed.receivingSide === 'opponent') state.receivingSide = 'opponent';
        if (Array.isArray(parsed.passes)) state.passes = parsed.passes;
        if (parsed.selectedPlayer) state.selectedPlayer = parsed.selectedPlayer;
        state.showHeat = parsed.showHeat !== false;
        state.courtFlipped = parsed.courtFlipped === true;
      }
    } catch (e) {
      console.warn('LocalStorage error:', e);
    }
    if (!currentRoster().includes(state.selectedPlayer)) {
      state.selectedPlayer = currentRoster()[0] || null;
    }
  }

  function applyCourtFlip() {
    toggleFlipCourt.checked = state.courtFlipped;
    serveDirectionText.textContent = state.courtFlipped ? 'RECEPTION ⬅️ SERVE' : 'SERVE ➡️ RECEPTION';
    court.setFlipped(state.courtFlipped);
  }

  function attachEventListeners() {
    ratingButtons.forEach(btn => {
      btn.addEventListener('click', () => recordPass(parseInt(btn.getAttribute('data-rating'), 10)));
    });

    serveTypeGrid.querySelectorAll('.serve-type-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        state.selectedServeType = btn.getAttribute('data-type');
        renderServeTypeButtons();
        updateStats();
      });
    });

    sideSwitch.querySelectorAll('.side-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setReceivingSide(btn.getAttribute('data-side'));
      });
    });

    clearCurrentDraftBtn.addEventListener('click', () => court.clearDraft());
    undoBtn.addEventListener('click', () => undoLastPass());
    newGameBtn.addEventListener('click', () => startNewGame());
    filterBtn.addEventListener('click', () => toggleFilter());

    exportCsvBtn.addEventListener('click', () => exportToCsv());
    importCsvBtn.addEventListener('click', () => csvFileInput.click());
    csvFileInput.addEventListener('change', importFromCsv);

    toggleHeatOverlay.addEventListener('change', (e) => {
      state.showHeat = e.target.checked;
      court.setShowHeat(state.showHeat);
      saveToLocalStorage();
    });

    toggleZonesOverlay.addEventListener('change', (e) => {
      court.setShowZones(e.target.checked);
    });

    toggleFlipCourt.addEventListener('change', (e) => {
      state.courtFlipped = e.target.checked;
      applyCourtFlip();
      saveToLocalStorage();
    });

    // Report
    openReportBtn.addEventListener('click', () => openReport());
    closeReportBtn.addEventListener('click', () => closeReport());
    printReportBtn.addEventListener('click', () => window.print());
    downloadReportBtn.addEventListener('click', () => downloadReport());

    // Modal Events
    openSetupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openModal();
    });

    document.getElementById('matchDisplayPill').addEventListener('click', (e) => {
      e.stopPropagation();
      openModal();
    });

    closeSetupModalBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeModal();
    });

    cancelSetupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      closeModal();
    });

    setupModal.addEventListener('click', (e) => {
      if (e.target === setupModal) {
        closeModal();
      }
    });

    setupSideSwitch.querySelectorAll('.side-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        modalSide = btn.getAttribute('data-side');
        numpadBuffer = '';
        renderSetupRosterUI();
      });
    });

    // Keep the roster switch labels in sync with the typed team names
    teamNameInput.addEventListener('input', () => renderSetupRosterUI());
    oppNameInput.addEventListener('input', () => renderSetupRosterUI());

    // Fun 3D Trajectory Viewer
    open3DBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      open3DView();
    });

    close3DModalBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      close3DView();
    });

    view3DModal.addEventListener('click', (e) => {
      if (e.target === view3DModal) {
        close3DView();
      }
    });

    presetRoster12Btn.addEventListener('click', () => {
      modalRosters[modalSide] = Array.from({ length: 12 }, (_, i) => (i + 1).toString());
      renderSetupRosterUI();
    });

    presetRoster18Btn.addEventListener('click', () => {
      modalRosters[modalSide] = Array.from({ length: 18 }, (_, i) => (i + 1).toString());
      renderSetupRosterUI();
    });

    presetClearBtn.addEventListener('click', () => {
      modalRosters[modalSide] = [];
      renderSetupRosterUI();
    });

    numpadGrid.querySelectorAll('.numpad-btn[data-val]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (numpadBuffer.length < 2) {
          numpadBuffer += btn.getAttribute('data-val');
          renderSetupRosterUI();
        }
      });
    });

    numpadClearBtn.addEventListener('click', () => {
      numpadBuffer = numpadBuffer.slice(0, -1);
      renderSetupRosterUI();
    });

    numpadAddBtn.addEventListener('click', () => {
      const numVal = parseInt(numpadBuffer, 10);
      if (!isNaN(numVal) && numVal >= 0 && numVal <= 99) {
        const numStr = numVal.toString();
        if (!modalRosters[modalSide].includes(numStr)) {
          modalRosters[modalSide].push(numStr);
        }
        numpadBuffer = '';
        renderSetupRosterUI();
      }
    });

    saveSetupBtn.addEventListener('click', () => {
      const newTeam = teamNameInput.value.trim();
      const newOpp = oppNameInput.value.trim();

      if (newTeam) state.teamName = newTeam;
      if (newOpp) state.opponentName = newOpp;

      state.rosters = {
        own: [...modalRosters.own],
        opponent: [...modalRosters.opponent]
      };
      // Scout the team whose roster was edited last
      state.receivingSide = modalSide;
      if (!currentRoster().includes(state.selectedPlayer)) {
        state.selectedPlayer = currentRoster()[0] || null;
      }

      saveToLocalStorage();
      refreshAll();
      closeModal();
    });

    // Fullscreen Toggle
    toggleFullscreenBtn.addEventListener('click', () => {
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().catch(err => {
          console.warn('Fullscreen request failed:', err);
        });
      } else if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    });

    document.addEventListener('fullscreenchange', () => {
      toggleFullscreenBtn.innerHTML = document.fullscreenElement
        ? '<span class="btn-icon">🗗</span>'
        : '<span class="btn-icon">⛶</span>';
    });

    // PWA Install Prompt Handler
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      deferredPrompt = e;
      installAppBtn.style.display = 'inline-flex';
    });

    installAppBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        installAppBtn.style.display = 'none';
      }
      deferredPrompt = null;
    });

    window.addEventListener('appinstalled', () => {
      installAppBtn.style.display = 'none';
    });

    // Register Service Worker for offline PWA installation
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('./sw.js').catch(err => {
        console.warn('ServiceWorker registration error:', err);
      });
    }
  }

  // Initialize on DOM ready
  document.addEventListener('DOMContentLoaded', init);
})();
