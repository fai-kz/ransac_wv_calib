// Development-only bridge; neither runtime depends on the other language.
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const pythonIndex=process.argv.indexOf('--python');
const python=pythonIndex>=0 ? process.argv[pythonIndex+1] : 'python3';
if (!python) throw new Error('--python requires an executable');
const web=join(root,'spectra-wvl-calibration-main');
const {build}=await import(pathToFileURL(join(web,'node_modules/esbuild/lib/main.js')).href);
const fixtureText=await readFile(join(web,'scripts/fixtures/grating-regression.json'),'utf8');
if(fixtureText!==await readFile(join(root,'python/tests/fixtures/grating-regression.json'),'utf8'))
  throw new Error('Python and web fixtures differ; update both copies deliberately.');
const fixtures=JSON.parse(fixtureText);
const temporary=await mkdtemp(join(tmpdir(),'calibration-parity-'));
try {
  const module=join(temporary,'web.mjs');
  await build({entryPoints:[join(web,'src/lib/calibration.ts')],bundle:true,platform:'node',format:'esm',outfile:module});
  const {parseTextSpectrum,runCalibration,DEFAULT_PARAMETERS}=await import(pathToFileURL(module).href);
  const outputs=fixtures.cases.map(f=>{
    const target=parseTextSpectrum(f.flux.map((y,i)=>`${i} ${y}`).join('\n'),f.name);
    const reference=parseTextSpectrum(fixtures.references[f.grid].map(r=>r.join(' ')).join('\n'));
    const r=runCalibration(target,reference,DEFAULT_PARAMETERS,false);
    return {name:f.name,coefficients:r.solution.coefficientsForNormalizedCoordinate,rms:r.summary.rmsAngstrom,
      matches:r.matches.map(m=>[m.targetIndex,m.referenceIndex,m.inlier])};
  });
  const expected=join(temporary,'expected.json');
  await writeFile(expected,JSON.stringify(outputs));
  const check=spawnSync(python,['-c',`
import json, sys, numpy as np
from pathlib import Path
from ransac_wv_calib import calibrate
fixtures=json.loads(Path(sys.argv[1]).read_text())
expected=json.loads(Path(sys.argv[2]).read_text())
for case,web in zip(fixtures['cases'],expected):
    result=calibrate(np.column_stack([np.arange(len(case['flux'])),case['flux']]),fixtures['references'][case['grid']])
    np.testing.assert_allclose(result['solution']['coefficients_normalized'],web['coefficients'],rtol=0,atol=1e-6)
    assert abs(result['summary']['rms_angstrom']-web['rms'])<1e-8
    assert [[m['target_index'],m['reference_index'],m['inlier']] for m in result['matches']]==web['matches']
    print('PASS:',case['name'])
`,join(web,'scripts/fixtures/grating-regression.json'),expected],
    {cwd:root,stdio:'inherit',env:{...process.env,PYTHONPATH:join(root,'python')}});
  if(check.error) throw check.error;
  if(check.status!==0) process.exitCode=check.status??1;
  else console.log('All four real spectra agree across Python and web implementations.');
} finally {await rm(temporary,{recursive:true,force:true});}
