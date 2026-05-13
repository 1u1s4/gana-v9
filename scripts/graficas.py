#!/usr/bin/env python3
import argparse
import json
from pathlib import Path
from xml.sax.saxutils import escape

try:
    import pandas as pd
    import matplotlib.pyplot as plt
    import seaborn as sns
except ModuleNotFoundError:
    pd = None
    plt = None
    sns = None


def latest_metrics_artifact(root):
    candidates = sorted(Path(root).glob("runs/*/daily-metrics.json"), key=lambda path: path.stat().st_mtime, reverse=True)
    return candidates[0] if candidates else None


def load_metrics(path):
    with open(path, "r", encoding="utf-8") as handle:
        payload = json.load(handle)
    metrics = payload.get("metrics", [])
    if not metrics:
        raise SystemExit(f"No metrics found in {path}")
    return metrics


def metric_summary_records(metrics):
    rows = []
    for item in metrics:
        parlay = item.get("parlayMetrics") or {}
        rows.append({
            "Fecha": item.get("metricDate"),
            "Parlays": parlay.get("total", 0),
            "Won": parlay.get("won", 0),
            "Lost": parlay.get("lost", 0),
            "Voided": parlay.get("voided", 0),
            "Sin_validar": parlay.get("unvalidated", 0),
            "Cuota_prom": parlay.get("avgOdds"),
            "Conf_prom": parlay.get("avgConfidence"),
            "Hit_rate": parlay.get("hitRate"),
        })
    return rows


def metric_summary_rows(metrics):
    rows = metric_summary_records(metrics)
    return pd.DataFrame(rows, columns=[
        "Fecha",
        "Parlays",
        "Won",
        "Lost",
        "Voided",
        "Sin_validar",
        "Cuota_prom",
        "Conf_prom",
        "Hit_rate",
    ])


def merge_buckets(metrics, metric_key, bucket_key, label_name):
    records = merge_bucket_records(metrics, metric_key, bucket_key, label_name)
    return pd.DataFrame(records)


def merge_bucket_records(metrics, metric_key, bucket_key, label_name):
    groups = {}
    for item in metrics:
        buckets = ((item.get(metric_key) or {}).get(bucket_key) or [])
        for bucket in buckets:
            label = bucket.get("label") or bucket.get("key") or "unknown"
            current = groups.setdefault(label, {
                label_name: label,
                "Parlays": 0,
                "Won": 0,
                "Lost": 0,
                "Voided": 0,
                "Sin_validar": 0,
                "odds_sum": 0.0,
                "odds_n": 0,
                "conf_sum": 0.0,
                "conf_n": 0,
            })
            total = int(bucket.get("total") or 0)
            current["Parlays"] += total
            current["Won"] += int(bucket.get("won") or 0)
            current["Lost"] += int(bucket.get("lost") or 0)
            current["Voided"] += int(bucket.get("voided") or 0)
            current["Sin_validar"] += int(bucket.get("unvalidated") or 0)
            if bucket.get("avgOdds") is not None and total:
                current["odds_sum"] += float(bucket["avgOdds"]) * total
                current["odds_n"] += total
            if bucket.get("avgConfidence") is not None and total:
                current["conf_sum"] += float(bucket["avgConfidence"]) * total
                current["conf_n"] += total

    rows = []
    for value in groups.values():
        settled = value["Won"] + value["Lost"]
        rows.append({
            label_name: value[label_name],
            "Parlays": value["Parlays"],
            "Won": value["Won"],
            "Lost": value["Lost"],
            "Voided": value["Voided"],
            "Sin_validar": value["Sin_validar"],
            "Cuota_prom": value["odds_sum"] / value["odds_n"] if value["odds_n"] else None,
            "Conf_prom": value["conf_sum"] / value["conf_n"] if value["conf_n"] else None,
            "Hit_rate": (value["Won"] / settled) * 100 if settled else None,
        })
    return rows


def annotate_horizontal_percent(ax):
    for patch in ax.patches:
        width = patch.get_width()
        if pd.isna(width):
            continue
        ax.annotate(
            f"{width:.1f}%",
            (width + 2, patch.get_y() + patch.get_height() / 2.0),
            ha="center",
            va="center",
            fontsize=10,
            color="black",
        )


def annotate_vertical_percent(ax):
    for patch in ax.patches:
        height = patch.get_height()
        if pd.isna(height):
            continue
        ax.annotate(
            f"{height:.1f}%",
            (patch.get_x() + patch.get_width() / 2.0, height + 2),
            ha="center",
            va="center",
            fontsize=10,
            color="black",
        )


