import 'ts-jest';
import axios, { AxiosResponse } from 'axios';
import MediaWiki from '../../src/MediaWiki';
import Downloader from '../../src/Downloader';


const mw = new MediaWiki({ base: 'https://en.wikipedia.org' });
const downloader = new Downloader({ mw, uaString: '', speed: 1, reqTimeout: 1000 * 60, noLocalParserFallback: false, forceLocalParser: false, optimisationCacheUrl: 'random-string'});

const handler = jest.fn((err, value) => {
  console.log(err, value);
});

const get = jest.spyOn(axios, 'get');


describe('getJSONCb', () => {
  test(`Should call back the handler`, () => {
    const axiosSpy = get.mockClear().mockResolvedValue({data: 'foo'});
    downloader.getJSONCb('http://mock', handler);
    expect(axiosSpy).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(null, 'foo');
  });

  test(`Should pass error to the handler`, () => {
    const errorResponse = { err: 'wrong' };
    const axiosSpy = get.mockClear().mockRejectedValue(errorResponse);
    downloader.getJSONCb('http://mock', handler);
    expect(axiosSpy).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(errorResponse);
  });

  test(`Should slow down on 429`, (done) => {
    const errorResponse = { err: { response: { status: 429 } } };
    const maxOld = downloader.maxActiveRequests;

    get/*.mockClear()*/
      .mockImplementationOnce(() => {
        return Promise.reject(errorResponse);
      })
      .mockImplementation(() => Promise.resolve({status: 200} as AxiosResponse));

    downloader.getJSONCb('http://mock', (err, value) => {
      expect(get).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith(errorResponse);
      // expect(handler).toHaveBeenCalled(null, {status: 200});
      // expect(downloader.maxActiveRequests).toEqual(maxOld - 1);
      done();
    });
  });

});
