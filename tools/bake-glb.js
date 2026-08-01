/* Bake a skinned .glb into a compact JS module the single-file build can inline.
 *
 * The source model is 3.9k tris with a 2048x2048 texture that is 97% of the
 * file. The game is flat-shaded and ships no assets, so instead of carrying the
 * atlas we sample it once per vertex and store the result as vertex colours.
 * Geometry is quantised to Int16 over its own bounding box; weights to Uint8.
 *
 *   node tools/bake-glb.js <in.glb> <out.js> [--name RIDER_MODEL]
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const inPath = process.argv[2];
const outPath = process.argv[3];
const nameArg = process.argv.indexOf('--name');
const VAR = nameArg > -1 ? process.argv[nameArg + 1] : 'RIDER_MODEL';

// ----------------------------------------------------------------- glb parse
const buf = fs.readFileSync(inPath);
let off = 12, json = null, bin = null;
while (off < buf.length) {
  const clen = buf.readUInt32LE(off), ctype = buf.readUInt32LE(off + 4);
  const body = buf.slice(off + 8, off + 8 + clen);
  if (ctype === 0x4E4F534A) json = JSON.parse(body.toString('utf8'));
  else if (ctype === 0x004E4942) bin = body;
  off += 8 + clen;
}
const G = json;

const CT = { 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };
const NC = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function accessor(i) {
  const a = G.accessors[i];
  const bv = G.bufferViews[a.bufferView];
  const TA = CT[a.componentType];
  const n = NC[a.type];
  const base = (bv.byteOffset || 0) + (a.byteOffset || 0);
  const stride = bv.byteStride;
  if (stride && stride !== n * TA.BYTES_PER_ELEMENT) {
    const out = new TA(a.count * n);
    for (let e = 0; e < a.count; e++) {
      const o = base + e * stride;
      for (let c = 0; c < n; c++) {
        out[e * n + c] = new TA(bin.buffer, bin.byteOffset + o + c * TA.BYTES_PER_ELEMENT, 1)[0];
      }
    }
    return out;
  }
  return new TA(bin.buffer, bin.byteOffset + base, a.count * n);
}

const prim = G.meshes[0].primitives[0];
const POS = accessor(prim.attributes.POSITION);
const UV = accessor(prim.attributes.TEXCOORD_0);
const JNT = accessor(prim.attributes.JOINTS_0);
const WGT = accessor(prim.attributes.WEIGHTS_0);
const IDX = accessor(prim.indices);
const vcount = POS.length / 3;

// ------------------------------------------------------------------ texture
// Decode the atlas with the PNG decoder already present via pngjs if available,
// else shell out. We only need per-vertex point samples, so nearest is fine.
let texW = 0, texH = 0, texPix = null;
{
  const img = G.images[0];
  const bv = G.bufferViews[img.bufferView];
  const png = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  const tmp = path.join(require('os').tmpdir(), 'bake_tex.png');
  fs.writeFileSync(tmp, png);
  const raw = path.join(require('os').tmpdir(), 'bake_tex.raw');
  const r = require('child_process').spawnSync('python3', ['-c',
    `from PIL import Image;im=Image.open(${JSON.stringify(tmp)}).convert('RGB');` +
    `open(${JSON.stringify(raw)},'wb').write(im.tobytes());print(im.size[0],im.size[1])`
  ], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('texture decode failed: ' + r.stderr);
  const dims = r.stdout.trim().split(/\s+/).map(Number);
  texW = dims[0]; texH = dims[1];
  texPix = fs.readFileSync(raw);
}
// Area-average rather than a point sample. A vertex sits on the edge of its UV
// island, so a single texel very often lands on a seam or on whatever is packed
// next door — which shows up as colour speckle across the model.
// Radius 1 (3x3), not 3: head/hand UV islands are small at this atlas packing
// and a 7x7 average smears white hair into the dark texels next to it — which
// cost ~90% of the hair verts on the first bake. The edge-graph smoothing pass
// below is the safer place to remove speckle.
const R = 1;
function sample(u, v) {
  const cx = (u - Math.floor(u)) * (texW - 1);
  const cy = (1 - (v - Math.floor(v))) * (texH - 1);
  let r = 0, g = 0, b = 0, n = 0;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
    const x = Math.max(0, Math.min(texW - 1, Math.round(cx + dx)));
    const y = Math.max(0, Math.min(texH - 1, Math.round(cy + dy)));
    const o = (y * texW + x) * 3;
    r += texPix[o]; g += texPix[o + 1]; b += texPix[o + 2]; n++;
  }
  return [r / n, g / n, b / n];
}

// --------------------------------------------------------------- quantise
let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < vcount; i++) for (let c = 0; c < 3; c++) {
  const v = POS[i * 3 + c];
  if (v < mn[c]) mn[c] = v;
  if (v > mx[c]) mx[c] = v;
}
const ext = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]];
const qpos = new Int16Array(vcount * 3);
for (let i = 0; i < vcount; i++) for (let c = 0; c < 3; c++) {
  const t = (POS[i * 3 + c] - mn[c]) / (ext[c] || 1);
  qpos[i * 3 + c] = Math.round(t * 65534) - 32767;
}
// UVs, quantised to 16 bits — needed now the atlas ships rather than being
// baked away into vertex colours.
const quv = new Uint16Array(vcount * 2);
for (let i = 0; i < vcount * 2; i++) {
  let t = UV[i];
  quv[i] = Math.max(0, Math.min(65535, Math.round(t * 65535)));
}

const rawCol = new Float32Array(vcount * 3);
for (let i = 0; i < vcount; i++) {
  const c = sample(UV[i * 2], UV[i * 2 + 1]);
  rawCol[i * 3] = c[0]; rawCol[i * 3 + 1] = c[1]; rawCol[i * 3 + 2] = c[2];
}
// one smoothing pass over the edge graph, to kill any speckle the area sample
// still let through
{
  const adj = new Array(vcount); for (let i = 0; i < vcount; i++) adj[i] = [];
  for (let t = 0; t < IDX.length; t += 3) {
    const a = IDX[t], b = IDX[t + 1], c = IDX[t + 2];
    adj[a].push(b, c); adj[b].push(a, c); adj[c].push(a, b);
  }
  const sm = new Float32Array(vcount * 3);
  for (let i = 0; i < vcount; i++) {
    let r = rawCol[i * 3], g = rawCol[i * 3 + 1], b = rawCol[i * 3 + 2], n = 1;
    for (const j of adj[i]) { r += rawCol[j * 3]; g += rawCol[j * 3 + 1]; b += rawCol[j * 3 + 2]; n++; }
    sm[i * 3] = (rawCol[i * 3] + r / n) * 0.5;
    sm[i * 3 + 1] = (rawCol[i * 3 + 1] + g / n) * 0.5;
    sm[i * 3 + 2] = (rawCol[i * 3 + 2] + b / n) * 0.5;
  }
  rawCol.set(sm);
}
const col = Buffer.alloc(vcount * 3);
for (let i = 0; i < vcount * 3; i++) col[i] = Math.max(0, Math.min(255, Math.round(rawCol[i])));
const jnt = Buffer.from(new Uint8Array(JNT.buffer, JNT.byteOffset, vcount * 4));
const wgt = Buffer.alloc(vcount * 4);
for (let i = 0; i < vcount * 4; i++) wgt[i] = Math.max(0, Math.min(255, Math.round(WGT[i] * 255)));
const idx = Buffer.from(new Uint8Array(IDX.buffer, IDX.byteOffset, IDX.length * 2));

// ------------------------------------------------------------ atlas resample
// The source atlas is 2048x2048 and 7.4MB. Baking it away into 3043 vertex
// colours destroys everything that makes the model read — dragon crests,
// buckles, scale mail. So it ships, just smaller: 768px JPEG is ~150KB of
// base64 and keeps the crests legible.
let texB64 = '';
{
  const img = G.images[0];
  const bv = G.bufferViews[img.bufferView];
  const png = bin.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength);
  const tmpIn = path.join(require('os').tmpdir(), 'atlas_in.png');
  const tmpOut = path.join(require('os').tmpdir(), 'atlas_out.jpg');
  fs.writeFileSync(tmpIn, png);
  const r = require('child_process').spawnSync('python3', ['-c',
    `from PIL import Image;im=Image.open(${JSON.stringify(tmpIn)}).convert('RGB').resize((768,768),Image.LANCZOS);` +
    `im.save(${JSON.stringify(tmpOut)},quality=85,optimize=True)`
  ], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error('atlas resample failed: ' + r.stderr);
  texB64 = fs.readFileSync(tmpOut).toString('base64');
}

// ---------------------------------------------------------------- skeleton
const skin = G.skins[0];
const IBM = accessor(skin.inverseBindMatrices);
const jointNodes = skin.joints;
const nodeToJoint = new Map(jointNodes.map((n, i) => [n, i]));
// root armature scale has to fold into joint translations (mesh POSITION is
// already in bind space and, per spec, ignores the mesh node's transform)
let armScale = 1;
(G.scenes[0].nodes || []).forEach(n => {
  const nd = G.nodes[n];
  if (nd.scale) armScale = nd.scale[0];
});
const parentOf = new Array(jointNodes.length).fill(-1);
G.nodes.forEach((nd, ni) => {
  (nd.children || []).forEach(c => {
    if (nodeToJoint.has(c) && nodeToJoint.has(ni)) parentOf[nodeToJoint.get(c)] = nodeToJoint.get(ni);
  });
});
const bones = jointNodes.map((n, i) => {
  const nd = G.nodes[n];
  const t = (nd.translation || [0, 0, 0]).map(v => v * armScale);
  return {
    name: nd.name || ('bone' + i),
    parent: parentOf[i],
    t: t.map(v => +v.toFixed(6)),
    r: (nd.rotation || [0, 0, 0, 1]).map(v => +v.toFixed(6)),
    s: (nd.scale || [1, 1, 1]).map(v => +v.toFixed(6))
  };
});
const ibm = Buffer.alloc(IBM.length * 4);
{
  // inverse bind matrices are in the armature's pre-scale space; rescale the
  // translation column to match the scaled bone translations above
  const m = Float32Array.from(IBM);
  for (let b = 0; b < m.length / 16; b++) {
    m[b * 16 + 12] *= armScale; m[b * 16 + 13] *= armScale; m[b * 16 + 14] *= armScale;
  }
  Buffer.from(new Uint8Array(m.buffer)).copy(ibm);
}

// ------------------------------------------------------------------- emit
// Raw base64, not deflate: the browser's only built-in inflate is
// DecompressionStream, which is async and would drag the whole boot path with
// it. ~34KB more for a synchronous decode is the right trade here.
function b64(b) { return b.toString('base64'); }
const out =
`/* Generated by tools/bake-glb.js from ${path.basename(inPath)} — do not edit.
   ${vcount} verts / ${IDX.length / 3} tris / ${bones.length} bones.
   Texture baked to vertex colours; no runtime asset fetch. */
window.${VAR} = {
  v: ${vcount}, tris: ${IDX.length / 3},
  min: [${mn.map(v => +v.toFixed(6))}], ext: [${ext.map(v => +v.toFixed(6))}],
  pos: "${b64(Buffer.from(new Uint8Array(qpos.buffer)))}",
  uv: "${b64(Buffer.from(new Uint8Array(quv.buffer)))}",
  tex: "${texB64}",
  jnt: "${b64(jnt)}",
  wgt: "${b64(wgt)}",
  idx: "${b64(idx)}",
  ibm: "${b64(ibm)}",
  bones: ${JSON.stringify(bones)}
};
`;
fs.writeFileSync(outPath, out);
const kb = n => (n / 1024).toFixed(1) + 'KB';
console.log('verts', vcount, 'tris', IDX.length / 3, 'bones', bones.length, 'armScale', armScale);
console.log('texture atlas', texW + 'x' + texH, '-> 768px jpeg', (texB64.length / 1024).toFixed(1) + 'KB b64');
console.log('output', outPath, kb(fs.statSync(outPath).size), 'vs source glb', kb(buf.length));
