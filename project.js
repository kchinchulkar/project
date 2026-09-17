(function(){
  "use strict";

  /* ============================================================
     SHARED CONFIG + HELPERS (used by every page module below)
     ============================================================ */
  const CONFIG = { SKIP_LIVE_FETCH: true }; // flip to false once a real backend exists
  document.getElementById("globalLastSync").textContent = "Last sync: " + new Date().toLocaleTimeString();

  function timeAgo(iso){
    const secs = Math.max(0, Math.round((Date.now() - new Date(iso).getTime())/1000));
    if (secs < 60) return secs + "s ago";
    if (secs < 3600) return Math.round(secs/60) + "m ago";
    return Math.round(secs/3600) + "h ago";
  }

  /* ============================================================
     PAGE ROUTER — swaps which <section> is visible
     ============================================================ */
  const pages = document.querySelectorAll(".page");
  const navButtons = document.querySelectorAll(".module");
  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      navButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      pages.forEach(p => p.classList.remove("active"));
      document.getElementById("page-" + btn.dataset.page).classList.add("active");
    });
  });

  /* ============================================================
     COMMAND CENTER MODULE
     ============================================================ */
  (function CommandCenter(){
    const el = {
      alertsTableBody: document.getElementById("cc-alertsTableBody"),
      alertsCount: document.getElementById("cc-alertsCount"),
      deviceTableBody: document.getElementById("cc-deviceTableBody"),
      gaugeFill: document.getElementById("cc-gaugeFill"),
      gaugeNeedle: document.getElementById("cc-gaugeNeedle"),
      gaugeValue: document.getElementById("cc-gaugeValue"),
      statHumidity: document.getElementById("cc-statHumidity"),
      statVoltage: document.getElementById("cc-statVoltage"),
      trendChart: document.getElementById("cc-trendChart"),
      metricUptime: document.getElementById("cc-metricUptime"),
      metricAlerts: document.getElementById("cc-metricAlerts"),
      pulseStatus: document.getElementById("cc-pulseStatus"),
      pulseLine: document.getElementById("cc-pulseLine"),
    };
    let deviceFilter = "all";
    let lastDevices = [];
    let lastTrend = [];
    let refreshInFlight = false;

    const mock = {
      alerts: () => ([
        { sensorName:"MQ-2 Smoke/Gas Sensor", value:"320 ppm (elevated)", status:"alert", deviceName:"ESP32-1 (Server Room)", updatedAt:new Date(Date.now()-4000).toISOString() },
        { sensorName:"LDR Light Detector", value:"Lights on", status:"alert", deviceName:"ESP32-2 (Lab Room)", updatedAt:new Date(Date.now()-1000).toISOString() },
      ]),
      devices: () => ([
        { ip:"10.0.1.16", name:"ESP32-1 — Server Room (DHT22 + MQ-2)", status:"alert" },
        { ip:"10.0.1.44", name:"ESP32-2 — Lab Room (LDR + DHT11)", status:"normal" },
      ]),
      environment: () => ({ temperatureF:75.2, humidityPct:27.4, smokeLevel:320 }),
      trend: () => {
        const now = Date.now();
        return Array.from({length:24},(_,i)=>({ timestamp:new Date(now-(23-i)*3600000).toISOString(), valueF:70+Math.sin(i/3)*3+Math.random()*1.5 }));
      },
    };

    function statusPill(status){ return `<span class="status-pill ${status}">${status.charAt(0).toUpperCase()+status.slice(1)}</span>`; }

    function renderAlerts(alerts){
      el.alertsCount.textContent = alerts.length;
      el.alertsTableBody.innerHTML = alerts.map(a => `
        <tr><td style="padding-left:18px;">${a.sensorName}</td><td>${a.value}</td><td>${statusPill(a.status)}</td><td style="color:var(--accent-cyan);">${a.deviceName}</td>
        <td style="text-align:right; padding-right:18px;">${timeAgo(a.updatedAt)}</td></tr>`).join("");
    }

    function renderDevices(devices){
      lastDevices = devices;
      const filtered = deviceFilter === "alert" ? devices.filter(d=>d.status!=="normal") : devices;
      el.deviceTableBody.innerHTML = filtered.map(d => `
        <tr><td style="padding-left:18px; color:var(--text-faint);">${d.ip}</td><td>${d.name}</td>
        <td style="text-align:right; padding-right:18px;">${statusPill(d.status)}</td></tr>`).join("");
    }

    function renderEnvironment(env){
      const min=0, max=120;
      const pct = Math.min(1, Math.max(0, (env.temperatureF-min)/(max-min)));
      el.gaugeFill.style.strokeDashoffset = String(220 - 220*pct);
      el.gaugeNeedle.style.transform = `rotate(${-90+pct*180}deg)`;
      const color = env.temperatureF>90 ? "var(--status-critical)" : env.temperatureF>80 ? "var(--status-warning)" : "var(--status-normal)";
      el.gaugeFill.style.stroke = color;
      el.gaugeValue.textContent = env.temperatureF.toFixed(1)+"°F";
      el.statHumidity.textContent = env.humidityPct.toFixed(1)+"%";
      el.statVoltage.textContent = env.smokeLevel+" ppm";
    }

    function renderTrend(points){
      const canvas = el.trendChart;
      const ctx = canvas.getContext("2d");
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight || 220;
      if (!w || !h) return;
      canvas.width = w*dpr; canvas.height = h*dpr;
      ctx.setTransform(dpr,0,0,dpr,0,0);
      ctx.clearRect(0,0,w,h);
      if (!points || points.length<2) return;
      const values = points.map(p=>p.valueF);
      const minV = Math.min(...values)-1, maxV = Math.max(...values)+1;
      const stepX = w/(points.length-1);
      ctx.strokeStyle = "rgba(255,255,255,0.05)"; ctx.lineWidth = 1;
      for (let i=0;i<=4;i++){ const y=(h/4)*i; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }
      const grad = ctx.createLinearGradient(0,0,0,h);
      grad.addColorStop(0,"rgba(45,212,255,0.28)"); grad.addColorStop(1,"rgba(45,212,255,0)");
      ctx.beginPath();
      points.forEach((p,i)=>{ const x=i*stepX, y=h-((p.valueF-minV)/(maxV-minV))*h; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
      ctx.lineTo(w,h); ctx.lineTo(0,h); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
      ctx.beginPath();
      points.forEach((p,i)=>{ const x=i*stepX, y=h-((p.valueF-minV)/(maxV-minV))*h; i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
      ctx.strokeStyle = "#2DD4FF"; ctx.lineWidth = 2; ctx.stroke();
    }

    function renderPulseWave(){
      const points=[]; const n=60;
      for (let i=0;i<n;i++){ const x=(1000/(n-1))*i; const y=30+Math.sin(i/2.3+Date.now()/900)*10+Math.sin(i/5)*4; points.push(x+","+y); }
      el.pulseLine.setAttribute("points", points.join(" "));
    }

    document.getElementById("cc-filterAll").addEventListener("click", (e)=>{ deviceFilter="all"; document.getElementById("cc-filterAll").classList.add("active"); document.getElementById("cc-filterAlert").classList.remove("active"); renderDevices(lastDevices); });
    document.getElementById("cc-filterAlert").addEventListener("click", (e)=>{ deviceFilter="alert"; document.getElementById("cc-filterAlert").classList.add("active"); document.getElementById("cc-filterAll").classList.remove("active"); renderDevices(lastDevices); });

    async function refresh(){
      if (refreshInFlight) return;
      refreshInFlight = true;
      try {
        const alerts = mock.alerts(), devices = mock.devices(), env = mock.environment();
        lastTrend = mock.trend();
        renderAlerts(alerts); renderDevices(devices); renderEnvironment(env); renderTrend(lastTrend);
        const alertCount = alerts.filter(a=>a.status==="alert").length;
        el.metricAlerts.textContent = alertCount;
        el.pulseStatus.textContent = alertCount>0 ? "ATTENTION NEEDED" : "NOMINAL";
        el.pulseStatus.className = "pulse-status " + (alertCount>0 ? "crit":"");
        el.metricUptime.textContent = "99.9%";
      } finally { refreshInFlight = false; }
    }
    refresh();
    setInterval(refresh, 5000);
    setInterval(renderPulseWave, 80);
    window.addEventListener("resize", ()=>{ if (lastTrend.length) renderTrend(lastTrend); });
  })();

  /* ============================================================
     DIGITAL SERVER ROOM MODULE
     ============================================================ */
  (function DigitalServerRoom(){
    const el = { detailPanel: document.getElementById("dsr-detailPanel"), topoSvg: document.getElementById("dsr-topoSvg") };
    const ANCHORS = { "esp32-1":{x:105,y:90}, "server-1":{x:375,y:90}, "server-2":{x:625,y:90}, "esp32-2":{x:895,y:90}, "switch":{x:500,y:250}, "guardian":{x:500,y:410} };
    const LINKS = [["server-1","switch"],["server-2","switch"],["switch","guardian"],["esp32-1","guardian"],["esp32-2","guardian"]];
    let selectedNode = null;
    let currentTopology = null;

    function mockTopology(){
      return { nodes: {
        "server-1": { status:"normal", cpu:34, ram:61, uptime:"14d 6h", ip:"147.0.27.208" },
        "server-2": { status:"normal", cpu:28, ram:55, uptime:"14d 6h", ip:"147.0.27.212" },
        "switch": { status:"normal", throughput:"112 Mbps", ports:"6/8 active" },
        "guardian": { status:"normal", policy:"auto-heal: ON", lastAction:"none in last 10m" },
        "esp32-1": { status:"alert", sensor:"DHT22 + MQ-2", lastReading:"0.0 Hz (fault)", ip:"10.0.1.16" },
        "esp32-2": { status:"normal", sensor:"LDR + DHT11", lastReading:"Lights on", ip:"10.0.1.44" },
      }};
    }

    function statusToClass(s){ return s==="alert"?"status-alert":s==="warning"?"status-warning":"status-normal"; }
    function pillLabel(s){ return s==="alert"?"Alert":s==="warning"?"Warning":"Normal"; }

    function renderNodes(nodes){
      Object.entries(nodes).forEach(([id,data])=>{
        const nodeEl = document.getElementById("dsr-node-"+id), pillEl = document.getElementById("dsr-pill-"+id);
        if (!nodeEl||!pillEl) return;
        nodeEl.classList.remove("status-normal","status-warning","status-alert");
        nodeEl.classList.add(statusToClass(data.status));
        pillEl.className = "status-pill " + data.status;
        pillEl.textContent = id==="guardian" && data.status==="normal" ? "Active" : pillLabel(data.status);
      });
    }

    function renderLines(nodes){
      const svgNS = "http://www.w3.org/2000/svg";
      el.topoSvg.innerHTML = "";
      LINKS.forEach(([fromId,toId])=>{
        const a=ANCHORS[fromId], b=ANCHORS[toId];
        const fromStatus = nodes[fromId]?nodes[fromId].status:"normal", toStatus = nodes[toId]?nodes[toId].status:"normal";
        const line = document.createElementNS(svgNS,"path");
        const midY = (a.y+b.y)/2;
        line.setAttribute("d", `M ${a.x} ${a.y} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y}`);
        line.setAttribute("class", (fromStatus==="alert"||toStatus==="alert") ? "topo-line alert" : "topo-line active");
        el.topoSvg.appendChild(line);
      });
    }

    function renderDetail(nodeId, nodes){
      const data = nodes[nodeId];
      if (!data){ el.detailPanel.innerHTML = `<div class="empty-detail">Select a node to see its details.</div>`; return; }
      const rows = Object.entries(data).filter(([k])=>k!=="status").map(([k,v])=>`
        <div class="detail-row"><span class="detail-label">${k.toUpperCase()}</span><span class="detail-value">${v}</span></div>`).join("");
      el.detailPanel.innerHTML = `
        <div class="detail-row"><span class="detail-label">NODE</span><span class="detail-value">${nodeId.replace("-"," ").toUpperCase()}</span></div>
        <div class="detail-row"><span class="detail-label">STATUS</span><span class="status-pill ${data.status}">${pillLabel(data.status)}</span></div>
        ${rows}`;
    }

    document.querySelectorAll("#page-digital-server-room .node").forEach(nodeEl=>{
      nodeEl.addEventListener("click", ()=>{
        document.querySelectorAll("#page-digital-server-room .node").forEach(n=>n.classList.remove("selected"));
        nodeEl.classList.add("selected");
        selectedNode = nodeEl.dataset.node;
        if (currentTopology) renderDetail(selectedNode, currentTopology.nodes);
      });
    });

    function refresh(){
      currentTopology = mockTopology();
      renderNodes(currentTopology.nodes);
      renderLines(currentTopology.nodes);
      if (selectedNode) renderDetail(selectedNode, currentTopology.nodes);
    }
    refresh();
    setInterval(refresh, 5000);
    window.addEventListener("resize", ()=>{ if (currentTopology) renderLines(currentTopology.nodes); });
  })();

  /* ============================================================
     INCIDENT CENTER MODULE
     ============================================================ */
  (function IncidentCenter(){
    const el = { tableBody: document.getElementById("ic-tableBody"), count: document.getElementById("ic-incidentCount"), detailPanel: document.getElementById("ic-detailPanel") };
    let selectedId = null;
    let currentIncidents = [];

    function mockIncidents(){
      const now = Date.now();
      return [
        { id:"INC-1042", severity:"critical", device:"E-5D E04 DDNS Test Unit", symptom:"ACLM frequency dropped to 0.0 Hz", status:"healing", openedAt:new Date(now-3*60000).toISOString(),
          timeline:[
            {step:"Detected",state:"done",detail:"Anomaly detector flagged frequency outside normal band.",time:"3m ago"},
            {step:"Diagnosed",state:"done",detail:"AI: 91% confidence — sensor/port fault on ACLM Port 2.",time:"2m ago"},
            {step:"Policy Decision",state:"done",detail:"Guardian approved: restart monitoring agent (low-risk, reversible).",time:"2m ago"},
            {step:"Healing",state:"active",detail:"Executing: restarting ACLM port monitoring agent.",time:"1m ago"},
            {step:"Verify",state:"pending",detail:"Waiting for post-action reading.",time:"—"},
          ]},
        { id:"INC-1041", severity:"critical", device:"E-5D E04 DDNS Test Unit", symptom:"ACLM voltage abnormal (5.6 V)", status:"diagnosing", openedAt:new Date(now-4*60000).toISOString(),
          timeline:[
            {step:"Detected",state:"done",detail:"Voltage far below expected range.",time:"4m ago"},
            {step:"Diagnosed",state:"active",detail:"Correlating with INC-1042 — probable shared cause.",time:"1m ago"},
            {step:"Policy Decision",state:"pending",detail:"Awaiting diagnosis.",time:"—"},
            {step:"Healing",state:"pending",detail:"Not started.",time:"—"},
            {step:"Verify",state:"pending",detail:"Not started.",time:"—"},
          ]},
        { id:"INC-1039", severity:"warning", device:"E-5DEL-1 (E07)", symptom:"Unexpected light detector activation", status:"resolved", openedAt:new Date(now-26*60000).toISOString(),
          timeline:[
            {step:"Detected",state:"done",detail:"Light detector reported lights-on outside scheduled hours.",time:"26m ago"},
            {step:"Diagnosed",state:"done",detail:"AI: 78% confidence — manual entry by lab personnel.",time:"25m ago"},
            {step:"Policy Decision",state:"done",detail:"No automated action required.",time:"25m ago"},
            {step:"Healing",state:"done",detail:"No healing action needed.",time:"25m ago"},
            {step:"Verify",state:"done",detail:"Incident closed.",time:"20m ago"},
          ]},
      ];
    }

    function sevBadge(sev){ const cls = sev==="critical"?"sev-critical":sev==="warning"?"sev-warning":"sev-info"; return `<span class="sev-badge ${cls}">${sev.charAt(0).toUpperCase()+sev.slice(1)}</span>`; }
    function statusPill(status){ const map={healing:"warning",diagnosing:"warning",resolved:"normal",open:"alert"}; const cls=map[status]||"normal"; return `<span class="status-pill ${cls}">${status.charAt(0).toUpperCase()+status.slice(1)}</span>`; }

    function renderTable(incidents){
      el.count.textContent = incidents.length;
      el.tableBody.innerHTML = incidents.map(inc => `
        <tr class="incident-row ${inc.id===selectedId?"selected":""}" data-id="${inc.id}">
          <td style="padding-left:18px; color:var(--accent-cyan); font-family:var(--font-display);">${inc.id}</td>
          <td>${sevBadge(inc.severity)}</td><td>${inc.device}</td><td>${inc.symptom}</td><td>${statusPill(inc.status)}</td>
          <td style="text-align:right; padding-right:18px; color:var(--text-faint);">${timeAgo(inc.openedAt)}</td>
        </tr>`).join("");
      document.querySelectorAll("#page-incident-center .incident-row").forEach(row=>{
        row.addEventListener("click", ()=>{ selectedId = row.dataset.id; renderTable(currentIncidents); renderDetail(selectedId); });
      });
    }

    function renderDetail(id){
      const inc = currentIncidents.find(i=>i.id===id);
      if (!inc){ el.detailPanel.innerHTML = `<div class="empty-detail">Select an incident.</div>`; return; }
      const steps = inc.timeline.map(s=>`
        <div class="timeline-step ${s.state}"><div class="timeline-dot"></div><div class="timeline-title">${s.step}</div>
        <div class="timeline-body">${s.detail}</div><div class="timeline-time">${s.time}</div></div>`).join("");
      el.detailPanel.innerHTML = `
        <div class="detail-header"><div><div class="detail-title">${inc.id}</div><div class="detail-sub">${inc.device} — ${inc.symptom}</div></div>${sevBadge(inc.severity)}</div>
        <div class="timeline">${steps}</div>`;
    }

    function refresh(){
      currentIncidents = mockIncidents();
      renderTable(currentIncidents);
      if (selectedId) renderDetail(selectedId);
    }
    refresh();
    setInterval(refresh, 5000);
  })();

  /* ============================================================
     AI DIAGNOSIS MODULE
     ============================================================ */
  (function AiDiagnosis(){
    const el = { picker: document.getElementById("ai-picker"), signals: document.getElementById("ai-signals"), causes: document.getElementById("ai-causes"), modelLabel: document.getElementById("ai-modelLabel") };
    let selectedId = null;
    let currentDiagnoses = [];

    function mockDiagnoses(){
      return [
        { incidentId:"INC-1042", model:"rule-engine + anomaly-classifier v0.3",
          signals:[{label:"ACLM Frequency",value:"0.0 Hz (expected ~50 Hz)"},{label:"ACLM Voltage",value:"5.6 V (expected ~120 V)"},{label:"Port history",value:"3 similar faults in 30 days"}],
          causes:[
            {name:"Sensor/port hardware fault (Port 2)",confidence:91,evidence:["Frequency & voltage both dropped to near-zero simultaneously","Same port had 3 similar faults in 30 days","No drop on any other port"]},
            {name:"Real upstream power event",confidence:5,evidence:["No other devices on same circuit show deviation"]},
            {name:"Telemetry glitch (false reading)",confidence:4,evidence:["Persisted across 3 polling cycles — unusual for a transient glitch"]},
          ]},
        { incidentId:"INC-1041", model:"rule-engine + anomaly-classifier v0.3",
          signals:[{label:"ACLM Voltage",value:"5.6 V (expected ~120 V)"},{label:"Same device as",value:"INC-1042"},{label:"Time correlation",value:"Within 4s of INC-1042"}],
          causes:[
            {name:"Shared root cause with INC-1042",confidence:87,evidence:["Started within 4 seconds of INC-1042 on same device","Both point to same ACLM Port 2 hardware"]},
            {name:"Independent voltage sag",confidence:13,evidence:["Cannot fully rule out until INC-1042 healing completes"]},
          ]},
        { incidentId:"INC-1039", model:"rule-engine + anomaly-classifier v0.3",
          signals:[{label:"Light Detector (2)",value:"Lights on, 22:14 local time"},{label:"Scheduled hours",value:"Lab unoccupied after 20:00"},{label:"Door sensor",value:"Not installed"}],
          causes:[
            {name:"Manual entry by lab personnel",confidence:78,evidence:["Activation shortly after typical after-hours access patterns","No anomaly on any other sensor"]},
            {name:"Faulty light sensor",confidence:22,evidence:["Cannot be ruled out without a door/motion sensor for cross-reference"]},
                 
          ]},
      ];
    }

    function renderPicker(diagnoses){
      el.picker.innerHTML = diagnoses.map(d=>`<button class="incident-chip ${d.incidentId===selectedId?"active":""}" data-id="${d.incidentId}">${d.incidentId}</button>`).join("");
      document.querySelectorAll("#page-ai-diagnosis .incident-chip").forEach(chip=>{
        chip.addEventListener("click", ()=>{ selectedId = chip.dataset.id; renderPicker(currentDiagnoses); renderSelected(selectedId); });
      });
    }

    function renderSignals(d){
      if (!d){ el.signals.innerHTML = `<div class="empty-detail">Select an incident.</div>`; return; }
      el.signals.innerHTML = d.signals.map(s=>`<div class="signal-row"><span class="signal-label">${s.label}</span><span class="signal-value">${s.value}</span></div>`).join("");
    }

    function renderCauses(d){
      if (!d){ el.causes.innerHTML = `<div class="empty-detail">Select an incident.</div>`; el.modelLabel.textContent = "Model: —"; return; }
      el.modelLabel.textContent = "Model: " + d.model;
      const top = d.causes[0];
      const banner = `<div class="verdict-banner">🎯 <span class="verdict-text">Most likely cause: <b>${top.name}</b> (${top.confidence}% confidence)</span></div>`;
      const cards = d.causes.map((c,i)=>`
        <div class="cause-card ${i===0?"top":""}">
          <div class="cause-head"><span class="cause-name">${i+1}. ${c.name}</span><span class="cause-confidence">${c.confidence}%</span></div>
          <div class="cause-bar-track"><div class="cause-bar-fill" style="width:${c.confidence}%;"></div></div>
          <div class="cause-evidence">Evidence:<ul>${c.evidence.map(e=>`<li>${e}</li>`).join("")}</ul></div>
        </div>`).join("");
      el.causes.innerHTML = banner + cards;
    }

    function renderSelected(id){
      const d = currentDiagnoses.find(x=>x.incidentId===id);
      renderSignals(d); renderCauses(d);
    }

    function refresh(){
      currentDiagnoses = mockDiagnoses();
      if (!selectedId && currentDiagnoses.length) selectedId = currentDiagnoses[0].incidentId;
      renderPicker(currentDiagnoses);
      renderSelected(selectedId);
    }
    refresh();
    setInterval(refresh, 5000);
  })();

  /* ============================================================
     HEALING CENTER MODULE
     ============================================================ */
  (function HealingCenter(){
    const el = { list: document.getElementById("hc-list"), activeCount: document.getElementById("hc-activeCount"), summary: document.getElementById("hc-summary"), policyBody: document.getElementById("hc-policyBody") };
    let tick = 0;

    function mockActions(){
      const executingProgress = Math.min(95, 30+tick*12);
      return [
        { id:"HEAL-501", incidentId:"INC-1042", action:"Restart ACLM port monitoring agent", device:"E-5D E04 DDNS Test Unit", state:"executing", progress:executingProgress, startedAgo:"1m ago", riskLevel:"Low", reversible:true },
        { id:"HEAL-499", incidentId:"INC-1039", action:"No action — logged as informational", device:"E-5DEL-1 (E07)", state:"succeeded", progress:100, startedAgo:"25m ago", riskLevel:"None", reversible:true },
        { id:"HEAL-497", incidentId:"INC-1030", action:"Restart telemetry agent on Server 2", device:"E-16D Server Rack Monitor", state:"succeeded", progress:100, startedAgo:"3h ago", riskLevel:"Low", reversible:true },
        { id:"HEAL-492", incidentId:"INC-1021", action:"Failover traffic from Server 1 to Server 2", device:"Server 1", state:"failed", progress:60, startedAgo:"1d ago", riskLevel:"Medium", reversible:true, failureReason:"Verification timed out — rolled back automatically" },
      ];
    }
    function mockPolicies(){
      return [
        { rule:"Max blast radius", value:"1 device per action" },
        { rule:"Reversibility required", value:"Yes" },
        { rule:"Human approval for", value:"Medium/High risk" },
        { rule:"Auto-rollback on failed verify", value:"Enabled" },
        { rule:"AI shell access", value:"None — proposals only" },
      ];
    }
    function stateLabel(s){ return {executing:"Executing",succeeded:"Succeeded",failed:"Failed / Rolled back",pending:"Pending approval"}[s]||s; }

    function renderSummary(actions){
      const executing = actions.filter(a=>a.state==="executing").length;
      const succeeded = actions.filter(a=>a.state==="succeeded").length;
      const failed = actions.filter(a=>a.state==="failed").length;
      el.activeCount.textContent = executing;
      el.summary.innerHTML = `
        <div class="guardian-stat"><span class="guardian-stat-value" style="color:var(--status-warning);">${executing}</span><span class="guardian-stat-label">In progress</span></div>
        <div class="guardian-stat"><span class="guardian-stat-value" style="color:var(--status-normal);">${succeeded}</span><span class="guardian-stat-label">Succeeded (24h)</span></div>
        <div class="guardian-stat"><span class="guardian-stat-value" style="color:var(--status-critical);">${failed}</span><span class="guardian-stat-label">Failed / rolled back</span></div>`;
    }

    function renderActions(actions){
      el.list.innerHTML = actions.map(a=>{
        const barClass = a.state==="succeeded"?"done":a.state==="failed"?"failed":"";
        return `
        <div class="heal-card ${a.state}">
          <div class="heal-head"><div><div class="heal-title">${a.id} — ${a.action}</div><div class="heal-sub">${a.device} · linked to ${a.incidentId}</div></div>
          <span class="status-pill ${a.state==="succeeded"?"normal":a.state==="failed"?"alert":"warning"}">${stateLabel(a.state)}</span></div>
          <div class="heal-progress-track"><div class="heal-progress-fill ${barClass}" style="width:${a.progress}%;"></div></div>
          <div class="heal-meta"><span>Risk: <b>${a.riskLevel}</b></span><span>Reversible: <b>${a.reversible?"Yes":"No"}</b></span><span>Started: <b>${a.startedAgo}</b></span>
          ${a.failureReason?`<span style="color:var(--status-critical);">${a.failureReason}</span>`:""}</div>
        </div>`;
      }).join("");
    }

    function renderPolicies(policies){
      el.policyBody.innerHTML = policies.map(p=>`<tr><td style="color:var(--text-faint);">${p.rule}</td><td style="text-align:right; color:var(--text-primary); font-weight:600;">${p.value}</td></tr>`).join("");
    }

    function refresh(){
      const actions = mockActions();
      renderSummary(actions); renderActions(actions); renderPolicies(mockPolicies());
      tick++;
    }
    refresh();
    setInterval(refresh, 4000);
  })();

  /* ============================================================
     FAULT INJECTION MODULE
     ============================================================ */
  (function FaultInjection(){
    const el = {
      list: document.getElementById("fi-list"), log: document.getElementById("fi-log"),
      overlay: document.getElementById("fi-confirmOverlay"), body: document.getElementById("fi-confirmBody"),
      cancelBtn: document.getElementById("fi-cancelBtn"), proceedBtn: document.getElementById("fi-proceedBtn"),
    };
    const FAULTS = [
      { id:"temp-spike", name:"Simulate temperature spike", desc:"Injects a reading of 98°F on the server room sensor.", target:"Target: E-2D Lab Room Environment Monitor" },
      { id:"sensor-dropout", name:"Simulate sensor dropout", desc:"Stops publishing from ESP32-1 to simulate a dead sensor.", target:"Target: ESP32-1 (Server Room)" },
      { id:"voltage-fault", name:"Simulate voltage fault", desc:"Injects near-zero voltage, same pattern as INC-1042.", target:"Target: E-5D E04 DDNS Test Unit" },
      { id:"server-down", name:"Simulate Server 2 going down", desc:"Marks Server 2 unreachable to test failover.", target:"Target: Server 2 (Failover node)" },
      { id:"false-light", name:"Simulate light sensor false trigger", desc:"Fires a lights-on event outside scheduled hours.", target:"Target: ESP32-2 (Lab room)" },
    ];
    let pending = null;
    const sessionLog = [];

    function renderList(){
      el.list.innerHTML = FAULTS.map(f=>`
        <div class="fault-card"><div class="fault-info"><div class="fault-name">${f.name}</div><div class="fault-desc">${f.desc}</div><div class="fault-target">${f.target}</div></div>
        <button class="fault-btn" data-id="${f.id}">Inject Fault</button></div>`).join("");
      document.querySelectorAll("#page-fault-injection .fault-btn").forEach(btn=>{
        btn.addEventListener("click", ()=>openConfirm(btn.dataset.id));
      });
    }

    function openConfirm(id){
      pending = FAULTS.find(f=>f.id===id);
      if (!pending) return;
      el.body.textContent = `This will inject: "${pending.name}" on the demo system. Proceed?`;
      el.overlay.classList.add("open");
    }
    function closeConfirm(){ el.overlay.classList.remove("open"); pending = null; }

    function renderLog(){
      if (!sessionLog.length){ el.log.innerHTML = `<div style="color:var(--text-faint); font-style:italic; text-align:center; padding:24px;">No faults injected yet.</div>`; return; }
      el.log.innerHTML = sessionLog.map(entry=>`
        <div class="log-entry"><b>${entry.name}</b> <span style="color:var(--text-faint);">(mock — no backend)</span><div class="log-time">${entry.time}</div></div>`).join("");
    }

    el.cancelBtn.addEventListener("click", closeConfirm);
    el.proceedBtn.addEventListener("click", ()=>{
      if (!pending) return;
      sessionLog.unshift({ time:new Date().toLocaleTimeString(), name:pending.name });
      closeConfirm();
      renderLog();
    });
    el.overlay.addEventListener("click", (e)=>{ if (e.target===el.overlay) closeConfirm(); });

    renderList();
    renderLog();
  })();

})();