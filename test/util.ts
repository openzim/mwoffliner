export function leftPad(_num: number, length: number) {
    const num = `${_num}`;
    return '0'.repeat(length - num.length) + num;
}