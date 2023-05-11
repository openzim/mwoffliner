import urlBuilder from './url.builder.js'

class CategoriesURLDirector {
  buildSubCategoriesURL(domain: string, articleId: string, continueStr = '') {
    return urlBuilder
      .setDomain(domain)
      .setQueryParams({
        action: 'query',
        list: 'categorymembers',
        cmtype: 'subcat',
        cmlimit: 'max',
        format: 'json',
        cmtitle: encodeURIComponent(articleId),
        cmcontinue: continueStr,
      })
      .build()
  }
}

const categoriesURLDirector = new CategoriesURLDirector()

export default categoriesURLDirector
