# Vizbee Sample Webapp — Xbox UWP shell (WebView2)

A thin native UWP application that hosts a **Chromium WebView2** control and
points it at the same hosted web build that tizen/webos load. This replaces
the prior Hosted Web App (HWA) packaging, which would have run the web code in
the legacy EdgeHTML engine.

```
┌─────────────────────────────────────────────────────────┐
│  Xbox One / Series (UWP, sideloaded .appx)              │
│  ┌───────────────────────────────────────────────────┐  │
│  │  VizbeeSampleXbox.exe (this project — C# UWP)     │  │
│  │  ┌─────────────────────────────────────────────┐  │  │
│  │  │  Microsoft.UI.Xaml.Controls.WebView2         │  │  │
│  │  │  Source = https://…/xbox/index.html          │  │  │
│  │  │  (Vizbee sample app + main + HomeSSO SDKs)   │  │  │
│  │  └─────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

## Prerequisites

- **Windows 10/11** with **Visual Studio 2022** + the **Universal Windows
  Platform development** workload.
- **Windows 10 SDK 10.0.17763.0** or newer (the project's `TargetPlatformMinVersion`).
- **Xbox One / Series in Developer Mode** with **WebView2 Runtime** present
  (shipped in recent Xbox systemOS updates; verify via Device Portal).
- A code-signing certificate that matches `Identity Publisher` in
  `Package.appxmanifest` (default: `CN=Vizbee`). VS will generate
  `VizbeeSampleXbox_TemporaryKey.pfx` on first build for dev signing.

## Build

```powershell
# 1) Open the solution
start VizbeeSampleXbox.sln

# 2) In Visual Studio:
#    - Right-click the project → Restore NuGet Packages
#    - Set solution platform to x64 (Xbox is x64)
#    - Set configuration to Release (or Debug for local UWP emulator runs)
#    - Build → Build Solution
```

NuGet packages restored (see `.csproj`):

| Package | Purpose |
|---|---|
| `Microsoft.NETCore.UniversalWindowsPlatform` | UWP .NET runtime |
| `Microsoft.UI.Xaml` (WinUI 2.x) | Hosts the `<muxc:WebView2>` control |
| `Microsoft.Web.WebView2` | WebView2 SDK |

## Package + sideload

```powershell
# Produce the .appx (Release|x64 recommended for Xbox sideload)
# In VS: Project → Publish → Create App Packages → Sideloading
# This signs with VizbeeSampleXbox_TemporaryKey.pfx and emits
# AppPackages\VizbeeSampleXbox_x.x.x.x_x64.appx

# Or from MSBuild CLI:
msbuild VizbeeSampleXbox.csproj /p:Configuration=Release /p:Platform=x64 /p:AppxBundle=Always /p:AppxBundlePlatforms=x64
```

Then upload via **Xbox Device Portal → Home → Add → My apps**, pick the
`.appx`. The signing certificate (`.cer`) must be installed once via Device
Portal → Add Certificate.

## Dev loop

The `.appx` is a **stable wrapper** — it only needs re-deploying when:
- the manifest changes (capabilities, DIAL name, version),
- the shell C# changes (host-object bridge, lifecycle wiring),
- logos change.

For day-to-day code changes to the **web app**:

```bash
# On macOS / dev machine (from repo root)
npm run ship:xbox   # vite build → upload dist/xbox/ to s3://vzb-origin-qa/xbox/
                    # served via CloudFront at d1a16fhfuhnwgt.cloudfront.net/xbox/
```

Then just relaunch the app on Xbox — WebView2 fetches the fresh build.

## What's wired

| Concern | Where | Status |
|---|---|---|
| WebView2 control | [MainPage.xaml](MainPage.xaml) | Source set at compile time |
| Full-screen safe area | [MainPage.xaml.cs](MainPage.xaml.cs) `MainPage_Loaded` | `SetDesiredBoundsMode(UseCoreWindow)` so the WebView fills 1920×1080 edge-to-edge |
| Gamepad / D-pad → keyboard | WebView2 default | D-pad sends Arrow keys, A → Enter, B → Esc. `RemoteKeyService` in the web app already listens to `keydown`, so navigation works without extra wiring |
| DIAL launch (mobile sender → Xbox) | [Package.appxmanifest](Package.appxmanifest) `<uap:DialProtocol Name="VizbeeSample"/>` | Manifest declares the DIAL name; the Vizbee SDK reads the DIAL launch URI on the JS side |
| Suspend / resume forwarding | [App.xaml.cs](App.xaml.cs) `OnSuspending` | Stub — forwards nothing yet. Bridge via `AddHostObjectToScript` when the SDK needs it |

## The Vizbee SDK ↔ WebView2 caveat

The `full` Xbox SDK build at `https://sdk.claspws.tv/v7/vizbee.js`
uses **8 WinRT JS APIs** (`Windows.Networking.Connectivity.*`,
`Windows.System.Profile.*`, `Windows.UI.WebUI.WebUIApplication`, etc.) that
were available via the EdgeHTML JS bridge. **WebView2 does not expose
`window.Windows.*`** — those calls will throw `TypeError`, breaking:

- network info / SSID detection (pairing-time discovery),
- device id / model reporting,
- advertising id (analytics),
- suspend/resume lifecycle hooks,
- DIAL activation handling at the SDK level.

**Two ways to fix:**

1. **Recommended — use a WebView2-compatible SDK build.** Select a `light`
   variant in Settings → *Vizbee SDK* (`light-es5` / `light-es6`); these load
   the `@vizbeetv/sdk` xbox bundles from the dev origin, defined in
   `SDK_URL_BY_VARIANT.xbox` in `src/services/vizbee/VizbeeService.ts`. The build
   should either be pure-web (Chromium-native APIs + cloud signalling) or
   read its data from a host object exposed by this shell.

2. **Bridge.** Expose UWP APIs as JS host objects in
   [MainPage.xaml.cs](MainPage.xaml.cs) (placeholder there now):

   ```csharp
   await WebView.EnsureCoreWebView2Async();
   WebView.CoreWebView2.AddHostObjectToScript("vizbeeNative", new VizbeeBridge());
   ```

   Then the SDK reads `window.chrome.webview.hostObjects.vizbeeNative.<x>()`.
   A `VizbeeBridge` class would proxy the 8 WinRT APIs the SDK currently calls
   directly. Heavier but no SDK changes required.

## Things worth verifying on the device

- **WebView2 Runtime present** — Device Portal → System → System
  information → confirm a recent OS. If missing, modern Xbox systemOS updates
  bring it.
- **Network capabilities** — `internetClient`, `internetClientServer`,
  `privateNetworkClientServer` are declared in the manifest. If pairing
  needs UDP/SSDP, this stack already permits it.
- **DIAL** — `Name="VizbeeSample"` must match what the Vizbee sender sends.
  If pairing from mobile doesn't launch the app, this is the first place to
  check.
- **Web Source URL** — `MainPage.xaml` hardcodes
  `https://d1a16fhfuhnwgt.cloudfront.net/xbox/index.html`. Confirm this URL
  returns the latest build (Device → Settings → Source row will show it).
