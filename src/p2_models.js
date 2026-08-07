/* =========================================================================
   Part 2 — low-poly model factory: dragon, rider, enemies, boss, world props
   ========================================================================= */
(function () {
var P = window.__PF;
var V3 = P.V3, M = P.M, G = P.G, rand = P.rand, clamp = P.clamp, lerp = P.lerp, damp = P.damp, TAU = P.TAU;

// ------------------------------------------------------- geometry shortcuts
function box(w, h, d) { return new THREE.BoxGeometry(w, h, d); }
function cone(r, h, s) { return new THREE.ConeGeometry(r, h, s || 5); }
function cyl(r1, r2, h, s) { return new THREE.CylinderGeometry(r1, r2, h, s || 6); }
function ico(r, d) { return new THREE.IcosahedronGeometry(r, d || 0); }
function oct(r, d) { return new THREE.OctahedronGeometry(r, d || 0); }
function dodec(r) { return new THREE.DodecahedronGeometry(r, 0); }
function tet(r) { return new THREE.TetrahedronGeometry(r, 0); }
function tor(r, t, a, b) { return new THREE.TorusGeometry(r, t, a || 4, b || 12); }
function mesh(g, m) { return new THREE.Mesh(g, m); }

function sgn(v) { return v < 0 ? -1 : 1; }

// A lofted shell through stacked cross-sections. Each section is a superellipse
// of half-width w/2 and half-depth d/2 — n near 2 is an ellipse, higher n
// squares the corners off. Sampling it at NS angles gives a chamfered prism, so
// a torso reads as a tapered armoured shell instead of a crate. Same idea as the
// head's ring stack, generalised so armour can use it too.
function loftGeo(S, NS, capBot, capTop, aFrom, aTo) {
  var pos = [], i, r;
  NS = NS || 10;
  var A0 = aFrom === undefined ? 0 : aFrom;
  var A1 = aTo === undefined ? TAU : aTo;
  function pt(s, a) {
    var ca = Math.cos(a), sa = Math.sin(a), p = 2 / (s.n || 3.2);
    return [
      s.w * 0.5 * sgn(ca) * Math.pow(Math.abs(ca), p) + (s.cx || 0),
      s.y,
      s.d * 0.5 * sgn(sa) * Math.pow(Math.abs(sa), p) + (s.cz || 0)
    ];
  }
  function tri(A, B, C) { pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]); }
  function ang(i) { return A0 + (A1 - A0) * (i / NS); }
  for (r = 0; r < S.length - 1; r++) {
    for (i = 0; i < NS; i++) {
      var a0 = ang(i), a1 = ang(i + 1);
      var v00 = pt(S[r], a0), v01 = pt(S[r], a1);
      var v10 = pt(S[r + 1], a0), v11 = pt(S[r + 1], a1);
      tri(v00, v10, v11); tri(v00, v11, v01);
    }
  }
  if (capBot !== false) {
    var b = S[0], bc = [b.cx || 0, b.y, b.cz || 0];
    for (i = 0; i < NS; i++) tri(bc, pt(b, ang(i + 1)), pt(b, ang(i)));
  }
  if (capTop !== false) {
    var t = S[S.length - 1], tc = [t.cx || 0, t.y, t.cz || 0];
    for (i = 0; i < NS; i++) tri(tc, pt(t, ang(i)), pt(t, ang(i + 1)));
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// An extruded flat polygon — armour plates, tabards, emblem facets. Points are
// [x, y] in the plate's own plane, fanned from the centroid so any convex or
// mildly star-shaped outline closes without gaps, then swept to thickness t.
function plateGeo(pts, t) {
  var pos = [], i, n = pts.length, h = t * 0.5;
  var cx = 0, cy = 0;
  for (i = 0; i < n; i++) { cx += pts[i][0]; cy += pts[i][1]; }
  cx /= n; cy /= n;
  function tri(A, B, C) { pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]); }
  for (i = 0; i < n; i++) {
    var a = pts[i], b = pts[(i + 1) % n];
    tri([cx, cy, h], [a[0], a[1], h], [b[0], b[1], h]);          // front face
    tri([cx, cy, -h], [b[0], b[1], -h], [a[0], a[1], -h]);       // back face
    tri([a[0], a[1], h], [a[0], a[1], -h], [b[0], b[1], -h]);    // rim
    tri([a[0], a[1], h], [b[0], b[1], -h], [b[0], b[1], h]);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
function plate(pts, t, m) { return mesh(plateGeo(pts, t), m); }

// Several plates sharing one material, merged into a single geometry. An emblem
// is a handful of facets; left as separate meshes each costs a draw call for no
// visual gain.
function plates(polys, t, m) {
  var pos = [], i, k;
  for (i = 0; i < polys.length; i++) {
    var a = plateGeo(polys[i], t).getAttribute('position').array;
    for (k = 0; k < a.length; k++) pos.push(a[k]);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return mesh(g, m);
}

// A wing sail: one continuous fan from a hub inside a closed outline. Because
// the outline is star-shaped about the hub, the fan can't leave gaps between
// panels — the whole membrane is a single airtight surface. Dropping the hub
// below the outline plane gives it camber, so it reads as a taut sail rather
// than a flat kite. Vertex colour darkens toward the trailing edge.
function sail(outline, hub, cLead, cTrail) {
  var pos = [], col = [], i;
  var far = 0;
  for (i = 0; i < outline.length; i++) {
    var d = Math.abs(outline[i][3] === undefined ? 0 : outline[i][3]);
    if (d > far) far = d;
  }
  function push(p, shade) {
    pos.push(p[0], p[1], p[2]);
    col.push(cLead.r + (cTrail.r - cLead.r) * shade,
             cLead.g + (cTrail.g - cLead.g) * shade,
             cLead.b + (cTrail.b - cLead.b) * shade);
  }
  // shade channel rides in slot 3 of each outline point (0 = leading, 1 = trailing)
  for (i = 0; i < outline.length - 1; i++) {
    var a = outline[i], b = outline[i + 1];
    var sa = a[3] === undefined ? 0.5 : a[3], sb = b[3] === undefined ? 0.5 : b[3];
    push(hub, (sa + sb) * 0.5 * 0.55);
    push(a, sa);
    push(b, sb);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

// triangle strip wing membrane
function membrane(pts) {
  var g = new THREE.BufferGeometry(), v = [];
  for (var i = 1; i < pts.length - 1; i++) {
    v.push(pts[0][0], pts[0][1], pts[0][2]);
    v.push(pts[i][0], pts[i][1], pts[i][2]);
    v.push(pts[i + 1][0], pts[i + 1][1], pts[i + 1][2]);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

// A tapered tube through a list of cross-sections. Superelliptic sections give
// a creature-like profile (flattish back and belly) rather than a plain pipe,
// and the belly is tinted through vertex colour so there's no seam.
function tube(sections, radial, belly, back) {
  var pos = [], col = [], i, j;
  var K = 1.45;
  function pt(si, ai) {
    var sec = sections[si];
    var a = ai / radial * TAU;
    var c = Math.cos(a), sn = Math.sin(a);
    var sx = c < 0 ? -1 : 1, sy = sn < 0 ? -1 : 1;
    return [
      sx * Math.pow(Math.abs(c), 2 / K) * sec.rx,
      sy * Math.pow(Math.abs(sn), 2 / K) * sec.ry + (sec.y || 0),
      sec.z
    ];
  }
  function shade(ai) {                       // 0 at the spine, 1 under the belly
    var sn = Math.sin(ai / radial * TAU);
    return clamp(-sn * 0.5 + 0.5, 0, 1);
  }
  function push(v, ai) {
    pos.push(v[0], v[1], v[2]);
    var f = shade(ai), r = back, g = belly;
    col.push(r.r + (g.r - r.r) * f, r.g + (g.g - r.g) * f, r.b + (g.b - r.b) * f);
  }
  function tri(a, ai, b, bi, c, ci) { push(a, ai); push(b, bi); push(c, ci); }
  for (i = 0; i < sections.length - 1; i++) {
    for (j = 0; j < radial; j++) {
      var a0 = pt(i, j), a1 = pt(i, j + 1), b0 = pt(i + 1, j), b1 = pt(i + 1, j + 1);
      tri(a0, j, b0, j, b1, j + 1);
      tri(a0, j, b1, j + 1, a1, j + 1);
    }
  }
  // caps
  var first = sections[0], last = sections[sections.length - 1];
  var cf = [0, first.y || 0, first.z], cl = [0, last.y || 0, last.z];
  for (j = 0; j < radial; j++) {
    tri(cf, radial / 2, pt(0, j + 1), j + 1, pt(0, j), j);
    tri(cl, radial / 2, pt(sections.length - 1, j), j, pt(sections.length - 1, j + 1), j + 1);
  }
  var g2 = new THREE.BufferGeometry();
  g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g2.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g2.computeVertexNormals();
  return g2;
}
function hullMat(shine) {
  var m = new THREE.MeshPhongMaterial({
    vertexColors: true, flatShading: true, shininess: shine || 14, specular: 0x243c40
  });
  P.retroPatch(m);
  return m;
}
// a tapered bone between two points
function bone(a, b, r1, r2, mat, sides) {
  var A = new V3(a[0], a[1], a[2]), B = new V3(b[0], b[1], b[2]);
  var len = A.distanceTo(B);
  var m = mesh(cyl(r2, r1, len, sides || 5), mat);
  m.position.copy(A).add(B).multiplyScalar(0.5);
  m.lookAt(B);
  m.rotateX(-Math.PI * 0.5);
  return m;
}

// ============================================================== THE DRAGON
var DRAGON_COL = {
  hide:  0x2c8b90,
  hide2: 0x1d6069,
  plate: 0x7d4bb5,
  belly: 0xa8874f,
  wing:  0xc24a86,
  claw:  0xf0e2bb,
  eye:   0xffe066
};

function buildDragon() {
  var root = new THREE.Group();      // faces +Z
  var body = new THREE.Group(); root.add(body);

  var mHide = M(DRAGON_COL.hide, { shine: 14, spec: 0x224044 });
  var mHide2 = M(DRAGON_COL.hide2, { shine: 8 });
  var mPlate = M(DRAGON_COL.plate, { shine: 26, spec: 0x554070 });
  var mBelly = M(DRAGON_COL.belly);
  var mWing = M(DRAGON_COL.wing, { side: THREE.DoubleSide, shine: 6 });
  var mSpar = M(0x9c8763, { shine: 18 });
  // one vertex-coloured sail material, lighter at the leading edge
  var mSail = new THREE.MeshPhongMaterial({
    vertexColors: true, flatShading: true, side: THREE.DoubleSide,
    shininess: 6, specular: 0x3a2030
  });
  P.retroPatch(mSail);
  var cWingLead = new THREE.Color(0xd8578f);
  var cWingTrail = new THREE.Color(0x7a2953);
  var mClaw = M(DRAGON_COL.claw);
  var mHorn = M(0x6c5a4a, { shine: 22, spec: 0x3a3028 });

  // ---- torso: one tapered hull, deep at the chest, narrowing to the hips
  var cBack = new THREE.Color(DRAGON_COL.hide);
  var cBelly = new THREE.Color(DRAGON_COL.belly);
  var mHull = hullMat(16);
  var torsoGeo = tube([
    { z: -3.30, rx: 0.40, ry: 0.38, y:  0.06 },
    { z: -2.40, rx: 0.74, ry: 0.66, y:  0.02 },
    { z: -1.20, rx: 1.08, ry: 0.90, y: -0.06 },
    { z:  0.00, rx: 1.30, ry: 1.02, y: -0.06 },
    { z:  1.10, rx: 1.36, ry: 1.12, y:  0.00 },
    { z:  2.10, rx: 1.12, ry: 0.96, y:  0.10 },
    { z:  2.95, rx: 0.74, ry: 0.68, y:  0.24 },
    { z:  3.45, rx: 0.50, ry: 0.47, y:  0.32 }
  ], 10, cBelly, cBack);
  body.add(mesh(torsoGeo, mHull));

  // shoulder and hip masses so the limbs have something to grow out of
  [-1, 1].forEach(function (sd) {
    var sh = mesh(ico(0.62, 0), mHide2);
    sh.position.set(sd * 0.95, 0.42, 1.35); sh.scale.set(0.9, 0.85, 1.15); body.add(sh);
    var hp = mesh(ico(0.52, 0), mHide2);
    hp.position.set(sd * 0.82, -0.18, -1.30); hp.scale.set(0.85, 0.9, 1.05); body.add(hp);
  });

  // dorsal ridge — plates that shrink and lean back along the spine
  for (var i = 0; i < 9; i++) {
    var f2 = i / 8;
    var pl = mesh(tet(0.40), mPlate);
    pl.position.set(0, 1.02 - f2 * 0.28 + Math.sin(f2 * 3.1) * 0.06, 2.5 - i * 0.72);
    pl.rotation.set(Math.PI * 0.5, 0, Math.PI * 0.25);
    pl.scale.set(0.42, 0.55 + Math.sin(f2 * 3.1) * 0.7, 1.0);
    body.add(pl);
  }

  // ---- neck: five tapering segments, then a proper skull -----------------
  var neck = new THREE.Group(); neck.position.set(0, 0.62, 3.20); body.add(neck);
  var necks = [];
  var parent = neck;
  var NSEG = 4;
  for (var n = 0; n < NSEG; n++) {
    var seg = new THREE.Group(); seg.position.z = n === 0 ? 0 : 0.76;
    var r0 = 0.64 - n * 0.062, r1 = 0.64 - (n + 1) * 0.062;
    seg.add(mesh(tube([
      { z: 0.00, rx: r0 * 1.02, ry: r0 },
      { z: 0.40, rx: (r0 + r1) * 0.51, ry: (r0 + r1) * 0.5 },
      { z: 0.80, rx: r1 * 1.02, ry: r1 }
    ], 9, cBelly, cBack), mHull));
    // a small plate riding each vertebra
    var np = mesh(tet(0.2), mPlate);
    np.position.set(0, r0 * 0.95, 0.42);
    np.rotation.set(Math.PI * 0.5, 0, Math.PI * 0.25);
    np.scale.set(0.34, 0.75, 0.9); seg.add(np);
    parent.add(seg); necks.push(seg); parent = seg;
  }

  var head = new THREE.Group(); head.position.z = 0.76; head.scale.setScalar(1.14); parent.add(head);
  // A broad cranium dropping into a short, deep muzzle — roughly 2:1 long to
  // wide. The old skull was 3:1 and read as a crocodile.
  head.add(mesh(tube([
    { z: -0.34, rx: 0.40, ry: 0.42, y:  0.00 },
    { z:  0.02, rx: 0.56, ry: 0.50, y:  0.04 },
    { z:  0.40, rx: 0.50, ry: 0.44, y:  0.01 },
    { z:  0.78, rx: 0.36, ry: 0.35, y: -0.05 },
    { z:  1.18, rx: 0.29, ry: 0.29, y: -0.10 },
    { z:  1.48, rx: 0.23, ry: 0.23, y: -0.14 },
    { z:  1.64, rx: 0.13, ry: 0.14, y: -0.17 }
  ], 9, cBelly, cBack), mHull));
  [-1, 1].forEach(function (sd) {
    // heavy brow shelf over the eye
    var brow = mesh(tet(0.30), mHide2);
    brow.position.set(sd * 0.34, 0.34, 0.30);
    brow.rotation.set(0.45, sd * 0.35, 0); brow.scale.set(1.05, 0.62, 1.5); head.add(brow);
    var cheek = mesh(tet(0.28), mHide2);
    cheek.position.set(sd * 0.40, -0.12, 0.20);
    cheek.rotation.set(-0.28, sd * 0.55, 0); cheek.scale.set(1, 0.95, 1.2); head.add(cheek);
    // One clean straight spike per side, rooted inside the skull. Segmented
    // horns kinked at every joint and read as a stack of planks.
    head.add(bone([sd * 0.22, 0.16, 0.06], [sd * 0.68, 0.74, -1.50], 0.19, 0.015, mHorn, 7));
    // small frill tucked behind the jaw hinge, in the crest colour
    head.add(mesh(membrane([
      [sd * 0.32, 0.06, -0.24], [sd * 0.50, 0.26, -0.60],
      [sd * 0.46, -0.06, -0.66], [sd * 0.34, -0.18, -0.38]
    ]), mPlate));
    // eye set under the brow shelf
    var eye = mesh(oct(0.105), G(DRAGON_COL.eye));
    eye.position.set(sd * 0.45, 0.11, 0.36); eye.scale.set(0.45, 1, 1.1); head.add(eye);
  });
  // lower jaw, hinged at the back so it can be opened later
  var jaw = new THREE.Group(); jaw.position.set(0, -0.24, 0.10); head.add(jaw);
  jaw.add(mesh(tube([
    { z: 0.00, rx: 0.34, ry: 0.17 },
    { z: 0.55, rx: 0.28, ry: 0.15 },
    { z: 1.10, rx: 0.19, ry: 0.12 },
    { z: 1.42, rx: 0.10, ry: 0.08 }
  ], 7, cBelly, cBelly), mHull));
  // teeth along the upper jaw line
  for (var tt = 0; tt < 5; tt++) {
    [-1, 1].forEach(function (sd) {
      var tooth = mesh(cone(0.042, 0.15, 4), mClaw);
      tooth.position.set(sd * (0.26 - tt * 0.030), -0.20 - tt * 0.020, 0.42 + tt * 0.25);
      tooth.rotation.x = Math.PI;
      head.add(tooth);
    });
  }
  // nostrils
  [-1, 1].forEach(function (sd) {
    var nos = mesh(oct(0.05), mHide2);
    nos.position.set(sd * 0.10, -0.06, 1.44); head.add(nos);
  });
  // crest plates running the skull, continuing the neck ridge into the head
  for (var cr = 0; cr < 3; cr++) {
    var cp = mesh(tet(0.17), mPlate);
    cp.position.set(0, 0.44 - cr * 0.05, -0.18 - cr * 0.26);
    cp.rotation.set(Math.PI * 0.5, 0, Math.PI * 0.25);
    cp.scale.set(0.30, 0.75 - cr * 0.10, 0.9);
    head.add(cp);
  }

  // ---- wings: humerus, forearm and four finger spars carrying a scalloped
  // membrane, the way a bat or a dragon actually folds together.
  function wing(side) {
    var w = new THREE.Group();
    w.position.set(side * 0.92, 0.30, 0.88);

    // Arm chain: shoulder, elbow, wrist — swept back so the leading edge rakes.
    var S  = [0, 0, 0];
    var E  = [side * 2.45, 0.26, -0.62];
    var W2 = [side * 4.85, 0.50, -1.55];
    // Five finger spars fanning off the wrist, the trailing one raked right back.
    var FG = [
      [side * 7.55, 0.62, -1.05],
      [side * 7.25, 0.38, -2.75],
      [side * 6.35, 0.08, -4.30],
      [side * 4.90, -0.18, -5.40],
      [side * 3.05, -0.36, -5.85]
    ];
    var A  = [side * 0.22, -0.40, -3.15];     // membrane root, buried in the flank

    function mix(a, b, u) {
      return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
    }
    function pull(p, toward, k) {
      return [p[0] + (toward[0] - p[0]) * k, p[1] + (toward[1] - p[1]) * k,
              p[2] + (toward[2] - p[2]) * k];
    }
    function tag(p, s) { return [p[0], p[1], p[2], s]; }

    // ---- one closed outline, walked leading edge -> fingertips -> root ----
    // Each point also records WHICH joint carries it, so the membrane can be
    // re-solved every frame as the arm folds instead of being a rigid sheet.
    //   0 = shoulder (fixed)   1 = elbow   2 = wrist/fingers
    var out = [], owner = [];
    function add(p, shade, own) { out.push(tag(p, shade)); owner.push(own); }
    add(S, 0, 0); add(E, 0.05, 1); add(W2, 0.12, 2);
    for (var fi = 0; fi < FG.length; fi++) {
      add(FG[fi], 0.30 + fi * 0.10, 2);
      var nxt = fi < FG.length - 1 ? FG[fi + 1] : A;
      // shallow scallops between fingertips — a bite, not a bay
      add(pull(mix(FG[fi], nxt, 0.5), W2, 0.11), 0.92, fi < FG.length - 1 ? 2 : 0);
    }
    add(A, 0.62, 0);
    add(S, 0, 0);                              // close the loop

    // Hub sits under the middle of the sail: the fan centre and the camber.
    var hub = [ (W2[0] + A[0] * 0.5) * 0.62, W2[1] - 0.62, (W2[2] + A[2]) * 0.45 ];

    var mem = new THREE.Group();
    var sailMesh = mesh(sail(out, hub, cWingLead, cWingTrail), mSail);
    mem.add(sailMesh);
    w.add(mem);

    // ---- articulated bone chain -------------------------------------------
    // The arm is now three nested groups rather than one rigid block, so the
    // elbow and wrist can fold on the upstroke the way a bat's actually does.
    var elbowG = new THREE.Group();
    elbowG.position.set(E[0], E[1], E[2]);
    w.add(elbowG);
    var wristG = new THREE.Group();
    wristG.position.set(W2[0] - E[0], W2[1] - E[1], W2[2] - E[2]);
    elbowG.add(wristG);

    function rel(p, o) { return [p[0] - o[0], p[1] - o[1], p[2] - o[2]]; }

    w.add(bone(S, E, 0.26, 0.18, mHide));                       // humerus
    elbowG.add(bone([0, 0, 0], rel(W2, E), 0.18, 0.13, mHide));  // forearm
    var knuckle = mesh(ico(0.19, 0), mHide2);
    wristG.add(knuckle);
    for (var k = 0; k < FG.length; k++) {
      wristG.add(bone([0, 0, 0], rel(FG[k], W2), 0.125 - k * 0.011, 0.035, mSpar));
    }
    w.add(bone(S, A, 0.13, 0.07, mSpar));                             // root chord
    wristG.add(bone([0, 0, 0], rel([side * 5.45, 1.18, -0.70], W2), 0.07, 0.014, mClaw));

    w.userData.mem = mem;
    w.userData.side = side;
    w.userData.elbow = elbowG;
    w.userData.wrist = wristG;

    // ---- membrane re-solve -------------------------------------------------
    // The sail is one fan of triangles whose vertices are (hub, a, b) per edge.
    // Rather than rebuild the geometry, we recompute the same vertices from the
    // live joint transforms each frame — 39 verts per wing, cheap enough to do
    // every tick and the only way the membrane can actually fold and billow.
    var posAttr = sailMesh.geometry.getAttribute('position');
    var E0 = new V3(E[0], E[1], E[2]);
    var W0 = new V3(W2[0], W2[1], W2[2]);
    var base = out.map(function (p) { return new V3(p[0], p[1], p[2]); });
    var hub0 = new V3(hub[0], hub[1], hub[2]);
    var cur = base.map(function (v) { return v.clone(); });
    var curHub = hub0.clone();
    var _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _v = new V3();

    w.userData.solve = function (billow, chordFold) {
      elbowG.updateMatrix();
      wristG.updateMatrix();
      // elbow frame, then wrist frame, both in wing-local space
      _m.copy(elbowG.matrix);
      _m2.multiplyMatrices(_m, wristG.matrix);

      for (var i = 0; i < base.length; i++) {
        var o = owner[i];
        if (o === 0) { cur[i].copy(base[i]); continue; }
        if (o === 1) {
          _v.copy(base[i]).sub(E0).applyMatrix4(_m);
          cur[i].copy(_v);
        } else {
          _v.copy(base[i]).sub(W0);
          _v.applyMatrix4(_m2);
          cur[i].copy(_v);
        }
        // aerodynamic load: the sail is pushed against the air, hardest at the
        // trailing edge where there is least structure to resist it
        var chord = base[i][3] === undefined ? 0.5 : 0;
        cur[i].y += billow * (0.35 + 0.65 * Math.abs(base[i].z / 6)) ;
      }
      _v.copy(hub0).sub(W0).applyMatrix4(_m2);
      curHub.copy(_v).lerp(hub0, 0.45);
      curHub.y += billow * 1.15;                 // the belly of the sail moves most

      var w2 = 0;
      for (var e = 0; e < base.length - 1; e++) {
        var a = cur[e], b = cur[e + 1];
        posAttr.array[w2++] = curHub.x; posAttr.array[w2++] = curHub.y; posAttr.array[w2++] = curHub.z;
        posAttr.array[w2++] = a.x; posAttr.array[w2++] = a.y; posAttr.array[w2++] = a.z;
        posAttr.array[w2++] = b.x; posAttr.array[w2++] = b.y; posAttr.array[w2++] = b.z;
      }
      posAttr.needsUpdate = true;
      sailMesh.geometry.computeVertexNormals();
    };

    return w;
  }
  var wL = wing(-1), wR = wing(1);
  body.add(wL); body.add(wR);

  // ---- legs / claws
  // Folded up against the belly the way a bird carries them in flight, built
  // from tapered bones instead of boxes so they don't read as cargo.
  var legs = [];
  [-1, 1].forEach(function (s) {
    var leg = new THREE.Group(); leg.position.set(s * 0.72, -0.62, 0.30); body.add(leg);
    legs.push(leg);
    var hipJ  = [0, 0, 0];
    var kneeJ = [s * 0.30, -0.62, -0.62];    // knee swings down and back
    var ankJ  = [s * 0.22, -0.34, -1.42];    // shin folds forward again
    var toeJ  = [s * 0.20, -0.46, -0.92];
    leg.add(bone(hipJ, kneeJ, 0.34, 0.20, mHide2, 6));
    leg.add(bone(kneeJ, ankJ, 0.20, 0.13, mHide2, 6));
    leg.add(bone(ankJ, toeJ, 0.14, 0.10, mHide2, 6));
    var knuck = mesh(ico(0.17, 0), mHide2);
    knuck.position.set(kneeJ[0], kneeJ[1], kneeJ[2]); leg.add(knuck);
    for (var c = -1; c <= 1; c++) {
      leg.add(bone(toeJ, [toeJ[0] + c * 0.16, toeJ[1] - 0.16, toeJ[2] + 0.34],
                   0.065, 0.012, mClaw, 5));
    }
  });

  // ---- tail: eight tapering segments with a ridge running down them
  var tailSegs = [];
  var tp = body, tail0 = new THREE.Group(); tail0.position.set(0, 0.08, -3.15); body.add(tail0); tp = tail0;
  var TSEG = 8;
  for (var ti = 0; ti < TSEG; ti++) {
    var ts = new THREE.Group(); ts.position.z = ti === 0 ? 0 : -0.80;
    var q0 = ti / TSEG, q1 = (ti + 1) / TSEG;
    var ra = 0.44 * Math.pow(1 - q0, 0.85) + 0.05;
    var rb = 0.44 * Math.pow(1 - q1, 0.85) + 0.05;
    ts.add(mesh(tube([
      { z:  0.00, rx: ra * 1.05, ry: ra },
      { z: -0.42, rx: (ra + rb) * 0.53, ry: (ra + rb) * 0.5 },
      { z: -0.84, rx: rb * 1.05, ry: rb }
    ], 7, cBelly, cBack), mHull));
    var fin = mesh(tet(0.30), mPlate);
    fin.position.set(0, ra * 0.92, -0.40);
    fin.rotation.set(Math.PI * 0.5, 0, Math.PI * 0.25);
    fin.scale.set(0.34, 0.5 + (1 - q0) * 0.8, 0.95);
    ts.add(fin);
    tp.add(ts); tailSegs.push(ts); tp = ts;
  }
  // tail vane
  // Tail vane: two cambered sails swept back off a central spine, so it has
  // volume from every angle instead of being a flat diamond.
  var tailFin = new THREE.Group();
  [1, -1].forEach(function (sv) {
    var spine = [0, 0.02, 0.05];
    var tip   = [sv * 0.72, 0.92, -0.95];
    var out   = [
      [spine[0], spine[1], spine[2], 0.15],
      [tip[0], tip[1], tip[2], 0.35],
      [sv * 0.46, 0.44, -1.72, 0.85],
      [sv * 0.14, 0.10, -2.05, 1.0],
      [0, 0.02, -1.55, 0.7],
      [spine[0], spine[1], spine[2], 0.15]
    ];
    tailFin.add(mesh(sail(out, [sv * 0.24, 0.24, -1.05], cWingLead, cWingTrail), mSail));
    // lower lobe, smaller and swept the other way
    var out2 = [
      [0, -0.02, 0.02, 0.3],
      [sv * 0.52, -0.62, -0.86, 0.55],
      [sv * 0.20, -0.24, -1.55, 1.0],
      [0, -0.04, -1.20, 0.6],
      [0, -0.02, 0.02, 0.3]
    ];
    tailFin.add(mesh(sail(out2, [sv * 0.18, -0.22, -0.80], cWingLead, cWingTrail), mSail));
  });
  tailFin.add(bone([0, 0.02, 0.05], [0, 0.06, -1.95], 0.09, 0.02, mSpar, 5));
  tp.add(tailFin);

  // ============================================================ THE RIDER
  // A sculpted low-poly head: stacked cross-sections stitched into a skull,
  // then brow / cheekbone / nose / lip / ear detail laid on top of it.
  var rider = new THREE.Group();
  rider.position.set(0, 1.15, 0.55);
  body.add(rider);

  // modelled-rider placement, tuned against rendered gates
  var RIDER_MODEL_SCALE = 1.62, RIDER_NECK_Y = 0.80, RIDER_MODEL_Z = -0.06;

  var SKIN_OLD = 0x7d5638, SKIN_YOUNG = 0x8d6242;
  var mSkin = new THREE.MeshPhongMaterial({ color: SKIN_OLD, flatShading: true, shininess: 8, specular: 0x2a1d14 });
  P.retroPatch(mSkin);
  var mSkinLo = new THREE.MeshPhongMaterial({ color: 0x5f3f28, flatShading: true, shininess: 3 });
  P.retroPatch(mSkinLo);
  var mLine = new THREE.MeshPhongMaterial({ color: 0x4a2f1e, flatShading: true, shininess: 0 });
  P.retroPatch(mLine);
  var mHair = new THREE.MeshPhongMaterial({ color: 0xdedacd, flatShading: true, shininess: 2 });
  P.retroPatch(mHair);
  var mFleck = new THREE.MeshPhongMaterial({ color: 0x4f3220, flatShading: true, shininess: 0 });
  P.retroPatch(mFleck);
  // Armour palette, de-lit from the reference sheet: brown leather carries the
  // bulk, navy cloth is the secondary, bronze does every trim and fastener.
  var mLeather  = M(0x635648, { shine: 6, spec: 0x241a12 });
  var mLeatherD = M(0x40382f, { shine: 4 });
  var mNavy     = M(0x2b3a58, { shine: 8 });
  var mNavyDS   = M(0x2b3a58, { shine: 8, side: THREE.DoubleSide });
  var mGold     = M(0x93815a, { shine: 34, spec: 0x5a4520 });
  var mGoldDS   = M(0x93815a, { shine: 34, spec: 0x5a4520, side: THREE.DoubleSide });
  var mCoat = mNavy, mCoat2 = mLeather, mBelt = mGold;   // legacy aliases

  // A compact heraldic dragon, built from flat facets. Too small at gameplay
  // range to read as anatomy — it only has to hold a serpentine silhouette.
  // Kept deliberately blunt. At gameplay range this is ~25 px of gold; fine
  // filigree just aliases into noise, so it reads as a compact crest instead.
  var DRAGON_GLYPH = [
    [[0.06, 0.26], [0.30, 0.30], [0.32, 0.14], [0.10, 0.10]],      // head
    [[-0.08, 0.24], [0.10, 0.26], [0.08, 0.00], [-0.12, 0.02]],    // neck
    [[-0.12, 0.02], [0.10, 0.00], [0.14, -0.26], [-0.06, -0.28]],  // body
    [[-0.10, 0.16], [-0.32, 0.24], [-0.26, 0.00]],                 // wing
    [[-0.06, -0.28], [0.14, -0.26], [0.06, -0.42]]                 // tail
  ];
  function dragonGlyph(sc, mat) {
    var g = plates(DRAGON_GLYPH, 0.05, mat);
    g.scale.setScalar(sc);
    return g;
  }

  // ---- torso: a lofted armoured shell — broad chest, cinched waist, the
  //      shoulder yoke sloping in to meet the collar ------------------------
  var torso = new THREE.Group(); rider.add(torso);
  var chest = mesh(loftGeo([
    { y: -0.46, w: 0.74, d: 0.50, n: 4.6 },
    { y: -0.30, w: 0.78, d: 0.53, n: 4.6 },
    { y: -0.12, w: 0.74, d: 0.49, n: 4.6 },
    { y:  0.14, w: 0.82, d: 0.54, n: 5.0 },
    { y:  0.40, w: 0.88, d: 0.57, n: 5.0 },
    { y:  0.58, w: 0.84, d: 0.54, n: 5.0 },
    { y:  0.70, w: 0.60, d: 0.44, n: 4.2 }
  ], 10), mLeather);
  torso.add(chest);

  // central placket: four bronze buckles stepping down the sternum
  var placket = mesh(box(0.20, 0.92, 0.05), mLeatherD);
  placket.position.set(0, 0.16, 0.278); torso.add(placket);
  [[0.46, 0.302], [0.29, 0.306], [0.12, 0.300], [-0.05, 0.288]].forEach(function (b) {
    var fr = mesh(box(0.115, 0.085, 0.035), mGold);
    fr.position.set(0, b[0], b[1]); torso.add(fr);
    var hole = mesh(box(0.055, 0.04, 0.045), mLeatherD);
    hole.position.set(0, b[0], b[1] + 0.008); torso.add(hole);
  });

  // bandolier across the chest, with the ring at the sternum
  var band = mesh(box(0.125, 1.24, 0.045), mLeatherD);
  band.position.set(0.02, 0.16, 0.272); band.rotation.z = 0.44; torso.add(band);
  var bandRing = mesh(tor(0.085, 0.024, 4, 10), mGold);
  bandRing.position.set(0.055, 0.315, 0.318); torso.add(bandRing);

  // ---- shoulder mantle: a flared navy cape carrying the dragon crests -----
  // Left open in a V at the front so the buckle placket and bandolier stay
  // readable — a closed cone just swallows the whole cuirass.
  var MAN_GAP = 0.34;
  var MAN_A0 = Math.PI * 0.5 + MAN_GAP, MAN_A1 = Math.PI * 0.5 + TAU - MAN_GAP;
  var mantle = mesh(loftGeo([
    { y: 0.70, w: 0.64, d: 0.50, n: 5.0 },
    { y: 0.60, w: 1.18, d: 0.78, n: 6.0 },
    { y: 0.47, w: 1.24, d: 0.84, n: 7.5 },
    { y: 0.41, w: 1.20, d: 0.80, n: 7.5 }
  ], 14, false, false, MAN_A0, MAN_A1), mNavyDS);
  torso.add(mantle);
  var mantleTrim = mesh(loftGeo([
    { y: 0.445, w: 1.26, d: 0.86, n: 7.5 },
    { y: 0.395, w: 1.21, d: 0.81, n: 7.5 }
  ], 14, false, false, MAN_A0, MAN_A1), mGoldDS);
  torso.add(mantleTrim);
  [-1, 1].forEach(function (s) {
    var crest = dragonGlyph(0.46, mGold);
    crest.position.set(s * 0.325, 0.545, 0.375);
    crest.rotation.set(-0.12, s * 0.16, 0);
    crest.scale.x *= -s;                       // the pair faces inward
    torso.add(crest);
  });

  // ---- standing collar, open in a V at the front -------------------------
  // The sheet shows a leather collar with navy lining on the inner face, so
  // it's two nested shells rather than the single navy one I had.
  var COL_GAP = 0.62;
  var COL_A0 = Math.PI * 0.5 + COL_GAP, COL_A1 = Math.PI * 0.5 + TAU - COL_GAP;
  var mLeatherDS = M(0x635648, { shine: 6, spec: 0x241a12, side: THREE.DoubleSide });
  var collarLine = mesh(loftGeo([
    { y: 0.60, w: 0.58, d: 0.44, n: 3.0 },
    { y: 0.92, w: 0.78, d: 0.62, n: 3.0 }
  ], 12, false, false, COL_A0, COL_A1), mNavyDS);
  torso.add(collarLine);
  var collar = mesh(loftGeo([
    { y: 0.60, w: 0.63, d: 0.49, n: 3.0 },
    { y: 0.78, w: 0.73, d: 0.58, n: 3.0 },
    { y: 0.92, w: 0.83, d: 0.67, n: 3.0 }
  ], 12, false, false, COL_A0, COL_A1), mLeatherDS);
  torso.add(collar);
  var collarTrim = mesh(loftGeo([
    { y: 0.885, w: 0.82, d: 0.66, n: 3.0 },
    { y: 0.935, w: 0.85, d: 0.69, n: 3.0 }
  ], 12, false, false, COL_A0, COL_A1), mGoldDS);
  torso.add(collarTrim);

  var neckR = mesh(cyl(0.17, 0.2, 0.34, 6), mSkinLo); neckR.position.y = 0.86; rider.add(neckR);

  // ---- hips: belt, pouches, tabard, faulds --------------------------------
  var hips = new THREE.Group(); rider.add(hips);
  var belt = mesh(loftGeo([
    { y: -0.44, w: 0.90, d: 0.62, n: 4.6 },
    { y: -0.18, w: 0.93, d: 0.65, n: 4.6 }
  ], 10, false, false), M(0x40382f, { shine: 4, side: THREE.DoubleSide }));
  hips.add(belt);
  var beltBuckle = mesh(box(0.30, 0.26, 0.05), mGold);
  beltBuckle.position.set(0, -0.31, 0.335); hips.add(beltBuckle);
  var beltHole = mesh(box(0.17, 0.14, 0.06), mLeatherD);
  beltHole.position.set(0, -0.31, 0.345); hips.add(beltHole);

  [-1, 1].forEach(function (s) {
    var pouch = mesh(loftGeo([
      { y: -0.52, w: 0.22, d: 0.19, n: 3.4 },
      { y: -0.26, w: 0.24, d: 0.21, n: 3.4 }
    ], 8, true, true), mLeather);
    pouch.position.set(s * 0.44, 0, 0.20); hips.add(pouch);
    var flap = mesh(box(0.25, 0.10, 0.23), mLeatherD);
    flap.position.set(s * 0.44, -0.29, 0.20); hips.add(flap);
    var stud = mesh(box(0.05, 0.06, 0.03), mGold);
    stud.position.set(s * 0.44, -0.38, 0.31); hips.add(stud);
  });

  // faulds — brown scale panels falling either side of the tabard
  [-1, 1].forEach(function (s) {
    var f = plate([[-0.26, 0.02], [0.26, 0.06], [0.30, -0.46], [-0.22, -0.54]], 0.06, mLeather);
    f.position.set(s * 0.40, -0.42, 0.14);
    f.rotation.set(0.10, -s * 0.85, 0); hips.add(f);
  });

  // tabard — navy, gold-bordered, pointed, with the house dragon on it
  var TAB = [[-0.23, 0.02], [0.23, 0.02], [0.23, -0.52], [0, -0.72], [-0.23, -0.52]];
  var tabTrim = plate(TAB.map(function (p) { return [p[0] * 1.14, p[1] * 1.10]; }), 0.05, mGold);
  tabTrim.position.set(0, -0.36, 0.345); hips.add(tabTrim);
  var tabard = plate(TAB, 0.05, mNavy);
  tabard.position.set(0, -0.36, 0.375); hips.add(tabard);
  var tabCrest = dragonGlyph(0.40, mGold);
  tabCrest.position.set(0, -0.60, 0.405); hips.add(tabCrest);

  // ---- legs: straddling the saddle, mostly read as silhouette ------------
  [-1, 1].forEach(function (s) {
    var leg = new THREE.Group();
    leg.position.set(s * 0.30, -0.50, 0.04);
    leg.rotation.set(-0.72, 0, s * 0.22); hips.add(leg);
    var thigh = mesh(loftGeo([
      { y: -0.56, w: 0.29, d: 0.31, n: 3.0 },
      { y:  0.02, w: 0.36, d: 0.38, n: 3.0 }
    ], 8), mLeather);
    leg.add(thigh);
    var knee = new THREE.Group(); knee.position.set(0, -0.56, 0); knee.rotation.x = 1.05; leg.add(knee);
    var kneeP = plate([[-0.17, 0.10], [0.17, 0.10], [0.20, -0.08], [0, -0.22], [-0.20, -0.08]], 0.07, mLeather);
    kneeP.position.set(0, 0.02, 0.17); knee.add(kneeP);
    var kneeT = plate([[-0.20, 0.13], [0.20, 0.13], [0.23, -0.09], [0, -0.26], [-0.23, -0.09]], 0.05, mGold);
    kneeT.position.set(0, 0.02, 0.145); knee.add(kneeT);
    var shin = mesh(loftGeo([
      { y: -0.50, w: 0.30, d: 0.32, n: 3.0 },
      { y:  0.00, w: 0.32, d: 0.34, n: 3.0 }
    ], 8), mLeather);
    knee.add(shin);
    var strap = mesh(box(0.33, 0.06, 0.35), mGold);
    strap.position.y = -0.34; knee.add(strap);
    var boot = mesh(loftGeo([
      { y: -0.62, w: 0.32, d: 0.46, cz: 0.07, n: 3.6 },
      { y: -0.50, w: 0.31, d: 0.36, cz: 0.02, n: 3.4 }
    ], 8), mLeatherD);
    knee.add(boot);
  });

  // ---- the head ----------------------------------------------------------
  var headR = new THREE.Group(); headR.position.y = 1.24; rider.add(headR);
  var F = new THREE.Group(); F.scale.setScalar(0.345); headR.add(F);   // face space

  // cross-sections from chin (y=-1) to crown (y=1). Long narrow skull,
  // forward chin, high cheekbones, tall forehead.
  var HEAD_RINGS = [
    { y: -1.00, rx: 0.19, rz: 0.25, cz:  0.33 },  // chin point
    { y: -0.86, rx: 0.34, rz: 0.42, cz:  0.26 },
    { y: -0.68, rx: 0.48, rz: 0.55, cz:  0.16 },  // jaw
    { y: -0.44, rx: 0.58, rz: 0.63, cz:  0.07 },  // mouth
    { y: -0.20, rx: 0.64, rz: 0.68, cz:  0.02 },  // nose base
    { y:  0.02, rx: 0.69, rz: 0.70, cz:  0.00 },  // cheekbone
    { y:  0.22, rx: 0.67, rz: 0.69, cz: -0.02 },  // eye line
    { y:  0.40, rx: 0.66, rz: 0.68, cz: -0.03 },  // brow
    { y:  0.60, rx: 0.645,rz: 0.65, cz: -0.05 },  // forehead
    { y:  0.78, rx: 0.60, rz: 0.58, cz: -0.07 },  // temple
    { y:  0.92, rx: 0.45, rz: 0.43, cz: -0.07 },
    { y:  1.00, rx: 0.19, rz: 0.19, cz: -0.07 }
  ];
  var HN = 14;

  function surfPt(y, a, push) {
    var R = HEAD_RINGS, i;
    for (i = 0; i < R.length - 1; i++) if (y <= R[i + 1].y) break;
    var A = R[Math.min(i, R.length - 2)], B = R[Math.min(i + 1, R.length - 1)];
    var t = clamp((y - A.y) / (B.y - A.y || 1), 0, 1);
    var rx = lerp(A.rx, B.rx, t) + (push || 0);
    var rz = lerp(A.rz, B.rz, t) + (push || 0);
    var cz = lerp(A.cz, B.cz, t);
    return new V3(Math.sin(a) * rx, y, cz + Math.cos(a) * rz);
  }

  // z of the skull surface at a given height and lateral offset
  function surfZ(y, x) {
    var R = HEAD_RINGS, i;
    for (i = 0; i < R.length - 1; i++) if (y <= R[i + 1].y) break;
    var A = R[Math.min(i, R.length - 2)], B = R[Math.min(i + 1, R.length - 1)];
    var t = clamp((y - A.y) / (B.y - A.y || 1), 0, 1);
    var rx = lerp(A.rx, B.rx, t), rz = lerp(A.rz, B.rz, t), cz = lerp(A.cz, B.cz, t);
    var a = Math.asin(clamp(Math.abs(x) / Math_ch(rx), -1, 1));
    return cz + Math.cos(a) * rz;
  }
  function Math_ch(v) { return Math.max(1e-4, v); }

  // a curved slab lying on the skull — hair, beard, moustache
  function shellGeo(y0, y1, aSpan, ny, na, offFn, warp) {
    var pos = [];
    function P3(iy, ia) {
      var fy = iy / ny, fa = ia / na;
      var y = lerp(y0, y1, fy);
      var a = lerp(-aSpan, aSpan, fa);
      var v = surfPt(y, a, offFn(fy, fa));
      if (warp) warp(v, fy, fa, a);
      return [v.x, v.y, v.z];
    }
    function tri(A, B, C) { pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]); }
    for (var iy = 0; iy < ny; iy++) for (var ia = 0; ia < na; ia++) {
      var a00 = P3(iy, ia), a01 = P3(iy, ia + 1), a10 = P3(iy + 1, ia), a11 = P3(iy + 1, ia + 1);
      tri(a00, a10, a11); tri(a00, a11, a01);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }
  function shellMesh(y0, y1, aSpan, ny, na, offFn, mat, warp) {
    var mm = mesh(shellGeo(y0, y1, aSpan, ny, na, offFn, warp), mat);
    mm.material.side = THREE.DoubleSide;
    return mm;
  }
  function edgeFade(fy, fa, peak) {
    var ea = 1 - Math.pow(Math.abs(fa * 2 - 1), 2.2);
    var ey = Math.sin(Math.PI * clamp(fy, 0, 1));
    return peak * ea * (0.35 + 0.65 * ey);
  }

  var skullGeo = (function () {
    var pos = [], i, r, a, p;
    function P3(y, ang) { var v = surfPt(y, ang, 0); return [v.x, v.y, v.z]; }
    function tri(A, B, C) { pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]); }
    for (r = 0; r < HEAD_RINGS.length - 1; r++) {
      var y0 = HEAD_RINGS[r].y, y1 = HEAD_RINGS[r + 1].y;
      for (i = 0; i < HN; i++) {
        var a0 = i / HN * TAU, a1 = (i + 1) / HN * TAU;
        var v00 = P3(y0, a0), v01 = P3(y0, a1), v10 = P3(y1, a0), v11 = P3(y1, a1);
        tri(v00, v10, v11); tri(v00, v11, v01);
      }
    }
    // caps
    var bot = [0, HEAD_RINGS[0].y - 0.07, HEAD_RINGS[0].cz];
    var top = [0, 1.05, HEAD_RINGS[HEAD_RINGS.length - 1].cz];
    for (i = 0; i < HN; i++) {
      var b0 = P3(HEAD_RINGS[0].y, i / HN * TAU), b1 = P3(HEAD_RINGS[0].y, (i + 1) / HN * TAU);
      tri(bot, b1, b0);
      var t0 = P3(1.0, i / HN * TAU), t1 = P3(1.0, (i + 1) / HN * TAU);
      tri(top, t0, t1);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  })();
  var mSkull = new THREE.MeshPhongMaterial({
    color: SKIN_OLD, flatShading: true, shininess: 8, specular: 0x2a1d14, side: THREE.DoubleSide
  });
  P.retroPatch(mSkull);
  var skullR = mesh(skullGeo, mSkull); F.add(skullR);

  // ---- brow ridge, cheekbones, jaw ---------------------------------------
  var brow = mesh(box(1.02, 0.13, 0.2), mSkin);
  brow.position.set(0, 0.40, surfZ(0.40, 0.25) + 0.02); brow.rotation.x = -0.16; F.add(brow);
  [-1, 1].forEach(function (s) {
    var bb = mesh(tet(0.2), mSkin);
    bb.position.set(s * 0.42, 0.38, surfZ(0.38, 0.42) - 0.02); bb.scale.set(1.1, 0.6, 0.7); F.add(bb);
    var cheek = mesh(tet(0.26), mSkin);            // high cheekbone
    cheek.position.set(s * 0.46, 0.02, surfZ(0.02, 0.46) - 0.06);
    cheek.rotation.set(0.4, s * 0.5, 0.2); cheek.scale.set(1.0, 0.75, 0.9); F.add(cheek);
    var jaw = mesh(box(0.16, 0.34, 0.5), mSkin);   // jaw angle
    jaw.position.set(s * 0.5, -0.55, surfZ(-0.55, 0.5) - 0.24); jaw.rotation.z = s * 0.2; F.add(jaw);
    var ear = mesh(ico(0.2, 0), mSkinLo);
    ear.position.set(s * 0.70, 0.05, -0.04); ear.scale.set(0.34, 1.15, 0.75);
    ear.rotation.y = s * 0.3; F.add(ear);
    var lobe = mesh(box(0.08, 0.12, 0.11), mSkinLo);
    lobe.position.set(s * 0.70, -0.18, -0.02); F.add(lobe);
  });

  // ---- nose (authored wedge: ridge, side walls, wings) -------------------
  var noseG = new THREE.Group(); F.add(noseG);
  (function () {
    var pos = [];
    function V(x, y, dz) { return [x, y, surfZ(y, Math.abs(x)) + dz]; }
    function tri(A, B, C) { pos.push(A[0], A[1], A[2], B[0], B[1], B[2], C[0], C[1], C[2]); }
    function quad(A, B, C, D) { tri(A, B, C); tri(A, C, D); }
    var R  = V(0,     0.340, 0.020);   // bridge root, between the brows
    var M  = V(0,     0.055, 0.115);   // mid bridge
    var T  = V(0,    -0.160, 0.205);   // tip
    var B  = V(0,    -0.285, 0.085);   // under the tip
    for (var k = 0; k < 2; k++) {
      var sg = k ? 1 : -1;
      var sR = V(sg * 0.055, 0.330, 0.000);
      var sM = V(sg * 0.070, 0.050, 0.045);
      var sU = V(sg * 0.072, -0.205, 0.135);
      var sW = V(sg * 0.113, -0.243, 0.070);
      quad(R, sR, sM, M);
      quad(M, sM, sU, T);
      tri(sM, sW, sU);
      tri(T, sU, B);
      tri(B, sU, sW);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    var mm = mesh(g, mSkin); mm.material.side = THREE.DoubleSide;
    noseG.add(mm);
  })();
  [-1, 1].forEach(function (s) {
    var nostril = mesh(box(0.05, 0.035, 0.05), mLine);
    nostril.position.set(s * 0.072, -0.272, surfZ(-0.272, 0.072) + 0.10); noseG.add(nostril);
  });

  // ---- mouth --------------------------------------------------------------
  var lipUp = mesh(box(0.32, 0.065, 0.11), mSkin);
  lipUp.position.set(0, -0.36, surfZ(-0.36, 0) + 0.04); F.add(lipUp);
  var lipLo = mesh(box(0.3, 0.085, 0.12), mSkin);
  lipLo.position.set(0, -0.45, surfZ(-0.45, 0) + 0.04); F.add(lipLo);
  var mouthLine = mesh(box(0.29, 0.022, 0.05), mLine);
  mouthLine.position.set(0, -0.405, surfZ(-0.405, 0) + 0.055); F.add(mouthLine);
  var philtrum = mesh(box(0.065, 0.085, 0.05), mSkin);
  philtrum.position.set(0, -0.29, surfZ(-0.29, 0) + 0.015); F.add(philtrum);
  var chinBlk = mesh(box(0.26, 0.18, 0.1), mSkin);
  chinBlk.position.set(0, -0.66, surfZ(-0.66, 0) - 0.02); F.add(chinBlk);

  // ---- eyes ---------------------------------------------------------------
  var eyeParts = [];
  [-1, 1].forEach(function (s) {
    var socket = mesh(box(0.3, 0.2, 0.1), mSkinLo);
    socket.position.set(s * 0.27, 0.21, surfZ(0.21, 0.27) - 0.05); F.add(socket);
    var ball = mesh(ico(0.093, 0), G(0xd6c9ad, { fog: true }));
    ball.position.set(s * 0.27, 0.20, surfZ(0.20, 0.27) - 0.035); F.add(ball);
    var iris = mesh(cyl(0.048, 0.048, 0.03, 6), G(0x3a2415, { fog: true }));
    iris.rotation.x = Math.PI * 0.5;
    iris.position.set(s * 0.27, 0.20, surfZ(0.20, 0.27) + 0.05); F.add(iris);
    var pupil = mesh(cyl(0.025, 0.025, 0.02, 6), G(0x120b06, { fog: true }));
    pupil.rotation.x = Math.PI * 0.5;
    pupil.position.set(s * 0.27, 0.20, surfZ(0.20, 0.27) + 0.065); F.add(pupil);
    var lid = mesh(box(0.3, 0.09, 0.13), mSkin);       // heavy upper lid
    lid.position.set(s * 0.27, 0.30, surfZ(0.30, 0.27) + 0.015); lid.rotation.x = -0.35; F.add(lid);
    var lidLo = mesh(box(0.28, 0.05, 0.1), mSkin);
    lidLo.position.set(s * 0.27, 0.115, surfZ(0.115, 0.27) + 0.015); F.add(lidLo);
    var eyebrow = mesh(box(0.27, 0.05, 0.08), mHair);
    eyebrow.position.set(s * 0.28, 0.375, surfZ(0.375, 0.28) + 0.035); eyebrow.rotation.z = -s * 0.1; F.add(eyebrow);
    eyeParts.push({ lid: lid, ball: ball });
  });

  // ---- freckles: one merged mesh of tiny facets on cheeks and nose --------
  var freckles = (function () {
    var spots = [], i;
    var seedA = [0.34, 0.55, 0.78, 1.02, 0.46, 0.68, 0.9, 0.25];
    var seedY = [0.06, -0.02, 0.05, -0.06, -0.13, -0.09, -0.02, 0.14];
    for (i = 0; i < seedA.length; i++) {
      spots.push([seedY[i], seedA[i]]);
      spots.push([seedY[i] + 0.03, -seedA[i]]);
    }
    spots.push([0.12, 0.0]); spots.push([-0.02, 0.16]); spots.push([-0.02, -0.16]);
    var pos = [];
    for (i = 0; i < spots.length; i++) {
      var p = surfPt(spots[i][0], spots[i][1], 0.012);
      var n = p.clone().setY(p.y - 0).normalize();
      var up = new V3(0, 1, 0);
      var right = new V3().crossVectors(up, n).normalize().multiplyScalar(0.028);
      var upv = new V3().crossVectors(n, right).normalize().multiplyScalar(0.028);
      var a = p.clone().sub(right).sub(upv), b = p.clone().add(right).sub(upv);
      var c = p.clone().add(right).add(upv), d = p.clone().sub(right).add(upv);
      pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      pos.push(a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    var mm = mesh(g, mFleck); mm.material.side = THREE.DoubleSide;
    F.add(mm);
    return mm;
  })();

  // ---- age lines (scaled away as he gets younger) ------------------------
  var wrinkles = [];
  function line(w, h, d, x, y, zOff, rz, rx) {
    var mm = mesh(box(w, h, d), mLine);
    mm.position.set(x, y, surfZ(y, Math.abs(x) + w * 0.25) + zOff);
    mm.rotation.z = rz || 0; mm.rotation.x = rx || 0;
    F.add(mm); wrinkles.push(mm);
    return mm;
  }
  line(0.58, 0.024, 0.04, 0, 0.53, 0.008, 0, -0.1);
  line(0.5, 0.022, 0.04, 0, 0.61, 0.008, 0, -0.1);
  line(0.4, 0.02, 0.04, 0, 0.68, 0.008, 0, -0.1);
  [-1, 1].forEach(function (s) {
    line(0.19, 0.022, 0.05, s * 0.27, 0.095, 0.008, 0);          // eye bag
  });

  // ---- hair: a shell over the crown that recedes at the temples ----------
  var hairCap = shellMesh(0.44, 1.02, Math.PI, 6, 18,
    function (fy, fa) { return 0.05 * (0.5 + 0.5 * Math.sin(Math.PI * clamp(fy, 0, 1))) + 0.02; },
    mHair,
    function (v, fy, fa, a) {
      var front = Math.max(0, Math.cos(a));
      var recede = front * front;
      v.y = Math.min(v.y + recede * (1 - fy) * 0.47, 1.06);
      v.z -= recede * (1 - fy) * 0.075;
    });
  F.add(hairCap);
  var sideburns = [];

  // ---- moustache + close-trimmed beard, both hugging the jaw -------------
  // The reference wears a trimmed moustache and a chin patch joined to the jaw
  // by a thin line, not the full bib the old shell produced — so the chin patch
  // is narrowed and every offset pulled in tight to the skull.
  var stache = shellMesh(-0.322, -0.240, 0.35, 2, 8,
    function (fy, fa) { return edgeFade(fy, fa, 0.062); }, mHair);
  F.add(stache);
  var beard = new THREE.Group(); F.add(beard);
  var beardShell = shellMesh(-1.00, -0.50, 0.74, 6, 10,
    function (fy, fa) { return edgeFade(fy, fa, 0.050); }, mHair);
  beard.add(beardShell);
  var beardJaw = shellMesh(-0.95, -0.60, 1.30, 3, 12,
    function (fy, fa) { return edgeFade(fy, fa, 0.026); }, mHair);
  beard.add(beardJaw);

  // ---- arms ---------------------------------------------------------------
  // Each arm: navy sleeve under a plated pauldron, bronze-trimmed vambrace on
  // the forearm, fingerless glove leaving the fingertips bare.
  function buildArm(s) {
    var arm = new THREE.Group();
    arm.position.set(s * 0.62, 0.46, 0.03); torso.add(arm);

    var up = mesh(loftGeo([
      { y: -0.62, w: 0.22, d: 0.24, n: 3.6 },
      { y: -0.30, w: 0.25, d: 0.27, n: 3.6 },
      { y:  0.04, w: 0.31, d: 0.33, n: 3.8 }
    ], 8), mNavy);
    arm.add(up);

    // pauldron: a scale cap with an angular bronze lame under it
    var pauld = mesh(loftGeo([
      { y: -0.26, w: 0.42, d: 0.46, n: 9.0 },
      { y: -0.06, w: 0.48, d: 0.52, n: 9.0 },
      { y:  0.10, w: 0.40, d: 0.44, n: 8.0 }
    ], 8, false, true), mLeather);
    pauld.position.set(s * 0.05, 0.06, 0); arm.add(pauld);
    // bronze rim around the cap's lower edge — a trim ring, not a slab
    var pRim = mesh(loftGeo([
      { y: -0.30, w: 0.44, d: 0.48, n: 9.0 },
      { y: -0.24, w: 0.43, d: 0.47, n: 9.0 }
    ], 8, false, false), mGoldDS);
    pRim.position.set(s * 0.05, 0.06, 0); arm.add(pRim);
    var pLame = mesh(loftGeo([
      { y: -0.46, w: 0.38, d: 0.42, n: 8.0 },
      { y: -0.30, w: 0.43, d: 0.47, n: 8.5 }
    ], 8, false, true), mLeather);
    pLame.position.set(s * 0.05, 0.06, 0); arm.add(pLame);
    var pauldTrim = plate([[-0.27, 0.06], [0.27, 0.06], [0.23, -0.10], [-0.23, -0.10]], 0.05, mGold);
    pauldTrim.position.set(s * 0.05, -0.20, 0.02);
    pauldTrim.rotation.y = s * Math.PI * 0.5; arm.add(pauldTrim);
    var lame = plate([[-0.24, 0.08], [0.24, 0.08], [0.20, -0.16], [-0.20, -0.16]], 0.06, mLeather);
    lame.position.set(s * 0.10, -0.30, 0.01);
    lame.rotation.y = s * Math.PI * 0.5; arm.add(lame);

    var fore = new THREE.Group();
    fore.position.set(0, -0.62, 0); fore.rotation.x = -0.78; arm.add(fore);
    var vamb = mesh(loftGeo([
      { y: -0.46, w: 0.21, d: 0.22, n: 3.2 },
      { y:  0.00, w: 0.27, d: 0.28, n: 3.2 }
    ], 8), mLeather);
    fore.add(vamb);
    [-0.06, -0.30].forEach(function (y) {
      var ring = mesh(box(0.26, 0.045, 0.27), mGold);
      ring.position.y = y; fore.add(ring);
    });
    var glove = mesh(loftGeo([
      { y: -0.66, w: 0.20, d: 0.20, n: 3.2 },
      { y: -0.48, w: 0.22, d: 0.23, n: 3.2 }
    ], 8), mLeatherD);
    fore.add(glove);
    var tips = mesh(box(0.19, 0.09, 0.18), mSkin);
    tips.position.y = -0.73; fore.add(tips);
    return { arm: arm, fore: fore };
  }
  var aL = buildArm(-1), aR = buildArm(1);
  var armL = aL.arm, armR = aR.arm;
  // the cannon rides in the right glove, so it follows the forearm's angle
  var gun = new THREE.Group(); gun.position.set(0, -0.72, 0.06);
  gun.rotation.x = 0.78; aR.fore.add(gun);
  var gunBody = mesh(box(0.24, 0.26, 0.8), M(0x3a3f4a, { shine: 30, spec: 0x778 }));
  gunBody.position.z = 0.25; gun.add(gunBody);
  var gunTip = mesh(cyl(0.1, 0.15, 0.4, 6), M(0x6d7480, { shine: 40 }));
  gunTip.rotation.x = Math.PI * 0.5; gunTip.position.z = 0.75; gun.add(gunTip);
  var muzzle = mesh(oct(0.34), G(0xfff0a0, { transparent: true, opacity: 0.9, depthWrite: false }));
  muzzle.position.z = 0.95; muzzle.visible = false; gun.add(muzzle);
  // Slimmer, lower saddle — the old slab sat above the rider's belt line and
  // swallowed the whole hip assembly.
  var saddle = mesh(loftGeo([
    { y: -0.11, w: 0.98, d: 1.30, n: 3.4 },
    { y:  0.06, w: 1.10, d: 1.46, n: 3.6 },
    { y:  0.13, w: 0.92, d: 1.30, n: 3.4 }
  ], 10), M(0x5b3a26));
  saddle.position.set(0, 0.84, 0.5); body.add(saddle);
  var cantle = plate([[-0.44, -0.10], [0.44, -0.10], [0.34, 0.24], [-0.34, 0.24]], 0.10, M(0x4a2f1e));
  cantle.position.set(0, 0.98, -0.10); cantle.rotation.x = -0.22; body.add(cantle);

  // ---------------------------------------------------------- age morphing
  var cSkinOld = new THREE.Color(SKIN_OLD), cSkinYoung = new THREE.Color(SKIN_YOUNG);
  var cHairOld = new THREE.Color(0xdedacd), cHairYoung = new THREE.Color(0x201a15);
  function setAge(age) {
    // 89 = ancient, 25 = young
    var t = clamp((89 - age) / (89 - 25), 0, 1);
    mHair.color.copy(cHairOld).lerp(cHairYoung, t);
    mSkin.color.copy(cSkinOld).lerp(cSkinYoung, t);
    mSkull.color.copy(cSkinOld).lerp(cSkinYoung, t);
    // beard recedes to stubble
    var bs = lerp(1, 0.42, t);
    beard.scale.set(lerp(1, 0.82, t), bs, lerp(1, 0.8, t));
    beard.position.y = (1 - bs) * 0.16;
    stache.scale.set(1, lerp(1, 0.7, t), 1);
    // hair fills back in at the temples
    hairCap.scale.set(1, lerp(1, 1.05, t), 1);
    hairCap.position.y = lerp(0, -0.04, t);
    for (var i = 0; i < sideburns.length; i++) sideburns[i].scale.y = lerp(1, 1.3, t);
    // lines fade
    for (var w = 0; w < wrinkles.length; w++) wrinkles[w].scale.setScalar(lerp(1, 0.02, t));
    // heavy lids lift
    for (var e = 0; e < eyeParts.length; e++) {
      eyeParts[e].lid.rotation.x = lerp(-0.35, -0.62, t);
      eyeParts[e].lid.position.y = lerp(0.30, 0.335, t);
    }
    // posture straightens
    torso.rotation.x = lerp(0.19, -0.02, t);
    rider.position.y = lerp(1.08, 1.18, t);
    headR.position.z = lerp(0.16, 0.0, t);
    neckR.scale.y = lerp(1, 1.1, t);
  }
  setAge(89);

  // ---------------------------------------------------- flight model + rig
  // The wingbeat is driven by how hard the dragon is working: climbing costs
  // effort (fast, deep, powered beats), diving costs none (wings lock out and
  // it glides). A damped spring turns each downstroke into a real lift bob.
  var cycT = 0, periodJit = 0, beatFired = false;
  // wing joint state: e/r are elbow and wrist angles, eV/rV their velocities,
  // bil the current membrane load. WK is stiffness, WC damping — tuned so the
  // wingtip settles in roughly one beat without ringing.
  var WK = 190, WC = 17;
  // ZK/ZC govern the stroke-axis whip — softer than the fold springs, so the
  // tip visibly trails the beat instead of snapping level with it.
  var ZK = 120, ZC = 9;
  var wJ = [
    { e: 0, eV: 0, r: 0, rV: 0, z: 0, zV: 0, rz: 0, rzV: 0, bil: 0 },
    { e: 0, eV: 0, r: 0, rV: 0, z: 0, zV: 0, rz: 0, rzV: 0, bil: 0 }
  ];
  var wPrev = 0, wingV = 0;
  var effort = 0.25, bob = 0, bobV = 0, surge = 0, surgeV = 0;
  var pitchAim = 0, lastW = 0;
  // maneuver dynamics: pitch and roll are sprung (they overshoot and settle
  // instead of easing), and gLoad is the low-passed vertical acceleration —
  // the "pull" you feel hauling out of a dive.
  var pitchAimV = 0, rollV = 0, gLoad = 0, prevVyG = 0;

  // ---- tail: a lagging spring chain ------------------------------------
  // Each joint keeps its own heading when the joint ahead of it turns, then
  // springs back into line. The result is a travelling wave down the tail:
  // it trails behind the body and whips, instead of steering with it.
  var TN = tailSegs.length;
  var tY = new Float32Array(TN), tVY = new Float32Array(TN);
  var tX = new Float32Array(TN), tVX = new Float32Array(TN);
  var prevRootYaw = 0, prevBodyYaw = 0, prevBodyPitch = 0, prevBodyRoll = 0;

  function sm(t) { return t * t * (3 - 2 * t); }
  // One flap, normalised 0..1. Begins and ends at 0 = wings held out level,
  // so between flaps the dragon simply glides instead of freezing mid-stroke.
  //   0.00-0.18  raise      0 -> +1
  //   0.18-0.50  power down +1 -> -1   (the fast bit that makes lift)
  //   0.50-1.00  recover    -1 -> 0
  function beat(ph) {
    if (ph < 0.18) return sm(ph / 0.18);
    if (ph < 0.50) return 1 - 2 * sm((ph - 0.18) / 0.32);
    return -1 + sm((ph - 0.50) / 0.50);
  }

  var api = {
    root: root, body: body, rider: rider, head: head, gun: gun, muzzle: muzzle,
    headR: headR, face: F, setAge: setAge, wings: [wL, wR], tail: tailSegs,
    muzzleT: 0, onBeat: null,
    getEffort: function () { return effort; },
    getPhase: function () { return cycT; },
    getBob: function () { return bob; },
    getSurge: function () { return surge; }
  };

  api.update = function (dt, t, st) {
    var vy = st.vy || 0;
    var vyN = clamp(vy / 44, -1, 1);              // -1 diving .. +1 climbing
    var boost = st.boost || 0;

    // ---- effort: climbing is work, gliding down is free ------------------
    var effortT = clamp(0.24 + vyN * 1.05 + boost * 0.3, 0, 1.5);
    effort = damp(effort, effortT, 3.2, dt);      // muscles lag the intent
    var eN = clamp(effort / 1.5, 0, 1);

    // ---- g-load: rate of change of climb speed, low-passed ----------------
    var dvyG = ((st.vy || 0) - prevVyG) / Math.max(dt, 1e-4);
    prevVyG = st.vy || 0;
    gLoad = damp(gLoad, clamp(dvyG / 60, -1.4, 1.4), 6, dt);

    // ---- wingbeat: a flap takes a fixed ~0.4s no matter how often it comes,
    // so at low effort the dragon holds a glide and flaps only occasionally.
    var rate = 0.12 + 2.6 * Math.pow(effort, 1.35);   // beats/sec
    var period = 1 / rate + periodJit;
    var flapDur = Math.min(period * 0.95, 0.34 + effort * 0.10);
    cycT += dt;
    if (cycT >= period) {
      cycT -= period; if (cycT < 0 || cycT > period) cycT = 0;
      beatFired = false;
      // idle flaps shouldn't be metronomic
      periodJit = effort < 0.4 ? rand(0, 1.4) : 0;
    }
    var ph = cycT / flapDur;
    var w = ph >= 1 ? 0 : beat(ph);
    var stroking = ph >= 0.18 && ph < 0.5;        // the powered part of the beat

    // the power stroke shoves the body up and forward
    if (stroking && !beatFired) {
      beatFired = true;
      var power = 0.55 + effort * 1.2;
      bobV += 1.95 * power;
      surgeV += 1.05 * power;
      if (api.onBeat) api.onBeat(power, effort);
    }
    bobV -= bob * 30 * dt; bobV *= Math.exp(-4.4 * dt);
    bob += bobV * dt; bob = clamp(bob, -0.45, 0.6);
    surgeV -= surge * 40 * dt; surgeV *= Math.exp(-7 * dt);
    surge += surgeV * dt; surge = clamp(surge, -0.3, 0.3);

    // ---- wing pose: driven joints + second-order dynamics -----------------
    // The shoulder is driven directly by the beat. The elbow and wrist are NOT:
    // they are sprung masses that chase a target, so they lag on the way down
    // and overshoot at the top of the stroke. That lag is what reads as the
    // wing having weight. Same integrator as the tail chain.
    var amp = 0.30 + effort * 0.45;               // stroke depth
    var rest = 0.20 - eN * 0.16;                  // gliding wings sit flatter
    var sweep = (1 - eN) * 0.17;                  // and sweep back
    var flutter = (1 - eN) * 0.014;               // airflow judder in a glide
    var bank = (st.strafeX || 0) * 0.16;          // outer wing extends in a turn

    // stroke velocity, signed: negative on the downstroke (wing driving down)
    var wV = (w - wPrev) / Math.max(dt, 1e-4); wPrev = w;
    wingV = damp(wingV, wV, 22, dt);

    // Real flapping folds on the upstroke: flexing the elbow and wrist cuts
    // wing area so the recovery stroke costs less than the power stroke.
    // ph<0.5 is the downstroke here, so fold tracks the back half.
    var upStroke = clamp((ph - 0.5) / 0.5, 0, 1) * (ph < 1 ? 1 : 0);
    var fold = upStroke * (0.55 + eN * 0.35);
    // dive: wings rake back into a tuck the steeper he drops; the sweep is the
    // silhouette of a stooping raptor, not a parachute
    var diveN = Math.max(0, -vyN) * (1 - eN);
    var climbN = Math.max(0, vyN);
    var sweepT = sweep + diveN * 0.34;

    for (var wi = 0; wi < 2; wi++) {
      var W = wi ? wR : wL, sgn = wi ? -1 : 1, J = wJ[wi];

      // the wing INSIDE a turn folds and sweeps back while the outer one
      // stretches — a bird steers by killing lift on one side, and the span
      // asymmetry is the whole visual. Computed FIRST: both the shoulder
      // sweep and the elbow/wrist folds below consume it.
      // NB the rig's wing(-1) extends toward world -X, which the chase camera
      // (looking +Z) shows on screen-RIGHT — so the sign here is the reverse
      // of what the variable names suggest. strafeX>0 = turning screen-right
      // = fold the -X wing.
      var tuck = Math.max(0, (st.strafeX || 0) * sgn);
      var extend = Math.max(0, (st.strafeX || 0) * -sgn) * 0.20;

      // --- driven shoulder
      var flutterN = Math.sin(t * (wi ? 21.7 : 21.0)) * flutter;
      W.rotation.z = sgn * (rest + w * amp) + bank + sgn * flutterN;
      W.rotation.x = w * (0.10 + eN * 0.06) + (1 - eN) * 0.06 + climbN * 0.09;
      W.rotation.y = sgn * (-0.10 + w * 0.10) + sgn * (sweepT + tuck * 0.30);

      // --- sprung elbow and wrist.  a'' = -k(a - target) - c*a'
      var eT = -fold * 0.95 + wingV * 0.028 - tuck * 0.85 + extend * 0.35 - diveN * 0.40;
      var rT = -fold * 1.25 - wingV * 0.045 - tuck * 0.80 + extend * 0.25 - diveN * 0.50;
      J.eV += ((eT - J.e) * WK - J.eV * WC) * dt;  J.e += J.eV * dt;
      J.rV += ((rT - J.r) * WK * 0.82 - J.rV * WC * 0.9) * dt;  J.r += J.rV * dt;
      J.e = clamp(J.e, -1.35, 0.30);
      J.r = clamp(J.r, -1.55, 0.35);

      // Stroke-axis whip: the outer wing chases the shoulder's stroke with a
      // lag, so mid-downstroke the tip is still up and mid-upstroke it still
      // hangs low. Same axis as the shoulder drive (z), same sign convention,
      // target opposing the stroke VELOCITY — this is what breaks the
      // one-solid-slab read. The wrist rides on the elbow, so its angle
      // compounds and the tip whips roughly 2.5x the elbow's flex.
      var zT = clamp(-wingV * 0.115 - gLoad * 0.16, -0.50, 0.50);
      J.zV  += ((zT - J.z) * ZK - J.zV * ZC) * dt;          J.z  += J.zV * dt;
      J.rzV += ((zT * 1.5 - J.rz) * ZK * 0.75 - J.rzV * ZC) * dt; J.rz += J.rzV * dt;
      J.z  = clamp(J.z, -0.42, 0.42);
      J.rz = clamp(J.rz, -0.60, 0.60);

      // tuck lands on the yaw hinges directly as well as through the sprung
      // fold — the spring alone caps out too shallow to read on screen
      W.userData.elbow.rotation.y = sgn * (J.e * 0.72 - tuck * 0.55);
      W.userData.elbow.rotation.x = J.e * 0.34;
      W.userData.elbow.rotation.z = sgn * J.z;
      W.userData.wrist.rotation.y = sgn * (J.r * 0.85 - tuck * 0.60);
      W.userData.wrist.rotation.x = J.r * 0.30;
      W.userData.wrist.rotation.z = sgn * J.rz;

      // --- quasi-steady aerodynamic load on the membrane.
      // Lift on a thin sail goes as (relative airspeed)^2 times angle of attack.
      // The membrane can only push back in tension, so it bulges away from the
      // direction of travel: up under the power stroke, inverted on recovery.
      var vRel = 0.55 + eN * 0.85;                       // forward airspeed proxy
      var aoa  = -wingV * 0.16 - vyN * 0.25;             // angle of attack
      var load = clamp(vRel * vRel * aoa + gLoad * 0.55, -1.8, 1.8);
      J.bil += (load * 0.30 - J.bil) * Math.min(1, dt * 14);
      W.userData.solve(J.bil, fold);
    }
    // ---- body ------------------------------------------------------------
    // g-sag: hauling out of a dive presses him down between his own wings;
    // pushing over into one floats him up off the saddle line
    body.position.y = bob - gLoad * 0.30;
    body.position.z = surge;
    // roll is a spring, not an ease — it overshoots a few degrees and settles,
    // which is what a real roll input does
    var rollT = (st.strafeX || 0) * 0.34 + w * eN * 0.022;   // each power stroke rocks him
    rollV += ((rollT - body.rotation.z) * 26 - rollV * 7.5) * dt;
    body.rotation.z += rollV * dt;
    // nose up on the climb, nose down in the dive
    // ---- legs: tucked hard when working, dangling loose in a glide --------
    // A bird pulls its feet up under power and lets them hang when it coasts;
    // pulling g swings them aft. Whole-group rotation — the joints are baked.
    for (var li = 0; li < legs.length; li++) {
      var legT = -0.16 * eN                                   // tuck under power
               + (1 - eN) * (0.09 + Math.sin(t * 1.25 + li * 2.1) * 0.05)  // loose sway
               + gLoad * 0.14;                                 // trail under g
      legs[li].rotation.x = damp(legs[li].rotation.x, legT, 5, dt);
    }

    // pitch: sprung with mild overshoot, target steeper than before, and a
    // banked turn drops the nose a touch (the coordinated-turn pitch coupling)
    var pitchT = -vyN * 0.46 + body.rotation.z * body.rotation.z * 0.35;
    pitchAimV += ((pitchT - pitchAim) * 20 - pitchAimV * 6.5) * dt;
    pitchAim += pitchAimV * dt;
    pitchAim = clamp(pitchAim, -0.62, 0.55);
    body.rotation.x = pitchAim + (stroking ? -0.03 : 0.014);
    // no body yaw: the camera pans the turn, the dragon holds its line
    body.rotation.y = damp(body.rotation.y, 0, 5, dt);

    // ---- neck: reaches forward in a dive, rears up on a climb ------------
    for (var i = 0; i < necks.length; i++) {
      var lag = i * 0.5;
      necks[i].rotation.y = Math.sin(t * 1.4 - lag) * 0.06 - (st.strafeX || 0) * 0.09;
      necks[i].rotation.x = Math.sin(t * 1.9 - i * 0.4) * 0.035 - 0.03
                          - vyN * 0.05 - w * 0.02 * eN
                          + gLoad * 0.045 * (i + 1);
    }
    head.rotation.x = Math.sin(t * 1.2) * 0.05 - vyN * 0.10;
    // the head looks INTO the turn before the body comes around — the tell
    // every animal gives before it changes direction
    head.rotation.y = damp(head.rotation.y, -(st.strafeX || 0) * 0.30, 4.5, dt);

    // ---- tail: lagging chain + organic waver ------------------------------
    // How much the dragon rotated this frame. The tail doesn't get told about
    // the turn — it only feels it as its parent moving out from under it.
    var dRoot  = P.angDelta(prevRootYaw, root.rotation.y);   prevRootYaw  = root.rotation.y;
    var dYaw   = body.rotation.y - prevBodyYaw;              prevBodyYaw  = body.rotation.y;
    var dPitch = body.rotation.x - prevBodyPitch;            prevBodyPitch = body.rotation.x;
    var dRoll  = body.rotation.z - prevBodyRoll;             prevBodyRoll = body.rotation.z;

    // rotation handed down the chain, plus drag from sideways/vertical travel
    var wY = clamp(dRoot * 0.5 + dYaw, -0.2, 0.2) + (st.strafeX || 0) * dt * 2.4;
    var wX = clamp(dPitch, -0.2, 0.2) + vyN * dt * 1.4 - bobV * dt * 0.05;
    var K = 44, D = 6.5, INER = 0.88;

    for (var j = 0; j < TN; j++) {
      // inertia: hold world heading while the parent swings away
      tY[j] -= wY * INER;
      tX[j] -= wX * INER;
      var oy = tY[j], ox = tX[j];
      // spring back into line with the parent
      tVY[j] += (-tY[j]) * K * dt;  tVY[j] *= Math.exp(-D * dt);
      tVX[j] += (-tX[j]) * K * dt;  tVX[j] *= Math.exp(-D * dt);
      tY[j] += tVY[j] * dt;  tX[j] += tVX[j] * dt;
      tY[j] = clamp(tY[j], -0.34, 0.34);
      tX[j] = clamp(tX[j], -0.30, 0.30);
      // a slow waver from two incommensurate frequencies, so it never repeats
      var wav1 = Math.sin(t * 1.31 + j * 0.74) * 0.55 + Math.sin(t * 0.57 + j * 1.27) * 0.45;
      var wav2 = Math.sin(t * 0.97 + j * 1.11) * 0.60 + Math.sin(t * 1.73 + j * 0.41) * 0.40;
      var amp = (0.030 + eN * 0.045) * (0.55 + j / TN);   // freer toward the tip
      tailSegs[j].rotation.y = tY[j] + wav1 * amp;
      tailSegs[j].rotation.x = tX[j] + wav2 * amp * 0.7 + 0.014;  // hangs a little
      tailSegs[j].rotation.z = -dRoll * 0.5 * (1 - j / TN);       // lags the roll too
      // this joint's own swing is what the next one feels
      wY += tY[j] - oy;
      wX += tX[j] - ox;
    }

    // ---- rider aims the cannon toward the reticle ------------------------
    armR.rotation.x = damp(armR.rotation.x, -0.35 + st.aimY * 0.5, 9, dt);
    armR.rotation.z = damp(armR.rotation.z, -st.aimX * 0.55, 9, dt);
    rider.rotation.y = damp(rider.rotation.y, st.aimX * 0.35, 8, dt);
    rider.rotation.x = damp(rider.rotation.x, -pitchAim * 0.55, 7, dt);   // stays upright
    headR.rotation.y = st.aimX * 0.4;
    headR.rotation.x = -st.aimY * 0.3 + Math.sin(t * 0.8) * 0.02;

    if (api.muzzleT > 0) { api.muzzleT -= dt; muzzle.visible = true;
      muzzle.scale.setScalar(0.6 + Math.random() * 0.9); muzzle.rotation.z += dt * 20; }
    else muzzle.visible = false;
  };

  // ------------------------------------------------- swap in the modelled rider
  // The baked model replaces the procedural rider entirely, head included — the
  // likeness is the whole point of supplying it. The procedural head is hidden
  // but its transform node (headR) is kept, because the intro camera reads its
  // world position and the aim code writes its rotation; both are forwarded to
  // the model's Head bone. setAge() is re-derived below against what a static
  // mesh can actually do.
  if (P.riderModel) {
    var RM = P.riderModel;
    RM.pose({ lean: 0 });

    var gunSet = {};
    gun.traverse(function (o) { gunSet[o.uuid] = 1; });
    [torso, hips].forEach(function (grp) {
      grp.traverse(function (o) { if (o.isMesh && !gunSet[o.uuid]) o.visible = false; });
    });
    headR.traverse(function (o) { if (o.isMesh) o.visible = false; });

    var mRoot = new THREE.Group();
    mRoot.add(RM.mesh);
    // model is ~1.7 units standing; the rider frame wants a ~0.71 head, so it
    // comes in at roughly 2.6x. Hips land on the saddle, not at the origin.
    mRoot.scale.setScalar(RIDER_MODEL_SCALE);
    rider.add(mRoot);
    // Align by the neck bone rather than a hand-tuned Y: re-posing the legs
    // changes the bounding box, so any fixed offset drifts. This pins the
    // collar to the sculpted head's chin whatever the pose does.
    (function () {
      mRoot.position.set(0, 0, RIDER_MODEL_Z);
      rider.updateMatrixWorld(true);
      var neck = RM.bones.neck || RM.bones.Head || RM.bones.Spine02;
      if (neck) {
        var w = new THREE.Vector3();
        neck.getWorldPosition(w);
        var inv = new THREE.Matrix4().copy(rider.matrixWorld).invert();
        w.applyMatrix4(inv);
        mRoot.position.y = RIDER_NECK_Y - w.y;
      }
    })();

    // headR is what the intro camera targets and what the aim code rotates, so
    // it has to sit on the model's actual head. Every pose change moves that
    // bone, so this is a function called after each one rather than a one-off:
    // setting it once left the camera aimed where the head was before the
    // riding pose, i.e. at the top of the skull.
    var _hw = new THREE.Vector3(), _hi = new THREE.Matrix4();
    function syncHeadNode() {
      var hb = RM.bones.Head;
      if (!hb) return;
      rider.updateMatrixWorld(true);
      hb.getWorldPosition(_hw);
      _hi.copy(rider.matrixWorld).invert();
      _hw.applyMatrix4(_hi);
      headR.position.copy(_hw);
    }

    api.riderMesh = RM.mesh;
    api.riderBones = RM.bones;

    // Forward the aim look onto the model's head bone, then snap headR onto
    // wherever that bone actually ended up. headR is what the intro camera
    // targets, and setting it once at build time left it aiming at where the
    // head was BEFORE the riding pose moved it — so the camera framed the top
    // of the skull instead of the face.
    var _upd = api.update;
    var riderBaseY = 0;
    api.update = function (st, dt, t) {
      _upd(st, dt, t);
      // saddle dynamics: the rider is a passenger with mass, not a bolt-on.
      // He lags the wingbeat bounce, sinks under g, leans into the bank and
      // braces forward when the dragon pulls hard.
      if (riderBaseY) {
        rider.position.y = riderBaseY - clamp(bobV, -3, 3) * 0.035 - gLoad * 0.11;
      }
      rider.rotation.z = damp(rider.rotation.z, (st.strafeX || 0) * 0.11, 6, dt);
      rider.rotation.x += gLoad * 0.07;                         // brace on the pull
      // gaze stabilisation: eyes hold the horizon while the body pitches
      RM.turn('Head', headR.rotation.x * 0.5 + RM.headLift - pitchAim * 0.45,
              headR.rotation.y * 0.8, 0);
      syncHeadNode();
    };

    // setAge, re-derived for a static mesh. Beard bulk and wrinkle strips were
    // procedural geometry and are simply gone; what survives is the spine
    // straightening and the hair going from white back to black, which is the
    // cue that actually reads at gameplay range. Doing it honestly rather than
    // pretending the old morph still runs.
    var _setAge = setAge;
    setAge = function (age) {
      _setAge(age);                        // still drives the hidden sculpt
      var t = clamp((89 - age) / (89 - 25), 0, 1);
      RM.pose({ lean: lerp(1, 0, t) });
      RM.setHairAge(t);
      RM.turn('Head', RM.headLift, 0, 0);
      syncHeadNode();
      riderBaseY = rider.position.y;      // dynamics oscillate around the age posture
    };
    api.setAge = setAge;
    setAge(89);
  }

  return api;
}

// ================================================================ ENEMIES
var ENEMY_DEFS = {
  wasp: {
    hp: 2, radius: 2.4, scale: 1.5, score: 100, deAge: 0.06, speed: 26, fireRate: 2.4, bulletSpeed: 62,
    build: function () {
      var g = new THREE.Group();
      var b = mesh(oct(1.15), M(0x6c4f8f, { shine: 18, spec: 0x554070 })); b.scale.set(1, 0.72, 1.5); g.add(b);
      var hd = mesh(oct(0.62), M(0x3d2b58)); hd.position.z = 1.25; g.add(hd);
      var eye = mesh(oct(0.3), G(0xff5c3c)); eye.position.z = 1.7; eye.scale.set(1, 0.6, 0.8); g.add(eye);
      [-1, 1].forEach(function (s) {
        var w = mesh(box(2.3, 0.1, 0.85), M(0x9d7ac4, { side: THREE.DoubleSide }));
        w.position.set(s * 1.5, 0.42, -0.2); w.rotation.z = s * 0.25; g.add(w);
        var w2 = mesh(box(1.5, 0.09, 0.6), M(0x7a5da0, { side: THREE.DoubleSide }));
        w2.position.set(s * 1.1, 0.2, -1.0); w2.rotation.z = s * 0.4; g.add(w2);
      });
      var t = mesh(cone(0.42, 1.3, 5), M(0x3d2b58));
      t.rotation.x = -Math.PI * 0.5; t.position.z = -1.5; g.add(t);
      return g;
    }
  },
  ray: {
    hp: 3, radius: 3.1, scale: 1.4, score: 150, deAge: 0.08, speed: 40, fireRate: 3.2, bulletSpeed: 58,
    build: function () {
      var g = new THREE.Group();
      var b = mesh(oct(1.9), M(0x2f7f86, { shine: 20 })); b.scale.set(2.1, 0.28, 1.15); g.add(b);
      var c = mesh(oct(0.7), M(0x1b4f56)); c.position.z = 0.4; c.scale.set(1, 0.7, 1.3); g.add(c);
      var e = mesh(oct(0.34), G(0xffe066)); e.position.z = 1.1; g.add(e);
      [-1, 1].forEach(function (s) {
        var f = mesh(cone(0.5, 1.9, 4), M(0x2f7f86));
        f.position.set(s * 3.1, 0.25, -0.3); f.rotation.z = -s * 1.2; g.add(f);
      });
      var t = mesh(box(0.24, 0.24, 3.0), M(0x1b4f56)); t.position.z = -2.0; g.add(t);
      return g;
    }
  },
  turret: {
    hp: 4, radius: 3.2, scale: 1.6, score: 200, deAge: 0.10, speed: 0, fireRate: 2.0, bulletSpeed: 70,
    build: function () {
      var g = new THREE.Group();
      var base = mesh(cyl(2.0, 2.6, 1.6, 6), M(0x6b5a44)); base.position.y = 0.8; g.add(base);
      var mid = mesh(cyl(1.2, 1.6, 1.4, 6), M(0x4d4132)); mid.position.y = 2.2; g.add(mid);
      var dome = mesh(ico(1.3), M(0x8a7048, { shine: 24 })); dome.position.y = 3.2; g.add(dome);
      var eye = mesh(oct(0.5), G(0xff4a2a)); eye.position.set(0, 3.3, 1.05); eye.scale.set(1, 0.7, 0.6); g.add(eye);
      [-1, 1].forEach(function (s) {
        var bar = mesh(box(0.28, 0.28, 2.4), M(0x2f2a22));
        bar.position.set(s * 0.6, 3.1, 1.5); g.add(bar);
      });
      return g;
    }
  },
  chaser: {
    hp: 3, radius: 2.6, scale: 1.5, score: 180, deAge: 0.09, speed: 46, fireRate: 1.7, bulletSpeed: 72,
    build: function () {
      var g = new THREE.Group();
      var b = mesh(cone(1.05, 3.6, 5), M(0x93332f, { shine: 22, spec: 0x664040 }));
      b.rotation.x = Math.PI * 0.5; g.add(b);
      var r = mesh(cyl(1.15, 1.15, 0.5, 6), M(0x4a1c1a)); r.rotation.x = Math.PI * 0.5; r.position.z = -0.9; g.add(r);
      var e = mesh(oct(0.42), G(0xffb03a)); e.position.z = 1.5; g.add(e);
      [0, 1, 2].forEach(function (i) {
        var a = i / 3 * TAU;
        var f = mesh(box(0.2, 1.5, 1.6), M(0x6d2622));
        f.position.set(Math.cos(a) * 0.9, Math.sin(a) * 0.9, -1.2);
        f.rotation.z = a; g.add(f);
      });
      var flame = mesh(cone(0.6, 1.6, 5), G(0xff8c3a, { transparent: true, opacity: 0.8, depthWrite: false }));
      flame.rotation.x = -Math.PI * 0.5; flame.position.z = -2.2; g.add(flame);
      g.userData.flame = flame;
      return g;
    }
  },
  carrier: {
    hp: 6, radius: 3.9, scale: 1.5, score: 400, deAge: 0.14, speed: 18, fireRate: 3.6, bulletSpeed: 50, drops: 2,
    build: function () {
      var g = new THREE.Group();
      var b = mesh(dodec(2.1), M(0x4b4a6d, { shine: 30, spec: 0x8888aa })); g.add(b);
      var core = mesh(ico(1.05, 0), G(0xffd25e, { transparent: true, opacity: 0.95 })); g.add(core);
      g.userData.core = core;
      [-1, 1].forEach(function (s) {
        var arm = mesh(box(0.5, 0.5, 3.4), M(0x2f2f45)); arm.position.set(s * 2.0, 0, 0); g.add(arm);
        var pod = mesh(oct(0.75), M(0x6a6a95)); pod.position.set(s * 2.0, 0, 1.7); g.add(pod);
      });
      var ring = mesh(tor(2.9, 0.16, 4, 10), M(0x8f8fc0, { shine: 40 }));
      ring.rotation.x = Math.PI * 0.5; g.add(ring); g.userData.ring = ring;
      return g;
    }
  },
  mine: {
    hp: 1, radius: 2.5, scale: 1.4, score: 60, deAge: 0.03, speed: 0, fireRate: 0, bulletSpeed: 0,
    build: function () {
      var g = new THREE.Group();
      var b = mesh(ico(1.1), M(0x6a2f2f, { shine: 20 })); g.add(b);
      for (var i = 0; i < 6; i++) {
        var a = i / 6 * TAU;
        var sp = mesh(cone(0.22, 1.0, 4), M(0xb04a3a));
        sp.position.set(Math.cos(a) * 1.2, Math.sin(a) * 1.2, 0);
        sp.rotation.z = -a + Math.PI * 0.5; g.add(sp);
      }
      var e = mesh(oct(0.4), G(0xff3a2a)); g.add(e); g.userData.core = e;
      return g;
    }
  }
};

function buildOrb() {
  var g = new THREE.Group();
  var core = mesh(ico(0.85, 0), G(0x8ffff0, { transparent: true, opacity: 0.95 })); g.add(core);
  var shell = mesh(ico(1.5, 0), M(0x2fd8c8, { shine: 60, spec: 0xaaffff, transparent: true, opacity: 0.45 }));
  g.add(shell);
  var r1 = mesh(tor(1.9, 0.09, 4, 10), G(0xbafff4)); r1.rotation.x = Math.PI * 0.5; g.add(r1);
  var r2 = mesh(tor(1.9, 0.09, 4, 10), G(0x7fe0ff)); g.add(r2);
  g.userData.rings = [r1, r2];
  return g;
}

// =================================================================== BOSS
function buildBoss() {
  var g = new THREE.Group();
  var mHull = M(0x3b3550, { shine: 34, spec: 0x8f88bb });
  var mHull2 = M(0x241f36, { shine: 20 });
  var mGold = M(0xc8a23f, { shine: 60, spec: 0xfff0b0 });

  // central sphinx head
  var head = new THREE.Group(); g.add(head);
  var skull = mesh(box(7, 6, 6.5), mHull); head.add(skull);
  var face = mesh(box(6.2, 4.4, 1.2), mHull2); face.position.set(0, -0.4, 3.4); head.add(face);
  var brow = mesh(box(7.4, 1.1, 1.6), mGold); brow.position.set(0, 2.0, 3.1); head.add(brow);
  var chin = mesh(box(3.4, 1.6, 1.6), mGold); chin.position.set(0, -3.0, 2.6); head.add(chin);
  [-1, 1].forEach(function (s) {
    var e = mesh(box(1.7, 0.9, 0.6), G(0xff6a3a)); e.position.set(s * 1.7, 0.9, 4.0); head.add(e);
    var hd = mesh(box(2.2, 6.6, 5.0), mGold); hd.position.set(s * 4.4, -0.4, 0.4); head.add(hd);
    var hd2 = mesh(box(1.6, 3.2, 3.0), mGold); hd2.position.set(s * 5.2, -3.6, 1.0); head.add(hd2);
  });
  var crown = mesh(cone(3.0, 3.6, 5), mGold); crown.position.y = 4.4; head.add(crown);

  // clock rings
  var ring1 = mesh(tor(13, 0.7, 4, 20), mGold); ring1.rotation.x = Math.PI * 0.5; g.add(ring1);
  var ring2 = mesh(tor(17, 0.55, 4, 24), M(0x8f88bb, { shine: 50 })); g.add(ring2);
  var ring3 = mesh(tor(10, 0.5, 4, 18), M(0x6f5fa0, { shine: 40 })); ring3.rotation.y = Math.PI * 0.5; g.add(ring3);
  // numerals on ring1
  for (var i = 0; i < 12; i++) {
    var a = i / 12 * TAU;
    var nub = mesh(box(0.9, 0.9, 1.6), i % 3 === 0 ? mGold : mHull2);
    nub.position.set(Math.cos(a) * 13, 0, Math.sin(a) * 13);
    nub.rotation.y = -a; ring1.parent && g.add(nub); ring1.userData.nubs = ring1.userData.nubs || [];
    ring1.userData.nubs.push(nub);
  }

  // three weak-point cores on arms
  var cores = [];
  for (var c = 0; c < 3; c++) {
    var ang = c / 3 * TAU;
    var arm = new THREE.Group(); g.add(arm);
    var beam = mesh(box(1.1, 1.1, 9), mHull);
    beam.position.set(Math.cos(ang) * 5.5, Math.sin(ang) * 5.5, 0);
    beam.lookAt(0, 0, 0); beam.rotation.z += 0; arm.add(beam);
    var pod = new THREE.Group();
    pod.position.set(Math.cos(ang) * 11.5, Math.sin(ang) * 11.5, 1.5);
    arm.add(pod);
    var cage = mesh(oct(2.6), M(0x4a4368, { shine: 40, spec: 0xaaa, transparent: true, opacity: 0.85 }));
    pod.add(cage);
    var core = mesh(ico(1.6, 0), G(0x6affd0, { transparent: true, opacity: 0.95 }));
    pod.add(core);
    var shield = mesh(tor(3.0, 0.22, 4, 12), G(0x9affe0, { transparent: true, opacity: 0.5, depthWrite: false }));
    shield.rotation.x = Math.PI * 0.5; pod.add(shield);
    cores.push({ group: pod, core: core, cage: cage, shield: shield, hp: 200, maxHp: 200, alive: true, angle: ang });
  }

  // wings of stone
  [-1, 1].forEach(function (s) {
    var w = mesh(membrane([
      [s * 6, 2, -2], [s * 15, 8, -5], [s * 22, 4, -9], [s * 18, -3, -8], [s * 9, -4, -4]
    ]), M(0x584f7a, { side: THREE.DoubleSide, shine: 12 }));
    g.add(w);
  });

  g.scale.setScalar(2.0);
  return { group: g, head: head, rings: [ring1, ring2, ring3], cores: cores, crown: crown };
}

// ============================================================ WORLD PROPS
function buildRock(scale, col) {
  var g = new THREE.Group();
  var n = 3 + Math.floor(Math.random() * 3);
  for (var i = 0; i < n; i++) {
    var m = mesh(ico(rand(3, 8) * scale, 0), M(col, { shine: 2 }));
    m.position.set(rand(-4, 4) * scale, rand(0, 6) * scale, rand(-4, 4) * scale);
    m.rotation.set(rand(0, TAU), rand(0, TAU), rand(0, TAU));
    m.scale.set(rand(0.7, 1.3), rand(1.2, 3.2), rand(0.7, 1.3));
    g.add(m);
  }
  return g;
}
function buildSpire(h, col) {
  var g = new THREE.Group();
  var segs = 3 + Math.floor(Math.random() * 3);
  var y = 0, r = rand(4, 8);
  for (var i = 0; i < segs; i++) {
    var sh = h / segs * rand(0.8, 1.2);
    var m = mesh(cyl(r * 0.62, r, sh, 5), M(col, { shine: 2 }));
    m.position.y = y + sh / 2;
    m.rotation.y = rand(0, TAU);
    g.add(m); y += sh * 0.92; r *= 0.66;
  }
  var cap = mesh(cone(r, r * 2.2, 5), M(col, { shine: 2 })); cap.position.y = y + r; g.add(cap);
  return g;
}
function buildRuin(col) {
  var g = new THREE.Group();
  var h = rand(12, 34);
  var col1 = mesh(cyl(2.2, 2.6, h, 6), M(col, { shine: 6 })); col1.position.y = h / 2; g.add(col1);
  var cap = mesh(box(7, 1.6, 7), M(col, { shine: 6 })); cap.position.y = h + 0.8; g.add(cap);
  var base = mesh(box(8, 2, 8), M(col, { shine: 6 })); base.position.y = 1; g.add(base);
  if (Math.random() < 0.5) {
    var arch = mesh(box(14, 1.8, 3), M(col, { shine: 6 }));
    arch.position.set(rand(-6, 6), h * rand(0.5, 0.9), 0);
    arch.rotation.z = rand(-0.3, 0.3); g.add(arch);
  }
  return g;
}
function buildIsland(scale, colTop, colRock) {
  var g = new THREE.Group();
  var top = mesh(cyl(10 * scale, 8 * scale, 3 * scale, 7), M(colTop, { shine: 3 }));
  g.add(top);
  var under = mesh(cone(8 * scale, 22 * scale, 7), M(colRock, { shine: 2 }));
  under.rotation.x = Math.PI; under.position.y = -12 * scale; g.add(under);
  for (var i = 0; i < 3; i++) {
    var r = mesh(ico(rand(1.5, 3.4) * scale, 0), M(colRock, { shine: 2 }));
    r.position.set(rand(-7, 7) * scale, 2 * scale, rand(-7, 7) * scale);
    r.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3)); g.add(r);
  }
  return g;
}
function buildTower(col, col2) {
  var g = new THREE.Group();
  var h = rand(28, 70);
  var body = mesh(cyl(4.5, 6.5, h, 6), M(col, { shine: 10 })); body.position.y = h / 2; g.add(body);
  var top = mesh(cone(7.5, 12, 6), M(col2, { shine: 20 })); top.position.y = h + 6; g.add(top);
  for (var i = 0; i < 3; i++) {
    var ring = mesh(tor(6.4, 0.5, 4, 10), M(col2, { shine: 24 }));
    ring.rotation.x = Math.PI * 0.5; ring.position.y = h * (0.3 + i * 0.24); g.add(ring);
  }
  var lamp = mesh(oct(1.4), G(0xffd25e)); lamp.position.y = h + 13; g.add(lamp);
  return g;
}
function buildCloud(col) {
  var g = new THREE.Group();
  for (var i = 0; i < 5; i++) {
    var m = mesh(ico(rand(8, 18), 0), M(col, { shine: 0 }));
    m.position.set(rand(-24, 24), rand(-4, 4), rand(-18, 18));
    m.scale.set(rand(1, 2), rand(0.4, 0.7), rand(1, 2));
    m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    g.add(m);
  }
  return g;
}

P.models = {
  box: box, cone: cone, cyl: cyl, ico: ico, oct: oct, dodec: dodec, tet: tet, tor: tor,
  mesh: mesh, membrane: membrane,
  buildDragon: buildDragon, buildOrb: buildOrb, buildBoss: buildBoss,
  ENEMY_DEFS: ENEMY_DEFS,
  buildRock: buildRock, buildSpire: buildSpire, buildRuin: buildRuin,
  buildIsland: buildIsland, buildTower: buildTower, buildCloud: buildCloud
};

})();
if (window.__PFLOAD) __PFLOAD.set(0.42, 'FORGING THE DRAGON');
