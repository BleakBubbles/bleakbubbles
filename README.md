# BleakBubbles

The personal site of Max Hua: a single dark page with my projects and how to reach me, plus a button that freezes the whole page into pixel art.

Press the button in the top-right corner (or the <kbd>P</kbd> key). A glassy ripple spreads from where you clicked, everything stops mid-motion, and the page turns into chunky pixels. Click again to ripple back to the real world.

## What's on the page

- **Intro, Projects, Contact.** Each project card shows live details pulled from GitHub (last update) and npm (latest version) when the page loads.
- **Flying shapes.** Flat-shaded 3D solids tumble across the page in parallax, some behind the cards and some in front. One of them is always a Tetris piece; the pieces come in 7-bag order, like the real game.
- **The freeze.** The pixel icon on the button builds itself into a 3×3×3 voxel cube while the page freezes, and comes apart when it thaws.

No framework and no build step: plain HTML, CSS and JavaScript modules.

## Running it locally

The scripts are ES modules, which browsers won't load from a `file://` path, so serve the folder with any static file server:

```bash
python -m http.server 8417
```

Then open <http://localhost:8417>.

## Files

| File | What it does |
|---|---|
| `index.html` | The page itself |
| `styles.css` | All styling; spacing and colours are set as variables at the top |
| `main.js` | Wires everything together: the freeze button, the "I build…" word colours, smooth-scrolling header links |
| `pixel-freeze.js` | The freeze effect: snapshots the page and draws it through a WebGL shader with the ripple and pixelation |
| `shapes.js` | The flying 3D shapes and Tetris pieces, drawn on two canvases with a small hand-rolled 3D projection |
| `freeze-icon.js` | The freeze button's icon and its pixels-to-cube animation |
| `repos.js` | Fetches the live GitHub and npm details for the project cards |
| `assets/` | Avatar, résumé PDF, project logos (`logos/`), tech icons (`tech/`) and contact icons (`icons/`) |

## Credits

- [html2canvas](https://html2canvas.hertzen.com/) (MIT), used by the freeze to snapshot the page
- Tech icons and the GitHub mark from [Simple Icons](https://simpleicons.org/) (CC0)
- Mail and document icons from [Lucide](https://lucide.dev/) (ISC)
- LinkedIn icon from [Bootstrap Icons](https://icons.getbootstrap.com/) (MIT)
- Fonts: [Space Grotesk](https://fonts.google.com/specimen/Space+Grotesk), [Inter](https://fonts.google.com/specimen/Inter) and [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) via Google Fonts (OFL)

Project logos belong to their respective projects.
