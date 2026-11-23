(function () {
  var $ = function (id) { return document.getElementById(id); };
  var pax = [];         // parsed passenger statuses
  var names = [];       // typed or parsed passenger names
  var lockedFields = {}; // tracks fields auto-filled from PDF or 139 SMS
  var lockedPax = [];    // tracks passenger name indices auto-filled from PDF
  var smsCollapsed = false;
  var smsPromptCollapsed = false;

  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  function applyFieldLock(id, isLocked) {
    var el = $(id);
    if (!el) return;
    if (el.tagName === 'SELECT') el.disabled = !!isLocked;
    else el.readOnly = !!isLocked;
  }

  function resetFollowingFields(opts) {
    opts = opts || {};
    if (!opts.keepPnr) $('pnr').value = '';
    if (!opts.keepSms) {
      $('sms').value = '';
      var chip = $('parseChip');
      chip.textContent = 'Waiting for a message';
      chip.className = 'chip';
      smsPromptCollapsed = false;
      $('smsPromptToggleBar').hidden = true;
    }
    lockedFields = {};
    lockedPax = [];
    ['train', 'date', 'cls', 'bookedFrom', 'boardingAt', 'to', 'status', 'contact'].forEach(function (k) {
      $(k).value = '';
      applyFieldLock(k, false);
    });
    pax = [];
    names = [];
    $('berths').value = '1';
    applyFieldLock('berths', false);
    $('berthHint').textContent = 'Set automatically from the passengers in the ticket or reply.';
    buildNames(true);
    dcmOpen = false;
    $('dcmZone').value = '';
    fillDivs();
  }

  function setSmsCollapsed(collapsed, showBar) {
    smsCollapsed = collapsed;
    $('smsSection').hidden = collapsed;
    $('smsToggleBar').hidden = !showBar;
    $('toggleSmsBtn').textContent = collapsed ? 'Show 139 SMS section' : 'Hide 139 SMS section';
    $('toggleSmsBtn').setAttribute('aria-expanded', String(!collapsed));
  }

  function setSmsPromptCollapsed(collapsed, showBar) {
    smsPromptCollapsed = collapsed;
    $('smsPromptToggleBar').hidden = !showBar;
    $('toggleSmsPromptBtn').textContent = collapsed ? 'Show SMS prompt' : 'Hide SMS prompt';
    $('toggleSmsPromptBtn').setAttribute('aria-expanded', String(!collapsed));
    updateSms();
  }

  $('toggleSmsBtn').addEventListener('click', function () {
    setSmsCollapsed(!smsCollapsed, true);
  });

  $('toggleSmsPromptBtn').addEventListener('click', function () {
    setSmsPromptCollapsed(!smsPromptCollapsed, true);
  });

  // berth dropdown 1..6
  for (var i = 1; i <= 6; i++) { var o = document.createElement('option'); o.value = i; o.textContent = i; $('berths').appendChild(o); }

  function parse(t) {
    var o = {}, m;
    if ((m = t.match(/PNR\s*:?\s*(\d{10})/i))) o.pnr = m[1];
    if ((m = t.match(/Train\s*:\s*(\d{4,5})\s+([^\r\n]+)/i))) o.train = m[1] + ' - ' + m[2].trim();
    if ((m = t.match(/Journey\s*Dt\s*:\s*(\d{2}-\d{2}-\d{4})/i))) o.date = m[1];
    if ((m = t.match(/Booked\s*From\s*:?\s*([A-Za-z0-9]+)/i))) o.bookedFrom = m[1].toUpperCase();
    if ((m = t.match(/BoardingStn\s*:?\s*([A-Za-z0-9]+)/i))) o.boardingAt = m[1].toUpperCase();
    if ((m = t.match(/ReservedUpTo\s*:\s*([A-Za-z0-9]+)/i))) o.to = m[1].toUpperCase();
    if ((m = t.match(/CLASS\s*:\s*([A-Za-z0-9]+)/i))) o.cls = m[1].toUpperCase();
    var re = /P(\d+)\s*:\s*Booking Status\s*:\s*[^;\r\n]+;\s*Current Status\s*:\s*([^\r\n]+)/gi;
    o.pax = [];
    while ((m = re.exec(t))) o.pax.push(m[2].trim());
    return o;
  }

  function applyParse() {
    var typed = $('pnr').value.replace(/\D/g, '');
    // Clear PDF state and reset downstream fields whenever the 139 SMS text changes
    if ($('pdfFile').value || !$('pdfStatusRow').hidden) {
      $('pdfFile').value = '';
      $('pdfStatusRow').hidden = true;
      setSmsCollapsed(false, false);
    }
    resetFollowingFields({ keepPnr: true, keepSms: true });

    var rawSms = $('sms').value;
    var hasSms = !!rawSms.trim();
    var p = parse(rawSms);
    var found = 0, total = 7;
    var mismatch = typed.length === 10 && p.pnr && typed !== p.pnr;

    if (p.pnr) { $('pnr').value = p.pnr; found++; }
    ['train', 'date', 'bookedFrom', 'boardingAt', 'to', 'cls'].forEach(function (k) {
      if (p[k]) {
        $(k).value = p[k];
        lockedFields[k] = true;
        applyFieldLock(k, true);
        found++;
      }
    });
    if (p.pax.length) {
      found++;
      pax = p.pax;
      $('status').value = pax.join(', ');
      lockedFields.status = true;
      applyFieldLock('status', true);

      var n = Math.min(6, pax.length);
      $('berths').value = String(n);
      lockedFields.berths = true;
      applyFieldLock('berths', true);

      $('berthHint').textContent = 'Set from ' + pax.length + ' passenger' + (pax.length === 1 ? '' : 's') + ' in the message (P1' + (pax.length > 1 ? ' to P' + pax.length : '') + ').';
      buildNames(true);
    } else if (hasSms) {
      $('berthHint').textContent = 'No passengers found in the message, choose the number.';
      buildNames(true);
    }

    // Minimize "Send this SMS to 139 for live status:" once an SMS reply is pasted
    if (hasSms) {
      setSmsPromptCollapsed(true, true);
    } else {
      setSmsPromptCollapsed(false, false);
    }

    var chip = $('parseChip');
    if (!hasSms) { chip.textContent = 'Waiting for a message'; chip.className = 'chip'; }
    else if (mismatch) { chip.textContent = 'The PNR in this reply differs from the one you typed. Details were taken from the reply.'; chip.className = 'chip warn'; }
    else if (found >= total) { chip.textContent = 'All details read (' + pax.length + ' passenger' + (pax.length === 1 ? '' : 's') + ')'; chip.className = 'chip ok'; }
    else { chip.textContent = 'Read ' + Math.min(found, total) + ' of ' + total + ' details, fill the highlighted fields below'; chip.className = 'chip warn'; }
    render();
  }

  // ---- Ticket PDF parsing ----
  var MONTHS = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };

  function normDate(raw) {
    var m = raw.match(/(\d{1,2})[-\/\s]([A-Za-z]{3})[-\/\s](\d{4})/);
    if (m) {
      var mm = MONTHS[m[2].toLowerCase()];
      if (mm) return ('0' + m[1]).slice(-2) + '-' + mm + '-' + m[3];
    }
    m = raw.match(/(\d{2})[-\/](\d{2})[-\/](\d{4})/);
    return m ? m[1] + '-' + m[2] + '-' + m[3] : '';
  }

  // Extract stations using 2D X/Y layout geometry of IRCTC ERS PDFs:
  // Column 1 (left): Booked From | Column 2 (middle): Boarding At | Column 3 (right): To
  function extractStationsFromLayout(items, fallbackText) {
    var res = { bookedFrom: '', boardingAt: '', to: '' };
    var labels = {};
    var stationTokens = [];

    items.forEach(function (it) {
      var s = it.str.trim();
      if (!s) return;
      var x = it.transform[4], y = it.transform[5];
      if (/^Booked\s*From\b/i.test(s)) labels.bookedFrom = { x: x, y: y };
      else if (/^Boarding\s*At\b/i.test(s)) labels.boardingAt = { x: x, y: y };
      else if (/^To$/i.test(s) || /^To\s*:/i.test(s)) labels.to = { x: x, y: y };
      var m = s.match(/\(([A-Z0-9]{2,6})\)/i);
      if (m) stationTokens.push({ code: m[1].toUpperCase(), x: x, y: y, raw: s });
    });

    function pickBelow(lbl) {
      if (!lbl) return '';
      var candidates = stationTokens.filter(function (st) {
        var dy = lbl.y - st.y;
        var dx = Math.abs(st.x - lbl.x);
        return dy > 2 && dy < 75 && dx < 95;
      });
      if (!candidates.length) return '';
      candidates.sort(function (a, b) {
        var da = (lbl.y - a.y) + Math.abs(a.x - lbl.x) * 0.5;
        var db = (lbl.y - b.y) + Math.abs(b.x - lbl.x) * 0.5;
        return da - db;
      });
      return candidates[0].code;
    }

    res.bookedFrom = pickBelow(labels.bookedFrom);
    res.boardingAt = pickBelow(labels.boardingAt);
    res.to = pickBelow(labels.to);

    if (!res.bookedFrom || !res.boardingAt || !res.to) {
      var headerPart = fallbackText.split(/Passenger\s*Details|Current\s*Status/i)[0];
      var allCodes = [];
      var re = /([A-Z][A-Z\s\.]{2,})\(([A-Z0-9]{2,6})\)/gi, cm;
      while ((cm = re.exec(headerPart))) {
        var prefix = cm[1].trim().toUpperCase();
        var code = cm[2].toUpperCase();
        if (!/(?:FIRST|SECOND|THIRD|SLEEPER|CHAIR|EXECUTIVE|AC|GENERAL|TATKAL|LADIES|QUOTA|CLASS)/i.test(prefix)) {
          allCodes.push(code);
        }
      }
      if (allCodes.length >= 3) {
        if (!res.bookedFrom) res.bookedFrom = allCodes[0];
        if (!res.boardingAt) res.boardingAt = allCodes[1];
        if (!res.to) res.to = allCodes[2];
      } else if (allCodes.length === 2) {
        if (!res.bookedFrom) res.bookedFrom = allCodes[0];
        if (!res.boardingAt) res.boardingAt = allCodes[0];
        if (!res.to) res.to = allCodes[1];
      }
    }

    if (!res.bookedFrom && res.boardingAt) res.bookedFrom = res.boardingAt;
    if (!res.boardingAt && res.bookedFrom) res.boardingAt = res.bookedFrom;
    return res;
  }

  function extractClassFromLayout(items, fallbackText) {
    var classLbl = null;
    var classTokens = [];
    items.forEach(function (it) {
      var s = it.str.trim();
      if (!s) return;
      var x = it.transform[4], y = it.transform[5];
      if (/^Class\b/i.test(s)) classLbl = { x: x, y: y };
      var m = s.match(/\(([123A-Z]{2,4})\)/i);
      if (m && /^(?:1A|2A|3A|3E|SL|CC|EC|EA|FC|2S|EV|VS)$/i.test(m[1])) {
        classTokens.push({ code: m[1].toUpperCase(), x: x, y: y });
      }
    });

    if (classLbl && classTokens.length) {
      var below = classTokens.filter(function (ct) {
        var dy = classLbl.y - ct.y;
        var dx = Math.abs(ct.x - classLbl.x);
        return dy > 2 && dy < 85 && dx < 95;
      });
      if (below.length) {
        below.sort(function (a, b) {
          return ((classLbl.y - a.y) + Math.abs(a.x - classLbl.x) * 0.5) -
                 ((classLbl.y - b.y) + Math.abs(b.x - classLbl.x) * 0.5);
        });
        return below[0].code;
      }
    }

    // Fallback: search across newlines between Class and Booking Date / Quota / Passenger Details
    var classBlock = fallbackText.split(/\bClass\b/i)[1] || '';
    classBlock = classBlock.split(/Booking\s*Date|Quota|Passenger\s*Details/i)[0];
    var m = classBlock.match(/\((1A|2A|3A|3E|SL|CC|EC|EA|FC|2S|EV|VS)\)/i) ||
            fallbackText.match(/\b(?:FIRST\s*AC|SECOND\s*AC|THIRD\s*AC(?:\s*ECONOMY)?|SLEEPER|CHAIR\s*CAR|EXECUTIVE\s*CHAIR\s*CAR|SECOND\s*SITTING)[\s\r\n]*\(([A-Z0-9]{2,4})\)/i);
    return m ? m[1].toUpperCase() : '';
  }

  function parseTicketPdfData(pdfData) {
    var text = pdfData.text;
    var o = { names: [], statuses: [] }, m;

    if ((m = text.match(/\bPNR\b[\s:]*\r?\n?\s*(\d{10})\b/i)) || (m = text.match(/\b(\d{10})\b/))) {
      o.pnr = m[1];
    }

    if ((m = text.match(/Train\s*No\.?\s*\/?\s*Name[\s:]*\r?\n?\s*(\d{4,5})\s*[\/\-]\s*([^\r\n]+)/i)) ||
        (m = text.match(/\b(\d{5})\s*\/\s*([A-Z][A-Z0-9\s\-]{2,})/))) {
      var rawTrainName = m[2]
        .replace(/\s{2,}.*$/, '')
        .replace(/\s+(?:FIRST\s*AC|SECOND\s*AC|THIRD\s*AC(?:\s*ECONOMY)?|SLEEPER|CHAIR\s*CAR|EXECUTIVE\s*CHAIR\s*CAR|SECOND\s*SITTING)(?:\s*\([A-Z0-9]{2,4}\))?.*$/i, '')
        .replace(/\s*\((?:1A|2A|3A|3E|SL|CC|EC|EA|FC|2S|EV|VS)\).*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
      o.train = m[1] + ' - ' + rawTrainName;
    }

    if ((m = text.match(/(?:Start\s*Date\*?|Date\s*of\s*Journey|Journey\s*Date)[\s:]*\r?\n?\s*(\d{1,2}[-\/\s](?:[A-Za-z]{3}|\d{2})[-\/\s]\d{4})/i))) {
      o.date = normDate(m[1]);
    }

    var st = extractStationsFromLayout(pdfData.items, text);
    o.bookedFrom = st.bookedFrom;
    o.boardingAt = st.boardingAt;
    o.to = st.to;

    o.cls = extractClassFromLayout(pdfData.items, text);

    var paxSec = text.split(/Passenger\s*Details/i)[1] || text;
    paxSec = paxSec.split(/Acronyms:|Transaction\s*ID:|Payment\s*Details/i)[0] || paxSec;
    var lines = paxSec.split(/\r?\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      // Supports both standard lines ("1. BASANT 27 M CNF/...") and pipe-delimited table lines ("1. | BASANT | 27 | M | CNF/...")
      var pm = line.match(/^([1-6])\.\s*(?:\|\s*)?([A-Z][A-Z\s\.]{1,40}?)(?:\s*(?:\|\s*)?\d{1,3}\s*(?:\|\s*)?[MFTO]\b(.*))?$/i);
      if (pm) {
        var idx = parseInt(pm[1], 10) - 1;
        var cleanName = pm[2].replace(/\|/g, ' ').replace(/\s+/g, ' ').trim();
        o.names[idx] = cleanName;
        if (pm[3]) {
          var cols = pm[3].split('|').map(function (c) { return c.trim(); }).filter(Boolean);
          var statusPart = cols.length ? cols[cols.length - 1] : pm[3].trim();
          var stCode = statusPart.split(/\s+/)[0];
          if (stCode && /[A-Z0-9\/]/i.test(stCode)) o.statuses[idx] = stCode.toUpperCase();
        }
      }
    }
    o.names = o.names.filter(Boolean);
    o.statuses = o.statuses.filter(Boolean);
    return o;
  }

  async function extractPdfData(file) {
    if (!window.pdfjsLib) throw new Error('PDF reader library could not load. Check your internet connection or paste the 139 SMS instead.');
    var buf = await file.arrayBuffer();
    var head = new Uint8Array(buf.slice(0, 5));
    if (head.length < 5 || head[0] !== 0x25 || head[1] !== 0x50 || head[2] !== 0x44 || head[3] !== 0x46 || head[4] !== 0x2D) {
      throw new Error('Invalid PDF file. Please upload a valid ticket PDF.');
    }
    var pdf;
    try {
      pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    } catch (e) {
      throw new Error('Invalid or corrupted PDF file. Please upload a valid ticket PDF.');
    }
    var pagesText = [];
    var page1Items = [];
    var maxPages = Math.min(pdf.numPages, 2);
    for (var p = 1; p <= maxPages; p++) {
      var page = await pdf.getPage(p);
      var content = await page.getTextContent();
      var items = content.items.slice().sort(function (a, b) {
        var dy = Math.abs(b.transform[5] - a.transform[5]);
        if (dy > 4) return b.transform[5] - a.transform[5];
        return a.transform[4] - b.transform[4];
      });
      if (p === 1) page1Items = items;
      var out = [], lastY = null;
      items.forEach(function (it) {
        var y = it.transform[5];
        if (lastY !== null && Math.abs(y - lastY) > 4) out.push('\n');
        else if (out.length && out[out.length - 1] !== '\n') out.push(' ');
        out.push(it.str);
        lastY = y;
      });
      pagesText.push(out.join(''));
    }
    return { text: pagesText.join('\n'), items: page1Items };
  }

  $('pdfFile').addEventListener('change', async function () {
    resetFollowingFields();

    var file = this.files && this.files[0];
    if (!file) {
      $('pdfStatusRow').hidden = true;
      setSmsCollapsed(false, false);
      render();
      return;
    }
    var row = $('pdfStatusRow'), chip = $('pdfChip');
    row.hidden = false;
    chip.textContent = 'Reading ' + file.name + '…';
    chip.className = 'chip';

    if (!/\.pdf$/i.test(file.name) && file.type && file.type !== 'application/pdf') {
      chip.textContent = 'Invalid file type. Please choose a PDF (.pdf) ticket file.';
      chip.className = 'chip bad';
      setSmsCollapsed(false, false);
      render();
      return;
    }

    try {
      var pdfData = await extractPdfData(file);
      var d = parseTicketPdfData(pdfData);
      var filled = 0;
      if (d.pnr) { $('pnr').value = d.pnr; filled++; }
      ['train', 'date', 'bookedFrom', 'boardingAt', 'to', 'cls'].forEach(function (k) {
        if (d[k]) {
          $(k).value = d[k];
          lockedFields[k] = true;
          applyFieldLock(k, true);
          filled++;
        }
      });
      if (d.statuses.length) {
        pax = d.statuses;
        $('status').value = d.statuses.join(', ');
        lockedFields.status = true;
        applyFieldLock('status', true);
        filled++;
      }
      if (d.names.length) {
        names = d.names.slice();
        lockedPax = d.names.map(function (nm) { return !!nm; });
        var n = Math.min(6, d.names.length);
        $('berths').value = String(n);
        lockedFields.berths = true;
        applyFieldLock('berths', true);
        $('berthHint').textContent = 'Set from ' + d.names.length + ' passenger' + (d.names.length === 1 ? '' : 's') + ' in the ticket PDF.';
        buildNames(true);
        filled++;
      }
      if (filled >= 3 && (d.pnr || d.train || d.names.length)) {
        chip.textContent = 'Ticket read (' + (d.names.length || 0) + ' passenger' + (d.names.length === 1 ? '' : 's') + ') — fill highlighted fields below';
        chip.className = 'chip ok';
        setSmsCollapsed(true, true);
      } else if (filled > 0) {
        chip.textContent = 'Partially read from PDF — fill highlighted fields or expand 139 SMS section';
        chip.className = 'chip warn';
        setSmsCollapsed(true, true);
      } else {
        chip.textContent = 'Invalid or unreadable ticket PDF (no booking details found).';
        chip.className = 'chip bad';
        setSmsCollapsed(false, false);
      }
      render();
    } catch (err) {
      chip.textContent = err && err.message ? err.message : 'Invalid PDF file. Could not read ticket details.';
      chip.className = 'chip bad';
      setSmsCollapsed(false, false);
      render();
    }
  });

  $('clearPdf').addEventListener('click', function () {
    $('pdfFile').value = '';
    $('pdfStatusRow').hidden = true;
    setSmsCollapsed(false, false);
    resetFollowingFields();
    render();
  });

  function buildNames(useStoredNames) {
    var n = parseInt($('berths').value, 10) || 1;
    var box = $('pax');
    if (!useStoredNames) {
      var cur = box.querySelectorAll('.pname');
      for (var i = 0; i < cur.length; i++) names[i] = cur[i].value;
    }
    box.innerHTML = '';
    for (var j = 0; j < n; j++) {
      var row = document.createElement('div'); row.className = 'row';
      var f = document.createElement('div'); f.className = 'field';
      var l = document.createElement('label'); l.htmlFor = 'pn' + j; l.textContent = 'Passenger ' + (j + 1) + ' name';
      var inp = document.createElement('input'); inp.id = 'pn' + j; inp.className = 'pname'; inp.autocomplete = 'off';
      inp.value = names[j] || '';
      if (lockedPax[j]) inp.readOnly = true;
      inp.addEventListener('input', render);
      f.appendChild(l); f.appendChild(inp); row.appendChild(f);
      if (pax[j]) { var tg = document.createElement('span'); tg.className = 'tag'; tg.textContent = pax[j]; row.appendChild(tg); }
      box.appendChild(row);
    }
  }

  function contactValue() {
    var d = $('contact').value.replace(/\D/g, '');
    if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2);
    if (d.length === 11 && d.charAt(0) === '0') d = d.slice(1);
    return /^\d{10}$/.test(d) ? d : '';
  }

  function updateFieldHighlights() {
    var bookedFromVal = $('bookedFrom').value.trim();
    var boardingAtVal = $('boardingAt').value.trim();
    var omitBookedFrom = !bookedFromVal && !!boardingAtVal;

    var requiredIds = ['train', 'date', 'cls', 'boardingAt', 'to', 'status', 'contact'];
    requiredIds.forEach(function (id) {
      var el = $(id);
      var fieldWrap = el.closest('.field');
      if (!fieldWrap) return;
      var empty = id === 'contact' ? !contactValue() : !el.value.trim();
      fieldWrap.classList.toggle('needs-fill', empty);
    });

    // Booked From is only highlighted if Boarding At is also empty
    var bfWrap = $('bookedFrom').closest('.field');
    if (bfWrap) {
      bfWrap.classList.toggle('needs-fill', !bookedFromVal && !omitBookedFrom);
    }

    // Highlight empty passenger name inputs
    var pn = document.querySelectorAll('.pname');
    for (var i = 0; i < pn.length; i++) {
      var pWrap = pn[i].closest('.field');
      if (pWrap) pWrap.classList.toggle('needs-fill', !pn[i].value.trim());
    }
  }

  function build() {
    var v = function (id, label) { var s = $(id).value.trim(); return s || '⟦' + label + '⟧'; };
    var n = parseInt($('berths').value, 10) || 1;
    var bookedFromVal = $('bookedFrom').value.trim();
    var boardingAtVal = $('boardingAt').value.trim();
    var lines = [];
    lines.push('Respected Sir/Ma\'am,', '');
    lines.push('I would be grateful for your kind assistance in confirming the following Emergency Quota (EQ) request:', '');
    lines.push('*EQ details:*', '');
    lines.push('PNR: ' + v('pnr', 'PNR'));
    lines.push('Train No./Name: ' + v('train', 'Train'));
    lines.push('Date of Journey: ' + v('date', 'Date'));
    lines.push('Class: ' + v('cls', 'Class'));
    if (bookedFromVal || !boardingAtVal) {
      lines.push('Booked From: ' + (bookedFromVal || '⟦Booked From⟧'));
    }
    lines.push('Boarding At: ' + (boardingAtVal || '⟦Boarding At⟧'));
    lines.push('To: ' + v('to', 'To'), '');
    lines.push('Berth required: ' + n);
    lines.push('Passenger Details:');
    var pn = document.querySelectorAll('.pname');
    for (var i = 0; i < n; i++) {
      var nm = pn[i] ? pn[i].value.trim() : '';
      lines.push((i + 1) + '. ' + (nm || '⟦Passenger ' + (i + 1) + ' name⟧'));
    }
    var c = contactValue();
    lines.push('Contact No.: ' + (c || '⟦Contact number⟧'));
    lines.push('Current Status: ' + v('status', 'Current status'), '');
    lines.push('Thank you for your valuable time and kind support.', '');
    lines.push('Reference by:');
    var rn = $('refName').value;
    if (rn === '__other__') rn = $('refOther').value.trim();
    lines.push('Name: ' + (rn || '⟦Your name⟧'));
    var b = $('batch').value;
    lines.push('Service: IRMS (Traffic) ' + (b || '⟦Batch⟧') + ' Batch');
    var pa = $('postedAs').value.trim();
    if (pa) {
      lines.push('Posted as: ' + pa);
    }
    return lines.join('\n');
  }

  function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  var isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  function updateSms() {
    var d = $('pnr').value.replace(/\D/g, '');
    var ok = d.length === 10;
    $('smsbox').hidden = !ok || smsPromptCollapsed;
    if (ok) {
      var body = 'PNR ' + d;
      $('smsText').textContent = body;
      $('smsLink').href = 'sms:139' + (isIOS ? '&' : '?') + 'body=' + encodeURIComponent(body);
    }
  }

  function render() {
    updateSms();
    updateFieldHighlights();
    var txt = build();
    var missing = (txt.match(/⟦/g) || []).length;
    $('bubble').innerHTML = esc(txt).replace(/⟦(.*?)⟧/g, '<mark class="missing">$1</mark>');
    var chip = $('readyChip');
    if (missing) { chip.textContent = missing + ' detail' + (missing === 1 ? '' : 's') + ' left'; chip.className = 'chip warn'; }
    else { chip.textContent = 'Ready to send'; chip.className = 'chip ok'; }
    $('copy').disabled = !!missing;
    var wa = $('wa');
    wa.setAttribute('aria-disabled', missing ? 'true' : 'false');
    wa.href = missing ? '#' : 'https://wa.me/?text=' + encodeURIComponent(txt);
    renderDcm(txt, !!missing);
    var ch = $('contact').value.trim();
    $('contactHint').hidden = !ch || !!contactValue();
    $('fallback').style.display = 'none';
    try { localStorage.setItem('eq-ref', JSON.stringify({ n: $('refName').value, o: $('refOther').value, b: $('batch').value, p: $('postedAs').value })); } catch (e) {}
  }

  $('wa').addEventListener('click', function (e) { if (this.getAttribute('aria-disabled') === 'true') e.preventDefault(); });

  $('copy').addEventListener('click', function () {
    var txt = build();
    var btn = this;
    function done() { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy message'; }, 2000); }
    function fallback() {
      var fb = $('fallback'); fb.value = txt; fb.style.display = 'block'; fb.focus(); fb.select();
      btn.textContent = 'Select and copy below'; setTimeout(function () { btn.textContent = 'Copy message'; }, 3000);
    }
    try {
      navigator.clipboard.writeText(txt).then(done, fallback);
    } catch (e) { fallback(); }
  });

  $('clearSms').addEventListener('click', function () {
    $('pdfFile').value = '';
    $('pdfStatusRow').hidden = true;
    setSmsCollapsed(false, false);
    resetFollowingFields();
    render();
    $('sms').focus();
  });

  $('pnr').addEventListener('input', function () {
    if ($('pdfFile').value || !$('pdfStatusRow').hidden) {
      $('pdfFile').value = '';
      $('pdfStatusRow').hidden = true;
      setSmsCollapsed(false, false);
    }
    resetFollowingFields({ keepPnr: true });
    render();
  });

  $('sms').addEventListener('input', applyParse);
  $('berths').addEventListener('change', function () {
    if (lockedFields.berths) return;
    $('berthHint').textContent = 'Changed manually.';
    buildNames();
    render();
  });
  ['train', 'date', 'cls', 'bookedFrom', 'boardingAt', 'to', 'status', 'contact', 'refName', 'refOther', 'batch', 'postedAs'].forEach(function (k) {
    $(k).addEventListener('input', render);
    $(k).addEventListener('change', render);
  });
  ['cls', 'bookedFrom', 'boardingAt', 'to'].forEach(function (k) {
    $(k).addEventListener('blur', function () {
      if (!$(k).readOnly) $(k).value = $(k).value.trim().toUpperCase();
      render();
    });
  });

  // remembered name and batch
  var savedRef = null;
  try { savedRef = JSON.parse(localStorage.getItem('eq-ref') || 'null'); } catch (e) {}

  var SAMPLE = [
    'PNR 6712695607',
    'Train : 22405 ANVT GARIB RATH',
    'Journey Dt : 21-11-2026 19:06',
    'BoardingStn : ARA',
    'ReservedUpTo : ANVT',
    'CLASS : 3A',
    'P1 : Booking Status : WL/521/GN ; Current Status : WL/192',
    'P2 : Booking Status : WL/522/GN ; Current Status : WL/193',
    'P3 : Booking Status : WL/523/GN ; Current Status : WL/194',
    'ChartStatus : Chart Not Prepared'
  ].join('\n');
  $('sample').addEventListener('click', function () { $('sms').value = SAMPLE; applyParse(); });

  // ---- Verify view ----
  var roster = [];

  function norm(s) {
    return s.toLowerCase().replace(/\b(shri|smt|sh|mr|mrs|ms|miss|dr|km|kumari)\b/g, ' ').replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function toks(s) { return norm(s).split(' ').filter(Boolean); }

  function parseRoster(text) {
    var out = [], cur = '';
    text.split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line || line.charAt(0) === '#') return;
      var cells = line.split(/\t|,|;|\|/).map(function (c) { return c.replace(/^["'\s]+|["'\s]+$/g, ''); }).filter(Boolean);
      var batch = '', names = [];
      cells.forEach(function (c) {
        var m = c.match(/\b(2022|2023|2024|2025)\b/);
        if (m) {
          batch = m[1];
          var rest = c.replace(m[0], ' ').replace(/[()\[\]:\-–]/g, ' ').replace(/\b(batch|officers?|irms|traffic)\b/gi, ' ').replace(/\s+/g, ' ').trim();
          if (/[a-z]{2}/i.test(rest)) names.push(rest);
          return;
        }
        if (/[a-z]{2}/i.test(c) && !/^(batch|name|officers?|list|sr\.?\s*no\.?|s\.?\s*no\.?|sl\.?\s*no\.?)$/i.test(c)) names.push(c);
      });
      if (!names.length) { if (batch) cur = batch; return; }
      var nm = names[0].replace(/^\d+[\.\)]\s*/, '').trim();
      if (!nm) return;
      out.push({ name: nm, norm: norm(nm), batch: batch || cur });
    });
    return out;
  }

  function covers(a, b) {
    return a.every(function (x) {
      return b.some(function (y) { return x === y || (x.length === 1 && y.charAt(0) === x) || (y.length === 1 && x.charAt(0) === y); });
    });
  }
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) d[i] = [i];
    for (j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
    return d[m][n];
  }
  function matchName(n) {
    var nn = norm(n), t = toks(n), exact = [], close = [];
    roster.forEach(function (r) {
      var rt = r.norm.split(' ');
      if (r.norm === nn || rt.slice().sort().join(' ') === t.slice().sort().join(' ')) exact.push(r);
      else if ((t.length >= 2 && rt.length >= 2 && (covers(t, rt) || covers(rt, t))) || (nn.length >= 8 && lev(nn, r.norm) <= 2)) close.push(r);
    });
    return { exact: exact, close: close };
  }

  function parseReq(t) {
    var g = function (re) { var m = t.match(re); return m ? m[1].trim() : ''; };
    return {
      name: g(/Reference by:\s*\r?\n\s*Name:\s*([^\r\n]+)/i) || g(/(?:^|\n)\s*Name:\s*([^\r\n]+)/i),
      batch: g(/IRMS\s*\(Traffic\)\s*(\d{4})/i),
      purpose: g(/Purpose:\s*([^\r\n]+)/i),
      pnr: g(/PNR:\s*(\d{10})/i),
      train: g(/Train No\.\/Name:\s*([^\r\n]+)/i),
      date: g(/Date of Journey:\s*([^\r\n]+)/i),
      contact: g(/Contact No\.:\s*([^\r\n]+)/i)
    };
  }

  function verify() {
    var t = $('reqText').value, box = $('verdict'), det = $('details');
    if (!t.trim()) { box.className = 'verdict'; box.textContent = 'Paste a request to check it.'; det.innerHTML = ''; return; }
    var q = parseReq(t);
    var rows = [['Reference name', q.name], ['Batch in request', q.batch], ['Purpose', q.purpose], ['PNR', q.pnr], ['Train', q.train], ['Date of journey', q.date], ['Contact', q.contact]];
    det.innerHTML = rows.map(function (r) {
      return '<dt>' + r[0] + '</dt><dd>' + (r[1] ? esc(r[1]) : '<span class="muted">not found</span>') + '</dd>';
    }).join('');
    var cls = 'verdict', msg = '';
    if (!roster.length) { msg = 'The officer list has not been added yet, so this request cannot be checked.'; }
    else if (!q.name) { cls += ' v-warn'; msg = 'Could not read the reference name. Paste the complete request.'; }
    else {
      var m = matchName(q.name);
      var same = m.exact.filter(function (r) { return r.batch === q.batch; });
      if (same.length) {
        cls += ' v-ok';
        msg = '<strong>Verified.</strong> ' + esc(same[0].name) + ' (' + esc(same[0].batch) + ' batch) is on the list and the batch matches.<span class="sub">A matching name shows the name is real, not who sent the message. Compare the sender\'s number with the officer\'s own number.</span>';
      } else if (m.exact.length) {
        cls += ' v-warn';
        msg = '<strong>Check the batch.</strong> ' + esc(m.exact[0].name) + ' is on the list under ' + esc(m.exact[0].batch || 'no batch') + ', but the request says ' + esc(q.batch || 'no batch') + '.';
      } else if (m.close.length) {
        cls += ' v-warn';
        msg = '<strong>No exact match.</strong> Similar names on the list:<ul>' + m.close.slice(0, 5).map(function (r) { return '<li>' + esc(r.name) + ' (' + esc(r.batch || 'no batch') + ')</li>'; }).join('') + '</ul>';
      } else {
        cls += ' v-bad';
        msg = '<strong>Not found.</strong> No officer named ' + esc(q.name) + ' is on the list.';
      }
    }
    box.className = cls; box.innerHTML = msg;
  }

  function setRoster(text) {
    roster = parseRoster(text);
    var u = text.match(/^#\s*updated:?\s*([^\r\n]+)/im);
    $('rosterInfo').textContent = roster.length ? 'Checked against the IRMS (Traffic) officer list' + (u ? ', updated ' + u[1].trim() : '') + '.' : '';
    verify();
  }


  // ---- Pure JS XLSX (.xlsx is a ZIP with xl/sharedStrings.xml & xl/worksheets/sheetN.xml) reader ----
  function parseXlsxRosterAndDcm(arrayBuffer, callback) {
    try {
      var bytes = new Uint8Array(arrayBuffer);
      var entries = unzipSync(bytes);
      if (!entries["xl/workbook.xml"]) throw new Error("Missing workbook.xml");

      var parser = new DOMParser();
      var wbDoc = parser.parseFromString(entries["xl/workbook.xml"], "application/xml");
      var relsDoc = entries["xl/_rels/workbook.xml.rels"]
        ? parser.parseFromString(entries["xl/_rels/workbook.xml.rels"], "application/xml")
        : null;

      var relMap = {};
      if (relsDoc) {
        var relNodes = relsDoc.getElementsByTagName("Relationship");
        for (var r = 0; r < relNodes.length; r++) {
          var rid = relNodes[r].getAttribute("Id");
          var target = relNodes[r].getAttribute("Target") || "";
          target = target.replace(/^\/?xl\//, "xl/");
          if (rid) relMap[rid] = target;
        }
      }

      var sharedStrings = [];
      if (entries["xl/sharedStrings.xml"]) {
        var ssDoc = parser.parseFromString(entries["xl/sharedStrings.xml"], "application/xml");
        var siNodes = ssDoc.getElementsByTagName("si");
        for (var s = 0; s < siNodes.length; s++) {
          var tNodes = siNodes[s].getElementsByTagName("t");
          var strVal = "";
          for (var tn = 0; tn < tNodes.length; tn++) {
            strVal += tNodes[tn].textContent || "";
          }
          sharedStrings.push(strVal);
        }
      }

      function colToIdx(ref) {
        var m = String(ref || "").match(/^([A-Z]+)/i);
        if (!m) return -1;
        var letters = m[1].toUpperCase();
        var n = 0;
        for (var i = 0; i < letters.length; i++) {
          n = n * 26 + (letters.charCodeAt(i) - 64);
        }
        return n - 1;
      }

      function readSheetRows(sheetPath) {
        var xmlText = entries[sheetPath];
        if (!xmlText) return [];
        var sDoc = parser.parseFromString(xmlText, "application/xml");
        var rowNodes = sDoc.getElementsByTagName("row");
        var outRows = [];
        for (var rn = 0; rn < rowNodes.length; rn++) {
          var cNodes = rowNodes[rn].getElementsByTagName("c");
          var rowVals = {};
          var maxCol = -1;
          for (var cn = 0; cn < cNodes.length; cn++) {
            var cEl = cNodes[cn];
            var idx = colToIdx(cEl.getAttribute("r"));
            if (idx < 0) continue;
            if (idx > maxCol) maxCol = idx;
            var tAttr = cEl.getAttribute("t");
            var val = "";
            if (tAttr === "inlineStr") {
              var isEl = cEl.getElementsByTagName("is")[0];
              if (isEl) {
                var tEls = isEl.getElementsByTagName("t");
                for (var k = 0; k < tEls.length; k++) val += tEls[k].textContent || "";
              }
            } else {
              var vEl = cEl.getElementsByTagName("v")[0];
              var rawV = vEl ? (vEl.textContent || "") : "";
              if (tAttr === "s") {
                var sIdx = parseInt(rawV, 10);
                val = (!isNaN(sIdx) && sharedStrings[sIdx] != null) ? sharedStrings[sIdx] : "";
              } else if (tAttr === "str") {
                val = rawV;
              } else {
                val = rawV;
              }
            }
            rowVals[idx] = String(val).trim();
          }
          var arr = [];
          for (var k2 = 0; k2 <= maxCol; k2++) {
            arr.push(rowVals[k2] || "");
          }
          outRows.push(arr);
        }
        return outRows;
      }

      var sheetEls = wbDoc.getElementsByTagName("sheet");
      var officersFromXlsx = [];
      var dcmFromXlsx = [];

      for (var sh = 0; sh < sheetEls.length; sh++) {
        var sName = (sheetEls[sh].getAttribute("name") || "").trim();
        var rId = sheetEls[sh].getAttribute("r:id") || sheetEls[sh].getAttribute("id") || "";
        var path = relMap[rId] || ("xl/worksheets/sheet" + (sh + 1) + ".xml");
        var rows = readSheetRows(path);

        if (/IRTS_Officers/i.test(sName)) {
          for (var i = 0; i < rows.length; i++) {
            var r0 = rows[i];
            var sno = (r0[0] || "").trim();
            var nm = (r0[1] || "").trim();
            var bt = (r0[2] || "").trim();
            if (/^\d+$/.test(sno) && nm && /^(2022|2023|2024|2025)$/.test(bt)) {
              officersFromXlsx.push({ name: nm, norm: norm(nm), batch: bt });
            }
          }
        } else if (/Sr_DCM_Contacts/i.test(sName)) {
          for (var j = 0; j < rows.length; j++) {
            var d0 = rows[j];
            var dsno = (d0[0] || "").trim();
            var z = (d0[1] || "").trim();
            var dv = (d0[2] || "").trim();
            var lb = (d0[3] || "").trim();
            var rawNum = (d0[4] || "").replace(/\D/g, "");
            if (rawNum.length === 11 && rawNum.charAt(0) === "0") rawNum = rawNum.slice(1);
            if (/^\d+$/.test(dsno) && z && dv) {
              dcmFromXlsx.push({
                zone: z,
                div: dv,
                name: lb,
                num: /^\d{10}$/.test(rawNum) ? rawNum : ""
              });
            }
          }
        }
      }

      callback(null, { officers: officersFromXlsx, dcm: dcmFromXlsx });
    } catch (err) {
      callback(err, null);
    }
  }

  // Minimal stored/deflate ZIP extractor for reading .xlsx in-browser without external libraries
  function unzipSync(buf) {
    var view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    var eocdOffset = -1;
    for (var i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
      if (view.getUint32(i, true) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }
    if (eocdOffset < 0) throw new Error("Not a valid ZIP/XLSX archive");
    var cdEntries = view.getUint16(eocdOffset + 10, true);
    var cdOffset = view.getUint32(eocdOffset + 16, true);
    var pos = cdOffset;
    var decoder = new TextDecoder("utf-8");
    var result = {};

    for (var idx = 0; idx < cdEntries; idx++) {
      if (view.getUint32(pos, true) !== 0x02014b50) break;
      var method = view.getUint16(pos + 10, true);
      var compSize = view.getUint32(pos + 20, true);
      var nameLen = view.getUint16(pos + 28, true);
      var extraLen = view.getUint16(pos + 30, true);
      var commentLen = view.getUint16(pos + 32, true);
      var localHeaderOffset = view.getUint32(pos + 42, true);
      var nameBytes = buf.subarray(pos + 46, pos + 46 + nameLen);
      var fileName = decoder.decode(nameBytes);

      var lNameLen = view.getUint16(localHeaderOffset + 26, true);
      var lExtraLen = view.getUint16(localHeaderOffset + 28, true);
      var dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
      var compData = buf.subarray(dataStart, dataStart + compSize);

      if (method === 0) {
        result[fileName] = decoder.decode(compData);
      } else if (method === 8) {
        var rawBytes = inflateRaw(compData);
        result[fileName] = decoder.decode(rawBytes);
      }
      pos += 46 + nameLen + extraLen + commentLen;
    }
    return result;
  }

  // RFC 1951 Deflate inflater (uncompressed blocks, fixed Huffman, dynamic Huffman)
  function inflateRaw(data) {
    var bitPos = 0;
    var totalBits = data.length * 8;
    function readBits(n) {
      var val = 0;
      for (var b = 0; b < n; b++) {
        if (bitPos >= totalBits) return 0;
        var byteIdx = bitPos >> 3;
        var bitIdx = bitPos & 7;
        if ((data[byteIdx] >> bitIdx) & 1) val |= (1 << b);
        bitPos++;
      }
      return val;
    }

    function buildHuff(lengths) {
      var maxLen = 0;
      for (var i = 0; i < lengths.length; i++) if (lengths[i] > maxLen) maxLen = lengths[i];
      var counts = new Int32Array(maxLen + 1);
      for (i = 0; i < lengths.length; i++) if (lengths[i] > 0) counts[lengths[i]]++;
      var nextCode = new Int32Array(maxLen + 1);
      var code = 0;
      for (var bits = 1; bits <= maxLen; bits++) {
        code = (code + counts[bits - 1]) << 1;
        nextCode[bits] = code;
      }
      var table = {};
      for (var sym = 0; sym < lengths.length; sym++) {
        var len = lengths[sym];
        if (len > 0) {
          var c = nextCode[len]++;
          var rev = 0;
          for (var k = 0; k < len; k++) {
            rev = (rev << 1) | ((c >> k) & 1);
          }
          table[(len << 16) | rev] = sym;
        }
      }
      return { table: table, maxLen: maxLen };
    }

    function decodeSym(huff) {
      var code = 0;
      for (var len = 1; len <= huff.maxLen; len++) {
        if (bitPos >= totalBits) return 256;
        var byteIdx = bitPos >> 3;
        var bitIdx = bitPos & 7;
        if ((data[byteIdx] >> bitIdx) & 1) code |= (1 << (len - 1));
        bitPos++;
        var sym = huff.table[(len << 16) | code];
        if (sym !== undefined) return sym;
      }
      return 256;
    }

    var lenBase = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
    var lenExtra = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
    var distBase = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
    var distExtra = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];
    var clOrder = [16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15];

    var out = [];
    var bfinal = 0;
    while (!bfinal) {
      bfinal = readBits(1);
      var btype = readBits(2);
      if (btype === 0) {
        bitPos = (bitPos + 7) & ~7;
        var bytePos = bitPos >> 3;
        var len = data[bytePos] | (data[bytePos + 1] << 8);
        bytePos += 4;
        for (var u = 0; u < len; u++) out.push(data[bytePos + u]);
        bitPos = (bytePos + len) * 8;
      } else if (btype === 1 || btype === 2) {
        var litHuff, distHuff;
        if (btype === 1) {
          var fixedLit = [];
          for (var f = 0; f <= 143; f++) fixedLit.push(8);
          for (f = 144; f <= 255; f++) fixedLit.push(9);
          for (f = 256; f <= 279; f++) fixedLit.push(7);
          for (f = 280; f <= 287; f++) fixedLit.push(8);
          var fixedDist = [];
          for (var fd = 0; fd < 32; fd++) fixedDist.push(5);
          litHuff = buildHuff(fixedLit);
          distHuff = buildHuff(fixedDist);
        } else {
          var hlit = readBits(5) + 257;
          var hdist = readBits(5) + 1;
          var hclen = readBits(4) + 4;
          var clLens = new Array(19).fill(0);
          for (var c = 0; c < hclen; c++) clLens[clOrder[c]] = readBits(3);
          var clHuff = buildHuff(clLens);
          var combinedLens = [];
          while (combinedLens.length < hlit + hdist) {
            var symC = decodeSym(clHuff);
            if (symC <= 15) {
              combinedLens.push(symC);
            } else if (symC === 16) {
              var rep = readBits(2) + 3;
              var prev = combinedLens[combinedLens.length - 1] || 0;
              while (rep--) combinedLens.push(prev);
            } else if (symC === 17) {
              var z3 = readBits(3) + 3;
              while (z3--) combinedLens.push(0);
            } else if (symC === 18) {
              var z7 = readBits(7) + 11;
              while (z7--) combinedLens.push(0);
            }
          }
          litHuff = buildHuff(combinedLens.slice(0, hlit));
          distHuff = buildHuff(combinedLens.slice(hlit));
        }

        while (true) {
          var sym = decodeSym(litHuff);
          if (sym < 256) {
            out.push(sym);
          } else if (sym === 256) {
            break;
          } else {
            var lIdx = sym - 257;
            var matchLen = lenBase[lIdx] + readBits(lenExtra[lIdx]);
            var dSym = decodeSym(distHuff);
            var matchDist = distBase[dSym] + readBits(distExtra[dSym]);
            var startCopy = out.length - matchDist;
            for (var m = 0; m < matchLen; m++) {
              out.push(out[startCopy + m]);
            }
          }
        }
      } else {
        throw new Error("Invalid deflate block type");
      }
    }
    return new Uint8Array(out);
  }

  function applyWorkbookData(wbData) {
    if (wbData && Array.isArray(wbData.officers) && wbData.officers.length) {
      roster = wbData.officers;
      $('rosterInfo').textContent = 'Checked against the IRMS (Traffic) officer list (directory-data.xlsx).';
      var currentRefName = $('refName').value || (savedRef && savedRef.n) || '';
      populateNames(currentRefName);
      if (savedRef && savedRef.n === '__other__' && savedRef.o && !$('refOther').value) {
        $('refOther').value = savedRef.o;
      }
      render();
      verify();
    }
    if (wbData && Array.isArray(wbData.dcm) && wbData.dcm.length) {
      dcm = wbData.dcm;
      fillZones();
      render();
    }
  }

  $('reqText').addEventListener('input', verify);
  setRoster($('rosterData') ? $('rosterData').textContent : '');

  if (typeof fetch === "function") {
    fetch("directory-data.xlsx")
      .then(function (resp) {
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        return resp.arrayBuffer();
      })
      .then(function (buf) {
        parseXlsxRosterAndDcm(buf, function (err, parsed) {
          if (!err && parsed) {
            applyWorkbookData(parsed);
          }
        });
      })
      .catch(function () {
        if (!roster.length) {
          $('rosterInfo').textContent = 'Could not load directory-data.xlsx (open via a web server or GitHub Pages).';
        }
      });
  }

  // ---- Send to SR DCM ----
  var dcm = [];
  var dcmOpen = false;

  function parseDcm(text) {
    var out = [];
    text.split(/\r?\n/).forEach(function (line) {
      line = line.trim();
      if (!line || line.charAt(0) === '#') return;
      var c = line.split(',').map(function (s) { return s.trim(); });
      if (c.length < 2 || !c[0] || !c[1]) return;
      var num = (c[3] || '').replace(/\D/g, '');
      if (num.length === 11 && num.charAt(0) === '0') num = num.slice(1);
      out.push({ zone: c[0], div: c[1], name: c[2] || '', num: /^\d{10}$/.test(num) ? num : '' });
    });
    return out;
  }

  function fillZones() {
    var sel = $('dcmZone'), zones = [];
    dcm.forEach(function (c) { if (zones.indexOf(c.zone) < 0) zones.push(c.zone); });
    zones.sort();
    sel.innerHTML = '<option value="">Select zone</option>' + zones.map(function (z) { return '<option>' + esc(z) + '</option>'; }).join('');
    fillDivs();
  }
  function fillDivs() {
    var z = $('dcmZone').value, sel = $('dcmDiv'), divs = [];
    dcm.forEach(function (c) { if (c.zone === z && divs.indexOf(c.div) < 0) divs.push(c.div); });
    divs.sort();
    sel.innerHTML = '<option value="">' + (z ? 'Select division' : 'Select zone first') + '</option>' + divs.map(function (d) { return '<option>' + esc(d) + '</option>'; }).join('');
    sel.disabled = !z;
  }

  function renderDcm(txt, missing) {
    var panel = $('dcmPanel'), box = $('dcmResult');
    panel.hidden = missing || !dcmOpen;
    $('dcmBtn').disabled = missing;
    $('dcmBtn').setAttribute('aria-expanded', String(!panel.hidden));
    if (panel.hidden) return;
    if (!dcm.length) { box.innerHTML = '<p class="hint">The Sr. DCM contact list has not been added yet.</p>'; return; }
    var z = $('dcmZone').value, d = $('dcmDiv').value;
    if (!z || !d) { box.innerHTML = '<p class="hint">Select the zone and division to see the Sr. DCM contact.</p>'; return; }
    var list = dcm.filter(function (c) { return c.zone === z && c.div === d; });
    box.innerHTML = list.map(function (c) {
      if (!c.num) {
        return '<div class="contact"><div class="who"><strong>' + esc(c.name || 'Sr. DCM') + '</strong>, ' + esc(c.div) +
          '<div class="num">No Sr. DCM number in the directory</div></div></div>';
      }
      return '<div class="contact"><div class="who"><strong>' + esc(c.name || 'Sr. DCM') + '</strong>, ' + esc(c.div) +
        '<div class="num">CUG ' + c.num + '</div></div>' +
        '<a class="btn" target="_blank" rel="noopener" href="https://wa.me/91' + c.num + '?text=' + encodeURIComponent(txt) + '">Open WhatsApp</a></div>';
    }).join('');
  }

  $('dcmBtn').addEventListener('click', function () {
    dcmOpen = !dcmOpen;
    render();
    if (dcmOpen) { try { $('dcmPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (e) {} }
  });
  $('dcmZone').addEventListener('change', function () { fillDivs(); render(); });
  $('dcmDiv').addEventListener('change', render);
  dcm = parseDcm($('dcmData') ? $('dcmData').textContent : '');
  fillZones();

  // Reference: batch first, then officers of that batch
  function populateNames(keep) {
    var sel = $('refName'), b = $('batch').value;
    sel.innerHTML = '';
    function add(v, t) { var o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); }
    if (!b) { add('', 'Select batch first'); sel.disabled = true; }
    else {
      add('', 'Select your name'); sel.disabled = false;
      roster.filter(function (r) { return r.batch === b; })
        .map(function (r) { return r.name; })
        .sort(function (x, y) { return x.localeCompare(y); })
        .forEach(function (n) { add(n, n); });
      add('__other__', 'My name is not listed');
    }
    if (keep) { sel.value = keep; if (sel.value !== keep) sel.value = ''; }
    $('refOtherBox').hidden = sel.value !== '__other__';
  }
  $('batch').addEventListener('change', function () {
    populateNames('');
    $('postedAs').value = '';
    render();
  });
  $('refName').addEventListener('change', function () {
    $('refOtherBox').hidden = this.value !== '__other__';
    $('postedAs').value = '';
    render();
  });
  $('refOther').addEventListener('input', function () {
    $('postedAs').value = '';
    render();
  });
  if (savedRef) {
    if (savedRef.b) {
      $('batch').value = savedRef.b;
      populateNames(savedRef.n || '');
      if (savedRef.o) $('refOther').value = savedRef.o;
    } else {
      populateNames('');
    }
    if (savedRef.p) $('postedAs').value = savedRef.p;
  } else { populateNames(''); }

  // ---- Views ----
  function showView(v) {
    var isV = v === 'verify';
    $('viewCreate').hidden = isV;
    $('viewVerify').hidden = !isV;
    $('tabCreate').setAttribute('aria-current', isV ? 'false' : 'page');
    $('tabVerify').setAttribute('aria-current', isV ? 'page' : 'false');
  }
  $('tabCreate').addEventListener('click', function () { showView('create'); try { location.hash = 'create'; } catch (e) {} });
  $('tabVerify').addEventListener('click', function () { showView('verify'); try { location.hash = 'verify'; } catch (e) {} });
  window.addEventListener('hashchange', function () { showView(location.hash === '#verify' ? 'verify' : 'create'); });
  showView(location.hash === '#verify' ? 'verify' : 'create');

  applyParse();
})();
