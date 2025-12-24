const presets = {
    'shor-2048': { 
        qubits: 4096, 
        tGates: 2000000000, 
        clifford: 10000000000,
        rotation: 100000000,
        measurements: 50000000,
        error: 0.0001 
    },
    'grover-256': { 
        qubits: 256, 
        tGates: 500000000, 
        clifford: 2000000000,
        rotation: 50000000,
        measurements: 10000000,
        error: 0.001 
    },
    'quantum-sim': { 
        qubits: 50, 
        tGates: 10000000, 
        clifford: 50000000,
        rotation: 5000000,
        measurements: 1000000,
        error: 0.001 
    },
    'vqe-small': { 
        qubits: 20, 
        tGates: 50000, 
        clifford: 200000,
        rotation: 20000,
        measurements: 10000,
        error: 0.01 
    }
};

let currentResults = null;

// T-count per rotation gate (for 10^-8 precision)
const tPerRotation = Math.ceil(3 * Math.log2(1 / 1e-8));

function loadPreset() {
    const preset = document.getElementById('algorithmPreset').value;
    if (preset !== 'custom' && presets[preset]) {
        document.getElementById('logicalQubits').value = presets[preset].qubits;
        document.getElementById('tGates').value = presets[preset].tGates;
        document.getElementById('cliffordGates').value = presets[preset].clifford;
        document.getElementById('rotationGates').value = presets[preset].rotation;
        document.getElementById('measurements').value = presets[preset].measurements;
        document.getElementById('errorRate').value = presets[preset].error;
        calculateResources();
    }
}

function setQuickValue(id, value) {
    document.getElementById(id).value = value;
    calculateResources();
}

