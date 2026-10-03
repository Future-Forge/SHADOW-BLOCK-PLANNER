import test from 'node:test';
import assert from 'node:assert/strict';
import { boundsForCoordinates, clusterTrains, getBlockPath } from './mapPresentation.ts';

test('bounds include all intermediate vertices, not just block endpoints', () => {
  assert.deepEqual(boundsForCoordinates([[70,20],[80,30],[72,21]]), [[70,20],[80,30]]);
  assert.equal(boundsForCoordinates([]), null);
  assert.deepEqual(boundsForCoordinates([[NaN,10],[72,22]]), [[72,22],[72,22]]);
});
test('block geometry from the backend has priority', () => {
  assert.deepEqual(getBlockPath({decision:{block_geometry:[[70,20],[74,25]]}}, []), [[70,20],[74,25]]);
});
test('fallback block path follows the intermediate station order in both directions', () => {
  const corridors = [{stations:[{code:'A',lon:1,lat:2},{code:'B',lon:3,lat:4},{code:'C',lon:5,lat:6}]}];
  const b={decision:{},request:{from_station:'C',to_station:'A'}};
  assert.deepEqual(getBlockPath(b,corridors), [[5,6],[3,4],[1,2]]);
  assert.deepEqual(getBlockPath({...b,request:{from_station:'A',to_station:'X'}},corridors), []);
});
test('clustering preserves every backend train without a display cap', () => {
  const trains = Array.from({length:120}, (_,i)=>({train_number:String(i),lon:10,lat:20}));
  const groups=clusterTrains(trains,p=>p,36);
  assert.equal(groups.length,1);
  assert.equal(groups[0].trains.length,120);
});
test('selected trains stay individually inspectable even in a cluster', () => {
  const trains=[{train_number:'1',lon:10,lat:20},{train_number:'2',lon:10,lat:20}];
  assert.equal(clusterTrains(trains,p=>p,36,'1').length,2);
});
test("disabled grouping retains distinct markers and skips invalid coordinates", () => {
  const trains=[{train_number:'1',lon:10,lat:20},{train_number:'2',lon:10,lat:20},{train_number:'bad',lon:NaN,lat:20}];
  assert.equal(clusterTrains(trains,p=>p,0).length,2);
});

test("markers on either side of an old grid boundary are grouped", () => {
  const trains = [
    { train_number: '1', lon: 28, lat: 20 },
    { train_number: '2', lon: 30, lat: 20 },
  ];
  assert.equal(clusterTrains(trains, (p) => p, 29).length, 1);
});
