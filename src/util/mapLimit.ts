export function mapLimit<T, X>(iterable: T[], limit: number, iteratee: (arg: T) => Promise<X>): Promise<X[]> {
    if (!isFinite(limit) || limit < 1 || (limit % 1) !== 0) {
        throw new Error('limit must be a finite integer >= 1');
    }

    if (!iterable) {
        return Promise.resolve([]);
    }

    return new Promise((resolve, reject) => {
        const iterator = getIterator(iterable);
        const results: X[] = [];
        let counter = 0;
        let running = 0;
        let done = false;

        function takeNext() {
            const iteratorResult = iterator.next();

            if (iteratorResult.done) {
                done = true;
                if (running <= 0) {
                    resolve(results);
                }
                return;
            }

            const index = counter;
            counter += 1;
            running += 1;

            Promise.resolve(iteratorResult.value).then(iteratee || defaultIteratee).then((value) => {
                running -= 1;
                results[index] = value;
                if (done && running <= 0) {
                    resolve(results);
                    return;
                }
                replenish();
            }, (err) => {
                running -= 1;
                done = true;
                reject(err);
            });
        }

        function replenish() {
            while (running < limit && !done) {
                takeNext();
            }
        }

        replenish();
    });
}

function getIterator(iterable: any) {
    if (iterable[Symbol.iterator]) {
        return iterable[Symbol.iterator]();
    }
    return Object.keys(iterable).map((key) => iterable[key])[Symbol.iterator]();
}

function defaultIteratee(fn: any) {
    if (typeof fn !== 'function') {
        throw new Error('The default iterator in mapLimit expects an array of functions');
    }
    return fn();
}
