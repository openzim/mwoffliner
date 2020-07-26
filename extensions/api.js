module.exports = class TableOfContent { 
    constructor(){
        this.respArrOfSections = [];
        this.sectionList = [];
    }

    async hasTableOfContent() {
        this.sectionList = document.querySelectorAll('details[data-level]');
        return this.sectionList.length > 0 ? true : false;
    }

    async getSections() {
        if (this.hasTableOfContent()) {
            this.sectionList.forEach(section => {
                const h2Elem = section.getElementsByTagName('summary')[0].firstElementChild;
                this.respArrOfSections.push({
                    "toc_level": section.getAttribute('data-level'),
                    "section_id": h2Elem.getAttribute('id'),
                    "section_name": h2Elem.innerHTML,
                })
            });
        }
        return this.respArrOfSections;
    }

    async scrollToSection(index){
        let sectionId = this.respArrOfSections[index].section_id;
        const sectionIdElem = document.getElementById(sectionId);
        sectionIdElem.closest('details').setAttribute('open', '');

        // This is the case where parent section might be closed.
        sectionIdElem.closest('details[data-level="2"]').setAttribute('open', '')
        location.href = `#${sectionId}`;
    }
}

