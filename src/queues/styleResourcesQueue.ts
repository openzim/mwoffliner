import async from "async";
import Downloader from "../Downloader";
import logger from "../Logger";

export function makeStyleResourcesQueue(downloader: Downloader) {
    const downloadCSSFileQueue = async.queue((data: any, finished) => {
        if (data) {
            downloader.downloadContent(data.url)
                .then(({ content }) => {
                    const article = new ZimArticle(data.path, content, 'A');
                    return zimCreator.addArticle(article);
                })
                .then(finished as any, finished);
        } else {
            logger.info(`CSS File Queue is drained`);
            finished();
        }
    }, speed);
}