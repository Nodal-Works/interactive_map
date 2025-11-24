# Slideshow Animation Layer

The slideshow animation layer allows you to display a sequence of media files (images, videos, GIFs, and GeoJSON) fitted to the interactive table bounds with smooth transitions and metadata overlays.

## Features

- **Multiple media types**: PNG, JPG, GIF, MP4 video, and GeoJSON
- **Smooth transitions**: Fade, slide-left, slide-right, zoom, or instant
- **Metadata display**: Show titles, descriptions, and custom legends
- **Auto-advance**: Automatic progression through slides with configurable durations
- **Manual control**: Use arrow keys for navigation (← previous, → next, Esc to stop)
- **Loop mode**: Optionally loop through slides continuously
- **Aspect ratio preservation**: Media is fitted to table bounds while maintaining proportions

## Configuration

Slideshow behavior is controlled by a JSON configuration file located at:
```
media/slideshow/slideshow-config.json
```

### Configuration Structure

```json
{
  "slides": [
    {
      "media": "filename.png",
      "type": "image",
      "duration": 5000,
      "transition": "fade",
      "metadata": {
        "title": "Slide Title",
        "description": "Description of the slide",
        "legend": {
          "items": [
            { "color": "#ff0000", "label": "Label 1" },
            { "color": "#00ff00", "label": "Label 2" }
          ]
        }
      }
    }
  ],
  "settings": {
    "loop": true,
    "autoAdvance": true,
    "showMetadata": true,
    "metadataPosition": "bottom-right",
    "fitMode": "contain"
  }
}
```

### Slide Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `media` | string | Yes | Filename of media in `media/slideshow/` folder |
| `type` | string | Yes | Media type: `"image"`, `"gif"`, `"video"`, or `"geojson"` |
| `duration` | number | Yes | Display duration in milliseconds |
| `transition` | string | No | Transition effect: `"fade"`, `"slide-left"`, `"slide-right"`, `"zoom"`, or `"instant"` (default: "fade") |
| `metadata` | object | No | Metadata to display (see below) |

### Metadata Properties

| Property | Type | Description |
|----------|------|-------------|
| `title` | string | Main title displayed at top |
| `description` | string | Description text below title |
| `legend` | object | Legend with color-coded items |
| `legend.items` | array | Array of `{color, label}` objects |
| `style` | object | (GeoJSON only) Styling for map layers |

### GeoJSON Style Properties

For GeoJSON slides, you can specify styling:

```json
{
  "media": "data.geojson",
  "type": "geojson",
  "metadata": {
    "title": "Geographic Data",
    "style": {
      "fillColor": "#3388ff",
      "fillOpacity": 0.4,
      "strokeColor": "#0066cc",
      "strokeWidth": 2,
      "pointColor": "#ff7800",
      "pointRadius": 5
    }
  }
}
```

### Global Settings

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `loop` | boolean | `true` | Loop back to first slide after last |
| `autoAdvance` | boolean | `true` | Automatically advance through slides |
| `showMetadata` | boolean | `true` | Display metadata overlay |
| `metadataPosition` | string | `"bottom-right"` | Position: `"top-left"`, `"top-right"`, `"bottom-left"`, `"bottom-right"` |
| `fitMode` | string | `"contain"` | How media fits: `"contain"`, `"cover"`, `"stretch"` |

## Supported Media Types

### Image (PNG, JPG)
Static images displayed with the specified duration and transition.

```json
{
  "media": "map-view.png",
  "type": "image",
  "duration": 5000,
  "transition": "fade"
}
```

### GIF
Animated GIFs that loop continuously during their display duration.

```json
{
  "media": "animation.gif",
  "type": "gif",
  "duration": 8000,
  "transition": "slide-left"
}
```

### Video (MP4)
Video files that auto-play (muted). Duration should match or exceed video length.

