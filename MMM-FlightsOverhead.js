Module.register("MMM-FlightsOverhead", {
  defaults: {
    lat: 0,
    lon: 0,
    radius: 25,          // km — ~audible range for most aircraft
    altitudeMaxFt: null, // filter out high cruisers (e.g. 45000); null = no filter
    limit: 6,
    updateInterval: 60 * 1000, // OpenSky anonymous: ~100 req/day; 60s = safe
    showRouteInfo: true,
    units: "imperial",   // "imperial" (ft, kts) or "metric" (m, km/h)
    animateIn: true,
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
      this.loaded = true;
      this.updateDom(this.config.animateIn ? 800 : 0);
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
      <span class="foh-header-icon">✈</span>
      <span class="foh-header-label">FLIGHTS OVERHEAD</span>
      <span class="foh-badge">${this.flights.length}</span>
    `;
    wrapper.appendChild(header);

    if (this.flights.length === 0) {
      const empty = document.createElement("div");
      empty.className = "foh-empty";
      empty.innerHTML = `<span class="foh-empty-icon">✈</span><span>No flights within ${this.config.radius} km</span>`;
      wrapper.appendChild(empty);
      return wrapper;
    }

    this.flights.forEach(f => wrapper.appendChild(this.buildCard(f)));
    return wrapper;
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

  toCompass(deg) {
    const dirs = ["N","NNE","NE","ENE","E","ESE","SE","SSE","S","SSW","SW","WSW","W","WNW","NW","NNW"];
    return dirs[Math.round(deg / 22.5) % 16];
  },

  getStyles() {
    return ["MMM-FlightsOverhead.css"];
  },
});
