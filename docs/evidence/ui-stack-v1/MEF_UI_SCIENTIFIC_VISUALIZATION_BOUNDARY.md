# MEF Scientific Visualization Boundary

Apache ECharts is the single scientific visualization substrate for this stack. `MefEchartsFrame` imports ECharts from `echarts/core`, explicit chart/components/renderers modules, and uses the SVG renderer. The wrapper is dynamically loaded only where a plot frame is needed.

The final chart is an empty, accessible rendering shell: axes and units are present, the state says `Awaiting deterministic processor`, and the fallback text/table explains that no observations are available. There is no fabricated series, regression, clustering, resampling, smoothing, authority filter, or hidden transform. ECharts calculates no scientific result in this UI layer.

Production browser checks found one SVG inside the chart surface and one accessible parent `role=img` frame. The command-center resource list did not load the ECharts implementation chunks; `/trials/demo` did. This preserves the route-only heavy-library boundary.

Existing ML-102/103/104 evidence can be displayed when supplied by the governed data path, but this stack does not create new scientific output or advance ML-105/B02.