```json
{
  "media": "simulation.mp4",
  "type": "video",
  "duration": 15000,
  "transition": "fade"
}
```

### GeoJSON
Geographic data displayed directly on the map with styling.

```json
{
  "media": "buildings.geojson",
  "type": "geojson",
  "duration": 7000,
  "transition": "fade",
  "metadata": {
    "title": "Building Footprints",
    "style": {
      "fillColor": "#ff6600",
      "fillOpacity": 0.5
    }
  }
}
```

## Usage

1. **Prepare your media files**: Place all media files in the `media/slideshow/` folder
2. **Create configuration**: Edit `slideshow-config.json` with your slides
3. **Start slideshow**: Click the slideshow button (play icon) in the left sidebar
4. **Navigate**: Use arrow keys to manually control:
   - `→` or `Space`: Next slide
   - `←`: Previous slide
   - `Esc`: Stop slideshow

## Transitions

### Fade
Smooth opacity transition between slides.

### Slide-left / Slide-right
Slides move horizontally across the screen.

### Zoom
Previous slide zooms out while next slide zooms in.

### Instant
No transition, immediate switch.

## Examples

### Simple Image Slideshow

```json
{
  "slides": [
    {
      "media": "photo1.jpg",
      "type": "image",
      "duration": 4000,
      "transition": "fade",
      "metadata": {
        "title": "Aerial View",
        "description": "Overview of the site"
      }
    },
    {
      "media": "photo2.jpg",
      "type": "image",
      "duration": 4000,
      "transition": "slide-left",
      "metadata": {
        "title": "Street Level",
        "description": "Ground perspective"
      }
    }
  ],
  "settings": {
    "loop": true,
    "autoAdvance": true,
    "showMetadata": true,
    "metadataPosition": "bottom-right",
    "fitMode": "contain"
  }
}
```

### Mixed Media with Legend

```json
{
  "slides": [
    {
      "media": "heatmap.png",
      "type": "image",
      "duration": 6000,
      "transition": "fade",
      "metadata": {
        "title": "Temperature Distribution",
        "description": "Simulated temperature across site",
        "legend": {
          "items": [
            { "color": "#d73027", "label": "High (>30°C)" },
            { "color": "#fee08b", "label": "Medium (20-30°C)" },
            { "color": "#1a9850", "label": "Low (<20°C)" }
          ]
        }
      }
    },
    {
      "media": "wind-data.geojson",
      "type": "geojson",
      "duration": 6000,
      "transition": "fade",
      "metadata": {
        "title": "Wind Analysis",
        "description": "Wind flow patterns",
        "style": {
          "fillColor": "#4575b4",
          "fillOpacity": 0.6,
          "strokeColor": "#313695",
          "strokeWidth": 2
        }
      }
    }
  ],
  "settings": {
    "loop": true,
    "autoAdvance": true,
    "showMetadata": true,
    "metadataPosition": "bottom-left",
    "fitMode": "contain"
  }
}
```

## Technical Details

- Media files are preloaded before display for smooth transitions
- Videos are muted and auto-play (required for autoplay in browsers)
- Canvas rendering ensures consistent display across different screen sizes
- GeoJSON layers are added to the map temporarily and removed when slideshow ends
- All media respects the physical table bounds defined in the calibration settings

## Troubleshooting

**Slideshow button doesn't work**
- Check browser console for errors
- Verify `slideshow-config.json` exists and is valid JSON
- Ensure media files exist in `media/slideshow/` folder

**Media not displaying**
- Check file paths are relative to `media/slideshow/`
- Verify media type matches file format
- Check browser console for 404 errors

**Transitions look wrong**
- Try different transition types
- Adjust `fitMode` setting (`contain`, `cover`, or `stretch`)
- Verify media has correct aspect ratio for table

**GeoJSON not showing**
- Verify GeoJSON is valid (use geojson.io to validate)
- Check that geometry coordinates are in the visible map area
- Adjust style properties if needed
