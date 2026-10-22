// RTK Atlas map + panel logic.
(function () {
  // ---------- Map ----------
  // No basemap tiles. The CARTO service this used started demanding an API key and
  // stamped "API KEY REQUIRED" across the map. The state shapes are the whole point
  // here, and drawing them on a plain background needs no third party at all, which
  // also means the page works offline and from a file:// path.
  const map = L.map("map", {
    scrollWheelZoom: true, attributionControl: false,
    zoomSnap: 0.25, minZoom: 1.5, maxZoom: 8, worldCopyJump: false
  }).setView([39.5, -96.5], 3.75);

  // Declared here rather than with the rest of the mode code: the layers below are
  // styled through polyStyle, which reads both while it builds them.
  let mode = "networks";

// Both of these are read by polyStyle, which runs while the layers below are built, so
// they have to be declared before those layers exist.
const HIDDEN = { fillOpacity: 0, opacity: 0, weight: 0 };
let drilledInto = null;   // country whose regions are currently on screen
  let service = SERVICES[0];

  // Countries first, as the backdrop. Without this the state shapes float on grey
  // with no coastline to place them against, which is what the tile layer used to do.
  const countryStyle = feature => polyStyle(feature.properties.name, false);

  let selected = null;
  function select(layer, style) {
    if (selected) {
      try { (selected._isState ? geo : selected._isSub ? subLayer : world).resetStyle(selected); } catch (e) {}
    }
    selected = layer;
    layer.setStyle(style);
  }

  const world = L.geoJson(WORLD, {
    style: countryStyle,
    onEachFeature: (feature, layer) => {
      const name = feature.properties.name;
      layer.bindTooltip(name, { sticky: true });
      layer.on("mouseover", () => layer.setStyle({ fillOpacity: 0.75, weight: 1.6 }));
      layer.on("mouseout", () => { if (layer !== selected) world.resetStyle(layer); });
      layer.on("click", e => {
        L.DomEvent.stopPropagation(e);
        if (name === "United States of America") { setView("usa"); return; }
        select(layer, { fillOpacity: 0.85, weight: 2, color: "#171717" });
        showCountry(name);
        loadSubdivisions(name);   // drop into its regions when we have them
      });
    }
  }).addTo(map);

  function stateStyle(feature) { return polyStyle(feature.properties.name, true); }

  const geo = L.geoJson(US_STATES, {
    style: stateStyle,
    onEachFeature: (feature, layer) => {
      layer._isState = true;
      layer.bindTooltip(feature.properties.name, { sticky: true });
      layer.on("mouseover", () => layer.setStyle({ fillOpacity: 0.85, weight: 2 }));
      layer.on("mouseout", () => { if (layer !== selected) geo.resetStyle(layer); });
      layer.on("click", e => {
        L.DomEvent.stopPropagation(e);
        select(layer, { fillOpacity: 0.9, weight: 2.5, color: "#171717" });
        showState(feature.properties.name);
      });
    }
  });

  // US states only make sense once you are looking at the US, and they would otherwise
  // sit on top of every country click target.
  function setView(which) {
    clearSubdivisions();
    document.querySelectorAll("[data-view]").forEach(b => b.classList.toggle("on", b.dataset.view === which));
    if (which === "usa") {
      geo.addTo(map);
      map.invalidateSize();
      map.fitBounds([[24.5, -125], [49.5, -66.5]], { padding: [10, 10] });
      document.getElementById("maphint").textContent = "Click a state for its network and the steps to connect.";
    } else {
      if (map.hasLayer(geo)) map.removeLayer(geo);
      map.setView([25, 5], 1.6);
      document.getElementById("maphint").textContent = "Click any country. Click the US to drop into state detail.";
    }
  }
  document.querySelectorAll("[data-view]").forEach(b =>
    b.addEventListener("click", () => setView(b.dataset.view)));
  // Wait for layout before framing, or fitBounds measures a container that has no height
  // yet and silently leaves the map on the whole world.
  window.__atlasMap = map;       // for debugging in the console
  window.__atlasWorld = world;   // ditto: lets you find a country layer by name
  function frameInitial() { map.invalidateSize(); setView("usa"); }
  if (document.readyState === "complete") frameInitial();
  else window.addEventListener("load", frameInitial);



  // ---------- Subdivisions, fetched only when a country is opened ----------
  // The full admin-1 set is 13 MB across 211 countries, so each country's file loads
  // the first time someone asks for it and stays cached after that.
  let subLayer = null;
  let subCountry = null;

  // We hold correction data per country, not per region. Rather than paint every region
  // the same solid colour, which reads as "checked and all the same", regions are drawn
  // hollow with a dashed edge: visibly not-yet-data.
  // A country-level "mixed" means the answer changes between its regions. Inside one
  // region that is not an answer, it is an admission we have not checked. Downgrade it to
  // "verify" so a region only ever shows one of the four states a region can actually be in.
  function inheritedStatus(country) {
    const d = COUNTRY_DATA[country];
    if (!d || !STATUS_META[d.status]) return null;
    return d.status === "mixed" ? "check" : d.status;
  }

  function subStyle(feature) {
    const country = subCountry || (feature && feature._country);
    const d = feature && REGION_DATA[country] && REGION_DATA[country][feature.properties.name];
    if (d) {
      return { fillColor: STATUS_META[d.status].color, fillOpacity: 0.62,
               color: "#ffffff", weight: 1.1, dashArray: null };
    }
    // Not checked at region level, but we do have a country answer and it applies here, so
    // show that answer rather than a grey hole. Lighter fill and a dashed edge mark it as
    // inherited rather than individually verified.
    const inherited = inheritedStatus(country);
    if (inherited) {
      return { fillColor: STATUS_META[inherited].color, fillOpacity: 0.3,
               color: "#ffffff", weight: 1, dashArray: "3 3" };
    }
    return { fillColor: "#B9C0CC", fillOpacity: 0.18, color: "#6E7681",
             weight: 1, dashArray: "3 3" };
  }

  // The country underneath is a coarser outline than its own subdivisions, so leaving it
  // visible bleeds colour past their edges and, once it is larger than the viewport, its
  // selection stroke gets clipped into a rectangle.
  function hideParent(country) {
    drilledInto = country;          // polyStyle reads this, so every repaint path obeys it
    world.eachLayer(l => {
      if (l.feature.properties.name === country) {
        l.setStyle(HIDDEN);
        // an invisible polygon must not answer the pointer either, or hovering it
        // repaints it back into view
        if (l._path) l._path.style.pointerEvents = "none";
      }
    });
  }
  function showParent() {
    const was = drilledInto;
    drilledInto = null;
    if (!was) return;
    world.eachLayer(l => {
      if (l.feature.properties.name === was) {
        if (l._path) l._path.style.pointerEvents = "";
        world.resetStyle(l);
      }
    });
  }

  function drawSubdivisions(country) {
    if (subLayer) { map.removeLayer(subLayer); subLayer = null; }
    // Showing US states and another country's regions together is two levels of detail
    // competing for the same glance, so the states step back while a country is open.
    if (map.hasLayer(geo)) map.removeLayer(geo);
    if (selected) {               // clear the previous selection's stroke, not just the pointer
      try { (selected._isState ? geo : selected._isSub ? subLayer : world).resetStyle(selected); } catch (e) {}
      selected = null;
    }
    showParent();
    hideParent(country);
    const fc = ADMIN1[country];
    if (!fc) return;
    subCountry = country;
    subLayer = L.geoJson(fc, {
      style: f => subStyle(f),
      onEachFeature: (feature, layer) => {
        const nm = feature.properties.name;
        layer.bindTooltip(nm, { sticky: true });
        layer.on("mouseover", () => layer.setStyle({ fillOpacity: 0.8, weight: 1.8 }));
        layer.on("mouseout", () => { if (layer !== selected) subLayer.resetStyle(layer); });
        layer.on("click", e => {
          L.DomEvent.stopPropagation(e);
          if (selected && selected !== layer) {
            (selected._isState ? geo : selected._isSub ? subLayer : world).resetStyle(selected);
          }
          layer._isSub = true;
          selected = layer;
          layer.setStyle({ fillOpacity: 0.9, weight: 2.2, color: "#171717" });
          showSubdivision(country, nm);
        });
      }
    }).addTo(map);
    map.invalidateSize();
    map.fitBounds(subLayer.getBounds(), { padding: [12, 12], maxZoom: 7 });
    document.getElementById("maphint").textContent =
      (() => {
        const checked = regionCoverage(country), total = fc.features.length;
        return checked
          ? `${country}: ${checked} of ${total} regions checked individually. Solid regions have their own answer; dashed ones take the country answer.`
          : `${country}: dashed regions take the country answer. We have not checked this country region by region.`;
      })();
    setBack(true);
    renderLegend();
  }

  function loadSubdivisions(country) {
    if (ADMIN1[country]) { drawSubdivisions(country); return true; }
    const file = ADMIN1_FILES[country];
    if (!file) return false;
    document.getElementById("maphint").textContent = "Loading " + country + " regions...";
    const sc = document.createElement("script");
    sc.src = "admin1/" + file + ".js?v=1";
    sc.onload = () => drawSubdivisions(country);
    sc.onerror = () => { document.getElementById("maphint").textContent = "Could not load regions for " + country + "."; };
    document.head.appendChild(sc);
    return true;
  }

  function clearSubdivisions() {
    if (subLayer) { map.removeLayer(subLayer); subLayer = null; }
    showParent();
    subCountry = null;
    setBack(false);
    renderLegend();
  }

  function backToWorld() {
    clearSubdivisions();
    if (map.hasLayer(geo)) map.removeLayer(geo);
    map.setView([25, 5], 1.6);
    document.getElementById("maphint").textContent = "Click any country. Click the US to drop into state detail.";
    panel.innerHTML = `<h2>Pick a country</h2><p class="hint">Click anywhere on the map.
      Countries we have checked are coloured; the rest are grey and say so.</p>`;
  }

  function setBack(on) {
    const b = document.getElementById("backbtn");
    if (b) b.style.display = on ? "" : "none";
  }

  const backBtn = document.getElementById("backbtn");
  if (backBtn) backBtn.addEventListener("click", backToWorld);

  // A region inherits the country answer, and says so rather than implying we checked it.
  function showSubdivision(country, region) {
    const rd = REGION_DATA[country] && REGION_DATA[country][region];
    if (rd) {
      panel.innerHTML = `
        <h2>${region}</h2>
        <div class="net" style="margin-bottom:.5rem">${country}</div>
        ${statusLine(rd, "region")}
        <div class="notes">${rd.notes}</div>
        ${rd.network ? `<div class="net">${rd.network}${rd.operator ? " - " + rd.operator : ""}</div>` : ""}
        ${rd.url ? `<a class="netlink" href="${rd.url}" target="_blank" rel="noopener">Operator page</a>` : ""}
        ${workflow(rd, "region")}
        ${connectBlock(rd)}
        ${provenance(rd)}`;
      return;
    }
    const d = COUNTRY_DATA[country];
    const inherited = inheritedStatus(country);
    const varies = d && d.status === "mixed";
    panel.innerHTML = `
      <h2>${region}</h2>
      <div class="net" style="margin-bottom:.5rem">${country}</div>
      ${inherited ? statusLine({ status: inherited }, "region")
                  : `<span class="status-pill" style="background:#9AA1A9">Not checked yet</span>`}
      <div class="notes">${d ? d.notes : "We have not verified this country's networks yet."}
        <br><br><em>${varies
          ? "We have not checked " + region + " on its own, and this country's terms change from region to region, so the national line above will not necessarily hold here. Confirm with the regional operator before quoting."
          : "This is the national picture. We have not checked " + region + " on its own, so confirm locally if the network here is run regionally."}</em></div>
      ${workflow(inherited ? { status: inherited } : { status: "paid" }, "region")}
      ${provenance(d)}`;
  }

  // ---------- Reference stations, off by default ----------
  // Small circles rather than markers: 1,797 pins would bury the choropleth underneath.
  // CORS is deliberately not drawn here. Those stations feed OPUS post-processing and
  // you cannot connect to one for a live fix, so on a map about real-time corrections
  // they were 1,797 dots implying something they do not offer. The data stays in
  // cors.js for the post-processing page.


  const basesLayer = L.layerGroup(COMMUNITY_BASES.map(([mount, lat, lon, desc, fmt, country]) =>
    L.circleMarker([lat, lon], { radius: 3, className: "base-dot", interactive: true })
      .bindTooltip(
        `<b>${mount}</b><br><span class="tt-ok">This is the mountpoint. Enter it as-is.</span>` +
        `<br>Caster rtk2go.com, port 2101` +
        `${desc ? "<br>" + desc : ""}<br>${fmt} · ${country}`, { direction: "top" })
  ));
  // The state networks' own antennas, pulled out of the CORS set by operating agency.
  const AGENCY_TO_STATE = {};
  Object.entries(RTN_STATION_AGENCIES).forEach(([state, agencies]) =>
    agencies.forEach(a => { AGENCY_TO_STATE[a] = state; }));

  const rtnStations = CORS_STATIONS.filter(([id, lat, lon, ag]) => AGENCY_TO_STATE[ag]);
  const rtnLayer = L.layerGroup(rtnStations.map(([id, lat, lon, ag, gnss, st]) => {
    const state = AGENCY_TO_STATE[ag];
    const sd = STATE_DATA[state];
    return L.circleMarker([lat, lon], { radius: 3, className: "rtn-dot", interactive: true,
        color: "#0F4269", weight: 1, fillColor: "#2E7BB0", fillOpacity: 0.9 })
      .bindTooltip(
        `<b>${id}</b> <span class="tt-warn">NGS site ID, not a mountpoint</span>` +
        `<br>${sd && sd.network ? sd.network : state} · ${ag}` +
        `${gnss ? "<br>" + gnss : ""}` +
        `<br><span class="tt-note">Your mountpoint comes from the network's source table once you have an account. With VRS you get one mountpoint for the whole network, not this station.</span>`,
        { direction: "top" });
  }));

  const rtnToggle = document.getElementById("showrtn");
  if (rtnToggle) rtnToggle.addEventListener("change", e => {
    if (e.target.checked) rtnLayer.addTo(map); else map.removeLayer(rtnLayer);
  });

  const basesToggle = document.getElementById("showbases");
  if (basesToggle) basesToggle.addEventListener("change", e => {
    if (e.target.checked) basesLayer.addTo(map); else map.removeLayer(basesLayer);
  });


  // ---------- Modes ----------
  // Each mode answers one question. Switching changes what the polygons mean, which
  // point layers are allowed, and what the legend says, so a colour never has to carry
  // two meanings at once.
  const MODE_TEXT = {
    networks: "Who provides real-time corrections where you work, and on what terms.",
    stations: "Where the physical hardware is. Reference stations are infrastructure, not an entitlement to corrections.",
    coverage: "Whether one particular service reaches you. One service at a time, because their footprints differ."
  };

  function serviceCovers(name, isState) {
    if (service.everywhere) return true;
    if (service.none) return false;
    if (isState) return !(service.excludeStates || []).includes(name);
    return (service.countries || []).includes(name);
  }

  function polyStyle(name, isState) {
    // The country we are inside stays invisible no matter which repaint path we came
    // through. Its 110m outline is coarser than the 10m regions drawn on top of it, so
    // any fill at all bleeds past their edges.
    if (!isState && name === drilledInto) return HIDDEN;
    if (mode === "stations") {
      return { fillColor: "#E4E7EA", fillOpacity: 0.8, color: "#ffffff", weight: isState ? 1 : 0.6 };
    }
    if (mode === "coverage") {
      const on = serviceCovers(name, isState);
      return { fillColor: on ? "#108474" : "#E4E7EA", fillOpacity: on ? 0.5 : 0.75,
               color: "#ffffff", weight: isState ? 1 : 0.6 };
    }
    const d = isState ? STATE_DATA[name] : COUNTRY_DATA[name];
    if (!d) {
      return name === "United States of America"
        ? { fillColor: "#0F4269", fillOpacity: 0.35, color: "#ffffff", weight: 0.8 }
        : { fillColor: "#E4E7EA", fillOpacity: 0.85, color: "#ffffff", weight: 0.6 };
    }
    return { fillColor: STATUS_META[d.status].color, fillOpacity: isState ? 0.62 : 0.5,
             color: "#ffffff", weight: isState ? 1.1 : 0.8 };
  }

  function restyleAll() {
    world.eachLayer(l => l.setStyle(polyStyle(l.feature.properties.name, false)));
    geo.eachLayer(l => l.setStyle(polyStyle(l.feature.properties.name, true)));
    selected = null;
  }

  function setMode(m) {
    mode = m;
    document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("on", b.dataset.mode === m));
    document.getElementById("modehint").textContent = MODE_TEXT[m];
    document.getElementById("stationctl").style.display = m === "stations" ? "" : "none";
    document.getElementById("stationsblurb").style.display = m === "stations" ? "" : "none";
    document.getElementById("servicectl").style.display = m === "coverage" ? "" : "none";
    if (m !== "stations") {
      map.removeLayer(basesLayer); map.removeLayer(rtnLayer);
      const b = document.getElementById("showbases"), r = document.getElementById("showrtn");
      if (b) b.checked = false;
      if (r) r.checked = false;
    } else {
      // The boxes start ticked in the markup, so testing !checked skipped the add and the
      // mode came up empty. Go by whether the layer is actually on the map.
      // Leaving the mode unticks both boxes, so entering it has to tick them again rather
      // than read their state. Testing the checkbox instead is what left the mode empty.
      const b = document.getElementById("showbases"), r = document.getElementById("showrtn");
      if (b) { b.checked = true; if (!map.hasLayer(basesLayer)) basesLayer.addTo(map); }
      if (r) { r.checked = true; if (!map.hasLayer(rtnLayer)) rtnLayer.addTo(map); }
    }
    restyleAll();
    renderLegend();
  }

  function renderLegend() {
    const el = document.getElementById("legend");
    if (mode === "networks") {
      el.innerHTML = Object.values(STATUS_META).map(m =>
        `<span class="key"><span class="swatch" style="background:${m.color}"></span>${m.label}</span>`).join("") +
        `<span class="key"><span class="swatch" style="background:#E4E7EA"></span>Not checked yet</span>` +
        (subLayer ? `<span class="key"><span class="swatch" style="background:#fff;border:1px dashed #6E7681"></span>Dashed: region not checked individually</span>` : "");
    } else if (mode === "stations") {
      el.innerHTML =
        `<span class="key"><span class="swatch" style="background:#2E7BB0"></span>State network station: an antenna run by the agency behind that state's RTN (${rtnStations.length})</span>` +
        `<span class="key"><span class="swatch" style="background:#108474"></span>Community base on RTK2go, free, no guarantee (${COMMUNITY_BASES.length})</span>` +
        `<span class="key" style="color:#777">Harvested ${STATION_DATA_DATE}, not live</span>`;
    } else {
      el.innerHTML = `<span class="key"><span class="swatch" style="background:#108474"></span>${service.name} reaches here</span>
        <span class="key"><span class="swatch" style="background:#E4E7EA"></span>Not covered</span>`;
    }
  }

  document.querySelectorAll("[data-mode]").forEach(b =>
    b.addEventListener("click", () => setMode(b.dataset.mode)));

  const servicePicker = document.getElementById("servicepick");
  if (servicePicker) {
    servicePicker.innerHTML = SERVICES.map((sv, i) =>
      `<option value="${i}">${sv.name}</option>`).join("");
    servicePicker.addEventListener("change", e => {
      service = SERVICES[+e.target.value];
      document.getElementById("servicenote").textContent = service.note;
      restyleAll();
      renderLegend();
    });
    document.getElementById("servicenote").textContent = SERVICES[0].note;
  }

  // ---------- Legend ----------
  renderLegend();

  // ---------- State panel ----------
  const panel = document.getElementById("panel");
  // Provenance, stated the same way everywhere. An entry nobody checked should never look
  // like one that was checked: that is how California ended up asserting CRTN "isn't a
  // consumer RTN" when it is a 400-station statewide network.
  function provenance(d) {
    return d && d.verified
      ? `<div class="verified">Checked: ${d.verified}</div>`
      : `<div class="verified unchecked">Not verified. This entry has not been checked against the
         operator, so treat it as a starting point rather than an answer.</div>`;
  }

  function statusLine(d, scope) {
    const meta = STATUS_META[d.status];
    const label = scope === "country" ? meta.label.replace("statewide", "national")
                : scope === "region"  ? (d.status === "check" ? "Not confirmed here - verify"
                                          : meta.label.replace("statewide", "regional"))
                : meta.label;
    return `<span class="status-pill" style="background:${meta.color}">${label}</span>`;
  }

  // What to actually do, which is a different answer depending on what the state has.
  // "How do I connect?" answered with the operator's real caster where they publish one,
  // and answered honestly where they do not: most agencies hand out the address with the
  // account, so saying that is more useful than leaving the question hanging.
  function connectBlock(d) {
    if (!d) return "";
    if (d.caster) {
      return `<div class="casterbox">
        <div class="caster-h">Connection details</div>
        <table class="castertab">
          <tr><td>Caster</td><td><code>${d.caster}</code></td></tr>
          <tr><td>Port</td><td><code>${d.port || 2101}</code></td></tr>
          <tr><td>Mountpoint</td><td>Pick it from the source table once connected</td></tr>
          <tr><td>User and password</td><td>From your account with the operator</td></tr>
        </table>
        ${d.signup ? `<a class="netlink" href="${d.signup}" target="_blank" rel="noopener">Register first</a>` : ""}
      </div>`;
    }
    if (d.status === "free" || d.status === "restricted") {
      return `<div class="casterbox">
        <div class="caster-h">Connection details</div>
        <p class="caster-p">The operator does not publish the caster address openly. You get it with your
        account, along with the username and password, and the mountpoint list comes from the source table
        once you connect. That is normal for national networks and not a sign of a dead service.</p>
        ${d.signup ? `<a class="netlink" href="${d.signup}" target="_blank" rel="noopener">Register with the operator</a>`
                   : d.url ? `<a class="netlink" href="${d.url}" target="_blank" rel="noopener">Operator page</a>` : ""}
      </div>`;
    }
    return "";
  }

  function workflow(d, scope) {
    const what = scope === "country" ? "national network"
               : scope === "region"  ? "regional network"
               : "state network";
    if (d.status === "free") {
      return `<div class="flow flow-go">
        <h3>Your route: use the ${what}</h3>
        <ol>
          <li>Create an account with ${d.operator || "the operator"}${d.signup ? ` on <a href="${d.signup}" target="_blank" rel="noopener">the sign-up page</a>` : ""}. Some are instant, some are approved by a person and take a day or two.</li>
          <li>Collect the four settings: caster address, port, username, password. Several networks issue NTRIP credentials separately from the website login.</li>
          <li>Connect and pull the source table, then pick the mountpoint from that list.</li>
          <li>If the mountpoint is VRS, switch on GGA position upload or you will never fix.</li>
        </ol>
        <a class="jump" href="#connect">The full six steps, with why each one matters</a>
      </div>`;
    }
    const why = d.status === "mixed"
      ? `Whether this is free depends on which region the customer works in, so confirm locally before quoting. If their region charges, these are the alternatives.`
      : d.status === "check"
      ? "Our sources disagree about this one, so confirm the current policy with the operator before you promise anything."
      : d.status === "restricted"
        ? "A network exists but it is fee-based or limited to certain users, so check eligibility and price first."
        : `There is no free ${what} here, so the choice is between these.`;
    return `<div class="flow flow-choose">
      <h3>Your route: choose an option</h3>
      <p class="flow-why">${why}</p>
      <table class="optable">
        <tr><th>Option</th><th>Cost</th><th>Accuracy</th><th>Needs</th></tr>
        <tr><td>PointPerfect Flex</td><td>$15/month</td><td>3 to 6 cm</td><td>Cell coverage</td></tr>
        <tr><td>Your own base and rover</td><td>Hardware, no subscription</td><td>about 1 cm relative</td><td>A second receiver, no cell needed</td></tr>
        <tr><td>Commercial network</td><td>$800 to $3,000+/yr</td><td>1 to 2 cm</td><td>Cell coverage, coverage in their area</td></tr>
        <tr><td>Galileo HAS</td><td>Free</td><td>20 cm horizontal</td><td>TX2 or FPL, nothing else</td></tr>
        <tr><td>OPUS post-processing</td><td>Free</td><td>cm, afterwards</td><td>A static log, not real-time</td></tr>
      </table>
      <a class="jump" href="#solutions-block">What each of these actually is</a>
    </div>`;
  }

  function showState(name) {
    const d = STATE_DATA[name];
    if (!d) { panel.innerHTML = `<h2>${name}</h2><p class="hint">No data for this state yet.</p>`; return; }
    panel.innerHTML = `
      <h2>${name}</h2>
      ${statusLine(d)}
      ${d.network ? `<div class="net"><strong>${d.network}</strong>${d.operator ? " - " + d.operator : ""}</div>` : ""}
      ${d.url || d.signup ? `<div class="statelinks">
          ${d.url ? `<a href="${d.url}" target="_blank" rel="noopener">Network site</a>` : ""}
          ${d.signup ? `<a class="primary" href="${d.signup}" target="_blank" rel="noopener">Create an account</a>` : ""}
        </div>` : ""}
      <div class="notes">${d.notes}</div>
      ${workflow(d)}
      ${connectBlock(d)}
      ${provenance(d)}`;
  }


  function showCountry(name) {
    const d = COUNTRY_DATA[name];
    if (!d) {
      const inEurope = EUROPE.has(name);
      panel.innerHTML = `
        <h2>${name}</h2>
        <span class="status-pill" style="background:#9AA1A9">Not checked yet</span>
        <div class="notes">${inEurope
          ? `Europe is dense with RTK. Almost every country here runs a national network, usually through its
             mapping or cadastral agency, and Galileo HAS is free across the whole continent on a TX2 or FPL.
             We simply have not verified this country's network and its terms yet, so nothing is claimed about it.
             Verified so far: Spain and Poland are free with registration, Germany varies by federal state,
             and France and the UK are commercial.`
          : `We have not gone through this country's national networks, so rather than guess, here is what is true
             anywhere: PointPerfect Flex where it has coverage, Galileo HAS free on a TX2 or FPL, your own base
             with a radio link, and CSRS-PPP for free post-processing from any country.`}</div>
        ${workflow({ status: "paid" }, "country")}
        <div class="verified">No source checked for this country.</div>`;
      return;
    }
    panel.innerHTML = `
      <h2>${name}</h2>
      ${statusLine(d, "country")}
      ${d.network ? `<div class="net"><strong>${d.network}</strong>${d.operator ? " - " + d.operator : ""}</div>` : ""}
      ${d.url || d.signup ? `<div class="statelinks">
          ${d.url ? `<a href="${d.url}" target="_blank" rel="noopener">Official page</a>` : ""}
          ${d.signup ? `<a class="primary" href="${d.signup}" target="_blank" rel="noopener">Create an account</a>` : ""}
        </div>` : ""}
      <div class="notes">${d.notes}</div>
      ${workflow(d, "country")}
      ${connectBlock(d)}
      <div class="verified">${d.verified ? "Checked: " + d.verified : "Not independently verified."}</div>`;
  }

  // ---------- Options that work everywhere, grouped by what they are ----------
  const sol = document.getElementById("solutions");
  sol.innerHTML = UNIVERSAL_GROUPS.map(g => `
    <div class="sol-group">
      <h3 class="group-title">${g.group}</h3>
      <p class="group-blurb">${g.blurb}</p>
      <div class="sol-grid">
        ${g.options.map(o => `
          <div class="card sol-card">
            <h3>${o.name}</h3>
            <div class="meta">
              <span class="chip cost">${o.cost}</span>
              <span class="chip acc">${o.acc}</span>
              <span class="chip">${o.type}</span>
            </div>
            <p>${o.desc}</p>
            ${o.link ? `<a class="sol-link" href="${o.link}" target="_blank" rel="noopener">Official page</a>` : ""}
          </div>`).join("")}
      </div>
    </div>`).join("") + `
    <div class="sol-group">
      <h3 class="group-title">Worth knowing, not currently recommendable</h3>
      <p class="group-blurb">Two things customers ask about that you should be able to answer without over-promising.</p>
      <div class="sol-grid">
        <div class="card sol-card">
          <h3>PointPerfect Live</h3>
          <div class="meta"><span class="chip cost">Not launched</span><span class="chip acc">1 to 2 cm, claimed</span><span class="chip">Network-RTK-grade service</span></div>
          <p>Announced, not purchasable, and u-blox says to contact them for pricing. Do not quote a figure, including the one that circulates internally. When it does launch, the fit is a customer who needs true 1 to 2 cm, will not run a base, and has no free state network.</p>
        </div>
        <div class="card sol-card">
          <h3>L-Band satellite corrections</h3>
          <div class="meta"><span class="chip cost">Suspended in North America</span><span class="chip acc">was 3 to 6 cm</span><span class="chip">Satellite-delivered</span></div>
          <p>u-blox ended North American PointPerfect L-Band on 31 December 2025, so Facet L-Band units need an internet correction source now. A global service is announced with no date, and it should never be promised. FPX hardware is L-Band capable, which is not the same as a service existing.</p>
        </div>
      </div>
    </div>`;

  // ---------- Sources ----------
  const srcEl = document.getElementById("sources");
  if (srcEl) srcEl.innerHTML = SOURCES.map(s => `
    <div class="source-row">
      <div class="s-what">${s.what}</div>
      <div class="s-detail">${s.detail}
        <div class="s-links">${s.links.map(([label, url]) =>
          `<a href="${url}" target="_blank" rel="noopener">${label}</a>`).join("")}</div>
      </div>
    </div>`).join("");

  // ---------- Connecting, step by step ----------
  const steps = document.getElementById("connect-steps");
  if (steps) steps.innerHTML = CONNECT_STEPS.map(st =>
    `<li><b>${st.do}</b><span>${st.why}</span></li>`).join("");

  // ---------- Troubleshooter: describe it in your own words ----------
  const troubleBox = document.getElementById("trouble");
  const troubleInput = document.getElementById("trouble-q");

  function expand(q) {
    let out = " " + q.toLowerCase().replace(/[^a-z0-9' ]/g, " ") + " ";
    Object.keys(TROUBLE_SYNONYMS).forEach(k => {
      if (out.includes(" " + k + " ") || out.includes(k)) out += " " + TROUBLE_SYNONYMS[k];
    });
    return out;
  }

  function scoreOf(item, expanded) {
    const hay = (item.symptom + " " + item.looks + " " + item.fix).toLowerCase();
    const words = [...new Set(expanded.split(/\s+/).filter(w => w.length > 2))];
    let score = 0;
    words.forEach(w => {
      if (item.symptom.toLowerCase().includes(w)) score += 3;
      else if (hay.includes(w)) score += 1;
    });
    return score;
  }

  function renderTrouble(q) {
    let list = NTRIP_TROUBLE.map(t => ({ t, score: 0 }));
    const typed = (q || "").trim();
    if (typed) {
      const expanded = expand(typed);
      list = NTRIP_TROUBLE.map(t => ({ t, score: scoreOf(t, expanded) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score);
    }
    if (typed && !list.length) {
      troubleBox.innerHTML = `<p class="hint">Nothing matched "${typed}". Try the words you would say out loud:
        will not fix, keeps disconnecting, wrong password, no data, worked yesterday.
        <button class="linkish" id="clear-trouble">Show everything</button></p>`;
      return;
    }
    troubleBox.innerHTML = `${typed ? `<p class="hint">${list.length} match${list.length === 1 ? "" : "es"} for "${typed}".
      <button class="linkish" id="clear-trouble">Show everything</button></p>` : ""}
      ${list.map(({ t }) => `
      <div class="trouble-row">
        <div class="t-sym">${t.symptom}</div>
        <div class="t-looks"><span>Looks like</span>${t.looks}</div>
        <div class="t-fix"><span>Fix</span>${t.fix}</div>
      </div>`).join("")}`;
  }

  if (troubleBox) {
    renderTrouble("");
    if (troubleInput) troubleInput.addEventListener("input", e => renderTrouble(e.target.value));
    troubleBox.addEventListener("click", e => {
      if (e.target.id === "clear-trouble") { troubleInput.value = ""; renderTrouble(""); }
    });
  }
})();
