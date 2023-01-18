import { contains } from '../../src/util/misc.js';

describe('Sanity tests', () => {
  test('Symple sanity test', async () => {
    const arr = [1, 2, 3];
    const bool = contains(arr, 3);
    expect(bool).toBeTruthy();
  });
});
