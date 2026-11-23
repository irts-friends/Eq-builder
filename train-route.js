(function () {
  var RAILRADAR_API_KEY = "rg_c3e59866ad0a47e19d7908196f059c7b";
  var API_BASE = "https://api.railradar.in/v1/trains/";
  var CACHE_DAYS = 7;
  var TIMEOUT_MS = 20000;

  var routeSection = document.getElementById("trainRouteSection");
  var resultsBox = document.getElementById("trrResults");
  var dcmBtn = document.getElementById("dcmBtn");
  var trainInput = document.getElementById("train");

  if (!routeSection || !resultsBox || !trainInput) return;

  var isRouteVisible = false;
  var loadedTrainNum = "";
  var loadedRouteData = null;

  routeSection.hidden = true;

  var triggerBtn = document.createElement("button");
  triggerBtn.type = "button";
  triggerBtn.id = "trrShowBtn";
  triggerBtn.className = "btn alt wide trr-trigger";
  triggerBtn.textContent = "Show Train Route";
  triggerBtn.setAttribute("aria-expanded", "false");
  if (dcmBtn && dcmBtn.parentNode) {
    dcmBtn.parentNode.insertBefore(triggerBtn, dcmBtn.nextSibling);
  } else {
    routeSection.firstElementChild.insertBefore(triggerBtn, resultsBox);
  }

  function syncToggleLabel(busy) {
    if (busy) return;
    var hasContent = !!(loadedRouteData || resultsBox.textContent.trim());
    if (isRouteVisible && hasContent) {
      triggerBtn.textContent = "Hide Train Route";
      triggerBtn.setAttribute("aria-expanded", "true");
    } else {
      triggerBtn.textContent = "Show Train Route";
      triggerBtn.setAttribute("aria-expanded", "false");
    }
  }

  function setRouteVisible(visible, busy) {
    isRouteVisible = !!visible;
    routeSection.hidden = !isRouteVisible;
    syncToggleLabel(!!busy);
  }

  function makeEl(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }

  function makeMsg(kind, text) {
    return makeEl("div", "trr-msg " + (kind === "info" ? "trr-msg-info" : "trr-msg-err"), text);
  }

  function showNodes() {
    resultsBox.textContent = "";
    for (var i = 0; i < arguments.length; i++) {
      if (arguments[i]) resultsBox.appendChild(arguments[i]);
    }
    setRouteVisible(true, triggerBtn.disabled);
  }

  function setLoading(isLoading) {
    triggerBtn.disabled = isLoading;
    triggerBtn.textContent = "";
    if (isLoading) {
      triggerBtn.appendChild(makeEl("span", "trr-spin"));
      triggerBtn.appendChild(document.createTextNode("Loading route..."));
    } else {
      syncToggleLabel(false);
    }
  }

  function lsGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function lsSet(key, val) {
    try {
      window.localStorage.setItem(key, val);
    } catch (e) {}
  }

  function readCache(num) {
    var raw = lsGet("trr_cache_" + num);
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed.ts === "number" && parsed.data && (Date.now() - parsed.ts < CACHE_DAYS * 86400000)) {
        return parsed.data;
      }
    } catch (e) {}
    return null;
  }

  function writeCache(num, data) {
    lsSet("trr_cache_" + num, JSON.stringify({ ts: Date.now(), data: data }));
  }

  function extractTrainNumber(rawVal) {
    if (!rawVal) return "";
    var trimmed = String(rawVal).trim();
    if (!trimmed) return "";
    var match = trimmed.match(/(\d{4,5})/);
    return match ? match[1] : trimmed;
  }

  function timeRow(label, timeStr, dayNum) {
    if (!timeStr) return null;
    var row = makeEl("div", "trr-time-line");
    row.appendChild(makeEl("span", "trr-lbl", label));
    row.appendChild(document.createTextNode(String(timeStr)));
    if (typeof dayNum === "number" && dayNum > 1) {
      row.appendChild(makeEl("span", "trr-daytag", "Day " + dayNum));
    }
    return row;
  }

  function normalizeRouteData(body, fallbackNum) {
    var payload = body && body.data ? body.data : null;
    if (!payload) return null;
    var rawTrain = payload.train || payload;
    var rawStops = payload.route || payload.stops || payload.schedule || (rawTrain && rawTrain.route) || [];
    if (!Array.isArray(rawStops)) rawStops = [];

    var stops = rawStops
      .filter(function (stop) { return stop && stop.isHalt !== false; })
      .map(function (stop, idx) {
        var st = stop.station || {};
        var name = st.name || stop.stationName || stop.name || "";
        var code = st.code || stop.stationCode || stop.code || "";
        return {
          sequence: typeof stop.sequence === "number" ? stop.sequence : (idx + 1),
          station: {
            name: String(name || "Unknown Station"),
            code: String(code || "")
          },
          platform: stop.platform != null && String(stop.platform).trim() !== "" ? String(stop.platform).trim() : "",
          arrival: idx === 0 ? "" : (stop.arrival ? String(stop.arrival) : ""),
          arrivalDay: typeof stop.arrivalDay === "number" ? stop.arrivalDay : 1,
          departure: stop.departure ? String(stop.departure) : "",
          departureDay: typeof stop.departureDay === "number" ? stop.departureDay : 1,
          distance: typeof stop.distance === "number" ? stop.distance : null
        };
      });

    var trainNum = (rawTrain && (rawTrain.number || rawTrain.trainNumber)) || fallbackNum;
    var trainName = (rawTrain && (rawTrain.name || rawTrain.trainName)) || "";
    var trainType = (rawTrain && rawTrain.type) || "";
    var totalDist = (rawTrain && typeof rawTrain.distance === "number") ? rawTrain.distance : null;
    var runDays = (rawTrain && Array.isArray(rawTrain.runDays)) ? rawTrain.runDays.map(function (d) { return String(d).toLowerCase(); }) : [];
    var srcObj = (rawTrain && rawTrain.source) || null;
    var dstObj = (rawTrain && rawTrain.destination) || null;

    return {
      train: {
        number: String(trainNum),
        name: String(trainName),
        type: String(trainType),
        distance: totalDist,
        runDays: runDays,
        source: srcObj && (srcObj.name || srcObj.code) ? { name: String(srcObj.name || srcObj.code), code: String(srcObj.code || "") } : null,
        destination: dstObj && (dstObj.name || dstObj.code) ? { name: String(dstObj.name || dstObj.code), code: String(dstObj.code || "") } : null
      },
      route: stops
    };
  }

  function renderRoute(data, num) {
    if (!data || !Array.isArray(data.route) || !data.route.length) {
      loadedRouteData = null;
      loadedTrainNum = "";
      showNodes(makeMsg("err", "No halting stations found for this train."));
      return;
    }

    loadedTrainNum = num || (data.train && data.train.number) || "";
    loadedRouteData = data;

    var t = data.train || {};
    var route = data.route;
    var lastIdx = route.length - 1;
    var frag = document.createDocumentFragment();

    var summaryCard = makeEl("div", "trr-card");
    var titleRow = makeEl("div", "trr-title-row");
    var headingText = (t.number || "") + (t.name ? " · " + t.name : "");
    titleRow.appendChild(makeEl("h3", "trr-train-title", headingText || "Train Route"));
    if (t.type) {
      titleRow.appendChild(makeEl("span", "trr-badge", t.type));
    }
    summaryCard.appendChild(titleRow);

    var metaParts = [route.length + " halting station" + (route.length === 1 ? "" : "s")];
    if (typeof t.distance === "number") {
      metaParts.push(Math.round(t.distance) + " km");
    }
    summaryCard.appendChild(makeEl("div", "trr-meta", metaParts.join(" · ")));

    var srcName = (t.source && t.source.name) || route[0].station.name;
    var dstName = (t.destination && t.destination.name) || route[lastIdx].station.name;

    var endsGrid = makeEl("div", "trr-ends");
    var srcBox = makeEl("div", "trr-end trr-end-src");
    srcBox.appendChild(makeEl("span", "trr-end-lbl", "Source"));
    srcBox.appendChild(makeEl("div", "trr-end-val", srcName));
    endsGrid.appendChild(srcBox);

    var dstBox = makeEl("div", "trr-end trr-end-dst");
    dstBox.appendChild(makeEl("span", "trr-end-lbl", "Destination"));
    dstBox.appendChild(makeEl("div", "trr-end-val", dstName));
    endsGrid.appendChild(dstBox);
    summaryCard.appendChild(endsGrid);

    if (Array.isArray(t.runDays) && t.runDays.length) {
      var daysRow = makeEl("div", "trr-days");
      daysRow.appendChild(makeEl("span", "trr-days-lbl", "Runs on"));
      var dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
      for (var d = 0; d < dayKeys.length; d++) {
        var dk = dayKeys[d];
        var isOn = t.runDays.indexOf(dk) > -1;
        daysRow.appendChild(makeEl("span", "trr-day" + (isOn ? " trr-day-on" : ""), dk));
      }
      summaryCard.appendChild(daysRow);
    }

    frag.appendChild(summaryCard);

    var timelineCard = makeEl("div", "trr-card");
    var ol = makeEl("ol", "trr-route");

    for (var i = 0; i < route.length; i++) {
      var stop = route[i];
      var isFirst = i === 0;
      var isLast = i === lastIdx;
      var liCls = "trr-stop" + (isFirst ? " trr-stop-first" : "") + (isLast ? " trr-stop-last" : "");
      var li = makeEl("li", liCls);

      var infoCol = makeEl("div");
      var stHeading = makeEl("div", "trr-st-name", stop.station.name);
      if (stop.station.code) {
        stHeading.appendChild(makeEl("span", "trr-code", stop.station.code));
      }
      if (isFirst) {
        stHeading.appendChild(makeEl("span", "trr-tag trr-tag-src", "Source"));
      }
      if (isLast) {
        stHeading.appendChild(makeEl("span", "trr-tag trr-tag-dst", "Destination"));
      }
      infoCol.appendChild(stHeading);

      var details = [];
      if (typeof stop.distance === "number") {
        details.push(stop.distance + " km");
      }
      if (stop.platform) {
        details.push("PF " + stop.platform);
      }
      if (details.length) {
        infoCol.appendChild(makeEl("div", "trr-sub", details.join(" · ")));
      }
      li.appendChild(infoCol);

      var timeCol = makeEl("div", "trr-times");
      var arrNode = isFirst ? null : timeRow("Arr", stop.arrival, stop.arrivalDay);
      var depNode = isLast ? null : timeRow("Dep", stop.departure, stop.departureDay);
      if (arrNode) timeCol.appendChild(arrNode);
      if (depNode) timeCol.appendChild(depNode);
      if (arrNode || depNode) {
        li.appendChild(timeCol);
      }

      ol.appendChild(li);
    }

    timelineCard.appendChild(ol);
    frag.appendChild(timelineCard);

    resultsBox.textContent = "";
    resultsBox.appendChild(frag);
    setRouteVisible(true, triggerBtn.disabled);
  }

  function fetchWithFallback(num, signal) {
    function attempt(useQueryKey) {
      var query = ["haltsOnly=true"];
      var init = { signal: signal };
      if (useQueryKey) {
        query.push("apiKey=" + encodeURIComponent(RAILRADAR_API_KEY));
      } else {
        init.headers = { "Authorization": "Bearer " + RAILRADAR_API_KEY };
      }
      var url = API_BASE + encodeURIComponent(num) + "?" + query.join("&");
      return fetch(url, init).then(function (resp) {
        return resp.text().then(function (rawText) {
          var json = null;
          try {
            json = JSON.parse(rawText);
          } catch (parseErr) {}
          return { status: resp.status, body: json };
        });
      });
    }

    return attempt(false).catch(function (err) {
      if (err && err.name === "AbortError") throw err;
      return attempt(true);
    });
  }

  function handleLookup() {
    var trimmed = trainInput.value.trim();
    if (!trimmed) {
      showNodes(makeMsg("err", "No train number found. Enter or parse a 4- or 5-digit train number first."));
      return;
    }

    var num = extractTrainNumber(trimmed);
    if (!/^\d{4,5}$/.test(num)) {
      showNodes(makeMsg("err", "No train number found. Please provide a valid 4- or 5-digit train number."));
      return;
    }

    // Toggle hide if already showing route for this exact train number
    if (isRouteVisible && loadedRouteData && loadedTrainNum === num) {
      setRouteVisible(false, false);
      return;
    }

    // Reuse already-fetched data in memory without calling the API again
    if (loadedRouteData && loadedTrainNum === num) {
      renderRoute(loadedRouteData, num);
      return;
    }

    // Reuse 7-day localStorage cache without calling the API again
    var cached = readCache(num);
    if (cached) {
      renderRoute(cached, num);
      return;
    }

    if (!RAILRADAR_API_KEY) {
      showNodes(makeMsg("err", "RailRadar API key is not configured (RAILRADAR_API_KEY)."));
      return;
    }

    setLoading(true);
    showNodes(makeMsg("info", "Fetching halting stations for train " + num + "..."));

    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, TIMEOUT_MS);

    fetchWithFallback(num, controller.signal)
      .then(function (res) {
        var body = res.body;
        if (res.status === 200 && body && body.success !== false && body.data) {
          var normalized = normalizeRouteData(body, num);
          if (!normalized || !normalized.route.length) {
            showNodes(makeMsg("err", "No halting station data returned for train " + num + "."));
            return;
          }
          writeCache(num, normalized);
          renderRoute(normalized, num);
          return;
        }

        var statusMessages = {
          400: "Invalid train number (400).",
          401: "Invalid or unauthorized API key (401).",
          404: "Train " + num + " not found (404).",
          429: "Rate limit or quota reached (429). Please try again later."
        };
        var errText = statusMessages[res.status] ||
          (body && body.error && body.error.message) ||
          ("Could not fetch route (HTTP " + res.status + ").");
        showNodes(makeMsg("err", errText));
      })
      .catch(function (err) {
        if (err && err.name === "AbortError") {
          showNodes(makeMsg("err", "Request timed out after 20 seconds."));
        } else {
          showNodes(makeMsg("err", "Network or CORS error while fetching train route."));
        }
      })
      .then(function () {
        clearTimeout(timer);
        setLoading(false);
      });
  }

  function resetRouteView() {
    loadedTrainNum = "";
    loadedRouteData = null;
    resultsBox.textContent = "";
    triggerBtn.disabled = false;
    setRouteVisible(false, false);
    triggerBtn.textContent = "Show Train Route";
    triggerBtn.setAttribute("aria-expanded", "false");
  }

  triggerBtn.addEventListener("click", handleLookup);

  var clearPdfBtn = document.getElementById("clearPdf");
  var pdfFileInput = document.getElementById("pdfFile");
  var pnrInput = document.getElementById("pnr");
  var smsInput = document.getElementById("sms");
  var sampleBtn = document.getElementById("sample");
  var clearAllBtn = document.getElementById("clearSms");

  if (clearPdfBtn) {
    clearPdfBtn.addEventListener("click", resetRouteView);
  }
  if (pdfFileInput) {
    pdfFileInput.addEventListener("change", resetRouteView);
  }
  if (pnrInput) {
    pnrInput.addEventListener("input", resetRouteView);
  }
  if (smsInput) {
    smsInput.addEventListener("input", resetRouteView);
  }
  if (sampleBtn) {
    sampleBtn.addEventListener("click", resetRouteView);
  }
  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", resetRouteView);
  }
  if (trainInput) {
    trainInput.addEventListener("input", function () {
      var curNum = extractTrainNumber(trainInput.value.trim());
      if (curNum !== loadedTrainNum) {
        resetRouteView();
      }
    });
  }
})();
