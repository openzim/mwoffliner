import './bootstrap.test';
import test from 'blue-tape';
import { contains } from '../../src/util';

// Super Simple Sanity tests
test(async (t) => {
    t.ok(true);
});

test(async (t) => {
    const arr = [1, 2, 3];
    const bool = contains(arr, 3);
    t.ok(bool);
});
