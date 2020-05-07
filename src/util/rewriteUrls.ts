import * as urlParser from 'url';
import { isMirrored } from './saveArticles';
import { migrateChildren, getMediaBase, getFullUrl, getRelativeFilePath, encodeArticleId} from './misc';
import { redirectsXId } from '../stores';
import { Dump } from '../Dump';
import MediaWiki from '../MediaWiki';
import DU from '../DOMUtils';
import logger from '../Logger';

export async function removeLinksToUnmirroredArticles(mw: MediaWiki, dump: Dump, linkNode: DominoElement, href: string) {
    const title = mw.extractPageTitleFromHref(href);
    if (!title) {
        return;
    }

    if (await isMirrored(title)) {
        /* Deal with local anchor */
        const localAnchor = href.lastIndexOf('#') === -1 ? '' : href.substr(href.lastIndexOf('#'));
        linkNode.setAttribute('href', encodeArticleId(title) + localAnchor);
        return;
    } else {
        const res = await redirectsXId.get(title.replace(/ /g, '_'));
        if (res) {
            linkNode.setAttribute('href', encodeArticleId(title));
        } else {
            migrateChildren(linkNode, linkNode.parentNode, linkNode);
            linkNode.parentNode.removeChild(linkNode);
        }
        return;
    }
}

export async function rewriteUrl(articleId: string, mw: MediaWiki, dump: Dump, linkNode: DominoElement): Promise<{ mediaDependencies: string[] }> {
    const webUrlHost = urlParser.parse(mw.webUrl).host;
    let rel = linkNode.getAttribute('rel');
    let href = linkNode.getAttribute('href') || '';
    let hrefProtocol = urlParser.parse(href).protocol;
    const mediaDependencies: string[] = [];

    if (hrefProtocol && !hrefProtocol.includes('http')) {
        return { mediaDependencies }; // e.g. geo:11111,11111
    }

    if (rel === 'mwo:NoRewrite') {
        return { mediaDependencies };
    }

    if (!hrefProtocol && href.slice(0, 2) === '//') {
        const wikiProtocol = urlParser.parse(mw.webUrl).protocol;
        href = `${wikiProtocol}${href}`;
        linkNode.setAttribute('href', href);
        hrefProtocol = urlParser.parse(href).protocol;
    }

    if (!rel && linkNode.getAttribute('resource')) {
        rel = 'mw:MediaLink';
    }

    if (hrefProtocol && hrefProtocol.includes('http') && !rel) {
        rel = 'mw:ExtLink';
    }

    if (!href) {
        DU.deleteNode(linkNode);
        return { mediaDependencies };
    } else if (href.substring(0, 1) === '#') {
        return { mediaDependencies };
    } else {
        /* Deal with custom geo. URL replacement, for example:
         * http://maps.wikivoyage-ev.org/w/poimap2.php?lat=44.5044943&lon=34.1969633&zoom=15&layer=M&lang=ru&name=%D0%9C%D0%B0%D1%81%D1%81%D0%B0%D0%BD%D0%B4%D1%80%D0%B0
         * http://tools.wmflabs.org/geohack/geohack.php?language=fr&pagename=Tour_Eiffel&params=48.85825_N_2.2945_E_type:landmark_region:fr
         */
        if (rel !== 'mw:WikiLink') {
            let lat;
            let lon;
            if (/poimap2\.php/i.test(href)) {
                const hrefQuery = urlParser.parse(href, true).query;
                lat = parseFloat(hrefQuery.lat as string);
                lon = parseFloat(hrefQuery.lon as string);
            } else if (/geohack\.php/i.test(href)) {
                let { params } = urlParser.parse(href, true).query;

                /* "params" might be an array, try to detect the geo localization one */
                if (params instanceof Array) {
                    let i = 0;
                    while (params[i] && isNaN(+params[i][0])) {
                        i += 1;
                    }
                    params = params[i];
                }

                if (params) {
                    // see https://bitbucket.org/magnusmanske/geohack/src public_html geo_param.php
                    const pieces = params.toUpperCase().split('_');
                    const semiPieces = pieces.length > 0 ? pieces[0].split(';') : undefined;
                    if (semiPieces && semiPieces.length === 2) {
                        [lat, lon] = semiPieces;
                    } else {
                        const factors = [1, 60, 3600];
                        let offs = 0;

                        const deg = (hemiHash: any) => {
                            let out = 0;
                            let hemiSign = 0;
                            for (let i = 0; i < 4 && i + offs < pieces.length; i += 1) {
                                const v = pieces[i + offs];
                                hemiSign = hemiHash[v];
                                if (hemiSign) {
                                    offs = i + 1;
                                    break;
                                }
                                out += +v / factors[i];
                            }
                            return out * hemiSign;
                        };

                        lat = deg({ N: 1, S: -1 });
                        lon = deg({ E: 1, W: -1, O: 1 });
                    }
                }
            } else if (/Special:Map/i.test(href)) {
                const parts = href.split('/');
                lat = parts[4];
                lon = parts[5];
            } else if (rel === 'mw:MediaLink') {
                const shouldScrape = href.includes('.pdf') && !dump.nopdf ||
                    href.includes('.ogg') && !dump.nopic && !dump.novid && !dump.nodet;

                if (shouldScrape) {
                    try {
                        const newHref = getRelativeFilePath(articleId, getMediaBase(href, true), 'I');
                        linkNode.setAttribute('href', newHref);
                        mediaDependencies.push(href);
                    } catch (err) {
                        logger.warn('Error parsing url:', err);
                        DU.deleteNode(linkNode);
                    }
                }
            }

            if (!isNaN(lat) && !isNaN(lon)) {
                href = `geo:${lat},${lon}`;
                linkNode.setAttribute('href', href);
                return { mediaDependencies };
            }
        }

        if (rel) { // This is Parsoid HTML
            /* Add 'external' class to interwiki links */
            if (rel.substring(0, 10) === 'mw:ExtLink' || rel === 'mw:WikiLink/Interwiki') {
                DU.appendToAttr(linkNode, 'class', 'external');
            }

            /* Check if the link is "valid" */
            if (!href) {
                throw new Error(`No href attribute in the following code, in article\n${linkNode.outerHTML}`);
            }

            /* Rewrite external links starting with // */
            if (rel.substring(0, 10) === 'mw:ExtLink' || rel === 'nofollow') {
                if (href.substring(0, 1) === '/') {
                    linkNode.setAttribute('href', getFullUrl(webUrlHost, href, mw.base));
                } else if (href.substring(0, 2) === './') {
                    migrateChildren(linkNode, linkNode.parentNode, linkNode);
                    linkNode.parentNode.removeChild(linkNode);
                }
                return { mediaDependencies };
            } else if (rel === 'mw:WikiLink' || rel === 'mw:referencedBy') {
                await removeLinksToUnmirroredArticles(mw, dump, linkNode, href);
            } else {
                return { mediaDependencies };
            }
        } else { // This is MediaWiki HTML
            await removeLinksToUnmirroredArticles(mw, dump, linkNode, href);
        }

        if (articleId.includes('/')) {
            const href = linkNode.getAttribute('href').replace(/ /g, '_'); // href is modified above, so this is necessary
            const resourceNamespace = 'A';
            const slashesInUrl = articleId.split('/').length - 1;
            const upStr = '../'.repeat(slashesInUrl + 1);
            linkNode.setAttribute('href', `${upStr}${resourceNamespace}/${href}`);
        }
    }
    return { mediaDependencies };
}
