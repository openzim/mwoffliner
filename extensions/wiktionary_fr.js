module.exports = class WiktionaryFR { // implements CustomProcessor
    async shouldKeepArticle(articleId, doc) {
        const frenchTitle = doc.querySelector(`#fr.sectionlangue`);
        return !!frenchTitle;
    }
    async preProcessArticle(articleId, doc) {
        const nonFrenchTitles = Array.from(doc.querySelectorAll(`.sectionlangue:not(#fr)`));
        for (const title of nonFrenchTitles) {
            title.closest('details').remove();
        }

        return doc;
    }
}
