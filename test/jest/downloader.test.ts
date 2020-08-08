import 'ts-jest';
import axios, { AxiosResponse } from 'axios';
import MediaWiki from '../../src/MediaWiki';
import Downloader from '../../src/Downloader';


const mw = new MediaWiki({ base: 'https://en.wikipedia.org' });
const downloader = new Downloader({ mw, uaString: '', speed: 1, reqTimeout: 1000 * 60, noLocalParserFallback: false, forceLocalParser: false, optimisationCacheUrl: 'random-string'});

const get = jest.spyOn(axios, 'get');


describe('getJSONCb', () => {
  test(`Should call back the handler`, async () => {
    const response = {data: 'foo'};
    const axiosSpy = get.mockClear().mockResolvedValue(response);

    let handler;
    await new Promise(((resolve, reject) => {
      handler = jest.fn((x) => resolve(x));
      downloader.getJSONCb('http://mock', handler);
    }));

    expect(axiosSpy).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(null, response.data);
  });

  test(`Should pass error to the handler on 404`, async () => {
    const errorResponse = { response: { status: 404 } };
    const axiosSpy = get.mockClear().mockRejectedValue(errorResponse);

    let handler;
    await new Promise(((resolve, reject) => {
      handler = jest.fn((x) => resolve(x));
      downloader.getJSONCb('http://mock', handler);
    }));

    expect(axiosSpy).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(errorResponse);
  });

  test(`Should slow down on 429`, async () => {
    const correctResponse = { status: 200, data: 'foo' };
    const errorResponse = { response: { status: 429 } };
    const maxOld = downloader.maxActiveRequests;

    const axiosSpy = get.mockClear()
      .mockImplementationOnce(() => Promise.reject(errorResponse))
      .mockImplementation(() => Promise.resolve(correctResponse));

    let handler;
    await new Promise(((resolve, reject) => {
      // @ts-ignore
      handler = jest.fn((err, value) => resolve(err, value));
      downloader.getJSONCb('http://mock', handler);
    }));

    expect(axiosSpy).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(null, correctResponse.data);
    expect(downloader.maxActiveRequests).toEqual(maxOld - 1);
  });

});
