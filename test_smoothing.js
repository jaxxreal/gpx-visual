const fs = require('fs');
const path = require('path');
const gpxParser = require('gpxparser');

const files = [
    { name: '42KM-NGPS PCoura-1.GPX', expected: 1274 },
    { name: 'horta-paraizo-oldschool-mtb-by-chefinho.gpx', expected: 1604 },
    { name: 'Rota_NATALICIA_longo_61K_1200D+.gpx', expected: 1126 },
    { name: '45kmRotaNataliciaVF.gpx', expected: 846 }
];

// Test wider range
const configs = [
    { sample: 25, smooth: 100, thresh: 4 },
    { sample: 25, smooth: 150, thresh: 4 },
    { sample: 25, smooth: 100, thresh: 5 },
    { sample: 25, smooth: 150, thresh: 5 },
    { sample: 25, smooth: 150, thresh: 6 },
    { sample: 25, smooth: 200, thresh: 5 },
];

function calcGain(gpxString, SAMPLE, SMOOTH, THRESH) {
    const gpx = new gpxParser();
    gpx.parse(gpxString);
    const track = gpx.tracks[0];
    const points = track.points;
    const cumDist = track.distance.cumul;
    const totalDist = track.distance.total;

    const samples = [];
    let idx = 0;
    for (let d = 0; d <= totalDist; d += SAMPLE) {
        while (idx < points.length - 1 && cumDist[idx + 1] < d) idx++;
        if (idx >= points.length - 1) {
            samples.push(points[points.length - 1].ele);
        } else {
            const d1 = cumDist[idx], d2 = cumDist[idx + 1];
            const e1 = points[idx].ele, e2 = points[idx + 1].ele;
            const t = d2 > d1 ? (d - d1) / (d2 - d1) : 0;
            samples.push(e1 + t * (e2 - e1));
        }
    }
    
    const windowSize = Math.floor(SMOOTH / SAMPLE);
    const half = Math.floor(windowSize / 2);
    const smoothed = samples.map((_, i, arr) => {
        let sum = 0, count = 0;
        for (let j = Math.max(0, i - half); j <= Math.min(arr.length - 1, i + half); j++) { sum += arr[j]; count++; }
        return sum / count;
    });
    
    let gain = 0, anchor = smoothed[0];
    for (let i = 1; i < smoothed.length; i++) {
        const diff = smoothed[i] - anchor;
        if (diff >= THRESH) { gain += diff; anchor = smoothed[i]; }
        else if (diff <= -THRESH) { anchor = smoothed[i]; }
    }
    return Math.round(gain);
}

const fileContents = files.map(f => ({
    ...f,
    content: fs.readFileSync(path.join(__dirname, f.name), 'utf8')
}));

console.log("Parameter sweep:\n");

configs.forEach(cfg => {
    let totalAbsErr = 0;
    const errs = fileContents.map(f => {
        const gain = calcGain(f.content, cfg.sample, cfg.smooth, cfg.thresh);
        const err = gain - f.expected;
        totalAbsErr += Math.abs(err);
        return { name: f.name.slice(0,20), expected: f.expected, got: gain, err };
    });
    
    console.log(`Sample=${cfg.sample} Smooth=${cfg.smooth} Thresh=${cfg.thresh} => AvgErr=${(totalAbsErr/4).toFixed(0)}m`);
    errs.forEach(e => {
        const sign = e.err >= 0 ? '+' : '';
        console.log(`   ${e.name.padEnd(20)} ${e.expected} → ${e.got} (${sign}${e.err})`);
    });
    console.log();
});
