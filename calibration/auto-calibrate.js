/**
 * Camera-based Auto-Calibration System
 * =====================================
 * Uses computer vision to detect ArUco markers on the physical table
 * and automatically adjusts map zoom/rotation/center to align the
 * digital overlay with the physical model.
 * 
 * This version detects 4 ArUco markers (DICT_4X4_50, IDs 0-3) placed at 
 * corners of a 20x20cm reference tile. Works with grayscale printing.
 * 
 * Requirements:
 * - 4 ArUco markers printed on a 20x20cm tile
 * - Markers at corners: #0=TL, #1=TR, #2=BR, #3=BL
 * - Camera positioned to view the tile area
 */

class AutoCalibrator {
    constructor(options = {}) {
        // Configuration
        this.config = {
            // Physical table dimensions in cm
            tableWidth: options.tableWidth || 100,
            tableHeight: options.tableHeight || 60,
            
            // Reference tile dimensions in cm (defined by ArUco markers)
            tileSize: options.tileSize || 20,
            
            // Tile position from top-left corner of table (cm)
            tileOffsetX: options.tileOffsetX || 5,
            tileOffsetY: options.tileOffsetY || 5,
            
            // Screen dimensions in cm
            screenWidth: options.screenWidth || 111.93,
            screenHeight: options.screenHeight || 62.96,
            
            // ArUco detection settings
            markerSizeMin: 15,  // Minimum marker size in pixels
            markerSizeMax: 250, // Maximum marker size in pixels
            
            // Calibration settings
            numSamples: options.numSamples || 10,
            sampleInterval: options.sampleInterval || 150, // ms
            
            // Convergence thresholds
            positionThreshold: 5, // pixels
            maxIterations: 15,
            
            // Debug mode
            debug: options.debug !== false // Default true
        };
        
        // ArUco 4x4 patterns (DICT_4X4_50, IDs 0-3)
        // Inner 4x4 data bits only (border is always black)
        // 0 = black (dark), 1 = white (light) - matches detection threshold
        // Extracted from the 6x6 patterns, rows 1-4, cols 1-4
        this.arucoPatterns = {
            // From HTML: inner where 1=black in HTML, inverted here so 0=black
            // HTML 0 inner (1=black): [[0,1,0,0],[1,0,1,1],[0,1,1,0],[0,1,0,0]]
            0: [[1,0,1,1],[0,1,0,0],[1,0,0,1],[1,0,1,1]],
            // HTML 1 inner (1=black): [[1,0,1,1],[0,0,0,1],[1,1,1,0],[0,0,1,1]]
            1: [[0,1,0,0],[1,1,1,0],[0,0,0,1],[1,1,0,0]],
            // HTML 2 inner (1=black): [[1,0,0,0],[0,1,0,0],[0,0,0,1],[1,0,0,1]]
            2: [[0,1,1,1],[1,0,1,1],[1,1,1,0],[0,1,1,0]],
            // HTML 3 inner (1=black): [[0,0,0,0],[1,1,0,0],[0,0,1,1],[0,1,1,0]]
            3: [[1,1,1,1],[0,0,1,1],[1,1,0,0],[1,0,0,1]]
        };
        
        // State
        this.video = null;
        this.canvas = null;
        this.ctx = null;
        this.isCalibrating = false;
        this.stream = null;
        
        // Callbacks
        this.onProgress = null;
        this.onDebugFrame = null;
        this.onStatusUpdate = null;
        
        // Current calibration
        this.currentCalibration = null;
    }

    /**
     * Start camera capture
     */
    async startCamera(deviceId = null) {
        try {
            this.updateStatus('Requesting camera access...');
            
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    deviceId: deviceId ? { exact: deviceId } : undefined
                }
            };
            
            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            
            this.video = document.createElement('video');
            this.video.srcObject = this.stream;
            this.video.autoplay = true;
            this.video.playsInline = true;
            
            await new Promise((resolve, reject) => {
                this.video.onloadedmetadata = () => {
                    this.video.play().then(resolve).catch(reject);
                };
                setTimeout(() => reject(new Error('Video load timeout')), 5000);
            });
            
            // Create processing canvas
            this.canvas = document.createElement('canvas');
            this.canvas.width = this.video.videoWidth;
            this.canvas.height = this.video.videoHeight;
            this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
            
