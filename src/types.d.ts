declare module 'follow-redirects';
declare module "*.json" {
    const value: any;
    export default value;
}
declare module "service-runner";
declare module "utf8-binary-cutter";
declare module "expand-home-dir";
declare module "swig-templates";
declare module "mkdirp";
declare module "country-language";
declare module "backoff";
declare module "imagemin-advpng";
declare module "imagemin-jpegoptim";

type DominoElement = any;

type Callback = (err?: any, data?: any, extra?: any) => void;
type KVS<T> = { [key: string]: T };

interface MWMetaData {
    langIso2: string;
    langIso3: string;
    title: string;
    subTitle: string;
    creator: string;
    mainPage: string;
    textDir: 'ltr' | 'rtl';

    base: any;
    wikiPath: any;
    apiPath: any;
    domain: any;
    webUrl: string;
    apiUrl: string;
    webUrlPath: string;
    modulePath: string;
}