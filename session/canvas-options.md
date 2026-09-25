# Canvas library comparison

Reviewed 24 September 2026. This release retains the existing SVG map overlay.

The best first step for MR Studio is **Perfect Freehand for smoother strokes**,
with marker symbols added to the existing annotation model. If a broad palette
of decorative brushes is the priority, **Fabric.js** is the stronger candidate.
These recommendations are integration judgments, not performance benchmarks.

| Option | Brushes and markers | Fit with MR Studio | Migration effort |
| --- | --- | --- | --- |
| Perfect Freehand | Pressure-sensitive strokes with smoothing, thinning and taper options. Marker symbols remain application code. | Outputs outline points for SVG or canvas; retains our SVG overlay and map projection. Keep touch input, selection and undo in the current application. | Low to moderate: add stroke style/pressure data, extend validation, reproject before rendering, and retain author-level undo. |
| Fabric.js | Built-in pencil, circle, spray and pattern brushes; custom objects can supply marker symbols. | Object editing is useful, but map coordinates, two-finger navigation, permissions and shared edits still need adapters. | High: replace overlay rendering and editing, translate objects to geographic data, and preserve deterministic shared brush output. |
| Konva | Free drawing with line objects and compositing; application-defined shapes can be markers. A brush palette would largely be custom work. | Useful canvas scene graph; geographic projection and session semantics remain our responsibility. | High for the brush benefit: replace rendering and hit testing while retaining host-authoritative operations. |

Feature references: [Perfect Freehand usage and rendering](https://github.com/steveruizok/perfect-freehand),
[Fabric drawing and brushes](https://www.fabricjs.com/docs/core-concepts/),
[Konva free-drawing example](https://konvajs.org/docs/react/Free_Drawing.html).

All three use MIT licenses: [Perfect Freehand](https://github.com/steveruizok/perfect-freehand/blob/main/LICENSE),
[Fabric.js](https://github.com/fabricjs/fabric.js/blob/master/LICENSE),
and [Konva](https://github.com/konvajs/konva/blob/master/LICENSE).
Retain the applicable copyright and license notices when distributing a dependency.

A follow-up prototype should compare pen, highlighter and broad marker strokes
on a real phone and stylus, with pin/arrow/comment marker symbols. Measure latency,
message size and long-session rendering before choosing a replacement. Keep the
existing longitude/latitude source data, author permissions, edit-conflict checks,
and undo/redo; a library's local history is not a substitute for session history.
Any new stored brush properties must be validated and shipped with a coordinated
host/client release. Test zoom, bearing, calibration changes, reconnect, and the
same annotation appearing consistently on multiple devices.
