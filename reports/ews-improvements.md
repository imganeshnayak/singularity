# Early Warning System Improvements

Scope: improve timeliness, accuracy, actionability, and operational trust of the FloodSight early warning system, not just the on-screen alert list.

## 1. Current gaps worth fixing first

### 1.1 Alert content is too generic
Today `alerts.py` builds alert text from a small hard-coded driver list. Multiple zones can end up with nearly identical wording, and the text does not reflect the model's actual SHAP drivers or the zone's uncertainty.

**Impact:** lower trust from responders, harder triage, less justification for evacuation or road closures.

**Fix direction:**
- Attach the top SHAP factors and zone-specific depth estimates into the alert.
- Add an "uncertainty" signal when the prediction interval is wide (`pred_depth_hi - pred_depth_lo` large).
- Add a short "recommended action" line per risk tier, with escalation only for HIGH-risk zones that also have early onset.

### 1.2 Risk is mostly a single snapshot
The current pipeline treats one weather scenario as the hazard state. Real coastal flooding depends on tide phase, accumulated rainfall, and how conditions evolve over the next few hours. A single scenario can miss rising-tide compounding or precipitation peaks later in the window.

**Impact:** warnings can fire too late or too early, and cannot explain why risk is rising or falling.

**Fix direction:**
- Introduce a short multi-step horizon, for example 0h, 3h, 6h, 12h, with explicit tide/rain evolution.
- Return trend indicators alongside each zone: improving, stable, deteriorating.
- Use the existing `predict_proba` and regression estimates per horizon, not just the current scenario.

### 1.3 Onset and peak times are brittle
`onset_hours` and `peak_hours` are clipped and sometimes set to 24h when probability is low. That is helpful for masking, but as an alert field it is noisy for low-confidence zones.

**Impact:** responders may read a precise clock time that is not actually usable.

**Fix direction:**
- Report onset/peak as a time range or confidence band when probability is marginal.
- Do not over-precise times when onset model confidence is low or clipped.
- Separate "earliest plausible onset" from "most likely onset window".

### 1.4 Attention is zone-only, not facility-aware
The responder priorities router does consider critical facilities, but only for a few hard-coded zone IDs. Alerts themselves do not currently connect risk to schools, hospitals, shelters, or population centers.

**Impact:** alerting is less actionable for an operations team that needs to protect infrastructure and vulnerable populations.

**Fix direction:**
- Attach nearby critical facilities and their evacuation/shelter status to each alert or priority item.
- Include simple exposure signals: is the zone near a hospital, school, shelter, or dense coastal settlement?
- Make shelter reachability part of the warning narrative, not only the separate shelter panel.

### 1.5 Live data path has silent fallbacks
`live_data.py` falls back to default storm parameters on failure without surfacing data quality to the UI.

**Impact:** in a real outage, the system may look live while running on synthetic defaults.

**Fix direction:**
- Return a data-source/status flag in the live response.
- Let the UI distinguish real telemetry, degraded telemetry, and fallback simulation.
- Add a small freshness indicator and retry behavior on failure.

### 1.6 No alert lifecycle or suppression
Alerts appear and disappear by scenario, but there is no concept of alert state, deduplication, escalation, or acknowledgment.

**Impact:** noisy toggling during a slowly evolving event; hard to track what was warned, when, and whether it was acted on.

**Fix direction:**
- Introduce alert state fields: new, ongoing, escalated, all-clear.
- Suppress flapping by requiring sustained risk before escalating and sustained improvement before all-clear.
- Keep a short alert history so the UI can show what changed since the last update.

## 2. Recommended improvements by priority

### Priority 1 — Make alerts explainable and decision-ready
**Owner:** backend alerts + schemas, frontend alerts panel

**Concrete changes:**
- Add SHAP driver list and depth range to `ZoneAlert`.
- Add `uncertainty` flag or width for wide prediction intervals.
- Add `recommended_action` per alert, e.g. monitor, prepare evacuation, shelter-in-place, close coastal access.
- Surface tide phase explicitly in coastal alerts.

**API impact:**
- Extend `ZoneAlert` schema.
- Keep existing fields; add optional fields first so the frontend can adopt gradually.

### Priority 2 — Add a short forecast horizon and trend signals
**Owner:** backend forecast + alerts, frontend explain/alert panels

**Concrete changes:**
- Run inference for multiple horizons using evolving tide/rain assumptions.
- Return per-zone trend category and horizon-specific risk.
- Use trend to drive escalation language and timing.

**API impact:**
- New or extended response shape for multi-horizon predictions/trends.
- Alerts can be generated from the horizon with the worst credible outcome, with a note on when that outcome is expected.

### Priority 3 — Tie warnings to exposure and shelters
**Owner:** backend routes + alerts, frontend map and alerts

**Concrete changes:**
- Compute proximity of each risk zone to facilities and vulnerable infrastructure.
- Include threatened-facility list in alerts/priorities beyond hard-coded zone IDs.
- Show whether nearby shelters remain reachable under the forecast.

**API impact:**
- Enrich `EmergencyPriorityItem` and/or `ZoneAlert` with nearby facilities and shelter reachability.

### Priority 4 — Improve onset/peak reporting
**Owner:** backend forecast/alerts, frontend explain drawer

**Concrete changes:**
- Report onset as a window when confidence is low.
- Deprecate over-precise clock times for low-probability zones.
- Keep "earliest plausible" separate from "most likely".

**UI impact:**
- Explain drawer and alerts show ranges, not fake precision.

### Priority 5 — Harden live telemetry and data quality
**Owner:** backend live_data, frontend telemetry strip

**Concrete changes:**
- Add source/status/freshness fields to live response.
- Expose fallback mode explicitly.
- Add retry and alert if telemetry is stale.

### Priority 6 — Alert lifecycle and suppression
**Owner:** backend alerts/state, frontend alerts panel

**Concrete changes:**
- Add alert state and change detection.
- Add simple flapping control: require sustained risk before escalating, sustained improvement before all-clear.
- Keep a short recent-alert history for context.

## 3. Suggested end-state behavior

A good early warning flow would look like this:

1. Live or simulated weather feeds a short horizon forecast.
2. Each zone gets risk, depth range, uncertainty, onset window, and trend.
3. Alerts are generated from the worst credible horizon, with SHAP drivers and nearby facilities attached.
4. High-risk coastal zones with early onset and threatened facilities get escalated first.
5. The UI shows risk, trend arrow, recommended action, and shelter reachability together.
6. If telemetry degrades, the UI says so explicitly instead of silently replaying defaults.

## 4. Suggested first step

If you want the fastest win, start with Priority 1 and a small part of Priority 3:

- Extend `ZoneAlert` with SHAP drivers, depth range, uncertainty, and a recommended-action line.
- Enrich responder priorities and alerts with nearby facilities using a generic proximity pass instead of the current hard-coded zone IDs.

That improves the visible warning quality immediately and gives the frontend more useful fields to display.

## 5. Optional bigger bets

- Add a lightweight ensemble or calibration step so probabilities and onset estimates are better behaved.
- Add a coastal compound-flood rule layer that explicitly combines tide phase, wave setup, and rainfall timing.
- Add a simple persistence/simulation store so the system can show "what changed" over the last few forecast cycles.
- Add role-based views: public warning vs. responder operations vs. command-center detail.
