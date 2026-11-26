(function () {
  var $ = function (id) { return document.getElementById(id); };
  if (!$('viewTaBill')) return;

  var EMP_STORAGE_KEY = 'ta-emp-details-v2';
  var EMP_LOCK_KEY = 'ta-emp-locked-v2';

  var LEVEL_RATES = {
    '6': 1000, '7': 1000, '8': 1000,
    '9': 1125, '10': 1125, '11': 1125,
    '12': 1250, '13': 1250, '13A': 1250,
    '14': 1500, '15': 1500
  };

  var EMP_DEFAULTS = {
    taYear: '2026',
    taName: '',
    taDesignation: 'IRMS (Traffic) 202_',
    taDept: 'Admin/General',
    taHq: 'IRITM/LKO',
    taPfNo: '0642980xxxx',
    taBillUnit: '0306-013',
    taPay: '',
    taLevel: '10',
    taDailyRate: '1125',
    taDoa: '',
    taRailway: 'Northern Railway (NR)',
    taRules: 'As per Extant Rules',
    taTravelMode: 'Rail'
  };

  var EMP_PERSIST_IDS = [
    'taYear', 'taName', 'taDesignation', 'taDept', 'taHq',
    'taPfNo', 'taBillUnit', 'taPay', 'taLevel', 'taDailyRate',
    'taDoa', 'taRailway', 'taRules', 'taTravelMode'
  ];

  var EMP_LOCKABLE_IDS = [
    'taMonth', 'taYear', 'taName', 'taDesignation', 'taDept', 'taHq',
    'taPfNo', 'taBillUnit', 'taPay', 'taLevel', 'taDoa',
    'taRailway', 'taRules'
  ];

  var journeys = [];
  var editingId = null;
  var activeEntryType = 'travel';
  var empLocked = false;
  var previewVisible = true;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showValidationPopup(titleText, errorsList) {
    if (!errorsList || !errorsList.length) return;
    var existing = document.getElementById('taValidationModal');
    if (existing && existing.parentNode) {
      existing.parentNode.removeChild(existing);
    }

    var backdrop = document.createElement('div');
    backdrop.id = 'taValidationModal';
    backdrop.className = 'ta-modal-backdrop';
    backdrop.setAttribute('role', 'dialog');
    backdrop.setAttribute('aria-modal', 'true');

    var modal = document.createElement('div');
    modal.className = 'ta-modal-card';

    var h = document.createElement('h3');
    h.className = 'ta-modal-title';
    h.textContent = titleText || 'Please fix the following required fields';
    modal.appendChild(h);

    var ul = document.createElement('ul');
    ul.className = 'ta-modal-list';
    errorsList.forEach(function (msg) {
      var li = document.createElement('li');
      li.textContent = msg;
      ul.appendChild(li);
    });
    modal.appendChild(ul);

    var actions = document.createElement('div');
    actions.className = 'actions';
    var okBtn = document.createElement('button');
    okBtn.type = 'button';
    okBtn.className = 'btn';
    okBtn.textContent = 'OK';
    okBtn.addEventListener('click', function () {
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      var firstBad = document.querySelector('#viewTaBill .field.needs-fill input:not([readonly]), #viewTaBill .field.needs-fill select:not(:disabled)');
      if (firstBad) {
        try { firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {}
        firstBad.focus();
      }
    });
    actions.appendChild(okBtn);
    modal.appendChild(actions);

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
    okBtn.focus();
  }

  // ---- Employee Details Validation & Persistence ----
  function syncDailyRateFromLevel() {
    var lvl = $('taLevel') ? $('taLevel').value : '10';
    var rate = LEVEL_RATES[lvl] || 1125;
    if ($('taDailyRate')) {
      $('taDailyRate').value = String(rate);
      $('taDailyRate').readOnly = true;
    }
    return rate;
  }

  function setFieldError(id, hasError) {
    var el = $(id);
    if (!el) return;
    var wrap = el.closest('.field');
    if (wrap) wrap.classList.toggle('needs-fill', !!hasError);
  }

  function clearFieldErrors(ids) {
    (ids || []).forEach(function (id) { setFieldError(id, false); });
  }

  function validateEmployeeDetails(highlight) {
    var errors = [];
    var shouldHighlight = highlight !== false;

    var monthVal = $('taMonth') ? $('taMonth').value.trim() : '';
    var yearVal = $('taYear') ? $('taYear').value.trim() : '';
    var nameVal = $('taName') ? $('taName').value.trim() : '';
    var desigVal = $('taDesignation') ? $('taDesignation').value.trim() : '';
    var deptVal = $('taDept') ? $('taDept').value.trim() : '';
    var hqVal = $('taHq') ? $('taHq').value.trim() : '';
    var pfVal = $('taPfNo') ? $('taPfNo').value.trim() : '';
    var billUnitVal = $('taBillUnit') ? $('taBillUnit').value.trim() : '';
    var payVal = $('taPay') ? $('taPay').value.trim() : '';
    var levelVal = $('taLevel') ? $('taLevel').value.trim() : '';
    var dailyRateVal = $('taDailyRate') ? $('taDailyRate').value.trim() : '';
    var doaVal = $('taDoa') ? $('taDoa').value.trim() : '';
    var railwayVal = $('taRailway') ? $('taRailway').value.trim() : '';
    var rulesVal = $('taRules') ? $('taRules').value.trim() : '';

    var badMonth = !monthVal;
    if (badMonth) errors.push('Month is mandatory.');

    var badYear = !yearVal || !/^(2026|2027)$/.test(yearVal);
    if (badYear) errors.push('Year is mandatory (select 2026 or 2027).');

    var badName = false;
    if (!nameVal) {
      badName = true;
      errors.push('Officer name is mandatory.');
    } else if (/\d/.test(nameVal)) {
      badName = true;
      errors.push('Officer name must not contain any numbers.');
    }

    var badDesig = !desigVal;
    if (badDesig) errors.push('Designation is mandatory.');

    var badDept = !deptVal;
    if (badDept) errors.push('Department is mandatory.');

    var badHq = !hqVal;
    if (badHq) errors.push('Headquarters is mandatory.');

    var pfDigits = pfVal.replace(/\D/g, '');
    var badPf = !pfVal || !/^\d+$/.test(pfVal) || pfDigits.length < 4;
    if (badPf) {
      errors.push('PF No. / Employee ID is mandatory and must be a number (replace xxxx with your last 4 digits).');
    }

    var badBillUnit = !billUnitVal;
    if (badBillUnit) errors.push('Bill Unit No. is mandatory.');

    var badPay = !payVal || !/^\d+(\.\d+)?$/.test(payVal) || parseFloat(payVal) <= 0;
    if (badPay) errors.push('Basic pay is mandatory and must be a valid amount.');

    var badLevel = !levelVal;
    if (badLevel) errors.push('Pay level is mandatory.');

    var badDailyRate = !dailyRateVal || isNaN(parseFloat(dailyRateVal)) || parseFloat(dailyRateVal) <= 0;
    if (badDailyRate) errors.push('Daily TA Rate is missing.');

    var badDoa = !doaVal;
    if (badDoa) errors.push('Date of Appointment is mandatory.');

    var badRailway = !railwayVal;
    if (badRailway) errors.push('Railway Zone is mandatory.');

    var badRules = !rulesVal;
    if (badRules) errors.push('Rules by which governed is mandatory.');

    if (shouldHighlight) {
      setFieldError('taMonth', badMonth);
      setFieldError('taYear', badYear);
      setFieldError('taName', badName);
      setFieldError('taDesignation', badDesig);
      setFieldError('taDept', badDept);
      setFieldError('taHq', badHq);
      setFieldError('taPfNo', badPf);
      setFieldError('taBillUnit', badBillUnit);
      setFieldError('taPay', badPay);
      setFieldError('taLevel', badLevel);
      setFieldError('taDailyRate', badDailyRate);
      setFieldError('taDoa', badDoa);
      setFieldError('taRailway', badRailway);
      setFieldError('taRules', badRules);
    }

    return errors;
  }

  function saveEmployeeDetails() {
    var obj = {};
    EMP_PERSIST_IDS.forEach(function (id) {
      var el = $(id);
      if (el) obj[id] = el.value;
    });
    if (obj.taYear !== '2026' && obj.taYear !== '2027') {
      obj.taYear = '2026';
    }
    try {
      localStorage.setItem(EMP_STORAGE_KEY, JSON.stringify(obj));
    } catch (e) {}
  }

  function applyEmployeeLockState(locked) {
    empLocked = !!locked;
    EMP_LOCKABLE_IDS.forEach(function (id) {
      var el = $(id);
      if (!el) return;
      if (el.tagName === 'SELECT') el.disabled = empLocked;
      else el.readOnly = empLocked;
    });
    if ($('taDailyRate')) {
      $('taDailyRate').readOnly = true;
    }
    if ($('taSaveEmpBtn')) {
      $('taSaveEmpBtn').hidden = empLocked;
      $('taSaveEmpBtn').disabled = empLocked;
    }
    if ($('taEditEmpBtn')) {
      $('taEditEmpBtn').hidden = !empLocked;
    }
    if ($('taEmpLockHint')) {
      $('taEmpLockHint').textContent = empLocked
        ? 'Employee details are saved and locked. Click "Edit Employee Details" to make changes.'
        : 'Month starts blank on reset; other employee details are remembered after saving.';
    }
    try {
      localStorage.setItem(EMP_LOCK_KEY, empLocked ? '1' : '0');
    } catch (e) {}
  }

  function loadEmployeeDetails() {
    if ($('taMonth')) $('taMonth').value = '';
    if ($('taYear')) $('taYear').value = '2026';
    if ($('taDesignation')) $('taDesignation').value = EMP_DEFAULTS.taDesignation;
    if ($('taDept')) $('taDept').value = EMP_DEFAULTS.taDept;
    if ($('taHq')) $('taHq').value = EMP_DEFAULTS.taHq;
    if ($('taPfNo')) $('taPfNo').value = EMP_DEFAULTS.taPfNo;
    if ($('taBillUnit')) $('taBillUnit').value = EMP_DEFAULTS.taBillUnit;
    if ($('taLevel')) $('taLevel').value = EMP_DEFAULTS.taLevel;
    if ($('taRailway')) $('taRailway').value = EMP_DEFAULTS.taRailway;
    if ($('taRules')) $('taRules').value = EMP_DEFAULTS.taRules;

    var saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(EMP_STORAGE_KEY) || 'null');
    } catch (e) {}

    if (saved && typeof saved === 'object') {
      EMP_PERSIST_IDS.forEach(function (id) {
        if (saved[id] !== undefined && saved[id] !== '' && $(id)) {
          if (id === 'taYear') {
            $(id).value = (saved[id] === '2026' || saved[id] === '2027') ? saved[id] : '2026';
          } else {
            $(id).value = saved[id];
          }
        }
      });
    } else {
      try {
        var eqRef = JSON.parse(localStorage.getItem('eq-ref') || 'null');
        if (eqRef) {
          var nm = eqRef.n === '__other__' ? (eqRef.o || '') : (eqRef.n || '');
          if (nm && !/\d/.test(nm) && $('taName') && !$('taName').value) $('taName').value = nm;
        }
      } catch (e) {}
    }

    syncDailyRateFromLevel();

    var wasLocked = false;
    try {
      wasLocked = localStorage.getItem(EMP_LOCK_KEY) === '1';
    } catch (e) {}
    applyEmployeeLockState(wasLocked);
  }

  if ($('taSaveEmpBtn')) {
    $('taSaveEmpBtn').addEventListener('click', function () {
      var errs = validateEmployeeDetails();
      if (errs.length) {
        showValidationPopup('Cannot Save Employee Details', errs);
        return;
      }
      saveEmployeeDetails();
      applyEmployeeLockState(true);
      renderAll();
    });
  }

  if ($('taEditEmpBtn')) {
    $('taEditEmpBtn').addEventListener('click', function () {
      applyEmployeeLockState(false);
    });
  }

  $('taLevel').addEventListener('change', function () {
    syncDailyRateFromLevel();
    saveEmployeeDetails();
    updateEntryRateBox();
    renderAll();
  });

  EMP_PERSIST_IDS.forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('input', function () {
      saveEmployeeDetails();
      updateEntryRateBox();
      renderAll();
    });
    el.addEventListener('change', function () {
      saveEmployeeDetails();
      updateEntryRateBox();
      renderAll();
    });
  });

  if ($('taMonth')) {
    $('taMonth').addEventListener('change', renderAll);
  }
  if ($('taContingent')) {
    $('taContingent').addEventListener('input', renderAll);
  }

  // ---- Date & Sorting Helpers ----
  var MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTH_MAP = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12
  };

  function entrySortKey(e) {
    var d = (e.date || '9999-12-31').trim();
    var t = (e.timeLeft || '00:00').trim();
    if (/^\d{1,2}:\d{2}$/.test(t) && t.length === 4) t = '0' + t;
    var typeOrder = e.entryType === 'nontravel' ? '0' : '1';
    return d + ' ' + t + ' ' + typeOrder;
  }

  function getSortedJourneys() {
    return journeys.slice().sort(function (a, b) {
      var ka = entrySortKey(a);
      var kb = entrySortKey(b);
      if (ka < kb) return -1;
      if (ka > kb) return 1;
      return (a._seq || 0) - (b._seq || 0);
    });
  }

  function formatShortSlashDate(isoDate) {
    if (!isoDate) return '';
    var m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return isoDate;
    return m[3] + '/' + m[2] + '/' + m[1].slice(-2);
  }

  function formatFullDate(isoDate) {
    if (!isoDate) return '';
    var m = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return isoDate;
    return m[3] + '-' + m[2] + '-' + m[1];
  }

  function padTwoDigits(val) {
    var n = parseInt(val, 10);
    if (isNaN(n)) return String(val || '').trim();
    return n < 10 && n >= 0 ? ('0' + n) : String(n);
  }

  function calcInclusiveDays(fromIso, toIso) {
    if (!fromIso || !toIso) return 0;
    var p1 = fromIso.split('-').map(Number);
    var p2 = toIso.split('-').map(Number);
    if (p1.length !== 3 || p2.length !== 3) return 0;
    var d1 = Date.UTC(p1[0], p1[1] - 1, p1[2]);
    var d2 = Date.UTC(p2[0], p2[1] - 1, p2[2]);
    if (d2 < d1) return 0;
    return Math.round((d2 - d1) / 86400000) + 1;
  }

  // ---- Amount, Rate Formula String & Number to Words (Indian Rupees) ----
  function getEntryDayCount(e) {
    var d = parseFloat(e.daysCount);
    return (!isNaN(d) && d > 0) ? d : 1;
  }

  function computeEntryAmount(e) {
    var daily = syncDailyRateFromLevel();
    var pct = parseFloat(e.slab);
    if (isNaN(pct)) pct = 100;
    var days = getEntryDayCount(e);
    return Math.round((daily * (pct / 100) * days) * 100) / 100;
  }

  function formatNumberClean(val) {
    var n = Number(val) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }

  function buildRateFormulaString(daily, pct, days, amt) {
    return 'Rs. ' + formatNumberClean(daily) + ' × ' + formatNumberClean(pct) + '% × ' + formatNumberClean(days) + ' = ' + formatNumberClean(amt);
  }

  function splitRsPaise(amount) {
    var fixed = (Math.round((Number(amount) || 0) * 100) / 100).toFixed(2);
    var parts = fixed.split('.');
    return { rs: parts[0], p: parts[1] };
  }

  function numberToIndianWords(num) {
    var n = Math.floor(Math.abs(Number(num) || 0));
    if (n === 0) return 'Zero';
    var ones = [
      '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
      'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
      'Seventeen', 'Eighteen', 'Nineteen'
    ];
    var tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    function twoDigits(x) {
      if (x < 20) return ones[x];
      var t = Math.floor(x / 10);
      var o = x % 10;
      return tens[t] + (o ? ' ' + ones[o] : '');
    }

    function threeDigits(x) {
      var h = Math.floor(x / 100);
      var rem = x % 100;
      var out = '';
      if (h) out += ones[h] + ' Hundred';
      if (rem) out += (out ? ' ' : '') + twoDigits(rem);
      return out;
    }

    var parts = [];
    var crore = Math.floor(n / 10000000);
    n %= 10000000;
    var lakh = Math.floor(n / 100000);
    n %= 100000;
    var thousand = Math.floor(n / 1000);
    n %= 1000;

    if (crore) parts.push(threeDigits(crore) + ' Crore');
    if (lakh) parts.push(twoDigits(lakh) + ' Lakh');
    if (thousand) parts.push(twoDigits(thousand) + ' Thousand');
    if (n) parts.push(threeDigits(n));
    return parts.join(' ');
  }

  function computeSummary(sortedList) {
    var dailyRate = syncDailyRateFromLevel();
    var c30 = 0, c70 = 0, c100 = 0;
    var amt30 = 0, amt70 = 0, amt100 = 0, amtOther = 0;

    sortedList.forEach(function (e) {
      var amt = computeEntryAmount(e);
      var days = getEntryDayCount(e);
      var slab = String(e.slab || '');
      if (slab === '30') {
        c30 += days;
        amt30 += amt;
      } else if (slab === '70') {
        c70 += days;
        amt70 += amt;
      } else if (slab === '100') {
        c100 += days;
        amt100 += amt;
      } else {
        amtOther += amt;
      }
    });

    var contingent = parseFloat($('taContingent').value) || 0;
    var journalTotal = amt30 + amt70 + amt100 + amtOther;
    var grandTotal = journalTotal + contingent;

    return {
      dailyRate: dailyRate,
      c30: c30, amt30: amt30,
      c70: c70, amt70: amt70,
      c100: c100, amt100: amt100,
      amtOther: amtOther,
      contingent: contingent,
      journalTotal: journalTotal,
      grandTotal: grandTotal
    };
  }

  // ---- Sub-tabs: Travel Entry vs Non-travel Entry ----
  function switchEntrySubTab(type) {
    activeEntryType = type === 'nontravel' ? 'nontravel' : 'travel';
    var isTravel = activeEntryType === 'travel';

    $('taSubTabTravel').setAttribute('aria-selected', isTravel ? 'true' : 'false');
    $('taSubTabNonTravel').setAttribute('aria-selected', !isTravel ? 'true' : 'false');

    $('taTravelFields').hidden = !isTravel;
    $('taNonTravelFields').hidden = isTravel;

    if (!editingId) {
      $('taFormModeLabel').textContent = isTravel ? 'New Travel Entry' : 'New Non-travel Entry';
      $('taSaveEntryBtn').textContent = isTravel ? 'Add Travel Entry' : 'Add Non-travel Entry';
    }
    updateEntryRateBox();
  }

  $('taSubTabTravel').addEventListener('click', function () {
    if (editingId) resetEntryForm('travel');
    else switchEntrySubTab('travel');
  });

  $('taSubTabNonTravel').addEventListener('click', function () {
    if (editingId) resetEntryForm('nontravel');
    else switchEntrySubTab('nontravel');
  });

  function autoFillTravelDays() {
    var fromVal = $('taJFromDate').value;
    var toVal = $('taJToDate').value;
    if (fromVal && toVal) {
      var days = calcInclusiveDays(fromVal, toVal);
      if (days > 0) {
        $('taJDays').value = padTwoDigits(days);
      }
    } else if (fromVal && !$('taJDays').value) {
      $('taJDays').value = '01';
    }
    updateEntryRateBox();
  }

  function autoFillNonTravelDays() {
    var fromVal = $('taNTFromDate').value;
    var toVal = $('taNTToDate').value;
    if (fromVal && toVal) {
      var days = calcInclusiveDays(fromVal, toVal);
      if (days > 0) {
        $('taNTDays').value = padTwoDigits(days);
      }
    } else if (fromVal && !$('taNTDays').value) {
      $('taNTDays').value = '01';
    }
    updateEntryRateBox();
  }

  $('taJFromDate').addEventListener('change', autoFillTravelDays);
  $('taJToDate').addEventListener('change', autoFillTravelDays);
  $('taJDays').addEventListener('input', updateEntryRateBox);
  $('taJSlab').addEventListener('change', updateEntryRateBox);

  $('taNTFromDate').addEventListener('change', autoFillNonTravelDays);
  $('taNTToDate').addEventListener('change', autoFillNonTravelDays);
  $('taNTDays').addEventListener('input', updateEntryRateBox);
  $('taNTSlab').addEventListener('change', updateEntryRateBox);

  function updateEntryRateBox() {
    var daily = syncDailyRateFromLevel();
    if (activeEntryType === 'nontravel') {
      var pctNT = parseFloat($('taNTSlab').value);
      if (isNaN(pctNT)) pctNT = 100;
      var daysNT = parseFloat($('taNTDays').value) || 0;
      var amtNT = Math.round((daily * (pctNT / 100) * daysNT) * 100) / 100;
      $('taNTRate').readOnly = true;
      $('taNTRate').value = daysNT > 0 ? buildRateFormulaString(daily, pctNT, daysNT, amtNT) : '';
    } else {
      var pctT = parseFloat($('taJSlab').value);
      if (isNaN(pctT)) pctT = 100;
      var daysT = parseFloat($('taJDays').value) || 0;
      var amtT = Math.round((daily * (pctT / 100) * daysT) * 100) / 100;
      $('taJRate').readOnly = true;
      $('taJRate').value = daysT > 0 ? buildRateFormulaString(daily, pctT, daysT, amtT) : '';
    }
  }

  // ---- Reset Form (fills default values) ----
  function resetEntryForm(preserveTabType) {
    editingId = null;
    $('taCancelEditBtn').hidden = true;
    $('taEntryFormBox').classList.remove('is-editing');

    // Travel defaults
    $('taJFromDate').value = '';
    $('taJToDate').value = '';
    $('taJTrain').value = '';
    $('taJLeft').value = '';
    $('taJArr').value = '';
    $('taJFrom').value = '';
    $('taJTo').value = '';
    $('taJKm').value = '';
    $('taJDays').value = '';
    $('taJSlab').value = '100';
    $('taJRate').value = '';
    $('taJObject').value = '';

    // Non-travel defaults
    $('taNTFromDate').value = '';
    $('taNTToDate').value = '';
    $('taNTDays').value = '';
    $('taNTSlab').value = '100';
    $('taNTRate').value = '';
    $('taNTObject').value = '';

    clearFieldErrors(TRAVEL_FIELD_IDS);
    clearFieldErrors(NONTRAVEL_FIELD_IDS);
    switchEntrySubTab(preserveTabType || activeEntryType || 'travel');
  }

  function startEditEntry(id) {
    var item = null;
    for (var i = 0; i < journeys.length; i++) {
      if (journeys[i].id === id) { item = journeys[i]; break; }
    }
    if (!item) return;

    editingId = id;
    var isNT = item.entryType === 'nontravel';
    switchEntrySubTab(isNT ? 'nontravel' : 'travel');

    var labelDate = formatShortSlashDate(item.date) +
      (item.toDate && item.toDate !== item.date ? ' to ' + formatShortSlashDate(item.toDate) : '');

    $('taFormModeLabel').textContent = (isNT ? 'Edit Non-travel Entry' : 'Edit Travel Entry') + ' (' + labelDate + ')';
    $('taSaveEntryBtn').textContent = isNT ? 'Update Non-travel Entry' : 'Update Travel Entry';
    $('taCancelEditBtn').hidden = false;
    $('taEntryFormBox').classList.add('is-editing');

    if (isNT) {
      $('taNTFromDate').value = item.date || '';
      $('taNTToDate').value = item.toDate || item.date || '';
      $('taNTDays').value = item.daysCount ? padTwoDigits(item.daysCount) : '';
      $('taNTSlab').value = item.slab !== undefined ? String(item.slab) : '100';
      $('taNTObject').value = item.object || '';
    } else {
      $('taJFromDate').value = item.date || '';
      $('taJToDate').value = item.toDate || item.date || '';
      $('taJTrain').value = item.train || '';
      $('taJLeft').value = item.timeLeft || '';
      $('taJArr').value = item.timeArr || '';
      $('taJFrom').value = item.from || '';
      $('taJTo').value = item.to || '';
      $('taJKm').value = item.km || '';
      $('taJDays').value = item.daysCount ? padTwoDigits(item.daysCount) : '01';
      $('taJSlab').value = item.slab !== undefined ? String(item.slab) : '100';
      $('taJObject').value = item.object || '';
    }
    updateEntryRateBox();

    try {
      $('taEntryFormBox').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {}
  }

  function deleteEntry(id) {
    journeys = journeys.filter(function (j) { return j.id !== id; });
    if (editingId === id) resetEntryForm();
    renderAll();
  }

  var TRAVEL_FIELD_IDS = [
    'taJFromDate', 'taJToDate', 'taJTrain', 'taJLeft', 'taJArr',
    'taJFrom', 'taJTo', 'taJDays', 'taJSlab', 'taJRate', 'taJObject'
  ];
  var NONTRAVEL_FIELD_IDS = [
    'taNTFromDate', 'taNTToDate', 'taNTDays', 'taNTSlab', 'taNTRate', 'taNTObject'
  ];

  function validateCurrentEntryForm(highlight) {
    var errs = [];
    var shouldHighlight = highlight !== false;

    if (activeEntryType === 'nontravel') {
      var ntFrom = $('taNTFromDate').value.trim();
      var ntTo = $('taNTToDate').value.trim();
      var ntDays = parseFloat($('taNTDays').value);
      var ntSlab = $('taNTSlab').value.trim();
      var ntRate = $('taNTRate').value.trim();
      var ntObj = $('taNTObject').value.trim();

      var badNtFrom = !ntFrom;
      var badNtTo = !ntTo || (!!ntFrom && !!ntTo && ntTo < ntFrom);
      var badNtDays = isNaN(ntDays) || ntDays <= 0;
      var badNtSlab = !ntSlab;
      var badNtRate = !ntRate;
      var badNtObj = !ntObj;

      if (badNtFrom) errs.push('From Date is mandatory for Non-travel Entry.');
      if (!ntTo) errs.push('To Date is mandatory for Non-travel Entry.');
      else if (ntFrom && ntTo < ntFrom) errs.push('To Date cannot be earlier than From Date.');
      if (badNtDays) errs.push('No. Of Days is mandatory and must be greater than 0.');
      if (badNtSlab) errs.push('TA Percentage is mandatory.');
      if (badNtRate) errs.push('Rate / Totol amount is mandatory.');
      if (badNtObj) errs.push('Object of Journey is mandatory.');

      if (shouldHighlight) {
        setFieldError('taNTFromDate', badNtFrom);
        setFieldError('taNTToDate', badNtTo);
        setFieldError('taNTDays', badNtDays);
        setFieldError('taNTSlab', badNtSlab);
        setFieldError('taNTRate', badNtRate);
        setFieldError('taNTObject', badNtObj);
      }
    } else {
      var jFromDate = $('taJFromDate').value.trim();
      var jToDate = $('taJToDate').value.trim();
      var jTrain = $('taJTrain').value.trim();
      var jLeft = $('taJLeft').value.trim();
      var jArr = $('taJArr').value.trim();
      var jFrom = $('taJFrom').value.trim();
      var jTo = $('taJTo').value.trim();
      var jDays = parseFloat($('taJDays').value);
      var jSlab = $('taJSlab').value.trim();
      var jRate = $('taJRate').value.trim();
      var jObj = $('taJObject').value.trim();

      var badJFromDate = !jFromDate;
      var badJToDate = !jToDate || (!!jFromDate && !!jToDate && jToDate < jFromDate);
      var badJTrain = !jTrain;
      var badJLeft = !jLeft;
      var badJArr = !jArr;
      var badJFrom = !jFrom;
      var badJTo = !jTo;
      var badJDays = isNaN(jDays) || jDays <= 0;
      var badJSlab = !jSlab;
      var badJRate = !jRate;
      var badJObj = !jObj;

      if (badJFromDate) errs.push('From Date is mandatory for Travel Entry.');
      if (!jToDate) errs.push('To Date is mandatory for Travel Entry.');
      else if (jFromDate && jToDate < jFromDate) errs.push('To Date cannot be earlier than From Date.');
      if (badJTrain) errs.push('Train No./ Mode is mandatory.');
      if (badJLeft) errs.push('Departure Time is mandatory.');
      if (badJArr) errs.push('Arrival Time is mandatory.');
      if (badJFrom) errs.push('Station From is mandatory.');
      if (badJTo) errs.push('Station To is mandatory.');
      if (badJDays) errs.push('No. Of Days is mandatory and must be greater than 0.');
      if (badJSlab) errs.push('TA Percentage is mandatory.');
      if (badJRate) errs.push('Rate / Totol amount is mandatory.');
      if (badJObj) errs.push('Object of Journey is mandatory.');

      if (shouldHighlight) {
        setFieldError('taJFromDate', badJFromDate);
        setFieldError('taJToDate', badJToDate);
        setFieldError('taJTrain', badJTrain);
        setFieldError('taJLeft', badJLeft);
        setFieldError('taJArr', badJArr);
        setFieldError('taJFrom', badJFrom);
        setFieldError('taJTo', badJTo);
        setFieldError('taJDays', badJDays);
        setFieldError('taJSlab', badJSlab);
        setFieldError('taJRate', badJRate);
        setFieldError('taJObject', badJObj);
      }
    }
    return errs;
  }

  $('taSaveEntryBtn').addEventListener('click', function () {
    var errs = validateCurrentEntryForm();
    if (errs.length) {
      showValidationPopup(activeEntryType === 'nontravel' ? 'Non-travel Entry Validation' : 'Travel Entry Validation', errs);
      return;
    }

    var entryData;
    var refDateForMonth = '';

    if (activeEntryType === 'nontravel') {
      var fromDateVal = $('taNTFromDate').value.trim();
      var toDateVal = $('taNTToDate').value.trim() || fromDateVal;
      var daysNum = parseFloat($('taNTDays').value) || calcInclusiveDays(fromDateVal, toDateVal) || 1;
      entryData = {
        id: editingId || ('ta_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
        _seq: journeys.length + 1,
        entryType: 'nontravel',
        date: fromDateVal,
        toDate: toDateVal,
        daysCount: daysNum,
        train: '',
        timeLeft: '',
        timeArr: '',
        from: '',
        to: '',
        km: '',
        dayNight: padTwoDigits(daysNum),
        slab: $('taNTSlab').value,
        object: $('taNTObject').value.trim()
      };
      refDateForMonth = fromDateVal;
    } else {
      var jFromDateVal = $('taJFromDate').value.trim();
      var jToDateVal = $('taJToDate').value.trim() || jFromDateVal;
      var jDaysNum = parseFloat($('taJDays').value) || calcInclusiveDays(jFromDateVal, jToDateVal) || 1;
      entryData = {
        id: editingId || ('ta_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)),
        _seq: journeys.length + 1,
        entryType: 'travel',
        date: jFromDateVal,
        toDate: jToDateVal,
        daysCount: jDaysNum,
        train: $('taJTrain').value.trim(),
        timeLeft: $('taJLeft').value.trim(),
        timeArr: $('taJArr').value.trim(),
        from: $('taJFrom').value.trim().toUpperCase(),
        to: $('taJTo').value.trim().toUpperCase(),
        km: $('taJKm').value.trim(),
        dayNight: padTwoDigits(jDaysNum),
        slab: $('taJSlab').value,
        object: $('taJObject').value.trim()
      };
      refDateForMonth = jFromDateVal;
    }

    if (editingId) {
      for (var i = 0; i < journeys.length; i++) {
        if (journeys[i].id === editingId) {
          entryData._seq = journeys[i]._seq;
          journeys[i] = entryData;
          break;
        }
      }
    } else {
      journeys.push(entryData);
    }

    if (!$('taMonth').value && /^\d{4}-\d{2}-\d{2}$/.test(refDateForMonth)) {
      var mIdx = parseInt(refDateForMonth.slice(5, 7), 10) - 1;
      var fullMonths = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      if (fullMonths[mIdx]) $('taMonth').value = fullMonths[mIdx];
      if (!$('taYear').value) $('taYear').value = refDateForMonth.slice(0, 4);
    }

    resetEntryForm(activeEntryType);
    renderAll();
  });

  $('taCancelEditBtn').addEventListener('click', function () { resetEntryForm(activeEntryType); });
  $('taResetEntryBtn').addEventListener('click', function () { resetEntryForm(activeEntryType); });

  $('taClearAllEntries').addEventListener('click', function () {
    journeys = [];
    resetEntryForm();
    renderAll();
  });

  // ---- Import Entries from Existing TA Bill PDF ----
  function parseTaDateToken(tok, defaultYear, defaultMonthNum) {
    var s = String(tok || '').trim();
    if (!s) return '';
    var m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{2})$/);
    if (m) {
      var fullYr = parseInt(m[3], 10) < 70 ? ('20' + ('0' + m[3]).slice(-2)) : ('19' + ('0' + m[3]).slice(-2));
      return fullYr + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    }
    m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
    if (m) {
      return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    }
    m = s.match(/^(\d{1,2})[-\/\s]([A-Za-z]{3,9})[-\/\s](\d{4})$/);
    if (m && MONTH_MAP[m[2].toLowerCase()]) {
      return m[3] + '-' + ('0' + MONTH_MAP[m[2].toLowerCase()]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    }
    m = s.match(/^(\d{1,2})[-\/\s]([A-Za-z]{3,9})$/);
    if (m && MONTH_MAP[m[2].toLowerCase()]) {
      var yr = defaultYear || '2026';
      return yr + '-' + ('0' + MONTH_MAP[m[2].toLowerCase()]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    }
    m = s.match(/^(\d{1,2})[-\/](\d{1,2})$/);
    if (m) {
      var yr3 = defaultYear || '2026';
      return yr3 + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    }
    if (/^\d{1,2}$/.test(s) && defaultMonthNum) {
      var yr4 = defaultYear || '2026';
      return yr4 + '-' + ('0' + defaultMonthNum).slice(-2) + '-' + ('0' + s).slice(-2);
    }
    return '';
  }

  async function extractTaEntriesFromPdf(file) {
    if (!window.pdfjsLib) {
      throw new Error('PDF reader library could not load.');
    }
    var buf = await file.arrayBuffer();
    var pdf = await pdfjsLib.getDocument({ data: buf }).promise;
    var allItems = [];
    var fullText = '';

    for (var p = 1; p <= pdf.numPages; p++) {
      var page = await pdf.getPage(p);
      var tc = await page.getTextContent();
      var pageItems = tc.items.map(function (it) {
        return {
          str: it.str,
          x: it.transform[4],
          y: it.transform[5],
          page: p
        };
      });
      allItems = allItems.concat(pageItems);

      var sorted = pageItems.slice().sort(function (a, b) {
        if (Math.abs(b.y - a.y) > 4) return b.y - a.y;
        return a.x - b.x;
      });
      var out = [], lastY = null;
      sorted.forEach(function (it) {
        if (lastY !== null && Math.abs(it.y - lastY) > 4) out.push('\n');
        else if (out.length && out[out.length - 1] !== '\n') out.push(' ');
        out.push(it.str);
        lastY = it.y;
      });
      fullText += out.join('') + '\n';
    }

    var detectedYear = ($('taYear') && $('taYear').value.trim()) || '2026';
    var detectedMonthNum = '';
    var ym = fullText.match(/month\s*([A-Za-z]{3,9})[\s\.\-]*year\s*(\d{4})/i) ||
             fullText.match(/allowance\s+for\s+month\s*([A-Za-z]{3,9})[\s\.\-]*(\d{4})/i);
    if (ym) {
      if (MONTH_MAP[ym[1].toLowerCase()]) detectedMonthNum = MONTH_MAP[ym[1].toLowerCase()];
      if (ym[2] === '2026' || ym[2] === '2027') detectedYear = ym[2];
    }

    var pdfDailyRate = syncDailyRateFromLevel();

    function colBucket(x) {
      if (x < 82) return 0;
      if (x < 128) return 1;
      if (x < 178) return 2;
      if (x < 228) return 3;
      if (x < 270) return 4;
      if (x < 313) return 5;
      if (x < 356) return 6;
      if (x < 398) return 7;
      if (x < 481) return 8;
      if (x < 533) return 9;
      return 10;
    }

    var extracted = [];
    for (var pg = 1; pg <= pdf.numPages; pg++) {
      var pItems = allItems.filter(function (it) { return it.page === pg && it.str.trim() !== ''; });
      pItems.sort(function (a, b) {
        if (Math.abs(b.y - a.y) > 5) return b.y - a.y;
        return a.x - b.x;
      });

      var rows = [];
      pItems.forEach(function (it) {
        var placed = false;
        for (var r = 0; r < rows.length; r++) {
          if (Math.abs(rows[r].y - it.y) <= 5) {
            rows[r].items.push(it);
            placed = true;
            break;
          }
        }
        if (!placed) rows.push({ y: it.y, items: [it] });
      });

      rows.forEach(function (row) {
        var cols = ['', '', '', '', '', '', '', '', '', '', ''];
        row.items.sort(function (a, b) { return a.x - b.x; });
        row.items.forEach(function (it) {
          var c = colBucket(it.x);
          cols[c] = (cols[c] ? cols[c] + ' ' : '') + it.str.trim();
        });

        var rawDate = cols[0].trim();
        if (!rawDate || /month|date|total|summary|percentage|certified/i.test(rawDate)) return;

        var rangeMatch = rawDate.match(/^(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{1,2}[-\/][A-Za-z]{3})\s*[-–]\s*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}|\d{1,2}[-\/][A-Za-z]{3})$/);
        var isoDate = '';
        var isoToDate = '';
        if (rangeMatch) {
          isoDate = parseTaDateToken(rangeMatch[1], detectedYear, detectedMonthNum);
          isoToDate = parseTaDateToken(rangeMatch[2], detectedYear, detectedMonthNum);
        } else {
          isoDate = parseTaDateToken(rawDate, detectedYear, detectedMonthNum);
        }
        if (!isoDate) return;

        var hasContent = cols[1] || cols[4] || cols[5] || cols[7] || cols[8] || cols[9];
        if (!hasContent) return;

        var rateColText = (cols[9] || '').trim();
        var eqMatch = rateColText.match(/=\s*([\d.]+)/);
        var rsVal = eqMatch
          ? parseFloat(eqMatch[1])
          : parseFloat(rateColText.replace(/[^\d.]/g, ''));
        var pVal = parseFloat((cols[10] || '').replace(/[^\d.]/g, ''));
        var totalAmt = (!isNaN(rsVal) ? rsVal : 0) + (!isNaN(pVal) ? pVal / 100 : 0);

        var dnDays = parseFloat((cols[7] || '').replace(/[^\d.]/g, ''));
        if (isNaN(dnDays) || dnDays <= 0) {
          dnDays = (isoToDate ? calcInclusiveDays(isoDate, isoToDate) : 1) || 1;
        }

        var slab = '100';
        var pctInFormula = rateColText.match(/(\d+(?:\.\d+)?)\s*%/);
        if (pctInFormula && (pctInFormula[1] === '100' || pctInFormula[1] === '70' || pctInFormula[1] === '30' || pctInFormula[1] === '0')) {
          slab = pctInFormula[1];
        } else if (totalAmt === 0) {
          slab = '0';
        } else if (pdfDailyRate > 0) {
          var perDay = totalAmt / dnDays;
          var ratio = Math.round((perDay / pdfDailyRate) * 100);
          if (ratio === 100 || ratio === 70 || ratio === 30) slab = String(ratio);
        }

        var isNonTravel = !cols[1] && !cols[2] && !cols[3] && !cols[4] && !cols[5];

        extracted.push({
          id: 'ta_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
          _seq: journeys.length + extracted.length + 1,
          entryType: isNonTravel ? 'nontravel' : 'travel',
          date: isoDate,
          toDate: isoToDate || isoDate,
          daysCount: dnDays,
          train: isNonTravel ? '' : (cols[1] || '').trim(),
          timeLeft: isNonTravel ? '' : (cols[2] || '').trim(),
          timeArr: isNonTravel ? '' : (cols[3] || '').trim(),
          from: isNonTravel ? '' : (cols[4] || '').trim().toUpperCase(),
          to: isNonTravel ? '' : (cols[5] || '').trim().toUpperCase(),
          km: isNonTravel ? '' : (cols[6] || '').replace(/[^\d.]/g, ''),
          dayNight: padTwoDigits(dnDays),
          slab: slab,
          object: (cols[8] || '').trim()
        });
      });
    }

    return extracted;
  }

  $('taImportPdf').addEventListener('change', async function () {
    var file = this.files && this.files[0];
    if (!file) return;
    var row = $('taPdfStatusRow');
    var chip = $('taPdfChip');
    row.hidden = false;
    chip.textContent = 'Reading ' + file.name + '…';
    chip.className = 'chip';

    try {
      var imported = await extractTaEntriesFromPdf(file);
      if (!imported.length) {
        chip.textContent = 'No journey rows found in this PDF. Check that it follows the TA Journal format.';
        chip.className = 'chip warn';
      } else {
        journeys = journeys.concat(imported);
        chip.textContent = 'Imported ' + imported.length + ' entr' + (imported.length === 1 ? 'y' : 'ies') + ' from ' + file.name;
        chip.className = 'chip ok';
        renderAll();
      }
    } catch (err) {
      chip.textContent = err && err.message ? err.message : 'Could not read TA bill PDF.';
      chip.className = 'chip bad';
    }
    this.value = '';
  });

  $('taClearPdf').addEventListener('click', function () {
    $('taPdfStatusRow').hidden = true;
  });

  // ---- Render Entry List, Summary & Official Northern Railway TA Journal Preview ----
  function renderEntriesList(sortedList) {
    var box = $('taEntriesList');
    var countChip = $('taCountChip');
    var clearAllBtn = $('taClearAllEntries');

    countChip.textContent = sortedList.length + ' entr' + (sortedList.length === 1 ? 'y' : 'ies');
    clearAllBtn.hidden = sortedList.length === 0;

    if (!sortedList.length) {
      box.innerHTML = '<p class="hint">No entries added yet. Use "Travel Entry" or "Non-travel Entry" above, or import from an existing TA bill PDF.</p>';
      return;
    }

    box.innerHTML = '';
    sortedList.forEach(function (e, idx) {
      var amt = computeEntryAmount(e);
      var daily = syncDailyRateFromLevel();
      var pct = parseFloat(e.slab);
      if (isNaN(pct)) pct = 100;
      var days = getEntryDayCount(e);
      var calcFormula = buildRateFormulaString(daily, pct, days, amt);
      var isNT = e.entryType === 'nontravel';

      var card = document.createElement('div');
      card.className = 'ta-entry-item' + (editingId === e.id ? ' is-active' : '');

      var top = document.createElement('div');
      top.className = 'ta-entry-top';

      var title = document.createElement('div');
      title.className = 'ta-entry-title';

      var dateRangeStr = formatShortSlashDate(e.date) +
        (e.toDate && e.toDate !== e.date ? ' – ' + formatShortSlashDate(e.toDate) : '');

      if (isNT) {
        title.innerHTML = '<span class="mono">#' + (idx + 1) + ' &middot; ' + esc(dateRangeStr) + '</span> &nbsp;<strong>Non-travel (' + esc(padTwoDigits(days)) + ' day' + (days === 1 ? '' : 's') + ')</strong>';
      } else {
        var routeLabel = (e.from || '—') + ' → ' + (e.to || '—');
        title.innerHTML = '<span class="mono">#' + (idx + 1) + ' &middot; ' + esc(dateRangeStr) + '</span> &nbsp;<strong>' + esc(routeLabel) + '</strong>';
      }

      var badge = document.createElement('span');
      badge.className = 'chip ok';
      badge.textContent = calcFormula;

      top.appendChild(title);
      top.appendChild(badge);
      card.appendChild(top);

      var metaBits = ['No. Of Days: ' + padTwoDigits(days)];
      if (!isNT) {
        if (e.train) metaBits.push('Train/Mode: ' + e.train);
        if (e.timeLeft || e.timeArr) metaBits.push((e.timeLeft || '--:--') + ' to ' + (e.timeArr || '--:--'));
        if (e.km) metaBits.push(e.km + ' km');
      }
      if (e.object) metaBits.push(e.object);

      if (metaBits.length) {
        var sub = document.createElement('div');
        sub.className = 'hint';
        sub.textContent = metaBits.join(' · ');
        card.appendChild(sub);
      }

      var btns = document.createElement('div');
      btns.className = 'ta-entry-actions';

      var editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'linkbtn';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', function () { startEditEntry(e.id); });

      var delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'linkbtn ta-del-btn';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', function () { deleteEntry(e.id); });

      btns.appendChild(editBtn);
      btns.appendChild(delBtn);
      card.appendChild(btns);
      box.appendChild(card);
    });
  }

  function renderSummaryCards(sum) {
    var box = $('taSummaryBox');
    box.innerHTML =
      '<div class="ta-stat"><small>30% Days</small><strong>' + sum.c30 + '</strong><span>Rs. ' + sum.amt30.toFixed(2) + '</span></div>' +
      '<div class="ta-stat"><small>70% Days</small><strong>' + sum.c70 + '</strong><span>Rs. ' + sum.amt70.toFixed(2) + '</span></div>' +
      '<div class="ta-stat"><small>100% Days</small><strong>' + sum.c100 + '</strong><span>Rs. ' + sum.amt100.toFixed(2) + '</span></div>' +
      '<div class="ta-stat total"><small>Total Claim</small><strong>Rs. ' + sum.grandTotal.toFixed(2) + '</strong><span>Incl. Contingent Rs. ' + sum.contingent.toFixed(2) + '</span></div>';
  }

  function buildJournalTableHeader() {
    return (
      '<thead>' +
        '<tr>' +
          '<th rowspan="2" style="width:48pt;">Month<br>&amp;<br>Date</th>' +
          '<th rowspan="2" style="width:43pt;">Train<br>no.</th>' +
          '<th rowspan="2" style="width:44pt;">Time<br>left</th>' +
          '<th rowspan="2" style="width:44pt;">Time<br>arrived</th>' +
          '<th colspan="2" style="width:76pt;">Station</th>' +
          '<th rowspan="2" style="width:38pt;">Kilo-<br>meter</th>' +
          '<th rowspan="2" style="width:38pt;">Day/<br>Night</th>' +
          '<th rowspan="2" style="width:85pt;">Object of<br>Journey</th>' +
          '<th colspan="2" style="width:119pt;">Rate</th>' +
        '</tr>' +
        '<tr>' +
          '<th style="width:38pt;">from</th>' +
          '<th style="width:38pt;">to</th>' +
          '<th style="width:93pt;">Rs.</th>' +
          '<th style="width:26pt;">P.</th>' +
        '</tr>' +
      '</thead>'
    );
  }

  function hwCell(contentHtml, extraClass) {
    var cls = 'ta-handwritten' + (extraClass ? ' ' + extraClass : '');
    return '<td class="' + cls + '">' + contentHtml + '</td>';
  }

  function fillSpan(rawVal, fallbackDots) {
    var trimmed = String(rawVal == null ? '' : rawVal).trim();
    if (trimmed) {
      return '<span class="ta-fill is-filled ta-handwritten">' + esc(trimmed) + '</span>';
    }
    return '<span class="ta-fill">' + esc(fallbackDots) + '</span>';
  }

  function buildJournalRowHtml(e) {
    var amt = computeEntryAmount(e);
    var rp = splitRsPaise(amt);
    var daily = syncDailyRateFromLevel();
    var pct = parseFloat(e.slab);
    if (isNaN(pct)) pct = 100;
    var days = getEntryDayCount(e);
    var rateCellText = buildRateFormulaString(daily, pct, days, amt);
    var daysLabel = padTwoDigits(days);

    var fromStr = formatShortSlashDate(e.date);
    var toStr = e.toDate ? formatShortSlashDate(e.toDate) : '';
    var dateCellHtml = toStr && toStr !== fromStr
      ? (esc(fromStr) + '<br>-' + esc(toStr))
      : esc(fromStr);

    if (e.entryType === 'nontravel') {
      return (
        '<tr>' +
          hwCell(dateCellHtml, 'ta-date-cell') +
          '<td></td>' +
          '<td></td>' +
          '<td></td>' +
          '<td></td>' +
          '<td></td>' +
          '<td></td>' +
          hwCell(esc(daysLabel), '') +
          hwCell(esc(e.object), 'ta-obj-cell') +
          hwCell(esc(rateCellText), 'ta-rate-formula-cell') +
          hwCell(esc(rp.p), 'ta-num-cell') +
        '</tr>'
      );
    }

    return (
      '<tr>' +
        hwCell(dateCellHtml, 'ta-date-cell') +
        (e.train ? hwCell(esc(e.train), '') : '<td></td>') +
        (e.timeLeft ? hwCell(esc(e.timeLeft), '') : '<td></td>') +
        (e.timeArr ? hwCell(esc(e.timeArr), '') : '<td></td>') +
        (e.from ? hwCell(esc(e.from), '') : '<td></td>') +
        (e.to ? hwCell(esc(e.to), '') : '<td></td>') +
        (e.km ? hwCell(esc(e.km), '') : '<td></td>') +
        hwCell(esc(daysLabel), '') +
        (e.object ? hwCell(esc(e.object), 'ta-obj-cell') : '<td class="ta-obj-cell"></td>') +
        hwCell(esc(rateCellText), 'ta-rate-formula-cell') +
        hwCell(esc(rp.p), 'ta-num-cell') +
      '</tr>'
    );
  }

  function buildEmptyRowHtml() {
    return '<tr><td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>';
  }

  function renderPaperPreview(sortedList, sum) {
    var paper = $('taPaperPreview');
    var railway = $('taRailway').value.trim() || 'Northern Railway (NR)';
    var deptRaw = $('taDept').value.trim();
    var pfNoRaw = $('taPfNo').value.trim();
    var billUnitRaw = $('taBillUnit').value.trim();
    var hqRaw = $('taHq').value.trim();
    var empNameRaw = $('taName').value.trim();
    var monthRaw = $('taMonth').value.trim();
    var yearRaw = $('taYear').value.trim();
    var desigRaw = $('taDesignation').value.trim();
    var payRaw = $('taPay').value.trim();
    var levelRaw = $('taLevel').value.trim();
    var doaRaw = $('taDoa').value.trim() ? formatFullDate($('taDoa').value.trim()) : '';
    var rulesRaw = $('taRules').value.trim();
    var mode = $('taTravelMode').value || 'Rail';

    var p1Cap = 24;
    var p2Cap = 10;
    var p1Rows = sortedList.slice(0, p1Cap);
    var p2Rows = sortedList.slice(p1Cap);

    var p1Body = '';
    for (var i = 0; i < p1Cap; i++) {
      p1Body += p1Rows[i] ? buildJournalRowHtml(p1Rows[i]) : buildEmptyRowHtml();
    }

    var p2RowCount = Math.max(p2Cap, p2Rows.length);
    var p2Body = '';
    for (var j = 0; j < p2RowCount; j++) {
      p2Body += p2Rows[j] ? buildJournalRowHtml(p2Rows[j]) : buildEmptyRowHtml();
    }

    var journalRp = splitRsPaise(sum.journalTotal);
    var grandRp = splitRsPaise(sum.grandTotal);
    var wordsStr = numberToIndianWords(sum.grandTotal);

    var row30Calc = sum.c30 ? ('Rs. ' + sum.dailyRate + ' &times; 30% &times; ' + sum.c30 + ' = ' + sum.amt30.toFixed(2)) : 'Rs. 0.00';
    var row70Calc = sum.c70 ? ('Rs. ' + sum.dailyRate + ' &times; 70% &times; ' + sum.c70 + ' = ' + sum.amt70.toFixed(2)) : 'Rs. 0.00';
    var row100Calc = sum.c100 ? ('Rs. ' + sum.dailyRate + ' &times; 100% &times; ' + sum.c100 + ' = ' + sum.amt100.toFixed(2)) : 'Rs. 0.00';

    paper.innerHTML =
      // ---- PAGE 1 ----
      '<div class="ta-a4-page">' +
        '<div class="ta-doc-header">' +
          '<div class="ta-doc-title">' + esc(railway) + '</div>' +
          '<div class="ta-doc-subtitle">Travelling Allowance Journal</div>' +
          '<p class="ta-meta-line">Dept. ' + fillSpan(deptRaw, '....................') + ' &nbsp;PF NO. ' + fillSpan(pfNoRaw, '....................') + ' &nbsp;BILL UNIT NO. ' + fillSpan(billUnitRaw, '................') + ' &nbsp;Headquarters- ' + fillSpan(hqRaw, '..........') + '</p>' +
          '<p class="ta-meta-line">Journal of duties performed by ' + fillSpan(empNameRaw, '............................................') + ' for which allowance for month ' + fillSpan(monthRaw, '..........') + ' year ' + fillSpan(yearRaw, '......') + ' is claimed.</p>' +
          '<p class="ta-meta-line">Designation ' + fillSpan(desigRaw, '................') + ' &nbsp;Pay ' + fillSpan(payRaw, '............') + ' in Level - ' + fillSpan(levelRaw, '....') + ' of 7th CPC. &nbsp;Date of Appointment ' + fillSpan(doaRaw, '..............') + '</p>' +
          '<p class="ta-meta-line">Rules by which governed ' + fillSpan(rulesRaw, '........................................') + '</p>' +
        '</div>' +
        '<table class="ta-journal-tbl">' +
          buildJournalTableHeader() +
          '<tbody>' + p1Body + '</tbody>' +
        '</table>' +
        '<div class="ta-pto">PTO...</div>' +
      '</div>' +

      // ---- PAGE 2 ----
      '<div class="ta-a4-page ta-page-break">' +
        '<table class="ta-journal-tbl">' +
          buildJournalTableHeader() +
          '<tbody>' +
            p2Body +
            '<tr class="ta-total-row">' +
              '<td colspan="9" class="ta-words-cell">Total (in words):- ( <span class="ta-handwritten">Rupees ' + esc(wordsStr) + '</span> ) only</td>' +
              '<td class="ta-num-cell ta-handwritten">Rs. ' + esc(journalRp.rs) + '</td>' +
              '<td class="ta-num-cell ta-handwritten">' + esc(journalRp.p) + '</td>' +
            '</tr>' +
          '</tbody>' +
        '</table>' +

        '<div class="ta-summary-heading">Summary</div>' +
        '<table class="ta-summary-tbl">' +
          '<thead>' +
            '<tr>' +
              '<th style="width:184pt;">Percentage</th>' +
              '<th style="width:170pt;">No. of total days</th>' +
              '<th style="width:181pt;">Rate of TA &times; Days = Amount</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            '<tr>' +
              '<td>30%</td>' +
              '<td class="ta-handwritten">' + sum.c30 + '</td>' +
              '<td class="ta-handwritten">' + row30Calc + '</td>' +
            '</tr>' +
            '<tr>' +
              '<td>70%</td>' +
              '<td class="ta-handwritten">' + sum.c70 + '</td>' +
              '<td class="ta-handwritten">' + row70Calc + '</td>' +
            '</tr>' +
            '<tr>' +
              '<td>100%</td>' +
              '<td class="ta-handwritten">' + sum.c100 + '</td>' +
              '<td class="ta-handwritten">' + row100Calc + '</td>' +
            '</tr>' +
            '<tr>' +
              '<td colspan="2">Total Contingent Amount:-</td>' +
              '<td class="ta-handwritten">Rs. ' + sum.contingent.toFixed(2) + '</td>' +
            '</tr>' +
            '<tr>' +
              '<td colspan="2"><strong>Total Amount Rs.</strong></td>' +
              '<td class="ta-handwritten"><strong>Rs. ' + grandRp.rs + '.' + grandRp.p + '</strong></td>' +
            '</tr>' +
          '</tbody>' +
        '</table>' +

        '<div class="ta-cert-block">' +
          '<p><strong>It is certified that-</strong></p>' +
          '<ol>' +
            '<li>The T.A claimed by me has not been claimed before and will not be claimed hereafter.</li>' +
            '<li>Conveyance charges claimed have actually been spent by me and according to local municipal rates.</li>' +
            '<li>Cheapest mode of conveyance was utilized.</li>' +
            '<li>The journey performed by road for which conveyance has been claimed was over 1.6 km.</li>' +
          '</ol>' +
          '<div class="ta-sig-right">' +
            '<div class="ta-sig-line">..................................................</div>' +
            '<div>Signature of Officer Claiming T.A.</div>' +
          '</div>' +
          '<p class="ta-duty-cert">' +
            'I hereby certify that Sh. ' + fillSpan(empNameRaw, '............................................') + ' was absent on duty from his head ' +
            'quarter station during the period charged for in the bill on Railway business and that the officer performed the ' +
            'journey by <span class="ta-handwritten">' + esc(mode) + '</span> and was allowed/not allowed free Pass of locomotion at the expense of ' +
            'Government local fund of Indian State.' +
          '</p>' +
          '<div class="ta-bottom-sigs">' +
            '<div>' +
              '<div>Countersigned</div>' +
              '<div style="margin-top:38pt;">Controlling Officer</div>' +
            '</div>' +
            '<div style="text-align:center;">' +
              '<div class="ta-sig-line">..................................................</div>' +
              '<div>Signature of Head of the Office</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
      '</div>';
  }

  function renderAll() {
    var sorted = getSortedJourneys();
    var sum = computeSummary(sorted);
    renderEntriesList(sorted);
    renderSummaryCards(sum);
    renderPaperPreview(sorted, sum);
  }

  // ---- Toggle Preview Visibility ----
  $('taPreviewToggleBtn').addEventListener('click', function () {
    previewVisible = !previewVisible;
    $('taPreviewCard').hidden = !previewVisible;
    this.textContent = previewVisible ? 'Hide TA Bill Preview' : 'Show TA Bill Preview';
    this.setAttribute('aria-expanded', String(previewVisible));
  });

  // ---- Download as PDF (Strictly checks all mandatory fields before downloading) ----
  $('taDownloadPdfBtn').addEventListener('click', function () {
    var errors = validateEmployeeDetails();
    if (!journeys.length) {
      errors.push('At least one journey entry is mandatory before downloading the TA bill PDF.');
    }

    if (errors.length) {
      showValidationPopup('Cannot Download TA Bill PDF', errors);
      return;
    }

    var wasHidden = !previewVisible;
    if (wasHidden) {
      previewVisible = true;
      $('taPreviewCard').hidden = false;
      $('taPreviewToggleBtn').textContent = 'Hide TA Bill Preview';
      $('taPreviewToggleBtn').setAttribute('aria-expanded', 'true');
    }

    renderAll();

    var month = $('taMonth').value.trim() || 'TA';
    var year = $('taYear').value.trim() || '2026';
    var docTitle = ('TA_Journal_' + month + '_' + year).replace(/\s+/g, '_');
    var prevTitle = document.title;

    function triggerSamePagePrint() {
      var printStage = document.getElementById('taPrintStage');
      if (!printStage) {
        printStage = document.createElement('div');
        printStage.id = 'taPrintStage';
        document.body.appendChild(printStage);
      }
      printStage.innerHTML = $('taPaperPreview').innerHTML;
      document.body.classList.add('ta-printing-bill');
      document.title = docTitle;

      var cleaned = false;
      function cleanupPrint() {
        if (cleaned) return;
        cleaned = true;
        document.body.classList.remove('ta-printing-bill');
        document.title = prevTitle;
        if (printStage && printStage.parentNode) {
          printStage.innerHTML = '';
        }
        window.removeEventListener('afterprint', cleanupPrint);
      }

      window.addEventListener('afterprint', cleanupPrint);
      window.print();
      setTimeout(cleanupPrint, 1200);
    }

    var printWin = null;
    try {
      printWin = window.open('', '_blank', 'width=900,height=700');
    } catch (e) {
      printWin = null;
    }

    if (!printWin || !printWin.document) {
      triggerSamePagePrint();
      return;
    }

    var paperHtml = $('taPaperPreview').innerHTML;
    var printCss =
      '@page { size: A4 portrait; margin: 12.7mm 9mm 12.7mm 12.7mm; }' +
      '* { box-sizing: border-box; }' +
      'body { margin: 0; padding: 0; background: #fff; color: #000; font-family: "Times New Roman", Times, serif; font-size: 10.5pt; line-height: 1.3; -webkit-print-color-adjust: exact; print-color-adjust: exact; }' +
      '.ta-a4-page { width: 100%; background: #fff; color: #000; }' +
      '.ta-page-break { page-break-before: always; break-before: page; }' +
      '.ta-doc-header { margin-bottom: 8pt; }' +
      '.ta-doc-title { text-align: center; font-size: 13pt; font-weight: 700; }' +
      '.ta-doc-subtitle { text-align: center; font-size: 11.5pt; font-weight: 700; margin-bottom: 6pt; }' +
      '.ta-meta-line { margin: 3pt 0; font-size: 10.5pt; }' +
      '.ta-fill { font-weight: 700; border-bottom: 1px dotted #000; padding: 0 3pt; }' +
      '.ta-handwritten, .ta-fill.is-filled, table.ta-journal-tbl td.ta-handwritten, table.ta-summary-tbl td.ta-handwritten, table.ta-journal-tbl tr.ta-total-row td .ta-handwritten { font-family: "Caveat", "Kalam", "Segoe Print", "Bradley Hand", cursive !important; color: #143d99 !important; font-weight: 600 !important; letter-spacing: 0.25pt; }' +
      '.ta-fill.is-filled { font-size: 12pt; padding: 0 4pt; }' +
      'table.ta-journal-tbl td.ta-handwritten { font-size: 11.2pt; line-height: 1.08; }' +
      'table.ta-journal-tbl td.ta-handwritten.ta-date-cell { font-size: 10.4pt; line-height: 1.05; }' +
      'table.ta-journal-tbl td.ta-handwritten.ta-obj-cell { font-size: 11pt; line-height: 1.1; }' +
      'table.ta-journal-tbl td.ta-handwritten.ta-rate-formula-cell { font-size: 10pt; line-height: 1.05; }' +
      'table.ta-summary-tbl td.ta-handwritten { font-size: 11.5pt; }' +
      'table.ta-journal-tbl, table.ta-summary-tbl { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 9pt; }' +
      'table.ta-journal-tbl th, table.ta-journal-tbl td, table.ta-summary-tbl th, table.ta-summary-tbl td { border: 0.75pt solid #000; padding: 2.5pt 3pt; text-align: center; vertical-align: middle; word-wrap: break-word; }' +
      'table.ta-journal-tbl td { height: 21.5pt; }' +
      'table.ta-journal-tbl td.ta-date-cell { font-size: 8.2pt; line-height: 1.15; }' +
      'table.ta-journal-tbl td.ta-obj-cell { text-align: left; font-size: 8.5pt; }' +
      'table.ta-journal-tbl td.ta-rate-formula-cell { text-align: right; font-size: 7.8pt; line-height: 1.15; }' +
      'table.ta-journal-tbl td.ta-num-cell { text-align: right; }' +
      'table.ta-journal-tbl tr.ta-total-row td.ta-words-cell { text-align: left; font-size: 9.5pt; padding-left: 5pt; }' +
      '.ta-pto { text-align: right; font-size: 9pt; margin-top: 3pt; }' +
      '.ta-summary-heading { text-align: center; font-weight: 700; font-size: 10.5pt; margin: 10pt 0 3pt; }' +
      'table.ta-summary-tbl td, table.ta-summary-tbl th { height: 15pt; font-size: 9.5pt; }' +
      '.ta-cert-block { margin-top: 10pt; font-size: 10pt; line-height: 1.38; }' +
      '.ta-cert-block p { margin: 4pt 0; }' +
      '.ta-cert-block ol { margin: 4pt 0 8pt; padding-left: 18pt; }' +
      '.ta-cert-block li { margin-bottom: 2pt; }' +
      '.ta-sig-right { text-align: right; margin: 18pt 0 12pt; }' +
      '.ta-sig-line { letter-spacing: 0.5pt; }' +
      '.ta-duty-cert { text-align: justify; margin: 8pt 0; }' +
      '.ta-bottom-sigs { display: flex; justify-content: space-between; align-items: flex-end; margin-top: 16pt; }';

    try {
      printWin.document.open();
      printWin.document.write(
        '<!doctype html><html><head><meta charset="utf-8"><title>' + esc(docTitle) + '</title>' +
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Caveat:wght@500;600;700&family=Kalam:wght@400;700&display=swap">' +
        '<style>' + printCss + '</style></head><body>' +
        paperHtml +
        '<script>setTimeout(function () { try { window.focus(); window.print(); } catch (e) {} }, 350);<\/script>' +
        '</body></html>'
      );
      printWin.document.close();
    } catch (e) {
      try { printWin.close(); } catch (x) {}
      triggerSamePagePrint();
    }
  });

  // Clear field error highlight live when user fills/updates a highlighted field
  EMP_LOCKABLE_IDS.concat(['taDailyRate']).forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('input', function () {
      var wrap = el.closest('.field');
      if (wrap && wrap.classList.contains('needs-fill')) validateEmployeeDetails(true);
    });
    el.addEventListener('change', function () {
      var wrap = el.closest('.field');
      if (wrap && wrap.classList.contains('needs-fill')) validateEmployeeDetails(true);
    });
  });

  TRAVEL_FIELD_IDS.concat(NONTRAVEL_FIELD_IDS).forEach(function (id) {
    var el = $(id);
    if (!el) return;
    el.addEventListener('input', function () {
      var wrap = el.closest('.field');
      if (wrap && wrap.classList.contains('needs-fill')) validateCurrentEntryForm(true);
    });
    el.addEventListener('change', function () {
      var wrap = el.closest('.field');
      if (wrap && wrap.classList.contains('needs-fill')) validateCurrentEntryForm(true);
    });
  });

  // ---- Initialize ----
  loadEmployeeDetails();
  resetEntryForm('travel');
  renderAll();
})();
