# Security and runtime boundaries

NDT is a local library for trusted automation code. It can execute JavaScript, send
POST requests, access browser sessions and visit local/private network addresses.
Do not expose it directly as an unauthenticated or multi-tenant URL execution API.

- Use dedicated browser profiles and OS permissions appropriate for stored cookies.
- Treat a CDP endpoint as privileged access to its browser. Do not publish it.
- Keep the Chromium sandbox enabled where the host/container supports it.
- Keep API secrets out of CLI arguments, screenshots and broad extra headers.
- Browser proxy settings are not a firewall; local bypass and background traffic exist.
- NDT page settings do not sandbox workers, popups, extensions or native driver calls.
- Native browser APIs can perform destructive actions. NDT never retries POST/click automatically.
- Custom binaries and their licensing/update mechanisms belong to their providers.

Report vulnerabilities privately using GitHub private vulnerability reporting when
available, or contact the repository owner before posting sensitive details publicly.
