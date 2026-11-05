# Host on GitHub Pages, not as a Claude Artifact

The site was first planned as a Claude Artifact. An artifact's security policy blocks every outside request except scripts from a few CDNs, so it cannot load basemap tiles, read the published Google Sheet, or carry filter state in a link beyond a single `#word`. Those three limits break settled parts of the brief (a light street basemap, owner edits appearing within a day, shareable filter links), so the site is a static site on GitHub Pages instead.

## Considered Options

- **Claude Artifact**: no extra account, but only a self-drawn outline map, a daily scheduled task republishing the page with embedded data (needing `docs.google.com` on the account's allowed-domains list), and coded `#r3-t1` share links.
- **GitHub Pages** (chosen): a free public GitHub account and repository; a real basemap, normal share links, and data fetched outside the browser's sandbox.
