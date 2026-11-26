'use strict';

// The package is ESM ("type": "module"), so this test imports the module the
// same way the React app does.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { describeCron } from '../src/utility_functions/describeCron.js';

test('interval schedules read as a cadence', () => {
    assert.equal(describeCron('*/5 * * * *').description, 'Every 5 minutes');
    assert.equal(describeCron('*/15 * * * *').description, 'Every 15 minutes');
    assert.equal(describeCron('* * * * *').description, 'Every minute');
    assert.equal(describeCron('0 * * * *').description, 'Every hour');
});

test('a fixed time of day reads as a clock time', () => {
    assert.equal(describeCron('0 22 * * *').description, 'At 22:00');
    assert.equal(describeCron('30 6 * * *').description, 'At 06:30');
    assert.equal(describeCron('0 0 * * *').description, 'At 00:00');
});

test('day-of-week is spelled out, ranges included', () => {
    assert.equal(describeCron('0 22 * * 1-5').description, 'At 22:00 Mon-Fri');
    assert.equal(describeCron('0 8 * * 0').description, 'At 08:00 on Sunday');
    assert.equal(describeCron('30 6 * * 1,3,5').description, 'At 06:30 on Mon, Wed and Fri');
    assert.equal(describeCron('0 22 * * 1,2,3,4,5,6,0').description, 'At 22:00');
    assert.equal(describeCron('0 22 * * 7').description, 'At 22:00 on Sunday');
});

test('hour ranges and day/month clauses are described', () => {
    assert.equal(describeCron('15 9-17 * * 1-5').description, 'Every hour from 09:00 to 17:59 Mon-Fri');
    assert.equal(describeCron('0 9 1 1 *').description, 'At 09:00 on day 1 in January');
    assert.equal(describeCron('0 0 1 * *').description, 'At 00:00 on day 1');
});

test('malformed expressions are rejected with a readable reason', () => {
    const bad = ['', 'not a cron', '0 22 * * * *', '60 * * * *', '0 25 * * *',
                 '5-1 * * * *', '*/0 * * * *', '0 22 * * 8', '0 22 * * 9'];
    for (const expression of bad) {
        const result = describeCron(expression);
        assert.equal(result.valid, false, `expected "${expression}" to be invalid`);
        assert.ok(result.error && result.error.length > 10, `expected a reason for "${expression}"`);
    }
});

test('a valid expression is always sentence-shaped and never empty', () => {
    const good = ['*/5 * * * *', '* * * * *', '0 * * * *', '0 22 * * *', '0 22 * * 1-5',
                  '30 6 * * 1,3,5', '0 8 * * 0', '15 9-17 * * 1-5', '*/10 8-18 * * 1-5', '0 0 1 1 *'];
    for (const expression of good) {
        const result = describeCron(expression);
        assert.equal(result.valid, true, `expected "${expression}" to be valid: ${result.error}`);
        assert.ok(result.description.length > 3);
        assert.match(result.description, /^[A-Z]/, `"${expression}" should start with a capital`);
        assert.doesNotMatch(result.description, /undefined|null|NaN/);
    }
});
