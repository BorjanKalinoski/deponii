# Депонии во Македонија

A public map and list of recorded wild landfills in Macedonia, published at
https://borjankalinoski.github.io/deponii/.

## Where the data comes from

The owner keeps the inventory in a Google Sheet. Its **Map data** tab holds only the
13 public columns (pulled from the main tab by a column-by-column formula), and only
that tab is published as CSV.

Once a day (04:17 UTC) the workflow in `.github/workflows/update-and-deploy.yml`
fetches that CSV, checks it (`assets/lib/feed.js`), and saves it to `data/` only if it
passes. A sign-in page, an error page or a feed with unexpected columns is rejected and
the last good copy stays. The site shows the time of the last successful check. To
update immediately, run the workflow by hand from the repository's **Actions** tab.

GitHub Pages publishes straight from the `main` branch (Settings → Pages → Deploy from
a branch: `main`, `/ (root)`), so every push to `main`, including the daily data
commit, updates the live site within a minute or two.

See `CONTEXT.md` for the project's vocabulary and `docs/adr/` for why it is built this way.

## Working on it

```sh
npm install               # map library and font sources (already copied into assets/)
node --test               # logic and data-check tests
node scripts/update-data.mjs path/to/file.csv   # run the data check on a local file
python3 -m http.server    # then open http://localhost:8000
```

There is no build step: `index.html`, `assets/` and `data/` are served as they are.
MapLibre GL JS and IBM Plex Sans are vendored in `assets/vendor` and `assets/fonts`
(licences alongside). The basemap is OpenFreeMap (© OpenMapTiles, © OpenStreetMap
contributors).
