(() => {
  let appData = null;
  let viewMode = "direct"; // "direct" (2024-2026) | "full" (2022-2026)
  let privacyMasked = true; // Oculta datos de .env por defecto en pantalla

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
      populateYearFilter();
      renderAll();
    } catch (err) {
      console.error("Error cargando datos:", err);
      el("header-subtitle").textContent = "Error al cargar datos del servidor";
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

  function applyPrivacyState() {
    const nodes = document.querySelectorAll(".sensitive");
    nodes.forEach((n) => {
      if (privacyMasked) {
        n.classList.add("masked");
      } else {
        n.classList.remove("masked");
      }
    });
    el("privacy-label").textContent = privacyMasked
      ? "Mostrar datos (.env)"
      : "Ocultar datos (.env)";
  }

  function renderProfileAndHeader() {
    const { profile, files_stats } = appData;
    const sum = getActiveSummary();

    el("header-subtitle").textContent = `${sum.periodos_count || 0} bimestres analizados (${
      sum.primer_periodo || "—"
    } a ${sum.ultimo_periodo || "—"}) · ${files_stats.unique_invoices} facturas PE y ${
      files_stats.unique_payments
    } pagos PV/P9`;

    el("prof-titular").textContent = profile.titular;
    el("prof-rpu").textContent = profile.rpu;
    el("prof-medidor").textContent = profile.medidor;
    el("prof-tarifa").textContent = profile.tarifa;
    el("prof-direccion").textContent = `${profile.direccion}, ${profile.colonia}, ${profile.municipio}`;

    const dupCount = (files_stats.duplicate_files_ignored || []).length;
    el("prof-files").textContent =
      dupCount > 0
        ? `${files_stats.total_xml_files_found} XML (${dupCount} duplicados omitidos)`
        : `${files_stats.total_xml_files_found} archivos XML`;

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
    el("kpi-last-daily-cost").textContent = `${fmtMoney(latest.precio_diario)}/día`;

    const badge = el("kpi-last-badge");
    const dk = latest.delta_kwh_pct;
    badge.textContent = `${dk > 0 ? "+" : ""}${dk}% vs ant.`;
    badge.className = `badge ${dk > 0 ? "badge-up" : "badge-down"}`;

    el("kpi-avg-kwh").textContent = `${fmtDec(sum.avg_kwh_bim, 1)} kWh`;
    el("kpi-avg-daily-kwh").textContent = `${fmtDec(sum.avg_daily_kwh, 2)} kWh/día`;
    el("kpi-max-kwh").textContent = `${sum.max_consumo.kwh} kWh (${sum.max_consumo.periodo})`;
    el("kpi-min-kwh").textContent = `${sum.min_consumo.kwh} kWh (${sum.min_consumo.periodo})`;

    el("kpi-avg-cost").textContent = fmtMoney(sum.avg_total_bim);
    el("kpi-avg-daily-cost").textContent = `${fmtMoney(sum.avg_daily_cost)}/día`;
    el("kpi-total-cost").textContent = fmtMoney(sum.total_facturado);
    el("kpi-total-kwh").textContent = `${fmtInt(sum.total_kwh)} kWh`;

    el("kpi-cost-kwh").textContent = `${fmtMoney(sum.avg_cost_per_kwh)} / kWh`;
    el("kpi-total-subsidio").textContent = fmtMoney(sum.total_subsidio);

    // Impacto Excedente (siempre mostramos el % de costo real sobre las facturas directas o activas)
    const directSum = appData.summary_direct;
    el("kpi-exc-cost-pct").textContent = `${directSum.pct_costo_excedente}% del costo`;
    el("kpi-exc-kwh-pct").textContent = `${sum.pct_kwh_excedente}%`;
    el("kpi-exc-kwh-total").textContent = `${fmtInt(sum.kwh_excedente)} kWh`;
    el("kpi-exc-cost-total").textContent = fmtMoney(directSum.subtotal_excedente);

    // Monitor DAC
    el("kpi-dac-rolling").textContent = `${fmtInt(latest.rolling_annual_kwh)} / ${fmtInt(
      dacLimit
    )} kWh`;
    const pct = Math.min(100, Math.max(0, latest.dac_pct));
    el("dac-progress-bar").style.width = `${pct}%`;

    const dacBadge = el("dac-badge");
    if (latest.dac_pct >= 100) {
      dacBadge.textContent = "Riesgo Alto DAC";
      dacBadge.className = "badge badge-up";
    } else if (latest.dac_pct >= 90) {
      dacBadge.textContent = `${latest.dac_pct}% del límite`;
      dacBadge.className = "badge badge-warn";
    } else {
      dacBadge.textContent = `${latest.dac_pct}% (Seguro)`;
      dacBadge.className = "badge badge-down";
    }

    const margin = latest.dac_margin_kwh;
    el("kpi-dac-sub").textContent =
      margin >= 0
        ? `Margen disponible: ${fmtInt(margin)} kWh anuales (prom. ${(
            latest.rolling_annual_kwh / 6
          ).toFixed(0)} kWh/bim)`
        : `Excede el umbral por ${fmtInt(Math.abs(margin))} kWh en 12 meses`;
  }

  /* Sistema de Tooltip para Gráficas SVG */
  const tooltip = el("chart-tooltip");
  function showTooltip(evt, html) {
    tooltip.innerHTML = html;
    tooltip.classList.remove("hidden");
    const pad = 14;
    let x = evt.clientX + pad;
    let y = evt.clientY + pad;
    if (x + 260 > window.innerWidth) x = evt.clientX - 270;
    if (y + 140 > window.innerHeight) y = evt.clientY - 140;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }
  function hideTooltip() {
    tooltip.classList.add("hidden");
  }

  function renderKwhTiersChart() {
    const container = el("chart-kwh-tiers");
    const items = getActiveItems();
    if (!items.length) return;

    const width = container.clientWidth || 620;
    const height = container.clientHeight || 280;
    const pad = { top: 20, right: 20, bottom: 52, left: 48 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const maxKwh = Math.max(650, ...items.map((d) => d.kwh_total)) * 1.08;
    const stepX = plotW / items.length;
    const barW = Math.min(34, Math.max(10, stepX * 0.64));

    const yPos = (val) => pad.top + plotH - (val / maxKwh) * plotH;

    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

    // Líneas guía horizontales
    const ticks = [0, 150, 280, 450, 600];
    ticks.forEach((t) => {
      if (t > maxKwh) return;
      const y = yPos(t);
      svg += `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#1e293b" stroke-width="1"/>`;
      svg += `<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" fill="#94a3b8" font-size="11">${t}</text>`;
    });

    // Línea de referencia 500 kWh (Promedio DAC)
    const y500 = yPos(500);
    svg += `<line x1="${pad.left}" y1="${y500}" x2="${width - pad.right}" y2="${y500}" stroke="#f59e0b" stroke-dasharray="5,4" stroke-width="1.3"/>`;
    svg += `<text x="${width - pad.right - 4}" y="${y500 - 5}" text-anchor="end" fill="#fcd34d" font-size="10">Prom. DAC (500 kWh)</text>`;

    // Barras apiladas
    items.forEach((d, idx) => {
      const cx = pad.left + idx * stepX + stepX / 2;
      const x = cx - barW / 2;

      const hB = (d.kwh_basico / maxKwh) * plotH;
      const hI = (d.kwh_intermedio / maxKwh) * plotH;
      const hE = (d.kwh_excedente / maxKwh) * plotH;

      const yB = pad.top + plotH - hB;
      const yI = yB - hI;
      const yE = yI - hE;

      svg += `<g class="bar-group" data-idx="${idx}" style="cursor:pointer">`;
      svg += `<rect x="${x}" y="${yB}" width="${barW}" height="${Math.max(0, hB)}" fill="#10b981" rx="2"/>`;
      svg += `<rect x="${x}" y="${yI}" width="${barW}" height="${Math.max(0, hI)}" fill="#f59e0b" rx="2"/>`;
      svg += `<rect x="${x}" y="${yE}" width="${barW}" height="${Math.max(0, hE)}" fill="#ef4444" rx="2"/>`;
      svg += `</g>`;

      const showEvery = items.length > 18 ? 2 : 1;
      if (idx % showEvery === 0 || idx === items.length - 1) {
        svg += `<text x="${cx}" y="${height - pad.bottom + 16}" text-anchor="end" transform="rotate(-32 ${cx} ${
          height - pad.bottom + 16
        })" fill="#94a3b8" font-size="10.5">${d.periodo_label}</text>`;
      }
    });

    svg += `</svg>`;
    container.innerHTML = svg;

    container.querySelectorAll(".bar-group").forEach((node) => {
      const idx = Number(node.getAttribute("data-idx"));
      const d = items[idx];
      node.addEventListener("mousemove", (evt) => {
        showTooltip(
          evt,
          `<strong>${d.periodo_label}</strong> (${d.dias} días)<br/>
           Total: <strong>${d.kwh_total} kWh</strong> (${d.consumo_diario} kWh/día)<br/>
           <span style="color:#6ee7b7">● Básico:</span> ${d.kwh_basico} kWh<br/>
           <span style="color:#fcd34d">● Intermedio:</span> ${d.kwh_intermedio} kWh<br/>
           <span style="color:#fca5a5">● Excedente:</span> ${d.kwh_excedente} kWh<br/>
           Recibo: <strong>${fmtMoney(d.total_factura)}</strong>`
        );
      });
      node.addEventListener("mouseleave", hideTooltip);
    });
  }

  function renderCostBreakdownChart() {
    const container = el("chart-cost-breakdown");
    const items = getActiveItems();
    if (!items.length) return;

    const width = container.clientWidth || 620;
    const height = container.clientHeight || 280;
    const pad = { top: 20, right: 20, bottom: 52, left: 56 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const maxCost =
      Math.max(2000, ...items.map((d) => Math.max(d.total_factura, d.subsidio_gub))) * 1.1;
    const stepX = plotW / items.length;
    const barW = Math.min(34, Math.max(10, stepX * 0.64));
    const yPos = (val) => pad.top + plotH - (val / maxCost) * plotH;

    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

    const ticks = [0, 500, 1000, 1500, 2000];
    ticks.forEach((t) => {
      if (t > maxCost) return;
      const y = yPos(t);
      svg += `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#1e293b" stroke-width="1"/>`;
      svg += `<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" fill="#94a3b8" font-size="11">$${t}</text>`;
    });

    let subsidyPoints = [];

    items.forEach((d, idx) => {
      const cx = pad.left + idx * stepX + stepX / 2;
      const x = cx - barW / 2;

      const hE = (d.subtotal_energia / maxCost) * plotH;
      const hIva = (d.iva / maxCost) * plotH;
      const hDap = (d.dap / maxCost) * plotH;

      const yE = pad.top + plotH - hE;
      const yIva = yE - hIva;
      const yDap = yIva - hDap;

      svg += `<g class="cost-group" data-idx="${idx}" style="cursor:pointer">`;
      svg += `<rect x="${x}" y="${yE}" width="${barW}" height="${Math.max(0, hE)}" fill="#38bdf8" rx="2"/>`;
      svg += `<rect x="${x}" y="${yIva}" width="${barW}" height="${Math.max(0, hIva)}" fill="#a855f7" rx="2"/>`;
      svg += `<rect x="${x}" y="${yDap}" width="${barW}" height="${Math.max(0, hDap)}" fill="#f97316" rx="2"/>`;
      svg += `</g>`;

      if (d.subsidio_gub > 0) {
        subsidyPoints.push({ x: cx, y: yPos(d.subsidio_gub), val: d.subsidio_gub });
      }

      const showEvery = items.length > 18 ? 2 : 1;
      if (idx % showEvery === 0 || idx === items.length - 1) {
        svg += `<text x="${cx}" y="${height - pad.bottom + 16}" text-anchor="end" transform="rotate(-32 ${cx} ${
          height - pad.bottom + 16
        })" fill="#94a3b8" font-size="10.5">${d.periodo_label}</text>`;
      }
    });

    if (subsidyPoints.length > 1) {
      const pathD = subsidyPoints
        .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
        .join(" ");
      svg += `<path d="${pathD}" fill="none" stroke="#10b981" stroke-width="2.2"/>`;
      subsidyPoints.forEach((pt) => {
        svg += `<circle cx="${pt.x}" cy="${pt.y}" r="3.5" fill="#10b981" stroke="#0b0f17" stroke-width="1.5"/>`;
      });
    }

    svg += `</svg>`;
    container.innerHTML = svg;

    container.querySelectorAll(".cost-group").forEach((node) => {
      const idx = Number(node.getAttribute("data-idx"));
      const d = items[idx];
      node.addEventListener("mousemove", (evt) => {
        showTooltip(
          evt,
          `<strong>${d.periodo_label}</strong><br/>
           Total Facturado: <strong>${fmtMoney(d.total_factura)}</strong><br/>
           <span style="color:#38bdf8">● Energía:</span> ${fmtMoney(d.subtotal_energia)}<br/>
           <span style="color:#a855f7">● IVA 16%:</span> ${fmtMoney(d.iva)}<br/>
           <span style="color:#f97316">● DAP:</span> ${fmtMoney(d.dap)}<br/>
           <span style="color:#10b981">● Subsidio CFE:</span> ${fmtMoney(d.subsidio_gub)}<br/>
           Costo Efectivo: <strong>${fmtMoney(d.costo_kwh_total)}/kWh</strong>`
        );
      });
      node.addEventListener("mouseleave", hideTooltip);
    });
  }

  function renderDacRollingChart() {
    const container = el("chart-dac-rolling");
    const items = getActiveItems();
    if (!items.length) return;

    const dacLimit = appData.profile.dac_limite_anual_kwh || 3000;
    const width = container.clientWidth || 620;
    const height = container.clientHeight || 280;
    const pad = { top: 22, right: 24, bottom: 52, left: 54 };
    const plotW = width - pad.left - pad.right;
    const plotH = height - pad.top - pad.bottom;

    const maxVal = Math.max(dacLimit * 1.12, ...items.map((d) => d.rolling_annual_kwh)) * 1.05;
    const stepX = items.length > 1 ? plotW / (items.length - 1) : plotW;
    const yPos = (val) => pad.top + plotH - (val / maxVal) * plotH;

    let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`;

    [0, 1000, 2000, 2500, 3000, 3500].forEach((t) => {
      if (t > maxVal) return;
      const y = yPos(t);
      svg += `<line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}" stroke="#1e293b" stroke-width="1"/>`;
      svg += `<text x="${pad.left - 8}" y="${y + 4}" text-anchor="end" fill="#94a3b8" font-size="11">${t}</text>`;
    });

    const yDac = yPos(dacLimit);
    svg += `<line x1="${pad.left}" y1="${yDac}" x2="${width - pad.right}" y2="${yDac}" stroke="#ef4444" stroke-dasharray="6,4" stroke-width="1.6"/>`;
    svg += `<text x="${pad.left + 8}" y="${yDac - 6}" fill="#fca5a5" font-size="11" font-weight="600">Límite Anual DAC (${fmtInt(
      dacLimit
    )} kWh)</text>`;

    const pts = items.map((d, idx) => ({
      x: pad.left + idx * stepX,
      y: yPos(d.rolling_annual_kwh),
      d,
    }));

    if (pts.length > 1) {
      const areaD =
        `M ${pts[0].x} ${pad.top + plotH} ` +
        pts.map((p) => `L ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") +
        ` L ${pts[pts.length - 1].x} ${pad.top + plotH} Z`;
      svg += `<path d="${areaD}" fill="rgba(56, 189, 248, 0.14)"/>`;

      const lineD = pts
        .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
        .join(" ");
      svg += `<path d="${lineD}" fill="none" stroke="#38bdf8" stroke-width="2.5"/>`;
    }

    pts.forEach((p, idx) => {
      const color =
        p.d.rolling_annual_kwh >= dacLimit
          ? "#ef4444"
          : p.d.rolling_annual_kwh >= dacLimit * 0.9
          ? "#f59e0b"
          : "#38bdf8";
      svg += `<circle class="dac-pt" data-idx="${idx}" cx="${p.x}" cy="${p.y}" r="4.5" fill="${color}" stroke="#0b0f17" stroke-width="1.5" style="cursor:pointer"/>`;

      const showEvery = items.length > 18 ? 2 : 1;
      if (idx % showEvery === 0 || idx === items.length - 1) {
        svg += `<text x="${p.x}" y="${height - pad.bottom + 16}" text-anchor="end" transform="rotate(-32 ${p.x} ${
          height - pad.bottom + 16
        })" fill="#94a3b8" font-size="10.5">${p.d.periodo_label}</text>`;
      }
    });

    svg += `</svg>`;
    container.innerHTML = svg;

    container.querySelectorAll(".dac-pt").forEach((node) => {
      const idx = Number(node.getAttribute("data-idx"));
      const d = items[idx];
      node.addEventListener("mousemove", (evt) => {
        showTooltip(
          evt,
          `<strong>${d.periodo_label}</strong><br/>
           Acumulado (${d.rolling_periods_count} bim.): <strong>${fmtInt(
             d.rolling_annual_kwh
           )} kWh</strong><br/>
           Porcentaje Límite DAC: <strong>${d.dac_pct}%</strong><br/>
           Margen hacia ${fmtInt(dacLimit)} kWh: <strong>${fmtInt(
             dacLimit - d.rolling_annual_kwh
           )} kWh</strong>`
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
        <td>${fmtMoney(y.costo_kwh)}/kWh</td>
        <td class="text-emerald">${y.subsidio_gub > 0 ? fmtMoney(y.subsidio_gub) : "—"}</td>
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
    el("sim-kwh-target-label").textContent = `${newKwh} kWh/bim`;
    el("sim-ref-period").textContent = latestInv.periodo_label;
    el("sim-curr-bill").textContent = fmtMoney(currBill);
    el("sim-curr-kwh").textContent = `${currKwh} kWh (${latestInv.kwh_excedente} kWh excedentes)`;
    el("sim-new-bill").textContent = fmtMoney(newBill);
    el("sim-new-kwh").textContent = `${newKwh} kWh (${kE} kWh excedentes)`;
    el("sim-saving-bim").textContent = `${fmtMoney(savingBim)} / bim`;
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
    const items = getActiveItems().slice().reverse(); // Más recientes primero
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
        <tr>
          <td><strong>${inv.periodo_label}</strong></td>
          <td><code>${inv.key}</code></td>
          <td>${inv.periodo_desde} – ${inv.periodo_hasta}</td>
          <td>${inv.dias}</td>
          <td>${lecturas}</td>
          <td><strong>${inv.kwh_total} kWh</strong></td>
          <td>
            <div class="tier-pill-group">
              <span class="tier-pill tp-b" title="Básico">${inv.kwh_basico}</span>
              <span class="tier-pill tp-i" title="Intermedio">${inv.kwh_intermedio}</span>
              <span class="tier-pill tp-e" title="Excedente">${inv.kwh_excedente}</span>
            </div>
          </td>
          <td>${fmtDec(inv.consumo_diario, 2)}</td>
          <td>${fmtMoney(inv.subtotal_energia)}</td>
          <td>${fmtMoney(inv.iva + inv.dap)}</td>
          <td><strong>${fmtMoney(inv.total_factura)}</strong></td>
          <td>${fmtMoney(inv.costo_kwh_total)}</td>
          <td class="text-emerald">${inv.subsidio_gub > 0 ? fmtMoney(inv.subsidio_gub) : "—"}</td>
          <td><span class="badge">${inv.estado_pago}</span></td>
        </tr>`;
      })
      .join("");

    const payTbody = document.querySelector("#payments-table tbody");
    payTbody.innerHTML = filteredPayments
      .map(
        (p) => `
      <tr>
        <td><code>${p.key}</code></td>
        <td>${p.ocr_aamm || "—"}</td>
        <td><span class="badge ${p.serie === "P9" ? "badge-warn" : "badge-down"}">${
          p.concepto
        }</span></td>
        <td>${p.fecha_pago}</td>
        <td><strong>${fmtMoney(p.monto)}</strong></td>
        <td><code>${p.dr_serie}-${p.dr_folio}</code></td>
        <td>${p.filename}</td>
      </tr>`
      )
      .join("");
  }

  function renderAll() {
    if (!appData) return;
    renderProfileAndHeader();
    renderKPIs();
    renderKwhTiersChart();
    renderCostBreakdownChart();
    renderDacRollingChart();
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
      showToast("⚠️ Selecciona archivos con extensión .xml", true);
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
        populateYearFilter();
        renderAll();
      }
      const msgParts = [];
      if (result.added?.length) msgParts.push(`✅ ${result.added.length} agregados`);
      if (result.skipped?.length)
        msgParts.push(`ℹ️ ${result.skipped.length} omitidos por duplicado`);
      if (result.errors?.length) msgParts.push(`⚠️ ${result.errors.length} con error`);
      showToast(msgParts.join(" · ") || "Archivos procesados");
    } catch (err) {
      showToast(`Error al subir archivos: ${err.message}`, true);
    }
  }

  function showToast(message, isError = false) {
    const t = el("toast");
    t.textContent = message;
    t.style.borderLeftColor = isError ? "#ef4444" : "#10b981";
    t.classList.remove("hidden");
    setTimeout(() => t.classList.add("hidden"), 6000);
  }

  /* Eventos UI */
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

  el("sim-slider").addEventListener("input", updateSimulator);

  document.querySelectorAll(".chip[data-target-pct]").forEach((btn) => {
    btn.addEventListener("click", () => {
      el("sim-slider").value = btn.getAttribute("data-target-pct");
      updateSimulator();
    });
  });

  el("btn-sim-no-dac").addEventListener("click", () => {
    if (!appData?.invoices?.length) return;
    const latestKwh = appData.invoices[appData.invoices.length - 1].kwh_total;
    const pct = Math.max(5, Math.min(55, Math.round(((latestKwh - 450) / latestKwh) * 100)));
    el("sim-slider").value = pct;
    updateSimulator();
  });

  el("btn-sim-no-exc").addEventListener("click", () => {
    if (!appData?.invoices?.length) return;
    const latestKwh = appData.invoices[appData.invoices.length - 1].kwh_total;
    const pct = Math.max(5, Math.min(55, Math.round(((latestKwh - 280) / latestKwh) * 100)));
    el("sim-slider").value = pct;
    updateSimulator();
  });

  el("tab-invoices").addEventListener("click", () => {
    el("tab-invoices").classList.add("active");
    el("tab-payments").classList.remove("active");
    el("view-invoices").classList.remove("hidden");
    el("view-payments").classList.add("hidden");
  });

  el("tab-payments").addEventListener("click", () => {
    el("tab-payments").classList.add("active");
    el("tab-invoices").classList.remove("active");
    el("view-payments").classList.remove("hidden");
    el("view-invoices").classList.add("hidden");
  });

  el("filter-year").addEventListener("change", renderTables);
  el("filter-search").addEventListener("input", renderTables);

  el("xml-file-input").addEventListener("change", (e) => {
    handleFilesUpload(e.target.files);
    e.target.value = "";
  });

  // Drag & Drop en tarjeta y ventana
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
    if (appData) {
      renderKwhTiersChart();
      renderCostBreakdownChart();
      renderDacRollingChart();
    }
  });

  fetchDashboardData();
})();
