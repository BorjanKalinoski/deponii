# Serve a daily checked copy of the feed, not a live fetch

Visitors' browsers never read the Google Sheet. Once a day a scheduled GitHub workflow fetches the published Map data CSV, checks it (expected columns, row count, readable coordinates and numbers, no HTML sign-in page), and commits it to the site only if it passes; otherwise the last good copy stays. This means a broken or private-looking response can never reach the page, the "last updated" time is the time of a real successful check, and the site doesn't depend on Google allowing cross-site reads. The cost is up to a day's delay, which the brief allows. The workflow commits its check time every day, which also keeps GitHub from pausing the schedule after 60 inactive days.

The owner chose not to show an "overdue update" warning; the page shows only the last successful update time.
