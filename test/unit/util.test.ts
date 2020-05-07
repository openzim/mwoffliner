import './bootstrap.test';

import test from 'blue-tape';
import { throttle, sanitizeString, encodeArticleId } from 'src/util';
import { sleep } from 'test/util';

test('util -> Throttle', async (t) => {
    let calledCount = 0;
    const func = throttle(() => {
        calledCount += 1;
    }, 200);
    t.equal(calledCount, 0, 'Call count is 0 before calling func');
    func();

    await sleep(100);

    t.equal(calledCount, 1, 'Call count is 1 after calling once');

    await sleep(100);

    func();
    func();
    func();
    func();

    await sleep(100);
    t.equal(calledCount, 2, 'Call count is 2 after four times in under 200ms');

    t.equals(sanitizeString('Mediawiki <script></script>'), 'Mediawiki  script   script ', 'Escaping HTML Tags');
    t.equals(sanitizeString('SELECT * FROM db WHERE something="Poler"'), 'SELECT   FROM db WHERE something  Poler ', 'Escaping query characters');

});

test('Question Mark escape', async(t) => {
    const escapeCharAtEnd = encodeArticleId('Que_faire_?');
    const escapeCharFromMiddle = encodeArticleId('Que_faire_?_(Lénine)');
    const noEscape =  encodeArticleId('Michael_Jackson');

    t.equal(escapeCharAtEnd, 'Que_faire_%3F', 'Question mark escaped at end of title');
    t.equal(escapeCharFromMiddle, 'Que_faire_%3F_(Lénine)', 'Question mark escaped from the middle of title');
    t.equal(noEscape, 'Michael_Jackson', 'No escaping from regular string');
})

test('Other Character should not escape', async(t) => {
    const checkExclamationChar = encodeArticleId('Avanti!');
    const checkAndChar = encodeArticleId('McCormick_Tribune_Plaza_&_Ice Rink');
    const checkAddEqualChar = encodeArticleId('2_+_2_=_5');
    const checkMixChar = encodeArticleId('Saint-Louis-du-Ha!_Ha!');

    t.equal(checkExclamationChar, 'Avanti!', 'Not esacping ! char');
    t.equal(checkAndChar, 'McCormick_Tribune_Plaza_&_Ice Rink', 'Not escaping & char');
    t.equal(checkAddEqualChar, '2_+_2_=_5', 'Not escaping + and = char');
    t.equal(checkMixChar, 'Saint-Louis-du-Ha!_Ha!', 'Not escaping mix char');
})
