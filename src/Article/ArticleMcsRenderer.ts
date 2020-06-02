import domino from 'domino';
import { Article } from './Article';
import { articleDetailXId } from '../stores';
import { ArticleRenderer } from './ArticleRenderer';
import {
  categoriesTemplate,
  leadSectionTemplate,
  sectionTemplate,
  subCategoriesTemplate,
  subPagesTemplate,
  subSectionTemplate
} from '../Templates';


/**
 * Kind of adapter that renders article content from json
 */
// todo di
export class ArticleMcsRenderer extends ArticleRenderer {
  public static async render(article: Article): Promise<RenderedArticle[]> {
    const result = [];

    // Paginate when there are more than 200 subCategories
    const numberOfPagesToSplitInto = Math.max(Math.ceil((article.details.subCategories || []).length / 200), 1);

    for (let i = 0; i < numberOfPagesToSplitInto; i++) {
      const page = await this.renderPage(article, i, numberOfPagesToSplitInto);
      result.push(page);
    }
    return result;
  }

  private static async renderPage(article: Article, page: number, totalPages: number): Promise<RenderedArticle> {
    const pageId = page === 0 ? '' : `__${page}`;
    const _articleId = article.id + pageId;
    const _articleDetail = Object.assign(
      {},
      article.details,
      {
        subCategories: (article.details.subCategories || []).slice(page * 200, (page + 1) * 200),
        nextArticleId: totalPages > page + 1 ? `${article.id}__${page + 1}` : null,
        prevArticleId: (page - 1) > 0 ?
          `${article.id}__${page - 1}`
          : (page - 1) === 0
            ? article.id
            : null,
      },
    );

    if ((article.details.subCategories || []).length > 200) {
      await articleDetailXId.set(_articleId, _articleDetail);
    }

    // set the first section (open by default)
    let html: string = leadSectionTemplate({
      lead_display_title: article.json.lead.displaytitle,
      lead_section_text: article.json.lead.sections[0].text,
      strings: article.renderingOptions.strings,
    });

    // set all other section (closed by default)
    if (!article.renderingOptions.nodet) {
      article.json.remaining.sections.forEach((oneSection: any, i: number) => {
        // if below is to test if we need to nest a subsections into a section
        if (oneSection.toclevel === 1) {
          html = html.replace(`__SUB_LEVEL_SECTION_${i}__`, ''); // remove unused anchor for subsection
          html += sectionTemplate({
            section_index: i + 1,
            section_id: oneSection.id,
            section_anchor: oneSection.anchor,
            section_line: oneSection.line,
            section_text: oneSection.text,
            strings: article.renderingOptions.strings,
          });
        } else {
          html = html.replace(
            `__SUB_LEVEL_SECTION_${i}__`,
            subSectionTemplate({
              section_index: i + 1,
              section_toclevel: oneSection.toclevel + 1,
              section_id: oneSection.id,
              section_anchor: oneSection.anchor,
              section_line: oneSection.line,
              section_text: oneSection.text,
              strings: article.renderingOptions.strings,
            }),
          );
        }
      });
    }
    const articleResourceNamespace = 'A';
    const categoryResourceNamespace = 'U';
    const slashesInUrl = _articleId.split('/').length - 1;
    const upStr = '../'.repeat(slashesInUrl + 1);

    if (_articleDetail?.subCategories?.length) {

      const subCategories = _articleDetail.subCategories.map((category) => {
        return {
          name: category.title.split(':').slice(1).join(':'),
          url: `${upStr}${categoryResourceNamespace}/${category.title.replace(/ /g, '_')}`,
        };
      });

      const groups = this.groupAlphabetical(subCategories);

      html += subCategoriesTemplate({
        strings: article.renderingOptions.strings,
        groups,
        prevArticleUrl: _articleDetail.prevArticleId ? `${upStr}${categoryResourceNamespace}/${_articleDetail.prevArticleId.replace(/ /g, '_')}` : null,
        nextArticleUrl: _articleDetail.nextArticleId ? `${upStr}${categoryResourceNamespace}/${_articleDetail.nextArticleId.replace(/ /g, '_')}` : null,
      });
    }

    if (_articleDetail?.pages?.length) {
      const pages = _articleDetail.pages.map((page) => {
        return {
          name: page.title,
          url: `${upStr}${articleResourceNamespace}/${page.title.replace(/ /g, '_')}`,
        };
      });

      const groups = this.groupAlphabetical(pages);

      html += subPagesTemplate({
        strings: article.renderingOptions.strings,
        groups,
      });
    }

    if (_articleDetail?.categories?.length) {
      const categories = _articleDetail.categories.map((category) => {
        return {
          name: category.title.split(':').slice(1).join(':'),
          url: `${upStr}${categoryResourceNamespace}/${category.title.replace(/ /g, '_')}`,
        };
      });
      html += categoriesTemplate({
        strings: article.renderingOptions.strings,
        categories,
      });
    }
    // remove the last subsection anchor (all other anchor are removed in the forEach)
    let strippedTitle = this.getStrippedTitleFromHtml(
      html.replace(`__SUB_LEVEL_SECTION_${article.json.remaining.sections.length}__`, '')
    );

    if (!strippedTitle) {
      const title = (article?.json?.lead || {displaytitle: article.id})?.displaytitle;         // todo #1139 !
      const doc = domino.createDocument(`<span class='mw-title'>${title}</span>`);
      strippedTitle = doc.getElementsByClassName('mw-title')[0].textContent;
    }

    return {
      articleId: _articleId,
      displayTitle: (strippedTitle || article.id.replace(/_/g, ' ')) + (page === 0 ? '' : `/${page}`),
      html
    };
  }


  // todo explicit return type
  private static groupAlphabetical(items: PageRef[]) {
    const groupsAlphabetical = items.reduce((acc: any, item) => {
      const groupId = item.name[0].toLocaleUpperCase();
      acc[groupId] = (acc[groupId] || []).concat(item);
      return acc;
    }, {});

    return Object.keys(groupsAlphabetical)
      .sort()
      .map((letter) => {
        return {
          title: letter,
          items: groupsAlphabetical[letter],
        };
      });
  }
}
