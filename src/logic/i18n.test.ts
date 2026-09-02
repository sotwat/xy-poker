import assert from 'node:assert/strict';
import test from 'node:test';
import { formatHandName, getMissingTranslationKeys, resolveInitialLanguage, translate } from '../i18n';

test('defaults to Japanese unless English was explicitly saved', () => {
    assert.equal(resolveInitialLanguage(), 'ja');
    assert.equal(resolveInitialLanguage({ getItem: () => null }), 'ja');
    assert.equal(resolveInitialLanguage({ getItem: () => 'ja' }), 'ja');
    assert.equal(resolveInitialLanguage({ getItem: () => 'unsupported' }), 'ja');
    assert.equal(resolveInitialLanguage({ getItem: () => 'en' }), 'en');
});

test('interpolates localized UI messages', () => {
    assert.equal(translate('ja', 'match.botFallback', { seconds: 30 }), '30秒以内に相手が見つからない場合は、Bot対戦を自動で開始します。');
    assert.equal(translate('en', 'match.botFallback', { seconds: 30 }), 'If no player joins within 30 seconds, a bot match starts automatically.');
});

test('localizes every poker hand used by the evaluator', () => {
    assert.equal(formatHandName('PureStraight', 'ja'), '純正ストレート');
    assert.equal(formatHandName('FourOfAKind', 'ja'), 'フォーカード');
    assert.equal(formatHandName('PureStraight', 'en'), 'Pure Straight');
});

test('keeps Japanese and English message catalogs in sync', () => {
    assert.deepEqual(getMissingTranslationKeys('ja'), []);
    assert.deepEqual(getMissingTranslationKeys('en'), []);
});
