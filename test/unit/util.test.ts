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
    const articles = [{
        article_name : 'Que_faire_?',
        article_name_encoded: 'Que_faire_%3F'
    },
    {
        article_name : 'Que_faire_?_(Lénine)',
        article_name_encoded: 'Que_faire_%3F_(L%C3%A9nine)'
    },
    {
        article_name : 'Random_#hashtag',
        article_name_encoded: 'Random_%23hashtag'
    },
    {
        article_name : `Guidelines:Règles_d'édition`,
        article_name_encoded: `Guidelines%3AR%C3%A8gles_d'%C3%A9dition`
    },
    {
        article_name : 'Avanti!',
        article_name_encoded: 'Avanti!'
    },
    {
        article_name : 'McCormick_Tribune_Plaza_&_Ice Rink',
        article_name_encoded: 'McCormick_Tribune_Plaza_%26_Ice%20Rink'
    },
    {
        article_name : '2_+_2_=_5',
        article_name_encoded: '2_%2B_2_%3D_5'
    },
    {
        article_name : 'something/random/todo',
        article_name_encoded: 'something/random/todo'
    },
    {
        article_name : 'Michael_Jackson',
        article_name_encoded: 'Michael_Jackson'
    },
    {
        article_name : undefined,
        article_name_encoded: undefined
    }]

    for (const article of articles) {
        const enocdedResult = encodeArticleIdForZimHtmlUrl(article.article_name);
        t.equal(enocdedResult, article.article_name_encoded, `Correct result for ${article.article_name} article`);
    }
});
