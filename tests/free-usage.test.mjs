import assert from 'node:assert/strict';
import {scenarioUsage,aiNeurons,remainingCalls} from '../free-usage.js';

assert.equal(remainingCalls({reads:0,writes:0,deletes:0,aiNeurons:0},scenarioUsage(2,'plain')),44);
assert.equal(remainingCalls({reads:0,writes:0,deletes:0,aiNeurons:0},scenarioUsage(2,'new')),12);
assert.equal(remainingCalls({reads:0,writes:0,deletes:0,aiNeurons:0},scenarioUsage(4,'new')),11);
assert.equal(Math.round(aiNeurons({speechSeconds:420})),326);
assert.equal(remainingCalls({reads:50000,writes:0,deletes:0,aiNeurons:0},scenarioUsage(2,'plain')),0);
console.log('free usage tests passed');
