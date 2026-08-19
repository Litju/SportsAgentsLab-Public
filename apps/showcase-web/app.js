const points = [];
const sampleRate = 100;
const mass = 75;
const gravity = 9.80665;
for (let index = 0; index <= 150; index += 1) {
  const time = index / sampleRate;
  const baseline = mass * gravity;
  let force = baseline;
  if (time < 0.3) force += 0.4 * Math.sin(8 * time * Math.PI);
  else if (time < 0.48) force = baseline * (0.82 + 0.18 * Math.cos(Math.PI * ((time - 0.3) / 0.18)));
  else if (time < 0.72) force = baseline * (1 + 1.25 * Math.sin(Math.PI * ((time - 0.48) / 0.24)));
  else if (time < 0.94) force = 0;
  else if (time < 1.06) force = baseline * (1 + 1.7 * Math.sin(Math.PI * ((time - 0.94) / 0.12)));
  points.push({ time, force });
}
const chart = document.querySelector("#trace");
const line = document.querySelector("#trace-line");
const grid = document.querySelector("#trace-grid");
const maxForce = Math.max(...points.map((point) => point.force));
const x = (time) => 24 + (time / 1.5) * 592;
const y = (force) => 230 - (Math.max(0, force) / maxForce) * 190;
line.setAttribute("d", points.map((point, index) => `${index ? "L" : "M"}${x(point.time).toFixed(2)} ${y(point.force).toFixed(2)}`).join(" "));
const flightX = x(0.72);
const flightWidth = x(0.94) - flightX;
const flight = document.createElementNS("http://www.w3.org/2000/svg", "rect");
flight.setAttribute("x", flightX); flight.setAttribute("y", "24"); flight.setAttribute("width", flightWidth); flight.setAttribute("height", "206"); flight.setAttribute("fill", "#86efac"); flight.setAttribute("opacity", "0.12"); flight.setAttribute("aria-label", "Declared synthetic flight interval");
chart.insertBefore(flight, line);
for (let row = 0; row < 4; row += 1) { const guide = document.createElementNS("http://www.w3.org/2000/svg", "line"); guide.setAttribute("x1", "24"); guide.setAttribute("x2", "616"); guide.setAttribute("y1", 230 - row * 63); guide.setAttribute("y2", 230 - row * 63); guide.setAttribute("stroke", "#27344d"); guide.setAttribute("stroke-width", "1"); grid.appendChild(guide); }
document.querySelector("#sample-count").textContent = String(points.length);
document.querySelector("#peak-force").textContent = `${Math.round(maxForce)} N`;
document.querySelector("#jump-height").textContent = `${(gravity * 0.22 * 0.22 / 8).toFixed(3)} m`;
