# NDT Browser v0.2

Implement bounded challenge/navigation waits, visible readiness, lifecycle events,
proxy URL parsing and explicit paced action helpers for both native drivers.
Keep native APIs unchanged. Do not retry actions or claim detection immunity.
Remove architecture-reference prose from both READMEs; retain legal notices.
Verify local fixtures, types, packaged install and cross-platform/Docker CI before release.
Popup settings remain explicit: configurePage before navigation; automatic hooks
cannot guarantee control before a popup's first request. Long-duration load and live
challenge effectiveness require separate measurements.
