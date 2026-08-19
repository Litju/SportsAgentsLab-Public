"use client";

import { AriaComponent, GridComponent, TooltipComponent } from "echarts/components";
import { LineChart } from "echarts/charts";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";

echarts.use([LineChart, GridComponent, TooltipComponent, AriaComponent, SVGRenderer]);

export function MefEchartsFrame({ title, note, xUnit, yUnit, compact = false }: Readonly<{ title: string; note: string; xUnit: string; yUnit: string; compact?: boolean }>) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = chartRef.current;
    if (!element) return;
    const chart = echarts.init(element, undefined, { renderer: "svg" });
    chart.setOption({
      animation: false,
      aria: { enabled: true, decal: { show: false } },
      grid: { top: 22, right: 18, bottom: compact ? 28 : 34, left: compact ? 34 : 46 },
      tooltip: { show: false },
      xAxis: { type: "category", name: xUnit, nameLocation: "middle", nameGap: compact ? 20 : 26, data: [], axisLabel: { color: "#70848d", fontSize: 9 }, axisLine: { lineStyle: { color: "#30424a" } }, splitLine: { show: true, lineStyle: { color: "rgba(111, 137, 144, .15)" } } },
      yAxis: { type: "value", name: yUnit, nameTextStyle: { color: "#70848d", fontSize: 9 }, axisLabel: { color: "#70848d", fontSize: 9 }, axisLine: { lineStyle: { color: "#30424a" } }, splitLine: { lineStyle: { color: "rgba(111, 137, 144, .15)" } } },
      series: []
    });
    const resize = () => chart.resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.dispose();
    };
  }, [compact, xUnit, yUnit]);

  return (
    <div className={`mef-plot-frame${compact ? " mef-plot-frame-compact" : ""}`} role="img" aria-label={`${title}. ${note} X axis ${xUnit}. Y axis ${yUnit}.`}>
      <div className="mef-echarts-surface" ref={chartRef} aria-hidden="true" />
      <div className="mef-plot-empty"><span className="mef-plot-empty-mark" aria-hidden="true" /><strong>Awaiting deterministic processor</strong><p>{note}</p></div>
      <span className="mef-plot-y-label">{yUnit}</span><span className="mef-plot-x-label">{xUnit}</span>
    </div>
  );
}
