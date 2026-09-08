import test from 'node:test';
import assert from 'node:assert/strict';
import { getApplicationReviewRound } from './application-stage';

test('one-stage acceptance without a final confirmation stays in review', () => {
  assert.equal(getApplicationReviewRound({status:'accepted',passed_round:1,confirmed_at:null},1),0);
});
test('final confirmation is required for the last round in every project', () => {
  for (const rounds of [1,2,3]) {
    assert.equal(getApplicationReviewRound({status:'accepted',passed_round:rounds,confirmed_at:null},rounds),rounds-1);
    assert.equal(getApplicationReviewRound({status:'accepted',passed_round:rounds,confirmed_at:'2026-09-08T12:00:00Z'},rounds),rounds);
  }
});
test('intermediate approvals retain their stage', () => {
  assert.equal(getApplicationReviewRound({status:'accepted',passed_round:1,confirmed_at:null},3),1);
  assert.equal(getApplicationReviewRound({status:'pending',passed_round:0,confirmed_at:null},1),0);
});
