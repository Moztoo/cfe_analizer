import os
import re
import glob
import xml.etree.ElementTree as ET
from datetime import datetime
from typing import Dict, List, Any, Tuple, Optional

SPANISH_MONTHS = {
    "ENE": 1, "FEB": 2, "MAR": 3, "ABR": 4,
    "MAY": 5, "JUN": 6, "JUL": 7, "AGO": 8,
    "SEP": 9, "OCT": 10, "NOV": 11, "DIC": 12,
}

MONTH_NAMES_ES = {
    1: "Ene", 2: "Feb", 3: "Mar", 4: "Abr",
    5: "May", 6: "Jun", 7: "Jul", 8: "Ago",
    9: "Sep", 10: "Oct", 11: "Nov", 12: "Dic",
}


def load_env(env_path: str = ".env") -> Dict[str, str]:
    """Carga variables desde el archivo .env sin dependencias externas."""
    env_vars: Dict[str, str] = {}
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for raw_line in f:
                line = raw_line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, val = line.split("=", 1)
                key = key.strip()
                val = val.strip().strip('"').strip("'")
                env_vars[key] = val
    for k, v in os.environ.items():
        if k.startswith("CFE_") or k in ("INPUT_DIR", "PORT", "DAC_LIMITE_ANUAL_KWH"):
            env_vars.setdefault(k, v)
    return env_vars


def get_profile_from_env(env_vars: Dict[str, str]) -> Dict[str, Any]:
    """Devuelve únicamente los datos configurados en .env (nunca del código ni crudos del XML)."""
    return {
        "titular": env_vars.get("CFE_TITULAR", "No configurado (.env)"),
        "rpu": env_vars.get("CFE_RPU", "No configurado"),
        "rfc": env_vars.get("CFE_RFC", "No configurado"),
        "rmu": env_vars.get("CFE_RMU", "No configurado"),
        "medidor": env_vars.get("CFE_MEDIDOR", "No configurado"),
        "direccion": env_vars.get("CFE_DIRECCION", "No configurado"),
        "colonia": env_vars.get("CFE_COLONIA", "No configurado"),
        "cp": env_vars.get("CFE_CP", "No configurado"),
        "municipio": env_vars.get("CFE_MUNICIPIO", "No configurado"),
        "tarifa": env_vars.get("CFE_TARIFA", "01"),
        "dac_limite_anual_kwh": float(env_vars.get("DAC_LIMITE_ANUAL_KWH", "3000") or 3000),
    }


def _safe_float(val: Optional[str], default: float = 0.0) -> float:
    if val is None:
        return default
    cleaned = val.strip().replace(",", "")
    if not cleaned:
        return default
    try:
        return float(cleaned)
    except ValueError:
        return default


def _safe_int(val: Optional[str], default: int = 0) -> int:
    return int(round(_safe_float(val, float(default))))


def parse_cfe_short_date(date_str: Optional[str]) -> Optional[datetime]:
    """Convierte fechas formato CFE '15 NOV 23' a datetime."""
    if not date_str:
        return None
    parts = date_str.strip().upper().split()
    if len(parts) != 3:
        return None
    try:
        day = int(parts[0])
        month = SPANISH_MONTHS.get(parts[1], 1)
        year = int(parts[2])
        if year < 100:
            year += 2000
        return datetime(year, month, day)
    except ValueError:
        return None


def parse_historical_range(range_str: str) -> Optional[Tuple[datetime, datetime, str, str]]:
    """Parsea cadenas tipo 'del 15 SEP 23 al 15 NOV 23'."""
    if not range_str:
        return None
    m = re.match(
        r"del\s+(\d{1,2}\s+[A-Z]{3}\s+\d{2})\s+al\s+(\d{1,2}\s+[A-Z]{3}\s+\d{2})",
        range_str.strip(),
        re.IGNORECASE,
    )
    if not m:
        return None
    d1_str, d2_str = m.group(1).upper(), m.group(2).upper()
    dt1 = parse_cfe_short_date(d1_str)
    dt2 = parse_cfe_short_date(d2_str)
    if not dt1 or not dt2:
        return None
    return dt1, dt2, d1_str, d2_str