function calculateResources() {
    const logicalQubits = parseInt(document.getElementById('logicalQubits').value) || 0;
    const tGates = parseInt(document.getElementById('tGates').value) || 0;
    const cliffordGates = parseInt(document.getElementById('cliffordGates').value) || 0;
    const rotationGates = parseInt(document.getElementById('rotationGates').value) || 0;
    const measurements = parseInt(document.getElementById('measurements').value) || 0;
    const errorRate = parseFloat(document.getElementById('errorRate').value);
    const hardware = document.getElementById('hardware').value;
    
    // Handle edge case: no gates specified
    if (logicalQubits === 0) {
        showToast('⚠ Please specify at least 1 logical qubit');
        return;
    }
    
    // Improved code distance calculation based on standard error correction theory
    // For surface codes: p_logical ≈ A * (p_phys / p_th)^((d+1)/2)
    const physicalErrorRate = 0.001; // Realistic physical error rate for near-term hardware
    const threshold = 0.01; // Surface code threshold (~1%)
    
    // Total logical operations (count only non-zero operations)
    const totalLogicalOps = (tGates > 0 ? tGates : 0) + 
                           (cliffordGates > 0 ? cliffordGates : 0) + 
                           (rotationGates > 0 ? rotationGates : 0) + 
                           (measurements > 0 ? measurements : 0);
    
    if (totalLogicalOps === 0) {
        showToast('⚠ Please specify at least one gate operation');
        return;
    }
    
    // Per-operation error budget
    const perOpErrorBudget = errorRate / totalLogicalOps;
    
    // Calculate required code distance using proper surface code formula
    // p_logical = 0.1 * (p_phys/p_th)^((d+1)/2)
    // Solving for d: d = 2*log(10*p_logical) / log(p_phys/p_th) - 1
    let codeDistance = Math.max(3, Math.ceil(
        (2 * Math.log(perOpErrorBudget / 0.1) / Math.log(physicalErrorRate / threshold)) - 1
    ));
    
    // Code distance must be odd
    if (codeDistance % 2 === 0) codeDistance++;
    
    // Cap at reasonable maximum
    codeDistance = Math.min(codeDistance, 51);
    
    // Rotation gates: decompose to Clifford+T with realistic T-count
    // Using Solovay-Kitaev or direct synthesis: ~3*log2(1/ε) T gates per rotation
    const effectiveTGates = tGates + (rotationGates * tPerRotation);
    
    // T-gate depth: assume some parallelism based on qubit count
    // Can execute ~sqrt(logicalQubits) T gates in parallel typically
    const parallelismFactor = Math.max(1, Math.sqrt(logicalQubits));
    const tDepth = effectiveTGates > 0 ? Math.ceil(effectiveTGates / parallelismFactor) : 0;
    
    // Clifford depth: much better parallelism
    const cliffordDepth = cliffordGates > 0 ? Math.ceil(cliffordGates / logicalQubits) : 0;
    
    // Measurement rounds
    const measurementRounds = measurements > 0 ? Math.ceil(measurements / logicalQubits) : 0;
    
    const schemes = [
        { 
            name: 'Surface Code', 
            physPerLog: d => 2 * d * d, // Standard surface code: 2d² physical qubits
            tFactorySize: 12 * 15, // One 15-to-1 factory needs ~180 qubits per distillation round
            distillationRounds: 2, // Typically need 2 rounds to reach gate-level fidelity
            cliffordCyclesPerGate: 1,
            tCyclesPerGate: d => d, // One code cycle per T gate
            measurementCycles: d => d, // One code cycle per measurement
            feasibility: 'near-term',
            description: 'Most mature, 2D nearest-neighbor'
        },
        { 
            name: 'Cat Qubits', 
            physPerLog: d => 6 * d, // Bias-preserving: only need d^1 scaling in one direction
            tFactorySize: 6 * 15,
            distillationRounds: 2,
            cliffordCyclesPerGate: 1,
            tCyclesPerGate: d => d,
            measurementCycles: d => d,
            feasibility: 'near-term',
            description: 'Bosonic codes, lower overhead'
        },
        { 
            name: 'Color Code', 
            physPerLog: d => 2.5 * d * d, // Slightly higher than surface code
            tFactorySize: 8 * 15,
            distillationRounds: 1, // Transversal gates reduce distillation need
            cliffordCyclesPerGate: 0.5, // Many Clifford gates are transversal
            tCyclesPerGate: d => d * 0.8,
            measurementCycles: d => d,
            feasibility: 'long-term',
            description: 'Transversal Clifford gates'
        },
        { 
            name: 'Bacon-Shor', 
            physPerLog: d => 1.5 * d * d, // Gauge freedom reduces qubit count
            tFactorySize: 10 * 15,
            distillationRounds: 2,
            cliffordCyclesPerGate: 1.2,
            tCyclesPerGate: d => d * 1.1,
            measurementCycles: d => d,
            feasibility: 'long-term',
            description: 'Gauge code, asymmetric errors'
        }
    ];
    
    const gateTimes = {
        superconducting: 50e-9,
        ion: 5e-6,
        photonic: 1e-9,
        neutral: 2e-6
    };
    
    const gateTime = gateTimes[hardware];
    
    const results = schemes.map(s => {
        const physPerLog = s.physPerLog(codeDistance);
        
        // Data qubits: logical qubits × physical per logical
        const dataQubits = Math.round(logicalQubits * physPerLog);
        
        // T-state factories (only if we have T gates)
        // Number of factories needed to keep up with T-gate consumption rate
        // Factory production rate vs circuit consumption rate
        let tFactoryQubits = 0;
        let factoryCount = 0;
        
        if (effectiveTGates > 0) {
            // Each factory produces 1 T-state per ~d code cycles after distillation rounds
            const cyclesPerTState = codeDistance * Math.pow(15, s.distillationRounds);
            const tStatesPerSecond = 1 / (cyclesPerTState * gateTime * codeDistance);
            
            // Circuit consumes T gates at rate: tDepth / totalRuntime
            // Need enough factories to match this rate
            const cliffordTime = cliffordDepth * codeDistance * gateTime;
            const tGateTime = tDepth * s.tCyclesPerGate(codeDistance) * codeDistance * gateTime;
            const circuitTime = cliffordTime + tGateTime;
            
            const requiredTStatesPerSecond = effectiveTGates / circuitTime;
            factoryCount = Math.ceil(requiredTStatesPerSecond / tStatesPerSecond);
            
            // Each factory needs space for distillation rounds
            const qubitsPerFactory = s.tFactorySize * s.distillationRounds;
            tFactoryQubits = Math.round(factoryCount * qubitsPerFactory);
        }
        
        const physicalQubits = dataQubits + tFactoryQubits;
        
        // Calculate total circuit depth in code cycles
        const tCycleDepth = tDepth * s.tCyclesPerGate(codeDistance);
        const cliffordCycleDepth = cliffordDepth * s.cliffordCyclesPerGate;
        const measurementCycleDepth = measurementRounds * s.measurementCycles(codeDistance);
        const totalCycles = tCycleDepth + cliffordCycleDepth + measurementCycleDepth;
        
        // Runtime: cycles × code cycle time
        // Code cycle time = d × physical gate time
        const codeCycleTime = codeDistance * gateTime;
        const runtime = totalCycles * codeCycleTime;
        
        // Success probability using proper exponential suppression
        // p_fail_per_cycle = A * (p_phys/p_th)^((d+1)/2) where A ≈ 0.1 for surface codes
        const logicalErrorPerCycle = 0.1 * Math.pow(physicalErrorRate / threshold, (codeDistance + 1) / 2);
        const totalErrorProb = totalCycles * logicalErrorPerCycle;
        const successProb = Math.max(0, Math.min(100, (1 - totalErrorProb) * 100));
        
        return {
            name: s.name,
            physicalQubits,
            dataQubits,
            codeDistance,
            runtime: formatTime(runtime),
            runtimeSeconds: runtime,
            successProb: successProb.toFixed(2) + '%',
            feasibility: s.feasibility,
            description: s.description,
            tFactoryQubits,
            factoryCount,
            totalCycles: Math.round(totalCycles),
            breakdown: {
                tCycles: Math.round(tCycleDepth),
                cliffordCycles: Math.round(cliffordCycleDepth),
                measurementCycles: Math.round(measurementCycleDepth)
            }
        };
    });
    
    currentResults = {
        schemes: results,
        params: { logicalQubits, tGates, cliffordGates, rotationGates, measurements, errorRate, hardware }
    };
    
    displayResults(results);
    showToast('✓ Calculation Complete');
}

