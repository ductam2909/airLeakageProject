# Air Leakage Project

## Development

```bash
npm install
npm run dev
```

`npm run dev` starts the Flask backend and Vite frontend for browser development.

To run the Electron shell during development:

```bash
npm run electron
```

## Run API Separately

Run the Flask API in a separate terminal:

```bash
npm run backend
```

## Build Electron App

The Electron app starts the packaged frontend server, starts the packaged Flask API, and opens the desktop window.

Build an unpacked Electron app for quick checking:

```bash
npm run pack
```

Build the Windows installer:

```bash
npm run dist
```

The installer is written to `release/`.

If you want the Electron app to open a different web URL, set `ELECTRON_WEB_URL` before running it. The default URL is `http://127.0.0.1:5173`.

## Auto Update With GitHub Releases

The Windows installer is configured for Electron auto-update with `electron-updater` and GitHub Releases.

Before releasing a new version:

1. Update `version` in `package.json`.
2. Replace `build.publish[0].owner` and `build.publish[0].repo` in `package.json` with your GitHub repository owner and name.
3. Make sure the GitHub release is public, or provide a valid token for publishing.
4. Build the release:

```bash
npm run dist
```

5. Create a GitHub Release with a tag matching the app version, for example `v1.0.1`.
6. Upload the generated artifacts from `release/` to that GitHub Release. Keep `latest.yml` together with the installer and blockmap files.

To build and publish directly to GitHub Releases, set `GH_TOKEN` and run:

```bash
npm run release:github
```

The backend executable is bundled from `build/backend` into the app package, so installing an app update also updates the backend. Runtime data is stored under Electron `userData/data`, so database files survive app updates.