def format_period_label(year: int, month: int) -> str:
    return f"{MONTH_NAMES_ES.get(month, f'{month:02d}')} {year}"


def parse_xml_file(filepath: str) -> Optional[Dict[str, Any]]:
    """
    Parsea un archivo XML de CFE (Ingreso Serie PE o Pago Series PV/P9).
    Omite extraer datos personales del XML para proteger la privacidad.
    """
    try:
        tree = ET.parse(filepath)
        root = tree.getroot()
    except Exception:
        return None

    serie = root.attrib.get("Serie", "").strip()
    folio = root.attrib.get("Folio", "").strip()
    tipo_comprobante = root.attrib.get("TipoDeComprobante", "").strip()
    fecha_cfdi = root.attrib.get("Fecha", "").strip()

    ns = {
        "cfdi": "http://www.sat.gob.mx/cfd/4",
        "pago20": "http://www.sat.gob.mx/Pagos20",
        "cfe": "http://www.itcomplements.com/cfd/cfe/v1",
        "tfd": "http://www.sat.gob.mx/TimbreFiscalDigital",
    }

    if tipo_comprobante == "P":
        pago_el = root.find(".//pago20:Pago", ns)
        dr_el = root.find(".//pago20:DoctoRelacionado", ns)
        cfe_el = root.find(".//cfe:CFE", ns)

        monto = _safe_float(pago_el.attrib.get("Monto") if pago_el is not None else "0")
        fecha_pago = (pago_el.attrib.get("FechaPago", "") if pago_el is not None else fecha_cfdi)[:19]
        ocr_anio = _safe_int(cfe_el.attrib.get("OCRAno") if cfe_el is not None else "0")
        ocr_mes = _safe_int(cfe_el.attrib.get("OCRMes") if cfe_el is not None else "0")
        tipo_pago_cfe = (cfe_el.attrib.get("TipoPago", "") if cfe_el is not None else "").strip()
        concepto_pago = "DAP" if (serie == "P9" or tipo_pago_cfe == "DAP") else "Energía + IVA"

        return {
            "kind": "payment",
            "filename": os.path.basename(filepath),
            "serie": serie,
            "folio": folio,
            "key": f"{serie}-{folio}",
            "fecha_emision": fecha_cfdi[:10],
            "fecha_pago": fecha_pago[:10],
            "fecha_pago_iso": fecha_pago,
            "monto": round(monto, 2),
            "ocr_aamm": f"{ocr_anio:04d}{ocr_mes:02d}" if ocr_anio and ocr_mes else "",
            "anio": ocr_anio,
            "mes": ocr_mes,
            "concepto": concepto_pago,
            "dr_serie": dr_el.attrib.get("Serie", "") if dr_el is not None else "",
            "dr_folio": dr_el.attrib.get("Folio", "") if dr_el is not None else "",
        }

    if tipo_comprobante == "I":
        reg = root.find(".//clsRegArchFact")
        if reg is None:
            return None

        def get_text(tag_path: str, default: str = "") -> str:
            el = reg.find(tag_path)
            if el is not None and el.text is not None:
                return el.text.strip()
            return default

        anio = _safe_int(get_text("OCR_AAAA", fecha_cfdi[:4]))
        mes = _safe_int(get_text("OCR_MM", fecha_cfdi[5:7]))
        ocr_aamm = get_text("OCR_AAMM", f"{anio:04d}{mes:02d}")

        kwh_total = _safe_int(get_text("CONSUMO_R", get_text("TotalMed1", "0")))
        dias = _safe_int(get_text("Dias", "60"), 60)
        subtotal_energia = _safe_float(get_text("SubTotal", "0"))
        iva = _safe_float(get_text("IMPIVA", "0"))
        dap = _safe_float(get_text("IMPDAP", "0"))
        total_cfdi = _safe_float(root.attrib.get("Total", "0"))
        total_recibo = _safe_float(get_text("IMPTOTAL", str(total_cfdi)))
        subsidio_gub = _safe_float(get_text("CostoDeProd", get_text("IMPENER_REAL", "0")))

        # Escalones tarifarios
        kwh_b_raw = _safe_float(get_text(".//DetallekWh11", get_text("KWH_ESCALON1_1", "0")))
        kwh_i_raw = _safe_float(get_text(".//DetallekWh12", get_text("KWH_ESCALON1_2", "0")))
        kwh_e_raw = _safe_float(get_text(".//DetallekWh13", get_text("KWH_ESCALON1_3", "0")))
        kwh_sum_raw = kwh_b_raw + kwh_i_raw + kwh_e_raw

        precio_b = _safe_float(get_text(".//DetallePrecio11", get_text("PRECIO_ESCALON1_1", "0")))
        precio_i = _safe_float(get_text(".//DetallePrecio12", get_text("PRECIO_ESCALON1_2", "0")))
        precio_e = _safe_float(get_text(".//DetallePrecio13", get_text("PRECIO_ESCALON1_3", "0")))

        sub_b_raw = _safe_float(get_text(".//DetalleSubTotal11", "0"))
        sub_i_raw = _safe_float(get_text(".//DetalleSubTotal12", "0"))
        sub_e_raw = _safe_float(get_text(".//DetalleSubTotal13", "0"))

        # Cuando CFE divide en subperiodos (ej. cambio estacional) y solo llena Subperiodo1
        if kwh_total > 0 and abs(kwh_sum_raw - kwh_total) > 1.0:
            kwh_basico = min(150.0, float(kwh_total))
            kwh_intermedio = min(130.0, max(0.0, float(kwh_total) - 150.0))
            kwh_excedente = max(0.0, float(kwh_total) - 280.0)
            est_b = kwh_basico * precio_b
            est_i = kwh_intermedio * precio_i
            est_e = max(0.0, subtotal_energia - est_b - est_i)
            sub_basico, sub_intermedio, sub_excedente = round(est_b, 2), round(est_i, 2), round(est_e, 2)
        else:
            kwh_basico = round(kwh_b_raw, 2)
            kwh_intermedio = round(kwh_i_raw, 2)
            kwh_excedente = round(kwh_e_raw, 2)
            sub_basico = round(sub_b_raw, 2)
            sub_intermedio = round(sub_i_raw, 2)
            sub_excedente = round(sub_e_raw, 2)

        fec_desde = get_text("FECDESDE")
        fec_hasta = get_text("FECHASTA")
        fec_limite = get_text("FECLIMITE")
        fec_corte = get_text("FECORTE")
        fec_pago_ant = get_text("FECPAGO")
        pago_ant = abs(_safe_float(get_text("PAGOANT", "0")))
        sdo_ant = _safe_float(get_text("SDOANT", "0"))

        lec_ant = _safe_int(get_text("LECANT1", "0"))
        lec_act = _safe_int(get_text("LECACT1", "0"))

        consumo_diario = round(kwh_total / dias, 2) if dias > 0 else _safe_float(get_text("ConsumoDiario", "0"))
        precio_diario = round(total_cfdi / dias, 2) if dias > 0 else _safe_float(get_text("PrecioDiario", "0"))
        costo_kwh_energia = round(subtotal_energia / kwh_total, 3) if kwh_total > 0 else 0.0
        costo_kwh_total = round(total_cfdi / kwh_total, 3) if kwh_total > 0 else 0.0

        # Extraer historial embebido (FacturaAnt1..11)
        embedded_history = []
        for idx in range(1, 12):
            rango_txt = get_text(f".//FacturaAnt{idx}")
            kwh_hist = _safe_int(get_text(f".//Impo_kWh{idx}", "0"))
            imp_fact = _safe_float(get_text(f".//Impo_Fact{idx}", "0"))
            imp_paga = _safe_float(get_text(f".//Impo_Paga{idx}", "0"))
            parsed_range = parse_historical_range(rango_txt)
            if parsed_range and kwh_hist > 0:
                dt_start, dt_end, d_start_s, d_end_s = parsed_range
                dias_hist = max(1, (dt_end - dt_start).days)
                embedded_history.append({
                    "ocr_aamm": f"{dt_end.year:04d}{dt_end.month:02d}",
                    "anio": dt_end.year,
                    "mes": dt_end.month,
                    "periodo_label": format_period_label(dt_end.year, dt_end.month),
                    "fecha_emision": dt_end.strftime("%Y-%m-%d"),
                    "periodo_desde": d_start_s,
                    "periodo_hasta": d_end_s,
                    "dias": dias_hist,
                    "kwh_total": kwh_hist,
                    "kwh_basico": min(150, kwh_hist),
                    "kwh_intermedio": min(130, max(0, kwh_hist - 150)),
                    "kwh_excedente": max(0, kwh_hist - 280),
                    "total_factura": imp_fact,
                    "total_a_pagar": imp_fact,
                    "monto_pagado": imp_paga,
                    "consumo_diario": round(kwh_hist / dias_hist, 2),
                    "precio_diario": round(imp_fact / dias_hist, 2),
                    "costo_kwh_total": round(imp_fact / kwh_hist, 3) if kwh_hist > 0 else 0.0,
                })

        return {
            "kind": "invoice",
            "is_historical_only": False,
            "filename": os.path.basename(filepath),
            "serie": serie,
            "folio": folio,
            "key": f"{serie}-{folio}",
            "ocr_aamm": ocr_aamm,
            "anio": anio,
            "mes": mes,
            "periodo_label": format_period_label(anio, mes),
            "fecha_emision": fecha_cfdi[:10],
            "periodo_desde": fec_desde,
            "periodo_hasta": fec_hasta,
            "fecha_limite": fec_limite,
            "fecha_corte": fec_corte,
            "dias": dias,
            "lectura_anterior": lec_ant,
            "lectura_actual": lec_act,
            "kwh_total": kwh_total,
            "kwh_basico": kwh_basico,
            "kwh_intermedio": kwh_intermedio,
            "kwh_excedente": kwh_excedente,
            "precio_basico": precio_b,
            "precio_intermedio": precio_i,
            "precio_excedente": precio_e,
            "subtotal_basico": sub_basico,
            "subtotal_intermedio": sub_intermedio,
            "subtotal_excedente": sub_excedente,
            "subtotal_energia": round(subtotal_energia, 2),
            "iva": round(iva, 2),
            "dap": round(dap, 2),
            "total_factura": round(total_cfdi, 2),
            "total_a_pagar": round(total_recibo, 2),
            "subsidio_gub": round(subsidio_gub, 2),
            "costo_real_estimado": round(subtotal_energia + subsidio_gub, 2),
            "consumo_diario": consumo_diario,
            "precio_diario": precio_diario,
            "costo_kwh_energia": costo_kwh_energia,
            "costo_kwh_total": costo_kwh_total,
            "tipo_consumo": get_text("TipoDeConsumo", "NORMAL"),
            "tarifa": get_text("TARIFA", "01"),
            "tarifa_reg": get_text("TARIFA_REG", "DB2"),
            "pago_anterior_reportado": pago_ant,
            "fecha_pago_anterior": fec_pago_ant,
            "saldo_anterior": sdo_ant,
            "embedded_history": embedded_history,
        }

    return None


