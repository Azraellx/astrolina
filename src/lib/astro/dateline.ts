// Split a polyline wherever it crosses the ±180° antimeridian, inserting the
// exact seam-crossing vertex on BOTH sides so each piece reaches the map edge.
//
// A raw split (just starting a new segment on the >180° longitude jump) leaves
// the two halves stopping one sample short of the seam — a visible gap at the
// dateline when zoomed in, and a broken wrap when the map is centred on the
// Pacific. We bridge that by linearly interpolating the latitude where the
// segment hits ±180° and anchoring the cut there: the previous piece ends on its
// edge (+180 or −180) and the next piece resumes on the opposite edge at the
// same latitude, so the line reads as continuous across the wrap.
export function splitOnDateline(
  coords: [number, number][],
): [number, number][][] {
  const segs: [number, number][][] = [[]];
  for (const cur of coords) {
    const seg = segs[segs.length - 1];
    if (seg.length > 0) {
      const prev = seg[seg.length - 1];
      if (Math.abs(cur[0] - prev[0]) > 180) {
        // Shift the negative endpoint up by 360° onto a continuous scale that
        // straddles 180°, then solve for the crossing fraction t along prev→cur.
        const prevAdj = prev[0] < 0 ? prev[0] + 360 : prev[0];
        const curAdj = cur[0] < 0 ? cur[0] + 360 : cur[0];
        const t = (180 - prevAdj) / (curAdj - prevAdj);
        const crossLat = prev[1] + (cur[1] - prev[1]) * t;
        const prevEdge = prev[0] >= 0 ? 180 : -180;
        seg.push([prevEdge, crossLat]);
        segs.push([[-prevEdge, crossLat]]);
      }
    }
    segs[segs.length - 1].push(cur);
  }
  return segs.filter((s) => s.length >= 2);
}
