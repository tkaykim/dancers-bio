import test from 'node:test';
import assert from 'node:assert/strict';
import { isVanityNickname, nicknameSuggestion, RESERVED_VANITY_SEGMENTS } from '../src/lib/utils/vanity-nickname';
test('nickname matches the clean vanity route and excludes application paths',()=>{
  assert.equal(nicknameSuggestion('Bada'),'bada');
  assert.equal(nicknameSuggestion('  My Nick  '),'my-nick');
  assert.equal(nicknameSuggestion('한글활동명'),'');
  assert.equal(nicknameSuggestion('Login'),'');
  for(const name of RESERVED_VANITY_SEGMENTS) assert.equal(isVanityNickname(name),false);
  for(const name of ['bada','nick-name','nick2']) assert.equal(isVanityNickname(name),true);
  for(const name of ['../admin','nick/name','name?admin=1','한글','a'.repeat(41)]) assert.equal(isVanityNickname(name),false);
});
