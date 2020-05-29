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
      // todo move this down inside - begin
      const pageId = i === 0 ? '' : `__${i}`;
      const _articleId = article.id + pageId;
      const _articleDetail = Object.assign(
        {},
        article.details,
        {
          subCategories: (article.details.subCategories || []).slice(i * 200, (i + 1) * 200),
          nextArticleId: numberOfPagesToSplitInto > i + 1 ? `${article.id}__${i + 1}` : null,
          prevArticleId: (i - 1) > 0 ?
            `${article.id}__${i - 1}`
            : (i - 1) === 0
              ? article.id
              : null,
        },
      );

      if ((article.details.subCategories || []).length > 200) {
        await articleDetailXId.set(_articleId, _articleDetail);
      }
      // todo move this down inside - end

      const html = this.renderMCSArticle(article, _articleId, _articleDetail);
      let strippedTitle = this.getStrippedTitleFromHtml(html);
      if (!strippedTitle) {
        const title = (article?.json?.lead || {displaytitle: article.id})?.displaytitle;         // todo #1139 !
        const doc = domino.createDocument(`<span class='mw-title'>${title}</span>`);
        strippedTitle = doc.getElementsByClassName('mw-title')[0].textContent;
      }

      result.push({
        articleId: _articleId,
        displayTitle: (strippedTitle || article.id.replace(/_/g, ' ')) + (i === 0 ? '' : `/${i}`),
        html,
      });
    }
    return result;
  }


  // todo fix crazy type
  // todo refactor this
  private static renderMCSArticle(article: Article, _articleId: string, _articleDetail: PageInfo & { subCategories?: PageInfo[]; categories?: PageInfo[]; pages?: PageInfo[]; thumbnail?: { source: string; height: number; width: number }; coordinates?: string; timestamp?: string; revisionId?: number; internalThumbnailUrl?: string; nextArticleId?: string; prevArticleId?: string; missing?: string } & { prevArticleId: string; nextArticleId: string | null; subCategories: PageInfo[] }) {
    // set the first section (open by default)
    let html: string = leadSectionTemplate({
      lead_display_title: article.json.lead.displaytitle,
      lead_section_text: article.json.lead.sections[0].text,
      strings: article.renderingOptions.strings,
    });

    // set all other section (closed by default)
    if (!article.renderingOptions.nodet) {
      let i = 0;
      for (const oneSection of article.json.remaining.sections) {
        // if below is to test if we need to nest a subsections into a section
        if (oneSection.toclevel === 1) {
          html = html.replace(`__SUB_LEVEL_SECTION_${i}__`, ''); // remove unused anchor for subsection
          html += sectionTemplate({
            section_index: ++i + 1,
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
              section_index: ++i + 1,
              section_toclevel: oneSection.toclevel + 1,
              section_id: oneSection.id,
              section_anchor: oneSection.anchor,
              section_line: oneSection.line,
              section_text: oneSection.text,
              strings: article.renderingOptions.strings,
            }),
          );
        }
      }
    }
    const articleResourceNamespace = 'A';
    const categoryResourceNamespace = 'U';
    const slashesInUrl = article.id.split('/').length - 1;
    const upStr = '../'.repeat(slashesInUrl + 1);

    if (article.details?.subCategories?.length) {

      const subCategories = article.details.subCategories.map((category) => {
        return {
          name: category.title.split(':').slice(1).join(':'),
          url: `${upStr}${categoryResourceNamespace}/${category.title.replace(/ /g, '_')}`,
        };
      });

      const groups = this.groupAlphabetical(subCategories);

      html += subCategoriesTemplate({
        strings: article.renderingOptions.strings,
        groups,
        prevArticleUrl: article.details.prevArticleId ? `${upStr}${categoryResourceNamespace}/${article.details.prevArticleId.replace(/ /g, '_')}` : null,
        nextArticleUrl: article.details.nextArticleId ? `${upStr}${categoryResourceNamespace}/${article.details.nextArticleId.replace(/ /g, '_')}` : null,
      });
    }

    if (article.details?.pages?.length) {
      const pages = article.details.pages.map((page) => {
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

    if (article.details?.categories?.length) {
      const categories = article.details.categories.map((category) => {
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
    return html.replace(`__SUB_LEVEL_SECTION_${article.json.remaining.sections.length}__`, '');
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
