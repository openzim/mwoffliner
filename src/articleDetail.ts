
export const articleDetailXId: {
    [articleId: string]: PageInfo & {
        subCategories?: PageInfo[],
        categories?: PageInfo[],
        thumbnail?: string,
        coordinates?: Array<{
            lat: number,
            lon: number,
            primary: string,
            globe: string,
        }>,
        redirects?: PageInfo[],
        revisions?: Array<{
            revid: number,
            parentid: number,
            minor: string,
            user: string,
            timestamp: string,
            comment: string,
        }>,
        internalTumbnailUrl?: string
    },
} = {};
