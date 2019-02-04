declare module 'follow-redirects';
declare module "*.json" {
    const value: any;
    export default value;
}
type DominoElement = any;

type Callback = (err?: any, data?: any, extra?: any) => void;
type KVS<T> = { [key: string]: T };
