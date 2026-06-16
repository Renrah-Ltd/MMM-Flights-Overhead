# MMM-FlightsOverhead

[MagicMirror²](https://github.com/MichMich/MagicMirror) module that displays aircraft currently flying overhead, powered by the [OpenSky Network](https://opensky-network.org/) free API and [adsbdb](https://www.adsbdb.com/) for route info.

## Screenshot

```
✈ FLIGHTS OVERHEAD  [3]
┌──────────────────────────────────┐
│ AAL1234          ALT  32,000 ft↑ │
│ DFW › LAX        SPD  487 kts    │
│ American Airlines HDG  W  ←     │
│ 18 km away                       │
└──────────────────────────────────┘
```

## Installation

```bash
cd ~/MagicMirror/modules
git clone https://github.com/jackharner/mmm-flights-overhead MMM-FlightsOverhead
```

No `npm install` needed — zero dependencies.

## Config

Add to `config/config.js`:

```js
{
  module: "MMM-FlightsOverhead",
  position: "top_right",
  config: {
    lat: 39.7392,
    lon: -104.9903,
    radius: 25,
  }
}
```

## Options

| Option | Default | Description |
|---|---|---|
| `lat` | `0` | Your latitude |
| `lon` | `0` | Your longitude |
| `radius` | `25` | Search radius in km (~audible range for most aircraft) |
| `altitudeMaxFt` | `null` | Filter out high cruisers (e.g. `45000`). `null` = no filter |
| `limit` | `6` | Max flights to display |
| `updateInterval` | `60000` | Poll interval (ms). OpenSky anonymous tier allows ~100 req/day; 60s is safe |
| `showRouteInfo` | `true` | Fetch origin/destination/airline from adsbdb |
| `units` | `"imperial"` | `"imperial"` (ft, kts) or `"metric"` (m, km/h) |
| `animateIn` | `true` | Animate DOM updates (800ms transition) |

## APIs Used

- **[OpenSky Network](https://opensky-network.org/apidoc/)** — live aircraft state vectors, no API key required (anonymous tier)
- **[adsbdb](https://www.adsbdb.com/)** — callsign-to-route lookup, no API key required. Results cached 24h.

## Rate Limits

OpenSky anonymous access allows ~100 requests/day (~1 per 15 min). The default `updateInterval` of 60s will exceed this. Adjust to `900000` (15 min) for safe anonymous use, or [create a free OpenSky account](https://opensky-network.org/index.php?option=com_users&view=registration) for higher limits.

## License

MIT
