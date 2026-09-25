/* Pure visibility geometry; worker-owned spatial indexes. */
(function(root){
'use strict';
class Index {
 constructor(items){this.cells=new Map();this.size=.002;items.forEach((item,i)=>this.visit(item.bbox,key=>{if(!this.cells.has(key))this.cells.set(key,[]);this.cells.get(key).push(i);}));}
 visit(b,fn){for(let x=Math.floor(b.minLng/this.size);x<=Math.floor(b.maxLng/this.size);x++)for(let y=Math.floor(b.minLat/this.size);y<=Math.floor(b.maxLat/this.size);y++)fn(x+','+y);}
 query(b){const result=new Set();this.visit(b,key=>{for(const i of this.cells.get(key)||[])result.add(i);});return result;}
}
function create(obstacles,treeObstacles){
 const buildingIndex=new Index(obstacles),treeIndex=new Index(treeObstacles),DEG2RAD=Math.PI/180,RAY_COUNT=180;
 let MAX_VIEW_DISTANCE=200,HUMAN_FOV=120,USE_HUMAN_FOV=true,INCLUDE_TREES=true,ambientSoundEnabled=false;
  function calculateIsovistFeatures(origin, lookDirection) {
    // Ray casting algorithm to compute visibility polygon
    const rays = [];
    const viewedObstacleIndices = new Set(); // Track which buildings are viewed
    const viewedTreeIndices = new Set(); // Track which trees are viewed
    
    // Determine the viewing angle range
    let startAngle, endAngle, angleStep;
    
    if (USE_HUMAN_FOV && lookDirection) {
      // Calculate the direction the viewer is looking
      const viewBearing = calculateBearing(origin, lookDirection);
      const halfFOV = (HUMAN_FOV / 2) * Math.PI / 180;
      const viewAngle = viewBearing * Math.PI / 180;
      
      // Define the cone of vision
      startAngle = viewAngle - halfFOV;
      endAngle = viewAngle + halfFOV;
      angleStep = (HUMAN_FOV * Math.PI / 180) / RAY_COUNT;
      
      // Add the origin point to create a cone shape
      rays.push({ angle: startAngle, dist: 0 });
    } else {
      // Full 360° view
      startAngle = 0;
      endAngle = 2 * Math.PI;
      angleStep = (2 * Math.PI) / RAY_COUNT;
    }

    // Optimization: Filter obstacles by distance (bbox check)
    // 200m is roughly 0.002 degrees. Using 0.003 as safe margin.
    const latRange = MAX_VIEW_DISTANCE / 110540;
    const range = MAX_VIEW_DISTANCE / (111320 * Math.cos(origin[1]*DEG2RAD)); 
    const viewBbox = {
        minLng: origin[0] - range,
        minLat: origin[1] - latRange,
        maxLng: origin[0] + range,
        maxLat: origin[1] + latRange
    };

    const activeObstacles = [];
    const activeObstacleIndices = [];
    for (const i of buildingIndex.query(viewBbox)) {
        const obs = obstacles[i];
        if (!(obs.bbox.minLng > viewBbox.maxLng || 
              obs.bbox.maxLng < viewBbox.minLng || 
              obs.bbox.minLat > viewBbox.maxLat || 
              obs.bbox.maxLat < viewBbox.minLat)) {
            activeObstacles.push(obs);
            activeObstacleIndices.push(i);
        }
    }
    
    // Filter active trees by distance (bbox check)
    const activeTrees = [];
    const activeTreeIndices = [];
    if (INCLUDE_TREES) {
        for (const i of treeIndex.query(viewBbox)) {
            const tree = treeObstacles[i];
            if (!(tree.bbox.minLng > viewBbox.maxLng || 
                  tree.bbox.maxLng < viewBbox.minLng || 
                  tree.bbox.minLat > viewBbox.maxLat || 
                  tree.bbox.maxLat < viewBbox.minLat)) {
                activeTrees.push(tree);
                activeTreeIndices.push(i);
            }
        }
    }

    // Cast rays within the field of view
    const numRays = Math.ceil((endAngle - startAngle) / angleStep);
    for (let i = 0; i <= numRays; i++) {
      const angle = startAngle + (i * angleStep);
      const rayEnd = destination(origin, MAX_VIEW_DISTANCE, (angle * 180) / Math.PI);

      // Find closest intersection with any building
      let minDistance = MAX_VIEW_DISTANCE;
      let hitObstacleIdx = -1;
      let hitTreeIdx = -1;

      activeObstacles.forEach((obstacle, localIdx) => {
        for(const coords of (obstacle.rings || [obstacle.points])) {

        // Check intersection with each edge of the building polygon
        for (let j = 0; j < coords.length - 1; j++) {
          const edge = [coords[j], coords[j + 1]];
          const intersection = lineIntersection(origin, rayEnd, edge[0], edge[1]);

          if (intersection) {
            const dist = distance(origin, intersection);
            if (dist < minDistance) {
              minDistance = dist;
              hitObstacleIdx = activeObstacleIndices[localIdx];
              hitTreeIdx = -1; // Building takes precedence
            }
          }
        }
      }
      });
      
      // Check intersection with tree circles
      activeTrees.forEach((tree, localIdx) => {
        const intersections = rayCircleIntersection(origin, rayEnd, tree.center, tree.radius);
        if (intersections.length > 0) {
          // Use the closest intersection point
          const dist = distance(origin, intersections[0]);
          if (dist < minDistance) {
            minDistance = dist;
            hitTreeIdx = activeTreeIndices[localIdx];
            hitObstacleIdx = -1; // Tree is closer
          }
        }
      });

      // Track the building that was hit
      if (hitObstacleIdx >= 0) {
        viewedObstacleIndices.add(hitObstacleIdx);
      }
      
      // Track the tree that was hit
      if (hitTreeIdx >= 0) {
        viewedTreeIndices.add(hitTreeIdx);
      }

      rays.push({ angle: angle, dist: minDistance, obstacleIndex: hitObstacleIdx, treeIndex: hitTreeIdx });
    }
    
    // Generate polygons
    const mainPolygonPoints = [];
    const bands = [];
    const numBands = 3;
    
    // 1. Main Polygon
    rays.forEach(ray => {
        if (ray.dist > 0) { // Skip origin point if present
            mainPolygonPoints.push(destination(origin, ray.dist, (ray.angle * 180) / Math.PI));
        }
    });
    
    // Close the polygon
    if (USE_HUMAN_FOV && lookDirection) {
        mainPolygonPoints.push(origin);
        // Ensure start is origin too for closed polygon
        mainPolygonPoints.unshift(origin);
    } else {
        mainPolygonPoints.push(mainPolygonPoints[0]);
    }

    const mainPolygon = {
      type: 'Feature',
      geometry: {
        type: 'Polygon',
        coordinates: [mainPolygonPoints]
      },
      properties: {}
    };

    // 2. Gradient Bands (Stacked)
    for (let b = 0; b < numBands; b++) {
        const limit = (MAX_VIEW_DISTANCE / numBands) * (b + 1);
        const bandPoints = [];
        
        rays.forEach(ray => {
            if (ray.dist > 0) {
                const d = Math.min(ray.dist, limit);
                bandPoints.push(destination(origin, d, (ray.angle * 180) / Math.PI));
            }
        });

        if (USE_HUMAN_FOV && lookDirection) {
            bandPoints.push(origin);
            bandPoints.unshift(origin);
        } else {
            bandPoints.push(bandPoints[0]);
        }

        bands.push({
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [bandPoints]
            },
            properties: { ring: b }
        });
    }

    // 3. Convert viewed obstacle indices to GeoJSON features with original properties
    const viewedBuildings = Array.from(viewedObstacleIndices).map(idx => {
      const obs = obstacles[idx];
      return {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: obs.rings || [obs.points]
        },
        properties: obs.properties || {}
      };
    });
    
    // 3b. Convert viewed tree indices to GeoJSON circle polygons
    const viewedTrees = Array.from(viewedTreeIndices).map(idx => {
      const tree = treeObstacles[idx];
      // Create a circle polygon approximation (12 points)
      const circlePoints = [];
      const numPoints = 12;
      for (let i = 0; i <= numPoints; i++) {
        const angle = (i / numPoints) * 360;
        circlePoints.push(destination(tree.center, tree.radius, angle));
      }
      return {
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [circlePoints]
        },
        properties: {
          ...tree.properties,
          radius: tree.radius,
          type: 'tree'
        }
      };
    });

    // 4. Calculate statistics for the controller chart
    const stats = {
      totalRays: rays.filter(ray=>ray.obstacleIndex!==undefined).length,
      openRays: 0,
      treeRays: 0,
      buildingTypeRays: {},
      buildingTypeCounts: {}
    };
    
    // Count rays that hit max distance (open area) vs buildings/trees by type
    rays.forEach(ray => {
      if (ray.dist >= MAX_VIEW_DISTANCE * 0.99) {
        stats.openRays++;
      } else if (ray.treeIndex !== undefined && ray.treeIndex >= 0) {
        // Ray hit a tree
        stats.treeRays++;
      } else if (ray.obstacleIndex !== undefined && ray.obstacleIndex >= 0) {
        // Get the building type for this ray's obstacle
        const obs = obstacles[ray.obstacleIndex];
        const buildingType = obs?.properties?.objekttyp || 'Unknown';
        stats.buildingTypeRays[buildingType] = (stats.buildingTypeRays[buildingType] || 0) + 1;
      }
    });
    
    // Count buildings by type (for info only)
    viewedBuildings.forEach(building => {
      const buildingType = building.properties.objekttyp || 'Unknown';
      stats.buildingTypeCounts[buildingType] = (stats.buildingTypeCounts[buildingType] || 0) + 1;
    });
    
    // Calculate visible area percentage (simplified as ratio of rays hitting max distance)
    stats.openAreaPercent = ((stats.openRays / stats.totalRays) * 100).toFixed(1);
    stats.totalBuildings = viewedBuildings.length;
    
    // Add tree stats
    stats.totalTrees = viewedTrees.length;
    stats.treesEnabled = INCLUDE_TREES;
    
    // Add green view factor (GVF) - ratio of tree rays to total rays
    stats.greenViewFactor = numRays > 0 ? (stats.treeRays / stats.totalRays) : 0;
    stats.greenViewFactorPercent = (stats.greenViewFactor * 100).toFixed(1);
    stats.ambientSoundEnabled = ambientSoundEnabled;
    
    // Broadcast stats to controller


    return { mainPolygon, bands, viewedBuildings, viewedTrees, stats };
  }
  
  // Ray-circle intersection helper
  function rayCircleIntersection(rayStart, rayEnd, circleCenter, radiusMeters) {
    // Convert to approximate local coordinates (meters)
    const toLocal = (point) => {
      const latMid = (rayStart[1] + circleCenter[1]) / 2;
      const metersPerDegLng = 111320 * Math.cos(latMid * Math.PI / 180);
      const metersPerDegLat = 110540;
      return [
        (point[0] - rayStart[0]) * metersPerDegLng,
        (point[1] - rayStart[1]) * metersPerDegLat
      ];
    };
    
    const fromLocal = (point) => {
      const latMid = (rayStart[1] + circleCenter[1]) / 2;
      const metersPerDegLng = 111320 * Math.cos(latMid * Math.PI / 180);
      const metersPerDegLat = 110540;
      return [
        point[0] / metersPerDegLng + rayStart[0],
        point[1] / metersPerDegLat + rayStart[1]
      ];
    };
    
    const p1 = toLocal(rayStart); // [0, 0]
    const p2 = toLocal(rayEnd);
    const c = toLocal(circleCenter);
    const r = radiusMeters;
    
    // Direction vector
    const dx = p2[0] - p1[0];
    const dy = p2[1] - p1[1];
    
    // Quadratic coefficients
    const a = dx * dx + dy * dy;
    const b = 2 * (dx * (p1[0] - c[0]) + dy * (p1[1] - c[1]));
    const cc = (p1[0] - c[0]) ** 2 + (p1[1] - c[1]) ** 2 - r * r;
    
    const discriminant = b * b - 4 * a * cc;
    
    if (discriminant < 0) return [];
    
    const intersections = [];
    const sqrtDisc = Math.sqrt(discriminant);
    
    const t1 = (-b - sqrtDisc) / (2 * a);
    const t2 = (-b + sqrtDisc) / (2 * a);
    
    // Check if intersections are on the ray segment (t between 0 and 1)
    if (t1 >= 0 && t1 <= 1) {
      const ix = p1[0] + t1 * dx;
      const iy = p1[1] + t1 * dy;
      intersections.push(fromLocal([ix, iy]));
    }
    if (t2 >= 0 && t2 <= 1 && Math.abs(t2 - t1) > 0.001) {
      const ix = p1[0] + t2 * dx;
      const iy = p1[1] + t2 * dy;
      intersections.push(fromLocal([ix, iy]));
    }
    
    // Sort by distance from ray start
    intersections.sort((a, b) => distance(rayStart, a) - distance(rayStart, b));
    
    return intersections;
  }

  // Collision detection and position validation
  function getValidPosition(position) {
    // Check if position is inside any building
    const insideBuilding = isPointInsideAnyBuilding(position);
    
    if (!insideBuilding) {
      return position;
    }
    
    // If inside a building, find the nearest valid position outside
    return findNearestValidPosition(position);
  }

  function isPointInsideAnyBuilding(point) {
    for (const idx of buildingIndex.query({minLng:point[0],maxLng:point[0],minLat:point[1],maxLat:point[1]})) {
      const obstacle=obstacles[idx];
      if (isPointInPolygon(point, obstacle.points) && !(obstacle.rings || []).slice(1).some(ring=>isPointInPolygon(point,ring))) {
        return true;
      }
    }
    return false;
  }

  function isPointInPolygon(point, polygon) {
    // Ray casting algorithm for point-in-polygon test
    const x = point[0], y = point[1];
    let inside = false;
    
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];
      
      const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      
      if (intersect) inside = !inside;
    }
    
    return inside;
  }

  function findNearestValidPosition(position) {
    // Search in a spiral pattern for the nearest valid position
    const searchRadius = 5; // meters
    const searchSteps = 16; // number of directions to check
    
    for (let radius = searchRadius; radius <= MAX_VIEW_DISTANCE; radius += searchRadius) {
      for (let i = 0; i < searchSteps; i++) {
        const angle = (i / searchSteps) * 360;
        const testPos = destination(position, radius, angle);
        
        if (!isPointInsideAnyBuilding(testPos)) {
          return testPos;
        }
      }
    }
    
    // If no valid position found, return original (shouldn't happen)
    console.warn('Could not find valid position outside buildings');
    return position;
  }

  // Geometric helper functions
  function calculateBearing(from, to) {
    const dLon = to[0] - from[0];
    const y = Math.sin(dLon * Math.PI / 180) * Math.cos(to[1] * Math.PI / 180);
    const x = Math.cos(from[1] * Math.PI / 180) * Math.sin(to[1] * Math.PI / 180) -
              Math.sin(from[1] * Math.PI / 180) * Math.cos(to[1] * Math.PI / 180) * 
              Math.cos(dLon * Math.PI / 180);
    const bearing = Math.atan2(y, x) * 180 / Math.PI;
    return (bearing + 360) % 360;
  }

  function destination(origin, distMeters, bearing) {
    // Fast flat-earth approximation (accurate within 0.1% for distances < 1km)
    const brng = bearing * DEG2RAD;
    const cosLat = Math.cos(origin[1] * DEG2RAD);
    return [
      origin[0] + Math.sin(brng) * distMeters / (111320 * cosLat),
      origin[1] + Math.cos(brng) * distMeters / 110540
    ];
  }

  function distance(point1, point2) {
    // Fast flat-earth approximation (accurate within 0.1% for distances < 1km)
    const latMid = (point1[1] + point2[1]) * 0.5 * DEG2RAD;
    const cosLat = Math.cos(latMid);
    const dx = (point2[0] - point1[0]) * 111320 * cosLat;
    const dy = (point2[1] - point1[1]) * 110540;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function lineIntersection(p1, p2, p3, p4) {
    // Line segment intersection using parametric equations
    const x1 = p1[0], y1 = p1[1];
    const x2 = p2[0], y2 = p2[1];
    const x3 = p3[0], y3 = p3[1];
    const x4 = p4[0], y4 = p4[1];

    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 1e-18) return null; // Parallel lines

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return [
        x1 + t * (x2 - x1),
        y1 + t * (y2 - y1)
      ];
    }

    return null;
  }


 return {calculate(position,cursor,options={}){MAX_VIEW_DISTANCE=options.radius||200;HUMAN_FOV=options.fov||120;USE_HUMAN_FOV=options.humanFov!==false;INCLUDE_TREES=options.trees!==false;ambientSoundEnabled=!!options.ambientSound;const origin=getValidPosition(position);return {...calculateIsovistFeatures(origin,cursor),origin};},contains:isPointInsideAnyBuilding};
}
root.MR_ISOVIST_CORE={create,Index};if(typeof module!=='undefined')module.exports=root.MR_ISOVIST_CORE;
})(typeof self!=='undefined'?self:globalThis);
