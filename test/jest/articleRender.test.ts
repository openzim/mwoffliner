// noinspection ES6UnusedImports
import {} from 'ts-jest';
import {createClient} from 'redis-mock';
import json from './mock/data/wpen.json';
import data from './mock/data/wpen.ret.json';
import { articleDetailXId, populateArticleDetail } from '../../src/stores';
import { Article, ArticleRenderingOptions } from '../../src/Article/Article';


let article: Article;


beforeAll(async () => {
  const client = createClient();
  populateArticleDetail(client);
  await articleDetailXId.setMany(data);
  article = new Article('Category:Container_categories', json, {} as ArticleRenderingOptions);
});


describe('Article', () => {
  test(`Render`, async() => {
    await article.render();
  });
});
