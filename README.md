# Mapbox Medical POI Tester

Static one-page app for testing Mapbox Search Box medical POI category results around a chosen bias point.

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
