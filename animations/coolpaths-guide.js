// Shared by the map and controller so tour navigation stays in sync.
window.COOLPATHS_GUIDE = Object.freeze([
  { title: 'Build the city', short: 'City', layer: 'buildings', choices: ['buildings', 'terrain'],
    body: 'Footprints and heights form the city’s geometry. Buildings block sunlight and reduce the amount of visible sky. Some heights are inferred.',
    hint: 'Building color shows height at the fixed projection viewpoint. Try ground elevation to see the terrain underneath.' },
  { title: 'Add nature', short: 'Nature', layer: 'canopy', choices: ['canopy', 'ndvi', 'water', 'albedo'],
    body: 'Tree crowns intercept sunlight. Vegetation and water help identify surface types and the amount of sunlight they reflect.',
    hint: 'Switch between canopy height, vegetation, water and surface reflectivity.' },
  { title: 'Move the sun', short: 'Sun', layer: 'shade', choices: ['shade', 'direct', 'svf'],
    body: 'Sun position changes each hour. Buildings and trees cast moving shadows; sky view describes how enclosed a location is.',
    hint: 'Scrub the study hour to move the shadows. The amber ray points toward the sun.' },
  { title: 'Model comfort', short: 'Comfort', layer: 'mrt', choices: ['mrt', 'pet', 'direct', 'svf'],
    body: 'Radiation is combined with air temperature, humidity and wind to estimate PET: an equivalent temperature expressing outdoor thermal comfort.',
    hint: 'Compare radiant temperature with PET. Both are model outputs under clear-sky sunlight.' },
  { title: 'Connect the streets', short: 'Streets', layer: 'streets', choices: ['streets'],
    body: 'The walking network samples the PET surface. Each street receives a heat cost from its temperature and length.',
    hint: 'Street colors show mean PET for this hour. Click a location to inspect the underlying cell.' },
  { title: 'Take a cooler walk', short: 'Walk', layer: 'routes', choices: ['routes'],
    body: 'Compare the shortest path with the route that minimizes cumulative heat exposure, within a 50% distance detour.',
    hint: 'Your selected route is used if available; otherwise a real example is calculated from the walking graph.' }
]);
