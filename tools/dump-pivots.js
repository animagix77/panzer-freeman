// Dump the rider's joint pivots in rider-local space, so a modelled
// replacement can be authored with origins that already line up.
const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  });
  const page = await b.newPage({ viewport: { width: 600, height: 400 } });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('file://' + path.join(__dirname, '..', 'index.html'));
  await page.waitForTimeout(1500);
  await page.click('#startBtn'); await page.waitForTimeout(400);
  await page.evaluate(() => window.__PF.setIntroT(1.0));
  await page.waitForTimeout(1200);

  const out = await page.evaluate(() => {
    const P = window.__PF, T = window.THREE, d = P.dragon;
    d.root.updateMatrixWorld(true);

    // express any object's origin in the rider group's local frame
    const inv = new T.Matrix4().copy(d.rider.matrixWorld).invert();
    function local(obj) {
      const w = new T.Vector3();
      obj.getWorldPosition(w);
      const v = w.clone().applyMatrix4(inv);
      return [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)];
    }
    function findByName(root, pred) {
      const hits = [];
      root.traverse(o => { if (pred(o)) hits.push(o); });
      return hits;
    }

    const res = { riderWorldOffsetFromBody: null, pivots: {}, extents: {} };

    const bodyInv = new T.Matrix4().copy(d.body.matrixWorld).invert();
    const rw = new T.Vector3(); d.rider.getWorldPosition(rw);
    const rl = rw.clone().applyMatrix4(bodyInv);
    res.riderWorldOffsetFromBody = [+rl.x.toFixed(3), +rl.y.toFixed(3), +rl.z.toFixed(3)];

    res.pivots.rider_root = local(d.rider);
    res.pivots.head = local(d.headR);
    res.pivots.gun_socket = local(d.gun);
    res.pivots.muzzle = local(d.muzzle);

    // walk the rider subtree, recording every Group (the joints)
    const groups = findByName(d.rider, o => o.type === 'Group');
    res.groupCount = groups.length;
    res.groupOrigins = groups.map(g => local(g));

    // overall bounding box of the rider in its own local frame
    const box = new T.Box3();
    d.rider.traverse(o => {
      if (o.isMesh) {
        o.updateMatrixWorld(true);
        const g = o.geometry.clone();
        g.applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        g.computeBoundingBox();
        box.union(g.boundingBox);
        g.dispose();
      }
    });
    res.extents.min = [+box.min.x.toFixed(3), +box.min.y.toFixed(3), +box.min.z.toFixed(3)];
    res.extents.max = [+box.max.x.toFixed(3), +box.max.y.toFixed(3), +box.max.z.toFixed(3)];
    res.extents.size = [
      +(box.max.x - box.min.x).toFixed(3),
      +(box.max.y - box.min.y).toFixed(3),
      +(box.max.z - box.min.z).toFixed(3)
    ];

    // head height, measured from the face group's own bounds
    const hb = new T.Box3();
    d.headR.traverse(o => {
      if (o.isMesh) {
        o.updateMatrixWorld(true);
        const g = o.geometry.clone();
        g.applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld));
        g.computeBoundingBox();
        hb.union(g.boundingBox);
        g.dispose();
      }
    });
    res.extents.headHeight = +(hb.max.y - hb.min.y).toFixed(3);
    res.extents.headMinMaxY = [+hb.min.y.toFixed(3), +hb.max.y.toFixed(3)];

    return res;
  });

  console.log(JSON.stringify(out, null, 1));
  console.log('ERRORS', errs.length ? errs.join('\n') : 'none');
  await b.close();
})();
