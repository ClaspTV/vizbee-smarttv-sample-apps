# VizioSmartCast

VizioSmartCast apps are hosted as plain web URLs — no packaging step. The Vizio
companion library is injected by the platform at runtime when running on a
SmartCast TV; it announces readiness via the `VIZIO_LIBRARY_DID_LOAD` event
that this app's `VizioSmartCastAdapter` waits for (5s budget).

## Build

```bash
npm run build
```

This produces `dist/` containing `index.html` + `assets/`.

## Test on a SmartCast TV

1. Host `dist/` from any HTTPS server (S3 + CloudFront, Vercel, Netlify, etc.).
2. Submit the URL through Vizio's app submission process.
3. For local testing on developer-mode SmartCast TVs, point the TV's debug app
   loader at your local LAN URL (or use `npm run preview` to serve `dist/` and
   tunnel via ngrok).

## Local dev (no TV)

```bash
npm run dev
```

The `DesktopAdapter` activates when `window.VIZIO` is missing, so D-pad maps
to keyboard arrows. To simulate the Vizio companion-library flow, run with
`?simulate=vizio` (TODO: add simulator) or just verify the adapter unit-wise.
