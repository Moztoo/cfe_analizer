(() => {
  let appData = null;
  let viewMode = "direct"; // "direct" (2024-2026) | "full" (2022-2026)
  let currentView = "overview"; // "overview" | "simulator" | "records" | "profile"
  let activeChartType = "tiers"; // "tiers" | "costs" | "dac"
  let selectedPeriodKey = null;
  let privacyMasked = true;

  const fmtMoney = (v) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(Number(v || 0));

  const fmtInt = (v) =>
    new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 }).format(Number(v || 0));

  const fmtDec = (v, d = 2) =>
    new Intl.NumberFormat("es-MX", {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(Number(v || 0));

  const el = (id) => document.getElementById(id);

  async function fetchDashboardData() {
    try {
      const res = await fetch("/api/data");
      appData = await res.json();
      const items = getActiveItems();
      if (items.length) {
        selectedPeriodKey = items[items.length - 1].key;
      }
      populateYearFilter();
      renderAll();
    } catch (err) {
      console.error("Error cargando datos:", err);
      el("header-period-badge").textContent = "Error de conexión";
    }
  }

  function getActiveItems() {
    if (!appData) return [];
    return viewMode === "full" ? appData.full_timeline : appData.invoices;
  }

  function getActiveSummary() {
    if (!appData) return {};
    return viewMode === "full" ? appData.summary_full : appData.summary_direct;
  }

  function switchView(targetView) {
    currentView = targetView;
    document.querySelectorAll(".nav-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.getAttribute("data-view") === targetView);
    });
    ["overview", "simulator", "records", "profile"].forEach((v) => {
      el(`view-${v}`).classList.toggle("hidden", v !== targetView);
    });
    if (targetView === "overview") {
      renderMainChart();
    }
  }

  function applyPrivacyState() {
    document.querySelectorAll(".sensitive").forEach((n) => {
      n.classList.toggle("masked", privacyMasked);
    });
    el("privacy-label").textContent = privacyMasked ? "Mostrar datos" : "Ocultar datos";
  }

  function renderHeaderAndProfile() {
    const { profile, files_stats } = appData;
    const sum = getActiveSummary();

    el("header-period-badge").textContent = `${sum.primer_periodo || "—"} – ${
      sum.ultimo_periodo || "—"
    } (${sum.periodos_count || 0} bim)`;

    el("prof-titular").textContent = profile.titular;
    el("prof-rpu").textContent = profile.rpu;
    el("prof-rfc").textContent = profile.rfc;
    el("prof-rmu").textContent = profile.rmu;
    el("prof-medidor").textContent = profile.medidor;
    el("prof-tarifa").textContent = profile.tarifa;
    el("prof-direccion").textContent = `${profile.direccion}, ${profile.colonia}, CP ${profile.cp}, ${profile.municipio}`;

    const dupCount = (files_stats.duplicate_files_ignored || []).length;
    el("prof-files").textContent =
      dupCount > 0
        ? `${files_stats.unique_invoices} facturas PE · ${files_stats.unique_payments} pagos PV/P9 (${dupCount} duplicados omitidos)`
        : `${files_stats.unique_invoices} facturas PE · ${files_stats.unique_payments} pagos PV/P9`;

    applyPrivacyState();
  }

  function renderKPIs() {
    const sum = getActiveSummary();
    if (!sum || !sum.latest) return;
    const { latest } = sum;
    const dacLimit = appData.profile.dac_limite_anual_kwh || 3000;

    el("kpi-last-period").textContent = latest.periodo;
    el("kpi-last-kwh").textContent = `${fmtInt(latest.kwh)} kWh`;
    el("kpi-last-total").textContent = fmtMoney(latest.total);
    el("kpi-last-daily").textContent = `${fmtDec(latest.consumo_diario, 2)} kWh/día`;

    const badge = el("kpi-last-badge");
    const dk = latest.delta_kwh_pct;
    badge.textContent = `${dk > 0 ? "+" : ""}${dk}%`;
    badge.className = `tag ${dk > 0 ? "tag-up" : "tag-down"}`;

    el("kpi-count-bim").textContent = `${sum.periodos_count} bim`;
    el("kpi-avg-kwh").textContent = `${fmtDec(sum.avg_kwh_bim, 1)} kWh`;
    el("kpi-avg-cost").textContent = `${fmtMoney(sum.avg_total_bim)} / bim`;
    el("kpi-avg-daily-cost").textContent = `${fmtMoney(sum.avg_daily_cost)} / día`;

    const directSum = appData.summary_direct;
    el("kpi-exc-tag").textContent = `Excedente ${directSum.pct_costo_excedente}% $`;
    el("kpi-cost-kwh").innerHTML = `${fmtMoney(sum.avg_cost_per_kwh)} <small>/kWh</small>`;
    el("kpi-total-cost").textContent = fmtMoney(sum.total_facturado);

    // Datos en vista Simulador
    el("kpi-exc-cost-pct").textContent = `${directSum.pct_costo_excedente}%`;
    el("kpi-exc-kwh-pct").textContent = `${sum.pct_kwh_excedente}%`;
    el("kpi-exc-kwh-total").textContent = `${fmtInt(sum.kwh_excedente)} kWh`;
    el("kpi-exc-cost-total").textContent = fmtMoney(directSum.subtotal_excedente);

    // Monitor DAC
    el("kpi-dac-rolling").innerHTML = `${fmtInt(
      latest.rolling_annual_kwh
    )} <small>/ ${fmtInt(dacLimit)} kWh</small>`;
    const pct = Math.min(100, Math.max(0, latest.dac_pct));
    el("dac-progress-bar").style.width = `${pct}%`;

    const dacBadge = el("dac-badge");
    if (latest.dac_pct >= 100) {
      dacBadge.textContent = "Alerta DAC";
      dacBadge.className = "tag tag-up";
    } else if (latest.dac_pct >= 90) {
      dacBadge.textContent = `${latest.dac_pct}%`;
      dacBadge.className = "tag tag-amber";
    } else {
      dacBadge.textContent = `${latest.dac_pct}%`;
      dacBadge.className = "tag tag-down";
    }

    const margin = latest.dac_margin_kwh;
    el("kpi-dac-sub").textContent =
      margin >= 0
        ? `Margen: ${fmtInt(margin)} kWh anuales`
        : `Excede por ${fmtInt(Math.abs(margin))} kWh`;
  }

  function renderInspector() {
    const items = getActiveItems();
    if (!items.length) return;
    let item = items.find((x) => x.key === selectedPeriodKey);
    if (!item) {
      item = items[items.length - 1];
      selectedPeriodKey = item.key;
    }

    el("insp-period").textContent = item.periodo_label;
    el("insp-folio").textContent = item.key;
    el("insp-total").textContent = fmtMoney(item.total_factura);
    el("insp-dates").textContent = `${item.periodo_desde} al ${item.periodo_hasta} (${item.dias} días)`;
    el("insp-kwh").textContent = `${fmtInt(item.kwh_total)} kWh`;
    el("insp-daily").textContent = `${fmtDec(item.consumo_diario, 2)} kWh/día · ${fmtMoney(
      item.costo_kwh_total
    )}/kWh`;

    el("insp-b-kwh").textContent = `${item.kwh_basico} kWh`;
    el("insp-i-kwh").textContent = `${item.kwh_intermedio} kWh`;
    el("insp-e-kwh").textContent = `${item.kwh_excedente} kWh`;

    el("insp-b-cost").textContent =
      item.subtotal_basico > 0 ? fmtMoney(item.subtotal_basico) : "—";
    el("insp-i-cost").textContent =
      item.subtotal_intermedio > 0 ? fmtMoney(item.subtotal_intermedio) : "—";
    el("insp-e-cost").textContent =
      item.subtotal_excedente > 0 ? fmtMoney(item.subtotal_excedente) : "—";

    el("insp-energia").textContent = fmtMoney(item.subtotal_energia);
    el("insp-iva").textContent = fmtMoney(item.iva);
    el("insp-dap").textContent = fmtMoney(item.dap);
    el("insp-subsidio").textContent =
      item.subsidio_gub > 0 ? fmtMoney(item.subsidio_gub) : "No disponible";
    el("insp-lecturas").textContent =
      item.lectura_actual > 0
        ? `${item.lectura_anterior} → ${item.lectura_actual}`
        : "Registro histórico";
    el("insp-pago").textContent = item.estado_pago;
  }

  /* Tooltip */
  const tooltip = el("chart-tooltip");
  function showTooltip(evt, html) {
    tooltip.innerHTML = html;
    tooltip.classList.remove("hidden");
    let x = evt.clientX + 12;
    let y = evt.clientY + 12;
    if (x + 240 > window.innerWidth) x = evt.clientX - 250;
    if (y + 120 > window.innerHeight) y = evt.clientY - 120;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }
  function hideTooltip() {
    tooltip.classList.add("hidden");
  }

  function renderMainChart() {
    const stage = el("main-chart-stage");
    const legend = el("main-chart-legend");
    const title = el("main-chart-title");
    const items = getActiveItems();
    if (!items.length) return;

    const width = stage.clientWidth || 720;
    const height = stage.clientHeight || 320;
    const pad = { top: 18, right: 20, bottom: 48, left: 52 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    if (activeChartType === "tiers") {
      title.textContent = "Consumo por Escalón Tarifario (kWh)";
      legend.innerHTML = `
        <span><i class="sq-dot c-basico"></i> Básico (0–150)</span>
        <span><i class="sq-dot c-intermedio"></i> Intermedio (151–280)</span>
        <span><i class="sq-dot c-excedente"></i> Excedente (&gt;280)</span>
      `;

      const maxKwh = Math.max(620, ...items.map((d) => d.kwh_total)) * 1.08;
      const stepX = plotW / items.length;
      const barW = Math.min(32, Math.max(10, stepX * 0.62));
      const yPos = (val) => pad.top + plotH - (val / maxKwh) * plotH;

      let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
      [0, 150, 280, 450, 600].forEach((t) => {
        if (t > maxKwh) return;
        const y = yPos(t);
        svg += `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#1c1c21" stroke-width="1"/>`;
        svg += `<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" fill="#71717a" font-size="11">${t}</text>`;
      });

      const y500 = yPos(500);
      svg += `<line x1="${pad.left}" y1="${y500}" x2="${width - pad.right}" y2="${y500}" stroke="#52525b" stroke-dasharray="4,4" stroke-width="1"/>`;
      svg += `<text x="${width - pad.right}" y="${y500 - 5}" text-anchor="end" fill="#a1a1aa" font-size="10">Prom. DAC (500 kWh)</text>`;

      items.forEach((d, idx) => {
        const cx = pad.left + idx * stepX + stepX / 2;
        const x = cx - barW / 2;
        const isSelected = d.key === selectedPeriodKey;

        const hB = (d.kwh_basico / maxKwh) * plotH;
        const hI = (d.kwh_intermedio / maxKwh) * plotH;
        const hE = (d.kwh_excedente / maxKwh) * plotH;

        const yB = pad.top + plotH - hB;
        const yI = yB - hI;
        const yE = yI - hE;

        const opacity = isSelected ? "1" : "0.75";
        svg += `<g class="chart-item" data-idx="${idx}" style="cursor:pointer; opacity:${opacity}">`;
        if (isSelected) {
          svg += `<rect x="${x - 3}" y="${pad.top}" width="${barW + 6}" height="${plotH}" fill="#1f1f26" rx="4"/>`;
        }
        svg += `<rect x="${x}" y="${yB}" width="${barW}" height="${Math.max(0, hB)}" fill="#10b981" rx="2"/>`;
        svg += `<rect x="${x}" y="${yI}" width="${barW}" height="${Math.max(0, hI)}" fill="#f59e0b" rx="2"/>`;
        svg += `<rect x="${x}" y="${yE}" width="${barW}" height="${Math.max(0, hE)}" fill="#ef4444" rx="2"/>`;
        svg += `</g>`;

        const showEvery = items.length > 18 ? 2 : 1;
        if (idx % showEvery === 0 || idx === items.length - 1) {
          svg += `<text x="${cx}" y="${height - pad.bottom + 16}" text-anchor="end" transform="rotate(-30 ${cx} ${
            height - pad.bottom + 16
          })" fill="${isSelected ? "#fafafa" : "#71717a"}" font-weight="${
            isSelected ? "600" : "400"
          }" font-size="10.5">${d.periodo_label}</text>`;
        }
      });

      svg += `</svg>`;
      stage.innerHTML = svg;
    } else if (activeChartType === "costs") {
      title.textContent = "Desglose Financiero vs Subsidio ($ MXN)";
      legend.innerHTML = `
        <span><i class="sq-dot c-energia"></i> Energía</span>
        <span><i class="sq-dot c-iva"></i> IVA 16%</span>
        <span><i class="sq-dot c-dap"></i> DAP</span>
        <span><i class="sq-dot c-basico"></i> Subsidio CFE (línea)</span>
      `;

      const maxCost =
        Math.max(2000, ...items.map((d) => Math.max(d.total_factura, d.subsidio_gub))) * 1.08;
      const stepX = plotW / items.length;
      const barW = Math.min(32, Math.max(10, stepX * 0.62));
      const yPos = (val) => pad.top + plotH - (val / maxCost) * plotH;

      let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
      [0, 500, 1000, 1500, 2000].forEach((t) => {
        if (t > maxCost) return;
        const y = yPos(t);
        svg += `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#1c1c21" stroke-width="1"/>`;
        svg += `<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" fill="#71717a" font-size="11">$${t}</text>`;
      });

      const subPts = [];
      items.forEach((d, idx) => {
        const cx = pad.left + idx * stepX + stepX / 2;
        const x = cx - barW / 2;
        const isSelected = d.key === selectedPeriodKey;

        const hE = (d.subtotal_energia / maxCost) * plotH;
        const hIva = (d.iva / maxCost) * plotH;
        const hDap = (d.dap / maxCost) * plotH;

        const yE = pad.top + plotH - hE;
        const yIva = yE - hIva;
        const yDap = yIva - hDap;

        const opacity = isSelected ? "1" : "0.75";
        svg += `<g class="chart-item" data-idx="${idx}" style="cursor:pointer; opacity:${opacity}">`;
        if (isSelected) {
          svg += `<rect x="${x - 3}" y="${pad.top}" width="${barW + 6}" height="${plotH}" fill="#1f1f26" rx="4"/>`;
        }
        svg += `<rect x="${x}" y="${yE}" width="${barW}" height="${Math.max(0, hE)}" fill="#3b82f6" rx="2"/>`;
        svg += `<rect x="${x}" y="${yIva}" width="${barW}" height="${Math.max(0, hIva)}" fill="#8b5cf6" rx="2"/>`;
        svg += `<rect x="${x}" y="${yDap}" width="${barW}" height="${Math.max(0, hDap)}" fill="#f59e0b" rx="2"/>`;
        svg += `</g>`;

        if (d.subsidio_gub > 0) {
          subPts.push({ x: cx, y: yPos(d.subsidio_gub) });
        }

        const showEvery = items.length > 18 ? 2 : 1;
        if (idx % showEvery === 0 || idx === items.length - 1) {
          svg += `<text x="${cx}" y="${height - pad.bottom + 16}" text-anchor="end" transform="rotate(-30 ${cx} ${
            height - pad.bottom + 16
          })" fill="${isSelected ? "#fafafa" : "#71717a"}" font-size="10.5">${d.periodo_label}</text>`;
        }
      });

      if (subPts.length > 1) {
        const dPath = subPts
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" ");
        svg += `<path d="${dPath}" fill="none" stroke="#10b981" stroke-width="2"/>`;
        subPts.forEach((p) => {
          svg += `<circle cx="${p.x}" cy="${p.y}" r="3" fill="#10b981"/>`;
        });
      }

      svg += `</svg>`;
      stage.innerHTML = svg;
    } else if (activeChartType === "dac") {
      const dacLimit = appData.profile.dac_limite_anual_kwh || 3000;
      title.textContent = "Suma Móvil Anual (6 Bimestres) vs Límite DAC";
      legend.innerHTML = `
        <span><i class="sq-dot c-energia"></i> Acumulado 12 meses (kWh)</span>
        <span><i class="sq-dot c-excedente"></i> Límite Tarifa 01 (${fmtInt(dacLimit)} kWh)</span>
      `;

      const maxVal = Math.max(dacLimit * 1.1, ...items.map((d) => d.rolling_annual_kwh)) * 1.05;
      const stepX = items.length > 1 ? plotW / (items.length - 1) : plotW;
      const yPos = (val) => pad.top + plotH - (val / maxVal) * plotH;

      let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;
      [0, 1000, 2000, 2500, 3000, 3500].forEach((t) => {
        if (t > maxVal) return;
        const y = yPos(t);
        svg += `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#1c1c21" stroke-width="1"/>`;
        svg += `<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" fill="#71717a" font-size="11">${t}</text>`;
      });

      const yDac = yPos(dacLimit);
      svg += `<line x1="${pad.left}" y1="${yDac}" x2="${width - pad.right}" y2="${yDac}" stroke="#ef4444" stroke-dasharray="4,4" stroke-width="1.3"/>`;

      const pts = items.map((d, idx) => ({
        x: pad.left + idx * stepX,
        y: yPos(d.rolling_annual_kwh),
        d,
        idx,
      }));

      if (pts.length > 1) {
        const lineD = pts
          .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
          .join(" ");
        svg += `<path d="${lineD}" fill="none" stroke="#fafafa" stroke-width="2"/>`;
      }

      pts.forEach((p) => {
        const isSelected = p.d.key === selectedPeriodKey;
        const r = isSelected ? 6 : 4;
        const fill = p.d.rolling_annual_kwh >= dacLimit * 0.95 ? "#f59e0b" : "#3b82f6";
        svg += `<circle class="chart-item" data-idx="${p.idx}" cx="${p.x}" cy="${p.y}" r="${r}" fill="${fill}" stroke="#09090b" stroke-width="1.5" style="cursor:pointer"/>`;

        const showEvery = items.length > 18 ? 2 : 1;
        if (p.idx % showEvery === 0 || p.idx === items.length - 1) {
          svg += `<text x="${p.x}" y="${height - pad.bottom + 16}" text-anchor="end" transform="rotate(-30 ${p.x} ${
            height - pad.bottom + 16
          })" fill="${isSelected ? "#fafafa" : "#71717a"}" font-size="10.5">${
            p.d.periodo_label
          }</text>`;
        }
      });

      svg += `</svg>`;
      stage.innerHTML = svg;
    }

    // Eventos interactivos sobre elementos de la gráfica
    stage.querySelectorAll(".chart-item").forEach((node) => {
      const idx = Number(node.getAttribute("data-idx"));
      const d = items[idx];

      node.addEventListener("click", () => {
        selectedPeriodKey = d.key;
        renderInspector();
        renderMainChart();
      });

      node.addEventListener("mousemove", (evt) => {
        showTooltip(
          evt,
          `<strong>${d.periodo_label}</strong><br/>
           Consumo: <strong>${d.kwh_total} kWh</strong> (${d.consumo_diario} kWh/día)<br/>
           Total: <strong>${fmtMoney(d.total_factura)}</strong><br/>
           Acum. 12m: <strong>${fmtInt(d.rolling_annual_kwh)} kWh (${d.dac_pct}%)</strong>`
        );
      });
      node.addEventListener("mouseleave", hideTooltip);
    });
  }

  function renderYearTable() {
    const tbody = document.querySelector("#year-summary-table tbody");
    const sum = getActiveSummary();
    if (!sum || !sum.by_year) return;

    tbody.innerHTML = sum.by_year
      .map(
        (y) => `
      <tr>
        <td><strong>${y.anio}</strong></td>
        <td>${y.bimestres}</td>
        <td><strong>${fmtInt(y.kwh_total)} kWh</strong></td>
        <td>${fmtDec(y.promedio_kwh_bim, 1)} kWh</td>
        <td><strong>${fmtMoney(y.total_factura)}</strong></td>
        <td>${fmtMoney(y.promedio_factura_bim)}</td>
        <td>${fmtMoney(y.costo_kwh)}</td>
        <td class="c-text-emerald">${y.subsidio_gub > 0 ? fmtMoney(y.subsidio_gub) : "—"}</td>
      </tr>`
      )
      .join("");
  }

  function updateSimulator() {
    if (!appData || !appData.invoices.length) return;
    const latestInv = appData.invoices[appData.invoices.length - 1];
    const pct = Number(el("sim-slider").value || 15);

    const currKwh = latestInv.kwh_total;
    const currBill = latestInv.total_factura;
    const newKwh = Math.max(50, Math.round(currKwh * (1 - pct / 100)));

    const pB = latestInv.precio_basico || 1.132;
    const pI = latestInv.precio_intermedio || 1.377;
    const pE = latestInv.precio_excedente || 4.028;

    const kB = Math.min(150, newKwh);
    const kI = Math.min(130, Math.max(0, newKwh - 150));
    const kE = Math.max(0, newKwh - 280);

    const newEnergy = kB * pB + kI * pI + kE * pE;
    const newIva = newEnergy * 0.16;
    const dapRatio =
      latestInv.subtotal_energia > 0 ? latestInv.dap / latestInv.subtotal_energia : 0.08;
    const newDap = newEnergy * dapRatio;
    const newBill = newEnergy + newIva + newDap;

    const savingBim = Math.max(0, currBill - newBill);
    const savingYear = savingBim * 6;

    el("sim-pct-label").textContent = `${pct}%`;
    el("sim-kwh-target-label").textContent = `${newKwh} kWh / bimestre`;
    el("sim-ref-period").textContent = latestInv.periodo_label;
    el("sim-curr-bill").textContent = fmtMoney(currBill);
    el("sim-curr-kwh").textContent = `${currKwh} kWh (${latestInv.kwh_excedente} exc.)`;
    el("sim-new-bill").textContent = fmtMoney(newBill);
    el("sim-new-kwh").textContent = `${newKwh} kWh (${kE} exc.)`;
    el("sim-saving-bim").innerHTML = `${fmtMoney(savingBim)} <small>/bim</small>`;
    el("sim-saving-year").textContent = `${fmtMoney(savingYear)} / año`;
  }

  function populateYearFilter() {
    const select = el("filter-year");
    const years = Array.from(new Set(appData.full_timeline.map((i) => i.anio))).sort(
      (a, b) => b - a
    );
    select.innerHTML =
      `<option value="all">Todos los años</option>` +
      years.map((y) => `<option value="${y}">${y}</option>`).join("");
  }

  function renderTables() {
    const items = getActiveItems().slice().reverse();
    const payments = (appData.payments || []).slice().reverse();

    const yearVal = el("filter-year").value;
    const query = (el("filter-search").value || "").trim().toLowerCase();

    const filteredInvoices = items.filter((inv) => {
      if (yearVal !== "all" && String(inv.anio) !== yearVal) return false;
      if (!query) return true;
      return (
        inv.periodo_label.toLowerCase().includes(query) ||
        inv.key.toLowerCase().includes(query) ||
        inv.periodo_desde.toLowerCase().includes(query) ||
        inv.periodo_hasta.toLowerCase().includes(query) ||
        inv.estado_pago.toLowerCase().includes(query)
      );
    });

    const filteredPayments = payments.filter((p) => {
      if (yearVal !== "all" && String(p.anio) !== yearVal) return false;
      if (!query) return true;
      return (
        p.key.toLowerCase().includes(query) ||
        p.concepto.toLowerCase().includes(query) ||
        p.fecha_pago.toLowerCase().includes(query) ||
        p.ocr_aamm.toLowerCase().includes(query)
      );
    });

    el("count-invoices").textContent = filteredInvoices.length;
    el("count-payments").textContent = filteredPayments.length;

    const invTbody = document.querySelector("#invoices-table tbody");
    invTbody.innerHTML = filteredInvoices
      .map((inv) => {
        const lecturas =
          inv.lectura_actual > 0 ? `${inv.lectura_anterior} → ${inv.lectura_actual}` : "Historial";
        return `
        <tr class="clickable-row" data-key="${inv.key}" title="Clic para inspeccionar en Resumen">
          <td><strong>${inv.periodo_label}</strong></td>
          <td class="mono">${inv.key}</td>
          <td>${inv.periodo_desde} – ${inv.periodo_hasta}</td>
          <td>${inv.dias}</td>
          <td class="mono">${lecturas}</td>
          <td><strong>${inv.kwh_total} kWh</strong></td>
          <td>
            <div class="tier-pills">
              <span class="tp tp-b">${inv.kwh_basico}</span>
              <span class="tp tp-i">${inv.kwh_intermedio}</span>
              <span class="tp tp-e">${inv.kwh_excedente}</span>
            </div>
          </td>
          <td>${fmtDec(inv.consumo_diario, 2)}</td>
          <td>${fmtMoney(inv.subtotal_energia)}</td>
          <td>${fmtMoney(inv.iva + inv.dap)}</td>
          <td><strong>${fmtMoney(inv.total_factura)}</strong></td>
          <td>${fmtMoney(inv.costo_kwh_total)}</td>
          <td><span class="tag">${inv.estado_pago}</span></td>
        </tr>`;
      })
      .join("");

    invTbody.querySelectorAll(".clickable-row").forEach((row) => {
      row.addEventListener("click", () => {
        selectedPeriodKey = row.getAttribute("data-key");
        renderInspector();
        switchView("overview");
      });
    });

    const payTbody = document.querySelector("#payments-table tbody");
    payTbody.innerHTML = filteredPayments
      .map(
        (p) => `
      <tr>
        <td class="mono">${p.key}</td>
        <td class="mono">${p.ocr_aamm || "—"}</td>
        <td><span class="tag ${p.serie === "P9" ? "tag-amber" : "tag-down"}">${
          p.concepto
        }</span></td>
        <td>${p.fecha_pago}</td>
        <td><strong>${fmtMoney(p.monto)}</strong></td>
        <td class="mono">${p.dr_serie}-${p.dr_folio}</td>
        <td class="mono">${p.filename}</td>
      </tr>`
      )
      .join("");
  }

  function renderAll() {
    if (!appData) return;
    renderHeaderAndProfile();
    renderKPIs();
    renderInspector();
    renderMainChart();
    renderYearTable();
    updateSimulator();
    renderTables();
  }

  /* Subida de archivos XML */
  async function handleFilesUpload(fileList) {
    if (!fileList || !fileList.length) return;
    const filesPayload = [];

    for (const file of Array.from(fileList)) {
      if (!file.name.toLowerCase().endsWith(".xml")) continue;
      const content = await file.text();
      filesPayload.push({ name: file.name, content });
    }

    if (!filesPayload.length) {
      showToast("Selecciona archivos con extensión .xml");
      return;
    }

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: filesPayload }),
      });
      const result = await res.json();
      if (result.data) {
        appData = result.data;
        const items = getActiveItems();
        if (items.length) selectedPeriodKey = items[items.length - 1].key;
        populateYearFilter();
        renderAll();
      }
      const msg = [];
      if (result.added?.length) msg.push(`${result.added.length} agregados`);
      if (result.skipped?.length) msg.push(`${result.skipped.length} duplicados omitidos`);
      if (result.errors?.length) msg.push(`${result.errors.length} con error`);
      showToast(msg.join(" · ") || "Archivos procesados");
    } catch (err) {
      showToast(`Error: ${err.message}`);
    }
  }

  function showToast(message) {
    const t = el("toast");
    t.textContent = message;
    t.classList.remove("hidden");
    setTimeout(() => t.classList.add("hidden"), 5000);
  }

  /* Eventos de navegación y controles */
  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      switchView(btn.getAttribute("data-view"));
    });
  });

  document.querySelectorAll("#chart-type-switcher .seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeChartType = btn.getAttribute("data-chart");
      document
        .querySelectorAll("#chart-type-switcher .seg-btn")
        .forEach((b) => b.classList.toggle("active", b === btn));
      renderMainChart();
    });
  });

  el("btn-mode-direct").addEventListener("click", () => {
    viewMode = "direct";
    el("btn-mode-direct").classList.add("active");
    el("btn-mode-full").classList.remove("active");
    renderAll();
  });

  el("btn-mode-full").addEventListener("click", () => {
    viewMode = "full";
    el("btn-mode-full").classList.add("active");
    el("btn-mode-direct").classList.remove("active");
    renderAll();
  });

  el("btn-privacy").addEventListener("click", () => {
    privacyMasked = !privacyMasked;
    applyPrivacyState();
  });

  el("btn-open-upload").addEventListener("click", () => {
    el("xml-file-input").click();
  });

  el("xml-file-input").addEventListener("change", (e) => {
    handleFilesUpload(e.target.files);
    e.target.value = "";
  });

  el("sim-slider").addEventListener("input", updateSimulator);

  document.querySelectorAll(".chip-btn[data-target-pct]").forEach((btn) => {
    btn.addEventListener("click", () => {
      el("sim-slider").value = btn.getAttribute("data-target-pct");
      updateSimulator();
    });
  });

  el("btn-sim-no-dac").addEventListener("click", () => {
    if (!appData?.invoices?.length) return;
    const latestKwh = appData.invoices[appData.invoices.length - 1].kwh_total;
    const pct = Math.max(0, Math.min(60, Math.round(((latestKwh - 450) / latestKwh) * 100)));
    el("sim-slider").value = pct;
    updateSimulator();
  });

  el("btn-sim-no-exc").addEventListener("click", () => {
    if (!appData?.invoices?.length) return;
    const latestKwh = appData.invoices[appData.invoices.length - 1].kwh_total;
    const pct = Math.max(0, Math.min(60, Math.round(((latestKwh - 280) / latestKwh) * 100)));
    el("sim-slider").value = pct;
    updateSimulator();
  });

  el("tab-invoices").addEventListener("click", () => {
    el("tab-invoices").classList.add("active");
    el("tab-payments").classList.remove("active");
    el("view-invoices-table").classList.remove("hidden");
    el("view-payments-table").classList.add("hidden");
  });

  el("tab-payments").addEventListener("click", () => {
    el("tab-payments").classList.add("active");
    el("tab-invoices").classList.remove("active");
    el("view-payments-table").classList.remove("hidden");
    el("view-invoices-table").classList.add("hidden");
  });

  el("filter-year").addEventListener("change", renderTables);
  el("filter-search").addEventListener("input", renderTables);

  // Drag & Drop en la zona y ventana
  const dropzone = el("upload-dropzone");
  ["dragenter", "dragover"].forEach((evName) => {
    dropzone.addEventListener(evName, (e) => {
      e.preventDefault();
      dropzone.classList.add("dragover");
    });
  });
  ["dragleave", "drop"].forEach((evName) => {
    dropzone.addEventListener(evName, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dragover");
    });
  });
  dropzone.addEventListener("drop", (e) => {
    handleFilesUpload(e.dataTransfer.files);
  });

  window.addEventListener("resize", () => {
    if (appData && currentView === "overview") {
      renderMainChart();
    }
  });

  fetchDashboardData();
})();
