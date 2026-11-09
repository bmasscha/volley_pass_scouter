# Volleyball Pass Scout

A Progressive Web App (PWA) for scouting **service-receive (pass) quality** on an **Android tablet in landscape orientation**. It is the sister app of the Volleyball Service Scout and reuses its court, trajectory drawing and 3D viewer.

## Key Features

- **Scout your own team or the opponent:** the top-bar *Receiving* switch picks whose reception you scout. Each team has its own roster.
- **Fast entry, three taps per serve:**
  1. tap the passer's jersey number;
  2. tap where the server stands behind the baseline, then where the passer played the ball;
  3. tap the rating. The pass is saved immediately.
- **Pass rating scale (0–3):**
  - 🟢 **Perfect (3):** all attack options for the setter
  - 🔵 **Good (2):** limited options
  - 🟠 **Not good (1):** no quick attack possible
  - 🔴 **Error (0):** ace or ball lost
- **Serve type** of the serving team (Jump Float, Float, Jump Topspin, Topspin).
- **Live passer stats:** pass average, % positive (good + perfect), rating distribution, weakest zone and the hardest serve type.
- **Zone heat map:** the receiving zones 1–6 are coloured by pass average, labelled `avg (number of passes)`.
- **Post-game report** (📊 Report):
  - team KPIs and key findings;
  - a passer table, a passer × zone heat table and a serve-type table;
  - court images for the team and for each passer.
  - *Print / PDF* uses the browser's print dialog ("Save as PDF"). *Download* saves a self-contained HTML file you can share.
- **CSV export/import** with full coordinates, zone, rating and timestamp. All data is auto-saved in `localStorage` and the app works offline.

## Court Coordinates

Coordinates are in meters. The server's baseline is at `x = 0` and the receiving baseline at `x = 18`, with the net at `x = 9`. `y` runs from `0` to `9` across the court. *Flip Court* only mirrors the view; stored data never changes.

## Deployment (GitHub Pages)

1. Create an empty GitHub repository (e.g. `volley_pass_scouter`) and push this folder:
   ```bash
   git remote add origin https://github.com/<your-username>/volley_pass_scouter.git
   git push -u origin main
   ```
2. In the repository, set **Settings > Pages > Source** to **GitHub Actions**. The included workflow then deploys every push to `main`.
3. Open `https://<your-username>.github.io/volley_pass_scouter/` in Chrome on the tablet, in landscape.
4. Tap **Add to Home Screen**. It installs next to the Service Scout app; the two apps use separate storage.