            this.log(`Camera started: ${this.canvas.width}x${this.canvas.height}`);
            this.updateStatus(`Camera ready: ${this.canvas.width}x${this.canvas.height}`);
            return true;
        } catch (err) {
            this.log('Camera error: ' + err.message);
            this.updateStatus('Camera error: ' + err.message);
            throw new Error('Could not access camera: ' + err.message);
        }
    }

    /**
     * Get list of available cameras
     */
    async getCameras() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            return devices
                .filter(d => d.kind === 'videoinput')
                .map((d, i) => ({
                    deviceId: d.deviceId,
                    label: d.label || `Camera ${i + 1}`
                }));
        } catch (err) {
            return [];
        }
    }

    /**
     * Stop camera
     */
    stopCamera() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        this.video = null;
        this.canvas = null;
    }

    /**
     * Create grayscale array from image data
     */
    toGrayscale(imageData) {
        const data = imageData.data;
        const w = imageData.width;
        const h = imageData.height;
        const gray = new Uint8Array(w * h);
        
        for (let i = 0; i < w * h; i++) {
            const j = i * 4;
            gray[i] = Math.round((data[j] * 0.299 + data[j + 1] * 0.587 + data[j + 2] * 0.114));
        }
        return gray;
    }

    /**
     * Build integral image for fast box sum computation
     */
    buildIntegralImage(gray, w, h) {
        const integral = new Uint32Array((w + 1) * (h + 1));
        const iw = w + 1;
        
        for (let y = 0; y < h; y++) {
            let rowSum = 0;
            for (let x = 0; x < w; x++) {
                rowSum += gray[y * w + x];
                integral[(y + 1) * iw + (x + 1)] = rowSum + integral[y * iw + (x + 1)];
            }
        }
        return integral;
    }

    /**
     * Apply adaptive threshold using integral image - O(1) per pixel instead of O(blockSize²)
     */
    adaptiveThreshold(gray, w, h, blockSize = 15) {
        const binary = new Uint8Array(w * h);
        const halfBlock = Math.floor(blockSize / 2);
        
        // Build integral image for O(1) box sum queries
        const integral = this.buildIntegralImage(gray, w, h);
        const iw = w + 1;
        
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                // Clamp box coordinates
                const x1 = Math.max(0, x - halfBlock);
                const y1 = Math.max(0, y - halfBlock);
                const x2 = Math.min(w - 1, x + halfBlock);
                const y2 = Math.min(h - 1, y + halfBlock);
                
                const count = (x2 - x1 + 1) * (y2 - y1 + 1);
                
                // Sum using integral image: I(D) - I(B) - I(C) + I(A)
                const sum = integral[(y2 + 1) * iw + (x2 + 1)]
                          - integral[(y1) * iw + (x2 + 1)]
                          - integral[(y2 + 1) * iw + (x1)]
                          + integral[(y1) * iw + (x1)];
                
                const mean = sum / count;
                const idx = y * w + x;
                // Pixel is "dark" if significantly darker than local average
                binary[idx] = gray[idx] < mean - 10 ? 0 : 255;
            }
        }
        return binary;
    }

    /**
     * Find marker candidates by scanning for square-like patterns
     * Uses a sliding window approach to find potential 6x6 marker grids
     */
    findMarkerCandidates(gray, binary, w, h) {
        const candidates = [];
        const minSize = this.config.markerSizeMin;
        const maxSize = this.config.markerSizeMax;
        
        // Scan with fewer window sizes for better performance
        for (let size = minSize; size <= maxSize; size += 15) {
            const step = Math.max(8, Math.floor(size / 4));
            
            for (let y = 0; y < h - size; y += step) {
                for (let x = 0; x < w - size; x += step) {
                    // Check if this could be a marker (has black border with lighter interior)
                    if (this.hasBlackBorder(gray, w, x, y, size)) {
                        candidates.push({
                            x, y,
                            width: size,
                            height: size,
                            centerX: x + size / 2,
                            centerY: y + size / 2
                        });
                        // Skip ahead to avoid overlapping candidates
                        x += size / 2;
                    }
                }
            }
        }
        
        // Remove overlapping candidates, keep best scoring ones
        return this.filterOverlappingCandidates(candidates, gray, w);
    }

    /**
     * Check if a region has a black border (characteristic of ArUco markers)
     * Uses grayscale directly with local contrast comparison
     */
    hasBlackBorder(gray, w, x, y, size) {
        const cellSize = size / 6;
        let borderSum = 0;
        let borderCount = 0;
        let innerSum = 0;
        let innerCount = 0;
        
        // Sample border cells
        for (let i = 0; i < 6; i++) {
            for (let j = 0; j < 6; j++) {
                const px = Math.floor(x + (j + 0.5) * cellSize);
                const py = Math.floor(y + (i + 0.5) * cellSize);
                
                if (px < 0 || px >= w || py < 0) continue;
                
                const val = gray[py * w + px];
                
                if (i === 0 || i === 5 || j === 0 || j === 5) {
                    // Border cell
                    borderSum += val;
                    borderCount++;
                } else {
                    // Inner cell
                    innerSum += val;
                    innerCount++;
                }
            }
        }
        
        if (borderCount === 0 || innerCount === 0) return false;
        
        const borderAvg = borderSum / borderCount;
        const innerAvg = innerSum / innerCount;
        
        // Border should be darker than inner (at least 20 levels difference)
        // and border should be reasonably dark (< 150)
        return borderAvg < innerAvg - 15 && borderAvg < 180;
    }

    /**
     * Filter overlapping candidates, keeping the best ones
     */
    filterOverlappingCandidates(candidates, gray, w) {
        if (candidates.length === 0) return [];
        
        // Score each candidate by contrast
        const scored = candidates.map(c => ({
            ...c,
            score: this.scoreCandidate(gray, w, c)
        }));
        
        // Sort by score descending
        scored.sort((a, b) => b.score - a.score);
        
        // Non-maximum suppression
        const kept = [];
        for (const c of scored) {
            let dominated = false;
            for (const k of kept) {
                const overlapX = Math.max(0, Math.min(c.x + c.width, k.x + k.width) - Math.max(c.x, k.x));
                const overlapY = Math.max(0, Math.min(c.y + c.height, k.y + k.height) - Math.max(c.y, k.y));
                const overlapArea = overlapX * overlapY;
                const cArea = c.width * c.height;
                
                if (overlapArea > cArea * 0.3) {
                    dominated = true;
                    break;
                }
            }
            if (!dominated) {
                kept.push(c);
            }
        }
        
        return kept;
    }

    /**
     * Score a candidate by how well it matches marker characteristics
     * Higher score = more likely to be a valid marker
     */
    scoreCandidate(gray, w, c) {
        const cellSize = c.width / 6;
        let borderSum = 0, borderCount = 0;
        let innerSum = 0, innerCount = 0;
        
        // Sample all cells
        for (let i = 0; i < 6; i++) {
            for (let j = 0; j < 6; j++) {
                const px = Math.floor(c.x + (j + 0.5) * cellSize);
                const py = Math.floor(c.y + (i + 0.5) * cellSize);
                
                if (px < 0 || px >= w) continue;
                
                const val = gray[py * w + px];
                
                if (i === 0 || i === 5 || j === 0 || j === 5) {
                    borderSum += val;
                    borderCount++;
                } else {
                    innerSum += val;
                    innerCount++;
                }
            }
        }
        
        if (borderCount === 0 || innerCount === 0) return 0;
        
        const borderAvg = borderSum / borderCount;
        const innerAvg = innerSum / innerCount;
        
        // Score based on: dark border + contrast with inner
        const contrast = innerAvg - borderAvg;
        const darkness = 255 - borderAvg;
        
        return contrast + darkness * 0.5;
    }

    /**
     * Try to identify ArUco marker ID from a candidate region
     * Uses adaptive local thresholding for better lighting tolerance
     */
    identifyMarker(gray, w, h, candidate) {
        const { x, y, width, height } = candidate;
        
        // Sample the inner 4x4 grid (skip the border)
        const cellW = width / 6;
        const cellH = height / 6;
        const grid = [];
        
        // Collect all sample values first to determine local threshold
        const samples = [];
        for (let row = 0; row < 4; row++) {
            for (let col = 0; col < 4; col++) {
                const cx = Math.floor(x + (col + 1.5) * cellW);
                const cy = Math.floor(y + (row + 1.5) * cellH);
                
                // Average a small region
                let sum = 0, count = 0;
                for (let dy = -2; dy <= 2; dy++) {
                    for (let dx = -2; dx <= 2; dx++) {
                        const px = cx + dx;
                        const py = cy + dy;
                        if (px >= 0 && px < w && py >= 0 && py < h) {
                            sum += gray[py * w + px];
                            count++;
                        }
                    }
                }
                samples.push(sum / count);
            }
        }
        
        // Use median as threshold (more robust to outliers)
        const sorted = [...samples].sort((a, b) => a - b);
        const threshold = sorted[Math.floor(sorted.length / 2)];
        
        // Build grid using local threshold
        for (let row = 0; row < 4; row++) {
            grid[row] = [];
            for (let col = 0; col < 4; col++) {
                // 0 = black, 1 = white
                grid[row][col] = samples[row * 4 + col] > threshold ? 1 : 0;
            }
        }
        
        // Compare with known patterns (and rotations)
        for (let id = 0; id < 4; id++) {
            for (let rotation = 0; rotation < 4; rotation++) {
                const pattern = this.rotatePattern(this.arucoPatterns[id], rotation);
                if (this.matchPattern(grid, pattern)) {
                    return { id, rotation, grid };
                }
            }
        }
        
        return null;
    }

    /**
     * Rotate a 4x4 pattern by 90 degrees * times
     */
    rotatePattern(pattern, times) {
        let result = pattern;
        for (let t = 0; t < times; t++) {
            const rotated = [];
            for (let i = 0; i < 4; i++) {
                rotated[i] = [];
                for (let j = 0; j < 4; j++) {
                    rotated[i][j] = result[3 - j][i];
                }
            }
            result = rotated;
        }
        return result;
    }

    /**
     * Check if two 4x4 patterns match (with tolerance for 1 mismatched cell)
     */
    matchPattern(a, b) {
        let mismatches = 0;
        for (let i = 0; i < 4; i++) {
            for (let j = 0; j < 4; j++) {
                if (a[i][j] !== b[i][j]) {
                    mismatches++;
                    if (mismatches > 1) return false; // Allow max 1 mismatch
                }
            }
        }
        return true;
    }

    /**
     * Detect ArUco markers in the current frame
     */
    detectArucoMarkers() {
        if (!this.video || !this.ctx) return null;
        
        // Capture frame
        this.ctx.drawImage(this.video, 0, 0);
        const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
        const w = this.canvas.width;
        const h = this.canvas.height;
        
        // Convert to grayscale
        const gray = this.toGrayscale(imageData);
        
        // Apply adaptive thresholding for lighting tolerance
        const binary = this.adaptiveThreshold(gray, w, h, 21);
        
        // Find marker candidates
        const candidates = this.findMarkerCandidates(gray, binary, w, h);
        
        if (this.config.debug) {
            this.log(`Found ${candidates.length} marker candidates`);
        }
        
        // Try to identify each candidate
        const markers = {};
        
        for (const candidate of candidates) {
            const result = this.identifyMarker(gray, w, h, candidate);
            if (result && !markers[result.id]) {
                markers[result.id] = {
                    id: result.id,
                    center: { x: candidate.centerX, y: candidate.centerY },
                    bounds: candidate,
                    rotation: result.rotation
                };
                if (this.config.debug) {
                    this.log(`Identified marker #${result.id} at (${Math.round(candidate.centerX)}, ${Math.round(candidate.centerY)})`);
                }
            }
        }
        
        return markers;
    }

    /**
     * Order markers into corners based on their IDs
     * #0=TL, #1=TR, #2=BR, #3=BL
     */
    orderMarkers(markers) {
        if (!markers[0] || !markers[1] || !markers[2] || !markers[3]) {
            return null;
        }
        
        return {
            tl: markers[0],
            tr: markers[1],
            br: markers[2],
            bl: markers[3]
        };
    }

    /**
     * Calculate tile properties from 4 corner markers
     */
    calculateTileFromMarkers(orderedMarkers) {
        const { tl, tr, br, bl } = orderedMarkers;
        
        // Calculate center
        const center = {
            x: (tl.center.x + tr.center.x + br.center.x + bl.center.x) / 4,
            y: (tl.center.y + tr.center.y + br.center.y + bl.center.y) / 4
        };
        
        // Calculate width (average of top and bottom edges)
        const topWidth = Math.hypot(tr.center.x - tl.center.x, tr.center.y - tl.center.y);
        const bottomWidth = Math.hypot(br.center.x - bl.center.x, br.center.y - bl.center.y);
        const width = (topWidth + bottomWidth) / 2;
        
        // Calculate height (average of left and right edges)
        const leftHeight = Math.hypot(bl.center.x - tl.center.x, bl.center.y - tl.center.y);
        const rightHeight = Math.hypot(br.center.x - tr.center.x, br.center.y - tr.center.y);
        const height = (leftHeight + rightHeight) / 2;
        
        // Calculate rotation from top edge
        const angle = Math.atan2(
            tr.center.y - tl.center.y,
            tr.center.x - tl.center.x
        );
        
        return {
            corners: [tl.center, tr.center, br.center, bl.center],
            center,
            width,
            height,
            angle,
            angleDeg: angle * 180 / Math.PI
        };
    }

    /**
     * Draw debug visualization
     */
    drawDebugFrame(markers, detectedTile, expectedTile) {
        if (!this.canvas) return;
        
        const debugCanvas = document.createElement('canvas');
        debugCanvas.width = this.canvas.width;
        debugCanvas.height = this.canvas.height;
        const ctx = debugCanvas.getContext('2d');
        
        // Draw camera frame
        ctx.drawImage(this.canvas, 0, 0);
        
        // Draw detected markers
        if (markers) {
            Object.values(markers).forEach(marker => {
                const { bounds, id, center } = marker;
                
                // Draw bounding box
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 2;
                ctx.strokeRect(bounds.x, bounds.y, bounds.width, bounds.height);
                
                // Draw center
                ctx.beginPath();
                ctx.arc(center.x, center.y, 5, 0, Math.PI * 2);
                ctx.fillStyle = '#00ff00';
                ctx.fill();
                
                // Draw ID label
                ctx.font = 'bold 14px Arial';
                ctx.fillStyle = '#00ff00';
                ctx.strokeStyle = '#000';
                ctx.lineWidth = 3;
                ctx.strokeText(`#${id}`, bounds.x, bounds.y - 5);
                ctx.fillText(`#${id}`, bounds.x, bounds.y - 5);
            });
        }
        
        // Draw detected tile outline
        if (detectedTile && detectedTile.corners) {
            ctx.strokeStyle = '#00ff00';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(detectedTile.corners[0].x, detectedTile.corners[0].y);
            for (let i = 1; i < 4; i++) {
                ctx.lineTo(detectedTile.corners[i].x, detectedTile.corners[i].y);
            }
            ctx.closePath();
            ctx.stroke();
        }
        
        // Draw expected tile position (red dashed)
        if (expectedTile && expectedTile.corners) {
            ctx.strokeStyle = '#ff0000';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(expectedTile.corners[0].x, expectedTile.corners[0].y);
            for (let i = 1; i < 4; i++) {
                ctx.lineTo(expectedTile.corners[i].x, expectedTile.corners[i].y);
            }
            ctx.closePath();
            ctx.stroke();
            ctx.setLineDash([]);
        }
        
        // Draw info overlay
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(10, 10, 300, 100);
        ctx.font = '14px monospace';
        ctx.fillStyle = '#00ff00';
        ctx.fillText('ArUco Marker Detection', 20, 30);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(`Status: ${this.isCalibrating ? 'Calibrating...' : 'Ready'}`, 20, 50);
        
        const foundIds = markers ? Object.keys(markers).map(Number).sort() : [];
        ctx.fillText(`Markers: ${foundIds.length}/4 [${foundIds.join(', ')}]`, 20, 70);
        
        if (detectedTile) {
            ctx.fillText(`Tile: ${detectedTile.width.toFixed(0)}×${detectedTile.height.toFixed(0)}px`, 20, 90);
        }
        
        if (this.onDebugFrame) {
            this.onDebugFrame(debugCanvas);
        }
        
        return debugCanvas;
    }

    /**
     * Collect marker detection samples
     */
    async collectMarkerSamples() {
        const samples = [];
        const numSamples = this.config.numSamples;
        
        for (let i = 0; i < numSamples && this.isCalibrating; i++) {
            await new Promise(r => setTimeout(r, this.config.sampleInterval));
            
            const markers = this.detectArucoMarkers();
            const ordered = this.orderMarkers(markers);
            
            if (ordered) {
                const tile = this.calculateTileFromMarkers(ordered);
                samples.push(tile);
            }
            
            this.drawDebugFrame(markers, ordered ? this.calculateTileFromMarkers(ordered) : null, null);
            
            if (this.onProgress) {
                this.onProgress({
                    phase: 'detecting',
                    sample: i + 1,
                    total: numSamples,
                    markersFound: markers ? Object.keys(markers).length : 0
                });
            }
        }
        
        if (samples.length < 3) {
            throw new Error(`Insufficient samples: ${samples.length}. Ensure all 4 ArUco markers are visible.`);
        }
        
        return this.averageTileSamples(samples);
    }

    /**
     * Average tile samples
     */
    averageTileSamples(samples) {
        const avg = {
            corners: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }],
            center: { x: 0, y: 0 },
            width: 0,
            height: 0,
            angle: 0
        };
        
        samples.forEach(s => {
            for (let i = 0; i < 4; i++) {
                avg.corners[i].x += s.corners[i].x;
                avg.corners[i].y += s.corners[i].y;
            }
            avg.center.x += s.center.x;
            avg.center.y += s.center.y;
            avg.width += s.width;
            avg.height += s.height;
            avg.angle += s.angle;
        });
        
        const n = samples.length;
        for (let i = 0; i < 4; i++) {
            avg.corners[i].x /= n;
            avg.corners[i].y /= n;
        }
        avg.center.x /= n;
        avg.center.y /= n;
        avg.width /= n;
        avg.height /= n;
        avg.angle /= n;
        avg.angleDeg = avg.angle * 180 / Math.PI;
        
        return avg;
    }

    /**
     * Calculate alignment from detected tile vs expected tile
     */
    calculateTileAlignment(detectedTile, expectedTile) {
        const detectedSize = (detectedTile.width + detectedTile.height) / 2;
        const expectedSize = (expectedTile.width + expectedTile.height) / 2;
        
        const scaleFactor = expectedSize / detectedSize;
        const zoomDelta = Math.log2(scaleFactor);
        
        let rotationDelta = (expectedTile.angle - detectedTile.angle) * 180 / Math.PI;
        while (rotationDelta > 180) rotationDelta -= 360;
        while (rotationDelta < -180) rotationDelta += 360;
        
        const posError = Math.hypot(
            detectedTile.center.x - expectedTile.center.x,
            detectedTile.center.y - expectedTile.center.y
        );
        
        const sizeError = Math.abs(detectedSize - expectedSize);
        const error = posError + sizeError * 0.5;
        
        return { scaleFactor, zoomDelta, rotationDelta, posError, sizeError, error };
    }

    /**
     * Request expected tile position from main window
     */
    async getExpectedTilePosition(channel) {
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout waiting for tile position'));
            }, 5000);
            
            const handler = (event) => {
                if (event.data.type === 'calibration_tile_position') {
                    clearTimeout(timeout);
                    channel.removeEventListener('message', handler);
                    const tile = event.data.tile;
                    tile.angle = 0;
                    resolve(tile);
                }
            };
            
            channel.addEventListener('message', handler);
            channel.postMessage({
                type: 'calibrate_action',
                action: 'get_tile_position'
            });
        });
    }

    /**
     * Main calibration routine
     */
    async calibrate(channel, initialCalibration, cameraDeviceId = null) {
        this.isCalibrating = true;
        this.currentCalibration = { ...initialCalibration };
        
        try {
            this.updateStatus('Starting camera...');
            if (this.onProgress) {
                this.onProgress({ phase: 'starting', message: 'Starting camera...' });
            }
            
            await this.startCamera(cameraDeviceId);
            
            this.updateStatus('Showing calibration tile outline...');
            channel.postMessage({
                type: 'calibrate_action',
                action: 'show_calibration_tile',
                params: {
                    tileSize: this.config.tileSize,
                    offsetX: this.config.tileOffsetX,
                    offsetY: this.config.tileOffsetY
                }
            });
            
            await new Promise(r => setTimeout(r, 500));
            
            let iteration = 0;
            let lastError = Infinity;
            
            while (this.isCalibrating && iteration < this.config.maxIterations) {
                iteration++;
                
                this.updateStatus(`Calibrating... iteration ${iteration}/${this.config.maxIterations}`);
                if (this.onProgress) {
                    this.onProgress({ 
                        phase: 'calibrating', 
                        iteration,
                        maxIterations: this.config.maxIterations,
                        message: `Iteration ${iteration}...`
                    });
                }
                
                let detectedTile;
                try {
                    detectedTile = await this.collectMarkerSamples();
                } catch (err) {
                    this.updateStatus('Could not detect markers: ' + err.message);
                    await new Promise(r => setTimeout(r, 1000));
                    continue;
                }
                
                let expectedTile;
                try {
                    expectedTile = await this.getExpectedTilePosition(channel);
                } catch (err) {
                    this.updateStatus('Could not get expected position');
                    continue;
                }
                
                const markers = this.detectArucoMarkers();
                this.drawDebugFrame(markers, detectedTile, expectedTile);
                
                const alignment = this.calculateTileAlignment(detectedTile, expectedTile);
                
                this.log(`Iteration ${iteration}: error=${alignment.error.toFixed(2)}px, ` +
                         `zoom=${alignment.zoomDelta.toFixed(4)}, rotation=${alignment.rotationDelta.toFixed(2)}°`);
                
                if (alignment.error < this.config.positionThreshold) {
                    this.updateStatus(`Converged! Error: ${alignment.error.toFixed(1)}px`);
                    break;
                }
                
                if (iteration > 2 && alignment.error >= lastError * 0.95) {
                    this.updateStatus(`Stopped - not improving. Error: ${alignment.error.toFixed(1)}px`);
                    break;
                }
                
                lastError = alignment.error;
                
                const damping = 0.5;
                const newCalibration = {
                    zoom: this.currentCalibration.zoom + alignment.zoomDelta * damping,
                    bearing: this.currentCalibration.bearing + alignment.rotationDelta * damping,
                    center: this.currentCalibration.center
                };
                
                channel.postMessage({
                    type: 'calibrate_action',
                    action: 'apply_calibration',
                    calibration: newCalibration
                });
                
                this.currentCalibration = newCalibration;
                
                await new Promise(r => setTimeout(r, 500));
                
                if (this.onProgress) {
                    this.onProgress({
                        phase: 'adjusting',
                        iteration,
                        error: alignment.error,
                        calibration: newCalibration
                    });
                }
            }
            
            channel.postMessage({
                type: 'calibrate_action',
                action: 'hide_calibration_tile'
            });
            
            this.updateStatus('Calibration complete!');
            return this.currentCalibration;
            
        } finally {
            this.stopCamera();
            this.isCalibrating = false;
        }
    }

    /**
     * Preview camera without calibrating
     */
    async startPreview(cameraDeviceId = null) {
        await this.startCamera(cameraDeviceId);
        this.previewLoop();
    }

    previewLoop() {
        if (!this.video || !this.ctx) return;
        
        // Throttle to ~15fps max for performance
        const now = performance.now();
        if (this._lastPreviewTime && now - this._lastPreviewTime < 66) {
            requestAnimationFrame(() => this.previewLoop());
            return;
        }
        this._lastPreviewTime = now;
        
        const markers = this.detectArucoMarkers();
        const ordered = this.orderMarkers(markers);
        const tile = ordered ? this.calculateTileFromMarkers(ordered) : null;
        this.drawDebugFrame(markers, tile, null);
        
        if (this.video) {
            requestAnimationFrame(() => this.previewLoop());
        }
    }

    stopPreview() {
        this.stopCamera();
    }

    cancel() {
        this.isCalibrating = false;
        this.stopCamera();
        this.updateStatus('Calibration cancelled');
    }

    updateStatus(message) {
        this.log(message);
        if (this.onStatusUpdate) {
            this.onStatusUpdate(message);
        }
    }

    log(...args) {
        if (this.config.debug) {
            console.log('[AutoCalibrator]', ...args);
        }
    }
}

// Export for use
window.AutoCalibrator = AutoCalibrator;
