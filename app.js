(function() {
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    // ── State ──
    let W, H, dpr;
    let gameState = 'cover'; // cover, unscrewing, playing, complete, failed, blackscreen
    let gameMode = 'standard';
    let panelX, panelY, panelW, panelH;
    let wires = [];
    let dragging = null;
    let dragX = 0, dragY = 0;
    let sparks = [];
    let particles = [];
    let shakeX = 0, shakeY = 0;
    let shakeIntensity = 0;
    let timer = 15;
    let timerStart = 0;
    let completionTime = 0;
    let flashAlpha = 0;
    let flashColor = '#00ff00';
    let bannerY = -80;
    let bannerTarget = -80;
    let blackScreenAlpha = 0;
    let blackScreenStartTime = 0;
    let gameCompleted = false;
    let currentRightOrder = [];

    // ── Cover/bolt state ──
    let bolts = [];
    let activeBolt = null; // index of bolt being unscrewed
    let coverState = 'bolted'; // bolted, unbolted, removing, removed
    let coverOffsetX = 0;
    let coverOffsetY = 0;
    let coverDragging = false;
    let coverDragStart = null;
    let coverAlpha = 1;
    let coverRemoveAnim = 0;
    let allBoltsRemoved = false;

    const WIRE_COLORS = {
        red:     { fill: '#FF1744', stroke: '#cc1036', highlight: '#ff5c7a', name: 'Red' },
        blue:    { fill: '#2979FF', stroke: '#1a5ecc', highlight: '#6da3ff', name: 'Blue' },
        yellow:  { fill: '#FFD600', stroke: '#ccab00', highlight: '#ffe44d', name: 'Yellow' },
        pink:    { fill: '#FF4081', stroke: '#cc3367', highlight: '#ff79a8', name: 'Pink' },
        orange:  { fill: '#FF6D00', stroke: '#cc5700', highlight: '#ff9a4d', name: 'Orange' },
        green:   { fill: '#00E676', stroke: '#00b85e', highlight: '#4dff9e', name: 'Green' }
    };

    const STANDARD_COLORS = ['red', 'blue', 'yellow', 'pink'];
    const ALL_COLORS = ['red', 'blue', 'yellow', 'pink', 'orange', 'green'];

    // Initialize after constants are declared
    currentRightOrder = STANDARD_COLORS.slice();

    // ── Resize ──
    function resize() {
        dpr = window.devicePixelRatio || 1;
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        computePanel();
        initBolts();
    }

    function computePanel() {
        const maxW = Math.min(W * 0.92, 600);
        const maxH = Math.min(H * 0.78, 500);
        panelW = maxW;
        panelH = maxH;
        panelX = (W - panelW) / 2;
        panelY = (H - panelH) / 2 - 10;
    }

    function initBolts() {
        const pad = 20;
        const boltR = 14;
        bolts = [
            { x: panelX + pad + boltR, y: panelY + pad + boltR, rotation: 0, unscrewed: false, unscrewProgress: 0, wobble: 0 },
            { x: panelX + panelW - pad - boltR, y: panelY + pad + boltR, rotation: 0, unscrewed: false, unscrewProgress: 0, wobble: 0 },
            { x: panelX + pad + boltR, y: panelY + panelH - pad - boltR, rotation: 0, unscrewed: false, unscrewProgress: 0, wobble: 0 },
            { x: panelX + panelW - pad - boltR, y: panelY + panelH - pad - boltR, rotation: 0, unscrewed: false, unscrewProgress: 0, wobble: 0 }
        ];
    }

    // ── Shuffle ──
    function shuffle(arr) {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    // ── Init game (wires) ──
    function initGame() {
        gameMode = 'standard';
        gameState = 'playing';
        flashAlpha = 0;
        bannerY = -80;
        bannerTarget = -80;
        shakeIntensity = 0;
        sparks = [];
        particles = [];

        // ~25% chance to get 7 wires instead of 4
        let colors;
        if (Math.random() < 0.25) {
            // 7-wire mode: pick 7 randomized colors from all 6 (one color appears twice)
            gameMode = 'seven';
            const pool = ALL_COLORS.slice();
            const extra = pool[Math.floor(Math.random() * pool.length)];
            colors = shuffle(pool.concat(extra)).slice(0, 7);
        } else {
            colors = STANDARD_COLORS.slice();
        }

        // Build right-side order: unique colors in a fixed canonical order, duplicates appended at end
        const seen = [];
        const dupes = [];
        colors.forEach(c => {
            if (seen.indexOf(c) === -1) seen.push(c);
            else dupes.push(c);
        });
        // canonical order based on ALL_COLORS index
        seen.sort((a, b) => ALL_COLORS.indexOf(a) - ALL_COLORS.indexOf(b));
        const rightOrder = seen.concat(dupes);

        const shuffledLeft = shuffle(colors);

        const wireCount = colors.length;
        const spacing = panelH / (wireCount + 1);
        const leftX = panelX + 30;
        const rightX = panelX + panelW - 30;

        // Track which right slots have been assigned (for duplicate colors)
        const rightAssigned = {};
        rightOrder.forEach((c, i) => {
            if (!rightAssigned[c]) rightAssigned[c] = [];
            rightAssigned[c].push(i);
        });
        const rightUsed = {};

        wires = [];
        for (let i = 0; i < wireCount; i++) {
            const color = shuffledLeft[i];
            if (!rightUsed[color]) rightUsed[color] = 0;
            const slotIdx = rightAssigned[color][rightUsed[color]];
            rightUsed[color]++;
            wires.push({
                color: color,
                leftY: panelY + spacing * (i + 1),
                rightY: panelY + spacing * (slotIdx + 1),
                leftX: leftX,
                rightX: rightX,
                connected: false,
                connectAnim: 0,
                snapBackT: 0,
                snapBackFrom: null
            });
        }

        // Store rightOrder for socket drawing
        currentRightOrder = rightOrder;
    }

    // ── Reset everything for a new game ──
    function resetAll() {
        gameState = 'cover';
        coverState = 'bolted';
        coverOffsetX = 0;
        coverOffsetY = 0;
        coverDragging = false;
        coverAlpha = 1;
        coverRemoveAnim = 0;
        allBoltsRemoved = false;
        activeBolt = null;
        wires = [];
        sparks = [];
        particles = [];
        flashAlpha = 0;
        bannerY = -80;
        bannerTarget = -80;
        shakeIntensity = 0;
        blackScreenAlpha = 0;
        initBolts();
    }

    // ── Spark system ──
    function addSpark(x, y) {
        for (let i = 0; i < 3; i++) {
            sparks.push({
                x, y,
                life: 1,
                segments: generateLightning(x, y, 20 + Math.random() * 15),
            });
        }
        sparks.push({ x, y, life: 1, isBloom: true });
        for (let i = 0; i < 12; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                size: 1 + Math.random() * 2
            });
        }
    }

    function addBoltSpark(x, y) {
        for (let i = 0; i < 4; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 0.5 + Math.random() * 2;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1,
                life: 1,
                size: 1 + Math.random() * 1.5,
                isMetal: true
            });
        }
    }

    function generateLightning(x, y, length) {
        const segs = [];
        let cx = x, cy = y;
        const angle = Math.random() * Math.PI * 2;
        const steps = 4 + Math.floor(Math.random() * 3);
        for (let i = 0; i < steps; i++) {
            const nx = cx + Math.cos(angle + (Math.random() - 0.5) * 2) * (length / steps);
            const ny = cy + Math.sin(angle + (Math.random() - 0.5) * 2) * (length / steps);
            segs.push({ x1: cx, y1: cy, x2: nx, y2: ny });
            cx = nx; cy = ny;
        }
        return segs;
    }

    function triggerShake(intensity) {
        shakeIntensity = Math.max(shakeIntensity, intensity);
    }

    // ── Drawing helpers ──
    function drawRoundedRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
    }

    function drawRivet(x, y, r) {
        const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
        grad.addColorStop(0, '#6a6a6a');
        grad.addColorStop(0.5, '#4a4a4a');
        grad.addColorStop(1, '#2a2a2a');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }

    // ── Draw background ──
    function drawBackground() {
        const grad = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, Math.max(W, H) * 0.7);
        grad.addColorStop(0, '#1a2a30');
        grad.addColorStop(0.5, '#0e1a1f');
        grad.addColorStop(1, '#060a0d');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        ctx.strokeStyle = 'rgba(30, 60, 70, 0.15)';
        ctx.lineWidth = 1;
        for (let i = 0; i < W; i += 40) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, H); ctx.stroke();
        }
        for (let i = 0; i < H; i += 40) {
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(W, i); ctx.stroke();
        }
    }

    // ── Draw panel (inner, visible after cover removed) ──
    function drawPanelInner() {
        // Panel shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 8;
        drawRoundedRect(panelX, panelY, panelW, panelH, 8);
        ctx.fillStyle = '#1e2024';
        ctx.fill();
        ctx.restore();

        // Inner panel body (darker, like inside of electrical box)
        drawRoundedRect(panelX, panelY, panelW, panelH, 8);
        const panelGrad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
        panelGrad.addColorStop(0, '#222528');
        panelGrad.addColorStop(0.5, '#1c1f22');
        panelGrad.addColorStop(1, '#161a1d');
        ctx.fillStyle = panelGrad;
        ctx.fill();
        ctx.strokeStyle = '#0e1012';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Inner bevel
        drawRoundedRect(panelX + 3, panelY + 3, panelW - 6, panelH - 6, 6);
        ctx.strokeStyle = 'rgba(60, 70, 80, 0.15)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Conduit left
        const conduitW = 22;
        ctx.fillStyle = '#111316';
        drawRoundedRect(panelX + 8, panelY + 40, conduitW, panelH - 80, 4);
        ctx.fill();
        ctx.strokeStyle = '#0a0b0d';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Conduit right
        ctx.fillStyle = '#111316';
        drawRoundedRect(panelX + panelW - 8 - conduitW, panelY + 40, conduitW, panelH - 80, 4);
        ctx.fill();
        ctx.strokeStyle = '#0a0b0d';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Warning label
        ctx.save();
        ctx.font = '600 10px "Share Tech Mono", monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#4a3a00';
        const labelX = panelX + panelW / 2;
        const labelY = panelY + panelH - 18;
        // Yellow warning strip
        ctx.fillStyle = 'rgba(255, 200, 0, 0.12)';
        ctx.fillRect(panelX + 40, labelY - 8, panelW - 80, 16);
        ctx.fillStyle = '#8a7a30';
        ctx.fillText('⚡ DANGER — HIGH VOLTAGE ⚡', labelX, labelY + 3);
        ctx.restore();
    }

    // ── Draw cover panel (the thing you unscrew and remove) ──
    function drawCoverPanel(timestamp) {
        if (coverState === 'removed') return;

        const ox = coverOffsetX;
        const oy = coverOffsetY;

        ctx.save();

        if (coverState === 'removing') {
            ctx.globalAlpha = coverAlpha;
        }

        // Cover shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 20 + Math.abs(ox) * 0.3 + Math.abs(oy) * 0.3;
        ctx.shadowOffsetX = ox * 0.2;
        ctx.shadowOffsetY = 6 + oy * 0.2;
        drawRoundedRect(panelX + ox, panelY + oy, panelW, panelH, 8);
        ctx.fillStyle = '#2a2d30';
        ctx.fill();
        ctx.restore();

        // Cover body
        drawRoundedRect(panelX + ox, panelY + oy, panelW, panelH, 8);
        const coverGrad = ctx.createLinearGradient(panelX, panelY + oy, panelX, panelY + panelH + oy);
        coverGrad.addColorStop(0, '#3e4248');
        coverGrad.addColorStop(0.3, '#363a3f');
        coverGrad.addColorStop(0.7, '#2e3136');
        coverGrad.addColorStop(1, '#282b30');
        ctx.fillStyle = coverGrad;
        ctx.fill();
        ctx.strokeStyle = '#1a1c1f';
        ctx.lineWidth = 3;
        ctx.stroke();

        // Bevel highlight
        drawRoundedRect(panelX + ox + 2, panelY + oy + 2, panelW - 4, panelH - 4, 7);
        ctx.strokeStyle = 'rgba(90, 100, 110, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Scratches
        ctx.save();
        ctx.globalAlpha = 0.05;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < 20; i++) {
            const sx = panelX + ox + Math.random() * panelW;
            const sy = panelY + oy + Math.random() * panelH;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + (Math.random() - 0.5) * 60, sy + (Math.random() - 0.5) * 20);
            ctx.stroke();
        }
        ctx.restore();

        // ELECTRICAL label on cover
        ctx.save();
        ctx.font = '700 20px "Rajdhani", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#6a6e74';
        ctx.letterSpacing = '4px';
        ctx.fillText('ELECTRICAL', panelX + ox + panelW / 2, panelY + oy + panelH / 2 - 14);

        ctx.font = '400 12px "Share Tech Mono", monospace';
        ctx.fillStyle = '#4a4e54';
        ctx.fillText('PANEL ACCESS — AUTHORIZED ONLY', panelX + ox + panelW / 2, panelY + oy + panelH / 2 + 14);
        ctx.restore();

        // Diagonal caution stripes at bottom
        ctx.save();
        ctx.beginPath();
        ctx.rect(panelX + ox + 20, panelY + oy + panelH - 35, panelW - 40, 18);
        ctx.clip();
        const stripeW = 14;
        ctx.fillStyle = 'rgba(255, 180, 0, 0.15)';
        for (let sx = panelX + ox - panelW; sx < panelX + ox + panelW * 2; sx += stripeW * 2) {
            ctx.beginPath();
            ctx.moveTo(sx, panelY + oy + panelH - 35);
            ctx.lineTo(sx + stripeW, panelY + oy + panelH - 35);
            ctx.lineTo(sx + stripeW - 18, panelY + oy + panelH - 17);
            ctx.lineTo(sx - 18, panelY + oy + panelH - 17);
            ctx.fill();
        }
        ctx.restore();

        // Draw bolts
        if (coverState === 'bolted' || coverState === 'unbolted') {
            bolts.forEach((bolt, i) => {
                if (bolt.unscrewed) return;
                drawBolt(bolt.x + ox, bolt.y + oy, bolt, i === activeBolt, timestamp);
            });

            // Draw bolt holes for removed bolts
            bolts.forEach((bolt) => {
                if (!bolt.unscrewed) return;
                drawBoltHole(bolt.x + ox, bolt.y + oy);
            });
        }

        ctx.restore();
    }

    // ── Draw bolt ──
    function drawBolt(x, y, bolt, active, timestamp) {
        const r = 14;
        const progress = bolt.unscrewProgress;

        // Bolt raising effect
        const raise = progress * 4;

        ctx.save();
        ctx.translate(x, y - raise);

        // Bolt shadow (gets bigger as it raises)
        ctx.save();
        ctx.translate(0, raise);
        ctx.fillStyle = `rgba(0,0,0,${0.4 - progress * 0.2})`;
        ctx.beginPath();
        ctx.ellipse(0, 2, r + 2 + progress * 3, r * 0.3 + progress * 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Bolt body
        const bGrad = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 0, 0, 0, r);
        if (active) {
            bGrad.addColorStop(0, '#8a8a8a');
            bGrad.addColorStop(0.5, '#6a6a6a');
            bGrad.addColorStop(1, '#4a4a4a');
        } else {
            bGrad.addColorStop(0, '#7a7a7a');
            bGrad.addColorStop(0.5, '#5a5a5a');
            bGrad.addColorStop(1, '#3a3a3a');
        }
        ctx.fillStyle = bGrad;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();

        // Outer ring
        ctx.strokeStyle = active ? '#555' : '#2a2a2a';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Cross/Phillips head slot
        ctx.save();
        ctx.rotate(bolt.rotation);
        ctx.strokeStyle = '#222';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        const slotLen = r * 0.65;
        ctx.beginPath();
        ctx.moveTo(-slotLen, 0);
        ctx.lineTo(slotLen, 0);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, -slotLen);
        ctx.lineTo(0, slotLen);
        ctx.stroke();
        ctx.restore();

        // Highlight
        ctx.save();
        ctx.globalAlpha = 0.15;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(-r * 0.25, -r * 0.25, r * 0.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Active glow ring
        if (active) {
            ctx.save();
            ctx.strokeStyle = 'rgba(120, 200, 255, 0.3)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(0, 0, r + 4, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }

        ctx.restore();
    }

    // ── Draw bolt hole ──
    function drawBoltHole(x, y) {
        ctx.save();
        const hr = 8;
        ctx.fillStyle = '#0a0c0e';
        ctx.beginPath();
        ctx.arc(x, y, hr, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#1a1c20';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Inner shadow
        const iGrad = ctx.createRadialGradient(x, y, 0, x, y, hr);
        iGrad.addColorStop(0, 'rgba(0,0,0,0.6)');
        iGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = iGrad;
        ctx.beginPath();
        ctx.arc(x, y, hr + 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // ── Draw panel for playing state ──
    function drawPanel() {
        const allConnected = wires.every(w => w.connected);

        // Panel shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 30;
        ctx.shadowOffsetY = 8;
        drawRoundedRect(panelX, panelY, panelW, panelH, 8);
        ctx.fillStyle = '#2a2d30';
        ctx.fill();
        ctx.restore();

        // Panel body
        drawRoundedRect(panelX, panelY, panelW, panelH, 8);
        const panelGrad = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
        panelGrad.addColorStop(0, allConnected ? '#3a3d42' : '#32353a');
        panelGrad.addColorStop(0.5, allConnected ? '#2e3136' : '#282b30');
        panelGrad.addColorStop(1, allConnected ? '#262a2e' : '#1e2126');
        ctx.fillStyle = panelGrad;
        ctx.fill();
        ctx.strokeStyle = '#1a1c1f';
        ctx.lineWidth = 3;
        ctx.stroke();

        drawRoundedRect(panelX + 2, panelY + 2, panelW - 4, panelH - 4, 7);
        ctx.strokeStyle = 'rgba(80, 90, 100, 0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Scratches
        ctx.save();
        ctx.globalAlpha = 0.04;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.5;
        for (let i = 0; i < 15; i++) {
            const sx = panelX + Math.random() * panelW;
            const sy = panelY + Math.random() * panelH;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + (Math.random() - 0.5) * 60, sy + (Math.random() - 0.5) * 20);
            ctx.stroke();
        }
        ctx.restore();

        // Rivets
        const rivetR = 4;
        const rivetPad = 16;
        drawRivet(panelX + rivetPad, panelY + rivetPad, rivetR);
        drawRivet(panelX + panelW - rivetPad, panelY + rivetPad, rivetR);
        drawRivet(panelX + rivetPad, panelY + panelH - rivetPad, rivetR);
        drawRivet(panelX + panelW - rivetPad, panelY + panelH - rivetPad, rivetR);

        if (allConnected) {
            const glowGrad = ctx.createRadialGradient(panelX + panelW / 2, panelY, 10, panelX + panelW / 2, panelY + panelH * 0.3, panelW * 0.6);
            glowGrad.addColorStop(0, 'rgba(200, 220, 240, 0.08)');
            glowGrad.addColorStop(1, 'rgba(200, 220, 240, 0)');
            ctx.fillStyle = glowGrad;
            ctx.fillRect(panelX, panelY, panelW, panelH);
        }

        // Left conduit slot
        const conduitW = 22;
        ctx.fillStyle = '#111316';
        drawRoundedRect(panelX + 8, panelY + 40, conduitW, panelH - 80, 4);
        ctx.fill();
        ctx.strokeStyle = '#0a0b0d';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Right conduit slot
        ctx.fillStyle = '#111316';
        drawRoundedRect(panelX + panelW - 8 - conduitW, panelY + 40, conduitW, panelH - 80, 4);
        ctx.fill();
        ctx.strokeStyle = '#0a0b0d';
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    // ── Draw wire ──
    function drawWire(fromX, fromY, toX, toY, color, alpha, thickness) {
        const col = WIRE_COLORS[color];
        const midX = (fromX + toX) / 2;
        const sag = 20 + Math.abs(toY - fromY) * 0.15;

        ctx.save();
        ctx.globalAlpha = alpha || 1;

        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 3;
        ctx.strokeStyle = col.stroke;
        ctx.lineWidth = thickness || 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.bezierCurveTo(midX, fromY + sag, midX, toY + sag, toX, toY);
        ctx.stroke();
        ctx.restore();

        ctx.strokeStyle = col.fill;
        ctx.lineWidth = thickness || 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.bezierCurveTo(midX, fromY + sag, midX, toY + sag, toX, toY);
        ctx.stroke();

        ctx.strokeStyle = col.highlight;
        ctx.lineWidth = 2;
        ctx.globalAlpha = (alpha || 1) * 0.5;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY - 1.5);
        ctx.bezierCurveTo(midX, fromY + sag - 2, midX, toY + sag - 2, toX, toY - 1.5);
        ctx.stroke();

        ctx.restore();
    }

    function drawWireEnd(x, y, color, isLeft, active) {
        const col = WIRE_COLORS[color];
        const endW = 35;
        const endH = 14;
        const dx = isLeft ? 1 : -1;

        ctx.save();
        if (active) {
            ctx.shadowColor = col.fill;
            ctx.shadowBlur = 12;
        }

        const insX = isLeft ? x : x - endW;
        const grad = ctx.createLinearGradient(insX, y - endH / 2, insX, y + endH / 2);
        grad.addColorStop(0, col.highlight);
        grad.addColorStop(0.4, col.fill);
        grad.addColorStop(1, col.stroke);
        ctx.fillStyle = grad;
        drawRoundedRect(insX, y - endH / 2, endW, endH, 3);
        ctx.fill();

        const tipX = isLeft ? x + endW : x - endW;
        ctx.strokeStyle = '#d4a55a';
        ctx.lineWidth = 1.2;
        for (let i = 0; i < 5; i++) {
            const fy = y - 4 + i * 2;
            ctx.beginPath();
            ctx.moveTo(tipX, fy);
            ctx.lineTo(tipX + dx * (4 + Math.random() * 6), fy + (Math.random() - 0.5) * 3);
            ctx.stroke();
        }

        ctx.restore();
    }

    function drawSocket(x, y, color, connected) {
        const col = WIRE_COLORS[color];
        const sw = 28;
        const sh = 16;

        ctx.fillStyle = connected ? col.fill : '#1a1c20';
        drawRoundedRect(x - sw / 2, y - sh / 2, sw, sh, 3);
        ctx.fill();
        ctx.strokeStyle = col.fill;
        ctx.lineWidth = 2;
        ctx.stroke();

        const ledX = x + sw / 2 + 10;
        const ledR = 4;
        if (connected) {
            ctx.save();
            ctx.shadowColor = '#00ff66';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#00ff66';
            ctx.beginPath();
            ctx.arc(ledX, y, ledR, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        } else {
            ctx.fillStyle = '#2a2a2a';
            ctx.beginPath();
            ctx.arc(ledX, y, ledR, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#444';
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
    }

    function drawSparks() {
        sparks.forEach(s => {
            if (s.isBloom) {
                ctx.save();
                const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 30 * s.life);
                grad.addColorStop(0, `rgba(180, 220, 255, ${s.life * 0.8})`);
                grad.addColorStop(0.5, `rgba(100, 170, 255, ${s.life * 0.3})`);
                grad.addColorStop(1, 'rgba(100, 170, 255, 0)');
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(s.x, s.y, 30, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            } else {
                ctx.save();
                ctx.strokeStyle = `rgba(200, 230, 255, ${s.life})`;
                ctx.lineWidth = 2 * s.life;
                ctx.lineCap = 'round';
                ctx.shadowColor = '#aaddff';
                ctx.shadowBlur = 6;
                s.segments.forEach(seg => {
                    ctx.beginPath();
                    ctx.moveTo(seg.x1, seg.y1);
                    ctx.lineTo(seg.x2, seg.y2);
                    ctx.stroke();
                });
                ctx.restore();
            }
        });

        particles.forEach(p => {
            ctx.save();
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.isMetal ? '#c0a060' : '#ddeeff';
            ctx.shadowColor = p.isMetal ? '#aa8844' : '#aaddff';
            ctx.shadowBlur = 4;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
    }

    // ── Draw cover phase ──
    function drawCoverPhase(timestamp) {
        drawBackground();

        ctx.save();
        ctx.translate(shakeX, shakeY);

        // Draw the inner panel behind cover
        drawPanelInner();

        // Draw some teaser wires behind the cover (partially visible)
        if (coverState !== 'removed') {
            ctx.save();
            ctx.globalAlpha = 0.3;
            const teaserColors = ['red', 'blue', 'yellow', 'pink', 'orange', 'green'];
            const teaserCount = 5 + Math.floor(Math.random() * 0.01); // use 5 for visual variety
            const spacing = panelH / (teaserCount + 1);
            for (let i = 0; i < teaserCount; i++) {
                const col = WIRE_COLORS[teaserColors[i % teaserColors.length]];
                const y = panelY + spacing * (i + 1);
                ctx.strokeStyle = col.fill;
                ctx.lineWidth = 5;
                ctx.beginPath();
                ctx.moveTo(panelX + 30, y);
                ctx.bezierCurveTo(panelX + panelW * 0.3, y + 15, panelX + panelW * 0.6, y - 10, panelX + panelW - 30, y + (i % 2 === 0 ? -20 : 20));
                ctx.stroke();
            }
            ctx.restore();
        }

        // Draw cover on top
        drawCoverPanel(timestamp);

        // Draw sparks/particles
        drawSparks();

        ctx.restore();

        // 7-wire indicator badge on cover
        if (coverState !== 'removed') {
            // Small random spark on the cover to hint at something special
        }

        // Instructions
        if (coverState === 'bolted') {
            const removedCount = bolts.filter(b => b.unscrewed).length;
            ctx.save();
            ctx.font = '400 14px "Share Tech Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#6a8a9a';
            ctx.fillText(
                removedCount === 0 ? 'Tap bolts to unscrew them' : `Bolts removed: ${removedCount}/4`,
                W / 2, panelY + panelH + 36
            );
            ctx.restore();
        } else if (coverState === 'unbolted') {
            ctx.save();
            ctx.font = '400 14px "Share Tech Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#8aaa6a';
            ctx.fillText('Drag the cover to remove it', W / 2, panelY + panelH + 36);
            ctx.restore();
        }
    }

    // ── Draw game (wiring phase) ──
    function drawGame(timestamp) {
        drawBackground();

        ctx.save();
        ctx.translate(shakeX, shakeY);

        drawPanel();

        const wireCount = wires.length;
        const spacing = panelH / (wireCount + 1);

        // Connected wires
        wires.forEach(w => {
            if (w.connected) {
                const glow = Math.sin(timestamp * 0.003 + wires.indexOf(w)) * 0.1 + 0.9;
                drawWire(w.leftX, w.leftY, w.rightX, w.rightY, w.color, glow, 8);
            }
        });

        // Dragging wire
        if (dragging !== null) {
            const w = wires[dragging];
            drawWire(w.leftX, w.leftY, dragX, dragY, w.color, 0.85, 8);
        }

        // Wire ends
        wires.forEach((w, i) => {
            if (!w.connected) {
                const active = dragging === i;
                drawWireEnd(w.leftX, w.leftY, w.color, true, active);
            }
        });

        // Sockets
        const rightOrder = currentRightOrder;
        rightOrder.forEach((color, i) => {
            const sy = panelY + spacing * (i + 1);
            const sx = panelX + panelW - 30;
            // For duplicate colors, check if the wire targeting this specific slot is connected
            const connected = wires.some(w => w.color === color && w.connected && Math.abs(w.rightY - sy) < 5);
            drawSocket(sx, sy, color, connected);
        });

        drawSparks();

        ctx.restore();

        // Flash overlay
        if (flashAlpha > 0) {
            ctx.save();
            ctx.globalAlpha = flashAlpha;
            ctx.fillStyle = flashColor;
            ctx.fillRect(0, 0, W, H);
            ctx.restore();
        }

        // Task complete banner
        if (gameState === 'complete') {
            bannerTarget = panelY + panelH / 2 - 30;
            bannerY += (bannerTarget - bannerY) * 0.1;

            ctx.save();
            ctx.globalAlpha = Math.min(1, (bannerY - (panelY - 60)) / 60);
            const bw = panelW * 0.7;
            const bh = 50;
            const bx = (W - bw) / 2;

            ctx.shadowColor = 'rgba(0, 255, 100, 0.4)';
            ctx.shadowBlur = 20;
            drawRoundedRect(bx, bannerY, bw, bh, 6);
            ctx.fillStyle = 'rgba(0, 40, 20, 0.92)';
            ctx.fill();
            ctx.strokeStyle = '#00ff66';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.font = '700 22px "Rajdhani", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#00ff66';
            ctx.fillText('TASK COMPLETE', W / 2, bannerY + bh / 2);
            ctx.restore();

            ctx.save();
            ctx.font = '400 13px "Share Tech Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#5a7a6a';
            ctx.fillText('Click anywhere to play again', W / 2, bannerY + bh + 28);
            ctx.restore();
        }
    }

    // ── Update logic ──
    function update(timestamp) {
        sparks = sparks.filter(s => {
            s.life -= 0.04;
            return s.life > 0;
        });

        particles = particles.filter(p => {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.1;
            p.life -= 0.03;
            return p.life > 0;
        });

        if (shakeIntensity > 0.1) {
            shakeX = (Math.random() - 0.5) * shakeIntensity;
            shakeY = (Math.random() - 0.5) * shakeIntensity;
            shakeIntensity *= 0.9;
        } else {
            shakeX = 0;
            shakeY = 0;
            shakeIntensity = 0;
        }

        if (flashAlpha > 0) {
            flashAlpha -= 0.03;
            if (flashAlpha < 0) flashAlpha = 0;
        }

        // Bolt unscrewing animation
        if (gameState === 'cover' && activeBolt !== null) {
            const bolt = bolts[activeBolt];
            if (!bolt.unscrewed) {
                bolt.rotation += 0.15;
                bolt.unscrewProgress += 0.012;
                bolt.wobble = Math.sin(bolt.rotation * 3) * 2;

                if (Math.random() < 0.15) {
                    addBoltSpark(bolt.x + coverOffsetX, bolt.y + coverOffsetY);
                }

                if (bolt.unscrewProgress >= 1) {
                    bolt.unscrewed = true;
                    bolt.unscrewProgress = 1;
                    activeBolt = null;
                    triggerShake(3);

                    // Check if all bolts removed
                    if (bolts.every(b => b.unscrewed)) {
                        allBoltsRemoved = true;
                        coverState = 'unbolted';
                    }
                }
            }
        }

        // Cover removal animation
        if (coverState === 'removing') {
            coverRemoveAnim += 0.02;
            coverAlpha = Math.max(0, 1 - coverRemoveAnim);
            coverOffsetY += 3;
            coverOffsetX += (coverOffsetX > 0 ? 2 : -2);

            if (coverAlpha <= 0) {
                coverState = 'removed';
                // Transition to wire game
                initGame();
            }
        }

        // Wire snap-back
        wires.forEach(w => {
            if (w.snapBackT > 0) {
                w.snapBackT -= 0.08;
                if (w.snapBackT < 0) w.snapBackT = 0;
            }
        });

        wires.forEach(w => {
            if (w.connectAnim > 0) {
                w.connectAnim -= 0.02;
                if (w.connectAnim < 0) w.connectAnim = 0;
            }
        });
    }

    // ── Draw black screen ──
    function drawBlackScreen(timestamp) {
        if (blackScreenAlpha < 1) {
            blackScreenAlpha += 0.02;
            if (blackScreenAlpha > 1) blackScreenAlpha = 1;
        }

        ctx.fillStyle = `rgba(0, 0, 0, ${blackScreenAlpha})`;
        ctx.fillRect(0, 0, W, H);

        if (blackScreenAlpha >= 1) {
            const elapsed = (timestamp - blackScreenStartTime) / 1000;
            const textAlpha = Math.min(1, Math.max(0, elapsed - 0.5));

            ctx.save();
            ctx.globalAlpha = textAlpha;
            ctx.font = '700 28px "Rajdhani", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillStyle = '#00ff66';
            ctx.fillText('TASK COMPLETE', W / 2, H / 2 - 20);

            ctx.font = '400 14px "Share Tech Mono", monospace';
            ctx.fillStyle = '#3a5a4a';
            ctx.fillText('Wiring fixed successfully.', W / 2, H / 2 + 20);
            ctx.restore();

            ctx.save();
            ctx.globalAlpha = textAlpha * 0.5;
            ctx.font = '400 12px "Share Tech Mono", monospace';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#2a3a3a';
            ctx.fillText('Click anywhere to play again', W / 2, H / 2 + 60);
            ctx.restore();
        }
    }

    // ── Main loop ──
    function loop(timestamp) {
        update(timestamp);

        ctx.clearRect(0, 0, W, H);

        if (gameState === 'cover') {
            drawCoverPhase(timestamp);
        } else if (gameState === 'blackscreen') {
            drawBlackScreen(timestamp);
        } else {
            drawGame(timestamp);
        }

        requestAnimationFrame(loop);
    }

    // ── Input handling ──
    function getPos(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        if (e.changedTouches && e.changedTouches.length > 0) {
            return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    function handleStart(e) {
        e.preventDefault();
        const pos = getPos(e);

        if (gameState === 'cover') {
            if (coverState === 'bolted') {
                // Check if tapping a bolt
                for (let i = 0; i < bolts.length; i++) {
                    const bolt = bolts[i];
                    if (bolt.unscrewed) continue;
                    const dx = pos.x - (bolt.x + coverOffsetX);
                    const dy = pos.y - (bolt.y + coverOffsetY);
                    if (Math.sqrt(dx * dx + dy * dy) < 24) {
                        activeBolt = i;
                        return;
                    }
                }
            } else if (coverState === 'unbolted') {
                // Check if tapping the cover to drag it
                if (pos.x >= panelX + coverOffsetX && pos.x <= panelX + panelW + coverOffsetX &&
                    pos.y >= panelY + coverOffsetY && pos.y <= panelY + panelH + coverOffsetY) {
                    coverDragging = true;
                    coverDragStart = { x: pos.x - coverOffsetX, y: pos.y - coverOffsetY };
                }
            }
            return;
        }

        if (gameState === 'complete') {
            return;
        }

        if (gameState === 'blackscreen') {
            resetAll();
            return;
        }

        if (gameState === 'playing') {
            // Check wire ends
            for (let i = 0; i < wires.length; i++) {
                const w = wires[i];
                if (w.connected) continue;
                const dx = pos.x - w.leftX;
                const dy = pos.y - w.leftY;
                if (Math.abs(dx) < 40 && Math.abs(dy) < 24) {
                    dragging = i;
                    dragX = pos.x;
                    dragY = pos.y;
                    break;
                }
            }
        }
    }

    function handleMove(e) {
        e.preventDefault();
        const pos = getPos(e);

        if (gameState === 'cover' && coverDragging) {
            coverOffsetX = pos.x - coverDragStart.x;
            coverOffsetY = pos.y - coverDragStart.y;

            // If dragged far enough, trigger removal animation
            const dist = Math.sqrt(coverOffsetX * coverOffsetX + coverOffsetY * coverOffsetY);
            if (dist > 100) {
                coverDragging = false;
                coverState = 'removing';
                triggerShake(5);
            }
            return;
        }

        if (dragging !== null) {
            dragX = pos.x;
            dragY = pos.y;
        }
    }

    function handleEnd(e) {
        e.preventDefault();
        const pos = getPos(e);

        if (gameState === 'cover') {
            if (coverDragging) {
                // Check if dragged far enough
                const dist = Math.sqrt(coverOffsetX * coverOffsetX + coverOffsetY * coverOffsetY);
                if (dist > 60) {
                    coverState = 'removing';
                    triggerShake(5);
                } else {
                    // Snap back
                    coverOffsetX = 0;
                    coverOffsetY = 0;
                }
                coverDragging = false;
            }
            // Stop bolt unscrewing on release (bolt continues via animation until done)
            return;
        }

        if (gameState === 'complete') {
            // After complete, clicking starts over
            setTimeout(() => {
                if (gameState === 'complete') {
                    gameState = 'blackscreen';
                    blackScreenAlpha = 0;
                    blackScreenStartTime = performance.now();
                }
            }, 200);
            return;
        }

        if (dragging === null) return;

        const w = wires[dragging];
        const wireCount = wires.length;
        const spacing = panelH / (wireCount + 1);

        let matched = false;
        const rightOrder = currentRightOrder;
        rightOrder.forEach((color, i) => {
            const sy = panelY + spacing * (i + 1);
            const sx = panelX + panelW - 30;
            const dx = pos.x - sx;
            const dy = pos.y - sy;
            // Check color match AND that this is the correct slot for this wire
            const isCorrectSlot = color === w.color && Math.abs(w.rightY - sy) < 5;
            // Also check the slot isn't already taken
            const slotTaken = wires.some(wire => wire.connected && Math.abs(wire.rightY - sy) < 5);
            if (Math.sqrt(dx * dx + dy * dy) < 30 && isCorrectSlot && !slotTaken && !matched) {
                w.connected = true;
                w.connectAnim = 1;
                matched = true;
                addSpark(sx, sy);
                triggerShake(2);

                if (wires.every(wire => wire.connected)) {
                    gameState = 'complete';
                    flashColor = '#00ff66';
                    flashAlpha = 0.3;
                    completionTime = performance.now();

                    for (let j = 0; j < 5; j++) {
                        setTimeout(() => {
                            addSpark(
                                panelX + Math.random() * panelW,
                                panelY + Math.random() * panelH
                            );
                        }, j * 100);
                    }

                    setTimeout(() => {
                        gameState = 'blackscreen';
                        blackScreenAlpha = 0;
                        blackScreenStartTime = performance.now();
                    }, 2000);
                }
            }
        });

        if (!matched) {
            w.snapBackT = 1;
            w.snapBackFrom = { x: dragX, y: dragY };
        }

        dragging = null;
    }

    // ── Event listeners ──
    canvas.addEventListener('mousedown', handleStart);
    canvas.addEventListener('mousemove', handleMove);
    canvas.addEventListener('mouseup', handleEnd);
    canvas.addEventListener('touchstart', handleStart, { passive: false });
    canvas.addEventListener('touchmove', handleMove, { passive: false });
    canvas.addEventListener('touchend', handleEnd, { passive: false });
    window.addEventListener('resize', resize);

    // ── Boot ──
    resize();
    gameState = 'cover';
    requestAnimationFrame(loop);
})();