def build_dashboard_summary(metrics, output, show):
    if pd is None or plt is None or sns is None:
        svg_output = output if output.suffix.lower() == ".svg" else output.with_suffix(".svg")
        return build_svg_summary(metrics, svg_output)

    df_dia = metric_summary_rows(metrics)
    df_cuota = merge_buckets(metrics, "parlayMetrics", "byOddsBucket", "Rango")
    df_conf = merge_buckets(metrics, "parlayMetrics", "byConfidenceBucket", "Confianza")
    df_perfil = merge_buckets(metrics, "parlayMetrics", "byProfile", "Perfil")

    sns.set_theme(style="whitegrid")
    plt.rcParams["font.family"] = "sans-serif"
    fig, axes = plt.subplots(2, 2, figsize=(16, 12))
    fig.suptitle("Analisis diario de predicciones y parlays", fontsize=20, fontweight="bold", y=0.98)

    df_perfil_plot = df_perfil.dropna(subset=["Hit_rate"]).sort_values("Hit_rate", ascending=False)
    sns.barplot(x="Hit_rate", y="Perfil", data=df_perfil_plot, ax=axes[0, 0], palette="viridis", hue="Perfil", legend=False)
    axes[0, 0].set_title("Hit rate por perfil de parlay (%)", fontsize=14)
    axes[0, 0].set_xlabel("Hit rate (%)")
    axes[0, 0].set_ylabel("")
    axes[0, 0].set_xlim(0, 100)
    annotate_horizontal_percent(axes[0, 0])

    df_cuota_plot = df_cuota.dropna(subset=["Hit_rate"]).sort_values("Rango")
    sns.barplot(x="Rango", y="Hit_rate", data=df_cuota_plot, ax=axes[0, 1], palette="coolwarm", hue="Rango", legend=False)
    axes[0, 1].set_title("Hit rate por rango de cuota (%)", fontsize=14)
    axes[0, 1].set_xlabel("Rango de cuota")
    axes[0, 1].set_ylabel("Hit rate (%)")
    axes[0, 1].set_ylim(0, 100)
    annotate_vertical_percent(axes[0, 1])

    df_conf_plot = df_conf.dropna(subset=["Hit_rate"]).sort_values("Confianza")
    sns.barplot(x="Confianza", y="Hit_rate", data=df_conf_plot, ax=axes[1, 0], palette="magma", hue="Confianza", legend=False)
    axes[1, 0].set_title("Hit rate por confianza agregada (%)", fontsize=14)
    axes[1, 0].set_xlabel("Confianza agregada")
    axes[1, 0].set_ylabel("Hit rate (%)")
    axes[1, 0].set_ylim(0, 110)
    annotate_vertical_percent(axes[1, 0])

    df_perfil_vol = df_perfil.set_index("Perfil")[["Won", "Lost", "Voided", "Sin_validar"]]
    df_perfil_vol.plot(kind="bar", stacked=True, ax=axes[1, 1], color=["#2ca02c", "#d62728", "#7f7f7f", "#1f77b4"])
    axes[1, 1].set_title("Volumen y estado de parlays por perfil", fontsize=14)
    axes[1, 1].set_xlabel("")
    axes[1, 1].set_ylabel("Cantidad de parlays")
    axes[1, 1].legend(title="Estado", loc="upper right")
    plt.xticks(rotation=45, ha="right")

    plt.tight_layout(rect=[0, 0, 1, 0.96])
    output.parent.mkdir(parents=True, exist_ok=True)
    plt.savefig(output, dpi=300)
    if show:
        plt.show()
    plt.close(fig)
    return output


def build_svg_summary(metrics, output):
    profile = sorted(
        [row for row in merge_bucket_records(metrics, "parlayMetrics", "byProfile", "Perfil") if row["Hit_rate"] is not None],
        key=lambda row: row["Hit_rate"],
        reverse=True,
    )
    odds = sorted(
        [row for row in merge_bucket_records(metrics, "parlayMetrics", "byOddsBucket", "Rango") if row["Hit_rate"] is not None],
        key=lambda row: row["Rango"],
    )
    confidence = sorted(
        [row for row in merge_bucket_records(metrics, "parlayMetrics", "byConfidenceBucket", "Confianza") if row["Hit_rate"] is not None],
        key=lambda row: row["Confianza"],
    )
    volume = merge_bucket_records(metrics, "parlayMetrics", "byProfile", "Perfil")

    width = 1280
    height = 920
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<rect width="100%" height="100%" fill="#f7f8fa"/>',
        '<text x="40" y="48" font-family="Arial" font-size="28" font-weight="700" fill="#1f2937">Analisis diario de predicciones y parlays</text>',
        svg_bar_panel(40, 80, 560, 360, "Hit rate por perfil de parlay (%)", profile, "Perfil", "Hit_rate", "#3b82f6"),
        svg_bar_panel(680, 80, 560, 360, "Hit rate por rango de cuota (%)", odds, "Rango", "Hit_rate", "#ef4444"),
        svg_bar_panel(40, 500, 560, 360, "Hit rate por confianza agregada (%)", confidence, "Confianza", "Hit_rate", "#8b5cf6"),
        svg_volume_panel(680, 500, 560, 360, "Volumen y estado de parlays por perfil", volume),
        "</svg>",
    ]
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text("\n".join(parts), encoding="utf-8")
    return output