def load_all_cfe_data(input_dir: str = "input", env_path: str = ".env") -> Dict[str, Any]:
    """
    Lee todos los XML del directorio de entrada, deduplica por Serie-Folio,
    vincula complementos de pago y calcula todas las métricas del dashboard.
    """
    env_vars = load_env(env_path)
    profile = get_profile_from_env(env_vars)

    xml_files = sorted(
        glob.glob(os.path.join(input_dir, "*.xml"))
        + glob.glob(os.path.join(input_dir, "*.XML"))
    )

    invoices_by_key: Dict[str, Dict[str, Any]] = {}
    payments_by_key: Dict[str, Dict[str, Any]] = {}
    duplicate_files: List[str] = []
    invalid_files: List[str] = []

    for fpath in xml_files:
        # Preferir archivos sin '(1)' si se procesan después o ignorar duplicados por clave
        parsed = parse_xml_file(fpath)
        if not parsed:
            invalid_files.append(os.path.basename(fpath))
            continue

        key = parsed["key"]
        if parsed["kind"] == "invoice":
            if key in invoices_by_key:
                # Si el existente tenía '(1)' en el nombre y este no, conservar el nombre limpio
                if "(" in invoices_by_key[key]["filename"] and "(" not in parsed["filename"]:
                    duplicate_files.append(invoices_by_key[key]["filename"])
                    invoices_by_key[key] = parsed
                else:
                    duplicate_files.append(parsed["filename"])
            else:
                invoices_by_key[key] = parsed
        elif parsed["kind"] == "payment":
            if key in payments_by_key:
                duplicate_files.append(parsed["filename"])
            else:
                payments_by_key[key] = parsed

    invoices = sorted(invoices_by_key.values(), key=lambda x: x["ocr_aamm"])
    payments = sorted(payments_by_key.values(), key=lambda x: (x["fecha_pago"], x["key"]))

    # Indexar pagos por OCR_AAMM
    payments_by_aamm: Dict[str, List[Dict[str, Any]]] = {}
    for p in payments:
        aamm = p.get("ocr_aamm", "")
        if aamm:
            payments_by_aamm.setdefault(aamm, []).append(p)

    # Construir mapa de historial embebido (para periodos sin XML directo, ej. 2022-2023)
    direct_aamms = {inv["ocr_aamm"] for inv in invoices}
    historical_by_aamm: Dict[str, Dict[str, Any]] = {}

    for inv in invoices:
        for h in inv.get("embedded_history", []):
            aamm = h["ocr_aamm"]
            if aamm not in direct_aamms and aamm not in historical_by_aamm:
                # Estimar desglose financiero aproximado a partir del total histórico
                # En las facturas CFE: Total ≈ Energia * 1.16 + DAP (donde DAP ≈ 8% de Energía -> Total ≈ 1.24 * Energía)
                est_energia = round(h["total_factura"] / 1.24, 2)
                est_iva = round(est_energia * 0.16, 2)
                est_dap = round(max(0.0, h["total_factura"] - est_energia - est_iva), 2)
                historical_by_aamm[aamm] = {
                    "kind": "invoice",
                    "is_historical_only": True,
                    "filename": f"Historial en {inv['filename']}",
                    "serie": "HIST",
                    "folio": aamm,
                    "key": f"HIST-{aamm}",
                    "ocr_aamm": aamm,
                    "anio": h["anio"],
                    "mes": h["mes"],
                    "periodo_label": h["periodo_label"],
                    "fecha_emision": h["fecha_emision"],
                    "periodo_desde": h["periodo_desde"],
                    "periodo_hasta": h["periodo_hasta"],
                    "fecha_limite": "-",
                    "fecha_corte": "-",
                    "dias": h["dias"],
                    "lectura_anterior": 0,
                    "lectura_actual": 0,
                    "kwh_total": h["kwh_total"],
                    "kwh_basico": h["kwh_basico"],
                    "kwh_intermedio": h["kwh_intermedio"],
                    "kwh_excedente": h["kwh_excedente"],
                    "precio_basico": 0.0,
                    "precio_intermedio": 0.0,
                    "precio_excedente": 0.0,
                    "subtotal_basico": 0.0,
                    "subtotal_intermedio": 0.0,
                    "subtotal_excedente": 0.0,
                    "subtotal_energia": est_energia,
                    "iva": est_iva,
                    "dap": est_dap,
                    "total_factura": h["total_factura"],
                    "total_a_pagar": h["total_a_pagar"],
                    "subsidio_gub": 0.0,
                    "costo_real_estimado": est_energia,
                    "consumo_diario": h["consumo_diario"],
                    "precio_diario": h["precio_diario"],
                    "costo_kwh_energia": round(est_energia / h["kwh_total"], 3) if h["kwh_total"] else 0.0,
                    "costo_kwh_total": h["costo_kwh_total"],
                    "tipo_consumo": "EXCEDENTE" if h["kwh_total"] > 280 else "BASICO/INT",
                    "tarifa": "01",
                    "tarifa_reg": "DB2",
                    "pagos_vinculados": [],
                    "monto_pagado_xml": h["monto_pagado"],
                    "estado_pago": "Pagado (Historial)",
                    "fecha_pago": "-",
                }

    # Vincular pagos y estado de pago a cada factura directa
    for i, inv in enumerate(invoices):
        inv.pop("embedded_history", None)
        aamm = inv["ocr_aamm"]
        linked = payments_by_aamm.get(aamm, [])
        inv["pagos_vinculados"] = linked
        monto_xml = round(sum(p["monto"] for p in linked), 2)

        # Verificar si la siguiente factura registró el pago de esta factura en PAGOANT
        paid_in_next = False
        next_pay_date = ""
        if i + 1 < len(invoices):
            nxt = invoices[i + 1]
            if nxt.get("pago_anterior_reportado", 0) > 0:
                paid_in_next = True
                next_pay_date = nxt.get("fecha_pago_anterior", "")

        if linked:
            inv["monto_pagado_xml"] = monto_xml
            inv["estado_pago"] = "Complemento XML (PV/P9)"
            inv["fecha_pago"] = linked[0]["fecha_pago"]
        elif paid_in_next:
            inv["monto_pagado_xml"] = inv["total_a_pagar"]
            inv["estado_pago"] = "Pagado (Acreditado en sig. recibo)"
            inv["fecha_pago"] = next_pay_date
        else:
            inv["monto_pagado_xml"] = 0.0
            inv["estado_pago"] = "Recibo emitido"
            inv["fecha_pago"] = "-"

    # Combinar línea de tiempo completa (2022-2026) para cálculo de media móvil DAC (6 bimestres = 1 año)
    full_timeline = sorted(
        list(historical_by_aamm.values()) + invoices,
        key=lambda x: x["ocr_aamm"],
    )

    dac_limit = profile["dac_limite_anual_kwh"]
    for idx, item in enumerate(full_timeline):
        window = full_timeline[max(0, idx - 5): idx + 1]
        rolling_6bim_kwh = sum(w["kwh_total"] for w in window)
        item["rolling_annual_kwh"] = rolling_6bim_kwh
        item["rolling_periods_count"] = len(window)
        item["dac_pct"] = round((rolling_6bim_kwh / dac_limit) * 100, 1) if dac_limit > 0 else 0.0

    summary_direct = compute_summary(invoices, dac_limit)
    summary_full = compute_summary(full_timeline, dac_limit)

    return {
        "profile": profile,
        "files_stats": {
            "total_xml_files_found": len(xml_files),
            "unique_invoices": len(invoices),
            "unique_payments": len(payments),
            "embedded_historical_periods": len(historical_by_aamm),
            "total_timeline_periods": len(full_timeline),
            "duplicate_files_ignored": duplicate_files,
            "invalid_files": invalid_files,
        },
        "summary_direct": summary_direct,
        "summary_full": summary_full,
        "invoices": invoices,
        "historical_periods": sorted(historical_by_aamm.values(), key=lambda x: x["ocr_aamm"]),
        "full_timeline": full_timeline,
        "payments": payments,
    }


