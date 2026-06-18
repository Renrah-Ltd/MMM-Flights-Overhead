const PLANE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="currentColor" style="display:block"><path d="M50,3 L57,42 L97,63 L97,71 L57,56 L61,89 L75,95 L73,100 L50,93 L27,100 L25,95 L39,89 L43,56 L3,71 L3,63 L43,42 Z"/></svg>`;

Module.register("MMM-FlightsOverhead", {
  defaults: {
    lat: 0,
    lon: 0,
    radius: 25,
    altitudeMaxFt: null,
    limit: 6,
    updateInterval: 60 * 1000,
    showRouteInfo: true,
    units: "imperial",
    animateIn: true,
    view: "list",        // "list" or "radar"
    radarSize: 400,      // px — diameter of radar circle
  },

  start() {
    this.flights = [];
    this.loaded = false;
    this.error = null;
    this.sendSocketNotification("FETCH_FLIGHTS", this.config);
    setInterval(() => {
      this.sendSocketNotification("FETCH_FLIGHTS", this.config);
    }, this.config.updateInterval);
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "FLIGHTS_DATA") {
      this.flights = payload.flights;
      this.error = payload.error || null;

      if (this.error && this.error.includes("rate limited")) {
        this.hide(800);
        return;
      }

      if (this.hidden) {
        this.show(800);
      }

      if (!this.loaded) {
        this.loaded = true;
        this.updateDom(this.config.animateIn ? 800 : 0);
        return;
      }

      if (this.config.view === "radar" && !this.error && this.radarEl?.isConnected) {
        this.updateRadarBlips();
      } else {
        this.updateDom(this.config.animateIn ? 800 : 0);
      }
    }
  },

  getDom() {
    const wrapper = document.createElement("div");
    wrapper.className = "mmm-flights-overhead";

    if (!this.loaded) {
      wrapper.innerHTML = `<div class="foh-scanning"><span class="foh-scanning-dot"></span>SCANNING SKY</div>`;
      return wrapper;
    }

    if (this.error) {
      wrapper.innerHTML = `<div class="foh-error">API ERROR — ${this.error}</div>`;
      return wrapper;
    }

    const header = document.createElement("div");
    header.className = "foh-header";
    header.innerHTML = `
      <span class="foh-header-icon">${PLANE_SVG}</span>
      <span class="foh-header-label">FLIGHTS OVERHEAD</span>
      <span class="foh-badge">${this.flights.length}</span>
    `;
    wrapper.appendChild(header);

    if (this.config.view === "radar") {
      wrapper.appendChild(this.buildRadar());
      return wrapper;
    }

    if (this.flights.length === 0) {
      const empty = document.createElement("div");
      empty.className = "foh-empty";
      empty.innerHTML = `<span class="foh-empty-icon">${PLANE_SVG}</span><span>No flights within ${this.config.radius} km</span>`;
      wrapper.appendChild(empty);
      return wrapper;
    }

    this.flights.forEach(f => wrapper.appendChild(this.buildCard(f)));
    return wrapper;
  },

  buildRadar() {
    const size = this.config.radarSize;
    const center = size / 2;
    const maxR = center - 24;

    const radar = document.createElement("div");
    radar.className = "foh-radar";
    radar.style.width = size + "px";
    radar.style.height = size + "px";

    // concentric rings
    [0.33, 0.66, 1].forEach(ratio => {
      const ring = document.createElement("div");
      ring.className = "foh-radar-ring";
      const d = ratio * maxR * 2;
      const offset = center - ratio * maxR;
      ring.style.cssText = `width:${d}px;height:${d}px;left:${offset}px;top:${offset}px;`;
      radar.appendChild(ring);
    });

    // crosshair
    const ch = document.createElement("div");
    ch.className = "foh-radar-crosshair";
    radar.appendChild(ch);

    // sweep
    const sweep = document.createElement("div");
    sweep.className = "foh-radar-sweep";
    radar.appendChild(sweep);

    // compass labels
    ["N", "E", "S", "W"].forEach((dir, i) => {
      const label = document.createElement("div");
      label.className = "foh-radar-compass";
      label.textContent = dir;
      const angle = i * 90;
      const x = center + Math.sin(angle * Math.PI / 180) * (maxR + 14);
      const y = center - Math.cos(angle * Math.PI / 180) * (maxR + 14);
      label.style.cssText = `left:${x}px;top:${y}px;`;
      radar.appendChild(label);
    });

    // center dot
    const dot = document.createElement("div");
    dot.className = "foh-radar-center";
    radar.appendChild(dot);

    this.radarEl = radar;

    // flight blips
    this.flights.forEach(f => {
      if (f.lat == null || f.lon == null) return;
      const bear = this.bearing(this.config.lat, this.config.lon, f.lat, f.lon);
      const ratio = Math.min(f.distance / this.config.radius, 1);
      const px = center + Math.sin(bear * Math.PI / 180) * ratio * maxR;
      const py = center - Math.cos(bear * Math.PI / 180) * ratio * maxR;

      const blip = document.createElement("div");
      blip.className = "foh-radar-blip";
      blip.style.cssText = `left:${px}px;top:${py}px;`;

      const climbClass = f.verticalRate > 1 ? "climbing" : f.verticalRate < -1 ? "descending" : "level";

      const plane = document.createElement("div");
      plane.className = `foh-radar-plane ${climbClass}`;
      plane.innerHTML = PLANE_SVG;
      if (f.heading != null) plane.style.transform = `translate(-50%,-50%) rotate(${f.heading}deg)`;
      blip.appendChild(plane);

      const lbl = document.createElement("div");
      lbl.className = "foh-radar-label";
      lbl.textContent = f.callsign || f.icao24 || "?";
      blip.appendChild(lbl);

      radar.appendChild(blip);
    });

    return radar;
  },

  buildCard(f) {
    const card = document.createElement("div");
    card.className = "foh-card" + (f.photo ? " foh-card--photo" : "");
    if (f.photo) card.style.backgroundImage = `url(${f.photo})`;

    const altitude = f.altitude != null
      ? (this.config.units === "imperial"
          ? `${Math.round(f.altitude * 3.28084).toLocaleString()} ft`
          : `${Math.round(f.altitude).toLocaleString()} m`)
      : "--";

    const speed = f.velocity != null
      ? (this.config.units === "imperial"
          ? `${Math.round(f.velocity * 1.94384)} kts`
          : `${Math.round(f.velocity * 3.6)} km/h`)
      : "--";

    const compass = f.heading != null ? this.toCompass(f.heading) : "--";
    const climbSymbol = f.verticalRate > 1 ? "↑" : f.verticalRate < -1 ? "↓" : "→";
    const climbClass = f.verticalRate > 1 ? "climbing" : f.verticalRate < -1 ? "descending" : "level";

    let routeHtml = "";
    if (f.route && f.route.origin && f.route.destination) {
      routeHtml = `<div class="foh-route">${f.route.origin} <span class="foh-route-arrow">›</span> ${f.route.destination}</div>`;
      if (f.route.airline) {
        routeHtml += `<div class="foh-airline">${f.route.airline}</div>`;
      }
    } else if (f.country) {
      routeHtml = `<div class="foh-route foh-country">${f.country}</div>`;
    }

    const headingStyle = f.heading != null ? `style="transform: rotate(${f.heading}deg)"` : "";

    card.innerHTML = `
      <div class="foh-card-left">
        <div class="foh-callsign">${f.callsign || "UNKNOWN"}</div>
        ${routeHtml}
        <div class="foh-dist">${Math.round(f.distance)} km away</div>
      </div>
      <div class="foh-card-right">
        <div class="foh-stat">
          <span class="foh-stat-label">ALT</span>
          <span class="foh-stat-value ${climbClass}">${altitude}<span class="foh-climb">${climbSymbol}</span></span>
        </div>
        <div class="foh-stat">
          <span class="foh-stat-label">SPD</span>
          <span class="foh-stat-value">${speed}</span>
        </div>
        <div class="foh-stat">
          <span class="foh-stat-label">HDG</span>
          <span class="foh-stat-value">${compass} <span class="foh-arrow" ${headingStyle}>↑</span></span>
        </div>
      </div>
    `;
    return card;
  },

  updateRadarBlips() {
    this.radarEl.querySelectorAll(".foh-radar-blip").forEach(el => el.remove());

    const badge = this.radarEl.closest(".mmm-flights-overhead")?.querySelector(".foh-badge");
    if (badge) badge.textContent = this.flights.length;

    const size = this.config.radarSize;
    const center = size / 2;
    const maxR = center - 24;

    this.flights.forEach(f => {
      if (f.lat == null || f.lon == null) return;
      const bear = this.bearing(this.config.lat, this.config.lon, f.lat, f.lon);
      const ratio = Math.min(f.distance / this.config.radius, 1);
      const px = center + Math.sin(bear * Math.PI / 180) * ratio * maxR;
      const py = center - Math.cos(bear * Math.PI / 180) * ratio * maxR;

      const blip = document.createElement("div");
      blip.className = "foh-radar-blip";
      blip.style.cssText = `left:${px}px;top:${py}px;`;

      const climbClass = f.verticalRate > 1 ? "climbing" : f.verticalRate < -1 ? "descending" : "level";

      const plane = document.createElement("div");
      plane.className = `foh-radar-plane ${climbClass}`;
      plane.innerHTML = PLANE_SVG;
      if (f.heading != null) plane.style.transform = `translate(-50%,-50%) rotate(${f.heading}deg)`;
      blip.appendChild(plane);

      const lbl = document.createElement("div");
      lbl.className = "foh-radar-label";
      lbl.textContent = f.callsign || f.icao24 || "?";
      blip.appendChild(lbl);

      this.radarEl.appendChild(blip);
    });
  },

  bearing(lat1, lon1, lat2, lon2) {
    const toRad = d => d * Math.PI / 180;
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))
             - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  },

  toCompass(deg) {
    const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
    return dirs[Math.round(deg / 22.5) % 16];
  },

  getStyles() {
    return ["MMM-FlightsOverhead.css"];
  },
});
