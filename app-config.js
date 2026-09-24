// Public frontend configuration. Never put credentials or local service URLs here.
window.APP_CONFIG = {
  "app": {
    "title": "ACE MR Studio",
    "welcomeTitle": "Welcome to the ACE MR Studio"
  },
  "area": {
    "bounds": [
      11.936224,
      57.677523,
      12.018278,
      57.699659
    ],
    "sunLocation": {
      "lat": 57.68839377903814,
      "lng": 11.977770568930168,
      "timezone": 1
    },
    "corners": [
      [
        11.98451803339398,
        57.682927961987396
      ],
      [
        11.983585758783713,
        57.6941405253463
      ],
      [
        11.971022042873042,
        57.693840269664186
      ],
      [
        11.971958186071914,
        57.68262783563063
      ]
    ],
    "birdSensors": [
      {
        "id": 1,
        "lat": 57.685827,
        "lng": 11.976563
      },
      {
        "id": 2,
        "lat": 57.690655,
        "lng": 11.981606
      },
      {
        "id": 3,
        "lat": 57.697344,
        "lng": 11.972293
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
        "lng": 11.97776390135823,
        "lat": 57.6883812195459
      },
      "zoom": 16.22141031611213,
      "bearing": -92.58546386659737
    }
  },
  "assets": {
    "media/building-footprints-epc.geojson": "media/building-footprints-epc.geojson",
    "media/building-footprints.geojson": "media/building-footprints.geojson",
    "media/campus_v2.svg": "media/campus_v2.svg",
    "media/sound/XC372879 - Thrush Nightingale - Luscinia luscinia.mp3": "media/sound/XC372879 - Thrush Nightingale - Luscinia luscinia.mp3",
    "media/sound/XC647538 - European Pied Flycatcher - Ficedula hypoleuca.mp3": "media/sound/XC647538 - European Pied Flycatcher - Ficedula hypoleuca.mp3",
    "media/sound/XC900416 - Black Redstart - Phoenicurus ochruros.mp3": "media/sound/XC900416 - Black Redstart - Phoenicurus ochruros.mp3",
    "media/VR-movement.geojson": "media/VR-movement.geojson",
    "media/trees.geojson": "media/trees.geojson",
    "media/sound/rain.mp3": "media/sound/rain.mp3",
    "media/stormwater_dem.tif": "media/stormwater_dem.tif",
    "media/sound/wind.mp3": "media/sound/wind.mp3",
    "media/street-network.geojson": "media/street-network.geojson",
    "media/sound/city.mp3": "media/sound/city.mp3",
    "./media/mesh.stl": "./media/mesh.stl",
    "./media/trees_instanced.glb": "./media/trees_instanced.glb",
    "media/ecom/ecom-buildings.geojson": "media/ecom/ecom-buildings.geojson",
    "media/ecom/ecom-nodes.geojson": "media/ecom/ecom-nodes.geojson",
    "media/ecom/ecom-flows.geojson": "media/ecom/ecom-flows.geojson",
    "media/slideshow/slideshow-config.json": "media/slideshow/slideshow-config.json",
    "media/FCC_DTCC_VR.mp4": "media/FCC_DTCC_VR.mp4"
  },
  "images": {
    "chalmers": "media/chalmers_logo.png",
    "dtcc": "media/dtcc_logo.png",
    "survey": "media/survey_qr.png"
  },
  "disabledLayers": [],
  "transit": {
    "fetchInterval": 3000,
    "transportModes": [
      "tram",
      "bus"
    ]
  }
};
