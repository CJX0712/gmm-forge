// Headless self-test for gmm-forge: extract the <script id="engine"> block from
// index.html, run it in a vm context, then assert 8 hard invariants.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const m = html.match(/<script id="engine">([\s\S]*?)<\/script>/);
if (!m) { console.error('engine script not found'); process.exit(1); }

const ctx = { Math, console, isFinite, Array, Object };
vm.createContext(ctx);
vm.runInContext(m[1], ctx);
const F = ctx.__forge;

function approx(a, b, t) { return Math.abs(a - b) <= t; }
let pass = 0, fail = 0; const rows = [];
function ok(name, cond, info) {
  if (cond) { pass++; rows.push(['PASS', name, info || '']); }
  else { fail++; rows.push(['FAIL', name, info || '']); }
}

// 1) LL monotonic non-decreasing (EM theorem)
{
  const rng = F.mulberry32(99);
  const samp = F.gmmSample(rng, [0.4,0.3,0.3], [[-6,6],[6,6],[0,0]],
    [[[0.8,0],[0,0.8]],[[0.8,0],[0,0.8]],[[0.8,0],[0,0.8]]], 600);
  const res = F.gmmEM(samp.X, 3, 40, 7);
  let mono = true, dip = 0;
  for (let i = 0; i + 1 < res.history.length; i++) {
    const d = res.history[i+1] - res.history[i];
    if (d < dip) dip = d;
    if (d < -1e-4) mono = false;
  }
  ok('① LL monotonic non-decreasing (EM theorem)', mono, 'min increment ' + dip.toExponential(2));
}

// 2) 1D exact parameter recovery
{
  const rng = F.mulberry32(2024);
  const trueW = [0.5,0.5], trueM = [[-2],[2]], trueC = [[[0.36]],[[0.36]]];
  const samp = F.gmmSample(rng, trueW, trueM, trueC, 2000);
  const res = F.gmmEMBest(samp.X, 2, 40, 16, 5);
  const fitM = res.model.means.map(m => m[0]);
  const fitC = res.model.covs.map(c => c[0][0]);
  const map = [0,1].map(fi => { let bi=0, bd=1e9; [0,1].forEach(ti => { const d=Math.abs(fitM[fi]-trueM[ti]); if(d<bd){bd=d;bi=ti;} }); return bi; });
  let okM = true, okC = true, maxMd = 0, maxCd = 0;
  [0,1].forEach(fi => { const ti = map[fi]; const md = Math.abs(fitM[fi]-trueM[ti]); const cd = Math.abs(Math.sqrt(fitC[fi])-Math.sqrt(trueC[ti][0][0])); if(md>maxMd)maxMd=md; if(cd>maxCd)maxCd=cd; if(md>0.15)okM=false; if(cd>0.15)okC=false; });
  ok('② 1D exact parameter recovery', okM && okC, 'max|μ-μ*|=' + maxMd.toFixed(4) + ' max|σ-σ*|=' + maxCd.toFixed(4));
}

// 3) responsibilities sum to 1 per point
{
  const rng = F.mulberry32(11);
  const samp = F.gmmSample(rng, [0.5,0.5], [[-5,5],[5,-5]], [[[1,0],[0,1]],[[1,0],[0,1]]], 500);
  const res = F.gmmEM(samp.X, 2, 25, 3);
  let bad = 0;
  for (let i = 0; i < samp.X.length; i++) { let s=0; for(let k=0;k<2;k++) s+=res.gamma[i][k]; if(Math.abs(s-1)>1e-9) bad++; }
  ok('③ responsibilities sum to 1 per point', bad === 0, 'violations ' + bad);
}

// 4) mixing weights sum to 1; Nk ≈ N*w_k
{
  const rng = F.mulberry32(22);
  const samp = F.gmmSample(rng, [0.6,0.4], [[-4,4],[4,-4]], [[[0.7,0],[0,0.7]],[[0.7,0],[0,0.7]]], 500);
  const res = F.gmmEM(samp.X, 2, 25, 4);
  let ws = 0; for(let k=0;k<2;k++) ws += res.model.weights[k];
  let okN = true; const N = samp.X.length;
  for(let k=0;k<2;k++){ let Nk=0; for(let i=0;i<N;i++) Nk+=res.gamma[i][k]; if(Math.abs(Nk-N*res.model.weights[k])>1e-6) okN=false; }
  ok('④ weights sum to 1 and Nk = N·w_k', approx(ws,1,1e-9) && okN, 'Σw=' + ws.toFixed(6));
}

