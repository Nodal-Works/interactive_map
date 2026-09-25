// Public Lindholmen presentation configuration. Credentials belong in ignored local configuration.
window.APP_CONFIG = {
  "app": {
    "title": "KultVis Lindholmen",
    "welcomeTitle": "Welcome to KultVis Lindholmen"
  },
  "area": {
    "bounds": [
      11.930785380966121,
      57.70438389307641,
      11.951164514408633,
      57.71161765388635
    ],
    "sunLocation": {
      "lat": 57.707991890705784,
      "lng": 11.941012328565193,
      "timezone": 1
    },
    "corners": [
      [
        11.95173035102645,
        57.704890339867966
      ],
      [
        11.951164514408633,
        57.71161765388635
      ],
      [
        11.93021567126722,
        57.711111076130244
      ],
      [
        11.930785380966121,
        57.70438389307641
      ]
    ],
    "birdSensors": [
      {
        "id": 1,
        "lat": 57.7063,
        "lng": 11.9368
      },
      {
        "id": 2,
        "lat": 57.7092,
        "lng": 11.942
      },
      {
        "id": 3,
        "lat": 57.7104,
        "lng": 11.9482
      }
    ]
  },
  "table": {
    "screenWidth": 111.93,
    "screenHeight": 62.96,
    "tableWidth": 100,
    "tableHeight": 60,
    "tileSize": 20
  },
  "calibration": {
    "path": "map-calibration.json",
    "fallback": {
      "center": {
        "lng": 11.941012328565193,
        "lat": 57.707991890705784
      },
      "zoom": 16.2299329163497,
      "bearing": -2.58546386659737
    },
    "storagePrefix": "interactive_map_lindholmen_"
  },
  "assets": {
    "media/building-footprints-epc.geojson": "media/building-footprints-epc.geojson",
    "media/building-footprints.geojson": "media/building-footprints.geojson",
    "media/sound/XC372879 - Thrush Nightingale - Luscinia luscinia.mp3": "media/sound/XC372879 - Thrush Nightingale - Luscinia luscinia.mp3",
    "media/sound/XC647538 - European Pied Flycatcher - Ficedula hypoleuca.mp3": "media/sound/XC647538 - European Pied Flycatcher - Ficedula hypoleuca.mp3",
    "media/sound/XC900416 - Black Redstart - Phoenicurus ochruros.mp3": "media/sound/XC900416 - Black Redstart - Phoenicurus ochruros.mp3",
    "media/trees.geojson": "media/trees.geojson",
    "media/sound/rain.mp3": "media/sound/rain.mp3",
    "media/stormwater_dem.tif": "media/stormwater_dem.tif",
    "media/sound/wind.mp3": "media/sound/wind.mp3",
    "media/street-network.geojson": "media/street-network.geojson",
    "media/sound/city.mp3": "media/sound/city.mp3",
    "./media/mesh.stl": "./media/mesh.stl",
    "./media/trees_instanced.glb": "./media/trees_instanced.glb",
    "media/slideshow/slideshow-config.json": "media/slideshow/slideshow-config.json"
  },
  "images": {
    "chalmers": "media/chalmers_logo.png",
    "dtcc": "media/dtcc_logo.png",
    "survey": "media/survey_qr.png"
  },
  "disabledLayers": [
    "campus-demo-btn",
    "fcc-demo-btn",
    "ecom-energy-btn"
  ],
  "transit": {
    "fetchInterval": 10000,
    "transportModes": [
      "tram",
      "bus",
      "ferry"
    ]
  },
  "model": {
    "rotation": 0,
    "scaleMultiplier": 0.88,
    "offsetZ": -4
  },
  "presentation": {
    "intro": true
  },
  "raster": {
    "corners": [
      [
        11.93021567126722,
        57.711111076130244
      ],
      [
        11.951164514408633,
        57.71161765388635
      ],
      [
        11.95173035102645,
        57.704890339867966
      ],
      [
        11.930785380966121,
        57.70438389307641
      ]
    ]
  }
};
