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

        const h4titles = Array.from(doc.querySelectorAll(`h4`));
        for (const h4title of h4titles) {
            h4title.closest('details').remove();
        }
        //Remove h2 summary title
        doc.querySelector('h2').closest('summary').setAttribute('style', 'display:none! important')

        return doc;
    }
}