// 5) convergence fixed point
{
  const rng = F.mulberry32(33);
  const samp = F.gmmSample(rng, [0.5,0.5], [[-3,3],[3,-3]], [[[0.6,0],[0,0.6]],[[0.6,0],[0,0.6]]], 500);
  const r1 = F.gmmEM(samp.X, 2, 30, 8);
  const r2 = F.gmmEM(samp.X, 2, 35, 8);
  let maxd = 0;
  for(let i=0;i<samp.X.length;i++) for(let k=0;k<2;k++){ const d=Math.abs(r2.gamma[i][k]-r1.gamma[i][k]); if(d>maxd)maxd=d; }
  ok('⑤ convergence fixed point (Δ<1e-3)', maxd < 1e-3, 'maxΔγ=' + maxd.toExponential(2));
}

// 6) covariance symmetric & PSD
{
  const rng = F.mulberry32(44);
  const samp = F.gmmSample(rng, [0.5,0.5], [[-5,5],[5,-5]], [[[1.2,0.3],[0.3,0.9]],[[0.8,-0.2],[-0.2,1.0]]], 500);
  const res = F.gmmEM(samp.X, 2, 25, 9);
  let sym = true, psd = true;
  for(let k=0;k<2;k++){ const c = res.model.covs[k]; if(Math.abs(c[0][1]-c[1][0])>1e-9) sym=false; if(F.minEig2(c) < -1e-6) psd=false; }
  ok('⑥ covariances symmetric and PSD', sym && psd, sym ? 'symmetric ✓' : 'asymmetric ✗');
}

// 7) scale invariance
{
  const rng = F.mulberry32(55);
  const samp = F.gmmSample(rng, [0.5,0.5], [[-2],[2]], [[[0.6]],[[0.6]]], 400);
  const c = 3.7;
  const Xs = samp.X.map(x => [x[0]*c]);
  const rA = F.gmmEM(samp.X, 2, 30, 12);
  const rB = F.gmmEM(Xs, 2, 30, 12);
  let diff = 0;
  for(let i=0;i<samp.X.length;i++){ let a=0,av=-1,b=0,bv=-1; for(let k=0;k<2;k++){ if(rA.gamma[i][k]>av){av=rA.gamma[i][k];a=k;} if(rB.gamma[i][k]>bv){bv=rB.gamma[i][k];b=k;} } if(a!==b) diff++; }
  const fa = rA.model.means[0][0] > rA.model.means[1][0] ? 0 : 1;
  const fb = rB.model.means[0][0] > rB.model.means[1][0] ? 0 : 1;
  const ratioM = rB.model.means[fb][0] / rA.model.means[fa][0];
  const ratioS = Math.sqrt(rB.model.covs[fb][0][0]) / Math.sqrt(rA.model.covs[fa][0][0]);
  const okScale = approx(ratioM, c, 0.05) && approx(ratioS, c, 0.05);
  ok('⑦ scale equivariance (assign same + params ×c)', diff === 0 && okScale, 'misassign ' + diff + ' μratio ' + ratioM.toFixed(3) + ' σratio ' + ratioS.toFixed(3));
}

// 8) model fit: 2-comp LL > 1-comp LL on 2-cluster data
{
  const rng = F.mulberry32(66);
  const samp = F.gmmSample(rng, [0.5,0.5], [[-4,4],[4,-4]], [[[0.7,0],[0,0.7]],[[0.7,0],[0,0.7]]], 600);
  const r2 = F.gmmEMBest(samp.X, 2, 30, 10, 1);
  const r1 = F.gmmEMBest(samp.X, 1, 30, 10, 1);
  ok('⑧ 2-comp LL > 1-comp LL', r2.LL > r1.LL, 'LL2=' + r2.LL.toFixed(2) + ' > LL1=' + r1.LL.toFixed(2));
}

console.log('=== gmm-forge self-test ===');
for (const r of rows) console.log(r[0].padEnd(4), r[1], '|', r[2]);
console.log('RESULT: ' + pass + '/' + rows.length + (fail === 0 ? ' ALL PASS ✅' : ' FAIL ❌'));
process.exit(fail === 0 ? 0 : 1);
