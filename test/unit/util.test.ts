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
    const checkHashChar = encodeArticleId('Random_#hashtag');
    const checkColonChar = encodeArticleId(`Guidelines:Règles_d'édition`);
    const checkExclamationChar = encodeArticleId('Avanti!');
    const checkAndChar = encodeArticleId('McCormick_Tribune_Plaza_&_Ice Rink');
    const checkAddEqualChar = encodeArticleId('2_+_2_=_5');

    t.equal(escapeCharAtEnd, 'Que_faire_%3F', 'Question mark encoded at end of title');
    t.equal(escapeCharFromMiddle, 'Que_faire_%3F_(L%C3%A9nine)', 'Question mark encoded from the middle of title');
    t.equal(checkHashChar, 'Random_%23hashtag', 'Encoding # char');
    t.equal(checkColonChar, `Guidelines%3AR%C3%A8gles_d'%C3%A9dition`, 'Encoding : char');
    t.equal(checkExclamationChar, 'Avanti!', 'Not Encoding ! char');
    t.equal(checkAndChar, 'McCormick_Tribune_Plaza_%26_Ice%20Rink', 'Encoding & char');
    t.equal(checkAddEqualChar, '2_%2B_2_%3D_5', 'Encoding + and = char');
})

test('Other Character should not escape', async(t) => {
    const checkForwardSlash = encodeArticleId(`something/random/todo`);
    const noEscape =  encodeArticleId('Michael_Jackson');

    t.equal(checkForwardSlash, 'something/random/todo', 'Not encoding / char');
    t.equal(noEscape, 'Michael_Jackson', 'Not encoding from regular string');
})
