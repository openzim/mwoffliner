import "core-js/stable";
import "regenerator-runtime/runtime";

let zim = {toc: {}};

zim.toc.allSectionsRes = [];

function getSectionList(){
    let sectionList = [];
    for (i = 0; i < document.querySelectorAll('h1, h2, h3, h4, h5, h6').length; i++) {
        let headerObject = document.querySelectorAll('h1, h2, h3, h4, h5, h6')[i];
        if (headerObject.id === "") {
            headerObject.id = "documentparserid" + i;
        }
        sectionList.push(headerObject);
    }
    return sectionList;
}

zim.toc.getSectionList = function(){
    return document.querySelectorAll('h1, h2, h3, h4, h5, h6')
}

zim.toc.hasTableOfContent = function() {
    return document.querySelectorAll('h1, h2').length > 0 ? true : false;
}

zim.toc.getSections = function() {
    let respArrOfSections = [];
    const sectionList = getSectionList()
    sectionList.forEach(section => {
        respArrOfSections.push({
            "toc_level": section.tagName,
            "section_id": section.id,
            "section_name": section.innerText,
        })
    });
    zim.toc.allSectionsRes = respArrOfSections;
    return respArrOfSections;
}

zim.toc.scrollToSection = function(index){
    const sectionIdElem = getSectionList()[index];
    sectionIdElem.closest('details').setAttribute('open', '');
    location.href = `#${sectionList[index].id}`;
}

module.exports = {
    zim
}