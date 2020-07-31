import "core-js/stable";
import "regenerator-runtime/runtime";

class TableOfContent { 
    constructor(){
        this.respArrOfSections = [];
        this.sectionList = [];
    }

    hasTableOfContent() {
        this.sectionList = document.querySelectorAll('details[data-level]');
        return this.sectionList.length > 0 ? true : false;
    }

    getSections() {
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

    scrollToSection(index){
        let sectionId = this.respArrOfSections[index].section_id;
        const sectionIdElem = document.getElementById(sectionId);
        sectionIdElem.closest('details').setAttribute('open', '');

        // This is the case where parent section might be closed.
        sectionIdElem.closest('details[data-level="2"]').setAttribute('open', '')
        location.href = `#${sectionId}`;
    }
}

// Making it available to window Object of the browser(for now)
window.toc = TableOfContent;
