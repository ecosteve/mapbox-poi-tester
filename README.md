# Mapbox Medical POI Tester

Static one-page app for testing Mapbox Search Box medical POI category results around a chosen bias point.

For Vercel deployments, the browser bundle is served as a static asset and `/config.js`
is rewritten to a serverless function that injects `MAPBOX_TOKEN` and `COUNTRY_CODES`.

## Run

Create a `.env` file in the project root:

```bash
MAPBOX_TOKEN=pk.your_public_token
COUNTRY_CODES=NZ
PORT=8000
```

Then start the included zero-dependency server:

```bash
npm start
```

Then open `http://localhost:8000`, choose categories, move the bias marker, and run searches.