def svg_bar_panel(x, y, width, height, title, rows, label_key, value_key, color):
    inner_x = x + 24
    inner_y = y + 56
    label_w = 150
    bar_w = width - label_w - 90
    row_h = max(24, min(38, (height - 80) / max(1, len(rows))))
    parts = [
        f'<g transform="translate({x},{y})">',
        f'<rect width="{width}" height="{height}" rx="10" fill="#ffffff" stroke="#d6dbe3"/>',
        f'<text x="24" y="30" font-family="Arial" font-size="16" font-weight="700" fill="#111827">{escape(title)}</text>',
    ]
    for idx, row in enumerate(rows[:9]):
        value = float(row.get(value_key) or 0)
        y_pos = 56 + idx * row_h
        bar_len = min(100, max(0, value)) / 100 * bar_w
        label = str(row.get(label_key) or "unknown")
        parts.extend([
            f'<text x="24" y="{y_pos + 15}" font-family="Arial" font-size="12" fill="#374151">{escape(label[:22])}</text>',
            f'<rect x="{label_w}" y="{y_pos + 3}" width="{bar_w}" height="14" rx="4" fill="#e5e7eb"/>',
            f'<rect x="{label_w}" y="{y_pos + 3}" width="{bar_len:.1f}" height="14" rx="4" fill="{color}"/>',
            f'<text x="{label_w + bar_w + 12}" y="{y_pos + 15}" font-family="Arial" font-size="12" fill="#111827">{value:.1f}%</text>',
        ])
    parts.append("</g>")
    return "\n".join(parts)


def svg_volume_panel(x, y, width, height, title, rows):
    rows = sorted(rows, key=lambda row: row.get("Parlays") or 0, reverse=True)[:9]
    max_total = max([row.get("Parlays") or 0 for row in rows] + [1])
    colors = {"Won": "#22c55e", "Lost": "#ef4444", "Voided": "#6b7280", "Sin_validar": "#3b82f6"}
    label_w = 150
    bar_w = width - label_w - 80
    row_h = max(24, min(36, (height - 80) / max(1, len(rows))))
    parts = [
        f'<g transform="translate({x},{y})">',
        f'<rect width="{width}" height="{height}" rx="10" fill="#ffffff" stroke="#d6dbe3"/>',
        f'<text x="24" y="30" font-family="Arial" font-size="16" font-weight="700" fill="#111827">{escape(title)}</text>',
    ]
    for idx, row in enumerate(rows):
        y_pos = 56 + idx * row_h
        label = str(row.get("Perfil") or "unknown")
        cursor = label_w
        parts.append(f'<text x="24" y="{y_pos + 15}" font-family="Arial" font-size="12" fill="#374151">{escape(label[:22])}</text>')
        for key, color in colors.items():
            value = row.get(key) or 0
            segment = value / max_total * bar_w
            parts.append(f'<rect x="{cursor:.1f}" y="{y_pos + 3}" width="{segment:.1f}" height="14" fill="{color}"/>')
            cursor += segment
        parts.append(f'<text x="{label_w + bar_w + 12}" y="{y_pos + 15}" font-family="Arial" font-size="12" fill="#111827">{row.get("Parlays") or 0}</text>')
    parts.append("</g>")
    return "\n".join(parts)


def parse_args():
    parser = argparse.ArgumentParser(description="Generate charts from Gana daily-metrics artifacts.")
    parser.add_argument("--input", type=Path, help="Path to daily-metrics.json. Defaults to the latest artifact.")
    parser.add_argument("--artifact-root", default=".artifacts/gana-v9", help="Artifact root used to discover the latest metrics artifact.")
    parser.add_argument("--output", type=Path, default=Path("dashboard_summary.png"), help="PNG output path.")
    parser.add_argument("--show", action="store_true", help="Display the chart window after writing the PNG.")
    return parser.parse_args()


def main():
    args = parse_args()
    input_path = args.input or latest_metrics_artifact(args.artifact_root)
    if input_path is None:
        raise SystemExit("No daily-metrics.json artifact found. Run: npm run gana -- metrics daily --date YYYY-MM-DD --days 3")
    metrics = load_metrics(input_path)
    output_path = build_dashboard_summary(metrics, args.output, args.show)
    print(f"Wrote {output_path} from {input_path}")


if __name__ == "__main__":
    main()
