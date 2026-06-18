const NodeHelper = require("node_helper");
const https = require("https");

module.exports = NodeHelper.create({
  start() {
    this.routeCache = new Map();
    this.photoCache = new Map();
    this.flightCache = new Map();
    this.cacheMaxAge = 24 * 60 * 60 * 1000;
  },

  socketNotificationReceived(notification, payload) {
    if (notification === "FETCH_FLIGHTS") {
      this.fetchFlights(payload);
    }
  },

  fetchFlights(config) {
    const { lat, lon, radius, limit = 6, altitudeMaxFt, showRouteInfo, updateInterval = 60000 } = config;
    const key = `${lat},${lon},${radius},${altitudeMaxFt},${limit}`;

    const cached = this.flightCache.get(key);
    if (cached && Date.now() - cached.ts < updateInterval - 5000) {
      this.sendSocketNotification("FLIGHTS_DATA", cached.data);
      return;
    }

    // Bounding box from radius (km)
    const latDelta = radius / 111;
    const lonDelta = radius / (111 * Math.cos(lat * Math.PI / 180));

    const params = new URLSearchParams({
      lamin: (lat - latDelta).toFixed(4),
      lomin: (lon - lonDelta).toFixed(4),
      lamax: (lat + latDelta).toFixed(4),
      lomax: (lon + lonDelta).toFixed(4),
    });

    const url = `https://opensky-network.org/api/states/all?${params}`;

    this.fetchJSON(url, (err, data) => {
      if (err) {
        console.error("[MMM-FlightsOverhead] OpenSky error:", err.message);
        this.sendSocketNotification("FLIGHTS_DATA", { flights: [], error: err.message });
        return;
      }

      if (!data || !data.states) {
        this.flightCache.set(key, { data: { flights: [] }, ts: Date.now() });
        this.sendSocketNotification("FLIGHTS_DATA", { flights: [] });
        return;
      }

      let flights = data.states
        .filter(s => !s[8]) // not on ground
        .map(s => {
          const altM = s[7] ?? s[13]; // baro_altitude fallback geo_altitude
          return {
            icao24:       s[0],
            callsign:     s[1] ? s[1].trim() : null,
            country:      s[2],
            lon:          s[5],
            lat:          s[6],
            altitude:     altM,
            velocity:     s[9],
            heading:      s[10],
            verticalRate: s[11],
            distance:     this.haversine(lat, lon, s[6], s[5]),
            route:        null,
          };
        })
        .filter(f => {
          if (f.lat == null || f.lon == null) return false;
          if (f.distance > radius) return false;
          if (altitudeMaxFt != null && f.altitude != null && f.altitude * 3.28084 > altitudeMaxFt) return false;
          return true;
        })
        .sort((a, b) => a.distance - b.distance)
        .slice(0, limit);

      const emit = data => {
        this.flightCache.set(key, { data, ts: Date.now() });
        this.sendSocketNotification("FLIGHTS_DATA", data);
      };

      if (flights.length === 0) {
        emit({ flights });
        return;
      }

      let pending = flights.length;
      const done = () => {
        pending--;
        if (pending === 0) emit({ flights });
      };

      flights.forEach((flight, i) => {
        let flightPending = 2;
        const flightDone = () => { flightPending--; if (flightPending === 0) done(); };

        if (showRouteInfo && flight.callsign) {
          this.getRoute(flight.callsign, route => { flights[i].route = route; flightDone(); });
        } else {
          flightDone();
        }

        this.getPhoto(flight.icao24, photo => { flights[i].photo = photo; flightDone(); });
      });
    });
  },

  getPhoto(icao24, cb) {
    const cached = this.photoCache.get(icao24);
    if (cached && Date.now() - cached.ts < this.cacheMaxAge) {
      cb(cached.data);
      return;
    }

    const url = `https://api.planespotters.net/pub/photos/hex/${encodeURIComponent(icao24)}`;
    this.fetchJSON(url, (err, data) => {
      const photo = (!err && data?.photos?.length)
        ? (data.photos[0].thumbnail_large?.src || data.photos[0].thumbnail?.src || null)
        : null;
      this.photoCache.set(icao24, { data: photo, ts: Date.now() });
      cb(photo);
    });
  },

  getRoute(callsign, cb) {
    const cached = this.routeCache.get(callsign);
    if (cached && Date.now() - cached.ts < this.cacheMaxAge) {
      cb(cached.data);
      return;
    }

    const url = `https://api.adsbdb.com/v0/callsign/${encodeURIComponent(callsign)}`;
    this.fetchJSON(url, (err, data) => {
      if (err || !data?.response?.flightroute) {
        cb(null);
        return;
      }
      const fr = data.response.flightroute;
      const route = {
        origin:      fr.origin?.iata_code || fr.origin?.icao_id || null,
        destination: fr.destination?.iata_code || fr.destination?.icao_id || null,
        airline:     fr.airline?.name || null,
      };
      this.routeCache.set(callsign, { data: route, ts: Date.now() });
      cb(route);
    });
  },

  fetchJSON(url, cb) {
    const req = https.get(url, { headers: { "User-Agent": "MMM-FlightsOverhead/1.0 (+https://github.com/JackHarner/MMM-FlightsOverhead)" } }, res => {
      const chunks = [];
      res.on("data", c => chunks.push(c));
      res.on("end", () => {
        const body = Buffer.concat(chunks).toString();
        if (res.statusCode === 429) {
          cb(new Error("rate limited (429)"), null);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          cb(new Error(`HTTP ${res.statusCode}`), null);
          return;
        }
        try {
          cb(null, JSON.parse(body));
        } catch (e) {
          cb(new Error(`invalid JSON: ${body.slice(0, 80)}`), null);
        }
      });
    });
    req.on("error", e => cb(e, null));
    req.setTimeout(10000, () => { req.destroy(); cb(new Error("timeout"), null); });
  },

  haversine(lat1, lon1, lat2, lon2) {
    if (lat2 == null || lon2 == null) return Infinity;
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },
});
