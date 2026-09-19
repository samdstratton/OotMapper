# OotMapper

A mapping tool for *The Legend of Zelda: Ocarina of Time* entrance randomizer runs. As you discover where each overworld entrance leads, you arrange the region maps on a canvas and draw links between the entrances, building up a picture of the shuffled world. Layouts save to and load from JSON files, so they can be kept and shared.

The repository contains two versions of the same tool:

| | Where | What it is |
| --- | --- | --- |
| **Web app** | [`web/`](web/) | React + TypeScript, runs in any modern browser. Adds **Auto-arrange**. |
| **Desktop app** | [`OotMapper/`](OotMapper/) | The original WPF (.NET Framework 4.8) application. |

Both read and write the same `*.layout.json` and `*.basemap.json` formats, so a layout saved by one opens in the other (with the same basemap).

---

## Web app

### Running it

You need [Node.js](https://nodejs.org/) 22.12 or newer. It was developed on 22.13. Vite itself accepts 20.19+, but the test runner (Vitest) supports 22.12+, 24 and 26+ (not 23 or 25).

```bash
cd web
npm install
npm run dev
```

Then open the address it prints (normally <http://localhost:5173>).

Other commands, all run from `web/`:

| Command | What it does |
| --- | --- |
| `npm run build` | Type-checks, then builds a static site into `web/dist/` |
| `npm run preview` | Serves the built site locally |
| `npm test` | Runs the unit tests (Vitest) |

The build is plain static files and can be hosted anywhere. It assumes it is served from the site root; hosting under a subpath needs Vite's `base` option set in `vite.config.ts`.

### Using it

The canvas starts empty. Pick a region in the dropdown and press **Add** to place it, or press **Load** to open a saved layout (the view zooms to fit the whole map).

| Action | How |
| --- | --- |
| Place a region | Choose it in the dropdown, then **Add**. It lands with its top-left corner at the centre of the view. |
| Move a region | Left-drag it |
| Zoom | Mouse wheel (zooms towards the cursor; 0.15x to 30x) |
| Pan | Hold the **middle** mouse button and drag |
| Link two entrances | Click one entrance, then another. Clicking the same pair again removes the link. |
| Cancel a link you have started | Right-click |
| Save | **Save** downloads `map.layout.json` |
| Load | **Load** opens a `*.layout.json` (it must match the basemap) |
| Start over | **Clear** (asks first) |
| Tidy the map | **Auto-arrange**, then **Undo arrange** to go back |

Only ordinary outdoor entrances and owl drops can be linked. The canvas turns light blue while you are part-way through making a link. Hover an entrance to see its name.

Regions are drawn slightly see-through, so a region hidden under a larger one can still be found and dragged out.

### Auto-arrange

**Auto-arrange** moves the regions around to make the map easier to read. It tries, roughly in order of importance, to:

1. keep links from passing over any entrance other than their own two ends;
2. reduce links crossing each other (crossings close to a right angle are penalised less than shallow ones);
3. keep links from running across regions they do not connect;
4. keep links from running across their own start and end regions;
5. keep regions from overlapping;
6. keep links short, and keep the whole map as small as possible for the window it is shown in.

Things worth knowing:

- **It is deterministic.** The same layout in the same-shaped window always gives the same result. The window's shape (its aspect ratio, rounded to one decimal and limited to between 1:4 and 4:1) is part of the input, so the same layout can arrange differently in a differently shaped window.
- **It is quick.** About 0.7 seconds for the full 21-region map, less for smaller ones. It runs in a background worker, so the page does not freeze.
- **The map is locked while it runs.** Dragging regions, making links, Add, Save, Load and Clear are disabled until it finishes, so the result is always for the layout you are looking at.
- **It is a heuristic, not an optimiser.** It aims for a good result quickly. On a heavily shuffled layout a few crossings usually remain; it never guarantees zero.
- **After arranging, the view zooms to fit the map.** **Undo arrange** puts back both the layout and the view. Undo is only available while the layout is still exactly what Auto-arrange produced; any manual edit removes it.
- The regions' positions change but the links never do.

### Data files

Both files are JSON, in the format the desktop app has always used.

**Basemap** (`web/public/oot.basemap.json`): the region maps and the entrances on each one. It is read-only in the web app.

```json
{
  "Segments": {
    "01_Kokiri": {
      "Size": "200,165.947",
      "Entrances": {
        "Kokiri to Lost Woods": { "EnType": 0, "FractionCoords": { "X": 0.425, "Y": 0.0 } }
      }
    }
  }
}
```

- `Size` is a `"width,height"` string, in model pixels. The region's image is `Images/<id>_L.webp`.
- `EnType` is `0` Outdoor, `1` Owl, `2` Indoor, `3` Grotto, `4` Dungeon.
- `FractionCoords` places the entrance as a fraction (0 to 1) of the region's width and height.

**Layout** (`*.layout.json`): where each region sits, and the links between entrances.

```json
{
  "Positions": { "01_Kokiri": { "X": 407.9, "Y": 352.4 } },
  "Links": [ { "Source": "Kokiri to Lost Woods", "Dest": "Lost Woods to Kokiri (Get Lost)" } ]
}
```

`Positions` are the top-left corner of each region. Links are undirected; by convention an owl link puts the owl in `Source`. A layout only loads against the basemap it was made for, and Load reports an error if it does not match.

Example layouts in `web/public/`:

- `vanilla.layout.json`: the unshuffled world.
- `randomized.layout.json`: a fully shuffled world (see below).
- `randomized.arranged.layout.json`: that same shuffled world after Auto-arrange.

### Generating a shuffled layout

`scripts/generate-randomized-layout.mjs` makes a fully shuffled world. Run it from `web/`:

```bash
npm run generate-layout -- 7
```

The number is a seed; the same seed always gives the same world. The result is written to `public/randomized.layout.json`. The rules:

- Every ordinary exterior entrance is paired with exactly one other. No pair joins two entrances of the same region or repeats a vanilla connection.
- Each owl drop links one-way to a random ordinary entrance in a different region, so that entrance ends up with two links. No two owls share a destination.
- The world does not have to be connected: groups of regions may form separate islands.

### Project layout (`web/`)

```
public/            Basemap, example layouts, region images and icons. The images are WebP
                   conversions of the PNGs in OotMapper/Images (longest side capped at 2048px,
                   about 4 MB in total against about 100 MB for the originals).
scripts/           generate-randomized-layout.mjs, the shuffled-layout generator above
src/
  App.tsx          State, Save/Load, Auto-arrange wiring
  components/      MapCanvas (SVG map), Toolbar
  model/
    types.ts       Data types
    io.ts          Parsing and saving basemaps and layouts
    layout.ts      Adding regions, toggling links, link colours, bounds
    viewport.ts    Zoom, pan and fit-to-view maths
    assets.ts      Image URLs and icon sizes
    arrange.ts     The Auto-arrange search (pure, no browser code)
    arrange.worker.ts / arrangeClient.ts   Runs the search in a Web Worker
```

The model code has no dependency on React or the browser, and has its own tests (`*.test.ts` files next to it).

---

## Desktop app (WPF)

The original application, in `OotMapper/`.

**Requirements:** Windows, Visual Studio with the .NET desktop development workload, and .NET Framework 4.8. The only dependency is Newtonsoft.Json 13.0.4, restored by NuGet.

**Building and running:** open `OotMapper.sln` in Visual Studio, restore packages, and run. It loads `oot.basemap.json` and the region images from the project folder.

**Using it:** the controls are the same as in the web app (drag regions, wheel to zoom, middle-drag to pan, click two entrances to link them, right-click to cancel), with **Add**, **Clear**, **Save** and **Load** along the bottom. It has no Auto-arrange.

**Developer options:** `OotMapper/DevPowers.cs` holds switches, all off by default, that turn on editing of the basemap itself (moving entrances, resizing regions, changing entrance types, saving and loading basemaps). That is how `oot.basemap.json` was authored.

Sample layouts and basemaps used during development are in `TestFiles/`.

---

## Credits

The region map images (in `OotMapper/Images/`, and the WebP copies in `web/public/Images/` made from them) originate from [vgmaps.com](https://www.vgmaps.com/).
---

## Known limitations

- The web app starts with an empty canvas (as the desktop app does); the example layouts have to be opened with **Load**.
- The basemap cannot be edited in the web app, and grottos, indoor entrances and dungeons are shown but cannot be linked.
- Auto-arrange results depend on the window's shape, and are only as good as a quick search allows.
- The web app has not been deployed anywhere, and no licence file has been added yet.
