import test from 'node:test';
import assert from 'node:assert/strict';
import { WebMercatorViewport } from '@deck.gl/core';
import { fitCinematicBounds } from './mapCamera.ts';

for (const [name, points] of [
  ['long corridor', [[72.8, 19], [77.2, 28.6]]],
  ['east-west block', [[72, 22], [88, 22.5]]],
  ['entire quadrilateral', [[72.8, 19], [77.2, 28.6], [88.3, 22.5], [80.3, 13]]],
  ['short block', [[82.8, 17.7], [82.5, 17.4]]],
]) {
  for (const [width, height, padding] of [
    [1240, 668, { top: 150, right: 415, bottom: 110, left: 125 }],
    [390, 844, { top: 150, right: 62, bottom: 169, left: 62 }],
  ]) test(`${name} fits in the visible 3D map at ${width}px`, () => {
    const camera = fitCinematicBounds(points, width, height, padding);
    const viewport = new WebMercatorViewport({ width, height, ...camera });
    for (const point of points) for (const elevation of [0, 5500]) {
      const [x, y] = viewport.project([...point, elevation]);
      assert.ok(x >= padding.left && x <= width - padding.right, `x ${x}`);
      assert.ok(y >= padding.top && y <= height - padding.bottom, `y ${y}`);
    }
  });
}
test('invalid geometry does not change the camera', () => {
  assert.equal(fitCinematicBounds([[NaN, 20]], 100, 100, { top: 0, bottom: 0, left: 0, right: 0 }), null);
});
