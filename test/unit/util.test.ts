import './bootstrap.test';
import test from 'blue-tape';
import { throttle, sanitizeString, encodeArticleIdForZimHtmlUrl } from 'src/util';
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

test('Encoding ArticleId for Zim HTML Url', async(t) => {
     const articles = [
        'Que_faire_?',                        'Que_faire_%3F',
        'Que_faire_?_(Lénine)',               'Que_faire_%3F_(L%C3%A9nine)',
        'Random_#hashtag',                    'Random_%23hashtag',
        `Guidelines:Règles_d'édition`,        `Guidelines%3AR%C3%A8gles_d'%C3%A9dition`,
        'Avanti!',                            'Avanti!',
        'McCormick_Tribune_Plaza_&_Ice Rink', 'McCormick_Tribune_Plaza_%26_Ice%20Rink',
        '2_+_2_=_5',                          '2_%2B_2_%3D_5',
        `Guidelines:Règles d'édition`,        `Guidelines%3AR%C3%A8gles%20d'%C3%A9dition`,
        'something/random/todo',              'something/random/todo',
        'Michael_Jackson',                    'Michael_Jackson',
        undefined,                            undefined
    ];

    while (articles.length) {
        const unencoded = articles.shift();
        const   encoded = articles.shift();
        t.equal(encoded, encodeArticleIdForZimHtmlUrl(unencoded), `encodeArticleIdForZimHtmlUrl() encoding`);
    }
});
