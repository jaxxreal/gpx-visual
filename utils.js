import simplify from 'https://esm.sh/simplify-js';

/**
 * Handles reading the file content
 * @param {File} file 
 * @returns {Promise<string>}
 */
export function loadGPX(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(e);
        reader.readAsText(file);
    });
}

/**
 * Parses GPX string and returns formatted data for the app
 * 
 * @param {string} gpxString 
 * @returns {Object} { stats, chartData }
 */
export function processGPX(gpxString) {
    const gpx = new gpxParser();
    gpx.parse(gpxString);

    if (!gpx.tracks || gpx.tracks.length === 0) {
        throw new Error("No tracks found in GPX file");
    }

    const track = gpx.tracks[0];
    const points = track.points;
    const cumDist = track.distance.cumul;
    const totalDist = track.distance.total;

    // ============================================
    // SIMPLE ELEVATION GAIN CALCULATION
    // ============================================
    // 1. Resample to fixed 25m intervals (normalizes point density)
    // 2. Apply 100m moving average smoothing
    // 3. Accumulate gains above 4m threshold
    
    const SAMPLE_DISTANCE = 25;   // Resample every 25m
    const SMOOTH_DISTANCE = 100;  // Smooth over 100m window  
    const THRESHOLD = 4;          // Ignore changes < 4m
    
    // Step 1: Resample to fixed distance intervals with linear interpolation
    const samples = [];
    let idx = 0;
    
    for (let d = 0; d <= totalDist; d += SAMPLE_DISTANCE) {
        while (idx < points.length - 1 && cumDist[idx + 1] < d) idx++;
        
        if (idx >= points.length - 1) {
            samples.push({ dist: d, ele: points[points.length - 1].ele });
        } else {
            const d1 = cumDist[idx], d2 = cumDist[idx + 1];
            const e1 = points[idx].ele, e2 = points[idx + 1].ele;
            const t = d2 > d1 ? (d - d1) / (d2 - d1) : 0;
            samples.push({ dist: d, ele: e1 + t * (e2 - e1) });
        }
    }
    
    // Step 2: Apply moving average smoothing
    const windowSize = Math.floor(SMOOTH_DISTANCE / SAMPLE_DISTANCE);
    const half = Math.floor(windowSize / 2);
    
    const smoothed = samples.map((sample, i) => {
        let sum = 0, count = 0;
        for (let j = Math.max(0, i - half); j <= Math.min(samples.length - 1, i + half); j++) {
            sum += samples[j].ele;
            count++;
        }
        return { dist: sample.dist, ele: sum / count };
    });
    
    // Step 3: Calculate gain/loss with threshold
    let elevationGain = 0;
    let elevationLoss = 0;
    let anchor = smoothed[0].ele;
    
    for (let i = 1; i < smoothed.length; i++) {
        const diff = smoothed[i].ele - anchor;
        
        if (diff >= THRESHOLD) {
            elevationGain += diff;
            anchor = smoothed[i].ele;
        } else if (diff <= -THRESHOLD) {
            elevationLoss += Math.abs(diff);
            anchor = smoothed[i].ele;
        }
    }

    // ============================================
    // CHART DATA PREPARATION
    // ============================================
    const smoothedPoints = smoothed.map(s => ({ x: s.dist, y: s.ele }));
    
    // Simplify for chart rendering performance
    const simplifyTolerance = 3;
    const simplifiedPoints = simplify(smoothedPoints, simplifyTolerance, true);

    const chartData = simplifiedPoints.map(p => ({
        x: p.x,
        y: p.y,
        slope: 0
    }));
    
    // Calculate slopes for tooltips
    for (let i = 0; i < chartData.length - 1; i++) {
        const dx = chartData[i + 1].x - chartData[i].x;
        const dy = chartData[i + 1].y - chartData[i].y;
        if (dx > 0) {
            const grade = (dy / dx) * 100;
            const slopeDeg = (Math.atan(grade / 100) * 180 / Math.PI).toFixed(1);
            chartData[i].slope = slopeDeg;
        }
    }

    // ============================================
    // STATS OUTPUT
    // ============================================
    const stats = {
        distance: (totalDist / 1000).toFixed(2),
        totalDistance: totalDist,
        elevationGain: Math.round(elevationGain).toString(),
        elevationLoss: Math.round(elevationLoss).toString(),
        maxElevation: Math.max(...smoothed.map(s => s.ele)).toFixed(0),
        minElevation: Math.min(...smoothed.map(s => s.ele)).toFixed(0)
    };

    return { stats, chartData };
}
