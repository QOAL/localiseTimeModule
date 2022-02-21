declare type retVal = [
    outputText: string,
    success: boolean
];
declare function localiseInput(input: string, mode?: string, raw?: boolean): retVal;
export { localiseInput };