function displayResults(results) {
    const best = results.reduce((a, b) => a.physicalQubits < b.physicalQubits ? a : b);
    
    document.getElementById('summary').innerHTML = `
        <div class="stat-card">
            <div class="stat-label">Physical Qubits</div>
            <div class="stat-value">${formatNumber(best.physicalQubits)}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Code Distance</div>
            <div class="stat-value">${best.codeDistance}</div>
        </div>
        <div class="stat-card">
            <div class="stat-label">Estimated Runtime</div>
            <div class="stat-value">${best.runtime.split(' ')[0]}<span class="stat-unit">${best.runtime.split(' ').slice(1).join(' ')}</span></div>
        </div>
    `;
    
    document.getElementById('schemeGrid').innerHTML = results.map((r, i) => `
        <div class="scheme-card ${i === 0 ? 'selected' : ''}" onclick="selectScheme(${i})">
            <div class="scheme-name">${r.name}</div>
            <div style="font-size: 12px; color: #888; margin-bottom: 12px;">${r.description}</div>
            <div class="scheme-metric">
                <span class="metric-label">Physical Qubits</span>
                <span class="metric-value ${r.physicalQubits < 10000 ? 'good' : r.physicalQubits < 100000 ? 'warning' : 'bad'}">
                    ${formatNumber(r.physicalQubits)}
                </span>
            </div>
            <div class="scheme-metric">
                <span class="metric-label">Data / Factory</span>
                <span class="metric-value">${formatNumber(r.dataQubits)} / ${formatNumber(r.tFactoryQubits)}</span>
            </div>
            <div class="scheme-metric">
                <span class="metric-label">Code Distance</span>
                <span class="metric-value">${r.codeDistance}</span>
            </div>
            <div class="scheme-metric">
                <span class="metric-label">Runtime</span>
                <span class="metric-value">${r.runtime}</span>
            </div>
            <div class="scheme-metric">
                <span class="metric-label">Success Rate</span>
                <span class="metric-value ${parseFloat(r.successProb) > 90 ? 'good' : parseFloat(r.successProb) > 50 ? 'warning' : 'bad'}">${r.successProb}</span>
            </div>
            ${r.factoryCount > 0 ? `<div class="scheme-metric">
                <span class="metric-label">T Factories</span>
                <span class="metric-value">${r.factoryCount}</span>
            </div>` : ''}
            <div class="badge ${r.feasibility}">${r.feasibility === 'near-term' ? '2-5 years' : '5-10 years'}</div>
        </div>
    `).join('');
    
    const totalGates = currentResults.params.tGates + currentResults.params.cliffordGates + currentResults.params.rotationGates;
    const effectiveTTotal = currentResults.params.tGates + (currentResults.params.rotationGates * tPerRotation);
    
    const gateBreakdown = [];
    if (currentResults.params.tGates > 0) gateBreakdown.push(`${formatNumber(currentResults.params.tGates)} T gates`);
    if (currentResults.params.cliffordGates > 0) gateBreakdown.push(`${formatNumber(currentResults.params.cliffordGates)} Clifford gates`);
    if (currentResults.params.rotationGates > 0) gateBreakdown.push(`${formatNumber(currentResults.params.rotationGates)} rotation gates (≈${formatNumber(currentResults.params.rotationGates * tPerRotation)} effective T gates)`);
    if (currentResults.params.measurements > 0) gateBreakdown.push(`${formatNumber(currentResults.params.measurements)} measurements`);
    
    const insights = [];
    
    insights.push(`Best option: <strong>${best.name}</strong> requires ${formatNumber(best.physicalQubits)} physical qubits total`);
    insights.push(`Breakdown: ${formatNumber(best.dataQubits)} data qubits + ${formatNumber(best.tFactoryQubits)} factory qubits${best.factoryCount > 0 ? ` (${best.factoryCount} factories)` : ''}`);
    insights.push(`Code distance of <strong>${best.codeDistance}</strong> achieves ${(currentResults.params.errorRate * 100).toFixed(3)}% target error rate`);
    insights.push(`Estimated runtime: <strong>${best.runtime}</strong> (${formatNumber(best.totalCycles)} code cycles) on ${currentResults.params.hardware} hardware`);
    insights.push(`Gate breakdown: ${gateBreakdown.join(', ')}`);
    
    if (effectiveTTotal > 0) {
        insights.push(`Effective T-count: ${formatNumber(effectiveTTotal)} gates over ${formatNumber(best.breakdown.tCycles)} code cycles`);
    }
    
    if (best.physicalQubits > 100000) {
        insights.push('⚠ This exceeds current hardware (most systems have <1000 qubits). Consider: (1) optimizing T-count, (2) using better codes, (3) waiting for hardware advances');
    } else if (best.physicalQubits > 10000) {
        insights.push('This is at the edge of near-term capabilities. Hardware with 10K+ high-fidelity qubits expected within 5 years');
    } else {
        insights.push('✓ Resource requirements are within reach of near-term quantum systems');
    }
    
    if (effectiveTTotal > currentResults.params.cliffordGates) {
        const saving = Math.round(best.tFactoryQubits * 0.5);
        insights.push(`T gates dominate cost (${((effectiveTTotal/totalGates)*100).toFixed(0)}% of operations). Reducing T-count by 50% would save ~${formatNumber(saving)} qubits`);
    }
    
    if (parseFloat(best.successProb) < 50) {
        insights.push(`⚠ Low success probability (${best.successProb}). Consider: (1) higher code distance, (2) lower error rate target, (3) circuit optimization`);
    }
    
    document.getElementById('insights').innerHTML = `
        <h3><i class="fas fa-lightbulb"></i> Key Insights</h3>
        <ul>
            ${insights.map(i => `<li>${i}</li>`).join('')}
        </ul>
    `;
}

