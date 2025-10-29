    
        const presets = {
            'shor-2048': { qubits: 4096, tGates: 2000000000, error: 0.0001 },
            'grover-256': { qubits: 256, tGates: 500000000, error: 0.001 },
            'quantum-sim': { qubits: 50, tGates: 10000000, error: 0.001 },
            'vqe-small': { qubits: 20, tGates: 50000, error: 0.01 }
        };
        
        let currentResults = null;
        
        function loadPreset() {
            const preset = document.getElementById('algorithmPreset').value;
            if (preset !== 'custom' && presets[preset]) {
                document.getElementById('logicalQubits').value = presets[preset].qubits;
                document.getElementById('tGates').value = presets[preset].tGates;
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
            const errorRate = parseFloat(document.getElementById('errorRate').value);
            const hardware = document.getElementById('hardware').value;
            
            const codeDistance = Math.max(5, Math.ceil(Math.log(tGates * errorRate) / Math.log(0.1)) * 2 + 1);
            
            const schemes = [
                { name: 'Surface Code', physPerLog: d => d * d * 2, overhead: 15, feasibility: 'near-term' },
                { name: 'Cat Qubits', physPerLog: d => d * 4, overhead: 8, feasibility: 'near-term' },
                { name: 'Color Code', physPerLog: d => d * d * 2.5, overhead: 10, feasibility: 'long-term' },
                { name: 'Bacon-Shor', physPerLog: d => d * d * 1.5, overhead: 12, feasibility: 'long-term' }
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
                const physicalQubits = Math.round(logicalQubits * physPerLog);
                const effectiveDepth = Math.round(tGates * s.overhead);
                const runtime = effectiveDepth * gateTime * codeDistance;
                const successProb = Math.exp(-effectiveDepth * errorRate);
                
                return {
                    name: s.name,
                    physicalQubits,
                    codeDistance,
                    runtime: formatTime(runtime),
                    successProb: (successProb * 100).toFixed(2) + '%',
                    feasibility: s.feasibility
                };
            });
            
            currentResults = {
                schemes: results,
                params: { logicalQubits, tGates, errorRate, hardware }
            };
            
            displayResults(results);
            showToast('Estimator Ready');
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
                    <div class="stat-value">${best.runtime.split(' ')[0]}<span class="stat-unit">${best.runtime.split(' ')[1]}</span></div>
                </div>
            `;
            
            document.getElementById('schemeGrid').innerHTML = results.map((r, i) => `
                <div class="scheme-card ${i === 0 ? 'selected' : ''}" onclick="selectScheme(${i})">
                    <div class="scheme-name">${r.name}</div>
                    <div class="scheme-metric">
                        <span class="metric-label">Physical Qubits</span>
                        <span class="metric-value ${r.physicalQubits < 10000 ? 'good' : r.physicalQubits < 100000 ? 'warning' : 'bad'}">
                            ${formatNumber(r.physicalQubits)}
                        </span>
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
                        <span class="metric-value good">${r.successProb}</span>
                    </div>
                    <div class="badge ${r.feasibility}">${r.feasibility === 'near-term' ? '2-5 years' : '5-10 years'}</div>
                </div>
            `).join('');
            
            document.getElementById('insights').innerHTML = `
                <h3><i class="fas fa-lightbulb"></i> Key Insights</h3>
                <ul>
                    <li>Best option: <strong>${best.name}</strong> requires ${formatNumber(best.physicalQubits)} physical qubits</li>
                    <li>Estimated runtime: <strong>${best.runtime}</strong> on selected hardware</li>
                    <li>${best.physicalQubits > 100000 ? 'This exceeds current hardware capabilities - consider reducing T-gate count' : 'Resource requirements are within reach of near-term systems'}</li>
                    <li>Reducing T-gates by 50% would save approximately ${formatNumber(Math.round(best.physicalQubits * 0.25))} physical qubits</li>
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
                showToast('Please calculate resources first');
                return;
            }
            
            const { schemes, params } = currentResults;
            const best = schemes[0];
            
            // Create a new window for PDF generation
            const printWindow = window.open('', '', 'width=800,height=600');
            
            const pdfContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Quantum Resource Estimation Report</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            padding: 40px;
            color: #333;
        }
        h1 {
            color: #1a1a1a;
            border-bottom: 3px solid #667eea;
            padding-bottom: 10px;
        }
        h2 {
            color: #667eea;
            margin-top: 30px;
        }
        .section {
            margin: 20px 0;
        }
        .param-grid {
            display: grid;
            grid-template-columns: 200px 1fr;
            gap: 10px;
            margin: 20px 0;
        }
        .param-label {
            font-weight: bold;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
        }
        th, td {
            border: 1px solid #ddd;
            padding: 12px;
            text-align: left;
        }
        th {
            background-color: #f5f5f5;
            font-weight: bold;
        }
        .highlight {
            background-color: #f0f3ff;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
        }
        .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
            font-size: 12px;
            color: #666;
        }
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
            <div class="param-label">Physical Qubits:</div>
            <div><strong>${formatNumber(best.physicalQubits)}</strong></div>
            <div class="param-label">Code Distance:</div>
            <div><strong>${best.codeDistance}</strong></div>
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
                        <td><strong>${s.name}</strong></td>
                        <td>${formatNumber(s.physicalQubits)}</td>
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
        <h2>Key Insights</h2>
        <ul>
            <li>The <strong>${best.name}</strong> scheme provides the most efficient configuration for your requirements.</li>
            <li>Total physical qubits required: <strong>${formatNumber(best.physicalQubits)}</strong></li>
            <li>Estimated execution time: <strong>${best.runtime}</strong> on ${params.hardware} hardware</li>
            <li>${best.physicalQubits > 100000 
                ? 'Note: This configuration exceeds current hardware capabilities. Consider algorithm optimization or waiting for hardware advances.' 
                : 'This configuration is within reach of near-term quantum systems.'}</li>
            <li>Optimizing T-gate count by 50% could reduce physical qubit requirements by approximately ${formatNumber(Math.round(best.physicalQubits * 0.25))} qubits.</li>
        </ul>
    </div>
    
    <div class="footer">
        <p>Report generated: ${new Date().toLocaleString()}</p>
        <p>Quantum Circuit Resource Estimator</p>
    </div>
</body>
</html>
            `;
            
            printWindow.document.write(pdfContent);
            printWindow.document.close();
            
            // Wait for content to load, then trigger print
            setTimeout(() => {
                printWindow.print();
                showToast('PDF export dialog opened');
            }, 250);
        }
        
        function shareResults() {
            if (!currentResults) {
                showToast('Please calculate resources first');
                return;
            }
            
            const { params } = currentResults;
            const url = `${window.location.origin}${window.location.pathname}?qubits=${params.logicalQubits}&tgates=${params.tGates}&error=${params.errorRate}&hw=${params.hardware}`;
            
            navigator.clipboard.writeText(url).then(() => {
                showToast('Share link copied to clipboard');
            }).catch(() => {
                showToast('Could not copy link');
            });
        }
        
        function showToast(message) {
            const existing = document.querySelector('.toast');
            if (existing) existing.remove();
            
            const toast = document.createElement('div');
            toast.className = 'toast success';
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
            return (s / 86400).toFixed(1) + ' days';
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
            document.getElementById('tGates').value = urlParams.get('tgates');
            document.getElementById('errorRate').value = urlParams.get('error');
            document.getElementById('hardware').value = urlParams.get('hw');
            calculateResources();
        }
    