def compute_summary(items: List[Dict[str, Any]], dac_limit: float = 3000.0) -> Dict[str, Any]:
    if not items:
        return {}

    n = len(items)
    total_kwh = sum(x["kwh_total"] for x in items)
    total_dias = sum(x["dias"] for x in items)
    total_facturado = round(sum(x["total_factura"] for x in items), 2)
    total_energia = round(sum(x["subtotal_energia"] for x in items), 2)
    total_iva = round(sum(x["iva"] for x in items), 2)
    total_dap = round(sum(x["dap"] for x in items), 2)
    total_subsidio = round(sum(x["subsidio_gub"] for x in items), 2)

    kwh_basico = round(sum(x["kwh_basico"] for x in items), 2)
    kwh_intermedio = round(sum(x["kwh_intermedio"] for x in items), 2)
    kwh_excedente = round(sum(x["kwh_excedente"] for x in items), 2)

    sub_basico = round(sum(x.get("subtotal_basico", 0.0) for x in items), 2)
    sub_intermedio = round(sum(x.get("subtotal_intermedio", 0.0) for x in items), 2)
    sub_excedente = round(sum(x.get("subtotal_excedente", 0.0) for x in items), 2)

    avg_kwh_bim = round(total_kwh / n, 1)
    avg_total_bim = round(total_facturado / n, 2)
    avg_daily_kwh = round(total_kwh / total_dias, 2) if total_dias > 0 else 0.0
    avg_daily_cost = round(total_facturado / total_dias, 2) if total_dias > 0 else 0.0
    avg_cost_per_kwh = round(total_facturado / total_kwh, 3) if total_kwh > 0 else 0.0

    max_inv = max(items, key=lambda x: x["kwh_total"])
    min_inv = min(items, key=lambda x: x["kwh_total"])
    latest = items[-1]
    prev = items[-2] if n >= 2 else None

    delta_kwh_pct = (
        round(((latest["kwh_total"] - prev["kwh_total"]) / prev["kwh_total"]) * 100, 1)
        if prev and prev["kwh_total"] > 0
        else 0.0
    )
    delta_cost_pct = (
        round(((latest["total_factura"] - prev["total_factura"]) / prev["total_factura"]) * 100, 1)
        if prev and prev["total_factura"] > 0
        else 0.0
    )

    # Resumen por año
    by_year: Dict[int, Dict[str, Any]] = {}
    for x in items:
        y = x["anio"]
        if y not in by_year:
            by_year[y] = {
                "anio": y,
                "bimestres": 0,
                "kwh_total": 0,
                "total_factura": 0.0,
                "subsidio_gub": 0.0,
                "dias": 0,
            }
        by_year[y]["bimestres"] += 1
        by_year[y]["kwh_total"] += x["kwh_total"]
        by_year[y]["total_factura"] = round(by_year[y]["total_factura"] + x["total_factura"], 2)
        by_year[y]["subsidio_gub"] = round(by_year[y]["subsidio_gub"] + x["subsidio_gub"], 2)
        by_year[y]["dias"] += x["dias"]

    for y_data in by_year.values():
        bims = y_data["bimestres"]
        y_data["promedio_kwh_bim"] = round(y_data["kwh_total"] / bims, 1) if bims else 0
        y_data["promedio_factura_bim"] = round(y_data["total_factura"] / bims, 2) if bims else 0
        y_data["costo_kwh"] = (
            round(y_data["total_factura"] / y_data["kwh_total"], 2) if y_data["kwh_total"] else 0
        )

    return {
        "periodos_count": n,
        "primer_periodo": items[0]["periodo_label"],
        "ultimo_periodo": latest["periodo_label"],
        "total_kwh": total_kwh,
        "total_dias": total_dias,
        "total_facturado": total_facturado,
        "total_energia": total_energia,
        "total_iva": total_iva,
        "total_dap": total_dap,
        "total_subsidio": total_subsidio,
        "kwh_basico": kwh_basico,
        "kwh_intermedio": kwh_intermedio,
        "kwh_excedente": kwh_excedente,
        "pct_kwh_excedente": round((kwh_excedente / total_kwh) * 100, 1) if total_kwh > 0 else 0.0,
        "subtotal_basico": sub_basico,
        "subtotal_intermedio": sub_intermedio,
        "subtotal_excedente": sub_excedente,
        "pct_costo_excedente": (
            round((sub_excedente / total_energia) * 100, 1) if total_energia > 0 else 0.0
        ),
        "avg_kwh_bim": avg_kwh_bim,
        "avg_total_bim": avg_total_bim,
        "avg_daily_kwh": avg_daily_kwh,
        "avg_daily_cost": avg_daily_cost,
        "avg_cost_per_kwh": avg_cost_per_kwh,
        "latest": {
            "periodo": latest["periodo_label"],
            "kwh": latest["kwh_total"],
            "total": latest["total_factura"],
            "consumo_diario": latest["consumo_diario"],
            "precio_diario": latest["precio_diario"],
            "delta_kwh_pct": delta_kwh_pct,
            "delta_cost_pct": delta_cost_pct,
            "rolling_annual_kwh": latest.get("rolling_annual_kwh", 0),
            "dac_pct": latest.get("dac_pct", 0.0),
            "dac_margin_kwh": round(dac_limit - latest.get("rolling_annual_kwh", 0), 1),
        },
        "max_consumo": {
            "periodo": max_inv["periodo_label"],
            "kwh": max_inv["kwh_total"],
            "total": max_inv["total_factura"],
        },
        "min_consumo": {
            "periodo": min_inv["periodo_label"],
            "kwh": min_inv["kwh_total"],
            "total": min_inv["total_factura"],
        },
        "by_year": [by_year[k] for k in sorted(by_year.keys())],
    }