function selectScheme(idx) {
    document.querySelectorAll('.scheme-card').forEach((c, i) => {
        c.classList.toggle('selected', i === idx);
    });
}

function exportPDF() {
    if (!currentResults) {
        showToast('⚠ Please calculate resources first');
        return;
    }
    
    const { schemes, params } = currentResults;
    const best = schemes[0];
    
    const printWindow = window.open('', '', 'width=800,height=600');
    
    const pdfContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Quantum Resource Estimation Report</title>
    <style>
        body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
        h1 { color: #1a1a1a; border-bottom: 3px solid #667eea; padding-bottom: 10px; }
        h2 { color: #667eea; margin-top: 30px; }
        .section { margin: 20px 0; }
        .param-grid { display: grid; grid-template-columns: 250px 1fr; gap: 10px; margin: 20px 0; }
        .param-label { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        th { background-color: #f5f5f5; font-weight: bold; }
        .highlight { background-color: #f0f3ff; padding: 15px; border-radius: 5px; margin: 20px 0; }
        .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <h1>Quantum Resource Estimation Report</h1>
    
    <div class="section">
        <h2>Algorithm Parameters</h2>
        <div class="param-grid">
            <div class="param-label">Logical Qubits:</div>
            <div>${params.logicalQubits}</div>
            <div class="param-label">T Gates:</div>
            <div>${formatNumber(params.tGates)}</div>
            <div class="param-label">Clifford Gates:</div>
            <div>${formatNumber(params.cliffordGates)}</div>
            <div class="param-label">Rotation Gates:</div>
            <div>${formatNumber(params.rotationGates)}</div>
            <div class="param-label">Measurements:</div>
            <div>${formatNumber(params.measurements)}</div>
            <div class="param-label">Target Error Rate:</div>
            <div>${(params.errorRate * 100).toFixed(3)}%</div>
            <div class="param-label">Hardware Platform:</div>
            <div>${params.hardware.charAt(0).toUpperCase() + params.hardware.slice(1)}</div>
        </div>
    </div>
    
    <div class="highlight">
        <h2>Recommended Configuration</h2>
        <div class="param-grid">
            <div class="param-label">Best Scheme:</div>
            <div><strong>${best.name}</strong></div>
            <div class="param-label">Physical Qubits (Total):</div>
            <div><strong>${formatNumber(best.physicalQubits)}</strong></div>
            <div class="param-label">Data Qubits:</div>
            <div><strong>${formatNumber(best.dataQubits)}</strong></div>
            <div class="param-label">T-State Factory Qubits:</div>
            <div><strong>${formatNumber(best.tFactoryQubits)}</strong></div>
            <div class="param-label">Number of T Factories:</div>
            <div><strong>${best.factoryCount}</strong></div>
            <div class="param-label">Code Distance:</div>
            <div><strong>${best.codeDistance}</strong></div>
            <div class="param-label">Total Code Cycles:</div>
            <div><strong>${formatNumber(best.totalCycles)}</strong></div>
            <div class="param-label">Estimated Runtime:</div>
            <div><strong>${best.runtime}</strong></div>
            <div class="param-label">Success Probability:</div>
            <div><strong>${best.successProb}</strong></div>
            <div class="param-label">Timeline:</div>
            <div><strong>${best.feasibility === 'near-term' ? '2-5 years' : '5-10 years'}</strong></div>
        </div>
    </div>
    
    <div class="section">
        <h2>All Error Correction Schemes Comparison</h2>
        <table>
            <thead>
                <tr>
                    <th>Scheme</th>
                    <th>Physical Qubits</th>
                    <th>Code Distance</th>
                    <th>Runtime</th>
                    <th>Success Rate</th>
                    <th>Timeline</th>
                </tr>
            </thead>
            <tbody>
                ${schemes.map(s => `
                    <tr>
                        <td><strong>${s.name}</strong><br><small>${s.description}</small></td>
                        <td>${formatNumber(s.physicalQubits)}<br><small>${formatNumber(s.dataQubits)} data + ${formatNumber(s.tFactoryQubits)} factory</small></td>
                        <td>${s.codeDistance}</td>
                        <td>${s.runtime}</td>
                        <td>${s.successProb}</td>
                        <td>${s.feasibility === 'near-term' ? '2-5 years' : '5-10 years'}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>
    
    <div class="section">
        <h2>Gate Count Analysis</h2>
        <ul>
            <li>T Gates: ${formatNumber(params.tGates)} (most expensive, require magic state distillation)</li>
            <li>Clifford Gates: ${formatNumber(params.cliffordGates)} (transversal, low cost)</li>
            <li>Rotation Gates: ${formatNumber(params.rotationGates)} (decomposed into ~${tPerRotation} T gates each)</li>
            <li>Measurements: ${formatNumber(params.measurements)}</li>
            <li>Total Effective T Gates: ~${formatNumber(params.tGates + params.rotationGates * tPerRotation)}</li>
        </ul>
    </div>
    
    <div class="section">
        <h2>Code Cycle Breakdown</h2>
        <ul>
            <li>T Gate Cycles: ${formatNumber(best.breakdown.tCycles)}</li>
            <li>Clifford Cycles: ${formatNumber(best.breakdown.cliffordCycles)}</li>
            <li>Measurement Cycles: ${formatNumber(best.breakdown.measurementCycles)}</li>
            <li>Total Cycles: ${formatNumber(best.totalCycles)}</li>
        </ul>
    </div>
    
    <div class="footer">
        <p>Report generated: ${new Date().toLocaleString()}</p>
        <p>Quantum Circuit Resource Estimator - Improved Calculations v2.0</p>
    </div>
</body>
</html>
    `;
    
    printWindow.document.write(pdfContent);
    printWindow.document.close();
    
    setTimeout(() => {
        printWindow.print();
        showToast('✓ PDF export ready');
    }, 250);
}

function shareResults() {
    if (!currentResults) {
        showToast('⚠ Please calculate resources first');
        return;
    }
    
    const { params } = currentResults;
    const url = `${window.location.origin}${window.location.pathname}?qubits=${params.logicalQubits}&tgates=${params.tGates}&clifford=${params.cliffordGates}&rotation=${params.rotationGates}&measure=${params.measurements}&error=${params.errorRate}&hw=${params.hardware}`;
    
    navigator.clipboard.writeText(url).then(() => {
        showToast('✓ Share link copied to clipboard');
    }).catch(() => {
        showToast('⚠ Could not copy link');
    });
}

function showInfo() {
    alert('Quantum Resource Estimator v2.0 - Improved Calculations\n\nThis tool calculates the physical qubit requirements for fault-tolerant quantum computation using industry-standard formulas.\n\nKey Concepts:\n• Logical Qubits: Error-corrected qubits needed for your algorithm\n• T Gates: Expensive non-Clifford gates requiring magic state distillation\n• Clifford Gates: Cheap gates (H, S, CNOT) implemented transversally\n• Rotation Gates: Decomposed into ~50-70 T gates each\n• Code Distance: Controls error suppression (must be odd)\n• Physical Qubits: Actual hardware qubits needed\n\nImprovements in v2.0:\n✓ Proper surface code distance formula\n✓ Realistic T-factory sizing (15-to-1 distillation)\n✓ Parallelism modeling\n✓ Support for zero gate counts\n✓ Better success probability estimates\n✓ Detailed cycle breakdown\n\nAll gates can be set to 0 if not used in your algorithm.');
}

function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `
        <i class="fas fa-check-circle"></i>
        <span>${message}</span>
    `;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.remove(), 3000);
}

function formatNumber(n) {
    return n.toLocaleString();
}

function formatTime(s) {
    if (s < 1e-6) return (s * 1e9).toFixed(1) + ' ns';
    if (s < 1e-3) return (s * 1e6).toFixed(1) + ' μs';
    if (s < 1) return (s * 1e3).toFixed(1) + ' ms';
    if (s < 60) return s.toFixed(1) + ' s';
    if (s < 3600) return (s / 60).toFixed(1) + ' min';
    if (s < 86400) return (s / 3600).toFixed(1) + ' hrs';
    if (s < 86400 * 365) return (s / 86400).toFixed(1) + ' days';
    return (s / (86400 * 365)).toFixed(1) + ' years';
}

// Auto-calculate on load
calculateResources();

// Auto-update on input changes
document.querySelectorAll('.form-input, .form-select').forEach(el => {
    el.addEventListener('change', calculateResources);
});

// Load from URL parameters
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('qubits')) {
    document.getElementById('logicalQubits').value = urlParams.get('qubits');
    document.getElementById('tGates').value = urlParams.get('tgates') || 0;
    if (urlParams.has('clifford')) document.getElementById('cliffordGates').value = urlParams.get('clifford');
    if (urlParams.has('rotation')) document.getElementById('rotationGates').value = urlParams.get('rotation');
    if (urlParams.has('measure')) document.getElementById('measurements').value = urlParams.get('measure');
    document.getElementById('errorRate').value = urlParams.get('error');
    document.getElementById('hardware').value = urlParams.get('hw');
    calculateResources();
}
